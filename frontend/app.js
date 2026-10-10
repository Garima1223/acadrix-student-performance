'use strict';
/* =========================================================
   Acadrix — Student Performance Prediction System (frontend)
   - Two portals: Teacher (manages everything) and Student
   - All data lives in the Flask backend (backend/app.py); this file
     talks to it through api(). Predictions come from the trained
     model (ml/train.py) via /api/predict.
   ========================================================= */

/* ---------- Config ---------- */
const THEMES = {
  luna:   { name: 'Luna',   hi: '#A7EBF2', accent: '#54ACBF', lo: '#26658C',
            series: ['#A7EBF2', '#7fd3e0', '#54ACBF', '#3d8fb0', '#26658C', '#1b4f7a', '#0f3a66'],
            light: { hi: '#023859', accent: '#26658C', lo: '#54ACBF', series: ['#011C40', '#023859', '#26658C', '#3d8fb0', '#54ACBF', '#7fd3e0', '#A7EBF2'] } },
  sunset: { name: 'Sunset', hi: '#FFBB94', accent: '#DC586D', lo: '#A33757',
            series: ['#FFBB94', '#FB9590', '#f07a80', '#DC586D', '#bf4762', '#A33757', '#852E4E'],
            light: { hi: '#852E4E', accent: '#DC586D', lo: '#FB9590', series: ['#4C1D3D', '#852E4E', '#A33757', '#DC586D', '#f07a80', '#FB9590', '#FFBB94'] } },
  forest: { name: 'Forest', hi: '#DAF1DE', accent: '#8EB69B', lo: '#235347',
            series: ['#DAF1DE', '#b5d6bd', '#8EB69B', '#6e9c80', '#4f8068', '#356856', '#235347'],
            light: { hi: '#163832', accent: '#235347', lo: '#8EB69B', series: ['#051F20', '#163832', '#235347', '#356856', '#4f8068', '#8EB69B', '#b5d6bd'] } },
};

const SUBJECTS = ['Mathematics', 'Physics', 'Programming', 'DBMS', 'English'];

const DEMO = {
  student: { username: 'STU101', password: 'student@123' },
  teacher: { username: 'teacher', password: 'teacher@123' },
};

const FEATURES = [
  { key: 'attendance', label: 'Attendance',              unit: '%', min: 0, max: 100 },
  { key: 'assignment', label: 'Assignment Score',        unit: '',  min: 0, max: 100 },
  { key: 'internal',   label: 'Internal Assessment',     unit: '',  min: 0, max: 100 },
  { key: 'prevScore',  label: 'Previous Sem Score',      unit: '',  min: 0, max: 100 },
  { key: 'studyHours', label: 'Study Hours / Week',      unit: 'h', min: 0, max: 30 },
];

/* ---------- Predictions (served by the trained model) ---------- */
const predCache = new Map();
const fkey = f => FEATURES.map(x => Math.round(f[x.key])).join(',');
const cachePrediction = (f, p) => predCache.set(fkey(f), p);
async function predictMany(list) {
  const missing = [...new Map(list.filter(f => !predCache.has(fkey(f))).map(f => [fkey(f), f])).values()];
  if (missing.length) {
    const features = missing.map(f => Object.fromEntries(FEATURES.map(x => [x.key, Math.round(f[x.key])])));
    const { predictions } = await api('/api/predict', { method: 'POST', body: { features } });
    missing.forEach((f, i) => cachePrediction(f, predictions[i]));
  }
  return list.map(f => predCache.get(fkey(f)));
}
// Synchronous read of a prediction a view has already loaded with predictMany().
function predict(f) {
  const p = predCache.get(fkey(f));
  if (!p) throw new Error('Prediction not loaded yet.');
  return p;
}
const modelName = () => state.model?.deployed || 'trained';
const bestModel = () => state.model?.models?.find(m => m.name === state.model.deployed);
const gradeOf = s => s >= 90 ? 'O' : s >= 80 ? 'A+' : s >= 70 ? 'A' : s >= 60 ? 'B+' : s >= 50 ? 'B' : s >= 40 ? 'C' : 'F';
const riskOf = s => s < 50 ? 'High' : s < 65 ? 'Medium' : 'Low';
const GRADES = ['O', 'A+', 'A', 'B+', 'B', 'C', 'F'];

/* ---------- Utils ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const fmt = (n, d = 1) => Number(n).toFixed(d).replace(/\.0$/, '');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = n => n.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const firstName = n => n.replace(/^(Dr|Prof|Mr|Mrs|Ms)\.?\s+/i, '').split(/\s+/)[0];
const internalOf = s => avg(SUBJECTS.map(k => s.marks[k]));
const featuresOf = s => ({ attendance: s.attendance, assignment: s.assignment, internal: Math.round(internalOf(s)), prevScore: s.prevScore, studyHours: s.studyHours });
const predictStudent = s => s.prediction;
// Students only receive their own record, so class figures come from the server's classStats.
const classAvg = sub => state.classStats ? state.classStats.subjectAvg[sub] : avg(state.students.map(s => s.marks[sub]));
const classInternalAvg = () => state.classStats ? state.classStats.internalAvg : avg(state.students.map(internalOf));
const classSize = () => state.classStats ? state.classStats.size : state.students.length;
function quantile(arr, q) {
  const a = [...arr].sort((x, y) => x - y); if (!a.length) return 0;
  const pos = (a.length - 1) * q, b = Math.floor(pos), r = pos - b;
  return a[b + 1] !== undefined ? a[b] + r * (a[b + 1] - a[b]) : a[b];
}
function pearson(x, y) {
  const mx = avg(x), my = avg(y);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < x.length; i++) { num += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

/* ---------- Icons ---------- */
const P = {
  cap: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7"/><path d="M16 4a4 4 0 0 1 0 8"/><path d="M22 21c0-3-2-5.5-4.5-6.5"/>',
  spark: '<path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"/><path d="M19 3v4M17 5h4"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  teacher: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M7 20h10M12 16v4"/><path d="M7 9h6M7 12h4"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/>',
  bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 15h10l1-15"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 21 2M17 6l3 3M14 9l2 2"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a3 3 0 0 1 0 6M18 6a7 7 0 0 1 0 12"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7 15h10"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5M5 21h14"/>',
  flag: '<path d="M4 22V4M4 4h12l-2 4 2 4H4"/>',
  printer: '<path d="M6 9V2h12v7"/><rect x="2" y="9" width="20" height="9" rx="2"/><path d="M6 14h12v8H6z"/>',
  pencil: '<path d="M3 21l3.8-1 11-11-2.8-2.8-11 11z"/><path d="M14 5l2.8 2.8"/>',
};
const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

/* ---------- Storage ---------- */
const store = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const sess = {
  get() { try { return sessionStorage.getItem('acx_token'); } catch { return null; } },
  set(v) { try { sessionStorage.setItem('acx_token', v); } catch { /* ignore */ } },
  clear() { try { sessionStorage.removeItem('acx_token'); } catch { /* ignore */ } },
};

/* ---------- API ---------- */
async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error("Can't reach the Acadrix server. Is it running?");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.session) {
    endSession();
    toast(data.error || 'Please sign in again.', 'error');
  }
  if (!res.ok) throw Object.assign(new Error(data.error || `Something went wrong (${res.status}).`), { status: res.status });
  return data;
}
async function apiBlob(path) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${state.token}` } });
  if (!res.ok) throw new Error('Could not load file.');
  return res.blob();
}

/* ---------- State ---------- */
const state = {
  theme: THEMES[store.get('ep_theme', 'luna')] ? store.get('ep_theme', 'luna') : 'luna',
  mode: ['light', 'dark'].includes(store.get('acx_mode', '')) ? store.get('acx_mode', '')
    : (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'),
  students: [],
  session: null,
  token: sess.get(),
  user: null,
  classStats: null,
  model: null,
  role: 'student',
  view: null,
  query: '',
  riskFilter: 'all',
  predictFor: '',
  pf: null,
  typingTimer: null,
  notices: [],
  attLog: {},
  seen: {},
  attDate: null,
  attSection: 'all',
};
const currentStudent = () => state.session?.role === 'student' ? state.students.find(s => s.id === state.session.id) : null;
const currentTeacher = () => state.session?.role === 'teacher' ? state.user : null;

/* ---------- Theme ---------- */
function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.mode = state.mode;
  if (window.Chart) {
    const light = state.mode === 'light';
    Chart.defaults.color = cssVar('--muted');
    Chart.defaults.borderColor = cssVar('--line');
    Chart.defaults.font.family = "'Outfit', system-ui, sans-serif";
    Chart.defaults.plugins.tooltip.backgroundColor = light ? 'rgba(255,255,255,.96)' : 'rgba(0,0,0,.78)';
    Chart.defaults.plugins.tooltip.titleColor = cssVar('--text');
    Chart.defaults.plugins.tooltip.bodyColor = cssVar('--text');
    Chart.defaults.plugins.tooltip.borderColor = cssVar('--line-strong');
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 10;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
  }
}
function setTheme(t) {
  if (!THEMES[t]) return;
  state.theme = t;
  store.set('ep_theme', t);
  applyTheme();
  $$('.swatch').forEach(s => s.classList.toggle('active', s.dataset.themeSet === t));
  if (state.session) renderView();
}
function toggleMode() {
  state.mode = state.mode === 'light' ? 'dark' : 'light';
  store.set('acx_mode', state.mode);
  applyTheme();
  $$('.mode-toggle').forEach(b => { b.innerHTML = modeIcon(); b.setAttribute('aria-label', modeLabel()); b.title = modeLabel(); });
  if (state.session) renderView();
}
const modeIcon = () => icon(state.mode === 'light' ? 'moon' : 'sun');
const modeLabel = () => `Switch to ${state.mode === 'light' ? 'dark' : 'light'} mode`;
const themeSwitcher = () => `
  <div class="theme-switch" role="group" aria-label="Appearance">
    <button class="mode-toggle" data-mode-toggle title="${modeLabel()}" aria-label="${modeLabel()}">${modeIcon()}</button>
    <span class="theme-sep"></span>
    ${Object.entries(THEMES).map(([k, t]) => `<button class="swatch ${k === state.theme ? 'active' : ''}" data-theme-set="${k}" title="${t.name}" aria-label="${t.name} colours"></button>`).join('')}
  </div>`;

/* ---------- Charts ---------- */
let charts = [];
function destroyCharts() { charts.forEach(c => c.destroy()); charts = []; }
function chart(id, cfg) {
  const el = document.getElementById(id);
  if (!el || !window.Chart) return;
  charts.push(new Chart(el, cfg));
}
const T = () => state.mode === 'light' ? THEMES[state.theme].light : THEMES[state.theme];
const vGrad = (from, to) => ctx => {
  const { chart: c } = ctx; const a = c.chartArea;
  if (!a) return to;
  const g = c.ctx.createLinearGradient(0, a.bottom, 0, a.top);
  g.addColorStop(0, from); g.addColorStop(1, to); return g;
};
const axes = (yMax = 100, xMax) => ({
  x: { grid: { display: false }, ...(xMax ? { min: 0, max: xMax, grid: { color: cssVar('--line') } } : {}) },
  y: { min: 0, max: yMax, grid: { color: cssVar('--line') }, ticks: { stepSize: yMax > 20 ? 20 : 1 } },
});

/* ---------- Toast & modal ---------- */
function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  el.innerHTML = `${icon(type === 'error' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
  $('#toast-root').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 2600);
}
function openModal(html, size = '') {
  $('#modal-root').innerHTML = `<div class="modal-backdrop" data-backdrop><div class="modal glass ${size}" role="dialog" aria-modal="true">${html}</div></div>`;
  const first = $('#modal-root input:not([readonly]), #modal-root button.btn-primary, #modal-root button.btn-danger');
  first && first.focus({ preventScroll: true });
}
function closeModal() { $('#modal-root').innerHTML = ''; }

/* ---------- Shared components ---------- */
const kpi = (ic, label, value, sub, cls = '') => `
  <div class="kpi glass ${cls}"><div class="kpi-ic">${icon(ic)}</div>
    <div><p>${label}</p><b>${value}</b><small>${sub}</small></div></div>`;
const gradeBadge = g => `<span class="badge grade">${g}</span>`;
const riskBadge = r => `<span class="badge risk-${r}">${r} risk</span>`;
function ring(score, size = 180, label = 'Predicted') {
  const r = 70, c = 2 * Math.PI * r, off = c * (1 - clamp(score, 0, 100) / 100);
  return `<div class="ring" style="--size:${size}px">
    <svg viewBox="0 0 180 180"><circle class="ring-track" cx="90" cy="90" r="${r}"/>
    <circle class="ring-val" cx="90" cy="90" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-off="${off}"/></svg>
    <div class="ring-txt"><b>${fmt(score)}</b><span>${label}</span></div></div>`;
}
function animateRings(root = document) {
  requestAnimationFrame(() => requestAnimationFrame(() => $$('.ring-val', root).forEach(el => el.setAttribute('stroke-dashoffset', el.dataset.off))));
}
function sliderGroup(values, prefix) {
  return FEATURES.map(f => {
    const v = values[f.key], p = ((v - f.min) / (f.max - f.min)) * 100;
    return `<div class="slider">
      <div class="slider-top"><label for="${prefix}-${f.key}">${f.label}</label><output id="${prefix}-${f.key}-out">${v}${f.unit}</output></div>
      <input type="range" id="${prefix}-${f.key}" data-key="${f.key}" min="${f.min}" max="${f.max}" step="1" value="${v}" style="--p:${p}%">
    </div>`;
  }).join('');
}
function bindSliders(prefix, values, onChange) {
  FEATURES.forEach(f => {
    const el = $(`#${prefix}-${f.key}`); if (!el) return;
    el.addEventListener('input', () => {
      values[f.key] = Number(el.value);
      el.style.setProperty('--p', `${((el.value - f.min) / (f.max - f.min)) * 100}%`);
      $(`#${prefix}-${f.key}-out`).textContent = el.value + f.unit;
      onChange();
    });
  });
}
function contribBars(c) {
  const max = Math.max(8, ...FEATURES.map(f => Math.abs(c[f.key])));
  return `<div class="contrib">${FEATURES.map(f => {
    const v = c[f.key];
    return `<div class="contrib-row"><span>${f.label}</span>
      <div class="bar ${v < 0 ? 'low' : ''}"><i style="width:${clamp(Math.abs(v) / max * 100, 2, 100)}%"></i></div>
      <span class="${v < 0 ? 'neg' : ''}">${v >= 0 ? '+' : ''}${fmt(v)}</span></div>`;
  }).join('')}</div>`;
}

/* ---------- Login ---------- */
function loginView() {
  const demo = r => {
    const d = DEMO[r];
    return `<button type="button" class="demo-card ${state.role === r ? 'active' : ''}" data-demo="${r}">
      <b>${icon(r === 'teacher' ? 'teacher' : 'user')} Try as ${r === 'teacher' ? 'a teacher' : 'a student'}</b>
      <code><span>user:</span> ${d.username}</code><code><span>pass:</span> ${d.password}</code></button>`;
  };
  return `
  <main class="auth">
    <div class="auth-theme">${themeSwitcher()}</div>
    <section class="auth-card glass card-feature" id="auth-card">
      <div class="auth-hero">
        <div class="brand"><img class="brand-logo" src="assets/logo.png" alt=""><span>Acadrix</span></div>
        <figure class="hero-mascot" aria-hidden="true">
          <span class="mascot-bubble">Hi! I'm Drix. Ask me anything!</span>
          <img src="assets/mascot.png" alt="">
        </figure>
        <h1>Welcome to<br><span class="hl">Acadrix</span></h1>
        <p class="typing">Let's understand your <span id="typed"></span><span class="caret"></span></p>
        <p class="muted">A friendly space for students and teachers to follow progress, spot problems early and plan what comes next.</p>
        <ul class="feat">
          <li><span class="dot">${icon('spark')}</span><div>See where you're heading<small>Your marks, attendance and habits turned into a clear forecast</small></div></li>
          <li><span class="dot">${icon('users')}</span><div>Nobody slips through the cracks<small>Teachers see who needs support before exams, not after</small></div></li>
          <li><span class="dot">${icon('bulb')}</span><div>Advice that fits you<small>Small, specific steps instead of generic tips</small></div></li>
        </ul>
        <p class="auth-foot">AIML Summer Internship 2026 · IIHMF, MNNIT Allahabad · Demo data stays in this browser.</p>
      </div>

      <div class="auth-form">
        <div class="role-switch" data-role="${state.role}">
          <span class="pill-bg"></span>
          <button type="button" data-role="student" class="${state.role === 'student' ? 'active' : ''}">${icon('user')} Student</button>
          <button type="button" data-role="teacher" class="${state.role === 'teacher' ? 'active' : ''}">${icon('teacher')} Teacher</button>
        </div>
        <div>
          <h2 id="form-title">${loginCopy(state.role).title}</h2>
        </div>
        <p class="sub" id="form-sub">${loginCopy(state.role).sub}</p>
        <form id="login-form" novalidate>
          <div style="display:grid;gap:16px">
            <label class="field"><span id="lg-user-label">${loginCopy(state.role).user}</span>
              <div class="input-wrap">${icon('user')}<input id="lg-user" autocomplete="username" placeholder="${loginCopy(state.role).ph}" required></div>
            </label>
            <label class="field">Password
              <div class="input-wrap">${icon('lock')}<input id="lg-pass" type="password" autocomplete="current-password" placeholder="Your password" required>
                <button type="button" class="eye" id="lg-eye" aria-label="Show password">${icon('eye')}</button></div>
            </label>
            <p class="form-error" id="lg-err"></p>
            <button class="btn btn-primary btn-block" type="submit">Sign in ${icon('arrow')}</button>
            <p class="form-hint" id="lg-hint">${loginCopy(state.role).hint}</p>
          </div>
        </form>
        <div class="demo">
          <p class="demo-title">${icon('key')} Just looking around? Use a demo account</p>
          <div class="demo-cards">${demo('student')}${demo('teacher')}</div>
          <p class="demo-note">Tap a card to fill it in. Every demo student (STU101 – STU112) uses <b>student@123</b>.</p>
        </div>
      </div>
    </section>
  </main>`;
}

function loginCopy(r) {
  return r === 'teacher'
    ? { title: 'Good to see you again', sub: 'Sign in to check on your class and plan the week ahead.', user: 'Username', ph: 'e.g. teacher', hint: 'Trouble signing in? Contact the department office.' }
    : { title: 'Hey, welcome back', sub: 'Sign in to see how you\'re doing and what to focus on next.', user: 'Student ID', ph: 'e.g. STU101', hint: 'Forgot your password? Your class teacher can reset it for you.' };
}
function bindLogin() {
  const setRole = r => {
    state.role = r;
    $('.role-switch').dataset.role = r;
    $$('.role-switch button').forEach(b => b.classList.toggle('active', b.dataset.role === r));
    $$('.demo-card').forEach(c => c.classList.toggle('active', c.dataset.demo === r));
    const c = loginCopy(r);
    $('#form-title').textContent = c.title;
    $('#form-sub').textContent = c.sub;
    $('#lg-user-label').textContent = c.user;
    $('#lg-user').placeholder = c.ph;
    $('#lg-hint').textContent = c.hint;
    $('#lg-err').textContent = '';
  };
  $$('.role-switch button').forEach(b => b.addEventListener('click', () => setRole(b.dataset.role)));
  $$('.demo-card').forEach(c => c.addEventListener('click', () => {
    const r = c.dataset.demo; setRole(r);
    $('#lg-user').value = DEMO[r].username;
    $('#lg-pass').value = DEMO[r].password;
    $('#login-form .btn-primary').classList.remove('pulse'); void c.offsetWidth;
    $('#login-form .btn-primary').classList.add('pulse');
  }));
  $('#lg-eye').addEventListener('click', () => {
    const p = $('#lg-pass'), show = p.type === 'password';
    p.type = show ? 'text' : 'password';
    $('#lg-eye').innerHTML = icon(show ? 'eyeOff' : 'eye');
    $('#lg-eye').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const u = $('#lg-user').value.trim(), p = $('#lg-pass').value;
    const fail = msg => {
      $('#lg-err').textContent = msg;
      const card = $('#auth-card'); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
    };
    if (!u || !p) return fail(`Please fill in both your ${state.role === 'teacher' ? 'username' : 'student ID'} and password.`);
    const btn = $('#login-form .btn-primary');
    btn.disabled = true;
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: { role: state.role, username: u, password: p } });
      state.token = r.token; sess.set(r.token);
      clearTimeout(state.typingTimer);
      state.view = null;
      await loadSession();
      toast(`Welcome back, ${firstName(state.user.name)}!`);
    } catch (err) {
      fail(err.status === 401
        ? `Hmm, that ${state.role === 'teacher' ? 'username' : 'student ID'} and password don't match. Double-check them, or try a demo account below.`
        : err.message);
    } finally {
      btn.disabled = false;
    }
  });
  startTyping();
}

function startTyping() {
  clearTimeout(state.typingTimer);
  const words = ['progress.', 'strengths.', 'next steps.', 'potential.'];
  let w = 0, i = 0, del = false;
  const tick = () => {
    const el = $('#typed'); if (!el) return;
    const word = words[w];
    el.textContent = word.slice(0, i);
    if (!del && i === word.length) { del = true; state.typingTimer = setTimeout(tick, 1400); return; }
    if (del && i === 0) { del = false; w = (w + 1) % words.length; }
    i += del ? -1 : 1;
    state.typingTimer = setTimeout(tick, del ? 45 : 95);
  };
  tick();
}

async function loadSession() {
  const d = await api('/api/bootstrap');
  state.session = { role: d.role, id: d.role === 'teacher' ? d.user.username : d.user.id };
  Object.assign(state, { user: d.user, classStats: d.classStats || null, notices: d.notices, attLog: d.attLog || {}, model: d.model });
  state.seen = d.role === 'student' ? { [d.user.id]: d.notices.filter(n => n.seen).map(n => n.id) } : {};
  predCache.clear();
  setStudents(d.students);
  render();
}
function setStudents(list) {
  state.students = list;
  list.forEach(s => cachePrediction(featuresOf(s), s.prediction));
}
function upsertLocal(student) {
  const i = state.students.findIndex(x => x.id === student.id);
  if (i >= 0) state.students[i] = student; else state.students.push(student);
  cachePrediction(featuresOf(student), student.prediction);
}
function endSession() {
  Object.assign(state, { session: null, token: null, user: null, students: [], classStats: null, notices: [], attLog: {}, seen: {}, pf: null, predictFor: '', view: null });
  sess.clear(); closeModal(); render();
}
function logout() {
  api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  endSession();
  toast("You've signed out. See you soon!");
}

/* ---------- Shell ---------- */
const NAV = {
  teacher: [
    { id: 'dashboard', icon: 'home', label: 'Dashboard', title: 'Teacher Dashboard' },
    { id: 'students', icon: 'users', label: 'Manage Students', title: 'Manage Students' },
    { id: 'attendance', icon: 'calendar', label: 'Attendance', title: 'Attendance Register' },
    { id: 'predict', icon: 'spark', label: 'Predict', title: 'Predict Performance' },
    { id: 'models', icon: 'flask', label: 'Model Lab', title: 'Model Lab' },
    { id: 'analytics', icon: 'chart', label: 'EDA & Analytics', title: 'EDA & Analytics' },
    { id: 'notices', icon: 'megaphone', label: 'Announcements', title: 'Announcements' },
  ],
  student: [
    { id: 'overview', icon: 'home', label: 'Overview', title: 'My Overview' },
    { id: 'performance', icon: 'book', label: 'Performance', title: 'Subject Performance' },
    { id: 'whatif', icon: 'sliders', label: 'What-If', title: 'What-If Simulator' },
    { id: 'goals', icon: 'flag', label: 'Goals', title: 'My Goals' },
    { id: 'tips', icon: 'bulb', label: 'Tips', title: 'Improvement Tips' },
    { id: 'notices', icon: 'bell', label: 'Notices', title: 'Announcements' },
    { id: 'profile', icon: 'user', label: 'Profile', title: 'My Profile' },
  ],
};

function render() {
  destroyCharts();
  applyTheme();
  const app = $('#app');
  chat.refresh();
  if (!state.session) { app.innerHTML = loginView(); bindLogin(); return; }

  const role = state.session.role, nav = NAV[role];
  if (!nav.some(n => n.id === state.view)) state.view = nav[0].id;
  const who = role === 'teacher' ? currentTeacher() : currentStudent();
  app.innerHTML = `
  <div class="shell">
    <div class="rail-wrap">
      <nav class="rail glass" aria-label="Main">
        <div class="rail-logo"><img class="brand-logo" src="assets/logo.png" alt="Acadrix"></div>
        ${nav.map(n => `<button class="rail-btn" data-nav="${n.id}" data-label="${n.label}" aria-label="${n.label}">${icon(n.icon)}<span class="rail-badge" hidden></span></button>`).join('')}
        <span class="rail-sep"></span>
        <button class="rail-btn logout" data-action="logout" data-label="Logout" aria-label="Logout">${icon('logout')}</button>
      </nav>
    </div>
    <main class="main">
      <header class="topbar">
        <div><p class="eyebrow">${greet()}, ${esc(firstName(who.name))} · ${role === 'teacher' ? 'Teacher' : 'Student'} portal</p><h1 id="view-title"></h1></div>
        <div class="top-right">
          ${themeSwitcher()}
          <div class="user-chip"><span class="avatar">${initials(who.name)}</span>
            <div><b>${esc(who.name)}</b><small>${role === 'teacher' ? esc(who.dept) : esc(who.id)}</small></div></div>
        </div>
      </header>
      <div id="view"></div>
    </main>
  </div>`;
  renderView();
}

function go(view) { state.view = view; renderView(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

let viewSeq = 0;
async function renderView() {
  destroyCharts();
  const role = state.session.role, nav = NAV[role].find(n => n.id === state.view);
  $$('.rail-btn[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === state.view));
  $('#view-title').textContent = nav.title;
  const v = VIEWS[role][state.view];
  const host = $('#view'), seq = ++viewSeq;
  if (v.load) {
    host.innerHTML = '<p class="loading">Just a moment…</p>';
    try { await v.load(); } catch (e) { if (seq === viewSeq) host.innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
    if (seq !== viewSeq || !state.session) return;
  }
  host.className = 'view'; void host.offsetWidth;
  host.innerHTML = v.html();
  v.mount && v.mount();
  animateRings(host);
  updateBadges();
}

/* =========================================================
   TEACHER VIEWS
   ========================================================= */
const withPred = () => state.students.map(s => ({ s, p: predictStudent(s) }));

const teacherDashboard = {
  html() {
    const rows = withPred();
    const high = rows.filter(r => r.p.risk === 'High').length;
    const top = [...rows].sort((a, b) => b.p.score - a.p.score).slice(0, 5);
    const attention = rows.filter(r => r.p.risk !== 'Low').sort((a, b) => a.p.score - b.p.score).slice(0, 5);
    const item = r => `<div class="list-item"><span class="avatar sm">${initials(r.s.name)}</span>
      <div class="grow"><b>${esc(r.s.name)}</b><small>${esc(r.s.id)} · Sec ${esc(r.s.section)} · Att ${r.s.attendance}%</small></div>
      ${r.p.risk !== 'Low' ? riskBadge(r.p.risk) : gradeBadge(r.p.grade)}<span class="score">${fmt(r.p.score)}</span></div>`;
    return `
    <section class="grid kpis">
      ${kpi('users', 'Total Students', rows.length, 'Sections A & B')}
      ${kpi('clock', 'Avg Attendance', fmt(avg(state.students.map(s => s.attendance))) + '%', 'Across all students')}
      ${kpi('target', 'Avg Predicted Score', fmt(avg(rows.map(r => r.p.score))), 'Out of 100')}
      ${kpi('alert', 'High-Risk Students', high, 'Predicted below 50', high ? 'warn' : '')}
    </section>
    <section class="grid two">
      <div class="card glass"><div class="card-head"><div><h3>Subject-wise Class Average</h3><p>Internal assessment marks</p></div></div>
        <div class="chart-box"><canvas id="c-subj"></canvas></div></div>
      <div class="card glass"><div class="card-head"><div><h3>Predicted Grade Distribution</h3><p>From the ${esc(modelName())} model</p></div></div>
        <div class="chart-box"><canvas id="c-grade"></canvas></div></div>
    </section>
    <section class="grid two">
      <div class="card glass"><div class="card-head"><div><h3>Top Performers</h3><p>Highest predicted scores</p></div>
        <button class="btn btn-ghost btn-sm" data-nav="students">View all ${icon('arrow')}</button></div>
        <div class="list">${top.map(item).join('') || '<p class="empty">No students yet.</p>'}</div></div>
      <div class="card glass"><div class="card-head"><div><h3>Needs Attention</h3><p>Medium & high risk students</p></div>
        <button class="btn btn-primary btn-sm" data-nav="predict">${icon('spark')} Predict</button></div>
        <div class="list">${attention.map(item).join('') || '<p class="empty">Great — no students at risk!</p>'}</div></div>
    </section>`;
  },
  mount() {
    const t = T(), rows = withPred();
    chart('c-subj', {
      type: 'bar',
      data: { labels: SUBJECTS, datasets: [{ label: 'Class average', data: SUBJECTS.map(s => +fmt(classAvg(s))), backgroundColor: vGrad(hexA(t.lo, .6), t.hi), borderRadius: 10, maxBarThickness: 44 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: axes(100) },
    });
    const counts = GRADES.map(g => rows.filter(r => r.p.grade === g).length);
    chart('c-grade', {
      type: 'doughnut',
      data: { labels: GRADES.map(g => `Grade ${g}`), datasets: [{ data: counts, backgroundColor: t.series, borderColor: cssVar('--bg'), borderWidth: 3, hoverOffset: 10 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '64%', plugins: { legend: { position: 'right' } } },
    });
  },
};

/* ---- Manage students ---- */
function filteredRows() {
  const q = state.query.toLowerCase();
  return withPred().filter(({ s, p }) =>
    (!q || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)) &&
    (state.riskFilter === 'all' || p.risk === state.riskFilter));
}
function studentRowsHtml() {
  const rows = filteredRows();
  if (!rows.length) return `<tr><td colspan="9"><p class="empty">No students match your search.</p></td></tr>`;
  return rows.map(({ s, p }) => `<tr>
    <td><div class="cell-name"><span class="avatar sm">${initials(s.name)}</span><div><b>${esc(s.name)}</b><small>${esc(s.id)}</small></div></div></td>
    <td>${esc(s.section)}</td>
    <td><div class="mini-bar"><div class="bar ${s.attendance < 75 ? 'low' : ''}"><i style="width:${s.attendance}%"></i></div>${s.attendance}%</div></td>
    <td>${s.assignment}</td>
    <td>${fmt(internalOf(s))}</td>
    <td>${s.studyHours}h</td>
    <td><b style="color:var(--accent-hi)">${fmt(p.score)}</b> ${gradeBadge(p.grade)}</td>
    <td>${riskBadge(p.risk)}</td>
    <td><div class="actions">
      <button class="icon-btn" data-action="predict-for" data-id="${esc(s.id)}" title="Predict" aria-label="Predict for ${esc(s.name)}">${icon('spark')}</button>
      <button class="icon-btn" data-action="report" data-id="${esc(s.id)}" title="Report card" aria-label="Report card for ${esc(s.name)}">${icon('file')}</button>
      <button class="icon-btn" data-action="edit-student" data-id="${esc(s.id)}" title="Edit" aria-label="Edit ${esc(s.name)}">${icon('edit')}</button>
      <button class="icon-btn danger" data-action="delete-student" data-id="${esc(s.id)}" title="Delete" aria-label="Delete ${esc(s.name)}">${icon('trash')}</button>
    </div></td></tr>`).join('');
}
const teacherStudents = {
  html() {
    return `
    <div class="card glass">
      <div class="toolbar">
        <div class="input-wrap">${icon('search')}<input id="stu-search" placeholder="Search by name or student ID…" value="${esc(state.query)}"></div>
        <select class="select" id="stu-risk" aria-label="Filter by risk">
          ${['all', 'High', 'Medium', 'Low'].map(r => `<option value="${r}" ${state.riskFilter === r ? 'selected' : ''}>${r === 'all' ? 'All risk levels' : r + ' risk'}</option>`).join('')}
        </select>
        <button class="btn btn-ghost" data-action="import">${icon('upload')} Import CSV</button>
        <button class="btn btn-ghost" data-action="export">${icon('download')} Export CSV</button>
        <button class="btn btn-ghost" data-action="reset-data" title="Restore the demo dataset">${icon('refresh')} Reset</button>
        <button class="btn btn-primary" data-action="add-student">${icon('plus')} Add Student</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Student</th><th>Sec</th><th>Attendance</th><th>Assignment</th><th>Internal</th><th>Study</th><th>Predicted</th><th>Risk</th><th>Actions</th></tr></thead>
        <tbody id="stu-tbody">${studentRowsHtml()}</tbody>
      </table></div>
    </div>`;
  },
  mount() {
    $('#stu-search').addEventListener('input', e => { state.query = e.target.value; $('#stu-tbody').innerHTML = studentRowsHtml(); });
    $('#stu-risk').addEventListener('change', e => { state.riskFilter = e.target.value; $('#stu-tbody').innerHTML = studentRowsHtml(); });
  },
};

function nextId() {
  const nums = state.students.map(s => parseInt(s.id.replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
  return 'STU' + (nums.length ? Math.max(...nums) + 1 : 101);
}
function openStudentModal(id) {
  const isEdit = !!id;
  const s = isEdit ? state.students.find(x => x.id === id) : {
    id: nextId(), name: '', section: 'A', attendance: 75, assignment: 70, prevScore: 65, studyHours: 10,
    marks: Object.fromEntries(SUBJECTS.map(k => [k, 65])),
  };
  if (!s) return;
  const num = (name, label, v, max = 100) => `<label class="field">${label}<input class="input" type="number" name="${name}" min="0" max="${max}" value="${v}" required></label>`;
  openModal(`
    <form id="stu-form" novalidate>
      <div class="modal-head"><h3>${isEdit ? 'Edit' : 'Add'} Student</h3>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Close">${icon('x')}</button></div>
      <div class="form-grid">
        <label class="field">Student ID (username)<input class="input" name="id" value="${esc(s.id)}" ${isEdit ? 'readonly' : ''} required></label>
        <label class="field">Full Name<input class="input" name="name" value="${esc(s.name)}" placeholder="e.g. Riya Kapoor" required></label>
        <label class="field">Section<select class="select" name="section">${['A', 'B', 'C'].map(x => `<option ${s.section === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        ${num('attendance', 'Attendance (%)', s.attendance)}
        ${num('assignment', 'Assignment Score', s.assignment)}
        ${num('prevScore', 'Previous Sem Score', s.prevScore)}
        ${num('studyHours', 'Study Hours / Week', s.studyHours, 30)}
        <label class="field">${isEdit ? 'New password' : 'Password'}<input class="input" name="password" value="${isEdit ? '' : 'student@123'}" placeholder="${isEdit ? 'Leave blank to keep it' : ''}" autocomplete="new-password"></label>
      </div>
      <p class="form-sub">Internal assessment marks (out of 100)</p>
      <div class="form-grid five">${SUBJECTS.map((sub, i) => num('m' + i, sub, s.marks[sub])).join('')}</div>
      <p class="form-error" id="stu-err"></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">${icon('check')} ${isEdit ? 'Save Changes' : 'Add Student'}</button>
      </div>
    </form>`);
  $('#stu-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target), g = k => String(fd.get(k) ?? '').trim();
    const err = m => { $('#stu-err').textContent = m; };
    const sid = isEdit ? s.id : g('id').toUpperCase();
    if (!/^[A-Z0-9_-]{3,20}$/.test(sid)) return err('Student ID must be 3–20 letters/numbers.');
    if (!isEdit && state.students.some(x => x.id.toLowerCase() === sid.toLowerCase())) return err('That Student ID already exists.');
    if (!g('name')) return err('Please enter the student name.');
    if ((!isEdit || g('password')) && g('password').length < 6) return err('Password must be at least 6 characters.');
    const n = (k, max = 100) => { const v = Number(g(k)); return g(k) !== '' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null; };
    const vals = { attendance: n('attendance'), assignment: n('assignment'), prevScore: n('prevScore'), studyHours: n('studyHours', 30) };
    const marks = Object.fromEntries(SUBJECTS.map((sub, i) => [sub, n('m' + i)]));
    if (Object.values(vals).includes(null) || Object.values(marks).includes(null)) return err('All scores must be numbers between 0 and 100 (study hours 0–30).');
    const btn = $('#stu-form .btn-primary');
    btn.disabled = true;
    try {
      const payload = { id: sid, name: g('name'), section: g('section'), ...vals, marks, password: g('password') };
      const { student } = await api(isEdit ? `/api/students/${encodeURIComponent(s.id)}` : '/api/students', { method: isEdit ? 'PUT' : 'POST', body: payload });
      upsertLocal(student); closeModal(); renderView();
      toast(isEdit ? `${student.name}'s details are up to date.` : `${student.name} has been added.`);
    } catch (x) {
      err(x.message); btn.disabled = false;
    }
  });
}
function confirmDelete(id) {
  const s = state.students.find(x => x.id === id); if (!s) return;
  openModal(`
    <div class="modal-head"><h3>Delete student?</h3><button class="icon-btn" data-action="close-modal" aria-label="Close">${icon('x')}</button></div>
    <p class="muted">This will remove <b style="color:var(--text)">${esc(s.name)}</b> (${esc(s.id)}) and all their records. They will no longer be able to log in.</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button class="btn btn-danger" data-action="confirm-delete" data-id="${esc(s.id)}">${icon('trash')} Delete</button>
    </div>`, 'sm');
}
function exportCSV() {
  const head = ['id', 'name', 'section', 'attendance', 'assignment', ...SUBJECTS, 'internal_avg', 'prev_score', 'study_hours', 'predicted_score', 'grade', 'risk'];
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  const lines = withPred().map(({ s, p }) => [s.id, s.name, s.section, s.attendance, s.assignment, ...SUBJECTS.map(k => s.marks[k]), fmt(internalOf(s)), s.prevScore, s.studyHours, p.score, p.grade, p.risk].map(q).join(','));
  const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'student_performance.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('CSV exported.');
}

/* ---- Predict ---- */
function resultHtml(p) {
  return `${ring(p.score, 190, 'Predicted Score')}
    <div class="result-meta">${gradeBadge('Grade ' + p.grade)} ${riskBadge(p.risk)}</div>
    ${contribBars(p.contributions)}`;
}
const teacherPredict = {
  async load() {
    if (!state.pf || state.pf._for !== state.predictFor) {
      const s = state.students.find(x => x.id === state.predictFor);
      state.pf = { ...(s ? featuresOf(s) : { attendance: 75, assignment: 70, internal: 65, prevScore: 65, studyHours: 10 }), _for: state.predictFor };
    }
    await predictMany([state.pf]);
  },
  html() {
    return `
    <section class="grid split">
      <div class="card glass">
        <div class="card-head"><div><h3>Input Features</h3><p>Pick a student or enter custom values</p></div></div>
        <label class="field" style="margin-bottom:20px">Student
          <select class="select" id="pf-student">
            <option value="">— Custom input —</option>
            ${state.students.map(s => `<option value="${esc(s.id)}" ${s.id === state.predictFor ? 'selected' : ''}>${esc(s.id)} · ${esc(s.name)}</option>`).join('')}
          </select></label>
        <div class="sliders">${sliderGroup(state.pf, 'pf')}</div>
        <div class="hero-actions" style="margin-top:24px">
          <button class="btn btn-primary" id="pf-run">${icon('spark')} Run Prediction</button>
          <button class="btn btn-ghost" id="pf-reset">${icon('refresh')} Reset</button>
        </div>
      </div>
      <div class="card glass card-feature">
        <div class="card-head"><div><h3>Prediction Result</h3><p>How each factor moves the score vs. an average student</p></div></div>
        <div class="result" id="pf-result">${resultHtml(predict(state.pf))}</div>
        <p class="model-note" style="margin-top:18px">Model: <b>${esc(modelName())}</b>${bestModel() ? ` — on students it never saw during training it scored R² ${bestModel().r2.toFixed(2)}, with a typical error of ±${bestModel().mae.toFixed(1)} marks` : ''}.</p>
      </div>
    </section>`;
  },
  mount() {
    let seq = 0;
    const update = async (animate = false) => {
      const my = ++seq;
      try {
        const [p] = await predictMany([state.pf]);
        const box = $('#pf-result');
        if (my !== seq || !box) return null;
        box.innerHTML = resultHtml(p);
        if (animate) { box.classList.remove('pulse'); void box.offsetWidth; box.classList.add('pulse'); }
        animateRings(box);
        return p;
      } catch (e) {
        toast(e.message, 'error');
        return null;
      }
    };
    bindSliders('pf', state.pf, debounce(() => update(), 120));
    $('#pf-student').addEventListener('change', e => { state.predictFor = e.target.value; state.pf = null; renderView(); });
    $('#pf-run').addEventListener('click', async () => {
      const p = await update(true);
      if (p) toast(`Predicted score: ${fmt(p.score)} (Grade ${p.grade}, ${p.risk} risk)`);
    });
    $('#pf-reset').addEventListener('click', () => { state.pf = null; renderView(); });
  },
};

/* ---- Analytics (EDA) ---- */
const teacherAnalytics = {
  html() {
    const rows = withPred();
    const feats = [
      ['Attendance', r => r.s.attendance], ['Assignment', r => r.s.assignment], ['Internal', r => internalOf(r.s)],
      ['Prev Score', r => r.s.prevScore], ['Study Hrs', r => r.s.studyHours], ['Predicted', r => r.p.score],
    ];
    const cols = feats.map(f => rows.map(f[1]));
    const cell = r => {
      const a = Math.abs(r).toFixed(2), bg = r >= 0 ? `rgba(var(--accent-rgb),${a})` : `rgba(255,107,129,${a})`;
      return `<div class="hm-cell" style="background:${bg};color:${Math.abs(r) > .55 ? 'var(--on-accent)' : 'var(--text)'}" title="r = ${r.toFixed(3)}">${r.toFixed(2)}</div>`;
    };
    const heat = rows.length > 1 ? `
      <div class="heatmap" style="grid-template-columns:minmax(64px,auto) repeat(${feats.length},minmax(0,1fr))">
        <span></span>${feats.map(f => `<span class="hm-col">${f[0]}</span>`).join('')}
        ${feats.map((f, i) => `<span class="hm-label">${f[0]}</span>${feats.map((_, j) => cell(pearson(cols[i], cols[j]))).join('')}`).join('')}
      </div>
      <div class="hm-legend"><span>−1</span><i></i><span>+1</span></div>` : '<p class="empty">Need at least 2 students.</p>';

    const box = (label, vals, max) => {
      if (!vals.length) return '';
      const pc = v => (v / max * 100).toFixed(1) + '%';
      const [mn, q1, md, q3, mx] = [0, .25, .5, .75, 1].map(q => quantile(vals, q));
      return `<div class="bp-row"><span>${label}</span><div class="bp-track" title="min ${fmt(mn)} · Q1 ${fmt(q1)} · median ${fmt(md)} · Q3 ${fmt(q3)} · max ${fmt(mx)}">
        <div class="bp-whisker" style="left:${pc(mn)};width:calc(${pc(mx)} - ${pc(mn)})"></div>
        <div class="bp-box" style="left:${pc(q1)};width:calc(${pc(q3)} - ${pc(q1)})"></div>
        <div class="bp-med" style="left:calc(${pc(md)} - 1.5px)"></div></div></div>`;
    };
    return `
    <section class="grid two">
      <div class="card glass"><div class="card-head"><div><h3>Histogram · Predicted Scores</h3><p>Univariate analysis</p></div></div>
        <div class="chart-box"><canvas id="c-hist"></canvas></div></div>
      <div class="card glass"><div class="card-head"><div><h3>Scatter · Attendance vs Predicted</h3><p>Bivariate analysis, coloured by risk</p></div></div>
        <div class="chart-box"><canvas id="c-scatter"></canvas></div></div>
    </section>
    <section class="grid two">
      <div class="card glass"><div class="card-head"><div><h3>Correlation Heatmap</h3><p>Pearson correlation between features</p></div></div>${heat}</div>
      <div class="card glass"><div class="card-head"><div><h3>Boxplots · Feature Spread</h3><p>Min · Q1 · Median · Q3 · Max (0–100 scale)</p></div></div>
        <div class="boxplots">
          ${box('Attendance', rows.map(r => r.s.attendance), 100)}
          ${box('Assignment', rows.map(r => r.s.assignment), 100)}
          ${box('Internal', rows.map(r => internalOf(r.s)), 100)}
          ${box('Prev Score', rows.map(r => r.s.prevScore), 100)}
          ${box('Predicted', rows.map(r => r.p.score), 100)}
          <div class="bp-scale"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
        </div></div>
    </section>`;
  },
  mount() {
    const t = T(), rows = withPred();
    const bins = ['<40', '40–50', '50–60', '60–70', '70–80', '80–90', '90+'];
    const idx = s => s < 40 ? 0 : Math.min(6, Math.floor(s / 10) - 3);
    const counts = bins.map(() => 0); rows.forEach(r => counts[idx(r.p.score)]++);
    chart('c-hist', {
      type: 'bar',
      data: { labels: bins, datasets: [{ label: 'Students', data: counts, backgroundColor: vGrad(hexA(t.lo, .5), t.accent), borderColor: t.hi, borderWidth: 1, borderRadius: 6, barPercentage: 1, categoryPercentage: .96 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: axes(Math.max(4, ...counts) + 1) },
    });
    const riskCol = { Low: t.hi, Medium: cssVar('--warn'), High: cssVar('--danger') };
    chart('c-scatter', {
      type: 'scatter',
      data: { datasets: ['Low', 'Medium', 'High'].map(r => ({
        label: `${r} risk`, pointRadius: 7, pointHoverRadius: 10,
        backgroundColor: hexA(riskCol[r], .75), borderColor: riskCol[r],
        data: rows.filter(x => x.p.risk === r).map(x => ({ x: x.s.attendance, y: x.p.score, name: x.s.name })),
      })) },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: c => `${c.raw.name}: ${c.raw.x}% → ${c.raw.y}` } } },
        scales: { x: { min: 40, max: 100, title: { display: true, text: 'Attendance %' }, grid: { color: cssVar('--line') } }, y: { min: 20, max: 100, title: { display: true, text: 'Predicted score' }, grid: { color: cssVar('--line') } } },
      },
    });
  },
};

/* =========================================================
   STUDENT VIEWS
   ========================================================= */
function rankOf(s) {
  if (state.classStats) return state.classStats.rank;
  const sorted = withPred().sort((a, b) => b.p.score - a.p.score);
  return sorted.findIndex(r => r.s.id === s.id) + 1;
}

const studentOverview = {
  html() {
    const s = currentStudent(), p = predictStudent(s);
    return `
    <section class="hero-card glass card-feature">
      <div class="hero-left">
        <p class="eyebrow">${esc(s.id)} · Section ${esc(s.section)} · B.Tech CSE, Semester 4</p>
        <h2>Hey <span class="hl">${esc(firstName(s.name))}</span>, nice to see you.</h2>
        <p class="muted hero-note">${{
          Low: "You're doing really well this semester. Keep the momentum going.",
          Medium: "You're on a decent path. A few small changes could lift your score quite a bit.",
          High: "This semester looks a little tough right now, but it's very fixable. Let's look at it together.",
        }[p.risk]}</p>
        <div class="chips">${gradeBadge('Predicted grade ' + p.grade)} ${riskBadge(p.risk)}
          <span class="badge plain">${icon('trophy')} Rank ${rankOf(s)} of ${classSize()}</span></div>
        <div class="hero-actions">
          <button class="btn btn-primary" data-nav="whatif">${icon('sliders')} Try What-If</button>
          <button class="btn btn-ghost" data-nav="tips">${icon('bulb')} View Tips</button>
          <button class="btn btn-ghost" data-action="report" data-id="${esc(s.id)}">${icon('file')} Report Card</button>
        </div>
      </div>
      ${ring(p.score, 190, 'Predicted Score')}
    </section>
    <section class="grid kpis">
      ${kpi('clock', 'Attendance', s.attendance + '%', s.attendance >= 75 ? 'Meets 75% requirement' : 'Below 75% requirement', s.attendance < 75 ? 'warn' : '')}
      ${kpi('clipboard', 'Assignment Score', s.assignment, 'Out of 100')}
      ${kpi('pencil', 'Internal Average', fmt(internalOf(s)), `Class avg ${fmt(classInternalAvg())}`)}
      ${kpi('book', 'Study Hours', s.studyHours + 'h', 'Per week')}
    </section>
    <section class="grid two">
      <div class="card glass"><div class="card-head"><div><h3>Latest Announcement</h3><p>${unreadFor(s) ? unreadFor(s) + ' unread' : 'All caught up'}</p></div>
        <button class="btn btn-ghost btn-sm" data-nav="notices">View all ${icon('arrow')}</button></div>
        ${noticesFor(s)[0] ? noticeHtml(noticesFor(s)[0], { unread: !(state.seen[s.id] || []).includes(noticesFor(s)[0].id) }) : '<p class="empty">No announcements yet.</p>'}</div>
      <div class="card glass"><div class="card-head"><div><h3>My Goal</h3><p>${s.goal ? 'Target score ' + s.goal : 'No target set yet'}</p></div>
        <button class="btn btn-primary btn-sm" data-nav="goals">${icon('flag')} ${s.goal ? 'Update' : 'Set goal'}</button></div>
        ${s.goal ? `<div class="skill"><div class="skill-top"><b>${fmt(p.score)} of ${s.goal}</b><span>${Math.min(100, Math.round(p.score / s.goal * 100))}%</span></div>
          <div class="bar"><i style="width:${clamp(p.score / s.goal * 100, 0, 100)}%"></i></div>
          <small>${p.score >= s.goal ? 'Target reached — aim higher!' : fmt(s.goal - p.score) + ' points to go'}</small></div>`
          : '<p class="empty">Set a target score to get a personalised plan.</p>'}</div>
    </section>
    <section class="card glass"><div class="card-head"><div><h3>My Marks vs Class Average</h3><p>Internal assessment by subject</p></div></div>
      <div class="chart-box"><canvas id="c-me"></canvas></div></section>`;
  },
  mount() {
    const s = currentStudent(), t = T();
    chart('c-me', {
      type: 'bar',
      data: { labels: SUBJECTS, datasets: [
        { label: 'My marks', data: SUBJECTS.map(k => s.marks[k]), backgroundColor: vGrad(hexA(t.accent, .5), t.hi), borderRadius: 8, maxBarThickness: 34 },
        { label: 'Class average', data: SUBJECTS.map(k => +fmt(classAvg(k))), backgroundColor: hexA(t.lo, .75), borderRadius: 8, maxBarThickness: 34 },
      ] },
      options: { responsive: true, maintainAspectRatio: false, scales: axes(100) },
    });
  },
};

const studentPerformance = {
  html() {
    const s = currentStudent();
    return `
    <section class="grid two">
      <div class="card glass"><div class="card-head"><div><h3>Subject Strengths</h3><p>Radar comparison with class</p></div></div>
        <div class="chart-box tall"><canvas id="c-radar"></canvas></div></div>
      <div class="card glass"><div class="card-head"><div><h3>Subject Scores</h3><p>Internal assessment (out of 100)</p></div></div>
        <div class="skills">${SUBJECTS.map(k => {
          const m = s.marks[k], ca = classAvg(k);
          return `<div class="skill"><div class="skill-top"><b>${k}</b><span>${m}%</span></div>
            <div class="bar ${m < 50 ? 'low' : ''}"><i style="width:0%" data-w="${m}%"></i></div>
            <small>Class avg ${fmt(ca)} · ${m >= ca ? `${fmt(m - ca)} above` : `${fmt(ca - m)} below`} average</small></div>`;
        }).join('')}</div></div>
    </section>
    <section class="grid two">
      <div class="card glass"><div class="card-head"><div><h3>Attendance</h3><p>Minimum required: 75%</p></div></div>
        <div class="chart-box"><canvas id="c-att"></canvas></div></div>
      <div class="card glass"><div class="card-head"><div><h3>What drives my score</h3><p>Compared with an average student (points)</p></div></div>
        ${contribBars(predictStudent(s).contributions)}</div>
    </section>`;
  },
  mount() {
    const s = currentStudent(), t = T();
    requestAnimationFrame(() => requestAnimationFrame(() => $$('.skill .bar i').forEach(i => { i.style.width = i.dataset.w; })));
    chart('c-radar', {
      type: 'radar',
      data: { labels: SUBJECTS, datasets: [
        { label: 'Me', data: SUBJECTS.map(k => s.marks[k]), backgroundColor: hexA(t.hi, .22), borderColor: t.hi, pointBackgroundColor: t.hi, borderWidth: 2 },
        { label: 'Class average', data: SUBJECTS.map(k => +fmt(classAvg(k))), backgroundColor: hexA(t.lo, .25), borderColor: t.accent, pointBackgroundColor: t.accent, borderWidth: 2, borderDash: [5, 4] },
      ] },
      options: { responsive: true, maintainAspectRatio: false, scales: { r: { min: 0, max: 100, ticks: { display: false, stepSize: 20 }, grid: { color: cssVar('--line') }, angleLines: { color: cssVar('--line') }, pointLabels: { color: cssVar('--text'), font: { size: 12 } } } } },
    });
    chart('c-att', {
      type: 'doughnut',
      data: { labels: ['Present', 'Absent'], datasets: [{ data: [s.attendance, 100 - s.attendance], backgroundColor: [s.attendance >= 75 ? t.accent : cssVar('--danger'), cssVar('--tint-2')], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '72%', rotation: -90, circumference: 180, plugins: { legend: { position: 'bottom' } } },
    });
  },
};

const studentWhatIf = {
  _vals: null,
  html() {
    const s = currentStudent(), base = featuresOf(s);
    this._vals = { ...base };
    return `
    <section class="grid split">
      <div class="card glass">
        <div class="card-head"><div><h3>Adjust Your Habits</h3><p>See how changes could affect your predicted score</p></div></div>
        <div class="sliders">${sliderGroup(this._vals, 'wi')}</div>
        <div class="hero-actions" style="margin-top:24px"><button class="btn btn-ghost" id="wi-reset">${icon('refresh')} Reset to my values</button></div>
      </div>
      <div class="card glass card-feature">
        <div class="card-head"><div><h3>Current vs Simulated</h3><p>Powered by the ${esc(modelName())} model</p></div></div>
        <div id="wi-out"></div>
      </div>
    </section>`;
  },
  mount() {
    const s = currentStudent(), cur = s.prediction;
    let seq = 0;
    const out = async () => {
      const my = ++seq;
      let sim;
      try { [sim] = await predictMany([this._vals]); } catch (e) { toast(e.message, 'error'); return; }
      if (my !== seq || !$('#wi-out')) return;
      const d = sim.score - cur.score;
      $('#wi-out').innerHTML = `
        <div class="compare">
          ${ring(cur.score, 140, 'Current')}
          <div class="delta ${d > 0.05 ? 'up' : d < -0.05 ? 'down' : ''}">${d >= 0 ? '+' : ''}${fmt(d)}<small>change</small></div>
          ${ring(sim.score, 140, 'Simulated')}
        </div>
        <div class="result-meta" style="margin:18px 0">${gradeBadge('Grade ' + cur.grade + ' → ' + sim.grade)} ${riskBadge(sim.risk)}</div>
        ${contribBars(sim.contributions)}`;
      animateRings($('#wi-out'));
    };
    bindSliders('wi', this._vals, debounce(out, 120));
    $('#wi-reset').addEventListener('click', () => renderView());
    out();
  },
};

const studentTips = {
  async load() {
    const s = currentStudent(), f = featuresOf(s);
    const patches = [{ attendance: 85 }, { attendance: 92 }, { assignment: 85 }, { studyHours: 15 },
      { internal: Math.round(avg(SUBJECTS.map(k => Math.max(s.marks[k], 65)))) }];
    await predictMany(patches.map(p => ({ ...f, ...p })));
  },
  html() {
    const s = currentStudent(), f = featuresOf(s), base = predict(f).score;
    const gain = patch => fmt(predict({ ...f, ...patch }).score - base);
    const weak = SUBJECTS.filter(k => s.marks[k] < 60);
    const tips = [];
    if (s.attendance < 75) tips.push(['clock', 'Improve your attendance', `Your attendance is ${s.attendance}%, below the 75% requirement. Regular classes are one of the strongest predictors of your final score.`, gain({ attendance: 85 }), 'if attendance reaches 85%']);
    else if (s.attendance < 90) tips.push(['clock', 'Push attendance above 90%', `You're at ${s.attendance}%. A few more classes each month adds up.`, gain({ attendance: 92 }), 'at 92% attendance']);
    if (s.assignment < 75) tips.push(['clipboard', 'Submit assignments on time', `Assignment score is ${s.assignment}/100. Start early and ask for feedback on drafts.`, gain({ assignment: 85 }), 'with 85 in assignments']);
    if (weak.length) tips.push(['book', `Focus on ${weak.join(', ')}`, `These subjects are below 60. Revise fundamentals, practise previous papers and join doubt sessions.`, gain({ internal: Math.round(avg(SUBJECTS.map(k => Math.max(s.marks[k], 65)))) }), 'if weak subjects reach 65']);
    if (s.studyHours < 12) tips.push(['target', 'Add structured study time', `You study ${s.studyHours}h a week. Aim for 12–15 hours using a weekly timetable and Pomodoro sessions.`, gain({ studyHours: 15 }), 'at 15 h/week']);
    const good = [];
    if (s.attendance >= 90) good.push('excellent attendance');
    if (s.assignment >= 85) good.push('strong assignment scores');
    if (!weak.length) good.push('no weak subjects');
    if (s.studyHours >= 14) good.push('consistent study habits');
    const tip = ([ic, h, p, g, when]) => `<div class="tip glass"><div class="kpi-ic">${icon(ic)}</div><div><h4>${h}</h4><p>${p}</p>
      ${Number(g) > 0 ? `<span class="badge grade gain">+${g} predicted points ${when}</span>` : ''}</div></div>`;
    return `
    <section class="tips">
      ${tips.map(tip).join('')}
      ${good.length ? `<div class="tip glass good"><div class="kpi-ic">${icon('trophy')}</div><div><h4>Keep it up!</h4><p>You have ${good.join(', ')}. Keep these habits going to stay on track.</p></div></div>` : ''}
      ${!tips.length ? `<div class="tip glass good"><div class="kpi-ic">${icon('check')}</div><div><h4>You're in great shape</h4><p>No major risk factors found. Try the What-If simulator to aim even higher.</p></div></div>` : ''}
    </section>
    <div class="hero-actions" style="margin-top:20px"><button class="btn btn-primary" data-nav="whatif">${icon('sliders')} Open What-If Simulator</button></div>`;
  },
};

/* =========================================================
   MORE FEATURES: attendance register, model lab, announcements,
   goals, profile, report cards, CSV import
   ========================================================= */
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const niceDate = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const noticesFor = s => state.notices
  .filter(n => n.audience === 'all' || n.audience === s.section)
  .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
const unreadFor = s => noticesFor(s).filter(n => !(state.seen[s.id] || []).includes(n.id)).length;

function updateBadges() {
  const b = $('.rail-btn[data-nav="notices"] .rail-badge'); if (!b) return;
  const s = currentStudent(), n = s ? unreadFor(s) : 0;
  b.textContent = n; b.hidden = !n;
}

/* ---- Attendance register (teacher) ---- */
const teacherAttendance = {
  draft: {},
  html() {
    const date = state.attDate || (state.attDate = todayISO());
    const sec = state.attSection || 'all';
    const existing = state.attLog[date];
    const list = state.students.filter(s => sec === 'all' || s.section === sec);
    this.draft = Object.fromEntries(list.map(s => [s.id, existing && existing[s.id] !== undefined ? existing[s.id] : true]));
    const history = Object.entries(state.attLog).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
    const low = state.students.filter(s => s.attendance < 75).sort((a, b) => a.attendance - b.attendance);
    return `
    <section class="grid split">
      <div class="card glass">
        <div class="card-head"><div><h3>Attendance Register</h3><p>${existing ? 'Already marked for this date — saving will update it' : 'Mark a class session'}</p></div></div>
        <div class="toolbar">
          <label class="field inline">Date<input class="input" type="date" id="att-date" value="${date}" max="${todayISO()}"></label>
          <label class="field inline">Section<select class="select" id="att-sec">${['all', 'A', 'B', 'C'].map(x => `<option value="${x}" ${sec === x ? 'selected' : ''}>${x === 'all' ? 'All sections' : 'Section ' + x}</option>`).join('')}</select></label>
        </div>
        <div class="toolbar">
          <button class="btn btn-ghost btn-sm" id="att-all-p">${icon('check')} All present</button>
          <button class="btn btn-ghost btn-sm" id="att-all-a">${icon('x')} All absent</button>
          <span class="muted att-count" id="att-count"></span>
        </div>
        <div class="att-list">${list.map(s => `
          <label class="att-row">
            <span class="avatar sm">${initials(s.name)}</span>
            <span class="grow"><b>${esc(s.name)}</b><small>${esc(s.id)} · Sec ${esc(s.section)} · ${s.attendance}% overall</small></span>
            <span class="switch"><input type="checkbox" data-att="${esc(s.id)}" ${this.draft[s.id] ? 'checked' : ''} aria-label="${esc(s.name)} present"><i></i></span>
          </label>`).join('') || '<p class="empty">No students in this section.</p>'}</div>
        <div class="hero-actions" style="margin-top:18px"><button class="btn btn-primary" id="att-save">${icon('check')} Save Attendance</button></div>
      </div>
      <div class="card glass">
        <div class="card-head"><div><h3>Recent Sessions</h3><p>Present / marked</p></div></div>
        <div class="list">${history.map(([d, rec]) => {
          const v = Object.values(rec), p = v.filter(Boolean).length;
          return `<div class="list-item"><div class="kpi-ic sm">${icon('calendar')}</div><div class="grow"><b>${niceDate(d)}</b><small>${p} present · ${v.length - p} absent</small></div><span class="score">${v.length ? Math.round(p / v.length * 100) : 0}%</span></div>`;
        }).join('') || '<p class="empty">No sessions marked yet.</p>'}</div>
        <div class="card-head" style="margin-top:22px"><div><h3>Below 75% attendance</h3><p>Students who need a reminder</p></div></div>
        <div class="list">${low.map(s => `<div class="list-item"><span class="avatar sm">${initials(s.name)}</span><div class="grow"><b>${esc(s.name)}</b><small>${esc(s.id)} · ${s.attended}/${s.held} classes</small></div><span class="badge risk-High">${s.attendance}%</span></div>`).join('') || '<p class="empty">Everyone is above 75%.</p>'}</div>
      </div>
    </section>`;
  },
  mount() {
    const count = () => {
      const v = Object.values(this.draft), p = v.filter(Boolean).length;
      $('#att-count').textContent = `${p} present · ${v.length - p} absent`;
    };
    $$('[data-att]').forEach(cb => cb.addEventListener('change', () => { this.draft[cb.dataset.att] = cb.checked; count(); }));
    const setAll = v => { $$('[data-att]').forEach(cb => { cb.checked = v; this.draft[cb.dataset.att] = v; }); count(); };
    $('#att-all-p').addEventListener('click', () => setAll(true));
    $('#att-all-a').addEventListener('click', () => setAll(false));
    $('#att-date').addEventListener('change', e => { if (e.target.value) { state.attDate = e.target.value; renderView(); } });
    $('#att-sec').addEventListener('change', e => { state.attSection = e.target.value; renderView(); });
    $('#att-save').addEventListener('click', async e => {
      const btn = e.currentTarget;
      if (!Object.keys(this.draft).length) return toast('No students to mark.', 'error');
      btn.disabled = true;
      try {
        const r = await api('/api/attendance', { method: 'POST', body: { date: state.attDate, records: this.draft } });
        setStudents(r.students); state.attLog = r.attLog; renderView();
        toast(`Attendance saved for ${r.marked} student(s) on ${niceDate(state.attDate)}.`);
      } catch (x) {
        toast(x.message, 'error'); btn.disabled = false;
      }
    });
    count();
  },
};

/* ---- Model Lab (teacher) ---- */
const FIGURE_TITLES = {
  'histogram_final_score.png': 'Distribution of final scores',
  'boxplots_features.png': 'Feature spread (boxplots)',
  'scatter_vs_final_score.png': 'Attendance & study hours vs score',
  'correlation_heatmap.png': 'Correlation heatmap',
  'model_comparison.png': 'Model error comparison',
  'predicted_vs_actual.png': 'Predicted vs actual (best model)',
};
const prettyCol = c => c.replace(/_/g, ' ').replace(/\b(pct|avg)\b/, m => ({ pct: '%', avg: 'average' }[m]));
const teacherModels = {
  html() {
    const M = state.model;
    if (!M || !M.available) {
      return `<p class="note-banner">${icon('alert')}<span><b>No trained model yet.</b> Run <code>python -m ml.generate_dataset</code> and <code>python -m ml.train</code>, then restart the server.</span></p>`;
    }
    const ms = M.models, best = ms.find(m => m.name === M.best), prep = M.preprocessing, sel = M.selection;
    const n = v => Number(v).toLocaleString('en-IN');
    const step = (ic, title, value, sub) => `<div class="list-item"><div class="kpi-ic sm">${icon(ic)}</div><div class="grow"><b>${title}</b><small>${sub}</small></div><span class="score">${value}</span></div>`;
    return `
    <p class="note-banner info">${icon('flask')}<span>Trained on <b>${n(M.dataset.rows)}</b> student records (${esc(M.dataset.name)}) on ${niceDate(M.trainedAt.slice(0, 10))}: ${n(M.dataset.trainRows)} for training and ${n(M.dataset.testRows)} held back for testing. Retrain any time with <code>python -m ml.train</code>.</span></p>
    <section class="grid kpis">
      ${kpi('trophy', 'Deployed Model', esc(best.name), `Best test R² (${best.r2.toFixed(3)})`)}
      ${kpi('target', 'Typical Error', '±' + best.mae.toFixed(2), 'Marks (MAE on the test set)')}
      ${kpi('flask', 'Models Compared', ms.length, M.dataset.split)}
      ${kpi('book', 'Clean Records', n(prep.rowsClean), `from ${n(prep.rowsRaw)} raw rows`)}
    </section>
    <section class="model-cards">${ms.map(m => `
      <div class="card glass model-card ${m === best ? 'card-feature' : ''}">
        <div class="card-head"><div><h3>${esc(m.name)}</h3><p>${esc(m.kind)}</p></div>${m === best ? `<span class="badge grade">${icon('trophy')} Deployed</span>` : ''}</div>
        <div class="metrics">
          <div><small>MAE</small><b>${m.mae.toFixed(2)}</b></div>
          <div><small>MSE</small><b>${m.mse.toFixed(2)}</b></div>
          <div><small>RMSE</small><b>${m.rmse.toFixed(2)}</b></div>
          <div><small>R²</small><b>${m.r2.toFixed(3)}</b></div>
        </div>
        <div class="bar"><i style="width:${m.r2 * 100}%"></i></div>
        <small class="muted">5-fold CV R² ${m.cvR2.toFixed(3)} ± ${m.cvR2Std.toFixed(3)} · trained in ${m.trainTime}</small>
      </div>`).join('')}</section>
    <section class="grid two">
      <div class="card glass"><div class="card-head"><div><h3>Error Comparison</h3><p>MAE & RMSE on the test set — lower is better</p></div></div><div class="chart-box"><canvas id="c-err"></canvas></div></div>
      <div class="card glass"><div class="card-head"><div><h3>Feature Importance</h3><p>From ${esc(best.name)}</p></div></div><div class="chart-box"><canvas id="c-imp"></canvas></div></div>
    </section>
    <section class="grid two">
      <div class="card glass"><div class="card-head"><div><h3>Data Preparation</h3><p>Phase 3 · cleaning the raw file</p></div></div>
        <div class="list">
          ${step('users', 'Duplicate rows removed', prep.duplicatesRemoved, 'Exact repeats of the same student')}
          ${step('alert', 'Impossible values removed', prep.outliersRemoved, 'e.g. 80 study hours a week or 140% attendance')}
          ${step('pencil', 'Missing values filled', prep.missingFilled, 'Median for numbers, most common value for categories')}
          ${step('sliders', 'Categories encoded', 3, 'yes/no and gender turned into 0/1 columns')}
        </div></div>
      <div class="card glass"><div class="card-head"><div><h3>Feature Selection</h3><p>Phase 5 · kept when |r| ≥ ${sel.threshold} with the final score</p></div></div>
        <div class="list">
          ${sel.kept.map(k => `<div class="list-item"><div class="grow"><b>${esc(prettyCol(k.name))}</b><small>Correlation r = ${k.r}</small></div><span class="badge grade">Kept</span></div>`).join('')}
          ${sel.dropped.map(d => `<div class="list-item"><div class="grow"><b>${esc(prettyCol(d.name))}</b><small>${esc(d.reason)}</small></div><span class="badge plain">Dropped</span></div>`).join('')}
        </div></div>
    </section>
    <section class="card glass" style="margin-bottom:18px"><div class="card-head"><div><h3>Training Charts</h3><p>Made by ml/train.py · also saved in reports/figures for your project report</p></div></div>
      <div class="figures">${(M.figures || []).map(f => `<figure><img data-fig="${esc(f)}" alt="${esc(FIGURE_TITLES[f] || f)}"><figcaption>${esc(FIGURE_TITLES[f] || f)}</figcaption></figure>`).join('')}</div>
    </section>
    <section class="card glass"><div class="card-head"><div><h3>Metrics Explained</h3><p>Handy for your report & viva</p></div></div>
      <div class="explain">
        <div><b>MAE</b><p>Mean Absolute Error — the average size of a prediction error, in marks.</p></div>
        <div><b>MSE</b><p>Mean Squared Error — squares each error, so big mistakes count more.</p></div>
        <div><b>RMSE</b><p>Square root of MSE — back in marks; the "typical" error size.</p></div>
        <div><b>R² Score</b><p>How much of the variation in scores the model explains. 1.0 is perfect.</p></div>
      </div>
    </section>`;
  },
  mount() {
    if (!state.model?.available) return;
    const t = T(), ms = state.model.models;
    chart('c-err', {
      type: 'bar',
      data: { labels: ms.map(m => m.name), datasets: [
        { label: 'MAE', data: ms.map(m => m.mae), backgroundColor: t.series[1], borderRadius: 8, maxBarThickness: 40 },
        { label: 'RMSE', data: ms.map(m => m.rmse), backgroundColor: t.series[4], borderRadius: 8, maxBarThickness: 40 },
      ] },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: cssVar('--line') } } } },
    });
    const imp = Object.entries(state.model.importance).sort((a, b) => b[1] - a[1]);
    chart('c-imp', {
      type: 'bar',
      data: { labels: imp.map(x => x[0]), datasets: [{ label: 'Importance', data: imp.map(x => x[1]), backgroundColor: imp.map((_, i) => t.series[Math.min(i + 1, t.series.length - 1)]), borderRadius: 8, maxBarThickness: 30 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: cssVar('--line') } }, y: { grid: { display: false } } } },
    });
    $$('img[data-fig]').forEach(async img => {
      try {
        const url = URL.createObjectURL(await apiBlob(`/api/figures/${encodeURIComponent(img.dataset.fig)}`));
        img.onload = () => URL.revokeObjectURL(url);
        img.src = url;
      } catch {
        img.closest('figure').remove();
      }
    });
  },
};

/* ---- Announcements ---- */
function noticeHtml(n, { del = false, unread = false } = {}) {
  return `<article class="notice ${n.important ? 'important' : ''}">
    <div class="notice-top">
      <span class="badge plain">${icon('calendar')} ${niceDate(n.date)}</span>
      <span class="badge plain">${n.audience === 'all' ? 'All students' : 'Section ' + esc(n.audience)}</span>
      ${n.important ? '<span class="badge risk-High">Important</span>' : ''}${unread ? '<span class="badge grade">New</span>' : ''}
      ${del ? `<button class="icon-btn danger notice-del" data-action="delete-notice" data-id="${esc(n.id)}" aria-label="Delete announcement">${icon('trash')}</button>` : ''}
    </div>
    <h4>${esc(n.title)}</h4><p>${esc(n.body)}</p></article>`;
}
const teacherNotices = {
  html() {
    const list = [...state.notices].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    return `
    <section class="grid split">
      <div class="card glass">
        <div class="card-head"><div><h3>Post an Announcement</h3><p>Students see it in their portal</p></div></div>
        <form id="notice-form" class="stack" novalidate>
          <label class="field">Title<input class="input" name="title" maxlength="90" placeholder="e.g. Unit test on Monday" required></label>
          <label class="field">Message<textarea class="input" name="body" rows="4" maxlength="500" placeholder="Write the details…" required></textarea></label>
          <div class="form-grid two-col">
            <label class="field">Audience<select class="select" name="audience">
              <option value="all">All students</option><option value="A">Section A</option><option value="B">Section B</option><option value="C">Section C</option></select></label>
            <label class="check"><input type="checkbox" name="important"><span>Mark as important</span></label>
          </div>
          <p class="form-error" id="notice-err"></p>
          <button class="btn btn-primary" type="submit">${icon('megaphone')} Post Announcement</button>
        </form>
      </div>
      <div class="card glass">
        <div class="card-head"><div><h3>Posted Announcements</h3><p>${list.length} total</p></div></div>
        <div class="notices">${list.map(n => noticeHtml(n, { del: true })).join('') || '<p class="empty">No announcements yet.</p>'}</div>
      </div>
    </section>`;
  },
  mount() {
    $('#notice-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target), title = String(fd.get('title')).trim(), body = String(fd.get('body')).trim();
      if (!title || !body) { $('#notice-err').textContent = 'Please add a title and a message.'; return; }
      try {
        const { notice } = await api('/api/notices', { method: 'POST', body: { title, body, audience: String(fd.get('audience')), important: fd.get('important') === 'on' } });
        state.notices.unshift(notice); renderView();
        toast('Announcement posted. Students will see it right away.');
      } catch (x) {
        $('#notice-err').textContent = x.message;
      }
    });
  },
};
const studentNotices = {
  html() {
    const s = currentStudent(), seen = state.seen[s.id] || [], list = noticesFor(s);
    return `<section class="card glass"><div class="card-head"><div><h3>Announcements</h3><p>From your teachers</p></div></div>
      <div class="notices">${list.map(n => noticeHtml(n, { unread: !seen.includes(n.id) })).join('') || '<p class="empty">No announcements yet.</p>'}</div></section>`;
  },
  mount() {
    const s = currentStudent();
    state.seen[s.id] = noticesFor(s).map(n => n.id);
    api('/api/notices/seen', { method: 'POST' }).catch(() => {});
  },
};

/* ---- Goals (student) ---- */
const GOAL_FEATS = [['attendance', 'Attendance', '%', 100], ['assignment', 'Assignment Score', '', 100], ['internal', 'Internal Assessment', '', 100], ['studyHours', 'Study Hours / Week', 'h', 30]];
const studentGoals = {
  goal: 0,
  html() {
    const s = currentStudent(), p = predictStudent(s);
    const goal = this.goal = s.goal ?? clamp(Math.ceil((p.score + 5) / 5) * 5, 40, 100);
    return `
    <section class="grid split">
      <div class="card glass card-feature">
        <div class="card-head"><div><h3>My Target Score</h3><p>Set a goal for this semester</p></div></div>
        <div class="goal-head">${ring(p.score, 150, 'Current')}
          <div class="goal-target"><small>Target</small><b id="goal-val">${goal}</b><span id="goal-grade" class="badge grade">Grade ${gradeOf(goal)}</span></div></div>
        <div class="slider" style="margin-top:22px">
          <div class="slider-top"><label for="goal-range">Target score</label><output id="goal-out">${goal}</output></div>
          <input type="range" id="goal-range" min="40" max="100" step="1" value="${goal}" style="--p:${(goal - 40) / 60 * 100}%">
        </div>
        <div class="goal-progress"><div class="bar"><i id="goal-bar"></i></div><small class="muted" id="goal-gap"></small></div>
        <div class="hero-actions" style="margin-top:20px"><button class="btn btn-primary" id="goal-save">${icon('flag')} Save Goal</button></div>
      </div>
      <div class="card glass"><div class="card-head"><div><h3>How to reach it</h3><p>Worked out with the prediction model</p></div></div><div id="goal-plan"></div></div>
    </section>`;
  },
  mount() {
    const s = currentStudent(), f = featuresOf(s), cur = s.prediction.score;
    const meta = Object.fromEntries(GOAL_FEATS.map(([k, label, unit]) => [k, { label, unit }]));
    let seq = 0;
    const labels = () => {
      const g = this.goal, gap = g - cur;
      $('#goal-val').textContent = g; $('#goal-out').textContent = g;
      $('#goal-grade').textContent = 'Grade ' + gradeOf(g);
      $('#goal-bar').style.width = clamp(cur / g * 100, 0, 100) + '%';
      $('#goal-gap').textContent = gap <= 0 ? `You're already ${fmt(-gap)} points above this target.` : `${fmt(gap)} points to go (${fmt(cur)} → ${g})`;
    };
    const plan = async () => {
      const g = this.goal, my = ++seq;
      if (g <= cur) { $('#goal-plan').innerHTML = `<p class="empty">You're on track for this goal. Keep your current habits — or set a higher target!</p>`; return; }
      let r;
      try { r = await api('/api/goal-plan', { method: 'POST', body: { goal: g } }); } catch (e) {
        if (my === seq && $('#goal-plan')) $('#goal-plan').innerHTML = `<p class="empty">${esc(e.message)}</p>`;
        return;
      }
      if (my !== seq || !$('#goal-plan')) return;
      $('#goal-plan').innerHTML = `
        <p class="form-sub" style="margin-top:0">Option 1 · Improve just one thing</p>
        <div class="list">${r.single.map(x => {
          const m = meta[x.key];
          return `<div class="list-item"><div class="grow"><b>${m.label}</b><small>${x.ok ? `Raise from ${x.from}${m.unit} to ${x.to}${m.unit}` : 'Not enough on its own'}</small></div>${x.ok ? `<span class="badge grade">+${x.to - x.from}${m.unit}</span>` : '<span class="badge plain">—</span>'}</div>`;
        }).join('')}</div>
        <p class="form-sub">Option 2 · Balanced plan</p>
        ${r.plan ? `<div class="list">${Object.entries(r.plan).filter(([k, v]) => v !== f[k]).map(([k, v]) => `<div class="list-item"><div class="grow"><b>${meta[k].label}</b><small>${f[k]}${meta[k].unit} → ${v}${meta[k].unit}</small></div><span class="badge grade">+${v - f[k]}${meta[k].unit}</span></div>`).join('')}</div>`
          : `<p class="empty">This target is above what's reachable this semester (max ≈ ${fmt(r.max)}). Try a lower target.</p>`}`;
    };
    const livePlan = debounce(plan, 180);
    const range = $('#goal-range');
    range.addEventListener('input', () => {
      this.goal = Number(range.value);
      range.style.setProperty('--p', `${(this.goal - 40) / 60 * 100}%`);
      labels(); livePlan();
    });
    $('#goal-save').addEventListener('click', async () => {
      try {
        await api('/api/me/goal', { method: 'PUT', body: { goal: this.goal } });
        s.goal = this.goal;
        toast(`Goal saved: ${this.goal} (Grade ${gradeOf(this.goal)}). You've got this!`);
      } catch (e) { toast(e.message, 'error'); }
    });
    labels(); plan();
  },
};

/* ---- Profile & password (student) ---- */
const studentProfile = {
  html() {
    const s = currentStudent(), p = predictStudent(s);
    const pw = (name, label, ac) => `<label class="field">${label}<div class="input-wrap">${icon('lock')}<input type="password" name="${name}" autocomplete="${ac}" required></div></label>`;
    return `
    <section class="grid split">
      <div class="card glass card-feature profile">
        <span class="avatar xl">${initials(s.name)}</span>
        <h2>${esc(s.name)}</h2><p class="muted">${esc(s.id)} · Section ${esc(s.section)}</p>
        <div class="chips">${gradeBadge('Grade ' + p.grade)} ${riskBadge(p.risk)}</div>
        <dl class="facts">
          <div><dt>Programme</dt><dd>B.Tech CSE · Semester 4</dd></div>
          <div><dt>Classes attended</dt><dd>${s.attended} / ${s.held}</dd></div>
          <div><dt>Target score</dt><dd>${s.goal ?? 'Not set'}</dd></div>
          <div><dt>Previous semester</dt><dd>${s.prevScore}</dd></div>
        </dl>
        <button class="btn btn-ghost" data-action="report" data-id="${esc(s.id)}">${icon('file')} View Report Card</button>
      </div>
      <div class="card glass">
        <div class="card-head"><div><h3>Change Password</h3><p>Use at least 6 characters</p></div></div>
        <form id="pw-form" class="stack" novalidate>
          ${pw('current', 'Current password', 'current-password')}
          ${pw('next', 'New password', 'new-password')}
          ${pw('confirm', 'Confirm new password', 'new-password')}
          <p class="form-error" id="pw-err"></p>
          <button class="btn btn-primary" type="submit">${icon('key')} Update Password</button>
        </form>
      </div>
    </section>`;
  },
  mount() {
    $('#pw-form').addEventListener('submit', async e => {
      e.preventDefault();
      const s = currentStudent(), fd = new FormData(e.target), g = k => String(fd.get(k) || '');
      const err = m => { $('#pw-err').textContent = m; };
      if (!g('current')) return err('Please enter your current password.');
      if (g('next').length < 6) return err('New password must be at least 6 characters.');
      if (g('next') === g('current')) return err('New password must be different from the current one.');
      if (g('next') !== g('confirm')) return err('New passwords do not match.');
      const form = e.target;
      try {
        await api('/api/me/password', { method: 'PUT', body: { current: g('current'), next: g('next') } });
        form.reset(); err('');
        toast('Password updated. Use it next time you sign in.');
      } catch (x) { err(x.message); }
    });
  },
};

/* ---- Report card ---- */
function reportCardHtml(s) {
  const p = predictStudent(s), weak = SUBJECTS.filter(k => s.marks[k] < 60);
  const remarks = [];
  if (s.attendance < 75) remarks.push(`Attendance (${s.attendance}%) is below the required 75%.`);
  if (weak.length) remarks.push(`Needs more practice in ${weak.join(', ')}.`);
  if (s.assignment < 70) remarks.push('Assignment submissions should be more regular and complete.');
  remarks.push(p.risk === 'Low' ? 'Consistent performance — keep it up.' : 'Recommended: regular revision and doubt-clearing sessions.');
  const stat = (label, value, sub = '') => `<div><small>${label}</small><b>${value}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
  return `<div class="rc">
    <header class="rc-head"><img src="assets/logo.png" alt="">
      <div><h1>Acadrix</h1><p>Student Performance Report · AIML Summer Internship 2026, IIHMF, MNNIT Allahabad</p></div>
      <div class="rc-date">Generated<br><b>${niceDate(todayISO())}</b></div></header>
    <table class="rc-info"><tr><th>Name</th><td>${esc(s.name)}</td><th>Student ID</th><td>${esc(s.id)}</td></tr>
      <tr><th>Programme</th><td>B.Tech CSE · Sem 4</td><th>Section</th><td>${esc(s.section)}</td></tr></table>
    <h2>Internal Assessment</h2>
    <table class="rc-table"><thead><tr><th>Subject</th><th>Marks (/100)</th><th>Class Avg</th><th>Grade</th></tr></thead><tbody>
      ${SUBJECTS.map(k => `<tr><td>${k}</td><td>${s.marks[k]}</td><td>${fmt(classAvg(k))}</td><td>${gradeOf(s.marks[k])}</td></tr>`).join('')}
      <tr class="rc-total"><td>Average</td><td>${fmt(internalOf(s))}</td><td>${fmt(classInternalAvg())}</td><td>${gradeOf(internalOf(s))}</td></tr>
    </tbody></table>
    <h2>Academic Indicators</h2>
    <div class="rc-stats">${stat('Attendance', s.attendance + '%', `${s.attended}/${s.held} classes`)}${stat('Assignment', s.assignment, 'out of 100')}${stat('Previous Sem', s.prevScore, 'out of 100')}${stat('Study Hours', s.studyHours + 'h', 'per week')}</div>
    <div class="rc-pred">${stat('Predicted final score', fmt(p.score))}${stat('Predicted grade', p.grade)}${stat('Risk level', p.risk)}${stat('Class rank', `${rankOf(s)} / ${classSize()}`)}</div>
    <h2>Remarks</h2><ul>${remarks.map(r => `<li>${r}</li>`).join('')}</ul>
    <footer class="rc-sign"><div>Class Teacher</div><div>Head of Department</div></footer>
    <p class="rc-note">Prediction generated by the ${esc(modelName())} model. For academic guidance only.</p>
  </div>`;
}
function openReport(id) {
  const s = state.students.find(x => x.id === id); if (!s) return;
  openModal(`
    <div class="modal-head"><h3>Report Card · ${esc(s.name)}</h3><button class="icon-btn" data-action="close-modal" aria-label="Close">${icon('x')}</button></div>
    <div class="rc-preview">${reportCardHtml(s)}</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="close-modal">Close</button>
      <button class="btn btn-primary" data-action="print-report" data-id="${esc(s.id)}">${icon('printer')} Print / Save as PDF</button>
    </div>`, 'lg');
}
function printReport(id) {
  const s = state.students.find(x => x.id === id); if (!s) return;
  $('#print-root').innerHTML = reportCardHtml(s);
  window.print();
}

/* ---- CSV import (teacher) ---- */
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}
async function importCSV(text) {
  const rows = parseCSV(text.replace(/^\uFEFF/, ''));
  if (rows.length < 2) return { error: 'The file has no data rows.' };
  const head = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const col = (...names) => names.map(n => head.indexOf(n)).find(i => i >= 0) ?? -1;
  const C = {
    id: col('id', 'student_id'), name: col('name'), attendance: col('attendance'), assignment: col('assignment'),
    prev_score: col('prev_score', 'prevscore', 'previous_score'), study_hours: col('study_hours', 'studyhours'),
  };
  const sectionCol = col('section'), passwordCol = col('password');
  const subj = SUBJECTS.map(k => col(k.toLowerCase()));
  const missing = [...Object.entries(C).filter(([, i]) => i < 0).map(([k]) => k), ...SUBJECTS.filter((_, i) => subj[i] < 0)];
  if (missing.length) return { error: 'Missing column(s): ' + missing.join(', ') };
  const payload = rows.slice(1).map(r => {
    const g = i => i >= 0 ? String(r[i] ?? '').trim() : '';
    return {
      id: g(C.id).toUpperCase(), name: g(C.name), section: g(sectionCol).toUpperCase() || undefined,
      attendance: g(C.attendance), assignment: g(C.assignment), prevScore: g(C.prev_score), studyHours: g(C.study_hours),
      marks: Object.fromEntries(SUBJECTS.map((k, i) => [k, g(subj[i])])), password: g(passwordCol) || undefined,
    };
  });
  const res = await api('/api/students/bulk', { method: 'POST', body: { rows: payload } });
  setStudents(res.students);
  return { added: res.added, updated: res.updated, skipped: res.skippedCount,
           reason: res.skipped[0] ? `Row ${res.skipped[0].row}: ${res.skipped[0].reason}` : '' };
}
function openImport() {
  const code = c => `<code class="chip-code">${c}</code>`;
  openModal(`
    <div class="modal-head"><h3>Import Students from CSV</h3><button class="icon-btn" data-action="close-modal" aria-label="Close">${icon('x')}</button></div>
    <p class="muted">Upload a .csv file with a header row. Existing student IDs are updated; new IDs are added. Extra columns are ignored.</p>
    <p class="form-sub">Required columns</p>
    <div class="chips">${['id', 'name', 'attendance', 'assignment', ...SUBJECTS, 'prev_score', 'study_hours'].map(code).join('')}</div>
    <p class="form-sub">Optional columns</p>
    <div class="chips">${code('section')}${code('password')}</div>
    <label class="dropzone" id="dropzone">${icon('upload')}<b>Choose a CSV file</b><small>or drag & drop it here</small>
      <input type="file" id="csv-file" accept=".csv,text/csv" hidden></label>
    <p class="form-error" id="csv-err"></p>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="export">${icon('download')} Download template</button>
      <button class="btn btn-ghost" data-action="close-modal">Close</button>
    </div>`);
  const handle = file => {
    if (!file) return;
    const rd = new FileReader();
    rd.onload = async () => {
      let res;
      try { res = await importCSV(String(rd.result)); } catch (x) { $('#csv-err').textContent = x.message; return; }
      if (res.error) { $('#csv-err').textContent = res.error; return; }
      if (!res.added && !res.updated) { $('#csv-err').textContent = `No valid rows found (${res.skipped} skipped). ${res.reason}`; return; }
      closeModal(); renderView();
      toast(`Import done: ${res.added} added, ${res.updated} updated${res.skipped ? `, ${res.skipped} skipped` : ''}.`);
    };
    rd.readAsText(file);
  };
  $('#csv-file').addEventListener('change', e => handle(e.target.files[0]));
  const dz = $('#dropzone');
  ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, () => dz.classList.remove('over')));
  dz.addEventListener('drop', e => { e.preventDefault(); handle(e.dataTransfer.files[0]); });
}

const VIEWS = {
  teacher: { dashboard: teacherDashboard, students: teacherStudents, attendance: teacherAttendance, predict: teacherPredict, models: teacherModels, analytics: teacherAnalytics, notices: teacherNotices },
  student: { overview: studentOverview, performance: studentPerformance, whatif: studentWhatIf, goals: studentGoals, tips: studentTips, notices: studentNotices, profile: studentProfile },
};

/* =========================================================
   DRIX — Acadrix chatbot assistant (rule-based, answers from
   the app's own data; swap reply() for an LLM/API call later)
   ========================================================= */
const chat = {
  open: false,
  msgs: [],
  key: null,

  chips() {
    const role = state.session?.role;
    if (role === 'teacher') return ['Who is at risk?', 'Low attendance', 'Top performers', 'Class summary', 'Best model'];
    if (role === 'student') return ['My predicted score', 'My weak subjects', 'How can I improve?', 'My goal', 'Latest notices'];
    return ['Demo credentials', 'What is Acadrix?', 'How does prediction work?'];
  },

  greeting() {
    const s = currentStudent(), t = currentTeacher();
    if (s) return `Hi ${esc(s.name.split(' ')[0])}! I'm <b>Drix</b>, your study buddy. Ask me about your score, subjects or how to improve.`;
    if (t) return `Hello ${esc(t.name)}! I'm <b>Drix</b>. I can tell you who's at risk, summarise the class, or look up a student — try typing an ID like <b>STU105</b>.`;
    return `Hi! I'm <b>Drix</b>, the Acadrix assistant. Need help logging in? Ask me for the <b>demo credentials</b>.`;
  },

  studentSummary(s) {
    const p = predictStudent(s);
    const weak = SUBJECTS.filter(k => s.marks[k] < 60);
    return `<b>${esc(s.name)}</b> (${esc(s.id)}) — predicted <b>${fmt(p.score)}</b>, grade <b>${p.grade}</b>, ${p.risk.toLowerCase()} risk.<br>
      Attendance ${s.attendance}% · Assignments ${s.assignment} · Internal avg ${fmt(internalOf(s))} · Study ${s.studyHours}h/week.
      ${weak.length ? `<br>Weak subjects: ${weak.join(', ')}.` : ''}`;
  },

  async reply(text) {
    const q = text.toLowerCase();
    const has = (...w) => w.some(x => q.includes(x));
    const role = state.session?.role;
    const s = currentStudent();

    if (role === 'teacher') {
      const idMatch = text.match(/[A-Za-z]{2,}\d{2,}/);
      const found = idMatch && state.students.find(x => x.id.toLowerCase() === idMatch[0].toLowerCase());
      if (found) return this.studentSummary(found);
    }
    if (/^(hi|hello|hey|namaste)\b/.test(q)) return this.greeting();
    if (has('what is acadrix', 'about acadrix', 'about you', 'who are you')) return `<b>Acadrix</b> = academic intelligence + futuristic technology. It predicts student performance from attendance, assignments, internal marks, previous scores and study hours, flags at-risk students early, and gives personalised tips.`;
    if (has('how does', 'algorithm', 'formula') || (q.includes('model') && !has('best', 'compare', 'lab', 'xgboost', 'forest'))) {
      const b = bestModel();
      return `Predictions come from a <b>${esc(modelName())}</b> model trained on past student records. It looks at attendance, assignment scores, internal marks, last semester's score and weekly study hours${b ? `, and on students it had never seen it was off by about <b>±${b.mae.toFixed(1)}</b> marks on average` : ''}.<br>Grades: O ≥ 90, A+ ≥ 80, A ≥ 70, B+ ≥ 60, B ≥ 50, C ≥ 40.`;
    }

    if (!role) {
      if (has('credential', 'login', 'password', 'username', 'demo', 'sign')) return `Here are the demo logins:<br>Student → <b>STU101</b> / <b>student@123</b><br>Teacher → <b>teacher</b> / <b>teacher@123</b><br>You can also click a demo card below the form to auto-fill.`;
      return `Please log in first so I can look at your data. Ask me for the <b>demo credentials</b> if you need them.`;
    }

    if (role === 'teacher') {
      const byName = state.students.find(x => q.includes(x.name.toLowerCase().split(' ')[0]));
      if (byName && !has('add', 'delete')) return this.studentSummary(byName);
      const rows = withPred();
      if (has('attendance', 'absent')) {
        const low = state.students.filter(x => x.attendance < 75).sort((a, b) => a.attendance - b.attendance);
        return low.length ? `${low.length} student(s) are below 75% attendance:<br>${low.map(x => `• ${esc(x.name)} (${esc(x.id)}) — ${x.attendance}%`).join('<br>')}<br>Mark sessions on the <b>Attendance</b> page.` : 'Everyone is above 75% attendance.';
      }
      if (has('best model', 'model lab', 'compare', 'xgboost', 'random forest', 'rmse')) {
        const best = bestModel();
        if (!best) return 'No trained model yet. Run <b>python -m ml.train</b> first.';
        return `<b>${esc(best.name)}</b> did best of the ${state.model.models.length} models, with R² <b>${best.r2.toFixed(3)}</b> and RMSE <b>${best.rmse.toFixed(2)}</b> on the test set. It's the one serving predictions now — see the <b>Model Lab</b> for the full comparison.`;
      }
      if (has('notice', 'announce')) return `There are <b>${state.notices.length}</b> announcement(s). Post a new one from the <b>Announcements</b> page.`;
      if (has('import', 'upload')) return `On <b>Manage Students</b>, click <b>Import CSV</b> and choose a file with columns id, name, attendance, assignment, the five subjects, prev_score and study_hours.`;
      if (has('report')) return `Click the report-card icon on any row in <b>Manage Students</b> to view and print that student's report card.`;
      if (has('risk', 'weak', 'attention', 'fail')) {
        const r = rows.filter(x => x.p.risk !== 'Low').sort((a, b) => a.p.score - b.p.score);
        return r.length ? `${r.length} student(s) need attention:<br>${r.map(x => `• ${esc(x.s.name)} (${esc(x.s.id)}) — ${fmt(x.p.score)}, ${x.p.risk} risk`).join('<br>')}` : 'Good news — no students are at risk right now.';
      }
      if (has('top', 'best', 'highest')) return `Top performers:<br>${[...rows].sort((a, b) => b.p.score - a.p.score).slice(0, 5).map((x, i) => `${i + 1}. ${esc(x.s.name)} — ${fmt(x.p.score)} (${x.p.grade})`).join('<br>')}`;
      if (has('summary', 'average', 'class', 'overall', 'stats')) return `Class summary: <b>${rows.length}</b> students · avg attendance <b>${fmt(avg(state.students.map(x => x.attendance)))}%</b> · avg predicted score <b>${fmt(avg(rows.map(x => x.p.score)))}</b> · high risk <b>${rows.filter(x => x.p.risk === 'High').length}</b>.<br>Weakest subject: <b>${[...SUBJECTS].sort((a, b) => classAvg(a) - classAvg(b))[0]}</b>.`;
      if (has('add', 'new student', 'create')) return `Go to <b>Manage Students</b> → <b>Add Student</b>. Fill in the ID, name, attendance, scores and marks, then save. The student can log in straight away with the ID and password you set.`;
      if (has('delete', 'remove')) return `In <b>Manage Students</b>, click the trash icon on a student's row and confirm.`;
      if (has('export', 'csv', 'download')) return `Use <b>Export CSV</b> on the Manage Students page to download all students with their predictions.`;
      if (has('predict')) return `Open the <b>Predict</b> page, pick a student or use the sliders, then press <b>Run Prediction</b>.`;
      return `I can help with: <b>who is at risk</b>, <b>top performers</b>, <b>class summary</b>, or look up a student by ID (e.g. STU105).`;
    }

    // student
    const p = predictStudent(s);
    if (has('goal', 'target')) return s.goal ? `Your target is <b>${s.goal}</b> and you're predicted <b>${fmt(p.score)}</b>. ${p.score >= s.goal ? 'You have reached it — set a higher one!' : `That's <b>${fmt(s.goal - p.score)}</b> points to go. The <b>Goals</b> page shows a plan.`}` : `You haven't set a goal yet. Open the <b>Goals</b> page to pick a target score and get a plan.`;
    if (has('notice', 'announce', 'exam', 'news')) {
      const list = noticesFor(s).slice(0, 2);
      return list.length ? `Latest announcements:<br>${list.map(n => `• <b>${esc(n.title)}</b> (${niceDate(n.date)})`).join('<br>')}<br>See all on the <b>Notices</b> page.` : 'No announcements right now.';
    }
    if (has('report')) return `Open <b>Overview</b> or <b>Profile</b> and click <b>Report Card</b> — you can print it or save it as a PDF.`;
    if (has('score', 'predict', 'grade', 'result', 'marks')) return `Your predicted score is <b>${fmt(p.score)}</b> — grade <b>${p.grade}</b>, ${p.risk.toLowerCase()} risk.`;
    if (has('rank', 'position')) return `You are ranked <b>${rankOf(s)}</b> out of ${classSize()} students by predicted score.`;
    if (has('attendance', 'absent', 'present')) return `Your attendance is <b>${s.attendance}%</b>. ${s.attendance < 75 ? 'That is below the 75% requirement — try not to miss any more classes.' : 'That meets the 75% requirement. Keep it up!'}`;
    if (has('weak', 'subject', 'worst', 'best', 'strong')) {
      const sorted = [...SUBJECTS].sort((a, b) => s.marks[a] - s.marks[b]);
      return `Strongest: <b>${sorted[sorted.length - 1]}</b> (${s.marks[sorted[sorted.length - 1]]}). Weakest: <b>${sorted[0]}</b> (${s.marks[sorted[0]]}), class avg ${fmt(classAvg(sorted[0]))}.`;
    }
    if (has('improve', 'tip', 'better', 'help', 'study', 'advice')) {
      const f = featuresOf(s);
      const ideas = [
        ['attend every class (aim for 90%+)', { attendance: Math.max(s.attendance, 90) }],
        ['raise assignment scores to 85+', { assignment: Math.max(s.assignment, 85) }],
        ['study 15 hours a week', { studyHours: Math.max(s.studyHours, 15) }],
        ['bring internal marks up by 10', { internal: Math.min(100, f.internal + 10) }],
      ];
      const preds = await predictMany(ideas.map(([, patch]) => ({ ...f, ...patch })));
      const options = ideas.map(([t], i) => [t, preds[i].score - p.score]).sort((a, b) => b[1] - a[1]);
      const best = options.filter(o => o[1] > 0.05).slice(0, 2);
      return best.length ? `Your biggest wins:<br>${best.map(o => `• ${o[0]} → <b>+${fmt(o[1])}</b> points`).join('<br>')}<br>Try the <b>What-If</b> page to experiment.` : `You're already doing great on every factor. Keep your routine consistent!`;
    }
    if (has('password')) return `Go to <b>Profile</b> → <b>Change Password</b>.`;
    if (has('what if', 'simulat')) return `Open the <b>What-If</b> page from the sidebar and move the sliders to see how your predicted score changes.`;
    return `I can tell you your <b>predicted score</b>, <b>rank</b>, <b>attendance</b>, <b>weak subjects</b> or <b>how to improve</b>.`;
  },

  mountOnce() {
    if ($('#chat-root')) return;
    const root = document.createElement('div');
    root.id = 'chat-root';
    root.innerHTML = `
      <button class="chat-fab" id="chat-fab" aria-label="Chat with Drix, the Acadrix assistant" aria-expanded="false">
        <img src="assets/mascot.png" alt=""><span class="chat-ping"></span>
      </button>
      <section class="chat-panel glass card-feature" id="chat-panel" role="dialog" aria-label="Drix assistant" hidden>
        <header class="chat-head">
          <img src="assets/mascot.png" alt="">
          <div><b>Drix</b><small><i class="online"></i> Acadrix Assistant</small></div>
          <button class="icon-btn" id="chat-close" aria-label="Close chat">${icon('x')}</button>
        </header>
        <div class="chat-body" id="chat-body"></div>
        <div class="chat-chips" id="chat-chips"></div>
        <form class="chat-input" id="chat-form">
          <input id="chat-text" autocomplete="off" placeholder="Ask Drix anything…" aria-label="Message">
          <button class="btn btn-primary" type="submit" aria-label="Send">${icon('arrow')}</button>
        </form>
      </section>`;
    document.body.appendChild(root);
    $('#chat-fab').addEventListener('click', () => this.toggle());
    $('#chat-close').addEventListener('click', () => this.toggle(false));
    $('#chat-form').addEventListener('submit', e => { e.preventDefault(); this.send($('#chat-text').value); });
    $('#chat-chips').addEventListener('click', e => { const c = e.target.closest('button'); c && this.send(c.textContent); });
  },

  refresh() {
    this.mountOnce();
    const k = state.session ? state.session.role + ':' + state.session.id : 'guest';
    if (k !== this.key) { this.key = k; this.msgs = [{ from: 'bot', html: this.greeting() }]; this.paint(); }
    $('#chat-chips').innerHTML = this.chips().map(c => `<button type="button">${c}</button>`).join('');
  },

  toggle(force) {
    this.open = force ?? !this.open;
    $('#chat-panel').hidden = !this.open;
    $('#chat-fab').classList.toggle('open', this.open);
    $('#chat-fab').setAttribute('aria-expanded', this.open);
    if (this.open) { this.paint(); $('#chat-text').focus(); }
  },

  paint(typing = false) {
    const body = $('#chat-body');
    body.innerHTML = this.msgs.map(m => `<div class="msg ${m.from}">${m.from === 'bot' ? '<img src="assets/mascot.png" alt="">' : ''}<p>${m.html}</p></div>`).join('') +
      (typing ? '<div class="msg bot"><img src="assets/mascot.png" alt=""><p class="dots"><i></i><i></i><i></i></p></div>' : '');
    body.scrollTop = body.scrollHeight;
  },

  send(text) {
    text = text.trim(); if (!text) return;
    $('#chat-text').value = '';
    this.msgs.push({ from: 'me', html: esc(text) });
    this.paint(true);
    const started = Date.now();
    this.reply(text).catch(e => esc(e.message)).then(html => {
      setTimeout(() => { this.msgs.push({ from: 'bot', html }); this.paint(); }, Math.max(0, 550 - (Date.now() - started)));
    });
  },
};

/* ---------- Global events ---------- */
document.addEventListener('click', e => {
  if (e.target.matches('[data-backdrop]')) return closeModal();
  const t = e.target.closest('[data-theme-set],[data-mode-toggle],[data-nav],[data-action]');
  if (!t) return;
  if (t.hasAttribute('data-mode-toggle')) return toggleMode();
  if (t.dataset.themeSet) return setTheme(t.dataset.themeSet);
  if (t.dataset.nav) return go(t.dataset.nav);
  const id = t.dataset.id;
  switch (t.dataset.action) {
    case 'logout': return logout();
    case 'add-student': return openStudentModal();
    case 'edit-student': return openStudentModal(id);
    case 'delete-student': return confirmDelete(id);
    case 'confirm-delete': {
      const s = state.students.find(x => x.id === id);
      t.disabled = true;
      api(`/api/students/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(() => {
        state.students = state.students.filter(x => x.id !== id);
        if (state.predictFor === id) { state.predictFor = ''; state.pf = null; }
        closeModal(); renderView();
        toast(`${s ? s.name : 'Student'} has been removed.`);
      }).catch(x => { t.disabled = false; toast(x.message, 'error'); });
      return;
    }
    case 'predict-for': state.predictFor = id; state.pf = null; return go('predict');
    case 'export': return exportCSV();
    case 'import': return openImport();
    case 'report': return openReport(id);
    case 'print-report': return printReport(id);
    case 'delete-notice':
      api(`/api/notices/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(() => {
        state.notices = state.notices.filter(n => n.id !== id); renderView();
        toast('Announcement deleted.');
      }).catch(x => toast(x.message, 'error'));
      return;
    case 'reset-data':
      api('/api/students/reset', { method: 'POST' }).then(r => {
        setStudents(r.students); state.attLog = r.attLog; renderView();
        toast('Demo students restored.');
      }).catch(x => toast(x.message, 'error'));
      return;
    case 'close-modal': return closeModal();
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modal-root').innerHTML) closeModal(); });

applyTheme();
if (state.token) {
  $('#app').innerHTML = '<div class="boot"><img src="assets/logo.png" alt=""><p>Getting your space ready…</p></div>';
  loadSession().catch(() => endSession());
} else {
  render();
}
