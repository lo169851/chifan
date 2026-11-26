/* 名称 → 热量库条目的模糊匹配（浏览器版，挂在 window.FB 下） */
(function (global) {
  'use strict';
  const FB = global.FB = global.FB || {};

  function normalize(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[\s·、,，.。()（）\-—_/\\+:：!！?？]/g, '')
      .replace(/(一份|一盘|一碗|一杯|一瓶|一罐|一个|一块|一根|一包|一串|一笼|一勺|一张|一条|一瓣|一颗|一小把|少许|适量|大概|大约|约|左右|多点|少点)/g, '')
      .replace(/[0-9]+(g|克|ml|毫升|kcal|千卡|大卡)/g, '');
  }

  function score(cand, q) {
    if (cand === q) return 100;
    // 单字查询只能精确命中，否则"水"会匹配到"糖水"
    if (q.length <= 1) return 0;
    const minL = Math.min(cand.length, q.length);
    const maxL = Math.max(cand.length, q.length);
    const ratio = minL / maxL;
    // 中文菜名的中心词几乎总在末尾（"韭菜鸡蛋饺子"→饺子），后缀命中权重最高
    if (q.endsWith(cand)) return 84 + ratio * 12;
    if (cand.endsWith(q)) return 78 + ratio * 12;
    if (q.includes(cand) || cand.includes(q)) return 58 + ratio * 20;
    const set = new Set(cand);
    let hit = 0;
    for (const ch of q) if (set.has(ch)) hit++;
    const r = hit / Math.max(cand.length, 1);
    const qr = hit / Math.max(q.length, 1);
    if (hit >= 2 && r >= 0.55) return 28 + r * 18 + qr * 10;
    return 0;
  }

  function matchFood(name, foods) {
    const q = normalize(name);
    if (!q) return { food: null, score: 0 };
    let best = null, bestScore = 0;
    for (const f of foods || []) {
      const cands = [f.n].concat(f.a || []);
      for (let i = 0; i < cands.length; i++) {
        const n = normalize(cands[i]);
        if (!n) continue;
        let s = score(n, q);
        // 本名（i=0）永远比别名优先，避免"全脂牛奶"被当成"牛奶"的别名
        if (s > 0 && i === 0) s += 0.5;
        if (s > bestScore) { bestScore = s; best = f; }
      }
    }
    return bestScore >= 40 ? { food: best, score: bestScore } : { food: null, score: bestScore };
  }

  FB.normalize = normalize;
  FB.matchFood = matchFood;
})(window);
