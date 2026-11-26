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

  // 支持两种写法：
  //   完整对象 { n, a, k, p, c, f, u }
  //   紧凑数组 [ 名称, 千卡, 蛋白, 碳水, 脂肪, 份量 ]
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
        map.set(key, f);   // 覆盖：后面的分片优先
      }
    }
    FOODS = Array.from(map.values());
    loaded = true;
    return FOODS;
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
    const k = Number(modelGuessKcal) > 0 ? Number(modelGuessKcal) : g * 1.5;
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
  FB.foodCount = () => FOODS.length;
})(window);
