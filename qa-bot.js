/* QA-бот (не входит в игру): прогоняет забег синтетически, чтобы мерить баланс. */
window.BOT2 = function (opt) {
  var G = NH.Game, R = NH.R, cv = document.getElementById('cv'), C = NH.DATA.CONFIG;
  var to = function (x, y) { return { x: x * R.scale + R.ox, y: y * R.scale + R.oy }; };
  var cellC = function (i) { return { x: C.GRID.x + C.GRID.cell * ((i % 4) + 0.5), y: C.GRID.y + C.GRID.cell * (Math.floor(i / 4) + 0.5) }; };
  var ev = function (t, p, id) { cv.dispatchEvent(new PointerEvent(t, { clientX: p.x, clientY: p.y, pointerId: id, bubbles: true })); };
  var tap = function (p, id) { ev('pointerdown', p, id); ev('pointerup', p, id); };
  var dragTo = function (p1, p2, id) { ev('pointerdown', p1, id); ev('pointermove', p2, id); ev('pointerup', p2, id); };
  var drag = function (a, b, id) { var p1 = to(cellC(a).x, cellC(a).y), p2 = to(cellC(b).x, cellC(b).y); dragTo(p1, p2, id); };
  NH.UI.showScreen('home');
  G.start(Object.assign({ mode: 'run', mods: [] }, opt || {}));
  var err = null;
  try {
    for (var i = 0; i < 4000; i++) {
      if (i % 4 === 0) tap(to(C.REACTOR.x, C.REACTOR.y), 61);
      if (i % 5 === 2) {                       // слияние равных
        var by = {};
        G.grid.forEach(function (u, j) { if (u) (by[u.level] = by[u.level] || []).push(j); });
        var k = Object.keys(by).map(Number).sort(function (a, b) { return b - a; }).find(function (k) { return by[k].length > 1; });
        if (k != null) drag(by[k][0], by[k][1], 62);
      }
      if (i % 5 === 3) {                       // strongest -> строй
        var lv = G.grid.map(function (u, j) { return u ? { j: j, l: u.level } : null; }).filter(Boolean).sort(function (a, b) { return b.l - a.l; })[0];
        if (lv && lv.l >= 2 && !G.front.filter(Boolean).length) {
          var lane = lv.j % 4, p1 = to(cellC(lv.j).x, cellC(lv.j).y);
          dragTo(p1, to(R.laneX(lane), C.CORE_Y - 24), 63);
        }
      }
      if (i % 40 === 20 && G.echoCharges > 0 && G.echoT <= 0 && G.wave >= 5) G.echoSurge();
      G.tick(0.05);
      if (G.state === 'over') break;
    }
  } catch (e) { err = e.stack; }
  return {
    err: err, t: Math.round(G.time), wave: G.wave, score: Math.round(G.score), kills: G.kills, merges: G.merges,
    core: Math.round(G.core) + '/' + G.coreMax, leaks: G.leaks,
    best: G.units().reduce(function (a, u) { return Math.max(a, u.level); }, 0),
    res: G.result && { win: G.result.win, score: G.result.score, coins: G.result.coins, beat: G.result.beat }
  };
};

/* BOT3 — «игрок, думающий о дорожках»: качает самый слабый столбец, периодически выдвигает в строй.
   opt.stop — остановить на N тиков (для скриншотов), opt.ticks — лимит (по умолчанию 4000). */
window.BOT3 = function (opt) {
  opt = opt || {};
  var G = NH.Game, R = NH.R, cv = document.getElementById('cv'), C = NH.DATA.CONFIG;
  var to = function (o) { return { x: o.x * R.scale + R.ox, y: o.y * R.scale + R.oy }; };
  var cellC = function (i) { return { x: C.GRID.x + C.GRID.cell * ((i % 4) + 0.5), y: C.GRID.y + C.GRID.cell * (Math.floor(i / 4) + 0.5) }; };
  var ev = function (t, p, id) { cv.dispatchEvent(new PointerEvent(t, { clientX: p.x, clientY: p.y, pointerId: id, bubbles: true })); };
  var drag = function (a, b, id) { var p1 = to(cellC(a)), p2 = to(cellC(b)); ev('pointerdown', p1, id); ev('pointermove', p2, id); ev('pointerup', p2, id); };
  var merge = function () {                     // слияние равных в самом слабом столбце
    var colMax = [0, 1, 2, 3].map(function (l) { return Math.max(-1, Math.max.apply(null, [-1].concat(G.grid.map(function (u, j) { return (j % 4 === l && u) ? u.level : -1; })))); });
    var order = [0, 1, 2, 3].sort(function (a, b) { return colMax[a] - colMax[b]; });
    for (var o = 0; o < order.length; o++) {
      var l = order[o], by = {};
      G.grid.forEach(function (u, j) { if (u && j % 4 === l) (by[u.level] = by[u.level] || []).push(j); });
      var k = Object.keys(by).map(Number).sort(function (a, b) { return b - a; }).find(function (k) { return by[k].length > 1; });
      if (k != null) { drag(by[k][0], by[k][1], 82); return true; }
    }
    return false;
  };
  var wall = function (minLvl) {                 // лучший свободный юнит -> стена своей дорожки
    var cand = G.grid.map(function (u, j) { return { u: u, j: j }; }).filter(function (o) { return o.u && o.u.level >= minLvl && !G.front[o.j % 4]; })
      .sort(function (a, b) { return b.u.level - a.u.level; })[0];
    if (!cand) return false;
    G.advance(cand.u, 'grid', cand.j, cand.j % 4); return true;
  };
  NH.UI.showScreen(null);
  G.start(Object.assign({ mode: 'run', mods: [] }, opt));
  var err = null;
  try {
    for (var i = 0; i < (opt.ticks || 4000); i++) {
      if (i % 4 === 0) { var p = to(C.REACTOR); ev('pointerdown', p, 81); ev('pointerup', p, 81); }
      if (i % 5 === 2) merge();
      if (i % 9 === 4) wall(4);
      if (i % 40 === 20 && G.echoCharges > 0 && G.echoT <= 0 && G.wave >= 5) G.echoSurge();
      G.tick(0.05);
      if (G.state === 'over' || (opt.stop && i >= opt.stop)) break;
    }
  } catch (e) { err = e.stack; }
  var hist = {}; G.units().forEach(function (u) { hist[u.level] = (hist[u.level] || 0) + 1; });
  return {
    err: err, t: Math.round(G.time), wave: G.wave, score: Math.round(G.score), kills: G.kills, merges: G.merges,
    core: Math.round(G.core) + '/' + G.coreMax, leaks: G.leaks, hist: hist, wall: G.front.map(function (u) { return u ? u.level : null; }),
    res: G.result && { win: G.result.win, score: G.result.score, coins: G.result.coins, beat: G.result.beat }
  };
};
