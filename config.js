'use strict';

/**
 * CONFIGURAÇÃO DO ASSISTENTE IA
 *
 * 1. Publique a pasta "backend" no Render.
 * 2. Copie a URL gerada pelo Render.
 * 3. Substitua https://SEU-BACKEND.onrender.com pela URL real.
 *
 * A chave da OpenAI nunca deve ser colocada neste arquivo.
 */
window.SST_AI_CONFIG = Object.freeze({
  apiBase: ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'http://localhost:8787'
    : 'https://SEU-BACKEND.onrender.com',
  requestTimeoutMs: 120000,
  maxHistoryMessages: 10,
});
