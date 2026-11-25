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
    const minL = Math.min(cand.length, q.length);
    const maxL = Math.max(cand.length, q.length);
    const ratio = minL / maxL;
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
      for (const c of [f.n, ...(f.a || [])]) {
        const n = normalize(c);
        if (!n) continue;
        const s = score(n, q);
        if (s > bestScore) { bestScore = s; best = f; }
      }
    }
    return bestScore >= 40 ? { food: best, score: bestScore } : { food: null, score: bestScore };
  }

  FB.normalize = normalize;
  FB.matchFood = matchFood;
})(window);
