/* 用本地热量库把「菜名 + 克数」折算成营养素（浏览器版） */
(function (global) {
  'use strict';
  const FB = global.FB = global.FB || {};

  let FOODS = [];
  let loaded = false;

  async function loadFoods() {
    if (loaded) return FOODS;
    const r = await fetch('data/foods.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('热量库加载失败');
    const j = await r.json();
    FOODS = j.foods || [];
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
