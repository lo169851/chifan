/* 吃饭账本 · 交互逻辑（纯前端） */
(function () {
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const state = {
  cfg: null,
  items: [],
  thumb: null,
  mealType: '',
  note: '',
  today: '',
  all: [],
  todayByWho: { me: 0, partner: 0 },
  who: 'me',
  edit: null,
  busyTimer: null
};

/* ---------- 工具 ---------- */
function toast(msg, isErr) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast on' + (isErr ? ' err' : '');
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.className = 'toast'; }, isErr ? 4200 : 2200);
}
function busy(on, text) {
  $('#busy').classList.toggle('on', on);
  if (text) $('#busyText').textContent = text;
  clearTimeout(state.busyTimer);
  if (on) state.busyTimer = setTimeout(() => { $('#busyText').textContent = '还在算，别急…'; }, 4000);
}
const api = (path, opts) => window.FB.api(path, opts);
const fmt = n => (n || 0).toLocaleString('zh-CN');
const nameOf = who => who === 'partner'
  ? ((state.cfg && state.cfg.partnerName) || 'TA')
  : ((state.cfg && state.cfg.meName) || '我');
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- 图片 ---------- */
function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('这张图读不出来，换一张')); };
    img.src = url;
  });
}
function drawToCanvas(img, maxDim, quality) {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return c.toDataURL('image/jpeg', quality);
}

/* ---------- 视图 ---------- */
function showView(name) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  window.scrollTo(0, 0);
}

/* ---------- 首页 ---------- */
function renderHome() {
  const who = state.who;
  renderTodaySummary(state.todayByWho[who] || 0);
  const mine = who === 'me';
  $('#shootArea').style.display = mine ? '' : 'none';
  $('#partnerNote').style.display = mine ? 'none' : '';
  $('#pnName').textContent = nameOf('partner');
  const list = state.all.filter(e => e._day === state.today && e._who === who).slice(0, 6);
  renderEntries($('#recentList'), list, false,
    mine ? '今天还没记东西，拍一张试试' : 'TA 今天还没记');
}
function renderTodaySummary(kcal) {
  const cfg = state.cfg || {};
  const goal = (cfg.goals && cfg.goals[state.who]) || 1800;
  $('#todayKcal').textContent = fmt(kcal);
  $('#goalKcal').textContent = fmt(goal);
  const left = goal - kcal;
  $('#leftWrap').innerHTML = left < 0
    ? `已超 <b>${fmt(Math.abs(left))}</b> 千卡`
    : `还剩 <b>${fmt(left)}</b> 千卡`;
  $('.goal-line').classList.toggle('over', left < 0);
  const pct = Math.min(1, kcal / goal);
  $('#ringFg').style.strokeDashoffset = String(264 * (1 - pct));
  $('#ringFg').style.stroke = left < 0 ? 'var(--bad)' : (pct > .85 ? 'var(--warn)' : 'var(--acc)');
  $('#ringLabel').textContent = Math.round(pct * 100) + '%';
  const comp = cfg.computed && cfg.computed[state.who];
  $('#tdeeLine').textContent = comp
    ? `基础代谢 ${fmt(comp.bmr)} · 维持体重约 ${fmt(comp.tdee)} 千卡`
    : '';
}
function selectWho(who) {
  state.who = who;
  localStorage.setItem('fc_who', who);
  $$('.seg-btn').forEach(b => b.classList.toggle('on', b.dataset.who === who));
  renderHome();
}

/* ---------- 列表 ---------- */
function renderEntries(wrap, list, showWho, emptyText) {
  if (!list.length) { wrap.innerHTML = `<div class="empty">${emptyText || '还没有记录'}</div>`; return; }
  wrap.innerHTML = list.map(e => entryHtml(e, showWho)).join('');
  bindDeletes(wrap);
}
function entryHtml(e, showWho) {
  const names = (e.items || []).map(i => i.name).slice(0, 3).join('、');
  const time = new Date(e.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const thumb = e.thumb ? `<img src="${e.thumb}" alt="">` : `<div class="ph">🍚</div>`;
  const chip = showWho
    ? `<span class="who-chip${e._who === 'partner' ? ' partner' : ''}">${escapeHtml(nameOf(e._who))}</span>`
    : '';
  return `<div class="entry" data-id="${e.id}">
    ${thumb}
    <div class="info">
      <div class="name">${chip}${escapeHtml(names || '一餐')}</div>
      <div class="sub">${time}${e.mealType ? ' · ' + escapeHtml(e.mealType) : ''}</div>
    </div>
    <div class="k">${fmt(e.totalKcal)}<small> kcal</small></div>
    <button class="del-btn" data-del="${e.id}">删</button>
  </div>`;
}
function bindDeletes(root) {
  root.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = async ev => {
      ev.stopPropagation();
      if (!confirm('删掉这一条？')) return;
      try {
        await api('/api/history?id=' + encodeURIComponent(b.dataset.del), { method: 'DELETE' });
        loadData();
      } catch (e) { toast(e.message, true); }
    };
  });
}

/* ---------- 数据 ---------- */
function dayKey(ts) {
  const d = new Date(ts), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
async function loadData() {
  try {
    const d = await api('/api/history');
    state.today = d.today;
    state.todayByWho = d.todayByWho || { me: 0, partner: 0 };
    state.all = (d.entries || []).map(e => ({
      ...e,
      _day: dayKey(e.ts),
      _who: e.who === 'partner' ? 'partner' : 'me'
    }));
    renderHome();
    if (d.offline) toast('云端读不到，先看本机缓存：' + d.offline, true);
  } catch (e) {
    console.warn(e);
  }
}

/* ---------- 拍照 ---------- */
async function onFile(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  if (!state.cfg || !state.cfg.hasKey) {
    openSheet();
    toast('先填一下 API Key', true);
    return;
  }
  let img;
  try { img = await loadImage(file); } catch (err) { return toast(err.message, true); }
  const payload = drawToCanvas(img, 1024, 0.82);
  state.thumb = drawToCanvas(img, 110, 0.5);
  $('#resultThumb').src = payload;

  busy(true, '正在认菜…');
  try {
    const r = await api('/api/analyze', { method: 'POST', body: JSON.stringify({ image: payload }) });
    if (!r.items || !r.items.length) {
      busy(false);
      toast('没认出吃的，离近点、光亮点再拍一张', true);
      return;
    }
    state.mealType = r.mealType || guessMeal();
    state.note = r.note || '';
    state.items = r.items.map(i => ({ ...i, mult: 1 }));
    renderResult();
    showView('result');
  } catch (err) {
    toast(err.message, true);
  } finally {
    busy(false);
  }
}
function guessMeal() {
  const h = new Date().getHours();
  if (h < 10) return '早餐';
  if (h < 15) return '午餐';
  if (h < 21) return '晚餐';
  return '加餐';
}

/* ---------- 结果 ---------- */
function calcTotals(items) {
  return items.reduce((a, i) => ({
    kcal: a.kcal + Math.round(i.kcal * i.mult),
    protein: +(a.protein + i.protein * i.mult).toFixed(1),
    carbs: +(a.carbs + i.carbs * i.mult).toFixed(1),
    fat: +(a.fat + i.fat * i.mult).toFixed(1)
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}
function renderResult() {
  const t = calcTotals(state.items);
  $('#resultKcal').textContent = fmt(t.kcal);
  $('#resultMeal').textContent = state.mealType + (state.note ? ' · ' + state.note : '');
  $('#resultMacros').innerHTML =
    `<span>蛋白 <b>${t.protein}</b>g</span><span>碳水 <b>${t.carbs}</b>g</span><span>脂肪 <b>${t.fat}</b>g</span>`;

  $('#itemsList').innerHTML = state.items.map((i, idx) => {
    const kcal = Math.round(i.kcal * i.mult);
    const grams = Math.round(i.grams * i.mult);
    const tag = i.confidence === 'high'
      ? `<span class="tag high">库里比对</span>`
      : `<span class="tag low">估算</span>`;
    const opts = [[0.7, '少一点'], [1, '差不多'], [1.35, '多一点']];
    return `<div class="item" data-idx="${idx}">
      <div class="item-top">
        <div class="item-name">${escapeHtml(i.name)}${tag}</div>
        <div class="item-k">${fmt(kcal)}<small> kcal</small></div>
      </div>
      <div class="item-sub">约 ${grams} 克${i.matchedName && i.matchedName !== i.name ? ' · 按「' + escapeHtml(i.matchedName) + '」折算' : ''}</div>
      <div class="portion-row">
        ${opts.map(([m, label]) => `<button class="p-btn${i.mult === m ? ' on' : ''}" data-mult="${m}">${label}</button>`).join('')}
      </div>
    </div>`;
  }).join('');

  $('#itemsList').querySelectorAll('.p-btn').forEach(b => {
    b.onclick = () => {
      state.items[Number(b.closest('.item').dataset.idx)].mult = Number(b.dataset.mult);
      renderResult();
    };
  });
}

async function saveEntry() {
  const t = calcTotals(state.items);
  const items = state.items.map(i => ({
    name: i.name,
    grams: Math.round(i.grams * i.mult),
    kcal: Math.round(i.kcal * i.mult),
    protein: +(i.protein * i.mult).toFixed(1),
    carbs: +(i.carbs * i.mult).toFixed(1),
    fat: +(i.fat * i.mult).toFixed(1),
    confidence: i.confidence
  }));
  const btn = $('#btnSave');
  btn.disabled = true; btn.textContent = '保存中…';
  try {
    await api('/api/history', {
      method: 'POST',
      body: JSON.stringify({
        who: 'me', items, totalKcal: t.kcal, totals: t,
        thumb: state.thumb, mealType: state.mealType, note: state.note
      })
    });
    toast('记下了');
    showView('home');
    selectWho('me');
    loadData();
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false; btn.textContent = '记下来';
  }
}

/* ---------- 历史 ---------- */
async function loadHistory() {
  await loadData();
  const wrap = $('#historyList');
  if (!state.all.length) { wrap.innerHTML = '<div class="empty">还没有记录</div>'; return; }
  const groups = {};
  for (const e of state.all) (groups[e._day] = groups[e._day] || []).push(e);
  const todayK = dayKey(Date.now());
  const yestK = dayKey(Date.now() - 864e5);
  wrap.innerHTML = Object.keys(groups).sort().reverse().map(k => {
    const list = groups[k];
    const mine = list.filter(e => e._who === 'me').reduce((s, e) => s + (e.totalKcal || 0), 0);
    const theirs = list.filter(e => e._who === 'partner').reduce((s, e) => s + (e.totalKcal || 0), 0);
    const label = k === todayK ? '今天' : k === yestK ? '昨天' : k.slice(5).replace('-', '月') + '日';
    return `<div class="day-head">
        <span>${label}</span>
        <b>${nameOf('me')} ${fmt(mine)} · ${nameOf('partner')} ${fmt(theirs)}</b>
      </div>
      <div class="list">${list.map(e => entryHtml(e, true)).join('')}</div>`;
  }).join('');
  bindDeletes(wrap);
}

/* ---------- 设置 ---------- */
async function loadConfig() { state.cfg = await api('/api/config'); }

function openSheet() {
  const c = state.cfg || {};
  const sel = $('#setPreset');
  sel.innerHTML = Object.entries(c.presets || {}).map(([k, v]) =>
    `<option value="${k}">${escapeHtml(v.label)}</option>`).join('');
  sel.value = c.preset || 'deepseek';
  $('#setUrl').value = c.url || '';
  $('#setModel').value = c.model || '';
  $('#setKey').value = '';
  $('#setKey').placeholder = c.hasKey ? '已保存，留空则不修改' : '粘贴你的 Key';
  $('#setMeName').value = c.meName || '我';
  $('#setPartnerName').value = c.partnerName || 'TA';
  $('#setGhToken').value = '';
  $('#setGhToken').placeholder = c.hasCloud ? '已连接云端，留空则不修改' : 'github_pat_...';
  $('#setGhClear').checked = false;
  $('#ghState').textContent = c.hasCloud ? '已连接' : '只存本机';

  state.edit = {
    who: 'me',
    profiles: JSON.parse(JSON.stringify(c.profiles || {})),
    goals: { me: 1800, partner: 1800, ...(c.goals || {}) }
  };
  fillProfileForm();
  $('#sheetMask').classList.add('on');
  $('#sheet').classList.add('on');
}
function closeSheet() {
  $('#sheetMask').classList.remove('on');
  $('#sheet').classList.remove('on');
}

function readProfileForm() {
  if (!state.edit) return;
  const who = state.edit.who;
  state.edit.profiles[who] = {
    sex: $('#pSex').value,
    age: Number($('#pAge').value) || 0,
    height: Number($('#pHeight').value) || 0,
    weight: Number($('#pWeight').value) || 0,
    activity: Number($('#pActivity').value) || 1.375,
    mode: $('#pMode').value
  };
  state.edit.goals[who] = Number($('#setGoal').value) || 1800;
}
function fillProfileForm() {
  const e = state.edit;
  if (!e) return;
  const p = e.profiles[e.who] || {};
  $('#pSex').value = p.sex === 'female' ? 'female' : 'male';
  $('#pAge').value = p.age || '';
  $('#pHeight').value = p.height || '';
  $('#pWeight').value = p.weight || '';
  $('#pActivity').value = String(p.activity || 1.375);
  $('#pMode').value = p.mode || 'keep';
  $('#setGoal').value = e.goals[e.who] || 1800;
  $$('#profSeg button').forEach(b => b.classList.toggle('on', b.dataset.p === e.who));
  updateCalc(false);
}
function updateCalc(autoFillGoal) {
  const p = {
    sex: $('#pSex').value,
    age: Number($('#pAge').value),
    height: Number($('#pHeight').value),
    weight: Number($('#pWeight').value),
    activity: Number($('#pActivity').value),
    mode: $('#pMode').value
  };
  const r = window.FB.calcGoal(p);
  const box = $('#calcBox');
  if (!r) { box.innerHTML = '填身高体重，自动算'; return; }
  const modeTxt = p.mode === 'lose' ? '减脂' : p.mode === 'gain' ? '增肌' : '维持';
  box.innerHTML = `基础代谢 <b>${r.bmr}</b> · 每日消耗 <b>${r.tdee}</b><br>` +
    `${modeTxt}目标 <b>${r.goal}</b> 千卡 <span class="dim2">（Mifflin-St Jeor）</span>`;
  if (autoFillGoal) $('#setGoal').value = r.goal;
}

async function saveConfig() {
  readProfileForm();
  const body = {
    preset: $('#setPreset').value,
    url: $('#setUrl').value.trim(),
    model: $('#setModel').value.trim(),
    meName: $('#setMeName').value.trim() || '我',
    partnerName: $('#setPartnerName').value.trim() || 'TA',
    profiles: state.edit.profiles,
    goals: state.edit.goals
  };
  const k = $('#setKey').value.trim();
  if (k) body.apiKey = k;
  const tk = $('#setGhToken').value.trim();
  if ($('#setGhClear').checked) body.ghToken = '';
  else if (tk) body.ghToken = tk;
  try {
    state.cfg = await api('/api/config', { method: 'POST', body: JSON.stringify(body) });
    closeSheet();
    toast('设置已保存');
    applyNames();
    renderHome();
    loadData();
  } catch (e) { toast(e.message, true); }
}
function applyNames() {
  $('#segMe').textContent = nameOf('me');
  $('#segPartner').textContent = nameOf('partner');
  $('#pnMe').textContent = nameOf('me');
}

/* ---------- 启动 ---------- */
async function init() {
  try {
    await loadConfig();
  } catch (e) {
    toast('初始化失败：' + e.message, true);
    return;
  }
  state.who = localStorage.getItem('fc_who') === 'partner' ? 'partner' : 'me';
  applyNames();
  $$('.seg-btn').forEach(b => {
    b.classList.toggle('on', b.dataset.who === state.who);
    b.onclick = () => selectWho(b.dataset.who);
  });

  $('#fileInput').addEventListener('change', onFile);
  $('#btnShoot').onclick = () => $('#fileInput').click();
  $('#btnSettings').onclick = openSheet;
  $('#btnCancelSet').onclick = closeSheet;
  $('#btnSaveSet').onclick = saveConfig;
  $('#sheetMask').onclick = closeSheet;
  $('#btnSave').onclick = saveEntry;
  $('#btnReshoot').onclick = () => { showView('home'); setTimeout(() => $('#fileInput').click(), 180); };
  $('#gotoHistory').onclick = () => { showView('history'); loadHistory(); };
  $$('.tab').forEach(t => t.onclick = () => {
    showView(t.dataset.view);
    if (t.dataset.view === 'history') loadHistory();
    if (t.dataset.view === 'home') loadData();
  });
  $('#setPreset').onchange = e => {
    const p = (state.cfg.presets || {})[e.target.value];
    if (p && p.url) { $('#setUrl').value = p.url; $('#setModel').value = p.model; }
  };
  $$('#profSeg button').forEach(b => {
    b.onclick = () => {
      readProfileForm();
      state.edit.who = b.dataset.p;
      fillProfileForm();
    };
  });
  ['#pSex', '#pAge', '#pHeight', '#pWeight', '#pActivity', '#pMode'].forEach(s => {
    const el = $(s);
    if (!el) return;
    el.addEventListener('input', () => updateCalc(true));
    el.addEventListener('change', () => updateCalc(true));
  });

  await loadData();
  if (!state.cfg.hasKey) setTimeout(openSheet, 600);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
}
document.addEventListener('DOMContentLoaded', init);
})();
