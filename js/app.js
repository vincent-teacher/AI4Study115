/* 生成式AI輔助學生學習 — 互動教材網站 */
(() => {
'use strict';
const PAGES = window.PAGES, C = window.COURSE, I18N = window.I18N;
const TOTAL = PAGES.length;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $('#app');

/* ---------- 儲存 ---------- */
const KEY = { set: 'aili_settings', store: 'aili_store', log: 'aili_log' };
function load(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 私密模式等情況下忽略 */ } }
const DEF_SET = { sound: true, device: 'auto', orient: 'auto', lang: 'zh', font: 'normal', theme: 'system' };
let S = Object.assign({}, DEF_SET, load(KEY.set, {}));
let store = Object.assign({ visited: {}, chDone: {}, profile: {}, reflect: {}, best: {}, quizHist: [], time: {}, last: 1 }, load(KEY.store, {}));
let LOG = load(KEY.log, []);
const persist = () => save(KEY.store, store);

/* ---------- 工具 ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t = (k, v = {}) => (I18N[S.lang]?.[k] ?? I18N.zh[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
const pad = n => String(n).padStart(3, '0');
const img = n => `assets/pages/p${pad(n)}.webp`;
const thumb = n => `assets/thumbs/p${pad(n)}.webp`;
const chOf = n => C.chapters.find(c => n >= c.from && n <= c.to);
const chTitle = c => S.lang === 'en' ? c.en : c.zh;
const chSum = c => S.lang === 'en' ? c.sumEn : c.sumZh;
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmtTime = ts => { const d = new Date(ts); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const fmtDur = s => s >= 60 ? `${Math.floor(s / 60)} 分 ${s % 60} 秒` : `${s} 秒`;
const pageText = p => [p.x, C.notes[p.n]].filter(Boolean).join('\n');
const visitedIn = c => { let k = 0; for (let n = c.from; n <= c.to; n++) if (store.visited[n]) k++; return k; };
const visitedCount = () => Object.keys(store.visited).length;
function toast(msg) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; $('#toasts').appendChild(el); setTimeout(() => el.remove(), 2600); }

/* ---------- 音效（Web Audio 即時合成，不需外部檔案） ---------- */
let AC;
function tone(f, d = .12, type = 'sine', vol = .15, delay = 0) {
  if (!S.sound) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(), g = AC.createGain(), t0 = AC.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(f, t0);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + .015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g).connect(AC.destination); o.start(t0); o.stop(t0 + d + .05);
  } catch (e) { /* 不支援音效時略過 */ }
}
const sfx = {
  click: () => tone(660, .06, 'triangle', .08),
  toggle: () => { tone(520, .06, 'sine', .1); tone(780, .08, 'sine', .1, .05); },
  flip: () => { tone(300, .08, 'triangle', .08); tone(450, .08, 'triangle', .07, .04); },
  ok: () => { [523, 659, 784].forEach((f, i) => tone(f, .16, 'triangle', .14, i * .07)); },
  bad: () => { tone(220, .18, 'sawtooth', .07); tone(180, .22, 'sawtooth', .06, .1); },
  win: () => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, .22, 'triangle', .14, i * .1)); },
  open: () => { tone(440, .08, 'sine', .08); tone(880, .1, 'sine', .06, .06); }
};

/* ---------- 學習歷程 ---------- */
const EV = { read: '📖', practice: '🏋️', quiz: '📝', search: '🔍', other: '⭐' };
function logEvent(type, text, extra = {}) {
  LOG.push(Object.assign({ ts: Date.now(), type, text }, extra));
  if (LOG.length > 3000) LOG = LOG.slice(-3000);
  save(KEY.log, LOG);
}
let reading = null; // { ch, start, fresh }
function flushReading() {
  if (!reading) return;
  const sec = Math.round((Date.now() - reading.start) / 1000);
  if (sec >= 5) {
    store.time[reading.ch] = (store.time[reading.ch] || 0) + sec;
    const c = C.chapters.find(x => x.id === reading.ch);
    logEvent('read', `閱讀〈${c.zh}〉${fmtDur(sec)}，新瀏覽 ${reading.fresh} 頁`, { ch: c.id, sec, pages: reading.fresh });
    persist();
  }
  reading = null;
}
function markVisited(n) {
  if (store.visited[n]) return;
  store.visited[n] = Date.now();
  if (reading) reading.fresh++;
  const c = chOf(n);
  if (c && visitedIn(c) === c.to - c.from + 1 && !store.chDone[c.id]) completeChapter(c, true);
  persist();
  const b = $(`.slide[data-n="${n}"] .shot`);
  if (b && !$('.seen', b)) b.insertAdjacentHTML('beforeend', '<span class="seen">✓</span>');
  updateSide();
}
function completeChapter(c, auto) {
  if (store.chDone[c.id]) return;
  store.chDone[c.id] = Date.now(); persist();
  logEvent('read', `完成章節〈${c.zh}〉${auto ? '（全部頁面已瀏覽）' : ''}`, { ch: c.id });
  sfx.win(); confetti(); toast('🎉 ' + t('doneMark'));
  updateSide();
}

/* ---------- 設定 ---------- */
const mqDark = matchMedia('(prefers-color-scheme: dark)');
function effDevice() { if (S.device !== 'auto') return S.device; const w = innerWidth; return w < 760 ? 'mobile' : w < 1180 ? 'tablet' : 'desktop'; }
function effOrient() { if (S.orient !== 'auto') return S.orient; return innerWidth >= innerHeight ? 'landscape' : 'portrait'; }
function applySettings() {
  const h = document.documentElement;
  h.dataset.theme = S.theme === 'system' ? (mqDark.matches ? 'dark' : 'light') : S.theme;
  h.classList.remove('font-small', 'font-large'); if (S.font !== 'normal') h.classList.add('font-' + S.font);
  h.lang = S.lang === 'en' ? 'en' : 'zh-Hant';
  applyLayout();
  $$('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
  $$('[data-i18n-ph]').forEach(el => el.placeholder = t(el.dataset.i18nPh));
  $$('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  document.title = t('siteTitle');
}
function applyLayout() {
  const h = document.documentElement, d = effDevice(), o = effOrient();
  ['dev-mobile', 'dev-tablet', 'dev-desktop', 'ori-portrait', 'ori-landscape'].forEach(c => h.classList.remove(c));
  h.classList.add('dev-' + d, 'ori-' + o);
  document.body.classList.toggle('force-frame', S.device !== 'auto');
}
mqDark.addEventListener?.('change', () => S.theme === 'system' && applySettings());
let rT; addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(applyLayout, 120); });

const SET_ROWS = [
  { k: 'full', ic: '⛶', c: '#FF6B6B', label: 'setFull', opts: [['on', 'on'], ['off', 'off']] },
  { k: 'sound', ic: '🔊', c: '#FF9F43', label: 'setSound', opts: [[true, 'on'], [false, 'off']] },
  { k: 'device', ic: '📱', c: '#1DD1A1', label: 'setDevice', opts: [['auto', 'auto'], ['mobile', 'mobile'], ['tablet', 'tablet'], ['desktop', 'desktop']] },
  { k: 'orient', ic: '🔄', c: '#00C2D1', label: 'setOrient', opts: [['auto', 'auto'], ['portrait', 'portrait'], ['landscape', 'landscape']] },
  { k: 'lang', ic: '🌐', c: '#54A0FF', label: 'setLang', opts: [['zh', 'zhTW'], ['en', 'english']] },
  { k: 'font', ic: '🔠', c: '#A55EEA', label: 'setFont', opts: [['small', 'small'], ['normal', 'normal'], ['large', 'large']] },
  { k: 'theme', ic: '🎨', c: '#FF6FB5', label: 'setTheme', opts: [['system', 'system'], ['light', 'light'], ['dark', 'dark']] }
];
const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function renderSettings() {
  $('#settingsBody').innerHTML = SET_ROWS.map(r => {
    const cur = r.k === 'full' ? (isFull() ? 'on' : 'off') : S[r.k];
    return `<div class="set-row" style="--c:${r.c}"><span><i>${r.ic}</i>${t(r.label)}</span><div class="seg" role="radiogroup" aria-label="${t(r.label)}">${
      r.opts.map(([v, l]) => `<button role="radio" aria-checked="${v === cur}" class="${v === cur ? 'on' : ''}" data-k="${r.k}" data-v="${v}">${t(l)}</button>`).join('')}</div></div>`;
  }).join('') + `<p class="muted center" style="margin:.2rem 0 0;font-size:.8rem">${S.lang === 'en' ? t('langNote') : '設定會自動儲存在此瀏覽器。'}</p>`;
}
$('#settingsBody').addEventListener('click', e => {
  const b = e.target.closest('button[data-k]'); if (!b) return;
  const k = b.dataset.k; let v = b.dataset.v;
  if (k === 'full') { toggleFull(v === 'on'); return; }
  if (k === 'sound') v = v === 'true';
  S[k] = v; save(KEY.set, S);
  applySettings(); renderSettings(); sfx.toggle();
  if (k === 'lang' || k === 'device' || k === 'orient') route();
});
function toggleFull(on) {
  const el = document.documentElement;
  try {
    if (on && !isFull()) (el.requestFullscreen || el.webkitRequestFullscreen).call(el)?.catch?.(() => toast(t('fullFail')));
    else if (!on && isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } catch (e) { toast(t('fullFail')); }
  sfx.toggle();
}
document.addEventListener('fullscreenchange', () => { if (!$('#settingsModal').hidden) renderSettings(); });
$('#settingsBtn').onclick = () => { renderSettings(); openModal('#settingsModal'); sfx.open(); };
$('#resetSettings').onclick = () => { S = Object.assign({}, DEF_SET); save(KEY.set, S); applySettings(); renderSettings(); route(); sfx.toggle(); };
function openModal(sel) { const m = $(sel); m.hidden = false; setTimeout(() => $('button', m)?.focus(), 50); }
document.addEventListener('click', e => {
  if (e.target.matches('[data-close]') || e.target.classList.contains('modal') || e.target.id === 'lightbox') {
    e.target.closest('.modal, .lightbox').hidden = true;
  }
});

/* ---------- 導覽 ---------- */
const NAV = [['home', '🏠', 'navHome'], ['browse', '🗂️', 'navBrowse'], ['search', '🔍', 'navSearch'], ['practice', '🏋️', 'navPractice'], ['quiz', '📝', 'navQuiz'], ['log', '📒', 'navLog']];
function renderNav(active) {
  const html = NAV.map(([k, e, l]) => `<a href="#/${k}" class="${active === k ? 'active' : ''}"><span class="e">${e}</span><span class="t">${t(l)}</span></a>`).join('');
  $('#topnav').innerHTML = html; $('#bottomnav').innerHTML = html;
}
function renderSide(activeCh) {
  $('#sideList').innerHTML = C.chapters.map(c => {
    const pct = Math.round(visitedIn(c) / (c.to - c.from + 1) * 100);
    return `<li><a href="#/chapter/${c.id}" style="--c:${c.color}" class="${activeCh === c.id ? 'active' : ''}" data-ch="${c.id}">
      <span class="ic">${c.icon}</span><span>${c.id}. ${esc(chTitle(c))}</span>${store.chDone[c.id] ? '<span class="done-dot">✅</span>' : ''}
      <span class="pbar"><i style="width:${pct}%"></i></span></a></li>`;
  }).join('');
}
function updateSide() { const a = $('.side-list a.active'); renderSide(a ? +a.dataset.ch : 0); }
function closeSide() { $('#sidebar').classList.remove('open'); $('#scrim').hidden = true; }
$('#menuBtn').onclick = () => { $('#sidebar').classList.add('open'); $('#scrim').hidden = false; sfx.click(); };
$('#closeSide').onclick = closeSide; $('#scrim').onclick = closeSide;

/* ---------- 吉祥物 ---------- */
function mascot(mood = 'happy') {
  const mouth = mood === 'sad' ? '<path d="M84 128 q16 -12 32 0" stroke="#7fd3ff" stroke-width="6" fill="none" stroke-linecap="round"/>'
    : mood === 'think' ? '<rect x="88" y="122" width="24" height="6" rx="3" fill="#7fd3ff"/>'
      : '<path d="M82 120 q18 18 36 0" stroke="#7fd3ff" stroke-width="6" fill="none" stroke-linecap="round"/>';
  return `<svg class="mascot" viewBox="0 0 200 230" aria-hidden="true">
    <line x1="100" y1="22" x2="100" y2="48" stroke="#b8c4e0" stroke-width="6"/><circle cx="100" cy="18" r="11" fill="#FECA57"><animate attributeName="r" values="11;14;11" dur="1.6s" repeatCount="indefinite"/></circle>
    <rect x="22" y="44" width="156" height="118" rx="52" fill="#fff" stroke="#dfe6f5" stroke-width="4"/>
    <circle cx="20" cy="104" r="14" fill="#54A0FF"/><circle cx="180" cy="104" r="14" fill="#54A0FF"/>
    <rect x="44" y="66" width="112" height="76" rx="34" fill="#1f2a4d"/>
    <g><ellipse cx="78" cy="98" rx="11" ry="13" fill="#7fd3ff"><animate attributeName="ry" values="13;13;2;13;13" keyTimes="0;.45;.5;.55;1" dur="4s" repeatCount="indefinite"/></ellipse>
    <ellipse cx="122" cy="98" rx="11" ry="13" fill="#7fd3ff"><animate attributeName="ry" values="13;13;2;13;13" keyTimes="0;.45;.5;.55;1" dur="4s" repeatCount="indefinite"/></ellipse></g>
    ${mouth}
    <rect x="54" y="160" width="92" height="56" rx="26" fill="#fff" stroke="#dfe6f5" stroke-width="4"/>
    <circle cx="100" cy="186" r="13" fill="#54A0FF"/><text x="100" y="191" font-size="13" text-anchor="middle" fill="#fff" font-weight="900">AI</text>
    <g><rect x="150" y="150" width="30" height="40" rx="6" fill="#FF6B6B" transform="rotate(12 165 170)"/><rect x="155" y="154" width="20" height="30" rx="3" fill="#fff" transform="rotate(12 165 170)"/></g>
    <circle cx="36" cy="176" r="12" fill="#fff" stroke="#dfe6f5" stroke-width="4"><animateTransform attributeName="transform" type="rotate" values="0 54 170;-18 54 170;0 54 170" dur="2s" repeatCount="indefinite"/></circle>
  </svg>`;
}
const ring = (pct, size = 118, stroke = 12, color = 'var(--green)') => {
  const r = (size - stroke) / 2, L = 2 * Math.PI * r;
  return `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="var(--line)" stroke-width="${stroke}" fill="none"/>
  <circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="${stroke}" fill="none" stroke-linecap="round" stroke-dasharray="${L}" stroke-dashoffset="${L}" data-off="${L * (1 - pct / 100)}"/></svg>`;
};
const animateRings = () => requestAnimationFrame(() => requestAnimationFrame(() => $$('.ring-fg').forEach(c => c.style.strokeDashoffset = c.dataset.off)));

/* ---------- 路由 ---------- */
function route() {
  const h = decodeURIComponent(location.hash.slice(2) || 'home');
  const [view, a, b] = h.split('/');
  const nextCh = view === 'chapter' ? (+a || 1) : view === 'page' ? chOf(Math.min(TOTAL, Math.max(1, +a || 1))).id : 0;
  if (!reading || reading.ch !== nextCh) flushReading();
  closeSide();
  $('#quickResults').hidden = true;
  const views = { home, chapter, page: pageView, browse, search, practice, quiz, log: logView };
  (views[view] || home)(a, b);
  renderNav(view === 'chapter' || view === 'page' ? '' : (views[view] ? view : 'home'));
  if (!['chapter', 'page'].includes(view)) renderSide(0);
  app.focus({ preventScroll: true });
}
addEventListener('hashchange', () => { route(); if (!location.hash.includes('/page/')) scrollTo({ top: 0, behavior: 'instant' }); });
addEventListener('visibilitychange', () => { if (document.hidden) { flushReading(); } else if (location.hash.startsWith('#/chapter') || location.hash.startsWith('#/page')) { const c = currentCh; if (c) reading = { ch: c, start: Date.now(), fresh: 0 }; } });
addEventListener('pagehide', flushReading);
let currentCh = 0;

/* ---------- 首頁 ---------- */
const TIPS = ['tip1', 'tip2', 'tip3', 'tip4', 'tip5'];
function home() {
  currentCh = 0;
  const vc = visitedCount(), pct = Math.round(vc / TOTAL * 100), done = Object.keys(store.chDone).length;
  const best = store.quizHist.length ? Math.max(...store.quizHist.map(q => q.pct)) : 0;
  app.innerHTML = `
  <section class="hero">
    <div>
      <span class="kicker">✨ ${t('heroKicker')}</span>
      <h1>${t('heroTitle')}</h1>
      <p>${t('heroDesc')}</p>
      <div class="row" style="margin-top:1rem">
        <a class="btn primary" href="#/chapter/${vc ? (chOf(store.last) || C.chapters[0]).id : 1}">🚀 ${vc ? t('continueLearn') : t('startLearn')}</a>
        <a class="btn ghost" href="#/quiz">📝 ${t('takeQuiz')}</a>
        <button class="btn ghost" id="heroSet">⚙️ ${t('settings')}</button>
      </div>
    </div>
    <div class="mascot-wrap"><div class="bubble" id="tipBubble">${t(TIPS[0])}</div>${mascot()}</div>
  </section>
  <div class="stats">
    ${[[TOTAL, 'statPages', '#FF6B6B'], [C.chapters.length, 'statChapters', '#54A0FF'], [C.practices.length + 3, 'statPractice', '#1DD1A1'], [C.quiz.length, 'statQuiz', '#A55EEA']]
      .map(([n, l, c], i) => `<div class="stat" style="--c:${c};animation-delay:${i * .08}s"><b data-count="${n}">0</b><span>${t(l)}</span></div>`).join('')}
  </div>
  <h2 class="section-title">📈 ${t('myProgress')}</h2>
  <div class="card progress-card">
    <div class="ring">${ring(pct)}<b>${pct}%</b></div>
    <div class="mini-stats">
      <div><b>${vc}/${TOTAL}</b><span>${t('pagesRead')}</span></div>
      <div><b>${done}/${C.chapters.length}</b><span>${t('chaptersDone')}</span></div>
      <div><b>${best}%</b><span>${t('bestScore')}</span></div>
    </div>
  </div>
  <h2 class="section-title">📚 ${t('allChapters')}</h2>
  <div class="ch-grid">${C.chapters.map((c, i) => chCard(c, i)).join('')}</div>
  <h2 class="section-title">🧭 ${S.lang === 'en' ? 'Explore' : '探索功能'}</h2>
  <div class="feature-grid">
    ${[['browse', '🗂️', '#FF9F43', 'navBrowse', 'browseDesc'], ['search', '🔍', '#54A0FF', 'navSearch', 'searchDesc'], ['practice', '🏋️', '#1DD1A1', 'navPractice', 'practiceDesc'], ['quiz', '📝', '#FF6B6B', 'navQuiz', 'quizDesc'], ['log', '📒', '#A55EEA', 'navLog', 'logDesc']]
      .map(([k, e, c, l, d]) => `<a class="feature reveal" style="--c:${c}" href="#/${k}"><span class="fe">${e}</span><h3>${t(l)}</h3><p>${t(d)}</p></a>`).join('')}
  </div>`;
  $('#heroSet').onclick = () => $('#settingsBtn').click();
  $$('[data-count]').forEach(el => { const n = +el.dataset.count; let i = 0; const st = setInterval(() => { i += Math.ceil(n / 25); if (i >= n) { i = n; clearInterval(st); } el.textContent = i; }, 30); });
  let ti = 0; clearInterval(window.__tip); window.__tip = setInterval(() => { const b = $('#tipBubble'); if (!b) return clearInterval(window.__tip); ti = (ti + 1) % TIPS.length; b.textContent = t(TIPS[ti]); b.style.animation = 'none'; b.offsetWidth; b.style.animation = ''; }, 4500);
  animateRings();
}
function chCard(c, i = 0) {
  const n = c.to - c.from + 1, v = visitedIn(c), pct = Math.round(v / n * 100);
  return `<a class="ch-card" href="#/chapter/${c.id}" style="--c:${c.color};animation-delay:${Math.min(i, 10) * .04}s">
    <div class="cover"><img loading="lazy" src="${thumb(c.from === 1 ? 2 : c.from)}" alt=""><span class="num">${c.id}</span><span class="emo">${c.icon}</span></div>
    <div class="body"><h3>${esc(chTitle(c))}</h3><p>${esc(chSum(c))}</p>
    <div class="meta"><span>${t('pageRange', { a: c.from, b: c.to })}</span><span>${store.chDone[c.id] ? '✅' : pct + '%'}</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div></div></a>`;
}

/* ---------- 章節 ---------- */
let obs;
function slideHTML(n, open) {
  const p = PAGES[n - 1], txt = pageText(p);
  return `<article class="slide has-text ${open ? 'text-open' : ''}" data-n="${n}" id="s${n}">
    <div class="shot" data-zoom="${n}"><img loading="lazy" src="${img(n)}" alt="第 ${n} 頁：${esc(p.t)}" width="1440" height="1080"><span class="pno">${t('page', { n })}</span>${store.visited[n] ? '<span class="seen">✓</span>' : ''}<span class="zoom-hint">🔍</span></div>
    <div class="txt"><div class="txt-head"><h3>${esc(p.t)}</h3><button class="btn ghost small" data-txt="${n}">${open ? t('hideText') : t('showText')}</button></div>
    <div class="txt-body">${txt ? esc(txt) : `<span class="muted">${t('noText')}</span>`}</div></div></article>`;
}
function observeSlides() {
  obs?.disconnect();
  obs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { const n = +e.target.dataset.n; markVisited(n); store.last = n; persist(); } }), { threshold: .55 });
  $$('.slide').forEach(s => obs.observe(s));
}
function chapter(id) {
  const c = C.chapters.find(x => x.id === +id) || C.chapters[0];
  currentCh = c.id;
  if (!reading || reading.ch !== c.id) { reading = { ch: c.id, start: Date.now(), fresh: 0 }; logEvent('read', `開啟章節〈${c.zh}〉`, { ch: c.id }); }
  const prev = C.chapters.find(x => x.id === c.id - 1), next = C.chapters.find(x => x.id === c.id + 1);
  const pr = C.practices.find(p => p.ch === c.id);
  const allOpen = load('aili_txt', false);
  const pages = []; for (let n = c.from; n <= c.to; n++) pages.push(n);
  app.innerHTML = `
  <section class="ch-hero" style="--c:${c.color}" data-emo="${c.icon}">
    <div class="row"><span class="chip">${S.lang === 'en' ? 'Chapter' : '第'} ${c.id} ${S.lang === 'en' ? '' : '章'}</span><span class="chip">${t('pageRange', { a: c.from, b: c.to })}</span><span class="chip">${pages.length} ${t('pages')}</span></div>
    <h1>${c.icon} ${esc(chTitle(c))}</h1><p>${esc(chSum(c))}</p>
  </section>
  <h2 class="section-title">💡 ${t('keyPoints')}</h2>
  <div class="keys" style="--c:${c.color}">${c.keys.map((k, i) => `<div class="key" style="animation-delay:${i * .07}s">${esc(k)}</div>`).join('')}</div>
  <div class="toolbar">
    <div class="seg"><button class="on">📜 ${t('listMode')}</button><button data-single>🖼️ ${t('singleMode')}</button></div>
    <div class="row">
      <button class="btn ghost small" id="allTxt">${allOpen ? t('hideText') : t('showText')}</button>
      ${store.chDone[c.id] ? `<span class="chip">${t('doneMark')}</span>` : `<button class="btn green small" id="doneBtn">✅ ${t('markDone')}</button>`}
    </div>
  </div>
  <div class="slides">${pages.map(n => slideHTML(n, allOpen)).join('')}</div>
  <div class="ch-foot">
    ${prev ? `<a class="btn ghost" href="#/chapter/${prev.id}">⬅️ ${t('prevCh')}</a>` : '<span></span>'}
    <div class="row">${pr ? `<a class="btn blue" href="#/practice/${pr.id}">🏋️ ${t('chapterPractice')}</a>` : ''}<a class="btn primary" href="#/quiz/ch${c.id}">📝 ${t('chapterQuiz')}</a></div>
    ${next ? `<a class="btn ghost" href="#/chapter/${next.id}">${t('nextCh')} ➡️</a>` : '<span></span>'}
  </div>`;
  renderSide(c.id);
  $('[data-single]').onclick = () => { location.hash = `#/page/${store.last >= c.from && store.last <= c.to ? store.last : c.from}`; };
  $('#allTxt').onclick = () => { const v = !load('aili_txt', false); save('aili_txt', v); $$('.slide').forEach(s => { s.classList.toggle('text-open', v); $('[data-txt]', s).textContent = v ? t('hideText') : t('showText'); }); $('#allTxt').textContent = v ? t('hideText') : t('showText'); sfx.toggle(); };
  $('#doneBtn') && ($('#doneBtn').onclick = () => { completeChapter(c, false); chapter(c.id); });
  observeSlides();
}
app.addEventListener('click', e => {
  const tb = e.target.closest('[data-txt]');
  if (tb) { const s = tb.closest('.slide'); const o = s.classList.toggle('text-open'); tb.textContent = o ? t('hideText') : t('showText'); sfx.click(); return; }
  const z = e.target.closest('[data-zoom]');
  if (z) { openLB(+z.dataset.zoom); }
});

/* ---------- 單頁閱讀 ---------- */
function pageView(nStr) {
  let n = Math.min(TOTAL, Math.max(1, parseInt(nStr) || 1));
  const c = chOf(n);
  if (!reading || reading.ch !== c.id) { flushReading(); reading = { ch: c.id, start: Date.now(), fresh: 0 }; logEvent('read', `開啟章節〈${c.zh}〉（單頁閱讀）`, { ch: c.id }); }
  currentCh = c.id;
  const dir = +(sessionStorage.getItem('aili_dir') || 1);
  const strip = []; for (let i = c.from; i <= c.to; i++) strip.push(i);
  app.innerHTML = `
  <div class="page-head"><h1><span style="color:${c.color}">${c.icon}</span> ${esc(chTitle(c))}</h1><p>${t('page', { n })} / ${TOTAL}</p></div>
  <div class="single">
    <div class="single-nav">
      <a class="btn ghost small" href="#/chapter/${c.id}">📜 ${t('backCh')}</a>
      <button class="btn ghost small" id="pPrev" ${n <= 1 ? 'disabled' : ''}>◀ ${t('prev')}</button>
      <input type="range" min="1" max="${TOTAL}" value="${n}" id="pRange" aria-label="${t('jumpTo')}">
      <button class="btn primary small" id="pNext" ${n >= TOTAL ? 'disabled' : ''}>${t('next')} ▶</button>
    </div>
    <div class="slide-anim" style="--dx:${dir * 40}px">${slideHTML(n, true)}</div>
    <div class="strip" id="strip">${strip.map(i => `<a href="#/page/${i}" class="${i === n ? 'cur' : ''}"><img loading="lazy" src="${thumb(i)}" alt="第 ${i} 頁"><span>${i}</span></a>`).join('')}</div>
  </div>`;
  renderSide(c.id);
  markVisited(n); store.last = n; persist();
  const go = (m, d) => { if (m < 1 || m > TOTAL) return; sessionStorage.setItem('aili_dir', d); sfx.flip(); location.hash = `#/page/${m}`; };
  $('#pPrev').onclick = () => go(n - 1, -1); $('#pNext').onclick = () => go(n + 1, 1);
  $('#pRange').onchange = e => go(+e.target.value, +e.target.value > n ? 1 : -1);
  $('#strip .cur')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  // 觸控滑動翻頁
  const shot = $('.single .shot'); let sx = null;
  shot.addEventListener('touchstart', e => sx = e.touches[0].clientX, { passive: true });
  shot.addEventListener('touchend', e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 60) go(dx < 0 ? n + 1 : n - 1, dx < 0 ? 1 : -1); sx = null; });
  pageView.cur = n;
}

/* ---------- 放大檢視 ---------- */
let lbN = 1;
function openLB(n) { lbN = n; $('#lbImg').src = img(n); $('#lbImg').alt = `第 ${n} 頁`; $('#lbCap').textContent = `${t('page', { n })} ・ ${PAGES[n - 1].t}`; $('#lightbox').hidden = false; sfx.open(); markVisited(n); }
$('#lbPrev').onclick = e => { e.stopPropagation(); if (lbN > 1) { openLB(lbN - 1); sfx.flip(); } };
$('#lbNext').onclick = e => { e.stopPropagation(); if (lbN < TOTAL) { openLB(lbN + 1); sfx.flip(); } };

/* ---------- 瀏覽 ---------- */
function browse(filter) {
  currentCh = 0;
  const f = +filter || 0;
  app.innerHTML = `
  <div class="page-head"><h1>🗂️ ${t('browseTitle')}</h1><p>${t('browseDesc')}</p></div>
  <div class="toolbar">
    <div class="row"><label class="muted" for="chSel">${t('filterCh')}</label>
      <select id="chSel" class="btn ghost small"><option value="0">${t('all')}</option>${C.chapters.map(c => `<option value="${c.id}" ${c.id === f ? 'selected' : ''}>${c.icon} ${c.id}. ${esc(chTitle(c))}</option>`).join('')}</select></div>
    <form class="row" id="jumpF"><label class="muted" for="jumpN">${t('jumpTo')}</label><input id="jumpN" type="number" min="1" max="${TOTAL}" class="btn ghost small" style="width:6rem" placeholder="1–${TOTAL}"><button class="btn primary small">${t('go')}</button></form>
  </div>
  ${C.chapters.filter(c => !f || c.id === f).map(c => {
    const ns = []; for (let n = c.from; n <= c.to; n++) ns.push(n);
    return `<section class="browse-ch" style="--c:${c.color}"><h2><span class="ic">${c.icon}</span>${c.id}. ${esc(chTitle(c))} <span class="chip">${visitedIn(c)}/${ns.length}</span></h2>
    <div class="thumbs">${ns.map(n => `<a class="thumb ${store.visited[n] ? 'seen' : ''}" href="#/page/${n}"><img loading="lazy" src="${thumb(n)}" alt="第 ${n} 頁"><div class="cap"><b>${n}</b><span>${esc(PAGES[n - 1].t)}</span></div></a>`).join('')}</div></section>`;
  }).join('')}`;
  $('#chSel').onchange = e => { sfx.click(); location.hash = '#/browse/' + e.target.value; };
  $('#jumpF').onsubmit = e => { e.preventDefault(); const n = +$('#jumpN').value; if (n >= 1 && n <= TOTAL) location.hash = '#/page/' + n; };
}

/* ---------- 檢索 ---------- */
const norm = s => String(s).toLowerCase().replace(/台/g, '臺').replace(/\s+/g, '');
const INDEX = PAGES.map(p => ({ n: p.n, t: p.t, raw: pageText(p), k: norm(p.t + '\n' + pageText(p)) }));
function doSearch(q) {
  const terms = q.split(/\s+/).map(norm).filter(Boolean);
  if (!terms.length) return { pages: [], concepts: [], chapters: [] };
  const hit = s => terms.every(x => norm(s).includes(x));
  const pages = INDEX.filter(e => terms.every(x => e.k.includes(x))).map(e => {
    let score = 0; terms.forEach(x => { score += e.k.split(x).length - 1; if (norm(e.t).includes(x)) score += 5; });
    return Object.assign({ score }, e);
  }).sort((a, b) => b.score - a.score || a.n - b.n);
  const concepts = C.cards.filter(c => hit(c[0] + c[1]));
  const chapters = C.chapters.filter(c => hit(c.zh + c.en + c.sumZh + c.keys.join('')));
  return { pages, concepts, chapters };
}
function termRe(q) {
  const parts = q.split(/\s+/).filter(Boolean).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[台臺]/g, '[台臺]'));
  return parts.length ? new RegExp('(' + parts.join('|') + ')', 'gi') : null;
}
function snippet(raw, q, len = 60) {
  const re = termRe(q); const flat = raw.replace(/\n+/g, ' ／ ');
  let i = 0; if (re) { const m = flat.search(re); if (m > 0) i = Math.max(0, m - len / 2); }
  let s = flat.slice(i, i + len * 2); if (i > 0) s = '…' + s; if (i + len * 2 < flat.length) s += '…';
  return re ? esc(s).replace(termRe(esc(q)) || re, '<mark>$1</mark>') : esc(s);
}
const HOT = [['提示詞', '#FF6B6B'], ['幻覺', '#FF9F43'], ['查證', '#1DD1A1'], ['PARTS', '#54A0FF'], ['費曼', '#A55EEA'], ['圖書館', '#FF6FB5'], ['閱讀', '#00C2D1'], ['NotebookLM', '#E84393'], ['資訊圖表', '#10AC84'], ['九宮格', '#8854D0'], ['Gem', '#EE5A24'], ['個資', '#5F27CD']];
let searchLogT;
function search(q = '') {
  currentCh = 0;
  app.innerHTML = `
  <div class="page-head"><h1>🔍 ${t('searchTitle')}</h1><p>${t('searchDesc')}</p></div>
  <form class="search-big" id="sF"><input id="sQ" type="search" value="${esc(q)}" placeholder="${t('searchPh')}" autocomplete="off"><button class="btn primary">${t('navSearch')}</button></form>
  <div class="hot"><span class="muted" style="align-self:center;font-weight:700">🔥 ${t('hotWords')}：</span>${HOT.map(([w, c]) => `<button style="--c:${c}" data-w="${w}">${w}</button>`).join('')}</div>
  <div id="sOut"></div>`;
  const run = (v, logIt) => {
    const out = $('#sOut'); if (!v.trim()) { out.innerHTML = ''; return; }
    const r = doSearch(v); const total = r.pages.length + r.concepts.length + r.chapters.length;
    out.innerHTML = `<p class="muted" style="font-weight:700">${t('results', { n: total })}</p>
    ${total ? '' : `<div class="card center">${mascot('think')}<p>${t('noResult')}</p></div>`}
    <div class="results">
      ${r.chapters.map(c => `<a class="res concept" style="border-left-color:${c.color}" href="#/chapter/${c.id}"><span class="big">${c.icon}</span><div><h3>${t('inChapter')} ${c.id}：${esc(chTitle(c))}</h3><p>${esc(chSum(c))}</p></div></a>`).join('')}
      ${r.concepts.map(c => `<a class="res concept" href="#/page/${c[2]}"><span class="big">💡</span><div><h3>${esc(c[0])}</h3><p>${esc(c[1])}</p></div></a>`).join('')}
      ${r.pages.slice(0, 80).map((e, i) => { const c = chOf(e.n); return `<a class="res" href="#/page/${e.n}" style="animation-delay:${Math.min(i, 12) * .03}s"><img loading="lazy" src="${thumb(e.n)}" alt=""><div><h3>${t('page', { n: e.n })}・${esc(e.t)}</h3><p><span class="chip" style="background:${c.color};color:#fff">${c.icon} ${esc(chTitle(c))}</span></p><p>${snippet(e.raw, v)}</p></div></a>`; }).join('')}
    </div>`;
    if (logIt) logEvent('search', `搜尋「${v}」，找到 ${total} 筆`, { q: v, n: total });
  };
  $('#sF').onsubmit = e => { e.preventDefault(); const v = $('#sQ').value; history.replaceState(null, '', '#/search/' + encodeURIComponent(v)); run(v, true); sfx.click(); };
  $('#sQ').oninput = e => { clearTimeout(searchLogT); run(e.target.value, false); searchLogT = setTimeout(() => e.target.value.trim() && logEvent('search', `搜尋「${e.target.value}」`, { q: e.target.value }), 1500); };
  $$('.hot button').forEach(b => b.onclick = () => { $('#sQ').value = b.dataset.w; $('#sF').requestSubmit(); });
  if (q) run(q, false);
  setTimeout(() => $('#sQ').focus(), 50);
}
/* 頂部快速搜尋 */
const qs = $('#quickSearch'), qr = $('#quickResults');
let qSel = -1;
qs.addEventListener('input', () => {
  const v = qs.value.trim(); qSel = -1;
  if (!v) { qr.hidden = true; return; }
  const r = doSearch(v).pages.slice(0, 7);
  qr.innerHTML = (r.length ? r.map(e => `<a class="qr-item" href="#/page/${e.n}"><img src="${thumb(e.n)}" alt=""><div><b>${t('page', { n: e.n })}・${esc(e.t)}</b><small>${snippet(e.raw, v, 34)}</small></div></a>`).join('') : `<div class="qr-item">${t('noResult')}</div>`)
    + `<a class="qr-item" href="#/search/${encodeURIComponent(v)}" style="justify-content:center;font-weight:800;color:var(--purple)">🔍 ${t('searchTitle')}：「${esc(v)}」→</a>`;
  qr.hidden = false;
});
qs.addEventListener('keydown', e => {
  const items = $$('.qr-item[href]', qr);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); qSel = (qSel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items.forEach((x, i) => x.classList.toggle('sel', i === qSel)); }
  else if (e.key === 'Enter') { e.preventDefault(); const it = items[qSel] || items[items.length - 1]; if (it) { location.hash = it.getAttribute('href'); if (qSel < 0 || qSel === items.length - 1) logEvent('search', `搜尋「${qs.value}」`, { q: qs.value }); qs.blur(); qr.hidden = true; } }
  else if (e.key === 'Escape') { qr.hidden = true; qs.blur(); }
});
qr.addEventListener('click', () => { qr.hidden = true; });
document.addEventListener('click', e => { if (!e.target.closest('.search-wrap')) qr.hidden = true; });

/* ---------- 練習 ---------- */
const EXTRA_PR = [
  { id: 'fact', icon: '🕵️', color: '#EE5253', zh: '查證挑戰', en: 'Fact-check Challenge', descZh: '找出 AI 回覆中錯誤的句子，練習「圈、查、改」。', descEn: 'Find the wrong sentences in an AI answer.' },
  { id: 'flash', icon: '🃏', color: '#8854D0', zh: '概念翻翻卡', en: 'Concept Flip Cards', descZh: '24 張重要概念卡，翻面記憶、反覆複習。', descEn: '24 key concept cards to flip and review.' },
  { id: 'img', icon: '🖌️', color: '#F368E0', zh: '圖片提示詞健檢', en: 'Image Prompt Check-up', descZh: '寫一段繪圖提示詞，檢查是否具備九大要素。', descEn: 'Check your image prompt against nine elements.' }
];
const allPractices = () => [...C.practices, ...EXTRA_PR];
const prName = p => S.lang === 'en' ? p.en : p.zh;
function practice(id) {
  currentCh = 0;
  const p = allPractices().find(x => x.id === id);
  if (!p) return practiceList();
  if (id === 'fact') return factPlay(p);
  if (id === 'flash') return flashPlay(p);
  if (id === 'img') return imgPlay(p);
  classifyPlay(p);
}
function practiceList() {
  app.innerHTML = `<div class="page-head"><h1>🏋️ ${t('practiceTitle')}</h1><p>${t('practiceDesc')}</p></div>
  <div class="pr-grid">${allPractices().map((p, i) => `<button class="pr-card" style="--c:${p.color};animation-delay:${i * .05}s" data-go="${p.id}">
    <div class="pe">${p.icon}</div><h3>${esc(prName(p))}</h3><p>${esc(S.lang === 'en' ? p.descEn : p.descZh)}</p>
    <div class="best">${store.best[p.id] != null ? `🏆 ${S.lang === 'en' ? 'Best' : '最佳'}：${store.best[p.id]}%` : `▶ ${t('startPractice')}`}${p.page ? `　📄 p.${p.page}` : ''}</div></button>`).join('')}</div>`;
  $$('[data-go]').forEach(b => b.onclick = () => { sfx.click(); location.hash = '#/practice/' + b.dataset.go; });
}
function finishPractice(p, pct, detail) {
  const prev = store.best[p.id];
  store.best[p.id] = Math.max(prev ?? 0, pct); persist();
  logEvent('practice', `完成練習〈${p.zh}〉得分 ${pct}%${detail ? '，' + detail : ''}`, { id: p.id, pct });
  if (pct >= 80) { sfx.win(); confetti(); } else sfx.ok();
}
function resultBlock(p, pct, extra = '') {
  const msg = pct === 100 ? t('perfect') : pct >= 80 ? t('great') : pct >= 60 ? t('ok') : t('low');
  return `<div class="qcard result" style="--c:${p.color}"><div class="big-ring">${ring(pct, 170, 16, p.color)}<b>${pct}%</b></div>
    <div style="width:140px;margin:.5rem auto 0">${mascot(pct >= 60 ? 'happy' : 'sad')}</div><h2>${msg}</h2>${extra}
    <div class="row" style="justify-content:center;margin-top:1rem"><button class="btn primary" id="again">🔁 ${t('again')}</button><a class="btn ghost" href="#/practice">📋 ${t('backList')}</a>${p.page ? `<a class="btn ghost" href="#/page/${p.page}">📄 ${t('seePage')} p.${p.page}</a>` : ''}</div></div>`;
}
function classifyPlay(p) {
  const items = shuffle(p.items).slice(0, Math.min(10, p.items.length));
  let i = 0, right = 0; const marks = [];
  const draw = () => {
    if (i >= items.length) {
      const pct = Math.round(right / items.length * 100);
      app.innerHTML = playHead(p) + resultBlock(p, pct, `<p class="muted">${right} / ${items.length}</p>`);
      finishPractice(p, pct, `${right}/${items.length} 題`); $('#again').onclick = () => classifyPlay(p); animateRings(); return;
    }
    const [text, ans, why] = items[i];
    app.innerHTML = playHead(p) + `<div class="qcard" style="--c:${p.color}">
      <div class="row" style="justify-content:space-between"><span class="qn">${S.lang === 'en' ? 'Item' : '第'} ${i + 1} / ${items.length} ${S.lang === 'en' ? '' : '題'}</span><div class="progress-dots">${items.map((_, k) => `<i class="${marks[k] ?? (k === i ? 'cur' : '')}"></i>`).join('')}</div></div>
      <div class="qtext">「${esc(text)}」</div>
      <div class="opts ${p.cats.length > 4 ? 'cols' : ''}">${p.cats.map((c, k) => `<button class="opt" data-k="${k}">${esc(c)}</button>`).join('')}</div>
      <div id="fb"></div></div>`;
    $$('.opt').forEach(b => b.onclick = () => {
      const k = +b.dataset.k, ok = k === ans;
      $$('.opt').forEach(x => { x.disabled = true; if (+x.dataset.k === ans) x.classList.add('right'); });
      if (!ok) b.classList.add('wrong');
      ok ? (right++, sfx.ok()) : sfx.bad(); marks[i] = ok ? 'ok' : 'no';
      $('#fb').innerHTML = `<div class="feedback ${ok ? 'ok' : 'no'}"><span class="fe">${ok ? '🎉' : '🤔'}</span><div>${ok ? t('correct') : t('wrong') + ' ' + t('answerIs') + esc(p.cats[ans])}${why ? `<p>${esc(why)}</p>` : ''}</div></div>
        <div class="qfoot"><span class="muted">${t('score')}：${right}</span><button class="btn primary" id="nx">${i + 1 < items.length ? t('nextQ') + ' ➡️' : t('finish') + ' 🏁'}</button></div>`;
      $('#nx').focus(); $('#nx').onclick = () => { i++; sfx.click(); draw(); };
    });
  };
  draw();
}
const playHead = p => `<div class="play"><div class="play-head"><h1 style="margin:0;font-size:1.45rem">${p.icon} ${esc(prName(p))}</h1><a class="btn ghost small" href="#/practice">📋 ${t('backList')}</a></div><p class="muted" style="margin-top:0">${esc(S.lang === 'en' ? p.descEn : p.descZh)}</p></div>`;

function factPlay(p) {
  const sel = new Set();
  app.innerHTML = playHead(p) + `<div class="play"><div class="qcard" style="--c:${p.color}">
    <div class="qn">🤖 ${S.lang === 'en' ? 'AI answer' : 'AI 回覆的內容'}（p.33）</div>
    <div class="fact-text" id="ft">${C.factcheck.map((f, i) => `<span data-i="${i}" tabindex="0" role="button">${esc(f.s)}</span>`).join('')}</div>
    <div class="qfoot"><span class="muted">${S.lang === 'en' ? 'Selected' : '已圈選'}：<b id="selN">0</b></span><button class="btn primary" id="chk">🔎 ${t('check')}</button></div><div id="fb"></div></div></div>`;
  const toggle = s => { const i = +s.dataset.i; sel.has(i) ? sel.delete(i) : sel.add(i); s.classList.toggle('sel'); $('#selN').textContent = sel.size; sfx.click(); };
  $$('#ft span').forEach(s => { s.onclick = () => toggle(s); s.onkeydown = e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(s)); });
  $('#chk').onclick = () => {
    const bad = C.factcheck.map((f, i) => f.bad ? i : -1).filter(i => i >= 0);
    let hit = 0, fp = 0;
    $$('#ft span').forEach(s => {
      const i = +s.dataset.i, f = C.factcheck[i]; s.onclick = null; s.classList.remove('sel');
      if (f.bad && sel.has(i)) { s.classList.add('hit'); hit++; } else if (f.bad) s.classList.add('miss'); else if (sel.has(i)) { s.classList.add('false-pos'); fp++; }
    });
    const pct = Math.max(0, Math.round((hit - fp) / bad.length * 100));
    $('#chk').remove();
    $('#fb').innerHTML = `<div class="feedback ${pct >= 75 ? 'ok' : 'no'}"><span class="fe">${pct >= 75 ? '🎉' : '🧐'}</span><div>${S.lang === 'en' ? 'Found' : '找到錯誤'} ${hit}/${bad.length}${fp ? `，${S.lang === 'en' ? 'false alarms' : '誤判'} ${fp}` : ''}<p>🟩 ${S.lang === 'en' ? 'found' : '正確圈出'}　🟥 ${S.lang === 'en' ? 'missed' : '漏掉的錯誤'}　〰️ ${S.lang === 'en' ? 'actually correct' : '其實正確'}</p></div></div>
      <h3 style="margin-top:1rem">✏️ ${S.lang === 'en' ? 'Corrections' : '查證後的正確說法（圈 → 查 → 改）'}</h3>
      <div class="fix-list">${C.factcheck.filter(f => f.bad).map(f => `<div>❌ <s>${esc(f.s)}</s><br>✅ ${esc(f.fix)}</div>`).join('')}</div>
      <div class="row" style="justify-content:center;margin-top:1rem"><button class="btn primary" id="again">🔁 ${t('again')}</button><a class="btn ghost" href="#/page/35">📄 ${t('seePage')} p.35</a><a class="btn ghost" href="#/practice">📋 ${t('backList')}</a></div>`;
    $('#again').onclick = () => factPlay(p);
    finishPractice(p, pct, `找出 ${hit}/${bad.length} 個錯誤`);
  };
}
function flashPlay(p) {
  let deck = shuffle(C.cards), known = 0; const total = deck.length;
  const draw = () => {
    if (!deck.length) { app.innerHTML = playHead(p) + resultBlock(p, 100, `<p>${S.lang === 'en' ? 'All cards learned!' : '全部概念卡都記住了！'}</p>`); finishPractice(p, 100, `記住 ${total} 張概念卡`); $('#again').onclick = () => flashPlay(p); animateRings(); return; }
    const c = deck[0];
    app.innerHTML = playHead(p) + `<div class="play">
      <div class="row" style="justify-content:space-between;margin-bottom:.6rem"><span class="chip">✅ ${known} / ${total}</span><span class="chip">🃏 ${deck.length} ${S.lang === 'en' ? 'left' : '張待複習'}</span></div>
      <div class="bar" style="--c:${p.color};margin-bottom:1rem"><i style="width:${known / total * 100}%"></i></div>
      <div class="flash-stage"><div class="flash" id="fc" tabindex="0" role="button" aria-label="${t('flip')}"><div class="front">${esc(c[0])}<small>👆 ${t('flip')}</small></div><div class="back"><div>${esc(c[1])}<br><a href="#/page/${c[2]}" class="chip" style="margin-top:.8rem">📄 p.${c[2]}</a></div></div></div></div>
      <div class="row" style="justify-content:center;margin-top:1.2rem"><button class="btn ghost" id="no">🔁 ${t('notYet')}</button><button class="btn green" id="yes">✅ ${t('know')}</button></div></div>`;
    const fc = $('#fc'); const flip = () => { fc.classList.toggle('flipped'); sfx.flip(); };
    fc.onclick = e => { if (!e.target.closest('a')) flip(); }; fc.onkeydown = e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), flip());
    $('#yes').onclick = () => { deck.shift(); known++; sfx.ok(); draw(); };
    $('#no').onclick = () => { deck.push(deck.shift()); sfx.click(); draw(); };
  };
  draw();
}
const IMG_SAMPLE = '請生成一張校園閱讀推廣海報。畫面中有幾位高中生坐在圖書館角落閱讀，有紙本書、電子書和平板。場景溫暖安靜，有木質書架和柔和燈光。風格是水彩插畫風，色彩柔和，直式構圖，適合貼在學校圖書館。請預留上方空白區域放標題，不要出現真實品牌標誌。';
const IMG_TIPS = { '主題': '請生成一張【主題】的圖片', '主角／物件': '畫面中有【角色／物件】', '動作': '正在【動作】', '場景': '場景是【地點／時間／天氣】', '風格': '風格是【漫畫／水彩／海報／像素風／寫實】', '色彩／氣氛': '色彩感覺是【明亮／溫暖／神祕／科技感】', '構圖／比例': '構圖是【近景／遠景／俯視／中央構圖】，比例 16:9 或 3:4', '用途': '圖片用途是【海報／故事插圖／簡報封面】', '避免元素': '請避免【不需要出現的元素】' };
function imgPlay(p) {
  app.innerHTML = playHead(p) + `<div class="play"><div class="qcard" style="--c:${p.color}">
    <textarea id="ip" rows="5" placeholder="${t('imgPh')}">${esc(load('aili_imgdraft', ''))}</textarea>
    <div class="row" style="margin-top:.7rem"><button class="btn primary" id="an">🩺 ${t('analyze')}</button><button class="btn ghost" id="smp">📋 ${t('sample')}</button><button class="btn ghost" id="cp">📎 ${t('copy')}</button><a class="btn ghost" href="#/page/143">📄 p.143</a><a class="btn ghost" href="#/page/148">📄 p.148</a></div>
    <div id="res"></div></div></div>`;
  const ip = $('#ip');
  ip.oninput = () => save('aili_imgdraft', ip.value);
  $('#smp').onclick = () => { ip.value = IMG_SAMPLE; save('aili_imgdraft', ip.value); sfx.click(); };
  $('#cp').onclick = () => { navigator.clipboard?.writeText(ip.value).then(() => toast(t('copied')), () => { }); sfx.click(); };
  $('#an').onclick = () => {
    const v = ip.value.trim(); if (!v) { ip.classList.add('shake'); setTimeout(() => ip.classList.remove('shake'), 500); sfx.bad(); return; }
    const res = C.imgcheck.map(([name, kws]) => [name, kws.some(k => v.includes(k))]);
    const got = res.filter(r => r[1]).length, pct = Math.round(got / res.length * 100);
    $('#res').innerHTML = `<div class="meter"><i style="width:0%"></i></div><p style="font-weight:800;margin:.5rem 0 0">${S.lang === 'en' ? 'Completeness' : '完整度'}：${pct}%（${got}/${res.length}）・${v.length} 字</p>
      <div class="checks">${res.map(([n, ok]) => `<div class="${ok ? 'yes' : 'no'}">${ok ? '✅' : '⬜'} ${n}</div>`).join('')}</div>
      ${got < res.length ? `<h3 style="margin-top:1rem">💡 ${S.lang === 'en' ? 'Try adding' : '可以補充'}</h3><div class="fix-list">${res.filter(r => !r[1]).map(([n]) => `<div><b>${n}</b>：${IMG_TIPS[n]}</div>`).join('')}</div>` : `<div class="feedback ok"><span class="fe">🌟</span><div>${S.lang === 'en' ? 'Excellent prompt!' : '九大要素都具備了，這是一段很完整的提示詞！'}</div></div>`}`;
    requestAnimationFrame(() => requestAnimationFrame(() => $('.meter i').style.width = pct + '%'));
    finishPractice(p, pct, `提示詞具備 ${got}/${res.length} 項要素`);
  };
}

/* ---------- 測驗 ---------- */
function quiz(arg) {
  currentCh = 0;
  if (arg) {
    if (arg === 'quick') return quizPlay(shuffle(C.quiz).slice(0, 10), '快速測驗');
    if (arg === 'full') return quizPlay(shuffle(C.quiz), '完整挑戰');
    if (arg.startsWith('ch')) { const c = C.chapters.find(x => x.id === +arg.slice(2)); const qs = C.quiz.filter(q => q.c === c?.id); if (c && qs.length) return quizPlay(shuffle(qs), `第 ${c.id} 章〈${c.zh}〉`, c); }
  }
  const hist = store.quizHist.slice(-8).reverse();
  app.innerHTML = `<div class="page-head"><h1>📝 ${t('quizTitle')}</h1><p>${t('quizDesc')}</p></div>
  <div class="quiz-modes">
    <button class="mode m1" data-m="quick"><span class="me">⚡</span><b>${t('quick10')}</b><span>${S.lang === 'en' ? 'Random 10 from the bank' : `從 ${C.quiz.length} 題中隨機抽 10 題`}</span></button>
    <button class="mode m2" data-m="pick"><span class="me">📚</span><b>${t('byChapter')}</b><span>${S.lang === 'en' ? 'Test one chapter' : '針對單一章節檢核理解'}</span></button>
    <button class="mode m3" data-m="full"><span class="me">🏆</span><b>${t('fullTest')}</b><span>${C.quiz.length} ${S.lang === 'en' ? 'questions' : '題全部挑戰'}</span></button>
  </div>
  <div class="ch-pick" id="chPick" hidden>${C.chapters.filter(c => C.quiz.some(q => q.c === c.id)).map(c => `<button style="--c:${c.color}" data-ch="${c.id}">${c.icon} ${c.id}. ${esc(chTitle(c))}（${C.quiz.filter(q => q.c === c.id).length}）</button>`).join('')}</div>
  ${hist.length ? `<h2 class="section-title">🕘 ${S.lang === 'en' ? 'Recent results' : '最近測驗成績'}</h2><div class="history-list">${hist.map(h => `<div><span>${fmtTime(h.ts)}・${esc(h.name)}</span><b>${h.right}/${h.total}（${h.pct}%）</b></div>`).join('')}</div>` : ''}`;
  $$('.mode').forEach(b => b.onclick = () => { sfx.click(); if (b.dataset.m === 'pick') { $('#chPick').hidden = !$('#chPick').hidden; } else location.hash = '#/quiz/' + b.dataset.m; });
  $$('#chPick button').forEach(b => b.onclick = () => { sfx.click(); location.hash = '#/quiz/ch' + b.dataset.ch; });
}
let qTimer;
function quizPlay(qs, name, ch) {
  const color = ch?.color || '#A55EEA';
  let i = 0, right = 0; const wrong = [], marks = []; const t0 = Date.now();
  clearInterval(qTimer);
  const draw = () => {
    if (i >= qs.length) return done();
    const q = qs[i], order = shuffle(q.o.map((_, k) => k));
    app.innerHTML = `<div class="play"><div class="play-head"><h1 style="margin:0;font-size:1.4rem">📝 ${esc(name)}</h1><div class="row"><span class="chip">⏱️ ${t('timer')} <b id="tm">0:00</b></span><a class="btn ghost small" href="#/quiz">✕</a></div></div>
      <div class="qcard" style="--c:${color}">
        <div class="row" style="justify-content:space-between"><span class="qn">Q${i + 1} / ${qs.length}</span><div class="progress-dots">${qs.map((_, k) => `<i class="${marks[k] ?? (k === i ? 'cur' : '')}"></i>`).join('')}</div></div>
        <div class="qtext">${esc(q.q)}</div>
        <div class="opts">${order.map((k, j) => `<button class="opt" data-k="${k}"><span class="ab">${'ABCD'[j]}</span>${esc(q.o[k])}</button>`).join('')}</div>
        <div id="fb"></div></div></div>`;
    tick();
    $$('.opt').forEach(b => b.onclick = () => {
      const k = +b.dataset.k, ok = k === q.a;
      $$('.opt').forEach(x => { x.disabled = true; if (+x.dataset.k === q.a) x.classList.add('right'); });
      if (!ok) { b.classList.add('wrong'); wrong.push(q); }
      ok ? (right++, sfx.ok()) : sfx.bad(); marks[i] = ok ? 'ok' : 'no';
      $('#fb').innerHTML = `<div class="feedback ${ok ? 'ok' : 'no'}"><span class="fe">${ok ? '🎉' : '💡'}</span><div>${ok ? t('correct') : t('wrong') + ' ' + t('answerIs') + esc(q.o[q.a])}<p>${esc(q.e)}</p></div></div>
        <div class="qfoot"><a class="btn ghost small" href="#/page/${q.p}" target="_blank" rel="noopener">📄 ${t('seePage')} p.${q.p}</a><button class="btn primary" id="nx">${i + 1 < qs.length ? t('nextQ') + ' ➡️' : t('finish') + ' 🏁'}</button></div>`;
      $('#nx').focus(); $('#nx').onclick = () => { i++; sfx.click(); draw(); };
    });
  };
  const tick = () => { clearInterval(qTimer); const up = () => { const el = $('#tm'); if (!el) return clearInterval(qTimer); const s = Math.round((Date.now() - t0) / 1000); el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }; up(); qTimer = setInterval(up, 1000); };
  const done = () => {
    clearInterval(qTimer);
    const pct = Math.round(right / qs.length * 100), sec = Math.round((Date.now() - t0) / 1000);
    store.quizHist.push({ ts: Date.now(), name, right, total: qs.length, pct, sec }); persist();
    logEvent('quiz', `完成測驗〈${name}〉答對 ${right}/${qs.length}（${pct}%），用時 ${fmtDur(sec)}`, { pct, right, total: qs.length, sec, wrong: wrong.map(w => w.q) });
    const msg = pct === 100 ? t('perfect') : pct >= 80 ? t('great') : pct >= 60 ? t('ok') : t('low');
    app.innerHTML = `<div class="play"><div class="qcard result" style="--c:${color}">
      <div class="big-ring">${ring(pct, 170, 16, pct >= 60 ? 'var(--ok)' : 'var(--bad)')}<b>${pct}%</b></div>
      <div style="width:140px;margin:.5rem auto 0">${mascot(pct >= 60 ? 'happy' : 'sad')}</div>
      <h2>${t('quizDone')} ${msg}</h2><p class="muted">${right} / ${qs.length}・⏱️ ${fmtDur(sec)}</p>
      <div class="row" style="justify-content:center;margin-top:1rem"><button class="btn primary" id="rt">🔁 ${t('retry')}</button>${wrong.length ? `<button class="btn blue" id="rw">🎯 ${t('retryWrong')}（${wrong.length}）</button>` : ''}<a class="btn ghost" href="#/quiz">📋 ${t('quizTitle')}</a><a class="btn ghost" href="#/log">📒 ${t('navLog')}</a></div>
      ${wrong.length ? `<h3 style="margin-top:1.4rem;text-align:left">📌 ${t('reviewWrong')}</h3><div class="review">${wrong.map(w => `<div class="ri"><b>${esc(w.q)}</b>✅ ${esc(w.o[w.a])}<br><span class="muted">${esc(w.e)}</span> <a href="#/page/${w.p}">📄 p.${w.p}</a></div>`).join('')}</div>` : ''}
    </div></div>`;
    animateRings();
    if (pct >= 80) { sfx.win(); confetti(); } else if (pct >= 60) sfx.ok(); else sfx.bad();
    $('#rt').onclick = () => quizPlay(shuffle(qs), name, ch);
    $('#rw') && ($('#rw').onclick = () => quizPlay(shuffle(wrong), name + '（錯題重練）', ch));
  };
  draw();
}

/* ---------- 學習歷程 ---------- */
function logView(filter = 'all') {
  currentCh = 0;
  const pf = store.profile, rf = store.reflect;
  const vc = visitedCount(), done = Object.keys(store.chDone).length;
  const qh = store.quizHist, best = qh.length ? Math.max(...qh.map(q => q.pct)) : 0;
  const totalSec = Object.values(store.time).reduce((a, b) => a + b, 0);
  const pracN = LOG.filter(l => l.type === 'practice').length;
  const list = LOG.filter(l => filter === 'all' || l.type === filter || (filter === 'other' && !['read', 'practice', 'quiz'].includes(l.type))).slice().reverse();
  app.innerHTML = `<div class="page-head"><h1>📒 ${t('logTitle')}</h1><p>${t('logDesc')}</p></div>
  <div class="kpis">
    <div class="kpi" style="--c:#FF6B6B"><b>${vc}</b><span>📖 ${t('pagesRead')}（/${TOTAL}）</span></div>
    <div class="kpi" style="--c:#1DD1A1"><b>${done}</b><span>✅ ${t('chaptersDone')}（/${C.chapters.length}）</span></div>
    <div class="kpi" style="--c:#54A0FF"><b>${pracN}</b><span>🏋️ ${S.lang === 'en' ? 'Practice sessions' : '練習次數'}</span></div>
    <div class="kpi" style="--c:#A55EEA"><b>${best}%</b><span>📝 ${t('bestScore')}（${qh.length} ${S.lang === 'en' ? 'tests' : '次'}）</span></div>
  </div>
  <div class="log-grid" style="margin-top:1rem">
    <div class="grid">
      <div class="card"><h2 style="font-size:1.1rem">👤 ${t('profile')}</h2>
        <form id="pf" class="fields"><label class="field">${t('name')}<input name="name" value="${esc(pf.name)}" autocomplete="name"></label><label class="field">${t('klass')}<input name="klass" value="${esc(pf.klass)}"></label><label class="field">${t('seat')}<input name="seat" value="${esc(pf.seat)}"></label>
        <button class="btn primary small" style="grid-column:1/-1;justify-self:start">💾 ${t('save')}</button></form>
        <p class="muted" style="font-size:.8rem;margin:.6rem 0 0">⏱️ ${S.lang === 'en' ? 'Total reading time' : '累計閱讀時間'}：${fmtDur(totalSec)}・${S.lang === 'en' ? 'Records are stored only in this browser.' : '紀錄只儲存在這台裝置的瀏覽器中。'}</p></div>
      <div class="card"><h2 style="font-size:1.1rem">📊 ${t('chProgress')}</h2><div class="chbars">${C.chapters.map(c => { const n = c.to - c.from + 1, v = visitedIn(c); return `<div style="--c:${c.color}"><span title="${esc(c.zh)}">${c.icon}</span><div class="bar"><i style="width:${v / n * 100}%"></i></div><span class="muted">${v}/${n}${store.chDone[c.id] ? ' ✅' : ''}</span></div>`; }).join('')}</div></div>
      <div class="card"><h2 style="font-size:1.1rem">🧠 ${t('reflect')}</h2><p class="muted" style="font-size:.85rem;margin-top:0">${t('reflectDesc')} <a href="#/page/24">p.24</a></p>
        <form id="rf" class="reflect-q">${['r1', 'r2', 'r3', 'r4', 'r5'].map(k => `<label>${t(k)}<textarea name="${k}" rows="2">${esc(rf[k])}</textarea></label>`).join('')}<button class="btn blue small" style="justify-self:start">💾 ${t('save')}</button></form></div>
    </div>
    <div class="grid" style="align-content:start">
      <div class="card"><h2 style="font-size:1.1rem">⬇️ ${t('download')}</h2><div class="row"><button class="btn primary small" data-dl="html">📄 ${t('dlHTML')}</button><button class="btn green small" data-dl="csv">📊 ${t('dlCSV')}</button><button class="btn ghost small" data-dl="json">🧾 ${t('dlJSON')}</button><button class="btn ghost small" id="clr">🗑️ ${t('clearLog')}</button></div></div>
      <div class="card"><div class="row" style="justify-content:space-between"><h2 style="font-size:1.1rem;margin:0">🕘 ${t('timeline')}（${LOG.length}）</h2>
        <div class="seg">${[['all', 'evAll'], ['read', 'evRead'], ['practice', 'evPractice'], ['quiz', 'evQuiz'], ['other', 'evOther']].map(([k, l]) => `<button class="${filter === k ? 'on' : ''}" data-f="${k}">${t(l)}</button>`).join('')}</div></div>
        ${list.length ? `<ol class="tl" style="margin-top:.8rem">${list.slice(0, 300).map(l => `<li data-e="${EV[l.type] || '⭐'}"><time>${fmtTime(l.ts)}</time>${esc(l.text)}</li>`).join('')}</ol>` : `<p class="muted center">${t('empty')}</p>`}</div>
    </div>
  </div>`;
  $('#pf').onsubmit = e => { e.preventDefault(); const f = new FormData(e.target); store.profile = { name: f.get('name').trim(), klass: f.get('klass').trim(), seat: f.get('seat').trim() }; persist(); logEvent('other', `更新學習者資料：${store.profile.name || '（未填姓名）'}`); toast('💾 ' + t('saved')); sfx.ok(); };
  $('#rf').onsubmit = e => { e.preventDefault(); const f = new FormData(e.target); ['r1', 'r2', 'r3', 'r4', 'r5'].forEach(k => store.reflect[k] = f.get(k)); store.reflect.ts = Date.now(); persist(); logEvent('other', '儲存後設認知反思'); toast('💾 ' + t('saved')); sfx.ok(); logView(filter); };
  $$('[data-f]').forEach(b => b.onclick = () => { sfx.click(); logView(b.dataset.f); });
  $$('[data-dl]').forEach(b => b.onclick = () => download(b.dataset.dl));
  $('#clr').onclick = () => { if (confirm(t('clearConfirm'))) { LOG = []; save(KEY.log, LOG); store = { visited: {}, chDone: {}, profile: store.profile, reflect: {}, best: {}, quizHist: [], time: {}, last: 1 }; persist(); sfx.bad(); logView(); } };
}
function download(kind) {
  const pf = store.profile, d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const base = `學習歷程_${pf.name || '學習者'}_${stamp}`;
  const TYPE = { read: '閱讀', practice: '練習', quiz: '測驗', search: '檢索', other: '其他' };
  let blob, name;
  if (kind === 'csv') {
    const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const rows = [['時間', '類型', '內容', '分數(%)', '秒數'].map(q).join(',')].concat(LOG.map(l => [fmtTime(l.ts), TYPE[l.type] || l.type, l.text, l.pct ?? '', l.sec ?? ''].map(q).join(',')));
    blob = new Blob(['\ufeff' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }); name = base + '.csv';
  } else if (kind === 'json') {
    blob = new Blob([JSON.stringify({ site: '生成式AI輔助學生學習', exported: d.toISOString(), profile: pf, summary: summary(), reflect: store.reflect, quizHistory: store.quizHist, practiceBest: store.best, visitedPages: Object.keys(store.visited).map(Number).sort((a, b) => a - b), log: LOG }, null, 2)], { type: 'application/json' }); name = base + '.json';
  } else {
    blob = new Blob([reportHTML()], { type: 'text/html;charset=utf-8' }); name = base + '.html';
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  logEvent('other', `下載學習歷程（${kind.toUpperCase()}）`); sfx.ok(); toast('⬇️ ' + name);
}
function summary() {
  const qh = store.quizHist;
  return { pagesRead: visitedCount(), totalPages: TOTAL, chaptersDone: Object.keys(store.chDone).length, totalChapters: C.chapters.length, readingSeconds: Object.values(store.time).reduce((a, b) => a + b, 0), quizCount: qh.length, bestQuiz: qh.length ? Math.max(...qh.map(q => q.pct)) : 0, avgQuiz: qh.length ? Math.round(qh.reduce((a, b) => a + b.pct, 0) / qh.length) : 0 };
}
function reportHTML() {
  const pf = store.profile, sm = summary(), rf = store.reflect;
  const TYPE = { read: '閱讀', practice: '練習', quiz: '測驗', search: '檢索', other: '其他' };
  const allP = allPractices();
  return `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>學習歷程報告－${esc(pf.name || '學習者')}</title>
<style>body{font-family:"Microsoft JhengHei","Noto Sans TC",sans-serif;max-width:900px;margin:0 auto;padding:24px;color:#23213A;line-height:1.7;background:#FFF8EE}h1{color:#FF6B6B;margin-bottom:0}h2{border-left:6px solid #A55EEA;padding-left:10px;margin-top:28px}.k{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.k div{background:#fff;border-radius:14px;padding:12px;text-align:center;box-shadow:0 3px 12px rgba(0,0,0,.08)}.k b{display:block;font-size:26px;color:#54A0FF}table{width:100%;border-collapse:collapse;background:#fff;font-size:14px}th,td{border:1px solid #e3ddef;padding:6px 8px;text-align:left;vertical-align:top}th{background:#F3EEFF}.bar{height:10px;background:#eee;border-radius:6px;overflow:hidden}.bar i{display:block;height:100%;background:#1DD1A1}.r{background:#fff;border-radius:12px;padding:10px 14px;margin:8px 0}@media print{body{background:#fff}}</style></head><body>
<h1>📒 學習歷程報告</h1><p>生成式AI輔助學生學習｜姓名：<b>${esc(pf.name || '—')}</b>　班級：<b>${esc(pf.klass || '—')}</b>　座號：<b>${esc(pf.seat || '—')}</b>　匯出時間：${fmtTime(Date.now())}</p>
<div class="k"><div><b>${sm.pagesRead}/${sm.totalPages}</b>已閱讀頁數</div><div><b>${sm.chaptersDone}/${sm.totalChapters}</b>完成章節</div><div><b>${sm.bestQuiz}%</b>最佳測驗</div><div><b>${fmtDur(sm.readingSeconds)}</b>累計閱讀</div></div>
<h2>各章閱讀進度</h2><table><tr><th>章節</th><th style="width:40%">進度</th><th>頁數</th><th>完成</th><th>閱讀時間</th></tr>${C.chapters.map(c => { const n = c.to - c.from + 1, v = visitedIn(c); return `<tr><td>${c.icon} ${c.id}. ${esc(c.zh)}</td><td><div class="bar"><i style="width:${v / n * 100}%"></i></div></td><td>${v}/${n}</td><td>${store.chDone[c.id] ? '✅ ' + fmtTime(store.chDone[c.id]) : ''}</td><td>${store.time[c.id] ? fmtDur(store.time[c.id]) : ''}</td></tr>`; }).join('')}</table>
<h2>測驗紀錄</h2>${store.quizHist.length ? `<table><tr><th>時間</th><th>測驗</th><th>答對</th><th>分數</th><th>用時</th></tr>${store.quizHist.map(q => `<tr><td>${fmtTime(q.ts)}</td><td>${esc(q.name)}</td><td>${q.right}/${q.total}</td><td>${q.pct}%</td><td>${fmtDur(q.sec || 0)}</td></tr>`).join('')}</table>` : '<p>尚無測驗紀錄。</p>'}
<h2>練習最佳成績</h2>${Object.keys(store.best).length ? `<table><tr><th>練習</th><th>最佳分數</th></tr>${Object.entries(store.best).map(([k, v]) => `<tr><td>${esc(allP.find(p => p.id === k)?.zh || k)}</td><td>${v}%</td></tr>`).join('')}</table>` : '<p>尚無練習紀錄。</p>'}
<h2>後設認知反思</h2>${['r1', 'r2', 'r3', 'r4', 'r5'].map(k => `<div class="r"><b>${I18N.zh[k]}</b><br>${esc(rf[k] || '（未填寫）').replace(/\n/g, '<br>')}</div>`).join('')}
<h2>學習紀錄（${LOG.length} 筆）</h2><table><tr><th style="width:150px">時間</th><th style="width:60px">類型</th><th>內容</th></tr>${LOG.slice().reverse().map(l => `<tr><td>${fmtTime(l.ts)}</td><td>${TYPE[l.type] || l.type}</td><td>${esc(l.text)}</td></tr>`).join('')}</table>
</body></html>`;
}

/* ---------- 彩帶動畫 ---------- */
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('#confetti'), ctx = cv.getContext('2d'); cv.width = innerWidth; cv.height = innerHeight;
  const cols = ['#FF6B6B', '#FF9F43', '#FECA57', '#1DD1A1', '#00C2D1', '#54A0FF', '#A55EEA', '#FF6FB5'];
  const ps = Array.from({ length: 160 }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 200, y: innerHeight * .35, vx: (Math.random() - .5) * 16, vy: Math.random() * -14 - 4, s: Math.random() * 8 + 5, c: cols[Math.random() * cols.length | 0], r: Math.random() * 6, vr: (Math.random() - .5) * .3 }));
  let f = 0; const step = () => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ps.forEach(p => { p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); });
    if (++f < 150) requestAnimationFrame(step); else ctx.clearRect(0, 0, cv.width, cv.height);
  };
  step();
}

/* ---------- 鍵盤 ---------- */
document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (e.key === 'Escape') { $$('.modal, .lightbox').forEach(m => m.hidden = true); closeSide(); return; }
  if (!$('#lightbox').hidden) { if (e.key === 'ArrowLeft') $('#lbPrev').click(); if (e.key === 'ArrowRight') $('#lbNext').click(); return; }
  if (typing) return;
  if (e.key === '/') { e.preventDefault(); qs.focus(); return; }
  if (location.hash.startsWith('#/page/')) { if (e.key === 'ArrowLeft') $('#pPrev')?.click(); if (e.key === 'ArrowRight') $('#pNext')?.click(); }
});
/* 一般按鈕點擊音效 */
document.addEventListener('click', e => { if (e.target.closest('a.btn, .ch-card, .feature, .side-list a, .topnav a, .bottomnav a, .thumb, .res')) sfx.click(); }, true);

/* ---------- 啟動 ---------- */
applySettings();
if (!LOG.length || Date.now() - LOG[LOG.length - 1].ts > 30 * 60 * 1000) logEvent('other', '進入網站開始學習');
route();
})();
