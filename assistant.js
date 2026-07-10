'use strict';

(() => {
  const CONFIG = window.SST_AI_CONFIG || {};
  const ACCESS_KEY_STORAGE = 'sst_prime_ai_access_key_v1';
  const MODES = {
    chat: {
      title: 'Assistente de SST',
      subtitle: 'Faça uma pergunta ou escolha um comando rápido.',
      placeholder: 'Digite sua pergunta sobre SST, documentos ou atividades...',
    },
    cbo: {
      title: 'Consulta oficial de CBO',
      subtitle: 'A busca utiliza somente domínios oficiais autorizados.',
      placeholder: 'Ex.: Consulte o CBO para auxiliar de produção que separa e embala peças...',
    },
    atividades: {
      title: 'Gerador de atividades',
      subtitle: 'Crie uma descrição objetiva e pronta para copiar no documento.',
      placeholder: 'Explique o que deseja incluir ou clique em Enviar usando os dados preenchidos...',
    },
    revisao: {
      title: 'Revisão de texto técnico',
      subtitle: 'Corrija, simplifique ou profissionalize um texto já existente.',
      placeholder: 'Cole aqui o texto que precisa ser revisado...',
    },
  };

  const state = {
    mode: 'chat',
    busy: false,
    history: [],
    lastAnswer: '',
    controller: null,
  };

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const text = value => String(value ?? '').trim();

  function apiBase() {
    return text(CONFIG.apiBase).replace(/\/$/, '');
  }

  function isPlaceholderUrl(value) {
    return !value || value.includes('SEU-BACKEND');
  }

  function setStatus(status, label) {
    const badge = $('#aiStatusBadge');
    if (!badge) return;
    badge.className = `ai-status-badge ${status}`;
    $('span', badge).textContent = label;
  }

  async function checkBackend() {
    const base = apiBase();
    if (isPlaceholderUrl(base)) {
      setStatus('offline', 'Configure a URL do Render');
      return;
    }

    setStatus('checking', 'Verificando backend');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${base}/api/health`, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const health = await response.json();
      if (!health.openaiConfigured) {
        setStatus('warning', 'Falta OPENAI_API_KEY no Render');
        return;
      }
      setStatus('online', health.requiresAccessKey ? 'IA online • acesso protegido' : 'IA online');
    } catch {
      setStatus('offline', 'Backend indisponível');
    } finally {
      clearTimeout(timer);
    }
  }

  function setMode(mode) {
    if (!MODES[mode]) return;
    state.mode = mode;
    $$('[data-ai-mode]').forEach(button => {
      const active = button.dataset.aiMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    $('#aiChatTitle').textContent = MODES[mode].title;
    $('#aiChatSubtitle').textContent = MODES[mode].subtitle;
    $('#aiInput').placeholder = MODES[mode].placeholder;
  }

  function readContext() {
    return {
      funcao: text($('#aiRole')?.value),
      setor: text($('#aiSector')?.value),
      atividades: text($('#aiActivities')?.value),
      recursos: text($('#aiResources')?.value),
      documento: text($('#aiDocumentType')?.value),
      nivel: text($('#aiDetailLevel')?.value),
    };
  }

  function contextHasUsefulData(context) {
    return Boolean(context.funcao || context.setor || context.atividades || context.recursos);
  }

  function defaultModePrompt(mode, context) {
    if (mode === 'cbo') {
      return 'Consulte em fontes oficiais o CBO mais compatível com a função e as atividades informadas. Apresente código, título oficial, justificativa da compatibilidade e uma descrição simples sugerida para o laudo.';
    }
    if (mode === 'atividades') {
      return 'Elabore uma descrição profissional, objetiva e fiel das atividades informadas, pronta para copiar no documento selecionado. Não invente tarefas que não foram fornecidas.';
    }
    if (mode === 'revisao') {
      return 'Revise o texto informado, corrija o português e deixe a redação clara, profissional e adequada ao documento selecionado.';
    }
    if (contextHasUsefulData(context)) {
      return 'Analise as informações preenchidas e me ajude com uma resposta técnica, objetiva e aplicável à rotina de SST.';
    }
    return '';
  }

  function messageElement(role, content = '', loading = false) {
    const article = document.createElement('article');
    article.className = `ai-message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'ai-message-avatar';
    avatar.innerHTML = role === 'assistant'
      ? '<svg><use href="#i-bot"></use></svg>'
      : '<span>EU</span>';

    const body = document.createElement('div');
    body.className = 'ai-message-content';
    const paragraph = document.createElement('p');
    paragraph.textContent = content;
    if (loading) {
      paragraph.className = 'ai-typing';
      paragraph.innerHTML = '<i></i><i></i><i></i>';
    }
    body.appendChild(paragraph);
    article.append(avatar, body);
    return { article, paragraph };
  }

  function appendMessage(role, content, loading = false) {
    const messages = $('#aiMessages');
    const item = messageElement(role, content, loading);
    messages.appendChild(item.article);
    messages.scrollTop = messages.scrollHeight;
    return item;
  }

  function saveHistory(role, content) {
    const value = text(content);
    if (!value) return;
    state.history.push({ role, content: value });
    const limit = Math.max(2, Number(CONFIG.maxHistoryMessages) || 10);
    if (state.history.length > limit) state.history.splice(0, state.history.length - limit);
  }

  function showSources(sources) {
    const box = $('#aiSources');
    box.innerHTML = '';
    const valid = Array.isArray(sources)
      ? sources.filter(item => item && item.url).slice(0, 6)
      : [];
    if (!valid.length) {
      box.hidden = true;
      return;
    }

    const title = document.createElement('b');
    title.textContent = 'Fontes oficiais consultadas';
    box.appendChild(title);
    const list = document.createElement('div');
    valid.forEach(source => {
      const link = document.createElement('a');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = source.title || new URL(source.url).hostname;
      list.appendChild(link);
    });
    box.appendChild(list);
    box.hidden = false;
  }

  function setBusy(busy) {
    state.busy = busy;
    const button = $('#aiSendButton');
    const input = $('#aiInput');
    button.disabled = busy;
    input.disabled = busy;
    button.classList.toggle('loading', busy);
    $('span', button).textContent = busy ? 'Gerando...' : 'Enviar';
  }

  function accessKey() {
    return localStorage.getItem(ACCESS_KEY_STORAGE) || '';
  }

  async function processNdjson(response, onEvent) {
    if (!response.body) throw new Error('Seu navegador não oferece suporte ao streaming desta resposta.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try { onEvent(JSON.parse(line)); }
        catch { /* ignora linha incompleta ou inválida */ }
      }
      if (done) break;
    }
    if (buffer.trim()) {
      try { onEvent(JSON.parse(buffer)); }
      catch { /* nada a fazer */ }
    }
  }

  async function sendMessage(rawMessage) {
    if (state.busy) return;
    const context = readContext();
    const message = text(rawMessage) || defaultModePrompt(state.mode, context);
    if (!message) {
      window.sstToast?.('Digite uma solicitação', 'Ou preencha os dados da função antes de enviar.', 'error');
      $('#aiInput')?.focus();
      return;
    }

    const base = apiBase();
    if (isPlaceholderUrl(base)) {
      window.sstToast?.('Backend ainda não configurado', 'Edite o endereço em config.js após publicar no Render.', 'error');
      return;
    }

    showSources([]);
    appendMessage('user', message);
    saveHistory('user', message);
    const assistant = appendMessage('assistant', '', true);
    let answer = '';
    setBusy(true);
    state.controller = new AbortController();
    const timeout = setTimeout(() => state.controller?.abort(), Number(CONFIG.requestTimeoutMs) || 120000);

    try {
      const headers = { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' };
      if (accessKey()) headers['X-SST-Access-Key'] = accessKey();
      const response = await fetch(`${base}/api/assistant/stream`, {
        method: 'POST',
        headers,
        signal: state.controller.signal,
        body: JSON.stringify({
          mode: state.mode,
          message,
          context,
          history: state.history.slice(0, -1),
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || `Falha no backend (HTTP ${response.status}).`);
      }

      assistant.paragraph.className = '';
      assistant.paragraph.textContent = '';
      await processNdjson(response, event => {
        if (event.type === 'delta') {
          answer += event.text || '';
          assistant.paragraph.textContent = answer;
          $('#aiMessages').scrollTop = $('#aiMessages').scrollHeight;
        }
        if (event.type === 'sources') showSources(event.sources);
        if (event.type === 'error') throw new Error(event.message || 'Erro ao gerar a resposta.');
      });

      if (!text(answer)) throw new Error('A IA não retornou conteúdo. Tente reformular a solicitação.');
      state.lastAnswer = answer;
      saveHistory('assistant', answer);
      $('#aiInput').value = '';
    } catch (error) {
      const messageText = error?.name === 'AbortError'
        ? 'A solicitação foi interrompida ou excedeu o tempo limite.'
        : (error?.message || 'Não foi possível gerar a resposta.');
      assistant.paragraph.className = 'ai-error-text';
      assistant.paragraph.textContent = messageText;
      window.sstToast?.('Falha no Assistente IA', messageText, 'error');
    } finally {
      clearTimeout(timeout);
      state.controller = null;
      setBusy(false);
      $('#aiInput')?.focus();
    }
  }

  function clearChat() {
    state.history = [];
    state.lastAnswer = '';
    showSources([]);
    const box = $('#aiMessages');
    box.innerHTML = '';
    const welcome = messageElement('assistant', 'Conversa limpa. Preencha os dados da função ou faça uma nova pergunta.');
    box.appendChild(welcome.article);
  }

  async function copyLastAnswer() {
    if (!state.lastAnswer) {
      window.sstToast?.('Nenhuma resposta para copiar', 'Faça uma solicitação ao assistente primeiro.', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(state.lastAnswer);
      window.sstToast?.('Resposta copiada', 'O conteúdo está pronto para ser colado no documento.');
    } catch {
      window.sstToast?.('Não foi possível copiar', 'Selecione o texto manualmente.', 'error');
    }
  }

  function bind() {
    if (!$('#assistente')) return;

    $$('[data-ai-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.aiMode)));
    $$('#aiQuickPrompts [data-ai-prompt]').forEach(button => button.addEventListener('click', () => {
      $('#aiInput').value = button.dataset.aiPrompt || '';
      $('#aiComposer').requestSubmit();
    }));

    $('#aiComposer')?.addEventListener('submit', event => {
      event.preventDefault();
      sendMessage($('#aiInput').value);
    });
    $('#aiInput')?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        $('#aiComposer').requestSubmit();
      }
    });
    $('#clearAiChat')?.addEventListener('click', clearChat);
    $('#copyAiAnswer')?.addEventListener('click', copyLastAnswer);

    const keyInput = $('#aiAccessKey');
    keyInput.value = accessKey();
    $('#saveAiAccessKey')?.addEventListener('click', () => {
      const value = text(keyInput.value);
      if (value) localStorage.setItem(ACCESS_KEY_STORAGE, value);
      else localStorage.removeItem(ACCESS_KEY_STORAGE);
      window.sstToast?.('Acesso atualizado', value ? 'Chave salva somente neste navegador.' : 'Chave removida deste navegador.');
      checkBackend();
    });

    setMode('chat');
    checkBackend();
  }

  document.addEventListener('DOMContentLoaded', bind);
})();
