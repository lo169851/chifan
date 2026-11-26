/* 纯前端后端：本地配置 + 浏览器直连模型 + GitHub 仓库当共享存储 */
(function (global) {
  'use strict';
  const FB = global.FB = global.FB || {};

  const DATA_REPO = 'lo169851/foodcal-data';
  const DATA_FILE = 'records.json';
  const DATA_BRANCH = 'main';
  const MAX_ENTRIES = 240;

  const PRESETS = {
    deepseek: { label: 'DeepSeek（可读图）', url: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-flash' },
    zhipu: { label: '智谱 GLM-4V-Flash（免费）', url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4v-flash' },
    dashscope: { label: '通义千问 qwen-vl-plus', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-vl-plus' },
    openai: { label: 'OpenAI gpt-4o-mini', url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
    custom: { label: '自定义（OpenAI 兼容）', url: '', model: '' }
  };

  const DEFAULT_PROFILE = { sex: 'male', age: 22, height: 175, weight: 65, activity: 1.375, mode: 'keep' };
  const K_CFG = 'fc_cfg_v1', K_TOKEN = 'fc_gh_v1', K_REC = 'fc_rec_v1';

  function readLS(k, fb) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; }
  }
  function writeLS(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('本地存储写不进去', e); }
  }

  function getRawConfig() {
    const c = readLS(K_CFG, {});
    return {
      preset: c.preset || 'deepseek',
      url: c.url || PRESETS.deepseek.url,
      model: c.model || PRESETS.deepseek.model,
      apiKey: c.apiKey || '',
      meName: c.meName || '我',
      partnerName: c.partnerName || 'TA',
      goals: c.goals || { me: 1800, partner: 1800 },
      profiles: {
        me: Object.assign({}, DEFAULT_PROFILE, c.profiles && c.profiles.me),
        partner: Object.assign({}, DEFAULT_PROFILE, c.profiles && c.profiles.partner)
      }
    };
  }
  function saveRawConfig(c) { writeLS(K_CFG, c); }
  function getToken() { return localStorage.getItem(K_TOKEN) || ''; }
  function setToken(t) { if (t) localStorage.setItem(K_TOKEN, t); else localStorage.removeItem(K_TOKEN); }

  /* ---------------- 一键配置链接 ---------------- */
  let justConfigured = false;

  (function applySetupFromHash() {
    const h = String(location.hash || '');
    if (h.indexOf('#setup=') !== 0) return;
    try {
      const payload = JSON.parse(decodeURIComponent(h.slice(7)));
      const c = getRawConfig();
      if (payload.k) c.apiKey = String(payload.k);
      if (payload.u) c.url = String(payload.u);
      if (payload.m) c.model = String(payload.m);
      if (payload.p && PRESETS[payload.p]) c.preset = String(payload.p);
      saveRawConfig(c);
      if (payload.t) setToken(String(payload.t));
      justConfigured = true;
    } catch (e) {
      console.warn('一键配置链接解析失败', e);
    }
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { }
  })();

  function buildSetupLink() {
    const c = getRawConfig();
    const payload = { k: c.apiKey, t: getToken(), u: c.url, m: c.model, p: c.preset };
    return location.origin + location.pathname + '#setup=' + encodeURIComponent(JSON.stringify(payload));
  }

  function mountShareUI() {
    if (!document.body || document.getElementById('shareGroup')) return;
    const sheet = document.getElementById('sheet');
    if (!sheet) return;
    const box = document.createElement('div');
    box.className = 'group';
    box.id = 'shareGroup';
    box.innerHTML =
      '<div class="group-head"><span>给对方一键配置</span></div>' +
      '<div class="tip-box" style="margin-top:0">点下面的按钮生成一条链接，发给对方。' +
      '对方点开就自动填好 Key 和 Token，什么都不用输。' +
      '<br><br><b style="color:var(--warn)">链接里带着你的密钥，别发群里；对方打开后把那条消息删掉。</b></div>' +
      '<button type="button" class="ghost-btn" id="btnShare" style="width:100%;margin-bottom:12px">生成并复制链接</button>' +
      '<input id="shareOut" type="text" readonly style="display:none;width:100%;padding:12px 14px;' +
      'border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--dim);font-size:12px">';
    const actions = sheet.querySelector('.sheet-actions');
    if (actions) sheet.insertBefore(box, actions); else sheet.appendChild(box);

    box.querySelector('#btnShare').addEventListener('click', async function () {
      const out = box.querySelector('#shareOut');
      const c = getRawConfig();
      if (!c.apiKey) { alert('先填好 API Key 再生成链接'); return; }
      const link = buildSetupLink();
      out.style.display = 'block';
      out.value = link;
      out.focus(); out.select();
      let copied = false;
      try { await navigator.clipboard.writeText(link); copied = true; } catch (e) { }
      if (!copied) { try { document.execCommand('copy'); copied = true; } catch (e) { } }
      box.querySelector('#btnShare').textContent = copied ? '已复制，去粘贴给对方' : '已生成，长按上面那栏复制';
    });
  }

  function calcGoal(p) {
    if (!p) return null;
    const age = Number(p.age), h = Number(p.height), w = Number(p.weight);
    if (!age || !h || !w) return null;
    const bmr = 10 * w + 6.25 * h - 5 * age + (p.sex === 'female' ? -161 : 5);
    const tdee = bmr * (Number(p.activity) || 1.375);
    const f = p.mode === 'lose' ? 0.8 : p.mode === 'gain' ? 1.1 : 1;
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), goal: Math.round(tdee * f) };
  }

  function publicConfig() {
    const c = getRawConfig();
    return {
      preset: c.preset, url: c.url, model: c.model, hasKey: !!c.apiKey,
      dailyGoal: c.goals.me, goals: c.goals, profiles: c.profiles,
      computed: { me: calcGoal(c.profiles.me), partner: calcGoal(c.profiles.partner) },
      meName: c.meName, partnerName: c.partnerName,
      hasCloud: !!getToken(), cloudRepo: DATA_REPO, presets: PRESETS
    };
  }

  /* ---------------- GitHub ---------------- */
  function ghHeaders(withJson) {
    const h = { 'Authorization': 'Bearer ' + getToken(), 'Accept': 'application/vnd.github+json' };
    if (withJson) h['Content-Type'] = 'application/json';
    return h;
  }
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  const dataUrl = () => 'https://api.github.com/repos/' + DATA_REPO + '/contents/' + DATA_FILE;

  async function ghRead() {
    const r = await fetch(dataUrl() + '?ref=' + DATA_BRANCH, { headers: ghHeaders(false), cache: 'no-store' });
    if (r.status === 404) return { entries: [], sha: null };
    if (r.status === 401 || r.status === 403) throw new Error('GitHub Token 无效或没权限（要 foodcal-data 的 Contents 读写）');
    if (!r.ok) throw new Error('读取云端失败 ' + r.status);
    const j = await r.json();
    let data = { entries: [] };
    try { data = JSON.parse(b64decode(j.content)); } catch (e) { }
    if (!Array.isArray(data.entries)) data.entries = [];
    return { entries: data.entries, sha: j.sha };
  }

  async function ghWrite(entries, sha, message) {
    const body = {
      message: message || 'update records',
      content: b64encode(JSON.stringify({ entries: entries, updatedAt: Date.now() })),
      branch: DATA_BRANCH
    };
    if (sha) body.sha = sha;
    const r = await fetch(dataUrl(), { method: 'PUT', headers: ghHeaders(true), body: JSON.stringify(body) });
    if (r.status === 409) return { conflict: true };
    if (!r.ok) {
      let m = r.status;
      try { const j = await r.json(); m = j.message || m; } catch (e) { }
      throw new Error('写云端失败：' + m);
    }
    return { ok: true };
  }

  function dayKey(ts) {
    const d = new Date(ts), p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function summarize(entries) {
    const today = dayKey(Date.now());
    const sums = { me: 0, partner: 0 };
    for (const e of entries) {
      if (dayKey(e.ts) !== today) continue;
      sums[e.who === 'partner' ? 'partner' : 'me'] += e.totalKcal || 0;
    }
    return { today: today, todayByWho: sums, todayKcal: sums.me + sums.partner };
  }

  async function listEntries() {
    let entries = readLS(K_REC, []);
    let offline = false;
    if (getToken()) {
      try {
        const r = await ghRead();
        entries = r.entries;
        writeLS(K_REC, entries);
      } catch (e) { offline = e.message; }
    }
    entries.sort((a, b) => b.ts - a.ts);
    const s = summarize(entries);
    return { ok: true, entries: entries.slice(0, 200), today: s.today, todayByWho: s.todayByWho, todayKcal: s.todayKcal, offline: offline };
  }

  async function addEntry(data) {
    const entry = {
      id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now() + Math.random()),
      ts: Date.now(),
      who: data.who === 'partner' ? 'partner' : 'me',
      mealType: data.mealType || '',
      items: Array.isArray(data.items) ? data.items.slice(0, 20) : [],
      totalKcal: Math.round(Number(data.totalKcal) || 0),
      totals: data.totals || null,
      thumb: typeof data.thumb === 'string' && data.thumb.startsWith('data:image/') ? data.thumb : null,
      note: data.note || ''
    };
    if (!getToken()) {
      const local = readLS(K_REC, []);
      local.unshift(entry);
      writeLS(K_REC, local.slice(0, MAX_ENTRIES));
      return { ok: true, entry: entry, local: true };
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const cur = await ghRead();
      const merged = [entry].concat(cur.entries).slice(0, MAX_ENTRIES);
      const res = await ghWrite(merged, cur.sha, '记录一餐 ' + entry.totalKcal + 'kcal');
      if (res.ok) { writeLS(K_REC, merged); return { ok: true, entry: entry }; }
    }
    throw new Error('保存冲突了，再点一次就行');
  }

  async function removeEntry(id) {
    if (!getToken()) {
      const local = readLS(K_REC, []).filter(e => e.id !== id);
      writeLS(K_REC, local);
      return { ok: true, removed: 1 };
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const cur = await ghRead();
      const next = cur.entries.filter(e => e.id !== id);
      const res = await ghWrite(next, cur.sha, '删除一餐');
      if (res.ok) { writeLS(K_REC, next); return { ok: true, removed: cur.entries.length - next.length }; }
    }
    throw new Error('删除冲突了，再点一次');
  }

  /* ---------------- 识别 ---------------- */
  const PROMPT = '你是中西餐营养分析助手。看这张照片，识别里面所有能吃能喝的东西，并估计各自重量。\n\n' +
    '输出严格 JSON（不要 markdown 代码块，不要任何解释文字）：\n' +
    '{"mealType":"早餐|午餐|晚餐|加餐","items":[{"name":"名称","grams":200,"confidence":0.8}],"note":"一句话依据"}\n\n' +
    '规则：\n' +
    '1. 逐个列出，不要合并成一盘。主食、菜、汤、饮品、小菜、酱料都单独算。\n' +
    '2. 中餐西餐都要认：炒菜、面食、快餐汉堡披萨、意面、寿司、沙拉、烘焙甜点、水果零食都要能识别。\n' +
    '3. 饮品也要单独列出（咖啡、奶茶、果汁、汽水、酒），液体的 grams 用毫升数代替。\n' +
    '4. grams 用画面里的视觉参照估算：碗口直径约11cm、筷子约24cm、易拉罐高12cm、一次性纸杯约250ml、成人手掌宽8cm。米饭一平碗≈200g，一盘炒菜≈250g，一杯咖啡≈350ml，一瓶饮料≈500ml。\n' +
    '5. 用中文通用名称，不要写品牌（"可乐"而不是"可口可乐"）。不要写"约"、"大概"。\n' +
    '6. confidence 0-1，表示你对重量估计的信心。\n' +
    '7. 看不清或不确定是不是食物的，不要瞎猜，宁可不列。';

  // 从模型回复里尽量捞出物体数组：正规解析 → 修尾逗号 → 补全被截断的 JSON
  function extractItems(text) {
    const src = String(text || '');
    let s = src.trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();
    const a = s.indexOf('{');
    if (a >= 0) s = s.slice(a);

    // 1) 直接解析
    const tryParse = (t) => { try { return JSON.parse(t); } catch (e) { return null; } };
    let obj = tryParse(s);
    if (!obj) obj = tryParse(s.replace(/,\s*([}\]])/g, '$1'));
    if (obj && Array.isArray(obj.items)) return obj;

    // 2) 被 max_tokens 截断：逐个捞完整的 {"name":...,"grams":...} 片段
    const items = [];
    const re = /\{[^{}]*?"name"\s*:\s*"([^"]+)"[^{}]*?"grams"\s*:\s*(\d+(?:\.\d+)?)[^{}]*?\}/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      items.push({ name: m[1], grams: Number(m[2]), confidence: null });
    }
    if (items.length) {
      const mt = src.match(/"mealType"\s*:\s*"([^"]+)"/);
      const nt = src.match(/"note"\s*:\s*"([^"]*)"/);
      return { mealType: mt ? mt[1] : '', note: nt ? nt[1] : '', items: items, salvaged: true };
    }
    return null;
  }

  async function analyze(imageDataUrl) {
    const c = getRawConfig();
    if (!c.apiKey) { const e = new Error('还没有填 API Key，点右上角齿轮填一下'); e.code = 'NOKEY'; throw e; }

    const body = {
      model: c.model,
      messages: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: [
          { type: 'image_url', image_url: { url: imageDataUrl } },
          { type: 'text', text: '请识别并输出 JSON。' }
        ] }
      ],
      temperature: 0.1,
      // 思考过程也计入 max_tokens，给小了会把 JSON 截断，所以留足预算
      max_tokens: 3000,
      response_format: { type: 'json_object' }
    };

    let r;
    try {
      r = await fetch(c.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.apiKey },
        body: JSON.stringify(body)
      });
    } catch (err) {
      throw new Error('连不上模型服务，检查手机网络');
    }

    const text = await r.text();
    if (!r.ok) {
      let msg = text.slice(0, 300);
      try { const j = JSON.parse(text); msg = (j.error && (j.error.message || j.error.code)) || j.message || msg; } catch (e) { }
      if (r.status === 401 || r.status === 403) throw new Error('API Key 不对或已失效');
      if (r.status === 429) throw new Error('调用太频繁或额度用完了');
      throw new Error('模型返回 ' + r.status + '：' + msg);
    }

    let payload;
    try { payload = JSON.parse(text); } catch (e) { throw new Error('模型返回了无法解析的内容'); }
    const ch = (payload.choices && payload.choices[0]) || {};
    const msgObj = ch.message || {};
    const rawContent = msgObj.content;
    const content = Array.isArray(rawContent) ? rawContent.map(p => p.text || '').join('') : String(rawContent || '');
    const reasoning = String(msgObj.reasoning_content || '');

    // 正常在 content 里；万一只有思考字段里有，也捞一下
    let parsed = extractItems(content);
    if (!parsed && reasoning) parsed = extractItems(reasoning);

    if (!parsed || !Array.isArray(parsed.items) || !parsed.items.length) {
      if (ch.finish_reason === 'length') throw new Error('这张照片菜太多了，一次算不完，分开拍两张试试');
      throw new Error('没认出东西，换个角度或者凑近点再拍一张');
    }

    await FB.loadFoods();
    const items = parsed.items.slice(0, 15).map(it => {
      const name = String(it.name || '').trim() || '未识别';
      const grams = Math.max(1, Math.round(Number(it.grams) || 0)) || 100;
      const nut = FB.enrich(name, grams, it.kcal);
      return {
        name: name, grams: grams,
        kcal: nut.kcal, protein: nut.protein, carbs: nut.carbs, fat: nut.fat,
        matchedName: nut.matchedName, confidence: nut.confidence,
        modelConfidence: Number(it.confidence) || null,
        unit: nut.unit
      };
    });

    return {
      ok: true,
      mealType: parsed.mealType || '',
      note: (parsed.note || '') + (parsed.salvaged ? '（这张菜太多，只认到一部分）' : ''),
      items: items,
      totalKcal: items.reduce((s, i) => s + i.kcal, 0),
      totals: {
        protein: +items.reduce((s, i) => s + i.protein, 0).toFixed(1),
        carbs: +items.reduce((s, i) => s + i.carbs, 0).toFixed(1),
        fat: +items.reduce((s, i) => s + i.fat, 0).toFixed(1)
      },
      meta: { usage: payload.usage || null, model: c.model, finish: ch.finish_reason }
    };
  }

  async function api(path, opts) {
    const method = (opts && opts.method) || 'GET';
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    const u = new URL(path, 'http://x');
    const p = u.pathname;

    if (p === '/api/config') {
      if (method === 'GET') return publicConfig();
      const cur = getRawConfig();
      const next = {
        preset: body.preset != null ? body.preset : cur.preset,
        url: body.url != null ? body.url : cur.url,
        model: body.model != null ? body.model : cur.model,
        apiKey: body.apiKey === '' ? '' : (body.apiKey != null ? body.apiKey : cur.apiKey),
        meName: body.meName != null ? body.meName : cur.meName,
        partnerName: body.partnerName != null ? body.partnerName : cur.partnerName,
        goals: body.goals || cur.goals,
        profiles: body.profiles || cur.profiles
      };
      saveRawConfig(next);
      if (body.ghToken !== undefined) setToken(String(body.ghToken || '').trim());
      return publicConfig();
    }
    if (p === '/api/analyze' && method === 'POST') return analyze(body.image);
    if (p === '/api/history') {
      if (method === 'GET') {
        const q = u.searchParams.get('day');
        const r = await listEntries();
        if (q) r.entries = r.entries.filter(e => dayKey(e.ts) === q);
        return r;
      }
      if (method === 'POST') return addEntry(body);
      if (method === 'DELETE') return removeEntry(u.searchParams.get('id'));
    }
    throw new Error('未知接口 ' + p);
  }

  FB.api = api;
  FB.calcGoal = calcGoal;
  FB.getRawConfig = getRawConfig;
  FB.buildSetupLink = buildSetupLink;
  FB.extractItems = extractItems;
  global.api = api;

  document.addEventListener('DOMContentLoaded', function () {
    mountShareUI();
    if (justConfigured) {
      const t = document.getElementById('toast');
      if (t) {
        t.textContent = '已自动配置好，直接用吧';
        t.className = 'toast on';
        setTimeout(function () { t.className = 'toast'; }, 3000);
      }
    }
  });
})(window);
