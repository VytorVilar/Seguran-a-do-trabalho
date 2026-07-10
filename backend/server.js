'use strict';

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';

const PORT = Number(process.env.PORT || 8787);
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6';
const MAX_OUTPUT_TOKENS = clampNumber(process.env.MAX_OUTPUT_TOKENS, 300, 4000, 1800);
const AI_ACCESS_KEY = String(process.env.AI_ACCESS_KEY || '').trim();
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(value => value.trim().replace(/\/$/, ''))
  .filter(Boolean);
const OFFICIAL_DOMAINS = [
  'gov.br',
  'www.gov.br',
  'cbo.mte.gov.br',
  'concla.ibge.gov.br',
];
const VALID_MODES = new Set(['chat', 'cbo', 'atividades', 'revisao']);
const VALID_ROLES = new Set(['user', 'assistant']);

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const normalized = origin.replace(/\/$/, '');
    if (!ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(normalized)) return callback(null, true);
    return callback(new Error('Origem não autorizada pelo backend.'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'X-SST-Access-Key'],
  maxAge: 86400,
}));
app.use(express.json({ limit: '64kb' }));

const limiter = rateLimit({
  windowMs: clampNumber(process.env.RATE_LIMIT_WINDOW_MINUTES, 1, 120, 15) * 60 * 1000,
  limit: clampNumber(process.env.RATE_LIMIT_MAX_REQUESTS, 5, 500, 35),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Limite temporário de solicitações atingido. Aguarde alguns minutos e tente novamente.' },
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'SST Prime IA',
    version: '1.0.0',
    model: OPENAI_MODEL,
    openaiConfigured: Boolean(openai),
    requiresAccessKey: Boolean(AI_ACCESS_KEY),
    allowedOriginsConfigured: ALLOWED_ORIGINS.length > 0,
  });
});

app.post('/api/assistant/stream', limiter, requireAccessKey, async (req, res) => {
  if (!openai) {
    return res.status(503).json({ error: 'OPENAI_API_KEY ainda não foi configurada no servidor.' });
  }

  const payload = validatePayload(req.body);
  if (!payload.ok) return res.status(400).json({ error: payload.error });

  const { mode, message, context, history } = payload.value;
  const useOfficialSearch = shouldUseOfficialSearch(mode, message, context);
  const tools = useOfficialSearch
    ? [{
        type: 'web_search',
        search_context_size: 'medium',
        filters: { allowed_domains: OFFICIAL_DOMAINS },
      }]
    : undefined;

  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = event => {
    if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
  };

  send({ type: 'meta', mode, officialSearch: useOfficialSearch, model: OPENAI_MODEL });

  try {
    const stream = await openai.responses.create({
      model: OPENAI_MODEL,
      instructions: buildInstructions(mode, context, useOfficialSearch),
      input: buildInput(history, message, context),
      tools,
      tool_choice: tools ? 'auto' : undefined,
      include: tools ? ['web_search_call.action.sources'] : undefined,
      reasoning: { effort: 'low' },
      max_output_tokens: MAX_OUTPUT_TOKENS,
      store: false,
      stream: true,
    });

    let completedResponse = null;
    for await (const event of stream) {
      if (event.type === 'response.output_text.delta' && event.delta) {
        send({ type: 'delta', text: event.delta });
      }
      if (event.type === 'response.completed') {
        completedResponse = event.response || null;
      }
      if (event.type === 'response.failed') {
        const detail = event.response?.error?.message || 'A resposta da IA falhou.';
        throw new Error(detail);
      }
      if (event.type === 'error') {
        throw new Error(event.message || 'Erro durante o streaming da OpenAI.');
      }
    }

    const sources = collectOfficialSources(completedResponse);
    if (sources.length) send({ type: 'sources', sources });
    send({ type: 'done' });
    res.end();
  } catch (error) {
    console.error('[assistant]', error);
    send({ type: 'error', message: publicErrorMessage(error) });
    res.end();
  }
});

app.use((error, _req, res, _next) => {
  console.error('[server]', error);
  if (res.headersSent) return res.end();
  const status = error?.message?.includes('Origem não autorizada') ? 403 : 500;
  res.status(status).json({ error: status === 403 ? error.message : 'Erro interno do servidor.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SST Prime IA disponível na porta ${PORT}`);
  console.log(`Modelo: ${OPENAI_MODEL}`);
  console.log(`OpenAI configurada: ${Boolean(openai)}`);
});

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function cleanString(value, maxLength) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

function requireAccessKey(req, res, next) {
  if (!AI_ACCESS_KEY) return next();
  const received = String(req.get('X-SST-Access-Key') || '');
  if (received === AI_ACCESS_KEY) return next();
  return res.status(401).json({ error: 'Chave de acesso do Assistente IA inválida ou não informada.' });
}

function validatePayload(body) {
  const mode = VALID_MODES.has(body?.mode) ? body.mode : 'chat';
  const message = cleanString(body?.message, 6000);
  if (!message) return { ok: false, error: 'A solicitação está vazia.' };

  const rawContext = body?.context && typeof body.context === 'object' ? body.context : {};
  const context = {
    funcao: cleanString(rawContext.funcao, 120),
    setor: cleanString(rawContext.setor, 120),
    atividades: cleanString(rawContext.atividades, 1800),
    recursos: cleanString(rawContext.recursos, 900),
    documento: cleanString(rawContext.documento, 50),
    nivel: cleanString(rawContext.nivel, 30),
  };

  const history = Array.isArray(body?.history)
    ? body.history
        .slice(-10)
        .map(item => ({
          role: VALID_ROLES.has(item?.role) ? item.role : 'user',
          content: cleanString(item?.content, 5000),
        }))
        .filter(item => item.content)
    : [];

  return { ok: true, value: { mode, message, context, history } };
}

function shouldUseOfficialSearch(mode, message, context) {
  if (mode === 'cbo') return true;
  const combined = `${message} ${context.funcao}`.toLowerCase();
  return /\bcbo\b|classifica[cç][aã]o brasileira de ocupa[cç][oõ]es|c[oó]digo da ocupa[cç][aã]o/.test(combined);
}

function buildInput(history, message, context) {
  const contextText = [
    context.funcao && `Função informada: ${context.funcao}`,
    context.setor && `Setor: ${context.setor}`,
    context.atividades && `Atividades observadas: ${context.atividades}`,
    context.recursos && `Máquinas, equipamentos ou produtos: ${context.recursos}`,
    context.documento && `Documento de destino: ${context.documento}`,
    context.nivel && `Nível de detalhamento desejado: ${context.nivel}`,
  ].filter(Boolean).join('\n');

  const currentMessage = contextText
    ? `${message}\n\nCONTEXTO PREENCHIDO PELO USUÁRIO:\n${contextText}`
    : message;

  return [
    ...history.map(item => ({ role: item.role, content: item.content })),
    { role: 'user', content: currentMessage },
  ];
}

function buildInstructions(mode, context, officialSearch) {
  const base = `
Você é o Assistente SST Prime, especializado em apoiar a redação de documentos brasileiros de Segurança e Saúde no Trabalho.
Responda sempre em português do Brasil, com linguagem profissional, clara e fácil de copiar.

REGRAS OBRIGATÓRIAS:
1. Não invente códigos, títulos, requisitos legais, medições, riscos, exposições, equipamentos ou atividades.
2. Diferencie fatos confirmados, informações fornecidas pelo usuário e sugestões redacionais da IA.
3. Não trate a CBO como regulamentação profissional nem como substituta do levantamento real das atividades.
4. Não conclua enquadramentos de insalubridade, periculosidade, nexo, aposentadoria especial ou caracterização de risco sem dados técnicos suficientes.
5. Quando faltarem informações, diga objetivamente o que precisa ser confirmado.
6. Produza texto simples, sem tabelas em Markdown. Use títulos curtos e listas somente quando ajudarem.
7. Nunca solicite CPF, RG, dados médicos ou outros dados pessoais desnecessários.
8. Para textos de laudos, descreva apenas tarefas efetivamente informadas. Não acrescente tarefas típicas por suposição.
`;

  const modes = {
    chat: `Ajude com dúvidas, estruturação e revisão de conteúdos de SST. Seja direto e explique limites técnicos quando necessário.`,
    cbo: `
CONSULTA CBO:
- Pesquise exclusivamente nas fontes oficiais autorizadas.
- Informe o código e o título exatamente como encontrados.
- Quando houver mais de uma opção plausível, apresente no máximo três alternativas e explique a compatibilidade com as atividades fornecidas.
- Se não localizar confirmação oficial, declare claramente que não foi possível validar o código.
- Estruture a resposta em: Resultado da consulta; Compatibilidade com as atividades; Descrição simples sugerida; Pontos para validação.
- A descrição simples é uma sugestão da IA e não deve ser apresentada como texto oficial da CBO.
`,
    atividades: `
GERAÇÃO DE ATIVIDADES:
- Redija uma descrição contínua, objetiva e profissional, adequada ao documento selecionado.
- Use verbos de ação e mantenha fidelidade absoluta aos dados informados.
- Não inclua riscos, agentes, frequência, intensidade ou exposição sem informação expressa.
- Ao final, inclua uma versão resumida em uma única frase quando isso for útil.
`,
    revisao: `
REVISÃO DE TEXTO:
- Preserve o sentido técnico original.
- Corrija ortografia, concordância, pontuação, repetição e clareza.
- Não acrescente fatos novos.
- Entregue primeiro o texto revisado e, se necessário, uma observação curta sobre informações que precisam ser confirmadas.
`,
  };

  const searchRule = officialSearch
    ? `Use a pesquisa na web somente para consultar fontes oficiais do MTE, Gov.br, CBO/MTE ou CONCLA/IBGE. Não utilize blogs, escritórios, plataformas de RH ou sites comerciais como fonte de CBO.`
    : `Não faça afirmações de atualização normativa ou dados oficiais atuais sem que uma fonte oficial tenha sido consultada.`;

  const outputPreference = context.nivel
    ? `O usuário escolheu nível de detalhamento: ${context.nivel}.`
    : '';

  return `${base}\n${modes[mode] || modes.chat}\n${searchRule}\n${outputPreference}`.trim();
}

function collectOfficialSources(value) {
  const found = new Map();
  const seen = new Set();

  const visit = node => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);

    if (typeof node.url === 'string' && isOfficialUrl(node.url)) {
      const title = cleanString(node.title || node.name || '', 180);
      found.set(node.url, { url: node.url, title: title || hostnameLabel(node.url) });
    }

    for (const child of Object.values(node)) visit(child);
  };

  visit(value);
  return [...found.values()].slice(0, 8);
}

function isOfficialUrl(rawUrl) {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    return OFFICIAL_DOMAINS.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function hostnameLabel(rawUrl) {
  try { return new URL(rawUrl).hostname; }
  catch { return 'Fonte oficial'; }
}

function publicErrorMessage(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  if (status === 401) return 'A chave da OpenAI configurada no Render é inválida.';
  if (status === 429) return 'O limite da OpenAI foi atingido. Verifique créditos, faturamento ou tente novamente mais tarde.';
  if (status >= 500) return 'A OpenAI apresentou uma indisponibilidade temporária.';
  const message = String(error?.message || 'Erro ao gerar a resposta.');
  if (/api key|authentication/i.test(message)) return 'A chave da OpenAI não foi aceita.';
  if (/quota|billing|credit/i.test(message)) return 'Verifique os créditos e o faturamento da conta da OpenAI.';
  return 'Não foi possível concluir a resposta. Revise as configurações do backend e tente novamente.';
}
