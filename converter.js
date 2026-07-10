'use strict';

(() => {
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const MAX_FILE_SIZE = 15 * 1024 * 1024;
  const state = { word: null, pdf: null, busy: false, pdfjs: null };

  function notify(title, detail = '', type = 'success') {
    if (typeof window.sstToast === 'function') window.sstToast(title, detail, type);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
    return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
  }

  function cleanFilename(name, fallback) {
    return String(name || fallback).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || fallback;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function setStatus(show, title = 'Preparando conversão', detail = 'O arquivo está sendo processado no seu navegador.') {
    const status = $('#conversionStatus');
    if (!status) return;
    status.hidden = !show;
    $('b', status).textContent = title;
    $('span', status).textContent = detail;
    status.setAttribute('aria-busy', String(show));
  }

  function setBusy(busy) {
    state.busy = busy;
    ['#convertWordBtn', '#convertPdfBtn'].forEach(selector => {
      const button = $(selector);
      if (!button) return;
      const type = selector.includes('Word') ? 'word' : 'pdf';
      button.disabled = busy || !state[type];
    });
    $$('[data-converter-tab], .drop-zone').forEach(element => {
      element.classList.toggle('disabled', busy);
      if ('disabled' in element) element.disabled = busy;
    });
  }

  function isValidFile(type, file) {
    if (!file) return false;
    const extensionOk = type === 'word' ? /\.docx$/i.test(file.name) : /\.pdf$/i.test(file.name);
    const mimeOk = !file.type || (type === 'word'
      ? file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : file.type === 'application/pdf');
    return extensionOk && mimeOk;
  }

  function clearFile(type) {
    state[type] = null;
    const input = $(`#${type}File`);
    const info = $(`#${type}FileInfo`);
    const button = type === 'word' ? $('#convertWordBtn') : $('#convertPdfBtn');
    if (input) input.value = '';
    if (info) { info.hidden = true; info.replaceChildren(); }
    if (button) button.disabled = true;
  }

  function renderFileInfo(type, file) {
    const info = $(`#${type}FileInfo`);
    if (!info) return;
    const text = document.createElement('div');
    const name = document.createElement('b');
    const meta = document.createElement('span');
    const remove = document.createElement('button');
    name.textContent = file.name;
    meta.textContent = `${formatBytes(file.size)} • pronto para converter`;
    text.append(name, document.createElement('br'), meta);
    remove.type = 'button';
    remove.className = 'file-remove';
    remove.textContent = 'Remover';
    remove.addEventListener('click', () => clearFile(type));
    info.replaceChildren(text, remove);
    info.hidden = false;
  }

  function selectFile(type, file) {
    if (state.busy || !file) return;
    if (!isValidFile(type, file)) {
      notify('Formato não reconhecido', type === 'word' ? 'Selecione um arquivo DOCX válido.' : 'Selecione um arquivo PDF válido.', 'error');
      clearFile(type);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      notify('Arquivo muito grande', `O limite desta ferramenta é de ${formatBytes(MAX_FILE_SIZE)}.`, 'error');
      clearFile(type);
      return;
    }
    if (file.size === 0) {
      notify('Arquivo vazio', 'Escolha um arquivo que contenha dados.', 'error');
      clearFile(type);
      return;
    }
    state[type] = file;
    renderFileInfo(type, file);
    const button = type === 'word' ? $('#convertWordBtn') : $('#convertPdfBtn');
    if (button) button.disabled = false;
  }

  function setupDropZone(type) {
    const zone = $(`#${type}DropZone`);
    const input = $(`#${type}File`);
    if (!zone || !input) return;
    input.addEventListener('change', () => selectFile(type, input.files?.[0]));
    ['dragenter', 'dragover'].forEach(name => zone.addEventListener(name, event => {
      event.preventDefault();
      if (!state.busy) zone.classList.add('dragging');
    }));
    ['dragleave', 'drop'].forEach(name => zone.addEventListener(name, event => {
      event.preventDefault();
      zone.classList.remove('dragging');
    }));
    zone.addEventListener('drop', event => selectFile(type, event.dataTransfer?.files?.[0]));
  }

  function sanitizeHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    $$('script, iframe, object, embed, form, input, button', template.content).forEach(node => node.remove());
    $$('*', template.content).forEach(node => {
      [...node.attributes].forEach(attribute => {
        if (/^on/i.test(attribute.name) || ['srcdoc'].includes(attribute.name.toLowerCase())) node.removeAttribute(attribute.name);
      });
    });
    return template.innerHTML;
  }

  async function wordToPdf() {
    const file = state.word;
    if (!file || state.busy) return;
    if (!window.mammoth || !window.html2pdf) {
      notify('Bibliotecas indisponíveis', 'Conecte-se à internet e recarregue a página para usar esta conversão.', 'error');
      return;
    }
    let wrapper;
    try {
      setBusy(true);
      setStatus(true, 'Lendo documento Word', 'Extraindo textos, tabelas e imagens compatíveis.');
      const result = await window.mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
      wrapper = document.createElement('article');
      wrapper.className = 'conversion-document';
      wrapper.innerHTML = sanitizeHtml(result.value || '<p>Documento sem conteúdo textual reconhecido.</p>');
      document.body.appendChild(wrapper);
      setStatus(true, 'Gerando arquivo PDF', 'Montando as páginas em formato A4.');
      const filename = cleanFilename(file.name.replace(/\.docx$/i, ''), 'documento') + '.pdf';
      await window.html2pdf().set({
        margin: [14, 14, 14, 14],
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: Math.min(2, window.devicePixelRatio || 1.5), useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'img', 'table'] },
      }).from(wrapper).save();
      const warnings = result.messages?.length || 0;
      notify('PDF criado com sucesso', warnings ? `${filename} • ${warnings} aviso(s) de compatibilidade.` : filename);
    } catch (error) {
      console.error('Word → PDF:', error);
      notify('Não foi possível converter', 'O documento pode estar protegido ou possuir uma estrutura incompatível.', 'error');
    } finally {
      wrapper?.remove();
      setStatus(false);
      setBusy(false);
    }
  }

  async function getPdfJs() {
    if (state.pdfjs) return state.pdfjs;
    try {
      const library = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.min.mjs');
      library.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.worker.min.mjs';
      state.pdfjs = library;
      return library;
    } catch (error) {
      throw new Error('PDF.js indisponível', { cause: error });
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function extractLines(items) {
    const positioned = items.map(item => ({
      text: String(item.str || '').trim(),
      x: Number(item.transform?.[4] || 0),
      y: Number(item.transform?.[5] || 0),
      width: Number(item.width || 0),
    })).filter(item => item.text);
    positioned.sort((a, b) => Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x);
    const lines = [];
    positioned.forEach(item => {
      let line = lines.find(candidate => Math.abs(candidate.y - item.y) <= 3);
      if (!line) { line = { y: item.y, parts: [] }; lines.push(line); }
      line.parts.push(item);
    });
    return lines.sort((a, b) => b.y - a.y).map(line => {
      line.parts.sort((a, b) => a.x - b.x);
      let text = '';
      let rightEdge = null;
      line.parts.forEach(part => {
        if (rightEdge !== null && part.x - rightEdge > 2) text += ' ';
        text += part.text;
        rightEdge = part.x + part.width;
      });
      return text.replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
  }

  async function pdfToWord() {
    const file = state.pdf;
    if (!file || state.busy) return;
    try {
      setBusy(true);
      setStatus(true, 'Lendo arquivo PDF', 'Analisando o conteúdo textual do documento.');
      const pdfjsLib = await getPdfJs();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const pages = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        setStatus(true, `Processando página ${pageNumber} de ${pdf.numPages}`, 'Reconstruindo linhas e parágrafos editáveis.');
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const lines = extractLines(textContent.items);
        if (lines.length) pages.push(lines);
      }
      if (!pages.length) throw new Error('Nenhum texto selecionável foi encontrado.');
      const body = pages.map((lines, index) => `<section${index ? ' class="page-break"' : ''}>${lines.map(line => `<p>${escapeHtml(line)}</p>`).join('')}</section>`).join('');
      const wordHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="ProgId" content="Word.Document"><style>@page{size:A4;margin:2cm}body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.45;color:#111}p{margin:0 0 7pt}.page-break{page-break-before:always}</style></head><body>${body}</body></html>`;
      const filename = cleanFilename(file.name.replace(/\.pdf$/i, ''), 'documento') + '.doc';
      downloadBlob(new Blob(['\ufeff', wordHtml], { type: 'application/msword;charset=utf-8' }), filename);
      notify('Documento Word criado', `${filename} • ${pages.length} página(s) processada(s).`);
    } catch (error) {
      console.error('PDF → Word:', error);
      notify('Não foi possível converter', 'O PDF pode ser digitalizado, protegido ou não conter texto selecionável.', 'error');
    } finally {
      setStatus(false);
      setBusy(false);
    }
  }

  function activateTab(button) {
    if (state.busy) return;
    $$('[data-converter-tab]').forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
    });
    $$('[data-converter-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.converterPanel === button.dataset.converterTab));
  }

  function init() {
    $$('[data-converter-tab]').forEach(button => button.addEventListener('click', () => activateTab(button)));
    setupDropZone('word');
    setupDropZone('pdf');
    $('#convertWordBtn')?.addEventListener('click', wordToPdf);
    $('#convertPdfBtn')?.addEventListener('click', pdfToWord);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
