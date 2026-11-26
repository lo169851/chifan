/* 用本地热量库把「菜名 + 克数」折算成营养素（浏览器版）
   热量库分成多个文件，后加载的同名条目会覆盖前面的，方便单独写一片做修正。 */
(function (global) {
  'use strict';
  const FB = global.FB = global.FB || {};

  // 顺序即优先级：越靠后优先级越高（H 片是人工修正片）
  const PARTS = [
    'data/foods.json',
    'data/foods-b.json',
    'data/foods-c.json',
    'data/foods-d.json',
    'data/foods-e.json',
    'data/foods-f.json',
    'data/foods-g.json',
    'data/foods-h.json'
  ];

  let FOODS = [];
  let loaded = false;

  function normOne(x) {
    if (Array.isArray(x) && x.length >= 5) {
      return {
        n: String(x[0]), a: [],
        k: Number(x[1]) || 0, p: Number(x[2]) || 0,
        c: Number(x[3]) || 0, f: Number(x[4]) || 0,
        u: x[5] || null
      };
    }
    if (x && typeof x === 'object' && x.n) {
      return {
        n: String(x.n), a: x.a || [],
        k: Number(x.k) || 0, p: Number(x.p) || 0,
        c: Number(x.c) || 0, f: Number(x.f) || 0,
        u: x.u || null
      };
    }
    return null;
  }

  async function loadFoods() {
    if (loaded) return FOODS;
    const packs = await Promise.all(PARTS.map(p =>
      fetch(p, { cache: 'no-cache' })
        .then(r => (r.ok ? r.json() : { foods: [] }))
        .catch(() => ({ foods: [] }))
    ));
    const map = new Map();
    for (const pack of packs) {
      for (const raw of (pack.foods || [])) {
        const f = normOne(raw);
        if (!f || !f.n) continue;
        const key = f.n.trim();
        if (!key) continue;
        map.set(key, f);
      }
    }
    FOODS = Array.from(map.values());
    loaded = true;
    return FOODS;
  }

  // 库里没有的东西怎么估：按名字猜类别，别再一律 1.5 千卡/克
  function fallbackKcal(name, g, guess) {
    if (Number(guess) > 0) return Math.round(Number(guess));
    const s = String(name || '').trim();
    // 纯水
    if (/^(水|白水|瓶装水|矿泉水|纯净水|饮用水|凉白开|白开水|冰水|热水|温水|苏打水|气泡水)$/.test(s)) return 0;
    // 其他饮品：按 25 千卡/100 估
    if (/水|茶|咖啡|汽水|可乐|饮料|果汁|酒/.test(s)) return Math.round(g * 0.25);
    // 汤羹粥：按 40 千卡/100 估
    if (/汤|粥|羹/.test(s)) return Math.round(g * 0.4);
    // 普通菜：按 150 千卡/100 估，但不超过 900 千卡/100g
    return Math.round(Math.min(g * 1.5, g * 9));
  }

  function enrich(name, grams, modelGuessKcal) {
    const f = FB.matchFood(name, FOODS).food;
    const g = Math.max(1, Number(grams) || 0);
    if (f) {
      return {
        kcal: Math.round(f.k * g / 100),
        protein: +(f.p * g / 100).toFixed(1),
        carbs: +(f.c * g / 100).toFixed(1),
        fat: +(f.f * g / 100).toFixed(1),
        matchedName: f.n, confidence: 'high', unit: f.u || null
      };
    }
    const k = fallbackKcal(name, g, modelGuessKcal);
    return {
      kcal: Math.round(k),
      protein: +(g * 0.06).toFixed(1),
      carbs: +(g * 0.12).toFixed(1),
      fat: +(g * 0.05).toFixed(1),
      matchedName: null, confidence: 'low', unit: null
    };
  }

  FB.loadFoods = loadFoods;
  FB.enrich = enrich;
  FB.fallbackKcal = fallbackKcal;
  FB.foodCount = () => FOODS.length;
})(window);
