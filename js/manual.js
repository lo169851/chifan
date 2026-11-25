/* 手动记一餐：完全不碰 AI，从本地菜单里点选。
   自带 UI，不依赖 app.js 的内部状态；保存后刷新页面即可。 */
(function () {
'use strict';

const $ = s => document.querySelector(s);
const FB = window.FB;

const state = {
  foods: [],
  picked: [],      // [{f, unitIdx}]
  open: false
};

const STYLE = `
#moBtn{
  width:100%;margin-top:10px;padding:14px;border-radius:16px;
  border:1px solid #262d38;background:#171b22;color:#8b95a5;
  font-size:14.5px;font-family:inherit;
}
#moBtn:active{background:#1e242d;color:#e8edf4}
#moOverlay{
  position:fixed;inset:0;z-index:70;background:#0e1116;display:none;
  flex-direction:column;padding-top:env(safe-area-inset-top,0px);
}
#moOverlay.on{display:flex}
.mo-head{
  display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:14px 16px 10px;border-bottom:1px solid #262d38;
}
.mo-head .mo-title{font-size:16px;font-weight:600;color:#e8edf4}
.mo-head button{
  border:none;background:none;font-size:15px;font-family:inherit;padding:6px 4px;
}
#moClose{color:#8b95a5}
#moSave{color:#4ade80;font-weight:650}
#moSave:disabled{color:#3d4652}
.mo-search{padding:12px 16px 8px}
.mo-search input{
  width:100%;padding:12px 14px;border-radius:12px;border:1px solid #262d38;
  background:#171b22;color:#e8edf4;font-size:16px;outline:none;font-family:inherit;
}
#moPicked{padding:0 16px}
#moPicked:empty{display:none}
.mo-pick{
  display:flex;align-items:center;gap:8px;background:#171b22;border:1px solid #262d38;
  border-radius:12px;padding:10px 12px;margin-bottom:8px;
}
.mo-pick .pk-name{flex:1;min-width:0;font-size:14px;color:#e8edf4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mo-pick .pk-kcal{font-size:14px;font-weight:650;color:#4ade80;font-variant-numeric:tabular-nums}
.mo-pick .pk-x{background:none;border:none;color:#5c6675;font-size:16px;padding:0 2px}
.mo-units{display:flex;gap:5px;flex-wrap:wrap;margin:8px 0 0 0;grid-column:1/-1}
.mo-unit{
  border:1px solid #262d38;background:#1e242d;color:#8b95a5;font-size:12.5px;
  padding:6px 10px;border-radius:8px;font-family:inherit;
}
.mo-unit.on{background:rgba(74,222,128,.14);border-color:rgba(74,222,128,.5);color:#4ade80;font-weight:600}
#moList{flex:1;overflow-y:auto;padding:8px 16px 120px}
.mo-row{
  display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:13px 2px;border-bottom:1px solid #1c222b;
}
.mo-row .r-name{font-size:14.5px;color:#e8edf4}
.mo-row .r-sub{font-size:11.5px;color:#5c6675;margin-top:2px}
.mo-row .r-add{font-size:13px;color:#4ade80;border:1px solid rgba(74,222,128,.35);
  border-radius:8px;padding:5px 11px;background:none;font-family:inherit;flex:none}
#moBar{
  position:absolute;left:0;right:0;bottom:0;padding:12px 16px calc(14px + env(safe-area-inset-bottom,0px));
  background:rgba(14,17,22,.97);border-top:1px solid #262d38;
  display:flex;align-items:center;justify-content:space-between;gap:12px;
}
#moBar .mo-sum{font-size:13px;color:#8b95a5}
#moBar .mo-sum b{font-size:19px;color:#e8edf4;font-weight:650}
.mo-empty{text-align:center;color:#5c6675;font-size:13px;padding:30px 0}
`;

function fmt(n) { return (n || 0).toLocaleString('zh-CN'); }

function unitsFor(f) {
  const u = f.u || {};
  const arr = Object.keys(u).map(k => ({ label: k, grams: u[k] }));
  if (!arr.length) return [{ label: '一份(100g)', grams: 100 }, { label: '200g', grams: 200 }];
  return arr;
}
function gramsOf(p) {
  const u = unitsFor(p.f);
  return u[p.unitIdx] ? u[p.unitIdx].grams : 100;
}
function kcalOf(p) {
  return Math.round(p.f.k * gramsOf(p) / 100);
}
function defaultUnitIdx(f) {
  const u = unitsFor(f);
  const pref = ['一份', '一碗', '一个', '一杯', '一瓶', '一罐', '一块', '一张', '一条'];
  for (const p of pref) {
    const i = u.findIndex(x => x.label.indexOf(p) === 0);
    if (i >= 0) return i;
  }
  return 0;
}

function guessMeal() {
  const h = new Date().getHours();
  if (h < 10) return '早餐';
  if (h < 15) return '午餐';
  if (h < 21) return '晚餐';
  return '加餐';
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- 渲染 ---------- */
function renderPicked() {
  const box = $('#moPicked');
  if (!state.picked.length) { box.innerHTML = ''; renderBar(); return; }
  box.innerHTML = state.picked.map((p, i) => {
    const units = unitsFor(p.f);
    const chips = units.map((u, ui) =>
      '<button class="mo-unit' + (ui === p.unitIdx ? ' on' : '') + '" data-u="' + i + '" data-ui="' + ui + '">' +
      esc(u.label) + ' ' + u.grams + 'g</button>').join('');
    return '<div class="mo-pick" style="flex-wrap:wrap">' +
      '<div class="pk-name">' + esc(p.f.n) + '</div>' +
      '<div class="pk-kcal">' + fmt(kcalOf(p)) + '</div>' +
      '<button class="pk-x" data-x="' + i + '">×</button>' +
      '<div class="mo-units">' + chips + '</div></div>';
  }).join('');

  box.querySelectorAll('.pk-x').forEach(b => b.onclick = () => {
    state.picked.splice(Number(b.dataset.x), 1);
    renderPicked();
  });
  box.querySelectorAll('.mo-unit').forEach(b => b.onclick = () => {
    const p = state.picked[Number(b.dataset.u)];
    if (p) { p.unitIdx = Number(b.dataset.ui); renderPicked(); }
  });
  renderBar();
}

function renderList() {
  const q = ($('#moQ').value || '').trim().toLowerCase();
  const list = state.foods.filter(f => {
    if (!q) return true;
    if (f.n.toLowerCase().indexOf(q) >= 0) return true;
    return (f.a || []).some(a => String(a).toLowerCase().indexOf(q) >= 0);
  });
  const box = $('#moList');
  if (!list.length) { box.innerHTML = '<div class="mo-empty">没找到，换个说法试试</div>'; return; }
  box.innerHTML = list.map(f =>
    '<div class="mo-row"><div><div class="r-name">' + esc(f.n) + '</div>' +
    '<div class="r-sub">每100g ' + f.k + ' 千卡</div></div>' +
    '<button class="r-add" data-n="' + esc(f.n) + '">加</button></div>').join('');
  box.querySelectorAll('.r-add').forEach(b => b.onclick = () => {
    const f = state.foods.find(x => x.n === b.dataset.n);
    if (!f) return;
    state.picked.push({ f: f, unitIdx: defaultUnitIdx(f) });
    renderPicked();
  });
}

function renderBar() {
  const total = state.picked.reduce((s, p) => s + kcalOf(p), 0);
  $('#moBar').innerHTML = '<div class="mo-sum">合计 <b>' + fmt(total) + '</b> 千卡</div>' +
    '<div class="mo-sum">' + state.picked.length + ' 样</div>';
  $('#moSave').disabled = state.picked.length === 0;
}

/* ---------- 保存 ---------- */
async function save() {
  if (!state.picked.length) return;
  const items = state.picked.map(p => {
    const g = gramsOf(p);
    return {
      name: p.f.n,
      grams: g,
      kcal: Math.round(p.f.k * g / 100),
      protein: +(p.f.p * g / 100).toFixed(1),
      carbs: +(p.f.c * g / 100).toFixed(1),
      fat: +(p.f.f * g / 100).toFixed(1),
      confidence: 'high'
    };
  });
  const totals = {
    protein: +items.reduce((s, i) => s + i.protein, 0).toFixed(1),
    carbs: +items.reduce((s, i) => s + i.carbs, 0).toFixed(1),
    fat: +items.reduce((s, i) => s + i.fat, 0).toFixed(1)
  };
  const totalKcal = items.reduce((s, i) => s + i.kcal, 0);
  const btn = $('#moSave');
  btn.disabled = true; btn.textContent = '保存中…';
  try {
    await FB.api('/api/history', {
      method: 'POST',
      body: JSON.stringify({
        who: 'me', items: items, totalKcal: totalKcal, totals: totals,
        thumb: null, mealType: guessMeal(), note: '手动'
      })
    });
    location.reload();
  } catch (e) {
    btn.disabled = false; btn.textContent = '保存';
    alert('保存失败：' + e.message);
  }
}

/* ---------- 开关 ---------- */
async function open() {
  if (!state.foods.length) {
    try { state.foods = await FB.loadFoods(); }
    catch (e) { alert('菜单加载失败：' + e.message); return; }
  }
  state.open = true;
  state.picked = [];
  $('#moOverlay').classList.add('on');
  $('#moQ').value = '';
  renderPicked();
  renderList();
}
function close() {
  state.open = false;
  $('#moOverlay').classList.remove('on');
}

/* ---------- 注入 ---------- */
function mount() {
  if (document.getElementById('moOverlay')) return;
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const area = document.getElementById('shootArea');
  if (area) {
    const btn = document.createElement('button');
    btn.id = 'moBtn';
    btn.type = 'button';
    btn.textContent = '或者：从菜单里手动选（不用 AI）';
    btn.onclick = open;
    area.appendChild(btn);
  }

  const ov = document.createElement('div');
  ov.id = 'moOverlay';
  ov.innerHTML =
    '<div class="mo-head">' +
    '  <button id="moClose">取消</button>' +
    '  <div class="mo-title">手动记一餐</div>' +
    '  <button id="moSave" disabled>保存</button>' +
    '</div>' +
    '<div class="mo-search"><input id="moQ" type="search" placeholder="搜菜名，比如 红烧肉 / 拿铁" autocomplete="off"></div>' +
    '<div id="moPicked"></div>' +
    '<div id="moList"></div>' +
    '<div id="moBar"></div>';
  document.body.appendChild(ov);

  document.getElementById('moClose').onclick = close;
  document.getElementById('moSave').onclick = save;
  document.getElementById('moQ').addEventListener('input', renderList);
  document.getElementById('moQ').addEventListener('search', renderList);
}

document.addEventListener('DOMContentLoaded', mount);
})();
