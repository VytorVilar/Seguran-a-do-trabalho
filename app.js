'use strict';

const APP = {
  version: '3.1.0',
  page: 'home',
  passwordHash: '53938d90671cb71d99cf526718cc6c65c0280d485eb7ef471452451738108220',
  userName: 'Gestor SST',
  loginAttempts: 0,
  installPrompt: null,
  lastFocusedElement: null,
  keys: {
    session: 'sst_prime_session_v3',
    remember: 'sst_prime_remember_v3',
    theme: 'sst_prime_theme_v3',
    favorites: 'sst_prime_favorites_v3',
    epiView: 'sst_prime_epi_view_v3',
    user: 'sst_prime_user_v3',
    authLock: 'sst_prime_auth_lock_v3',
    lastPage: 'sst_prime_last_page_v3',
    generatorDraft: 'sst_prime_generator_draft_v3',
  },
  filters: { epi: '', category: '', risco: '', empresa: '', w2h: '', nr: '', painel: '' },
  favoriteOnly: false,
  epiView: 'grid',
  currentEpi: null,
  commandItems: [],
  commandIndex: 0,
  rendered: false,
  lastEpiResults: [],
};

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const txt = value => String(value ?? '');
const normalize = value => txt(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const localISODate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const formatDateBR = value => {
  const match = txt(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : txt(value).trim();
};
const icon = id => `<svg aria-hidden="true"><use href="#${id}"></use></svg>`;
const debounce = (fn, wait = 160) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; };
const FALLBACK_IMAGE = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="100%" height="100%" rx="28" fill="#f5f7f6"/><path d="M210 255l70-70 50 50 35-35 70 70" fill="none" stroke="#9bb0a3" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><circle cx="390" cy="135" r="28" fill="#dce7df"/><text x="300" y="330" text-anchor="middle" font-family="Arial" font-size="24" fill="#64756a">Imagem indisponível</text></svg>');

function safeArray(value) { return Array.isArray(value) ? value : []; }
function dataReady() { return typeof DATA !== 'undefined' && DATA && typeof DATA === 'object'; }

function readJSON(storage, key, fallback = null) {
  try {
    const raw = storage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}
function writeJSON(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function escapeCsv(value) { return `"${txt(value).replace(/"/g, '""')}"`; }
function safeExternalUrl(value) {
  try {
    const url = new URL(txt(value), location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}
function openExternal(value) {
  const url = safeExternalUrl(value);
  if (!url) return false;
  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (popup) popup.opener = null;
  return true;
}
function epiId(item) { return `${normalize(item?.ca)}::${normalize(item?.nome)}`; }
function isFavorite(item, favorites = getFavorites()) {
  return favorites.has(epiId(item)) || favorites.has(txt(item?.ca));
}
function initials(name) {
  return txt(name).trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'GS';
}
function downloadText(content, filename, type = 'text/plain;charset=utf-8') {
  const blob = new Blob(['\ufeff', content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}
async function sha256Hex(message) {
  if (window.crypto?.subtle) {
    try {
      const data = new TextEncoder().encode(message);
      const digest = await window.crypto.subtle.digest('SHA-256', data);
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    } catch { /* usa a implementação local abaixo */ }
  }
  return sha256Fallback(message);
}
function sha256Fallback(ascii) {
  const rightRotate = (value, amount) => (value >>> amount) | (value << (32 - amount));
  const maxWord = 2 ** 32;
  let result = '';
  const words = [];
  const asciiBitLength = ascii.length * 8;
  const initialHash = sha256Fallback.h || [];
  const k = sha256Fallback.k || [];
  let primeCounter = k.length;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate += 1) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      initialHash[primeCounter] = (Math.sqrt(candidate) * maxWord) | 0;
      k[primeCounter] = (candidate ** (1 / 3) * maxWord) | 0;
      primeCounter += 1;
    }
  }
  sha256Fallback.h = initialHash; sha256Fallback.k = k;
  const hash = initialHash.slice();
  ascii += '\x80';
  while (ascii.length % 64 !== 56) ascii += '\x00';
  for (let i = 0; i < ascii.length; i += 1) words[i >> 2] |= ascii.charCodeAt(i) << ((3 - i) % 4) * 8;
  words.push((asciiBitLength / maxWord) | 0, asciiBitLength);
  for (let j = 0; j < words.length;) {
    const w = words.slice(j, j += 16);
    const oldHash = hash.slice(0);
    for (let i = 0; i < 64; i += 1) {
      const w15 = w[i - 15]; const w2 = w[i - 2];
      const a = hash[0]; const e = hash[4];
      const temp1 = hash[7] + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ((e & hash[5]) ^ (~e & hash[6])) + k[i] + (w[i] = i < 16 ? w[i] : (w[i - 16] + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
      const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash.pop(); hash.unshift((temp1 + temp2) | 0); hash[4] = (hash[4] + temp1) | 0;
    }
    for (let i = 0; i < 8; i += 1) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  for (let i = 0; i < 8; i += 1) for (let j = 3; j + 1; j -= 1) result += ((hash[i] >> (j * 8)) & 255).toString(16).padStart(2, '0');
  return result;
}
function accessPayload(storage, key) {
  const raw = storage.getItem(key);
  if (raw === 'ok') {
    const migrated = { expires: Date.now() + 8 * 60 * 60 * 1000, user: localStorage.getItem(APP.keys.user) || 'Gestor SST' };
    writeJSON(storage, key, migrated);
    return migrated;
  }
  const parsed = readJSON(storage, key);
  return parsed && parsed.expires > Date.now() ? parsed : null;
}
function activeAccess() {
  return accessPayload(sessionStorage, APP.keys.session) || accessPayload(localStorage, APP.keys.remember);
}
function saveAccess(user, remember) {
  const payload = { user, expires: Date.now() + (remember ? 30 * 24 : 8) * 60 * 60 * 1000 };
  sessionStorage.removeItem(APP.keys.session);
  localStorage.removeItem(APP.keys.remember);
  writeJSON(remember ? localStorage : sessionStorage, remember ? APP.keys.remember : APP.keys.session, payload);
  localStorage.setItem(APP.keys.user, user);
}
function clearAccess() {
  sessionStorage.removeItem(APP.keys.session);
  localStorage.removeItem(APP.keys.remember);
}

function toast(title, description = '', type = 'success') {
  const stack = $('#toastStack');
  if (!stack) return;
  const node = document.createElement('article');
  node.className = `toast ${type}`;
  node.innerHTML = `<span class="toast-icon">${type === 'error' ? '!' : icon('i-check')}</span><div><b></b><small></small></div><button type="button" aria-label="Fechar">×</button>`;
  $('b', node).textContent = title;
  $('small', node).textContent = description;
  $('button', node).addEventListener('click', () => node.remove());
  stack.appendChild(node);
  while (stack.children.length > 3) stack.firstElementChild?.remove();
  setTimeout(() => node.remove(), 3300);
}

window.sstToast = toast;

async function copyText(value) {
  const content = txt(value).trim();
  if (!content) throw new Error('empty');
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(content);
  const area = document.createElement('textarea');
  area.value = content;
  area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(area);
  area.select();
  const success = document.execCommand('copy');
  area.remove();
  if (!success) throw new Error('copy');
}

function getTheme() {
  const stored = localStorage.getItem(APP.keys.theme);
  if (stored === 'dark' || stored === 'light') return stored;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme(theme) {
  const activeTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = activeTheme;
  document.documentElement.style.colorScheme = activeTheme;
  localStorage.setItem(APP.keys.theme, activeTheme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', activeTheme === 'dark' ? '#0b1711' : '#f3f7f5');

  const toggle = $('#themeToggle');
  const use = toggle?.querySelector('use');
  if (use) use.setAttribute('href', activeTheme === 'dark' ? '#i-sun' : '#i-moon');
  toggle?.setAttribute('aria-label', activeTheme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro');
  toggle?.setAttribute('title', activeTheme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro');
}

function boot() {
  applyTheme(getTheme());
  const access = activeAccess();
  if (access?.user) APP.userName = access.user;
  const hashPage = location.hash.replace('#/', '');
  const storedPage = localStorage.getItem(APP.keys.lastPage);
  if (pageMeta[hashPage]) APP.page = hashPage;
  else if (pageMeta[storedPage]) APP.page = storedPage;
  setTimeout(() => {
    $('#bootScreen')?.classList.add('hide');
    setTimeout(() => {
      $('#bootScreen')?.remove();
      access ? showApp(false) : showAuth();
    }, 420);
  }, 520);
}
function showAuth() {
  document.body.classList.remove('logged-in');
  clearInterval(APP.sessionTimer);
  APP.sessionTimer = null;
  $('#authScreen').hidden = false;
  $('#appShell').hidden = true;
  closeSidebar();
  if (matchMedia('(min-width: 761px)').matches) setTimeout(() => $('#loginPass')?.focus(), 120);
}

function showApp(welcome = true) {
  if (!dataReady()) {
    showAuth();
    toast('Base de dados não encontrada', 'Confira se data.js está na mesma pasta do index.html.', 'error');
    return;
  }
  document.body.classList.add('logged-in');
  $('#authScreen').hidden = true;
  $('#appShell').hidden = false;
  if (!APP.rendered) {
    renderEverything();
    APP.rendered = true;
  }
  updateProfile();
  openPage(APP.page, false);
  updateClock();
  updateNetworkStatus();
  if (!APP.clockTimer) APP.clockTimer = setInterval(updateClock, 1000);
  if (!APP.sessionTimer) APP.sessionTimer = setInterval(checkSession, 60000);
  if (welcome) toast('Acesso liberado', 'Bem-vindo à Central SST Prime.');
}

function bindAuth() {
  $('#loginForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const lockUntil = Number(localStorage.getItem(APP.keys.authLock) || 0);
    const message = $('#loginError');
    if (lockUntil > Date.now()) {
      const seconds = Math.ceil((lockUntil - Date.now()) / 1000);
      message.textContent = `Muitas tentativas. Aguarde ${seconds} segundos.`;
      return;
    }
    const user = $('#loginUser')?.value.trim() || 'Gestor SST';
    const pass = $('#loginPass')?.value || '';
    const submit = $('.login-submit');
    submit.disabled = true;
    message.textContent = 'Validando acesso...';
    const valid = (await sha256Hex(pass)) === APP.passwordHash;
    submit.disabled = false;
    if (!valid) {
      APP.loginAttempts += 1;
      const remaining = Math.max(0, 5 - APP.loginAttempts);
      message.textContent = remaining ? `Senha incorreta. Restam ${remaining} tentativas.` : 'Acesso temporariamente bloqueado por 60 segundos.';
      $('#loginPass').value = '';
      $('#loginPass')?.focus();
      if (!remaining) {
        localStorage.setItem(APP.keys.authLock, String(Date.now() + 60000));
        APP.loginAttempts = 0;
      }
      return;
    }
    APP.loginAttempts = 0;
    localStorage.removeItem(APP.keys.authLock);
    message.textContent = '';
    APP.userName = user;
    saveAccess(user, Boolean($('#rememberLogin')?.checked));
    showApp(false);
    toast(`Olá, ${user}`, 'Sua central está pronta para uso.');
  });
  $('#hintButton')?.addEventListener('click', () => {
    $('#loginError').textContent = 'Consulte o responsável pelo site. O acesso desta versão é apenas uma barreira local e não substitui autenticação em servidor.';
  });
  $('#passwordToggle')?.addEventListener('click', event => {
    const input = $('#loginPass');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    event.currentTarget.textContent = show ? '🙈' : '👁';
    event.currentTarget.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
  });
}

function updateProfile() {
  const name = APP.userName || 'Gestor SST';
  const badge = $('.profile > span');
  const label = $('.profile b');
  if (badge) badge.textContent = initials(name);
  if (label) label.textContent = name;
}
function checkSession() {
  if (!activeAccess()) {
    clearAccess();
    toast('Sessão expirada', 'Entre novamente para continuar.', 'error');
    showAuth();
  }
}
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

const pageMeta = {
  home: ['VISÃO GERAL', () => `${greeting()}, Gestor`],
  epis: ['CATÁLOGO TÉCNICO', 'Equipamentos de proteção'],
  riscos: ['AVALIAÇÕES', 'Riscos e conclusões'],
  empresas: ['MAPEAMENTO', 'Empresas e exposições'],
  frases: ['AUTOMAÇÃO', 'Gerador de frases'],
  w2h: ['PLANO DE AÇÃO', 'Metodologia 5W2H'],
  nrs: ['NORMAS', 'Normas regulamentadoras'],
  painel: ['RECURSOS', 'Painel técnico'],
  assistente: ['INTELIGÊNCIA ARTIFICIAL', 'Assistente técnico de SST'],
  conversor: ['DOCUMENTOS', 'Conversor Word e PDF'],
};

function openPage(page, smooth = true) {
  const target = document.getElementById(page);
  if (!target) return;
  APP.page = page;
  localStorage.setItem(APP.keys.lastPage, page);
  if (location.hash !== `#/${page}`) history.replaceState(null, '', `#/${page}`);
  $$('.page').forEach(item => item.classList.toggle('active', item.id === page));
  $$('.nav-btn').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  const [eyebrow, title] = pageMeta[page] || ['SST PRIME', 'Central Técnica'];
  $('#pageEyebrow').textContent = eyebrow;
  const resolvedTitle = typeof title === 'function' ? title() : title;
  $('#pageTitle').textContent = resolvedTitle;
  document.title = `${resolvedTitle} — SST Prime`;
  const content = $('#mainContent');
  if (content) content.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
  closeSidebar();
}

function updateClock() {
  const now = new Date();
  $('#clockPill').textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
  $('#clockText').textContent = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
  if (APP.page === 'home') $('#pageTitle').textContent = `${greeting()}, Gestor`;
}

function openSidebar() { $('#sidebar')?.classList.add('open'); $('#sidebarScrim')?.classList.add('show'); }
function closeSidebar() { $('#sidebar')?.classList.remove('open'); $('#sidebarScrim')?.classList.remove('show'); }

function bindNavigation() {
  $$('.nav-btn, .brand, [data-jump]').forEach(button => button.addEventListener('click', () => openPage(button.dataset.page || button.dataset.jump)));
  $$('[data-scroll]').forEach(button => button.addEventListener('click', () => {
    const selector = button.dataset.scroll;
    openPage('home');
    setTimeout(() => $(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 180);
  }));
  $('#menuToggle')?.addEventListener('click', openSidebar);
  $('#sidebarScrim')?.addEventListener('click', closeSidebar);
  $('#themeToggle')?.addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  $('#logoutButton')?.addEventListener('click', () => {
    clearAccess();
    toast('Sessão encerrada', 'Você saiu da plataforma.');
    showAuth();
  });
  $('#floatingMascot')?.addEventListener('click', () => openPage('assistente'));
  $('#mainContent')?.addEventListener('scroll', debounce(updateFloatingButton, 40));
}

function renderEverything() {
  renderCounters();
  populateCategories();
  renderEpis();
  renderRiscos();
  renderEmpresas();
  renderW2H();
  renderNRs();
  renderPainel();
  renderAlerts();
  buildCommandIndex();
}

function createKpi(title, value, description, iconId, accent, soft) {
  const card = document.createElement('article');
  card.className = 'kpi-card';
  card.style.setProperty('--accent', accent);
  card.style.setProperty('--accent-soft', soft);
  card.innerHTML = `<div class="kpi-top"><span class="kpi-icon">${icon(iconId)}</span><small>BASE ATUAL</small></div><strong>${value}</strong><p>${title} • ${description}</p>`;
  return card;
}
function renderCounters() {
  const epis = safeArray(DATA.epis).length;
  const riscos = safeArray(DATA.riscos).length;
  const empresas = safeArray(DATA.empresas).length;
  const nrs = safeArray(DATA.nrs).length;
  const cards = [
    ['EPIs', epis, 'itens cadastrados', 'i-helmet', 'var(--green)', 'var(--green-3)'],
    ['Riscos', riscos, 'avaliações técnicas', 'i-alert', 'var(--orange)', 'rgba(239,139,58,.13)'],
    ['Empresas', empresas, 'mapeamentos ativos', 'i-building', 'var(--blue)', 'rgba(60,127,240,.12)'],
    ['NRs', nrs, 'normas disponíveis', 'i-book', 'var(--purple)', 'rgba(138,98,223,.13)'],
  ];
  const grid = $('#kpiGrid');
  grid.replaceChildren(...cards.map(args => createKpi(...args)));
  $('#heroEpiCount').textContent = epis;
  $('#epiTotalHeading').textContent = epis;
}

function categoryIcon(category) { return txt(category).trim().split(/\s+/)[0] || '🦺'; }
function categoryName(category) { return txt(category).replace(/^\S+\s*/, '').trim() || txt(category); }
function getFavorites() {
  try { return new Set(JSON.parse(localStorage.getItem(APP.keys.favorites) || '[]').map(txt)); }
  catch { return new Set(); }
}
function saveFavorites(set) { localStorage.setItem(APP.keys.favorites, JSON.stringify([...set])); }
function toggleFavorite(item) {
  const favorites = getFavorites();
  const id = epiId(item);
  const legacy = txt(item.ca);
  if (isFavorite(item, favorites)) { favorites.delete(id); favorites.delete(legacy); } else favorites.add(id);
  saveFavorites(favorites);
  renderEpis();
  updateModalFavorite();
}

function populateCategories() {
  const select = $('#categorySelect');
  if (!select) return;
  const groups = new Map();
  safeArray(DATA.epis).forEach(item => groups.set(item.categoria, (groups.get(item.categoria) || 0) + 1));
  const fragment = document.createDocumentFragment();
  [...groups.entries()].sort((a, b) => categoryName(a[0]).localeCompare(categoryName(b[0]), 'pt-BR')).forEach(([category, count]) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = `${category} — ${count}`;
    fragment.appendChild(option);
  });
  select.appendChild(fragment);
  APP.epiView = localStorage.getItem(APP.keys.epiView) || 'grid';
  updateViewButton();
}

function createEpiCard(item, favorites) {
  const card = document.createElement('article');
  card.className = 'epi-card';
  const favorite = isFavorite(item, favorites);
  card.innerHTML = `
    <div class="epi-image"><img alt="" loading="lazy" decoding="async"></div>
    <div class="epi-meta"><span class="category-chip"></span><span class="ca-chip"></span></div>
    <h3></h3>
    <div class="epi-actions">
      <button class="card-button primary" type="button">Detalhes ${icon('i-arrow')}</button>
      <button class="card-button copy-card" type="button" aria-label="Copiar CA">${icon('i-copy')}</button>
      <button class="card-button favorite-card ${favorite ? 'active' : ''}" type="button" aria-label="${favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">${icon('i-star')}</button>
    </div>`;
  const image = $('img', card);
  image.referrerPolicy = 'no-referrer';
  image.referrerPolicy = 'no-referrer';
  image.src = item.imagem || FALLBACK_IMAGE;
  image.alt = item.nome || 'Equipamento de proteção individual';
  image.addEventListener('load', () => image.classList.add('loaded'), { once: true });
  image.addEventListener('error', () => {
    image.src = FALLBACK_IMAGE;
    image.classList.add('fallback');
  }, { once: true });
  $('.category-chip', card).textContent = `${categoryIcon(item.categoria)} ${categoryName(item.categoria)}`;
  $('.ca-chip', card).textContent = `CA ${item.ca || 'N/I'}`;
  const epiTitle = $('h3', card);
  epiTitle.textContent = item.nome || 'EPI sem nome';
  epiTitle.title = item.nome || 'EPI sem nome';
  $('.primary', card).addEventListener('click', () => openEpiModal(item));
  $('.copy-card', card).addEventListener('click', async () => {
    try { await copyText(item.ca); toast('CA copiado', `CA ${item.ca}`); }
    catch { toast('Não foi possível copiar', 'O CA não está disponível.', 'error'); }
  });
  $('.favorite-card', card).addEventListener('click', () => toggleFavorite(item));
  return card;
}

function renderEpis() {
  const query = normalize(APP.filters.epi);
  const favorites = getFavorites();
  const items = safeArray(DATA.epis).filter(item => {
    const matchesText = !query || normalize(`${item.nome} ${item.ca} ${item.categoria}`).includes(query);
    const matchesCategory = !APP.filters.category || item.categoria === APP.filters.category;
    const matchesFavorite = !APP.favoriteOnly || isFavorite(item, favorites);
    return matchesText && matchesCategory && matchesFavorite;
  });
  APP.lastEpiResults = items;
  const grid = $('#epiList');
  grid.classList.toggle('compact', APP.epiView === 'compact');
  const fragment = document.createDocumentFragment();
  items.forEach(item => fragment.appendChild(createEpiCard(item, favorites)));
  grid.replaceChildren(fragment);
  $('#epiCount').textContent = items.length;
  $('#epiEmpty').classList.toggle('show', items.length === 0);
}

function updateViewButton() {
  const label = $('#viewToggle span');
  if (label) label.textContent = APP.epiView === 'grid' ? 'Compacto' : 'Cards';
  $('#viewToggle')?.classList.toggle('active', APP.epiView === 'compact');
}

function bindEpiFilters() {
  $('#exportEpiCsv')?.addEventListener('click', exportEpisCsv);
  $('#searchEpi')?.addEventListener('input', debounce(event => { APP.filters.epi = event.target.value; renderEpis(); }));
  $('#categorySelect')?.addEventListener('change', event => { APP.filters.category = event.target.value; renderEpis(); });
  $('#favoriteFilterBtn')?.addEventListener('click', event => {
    APP.favoriteOnly = !APP.favoriteOnly;
    event.currentTarget.classList.toggle('active', APP.favoriteOnly);
    event.currentTarget.setAttribute('aria-pressed', String(APP.favoriteOnly));
    renderEpis();
  });
  $('#viewToggle')?.addEventListener('click', () => {
    APP.epiView = APP.epiView === 'grid' ? 'compact' : 'grid';
    localStorage.setItem(APP.keys.epiView, APP.epiView);
    updateViewButton();
    renderEpis();
  });
  $('#clearEpiFilters')?.addEventListener('click', () => {
    APP.filters.epi = '';
    APP.filters.category = '';
    APP.favoriteOnly = false;
    $('#searchEpi').value = '';
    $('#categorySelect').value = '';
    $('#favoriteFilterBtn').classList.remove('active');
    $('#favoriteFilterBtn').setAttribute('aria-pressed', 'false');
    renderEpis();
    toast('Filtros removidos', 'Todos os EPIs estão visíveis novamente.');
  });
}

function createInfoCard(meta, title, description, copyValue) {
  const card = document.createElement('article');
  card.className = 'info-card';
  card.innerHTML = `<span class="tag"></span><h3></h3><p></p><footer><button class="copy-button" type="button">${icon('i-copy')} Copiar conteúdo</button></footer>`;
  $('.tag', card).textContent = meta;
  $('h3', card).textContent = title || 'Sem título';
  $('p', card).textContent = description || '';
  $('.copy-button', card).addEventListener('click', async () => {
    try { await copyText(copyValue || description || title); toast('Conteúdo copiado', 'Pronto para colar onde precisar.'); }
    catch { toast('Não foi possível copiar', 'Nenhum conteúdo disponível.', 'error'); }
  });
  return card;
}

function genericRender({ items, query, haystack, target, empty, factory }) {
  const q = normalize(query);
  const filtered = safeArray(items).filter(item => !q || normalize(haystack(item)).includes(q));
  const fragment = document.createDocumentFragment();
  filtered.forEach((item, index) => fragment.appendChild(factory(item, index)));
  $(target)?.replaceChildren(fragment);
  $(empty)?.classList.toggle('show', filtered.length === 0);
}

function renderRiscos() {
  genericRender({ items: DATA.riscos, query: APP.filters.risco, haystack: i => `${i.tipo} ${i.titulo} ${i.texto}`, target: '#riskList', empty: '#riskEmpty', factory: i => createInfoCard(i.tipo, i.titulo, i.texto, i.texto) });
}
function renderEmpresas() {
  genericRender({
    items: DATA.empresas, query: APP.filters.empresa, haystack: i => `${i.nome} ${i.risco} ${i.setor}`, target: '#empresaList', empty: '#empresaEmpty',
    factory: i => {
      const card = document.createElement('article');
      card.className = 'info-card company-card';
      card.innerHTML = `<span class="company-icon"></span><div class="company-risk"></div><h3></h3><p class="company-sector"><b>Setor:</b> <span></span></p><footer><button class="copy-button" type="button">${icon('i-copy')} Copiar empresa</button></footer>`;
      $('.company-icon', card).textContent = i.emoji || '🏢';
      $('.company-risk', card).textContent = i.risco || 'RISCO NÃO INFORMADO';
      $('h3', card).textContent = i.nome || 'Empresa não informada';
      $('.company-sector span', card).textContent = i.setor || 'Não informado';
      $('.copy-button', card).addEventListener('click', async () => {
        try {
          await copyText(i.nome);
          toast('Nome da empresa copiado', i.nome);
        } catch {
          toast('Erro ao copiar', 'O nome da empresa não está disponível.', 'error');
        }
      });
      return card;
    }
  });
}
function formatW2HText(item) {
  return txt(item.texto).trim();
}

function renderW2H() {
  genericRender({
    items: DATA.w2h, query: APP.filters.w2h, haystack: i => `${i.titulo} ${i.texto}`, target: '#w2hList', empty: '#w2hEmpty',
    factory: (i, index) => {
      const step = String(index + 1).padStart(2, '0');
      const card = document.createElement('article');
      card.className = 'timeline-card';
      card.dataset.index = step;
      card.innerHTML = `<span>ETAPA ${step}</span><h3></h3><p></p><footer><button class="timeline-copy-button" type="button" aria-label="Copiar conteúdo da etapa ${step}">${icon('i-copy')}<span>Copiar conteúdo</span></button></footer>`;
      $('h3', card).textContent = i.titulo;
      $('p', card).textContent = i.texto;
      $('.timeline-copy-button', card).addEventListener('click', async event => {
        const button = event.currentTarget;
        try {
          await copyText(formatW2HText(i));
          button.classList.add('copied');
          button.querySelector('span').textContent = 'Copiado!';
          toast('Conteúdo copiado', `“${formatW2HText(i)}” está pronto para colar.`);
          setTimeout(() => {
            button.classList.remove('copied');
            button.querySelector('span').textContent = 'Copiar conteúdo';
          }, 1600);
        } catch {
          toast('Não foi possível copiar', 'Tente novamente.', 'error');
        }
      });
      return card;
    }
  });
}

async function copyFullW2H() {
  const items = safeArray(DATA.w2h);
  if (!items.length) {
    toast('Nada para copiar', 'O plano 5W2H está vazio.', 'error');
    return;
  }
  const content = items.map(formatW2HText).filter(Boolean).join('\n');
  try {
    await copyText(content);
    toast('Conteúdos copiados', `${items.length} textos foram copiados.`);
  } catch {
    toast('Não foi possível copiar', 'Tente novamente.', 'error');
  }
}
function renderNRs() {
  genericRender({
    items: DATA.nrs, query: APP.filters.nr, haystack: i => `${i.codigo} ${i.nome}`, target: '#nrList', empty: '#nrEmpty',
    factory: i => {
      const card = document.createElement('article');
      card.className = 'nr-card';
      card.innerHTML = `<div class="nr-number"></div><h3></h3><a target="_blank" rel="noopener noreferrer">Abrir norma ${icon('i-external')}</a>`;
      $('.nr-number', card).textContent = i.codigo;
      $('h3', card).textContent = i.nome;
      const href = safeExternalUrl(i.link);
      if (href) $('a', card).href = href;
      if (!href) { $('a', card).removeAttribute('href'); $('a', card).textContent = 'Link indisponível'; }
      return card;
    }
  });
}
function splitResourceTitle(title) {
  const value = txt(title).trim();
  const parts = value.split(/\s+/);
  const first = parts[0] || '📁';
  return { emoji: /[\p{Extended_Pictographic}]/u.test(first) ? first : '📁', name: /[\p{Extended_Pictographic}]/u.test(first) ? parts.slice(1).join(' ') : value };
}
function renderPainel() {
  genericRender({
    items: DATA.painel, query: APP.filters.painel, haystack: i => `${i.titulo} ${i.desc}`, target: '#painelList', empty: '#painelEmpty',
    factory: i => {
      const parsed = splitResourceTitle(i.titulo);
      const card = document.createElement('article');
      card.className = 'resource-card';
      card.innerHTML = `<span class="resource-icon"></span><h3></h3><p></p><a target="_blank" rel="noopener noreferrer"><span>Acessar recurso</span>${icon('i-arrow')}</a>`;
      $('.resource-icon', card).textContent = parsed.emoji;
      $('h3', card).textContent = parsed.name || i.titulo;
      $('p', card).textContent = i.desc || '';
      const href = safeExternalUrl(i.link);
      if (href) $('a', card).href = href;
      if (!href) { $('a', card).removeAttribute('href'); $('a span', card).textContent = 'Link indisponível'; }
      return card;
    }
  });
}
function renderAlerts() {
  const box = $('#homeAlerts');
  const fragment = document.createDocumentFragment();
  safeArray(DATA.alertas).slice(0, 5).forEach(alert => {
    const item = document.createElement('div');
    item.className = 'status-item';
    item.innerHTML = '<i></i><span></span>';
    $('span', item).textContent = alert;
    fragment.appendChild(item);
  });
  box.replaceChildren(fragment);
}

function bindSearches() {
  $('#copyW2HAll')?.addEventListener('click', copyFullW2H);
  const mappings = [
    ['#searchRisco', 'risco', renderRiscos],
    ['#searchEmpresa', 'empresa', renderEmpresas],
    ['#searchW2H', 'w2h', renderW2H],
    ['#searchNR', 'nr', renderNRs],
    ['#searchPainel', 'painel', renderPainel],
  ];
  mappings.forEach(([selector, key, renderer]) => $(selector)?.addEventListener('input', debounce(event => { APP.filters[key] = event.target.value; renderer(); })));
}

function bindGenerator() {
  const date = $('#dataInput');
  const draft = readJSON(localStorage, APP.keys.generatorDraft, {});
  if ($('#empresaInput')) $('#empresaInput').value = draft.empresa || '';
  if ($('#nomesInput')) $('#nomesInput').value = draft.nomes || '';
  if (date) date.value = draft.data || localISODate();
  const saveDraft = debounce(() => {
    writeJSON(localStorage, APP.keys.generatorDraft, {
      empresa: $('#empresaInput')?.value || '',
      data: date?.value || localISODate(),
      nomes: $('#nomesInput')?.value || '',
    });
    const status = $('#draftStatus');
    if (status) {
      status.textContent = `Rascunho salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      status.classList.add('saved');
      setTimeout(() => status.classList.remove('saved'), 1000);
    }
  }, 450);
  ['#empresaInput', '#dataInput', '#nomesInput'].forEach(selector => $(selector)?.addEventListener('input', saveDraft));
  $('#gerarFrasesBtn')?.addEventListener('click', () => {
    const company = $('#empresaInput').value.trim() || 'EMPRESA';
    const selectedDate = formatDateBR(date.value || localISODate());
    const names = $('#nomesInput').value.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
    if (!names.length) { toast('Insira pelo menos um nome', 'Use um nome por linha.', 'error'); return; }
    const result = names.map(name => `${name}, ${company}, , , ${selectedDate}`).join('\n');
    $('#frasesResultado').value = result;
    $('#frasesCount').textContent = `${names.length} ${names.length === 1 ? 'linha gerada' : 'linhas geradas'}`;
    toast('Frases geradas', `${names.length} linhas prontas para copiar.`);
  });
  $('#copiarFrasesBtn')?.addEventListener('click', async () => {
    try { await copyText($('#frasesResultado').value); toast('Resultado copiado', 'Todas as linhas foram copiadas.'); }
    catch { toast('Nada para copiar', 'Gere as frases primeiro.', 'error'); }
  });
  $('#limparFrasesBtn')?.addEventListener('click', () => {
    $('#empresaInput').value = '';
    $('#nomesInput').value = '';
    $('#frasesResultado').value = '';
    if (date) date.value = localISODate();
    $('#frasesCount').textContent = '0 linhas geradas';
    localStorage.removeItem(APP.keys.generatorDraft);
    $('#draftStatus').textContent = 'Rascunho removido';
    toast('Campos limpos', 'O gerador está pronto para uma nova lista.');
  });
}

function exportEpisCsv() {
  const items = APP.lastEpiResults || [];
  if (!items.length) { toast('Nada para exportar', 'A lista filtrada está vazia.', 'error'); return; }
  const rows = [['Categoria', 'Nome do EPI', 'CA', 'Imagem'], ...items.map(item => [categoryName(item.categoria), item.nome, item.ca, item.imagem])];
  const csv = rows.map(row => row.map(escapeCsv).join(';')).join('\r\n');
  downloadText(csv, `epis-sst-prime-${localISODate()}.csv`, 'text/csv;charset=utf-8');
  toast('CSV exportado', `${items.length} EPIs foram incluídos no arquivo.`);
}

function updateFloatingButton() {
  const button = $('#floatingMascot');
  const content = $('#mainContent');
  if (!button || !content) return;
  const atScroll = content.scrollTop > 240;
  button.classList.toggle('scroll-mode', atScroll);
  button.setAttribute('aria-label', atScroll ? 'Voltar ao topo' : 'Voltar à visão geral');
  button.querySelector('span').textContent = atScroll ? '↑' : '+';
}
function showModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  APP.lastFocusedElement = document.activeElement;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}
function hideModal(id) {
  const modal = document.getElementById(id);
  if (!modal || !modal.classList.contains('show')) return;
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  if (!$('.modal.show')) document.body.classList.remove('modal-open');
  if (id === 'epiModal') APP.currentEpi = null;
  APP.lastFocusedElement?.focus?.();
}
function bindModals() {
  $$('[data-close]').forEach(button => button.addEventListener('click', () => hideModal(button.dataset.close)));
  document.addEventListener('keydown', event => {
    const activeModal = $('.modal.show');
    if (event.key === 'Tab' && activeModal) {
      const focusable = $$('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])', activeModal).filter(el => !el.hidden);
      if (focusable.length) {
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    if (event.key === 'Escape') {
      hideModal('epiModal');
      hideModal('commandModal');
      closeSidebar();
    }
  });
}
function openEpiModal(item) {
  APP.currentEpi = item;
  const image = $('#epiModalImg');
  image.referrerPolicy = 'no-referrer';
  image.referrerPolicy = 'no-referrer';
  image.src = item.imagem || FALLBACK_IMAGE;
  image.alt = item.nome || 'EPI';
  image.onerror = () => { image.onerror = null; image.src = FALLBACK_IMAGE; };
  $('#epiModalCategory').textContent = `${categoryIcon(item.categoria)} ${categoryName(item.categoria)}`;
  $('#epiModalTitle').textContent = item.nome || 'Equipamento de proteção';
  $('#epiModalCA').textContent = `CA ${item.ca || 'N/I'}`;
  updateModalFavorite();
  showModal('epiModal');
  setTimeout(() => $('[data-close="epiModal"]')?.focus(), 60);
}
function updateModalFavorite() {
  const button = $('#toggleModalFavorite');
  if (!button || !APP.currentEpi) return;
  const favorite = isFavorite(APP.currentEpi, getFavorites());
  button.classList.toggle('active', favorite);
  button.innerHTML = `${icon('i-star')} ${favorite ? 'Remover favorito' : 'Favoritar'}`;
}
function bindEpiModal() {
  $('#copyModalCA')?.addEventListener('click', async () => {
    try { await copyText(APP.currentEpi?.ca); toast('CA copiado', `CA ${APP.currentEpi?.ca}`); }
    catch { toast('Não foi possível copiar', '', 'error'); }
  });
  $('#copyModalFull')?.addEventListener('click', async () => {
    try { await copyText(`${APP.currentEpi?.nome} — CA ${APP.currentEpi?.ca || 'N/I'}`); toast('Informações copiadas', 'Nome e CA foram copiados.'); }
    catch { toast('Não foi possível copiar', '', 'error'); }
  });
  $('#toggleModalFavorite')?.addEventListener('click', () => APP.currentEpi && toggleFavorite(APP.currentEpi));
}

function buildCommandIndex() {
  APP.commandItems = [
    ...safeArray(DATA.epis).map(item => ({ type: 'EPI', icon: categoryIcon(item.categoria), title: item.nome, subtitle: `CA ${item.ca} • ${categoryName(item.categoria)}`, page: 'epis', action: () => openEpiModal(item), search: `${item.nome} ${item.ca} ${item.categoria}` })),
    ...safeArray(DATA.nrs).map(item => ({ type: 'NR', icon: '📚', title: `${item.codigo} — ${item.nome}`, subtitle: 'Norma regulamentadora', page: 'nrs', action: () => openExternal(item.link), search: `${item.codigo} ${item.nome}` })),
    ...safeArray(DATA.empresas).map(item => ({ type: 'EMPRESA', icon: item.emoji || '🏢', title: item.nome, subtitle: `${item.risco} • ${item.setor}`, page: 'empresas', search: `${item.nome} ${item.risco} ${item.setor}` })),
    ...safeArray(DATA.painel).map(item => ({ type: 'RECURSO', icon: splitResourceTitle(item.titulo).emoji, title: splitResourceTitle(item.titulo).name, subtitle: item.desc, page: 'painel', action: () => openExternal(item.link), search: `${item.titulo} ${item.desc}` })),
    { type: 'PÁGINA', icon: '⚠️', title: 'Riscos e conclusões', subtitle: 'Abrir avaliações técnicas', page: 'riscos', search: 'riscos avaliações pgr ltcat' },
    { type: 'PÁGINA', icon: '🧠', title: 'Plano 5W2H', subtitle: 'Abrir plano de ação', page: 'w2h', search: '5w2h plano ação' },
    { type: 'PÁGINA', icon: '📋', title: 'Gerador de frases', subtitle: 'Abrir automação', page: 'frases', search: 'gerador frases empresa' },
    { type: 'PÁGINA', icon: '🤖', title: 'Assistente IA de SST', subtitle: 'Consultar CBO e gerar textos técnicos', page: 'assistente', search: 'assistente ia cbo atividades laudo pgr ltcat revisão texto' },
    { type: 'PÁGINA', icon: '🔄', title: 'Conversor Word e PDF', subtitle: 'Converter DOCX para PDF ou PDF para DOCX', page: 'conversor', search: 'conversor word pdf docx arquivo documento' },
  ];
}
function openCommand() {
  showModal('commandModal');
  $('#commandInput').value = '';
  APP.commandIndex = 0;
  renderCommandResults('');
  setTimeout(() => $('#commandInput')?.focus(), 50);
}
function renderCommandResults(query) {
  const q = normalize(query);
  const results = APP.commandItems
    .map(item => ({ item, score: commandScore(item, q) }))
    .filter(entry => !q || entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, 'pt-BR'))
    .slice(0, 18)
    .map(entry => entry.item);
  const box = $('#commandResults');
  const meta = $('#commandMeta');
  meta.textContent = q ? `${results.length} resultados` : 'Sugestões rápidas';
  APP.commandIndex = Math.min(APP.commandIndex, Math.max(0, results.length - 1));
  box.innerHTML = '';
  if (!results.length) { box.innerHTML = '<div class="command-empty">Nenhum resultado encontrado.</div>'; return; }
  results.forEach((item, index) => {
    const button = document.createElement('button');
    button.className = `command-item ${index === APP.commandIndex ? 'active' : ''}`;
    button.type = 'button';
    button.innerHTML = `<span></span><div><b></b><small></small></div><em></em>`;
    $('span', button).textContent = item.icon;
    $('b', button).textContent = item.title;
    $('small', button).textContent = item.subtitle || '';
    $('em', button).textContent = item.type;
    button.addEventListener('click', () => executeCommand(item));
    box.appendChild(button);
  });
  box._results = results;
}
function executeCommand(item) {
  hideModal('commandModal');
  openPage(item.page);
  if (item.action) setTimeout(item.action, 170);
}
function bindCommand() {
  $('#globalSearchButton')?.addEventListener('click', openCommand);
  $('#commandInput')?.addEventListener('input', event => { APP.commandIndex = 0; renderCommandResults(event.target.value); });
  $('#commandInput')?.addEventListener('keydown', event => {
    const box = $('#commandResults');
    const results = box._results || [];
    if (event.key === 'ArrowDown') { event.preventDefault(); APP.commandIndex = Math.min(APP.commandIndex + 1, results.length - 1); renderCommandResults(event.currentTarget.value); }
    if (event.key === 'ArrowUp') { event.preventDefault(); APP.commandIndex = Math.max(APP.commandIndex - 1, 0); renderCommandResults(event.currentTarget.value); }
    if (event.key === 'Enter' && results[APP.commandIndex]) { event.preventDefault(); executeCommand(results[APP.commandIndex]); }
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openCommand(); }
    if (event.altKey && /^[1-9]$/.test(event.key)) {
      event.preventDefault();
      openPage(['home','epis','riscos','empresas','frases','w2h','nrs','painel','conversor'][Number(event.key) - 1]);
    }
    if (event.altKey && event.key === '0') {
      event.preventDefault();
      openPage('assistente');
    }
  });
}

function commandScore(item, query) {
  if (!query) return item.type === 'PÁGINA' ? 4 : 1;
  const title = normalize(item.title);
  const search = normalize(item.search);
  if (title === query) return 100;
  if (title.startsWith(query)) return 70;
  if (title.includes(query)) return 50;
  const tokens = query.split(/\s+/).filter(Boolean);
  const matches = tokens.filter(token => search.includes(token)).length;
  return matches === tokens.length ? 20 + matches : matches * 4;
}
function updateNetworkStatus() {
  const badge = $('#networkStatus');
  if (!badge) return;
  const online = navigator.onLine;
  badge.classList.toggle('offline', !online);
  $('span', badge).textContent = online ? 'Online' : 'Offline';
  badge.title = online ? 'Conectado à internet' : 'Sem conexão. Recursos já carregados continuam disponíveis.';
}
function bindPwaInstall() {
  window.addEventListener('online', () => { updateNetworkStatus(); toast('Conexão restabelecida', 'A central está online novamente.'); });
  window.addEventListener('offline', () => { updateNetworkStatus(); toast('Você está offline', 'Os recursos já armazenados continuam disponíveis.', 'error'); });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    APP.installPrompt = event;
    $('#installAppButton').hidden = false;
  });
  $('#installAppButton')?.addEventListener('click', async () => {
    if (!APP.installPrompt) return;
    APP.installPrompt.prompt();
    const choice = await APP.installPrompt.userChoice;
    if (choice.outcome === 'accepted') toast('Aplicativo instalado', 'SST Prime foi adicionado ao dispositivo.');
    APP.installPrompt = null;
    $('#installAppButton').hidden = true;
  });
  window.addEventListener('appinstalled', () => { $('#installAppButton').hidden = true; });
}
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  navigator.serviceWorker.register('./sw.js?v=3.1.0').then(registration => {
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Nova versão disponível', 'Recarregue a página para aplicar a atualização.');
        }
      });
    });
  }).catch(error => console.warn('Service Worker:', error));
}
function init() {
  bindAuth();
  bindNavigation();
  bindEpiFilters();
  bindSearches();
  bindGenerator();
  bindModals();
  bindEpiModal();
  bindCommand();
  bindPwaInstall();
  window.addEventListener('hashchange', () => { const page = location.hash.replace('#/', ''); if (pageMeta[page] && page !== APP.page) openPage(page, false); });
  registerServiceWorker();
  boot();
}

document.addEventListener('DOMContentLoaded', init);
