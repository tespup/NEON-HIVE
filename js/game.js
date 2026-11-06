/* NEON HIVE — ядро геймплея: merge-2 улей → 4 дорожки → волны → итог → драфт.
   Вся детерминация забега идёт от одного seed: расклад волн воспроизводим (Эхо/челленджи). */
window.NH = window.NH || {};
(function (NH) {
  'use strict';
  const U = NH.U, D = NH.DATA, R = NH.R, S = NH.Save, TG = NH.TG;
  const C = D.CONFIG, G = NH.Game = {};

  G.state = 'idle';        // idle | play | pause | draft | over
  G.mode = 'run';

  /* ── Запуск забега ────────────────────────────────────────────────── */
  G.start = (opt) => {
    opt = opt || {};
    G.mode = opt.mode || 'run';
    G.seed = String(opt.seed || (Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36)));
    G.rng = U.rng(G.seed);
    G.chal = opt.chal || null;                  // {seed,name,score,track}
    G.ghostSrc = opt.ghost || null;             // {name,score,track,me}
    G.mods = (opt.mods != null ? opt.mods : (S.s.mods || [])).map(m => typeof m === 'string' ? D.MODIFIERS.find(x => x.id === m) : m).filter(Boolean);
    G.ev = S.eventNow();
    G.mod = G.aggregate(G.mods);

    G.time = 0; G.score = 0; G.kills = 0; G.merges = 0; G.taps = 0; G.fissions = 0;
    G.coins = 0; G.bosses = 0; G.leaks = 0;
    G.grid = []; for (let i = 0; i < 16; i++) G.grid.push(null);
    G.front = [null, null, null, null];
    G.foes = []; G.shots = []; G.zap = [];
    G.energyMax = C.ENERGY_MAX * (1 + (G.mod.energyMax || 0)) + (S.s.boosters.energy ? 70 : 0);
    G.energy = G.energyMax * 0.55;
    G.regen = C.ENERGY_REGEN * (1 + (G.mod.energyRegen || 0)) * S.energyRegen() * (S.s.boosters.energy ? 1.35 : 1);
    G.coreMax = Math.round((S.coreHp()) * (1 + (G.mod.coreHp || 0)));
    G.core = G.coreMax;
    G.shield = S.s.boosters.shield ? 4 : 0;
    G.revive = S.s.boosters.revive ? 1 : 0;
    G.fissionFree = (S.s.boosters.fission ? 3 : 0) + (G.mod.fissionFree || 0);
    G.fury = S.s.boosters.fury ? 1.25 : 1;
    G.echoCharges = S.echoCharges() + ((G.ev && G.ev.echoCharge) || 0); G.echoT = 0;
    G.wave = 0; G.waveT = 1.2; G.breakT = 1.2; G.list = null; G.spawnT = 0;
    G.surge = false;
    G.waves = G.mode === 'siege' ? 999 : (G.mode === 'echo' ? C.RUN_WAVES : C.RUN_WAVES);
    G.track = []; G.trackT = 0;
    G.msg = null; G.msgT = 0;
    G.drag = null; G.hinted = {}; G._pair = null;
    G.record = null; G.draftPick = null;
    G.result = null;

    if (S.s.boosters.startlvl || G.mod.startComb) {
      const pool = S.unlockedLineages();
      for (let i = 0; i < 3; i++) G.put(G.make(U.pick(pool), 2));
    }
    G.state = 'play';
    G.toastWave('Расклад ' + G.seed.slice(0, 6).toUpperCase(), 165);
    G.hint('tap');
    if (NH.UI) NH.UI.showScreen(null);
  };

  G.aggregate = (mods) => {
    const a = { dmgMul: 1, rateMul: 1, coinMul: 1, spawnCostMul: 1, energyRegen: 0, energyMax: 0, coreHp: 0, recycleMul: 1, fissionFree: 0, critAdd: 0, pierceAdd: 0, chainAdd: 0, startComb: 0, zapDeath: 0, lifesteal: 0, echoPower: 0, slowAdd: 0, surgeScore: 0, dotMul: 1, enemyHp: 0 };
    const feed = m => {
      if (!m) return;
      for (const k in m) {
        if (k === 'id' || k === 'name' || k === 'desc' || k === 'short' || k === 'rar' || k === 'need') continue;
        const v = m[k];
        if (typeof v !== 'number') continue;
        if (k === 'dmgMul' || k === 'rateMul' || k === 'coinMul' || k === 'spawnCostMul' || k === 'recycleMul' || k === 'dotMul') a[k] *= (1 + v);
        else if (k in a) a[k] += v;
      }
    };
    mods.forEach(feed);
    feed(G.ev);                                  // live-ивент поверх цепочки
    return a;
  };

  /* ── Юниты ────────────────────────────────────────────────────────── */
  G.rarityRoll = () => {
    const tot = D.RARITY.reduce((s, r) => s + r.w, 0);
    let x = G.rng() * tot;
    for (const r of D.RARITY) { if ((x -= r.w) <= 0) return r.id; }
    return 0;
  };
  G.rollLineage = () => {
    const rar = G.rarityRoll();
    let pool = S.unlockedLineages().filter(l => l.rar === rar);
    if (!pool.length) pool = S.unlockedLineages();
    return U.pick(pool);
  };
  G.make = (lin, level) => ({
    uid: (G._uid = (G._uid || 0) + 1), lin, level: level || 0, mut: null,
    cool: 0, shots: 0, front: false
  });
  G.stats = (u) => {
    const b = u.lin.base, m = G.mod, ev = G.ev;
    const lvl = u.level, stars = (S.s.collection[u.lin.id] || {}).stars || 0;
    let dmg = b.dmg * Math.pow(1.68, lvl) * S.dmgMul() * m.dmgMul * G.fury * (1 + stars * 0.08) * (ev && ev.id === 'brood' ? 1.15 : 1);
    let rate = b.rate * Math.pow(1.12, lvl) * m.rateMul * (1 + lvl * 0.01);
    if (G.echoT > 0) dmg *= 1 + C.ECHO_POWER + m.echoPower;
    if (G.echoT > 0) rate *= 1.12;
    return {
      dmg, rate, ps: b.ps, kind: b.kind,
      splash: (b.splash || 0) + (lvl > 5 ? 14 : 0),
      pierce: (b.pierce || 0) + m.pierceAdd + (u.mut && u.mut.id === 'ricochet' ? 2 : 0),
      chain: (b.chain || 0) + m.chainAdd,
      crit: (b.crit || 0) + m.critAdd + (u.mut && u.mut.id === 'overshoot' ? 0.18 : 0),
      critX: b.critX || 2.2,
      slow: (b.slow || 0) + m.slowAdd + (u.mut && u.mut.id === 'hoarfrost' ? 0.35 : 0),
      slowT: b.slowT || 1.4,
      dot: b.dot ? b.dot * (1 + lvl * 0.4) * (ev && ev.id === 'venom' ? 1.4 : 1) : (u.mut && u.mut.id === 'toxin' ? 6 + lvl * 3 : 0),
      dotT: b.dotT || 4,
      energy: (b.energy || 0) + (u.mut && u.mut.id === 'dynamo' ? 0.35 * (lvl + 1) : 0),
      twin: u.mut && u.mut.id === 'twinshot',
      burn: u.mut && u.mut.id === 'blaze' ? 12 + lvl * 4 : 0,
      arc: u.mut && u.mut.id === 'arc' ? 2 : 0,
      hue: u.lin.hue + (u.mut ? (u.mut.hue - u.lin.hue) * 0.25 : 0)
    };
  };
  G.units = () => G.grid.filter(Boolean).concat(G.front.filter(Boolean));
  G.spawnCost = () => Math.max(1, Math.round(C.ENERGY_COST * (1 + C.SPAWN_COST_GROWTH * G.units().length) * G.mod.spawnCostMul));
  G.put = (u) => {
    for (let i = 0; i < 16; i++) if (!G.grid[i]) { G.grid[i] = u; const p = G.cellPos(i); R.ring(p.x, p.y, u.lin.hue, 8, 60); return i; }
    return -1;
  };
  G.cellPos = (i) => ({ x: C.GRID.x + C.GRID.cell * ((i % 4) + 0.5), y: C.GRID.y + C.GRID.cell * (Math.floor(i / 4) + 0.5) });
  G.frontPos = (l) => ({ x: R.laneX(l), y: C.CORE_Y + 46 });
  G.find = (uid) => {
    for (let i = 0; i < 16; i++) if (G.grid[i] && G.grid[i].uid === uid) return { u: G.grid[i], where: 'grid', i };
    for (let l = 0; l < 4; l++) if (G.front[l] && G.front[l].uid === uid) return { u: G.front[l], where: 'front', i: l };
    return null;
  };

  /* ── Волны: детерминированный генератор от seed ───────────────────── */
  G.wavePlan = (w) => {
    const rng = U.rng(G.seed + ':w' + w);
    const keys = ['mite', 'mite', 'skarab', 'moth'];
    if (w >= 2) keys.push('splitter'); if (w >= 3) keys.push('goliath');
    if (w >= 4) keys.push('armos'); if (w >= 5) keys.push('phantom'); if (w >= 3) keys.push('moth', 'skarab');
    const boss = (G.mode === 'siege') ? (w % 8 === 0) : (w >= C.RUN_WAVES);
    const n = Math.round((3 + w * 1.2) * (G.mode === 'siege' ? 1 + w * 0.05 : 1));
    const list = [];
    for (let i = 0; i < n; i++) {
      const k = keys[Math.floor(rng() * keys.length)];
      list.push({ k, lane: Math.floor(rng() * 4), jitter: rng() });
    }
    if (boss) list.push({ k: 'boss', lane: 1 + Math.floor(rng() * 2), jitter: 0.5, boss: 1 });
    const hpS = (1 + 0.24 * w + w * w * 0.011 + S.s.prestige.count * 0.5) * (w >= C.RUN_WAVES ? C.SURGE_LAST : 1) * (1 + G.mod.enemyHp);
    return { list, hpS, boss, t0: 0 };
  };
  G.nextWave = () => {
    G.wave++;
    G.list = G.wavePlan(G.wave);
    G.spawnT = 0; G.surge = !!G.list.boss;
    G.trackWave = G.wave;
    S.count('s_wave', 1);
    if (G.surge) { G.toastWave('ВОЛНА ' + G.wave + ' · МАТКА', 350); NH.fx('boss', 'heavy', [30, 60, 30]); }
    else { G.toastWave('ВОЛНА ' + G.wave, 186); NH.fx('wave', 'light', 18); }
    if (G.wave > S.s.stats.bestWave) { S.s.stats.bestWave = G.wave; S.save(true); }
  };
  G.spawn = (e) => {
    const def = D.ENEMIES[e.k];
    const hp = def.hp * G.list.hpS;
    const f = {
      def, x: R.laneX(e.lane) + (G.rng() - 0.5) * 22, y: C.LANE_TOP - 40, lane: e.lane,
      hp, hpMax: hp, spd: def.spd * (1 + G.wave * 0.012), r: def.r,
      burn: 0, poison: 0, pt: 0, slowed: 0, slowT: 0, stun: 0, ph: G.rng() * 6, hueShift: 0,
      zig: def.art.zig ? 1 : 0, phase: def.art.phase ? 1 : 0
    };
    if (def.art.armor) f.armor = def.art.armor;
    if (def.art.armorFlat) f.armorFlat = def.art.armorFlat;
    G.foes.push(f);
  };

  /* ── Основной тик ─────────────────────────────────────────────────── */
  G.tick = (dt) => {
    if (G.state !== 'play') return;
    dt = Math.min(dt, 0.05);
    G.time += dt; R.fx(dt);

    /* энергия */
    let reg = G.regen;
    G.units().forEach(u => { const st = G.stats(u); if (st.energy) reg += st.energy * (u.level + 1) * 0.5; });
    G.energy = Math.min(G.energyMax, G.energy + reg * dt);

    /* поддержка Эха */
    if (G.echoT > 0) G.echoT -= dt;
    if (G.msgT > 0) G.msgT -= dt;

    /* спавн волны */
    if (G.list) {
      G.spawnT += dt;
      const gap = Math.max(0.28, 0.95 - G.wave * 0.03);
      while (G.list.list.length && G.spawnT >= gap) {
        G.spawnT -= gap;
        G.spawn(G.list.list.shift());
      }
      if (!G.list.list.length && !G.foes.length) {
        G.list = null; G.breakT = C.WAVE_BREAK;
        G.score += 120 + G.wave * 26;
        if (G.wave % 2 === 0) G.score += 60;
        if (G.wave >= G.waves) return G.finish(true);
      }
    } else if (G.breakT > 0) {
      G.breakT -= dt;
      if (G.breakT <= 0) G.nextWave();
    }

    G.moveFoes(dt);
    G.fire(dt);
    G.moveShots(dt);
    if (G.zap.length) G.zap = G.zap.filter(z => (z.t -= dt) > 0);

    /* трек для Эха: снимок счёта каждые 2 секунды */
    G.trackT += dt;
    if (G.trackT >= 2) { G.trackT -= 2; G.track.push(Math.round(G.score)); if (G.track.length > 90) G.track.shift(); }
  };

  G.moveFoes = (dt) => {
    for (let i = G.foes.length - 1; i >= 0; i--) {
      const f = G.foes[i];
      /* статусы */
      if (f.burn > 0) { f.burn -= dt; f.hp -= 0; }
      if (f.poison > 0) {
        f.pt -= dt;
        if (f.pt <= 0) { f.hp -= f.poison * 0.25; f.pt = 0.25; }
        f.poison -= dt;
      }
      if (f.stun > 0) { f.stun -= dt; }
      else {
        let sp = f.spd * (f.slowT > 0 ? (1 - f.slow) : 1);
        if (f.slowT > 0) f.slowT -= dt;
        f.y += sp * dt;
        if (f.zig) f.x = R.laneX(f.lane) + Math.sin(G.time * 3 + f.ph) * 34;
      }
      if (f.hp <= 0) { G.kill(f, i); continue; }
      if (f.y >= C.CORE_Y) { G.leak(f, i); }
    }
  };
  G.kill = (f, i) => {
    G.foes.splice(i, 1); G.kills++;
    const coin = Math.round(f.def.coin * S.coinMul() * G.mod.coinMul * (1 + G.wave * 0.05) * (G.ev && G.ev.id === 'honeyrain' ? 1.3 : 1));
    G.coins += coin; G.score += 10 + f.def.coin * 1.6;
    S.count('s_kills', 1);
    if (f.def.art.boss) { G.bosses++; S.count('s_boss', 1); G.score += 1500; }
    R.burst(f.x, f.y, f.def.hue, f.def.art.boss ? 46 : 12, f.def.art.boss ? 260 : 130);
    R.float(f.x, f.y, '+' + U.fmt(coin), 44, f.def.art.boss ? 30 : 19);
    NH.fx(f.def.art.boss ? 'boss' : 'kill', f.def.art.boss ? 'heavy' : null, f.def.art.boss ? [20, 40] : null);
    if (f.def.art.split) {
      for (let k = 0; k < 2; k++) {
        const child = { def: D.ENEMIES.mite, x: f.x + (k ? 26 : -26), y: f.y, lane: f.lane, hp: f.hpMax * 0.16, hpMax: f.hpMax * 0.16, spd: f.spd * 1.3, r: 13, burn: 0, poison: 0, pt: 0, slowed: 0, slowT: 0, stun: 0, ph: f.ph, zig: 0, hueShift: 20 };
        G.foes.push(child);
      }
    }
    if (G.mod.zapDeath) G.zapFoes(f.x, f.y, 150, f.hpMax * G.mod.zapDeath);
    if (G.mod.lifesteal) G.core = Math.min(G.coreMax, G.core + G.coreMax * G.mod.lifesteal);
  };
  G.leak = (f, i) => {
    const fr = G.front[f.lane];
    G.foes.splice(i, 1); G.leaks++;
    if (fr) {                                    /* фронтальный сот принимает удар вместо улья */
      const p = G.frontPos(f.lane);
      const dead = fr.level <= 0;                /* ранг 0 → сот разрушен, иначе −1 ранг */
      if (!dead) fr.level--;
      else G.front[f.lane] = null;
      R.burst(p.x, p.y, fr.lin.hue, dead ? 26 : 16, 200); R.ring(p.x, p.y, 0, 10, 90);
      G.toast(dead ? 'Строй пробит: ' + fr.lin.name + ' погиб' : 'Удар принят: ' + fr.lin.name + ' треснул (−1 ранг)', dead ? 356 : 165);
      NH.fx('hurt', 'heavy', [40, 30]);
      return;
    }
    let dmg = f.def.dmg * (1 + G.wave * 0.035);
    if (G.shield > 0) { G.shield--; G.toast('Щит погасил удар (' + G.shield + ')', 186); return; }
    G.core -= dmg;
    R.doShake(f.def.art.boss ? 26 : 11); R.doFlash('#ff2b52', f.def.art.boss ? 0.5 : 0.18);
    NH.fx('hurt', 'heavy', [25, 25]);
    if (G.core <= 0) {
      if (G.revive > 0) {
        G.revive--; G.core = Math.round(G.coreMax * 0.45); G.foes.length = 0;
        R.doFlash('#8dffb0', 0.6); G.toast('ВТОРОЕ ДЫХАНИЕ', 140); TG.notify('success');
      } else return G.finish(false);
    }
  };
  G.zapFoes = (x, y, r, dmg) => {
    G.foes.forEach(f => { if (U.dist(f.x, f.y, x, y) < r) f.hp -= dmg; });
    G.zap.push({ x, y, r, t: 0.25, hue: 200 });
  };

  /* ── Стрельба роя ─────────────────────────────────────────────────── */
  G.fire = (dt) => {
    const act = (u, pos) => {
      const st = G.stats(u);
      u.cool -= dt;
      const foes = G.foes.filter(f => f.lane === pos.lane && f.y < C.CORE_Y + 30 && f.y > 40);
      if (u.cool <= 0) {
        if (foes.length) {
          u.cool = 1 / Math.max(0.08, st.rate);
          const n = st.twin && (u.shots % 3 === 2) ? 2 : 1;
          for (let k = 0; k < n; k++) G.shoot(u, st, pos, foes[k % foes.length], k);
          u.shots++;
        } else u.cool = 0.06;
      }
    };
    for (let i = 0; i < 16; i++) { const u = G.grid[i]; if (!u) continue; const p = G.cellPos(i); act(u, { x: p.x, y: p.y - 34, lane: i % 4 }); }
    for (let l = 0; l < 4; l++) { const u = G.front[l]; if (!u) continue; const p = G.frontPos(l); act(u, { x: p.x, y: p.y - 30, lane: l }); }
  };
  G.shoot = (u, st, pos, target, k) => {
    let dmg = st.dmg;
    let crit = false;
    if (st.crit && G.rng() < st.crit) { dmg *= st.critX; crit = true; }
    const spread = (k || 0) * 8 - 4;
    const dx = (target.x - pos.x) + spread, dy = target.y - pos.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const b = {
      x: pos.x, y: pos.y, vx: dx / d * st.ps, vy: dy / d * st.ps,
      dmg, hue: st.hue, crit, kind: st.kind, w: crit ? 5 : 3,
      splash: st.splash, pierce: st.pierce, hits: 0, chain: st.chain, trail: null,
      slow: st.slow, slowT: st.slowT, dot: st.dot, dotT: st.dotT, burn: st.burn, arc: st.arc,
      dead: false
    };
    if (st.chain) b.trail = [{ x: b.x, y: b.y }];
    G.shots.push(b);
    NH.fx('shot', null, null);
    R.trail(pos.x, pos.y, st.hue);
  };
  G.moveShots = (dt) => {
    for (let i = G.shots.length - 1; i >= 0; i--) {
      const b = G.shots[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.trail) { b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 6) b.trail.shift(); }
      if (b.y < 20 || b.y > C.CORE_Y + 60 || b.x < -40 || b.x > C.W + 40) { G.shots.splice(i, 1); continue; }
      for (let j = 0; j < G.foes.length; j++) {
        const f = G.foes[j];
        if (f.phase && Math.sin(G.time * 5 + f.ph) < -0.2) continue;
        if (U.dist(b.x, b.y, f.x, f.y) < f.r + 8) { G.hit(b, f, j); break; }
      }
      if (b.dead || (b.pierce != null && b.hits > b.pierce)) G.shots.splice(i, 1);
    }
  };
  G.hit = (b, f, j) => {
    let dmg = b.dmg;
    if (f.armor) dmg *= (1 - f.armor);
    if (f.armorFlat && b.kind === 'splash') dmg *= 0.45;
    f.hp -= dmg;
    b.hits++;
    if (b.slow) { f.slow = Math.max(f.slow || 0, b.slow); f.slowT = b.slowT; }
    if (b.dot) { f.poison = Math.max(f.poison, b.dot); f.poisonT = b.dotT; f.hp -= 0; }
    if (b.burn) f.burn = 3;
    if (b.crit) { R.float(f.x, f.y - 12, 'КРИТ ' + U.fmt(dmg), 350, 22); R.doShake(4); }
    R.burst(b.x, b.y, b.hue, b.crit ? 12 : 5, b.crit ? 150 : 70);
    if (b.splash) {
      const r = b.splash;
      G.foes.forEach(o => { if (o !== f && U.dist(o.x, o.y, b.x, b.y) < r) o.hp -= dmg * 0.6; });
      R.ring(b.x, b.y, b.hue, 8, r);
    }
    if (b.arc) {
      const near = G.foes.filter(o => o !== f && Math.abs(o.lane - f.lane) <= 1 && Math.abs(o.y - f.y) < 160).slice(0, b.arc);
      near.forEach(o => { o.hp -= dmg * 0.55; R.burst(o.x, o.y, 265, 4, 60); });
    }
    if (b.chain) {
      const targets = G.foes.filter(o => o !== f && U.dist(o.x, o.y, f.x, f.y) < 190).slice(0, b.chain);
      const prev = { x: f.x, y: f.y };
      targets.forEach(o => {
        o.hp -= dmg * 0.5;
        G.zap.push({ x: prev.x, y: prev.y, x2: o.x, y2: o.y, t: 0.18, hue: b.hue, bolt: 1 });
        prev.x = o.x; prev.y = o.y;
      });
    }
    if (f.hp <= 0) { const idx = G.foes.indexOf(f); if (idx >= 0) G.kill(f, idx); }
    b.dead = b.pierce > 0 ? false : true;
    if (b.pierce > 0) b.dmg *= 0.85;
  };

  /* ── Ввод: тап по реактору, drag-merge, падды, выдвижение в строй ──── */
  G.down = (x, y) => {
    if (G.state !== 'play') return;
    const rc = C.REACTOR;
    if (U.dist(x, y, rc.x, rc.y) < rc.r * 1.35) return G.tapReactor();
    if (U.dist(x, y, C.ECHO_BTN.x, C.ECHO_BTN.y) < C.ECHO_BTN.r + 8) return G.echoSurge();
    /* своя фронтальная ячейка или сот в сетке → начинаем перетаскивание */
    for (let l = 0; l < 4; l++) {
      const p = G.frontPos(l), u = G.front[l];
      if (u && U.dist(x, y, p.x, p.y) < 62) { G.beginDrag(u, 'front', l, x, y); return; }
    }
    const g = C.GRID;
    const cx = Math.floor((x - g.x) / g.cell), cy = Math.floor((y - g.y) / g.cell);
    if (cx >= 0 && cy >= 0 && cx < g.cols && cy < g.rows) {
      const i = cy * g.cols + cx, u = G.grid[i];
      if (u) G.beginDrag(u, 'grid', i, x, y);
    }
  };
  G.move = (x, y) => { if (G.drag) { G.drag.x = x; G.drag.y = y; } };
  G.up = (x, y) => { if (G.drag) G.endDrag(x, y); };
  G.beginDrag = (u, where, i, x, y) => {
    G.drag = { u, where, i, x, y, sx: x, sy: y };
    NH.fx('pick', 'light', 8);
  };
  G.endDrag = (x, y) => {
    const d = G.drag; G.drag = null;
    const P = C.PADS;
    if (U.dist(x, y, P.fission.x, P.fission.y) < P.fission.r + 26) return G.fission(d.u, d.where, d.i);
    if (U.dist(x, y, P.recycle.x, P.recycle.y) < P.recycle.r + 26) return G.recycle(d.u, d.where, d.i);
    /* вверх за пределы сетки → выдвинуть в строй своей дорожки */
    const g = C.GRID;
    if (y < g.y - 26 && d.where === 'grid') {
      const lane = d.i % 4;
      const row = Math.floor(d.i / 4);
      const p = G.frontPos(lane);
      if (d.sy - y > 40) return G.advance(d.u, d.where, d.i, lane);
    }
    if (d.where === 'front' && y > g.y) {              /* назад в улей */
      G.front[d.i] = null; G.put(d.u); NH.fx('pick', 'light', 6); return;
    }
    const cx = Math.floor((x - g.x) / g.cell), cy = Math.floor((y - g.y) / g.cell);
    if (cx >= 0 && cy >= 0 && cx < g.cols && cy < g.rows) {
      const j = cy * g.cols + cx, o = G.grid[j];
      if (o && o !== d.u && o.level === d.u.level) return G.merge(d.u, d.where, d.i, o, 'grid', j);
      if (!o && d.where === 'grid') { G.grid[d.i] = null; G.grid[j] = d.u; NH.fx('pick', 'light', 5); return; }
    }
    for (let l = 0; l < 4; l++) {
      const p = G.frontPos(l), o = G.front[l];
      if (U.dist(x, y, p.x, p.y) < 66) {
        if (o && o !== d.u && o.level === d.u.level) return G.merge(d.u, d.where, d.i, o, 'front', l);
        if (!o && d.where === 'grid' && l === d.i % 4) return G.advance(d.u, d.where, d.i, l);
      }
    }
    NH.fx('deny', 'light', 12);
  };
  G.advance = (u, where, i, lane) => {
    if (G.front[lane]) return G.toast('Эта дорожка уже занята', 44);
    if (where === 'grid') G.grid[i] = null;
    G.front[lane] = u;
    const p = G.frontPos(lane);
    R.ring(p.x, p.y, u.lin.hue, 10, 80); R.burst(p.x, p.y, u.lin.hue, 14, 140);
    G.toast('В строй: +40% темпа, принимает удар', 165);
    NH.fx('merge', 'medium', 14); G.hint('front');
  };
  G.merge = (a, wa, ia, b, wb, ib) => {
    const lvl = a.level;
    if (lvl >= C.MERGE_MAX_LEVEL) return G.toast('Максимальный ранг соты', 44);
    const mut = a.mut || b.mut || (G.rng() < 0.06 ? G.rollMut() : null);   /* при мерже мутация сохраняется */
    const clear = (w, i) => { if (w === 'grid') G.grid[i] = null; else G.front[i] = null; };
    clear(wa, ia); clear(wb, ib);
    const nu = G.make(b.lin, lvl + 1); nu.mut = mut;
    /* линия наследуется той, что «сильнее» по редкости */
    if (a.lin.rar > b.lin.rar) { nu.lin = a.lin; }
    if (wb === 'front' || wa === 'front') G.front[wb === 'front' ? ib : ia] = nu; else G.put(nu);
    G.merges++; S.count('s_merges', 1);
    G.score += 8 + lvl * 4;
    S.s.stats.maxLevel = Math.max(S.s.stats.maxLevel, lvl + 1);
    const p = wa === 'grid' ? G.cellPos(ia) : G.frontPos(ia);
    R.burst(p.x, p.y, nu.lin.hue, 18, 170); R.ring(p.x, p.y, nu.lin.hue, 12, 90);
    R.float(p.x, p.y - 30, 'LVL ' + (lvl + 1), nu.lin.hue, 24);
    NH.fx('merge', 'medium', [12, 18]);
    if (lvl + 1 >= 4) G.hint('deep');
  };
  G.rollMut = () => {
    const tot = D.MUTATIONS.reduce((s, m) => s + m.w, 0);
    let x = G.rng() * tot;
    for (const m of D.MUTATIONS) { if ((x -= m.w) <= 0) return m; }
    return D.MUTATIONS[0];
  };
  /* РАСЩЕПЛЕНИЕ — наш «подписной» ход: одна сота → две рангом ниже + бросок мутации */
  G.fission = (u, where, i) => {
    if (u.level < 1) return G.toast('Расщеплять можно с ранга 2', 44);
    const free = G.fissionFree > 0;
    const cost = free ? 0 : 18;
    if (!free && G.energy < cost) return G.toast('Мало энергии (' + cost + ')', 44);
    G.energy -= cost; if (free) G.fissionFree--;
    const clear = where === 'grid' ? () => G.grid[i] = null : () => G.front[i] = null;
    clear();
    const P = C.PADS.fission;
    for (let k = 0; k < 2; k++) {
      const nu = G.make(u.lin, u.level - 1);
      if (G.rng() < 0.55) { nu.mut = G.rollMut(); S.count('s_mut', 1); }
      G.put(nu);
    }
    G.fissions++; S.count('s_fission', 1);
    G.score += 14;
    R.burst(P.x, P.y, 300, 26, 210); R.ring(P.x, P.y, 300, 10, 140);
    R.doShake(9); NH.fx('orb', 'heavy', [18, 24]);
    G.toast('Расщепление: два роя и шанс мутации', 300);
    G.hint('fission');
  };
  /* ПЕРЕПЛАВКА — возврат 50% влитой энергии (курс RECRACY_RATE) */
  G.recycle = (u, where, i) => {
    const invest = C.ENERGY_COST * (Math.pow(2, u.level) - 1) * 1.6 + C.ENERGY_COST;
    const back = Math.round(invest * D.CONFIG.RECRACY_RATE * G.mod.recycleMul);
    const confirm = u.level >= 4 || !!u.mut;
    const go = () => {
      if (where === 'grid') G.grid[i] = null; else G.front[i] = null;
      G.energy = Math.min(G.energyMax, G.energy + back);
      const P = C.PADS.recycle;
      R.burst(P.x, P.y, 44, 20, 170); R.float(P.x, P.y - 40, '+' + back + ' ⚡', 44, 26);
      NH.fx('orb', 'medium', 16);
      G.toast('Переплавка: +' + back + ' энергии', 44);
      G.hint('recycle');
    };
    if (confirm) {
      U.confirm('Переплавить?', u.lin.name + ' ранг ' + (u.level + 1) + (u.mut ? ' · ' + u.mut.name : '') + '<br>Вернём <b>' + back + '</b> энергии (50% влитого).', 'Переплавить').then(ok => { if (ok) go(); });
    } else go();
  };
  G.tapReactor = () => {
    const cost = G.spawnCost();
    if (G.energy < cost) { NH.fx('deny', 'light', 10); return G.toast('Реактор остыл', 44); }
    const free = G.grid.indexOf(null);
    if (free < 0) { NH.fx('deny', 'light', 10); return G.toast('Улей заполнен — сплетите соты', 44); }
    G.energy -= cost;
    const u = G.make(G.rollLineage(), 0);
    G.put(u);
    G.taps++; S.count('s_taps', 1);
    NH.fx('spawn', 'light', 10);
    if (G.taps === 1) G.hint('merge');
  };
  G.echoSurge = () => {
    if (G.echoCharges <= 0) return G.toast('Заряд Эха исчерпан', 220);
    G.echoCharges--; G.echoT = C.ECHO_DURATION;
    R.doFlash('#9fd0ff', 0.35); R.doShake(10);
    NH.fx('echo', 'heavy', [14, 20, 14]); TG.notify('success');
    G.toast('ЭХО: рой усилен на ' + C.ECHO_DURATION + ' с', 220);
    S.count('s_echo', 1);
    G.hint('echo');
  };

  /* ── Итог забега и драфт модификаторов ────────────────────────────── */
  G.finish = (win) => {
    if (G.state === 'over') return;
    G.state = 'over';
    if (G.mod.surgeScore && G.wave >= C.RUN_WAVES) G.score *= 2;   // «Глоток перед бурей»
    G.result = {
      win, mode: G.mode, score: Math.round(G.score), wave: G.wave, time: G.time,
      kills: G.kills, merges: G.merges, fissions: G.fissions, coins: G.coins, leaks: G.leaks,
      seed: G.seed, mods: G.mods.slice(), chal: G.chal, ghost: G.ghostSrc,
      track: G.track.slice(0, 90)
    };
    /* сравнение с эхом */
    const gh = G.ghostSrc;
    G.result.beat = gh ? Math.round(G.score) - Math.round(gh.score) : 0;
    if (gh && G.result.beat > 0) { G.result.score += 400; S.orb(1); }
    S.s.player.coins += G.coins; S.s.stats.coinsEarned += G.coins;
    S.s.stats.runs++; S.count('s_runs', 1); S.count('s_coin', G.coins);
    S.s.stats.play += Math.round(G.time);
    if (G.score > S.s.stats.bestScore) { G.result.record = true; S.s.stats.bestScore = Math.round(G.score); }
    S.xp(Math.round(20 + G.wave * 9 + G.score / 220));
    S.seasonXp(Math.round(14 + G.wave * 6));
    S.pushRun({ seed: G.seed, score: Math.round(G.score), wave: G.wave, time: Math.round(G.time), mode: G.mode, track: G.track.slice(0, 90), mods: G.mods.map(m => m.id) });
    S.pushEcho({ score: Math.round(G.score), wave: G.wave, seed: G.seed, name: S.s.player.name, track: G.track.slice(0, 90), time: Math.round(G.time) });
    S.leagueAdd(Math.round(G.score / 40)); S.chatAdd(Math.round(G.score));
    if (G.mode !== 'siege') S.s.day.s_wave = S.s.day.s_wave;
    S.save(true);
    NH.Audio.play(win ? 'win' : 'lose');
    TG.notify(win ? 'success' : 'error');
    if (NH.UI) NH.UI.runEnd(G.result);
  };

  /* ── Экранное состояние для рендера ───────────────────────────────── */
  G.toast = (text, hue) => { G.msg = { text, hue: hue == null ? 190 : hue }; G.msgT = 2.2; if (NH.UI) NH.UI.toastTop(G.msg); };
  G.toastWave = (text, hue) => { G.waveMsg = { text, hue, t: 1.6 }; };
  G.hint = (key) => { if (G.hinted[key]) return; G.hinted[key] = 1; if (NH.UI) NH.UI.hint(key); };
  G.ghostScore = () => {
    const g = G.ghostSrc; if (!g || !g.track || !g.track.length) return g ? g.score || 0 : 0;
    const i = Math.min(g.track.length - 1, G.time / 2);
    const a = g.track[Math.floor(i)], b = g.track[Math.min(g.track.length - 1, Math.ceil(i))];
    return Math.round(U.lerp(a, b, i - Math.floor(i)) || 0);
  };

  /* ── Отрисовка сцены ──────────────────────────────────────────────── */
  /* Подсказка ходов: лучшая доступная пара (кэш 0.2 с) — подсвечиваем ровно два сота. */
  G.pairable = () => {
    if (G._pair && G.time - (G._pairT || 0) < 0.2) return G._pair;
    const by = {}, out = {};
    for (let i = 0; i < 16; i++) { const u = G.grid[i]; if (u) (by[u.level] = by[u.level] || []).push(i); }
    const k = Object.keys(by).map(Number).filter(l => by[l].length > 1 && l < C.MERGE_MAX_LEVEL).sort((a, b) => b - a)[0];
    if (k != null) { by[k].slice(0, 2).forEach(i => out[i] = 1); }
    G._pair = out; G._pairT = G.time; return out;
  };

  G.draw = () => {
    const c = R.begin(0);
    R.bg(c, (G.surge ? 0.9 : 0.35) + (G.echoT > 0 ? 0.3 : 0));
    if (G.state === 'idle') { R.end(); return; }

    /* дорожки */
    for (let l = 0; l < 4; l++) {
      const x = R.laneX(l);
      c.save(); c.strokeStyle = U.hsl(190 + l * 18, 90, 55, G.surge ? 0.3 : 0.16);
      c.lineWidth = 2; c.setLineDash([14, 20]); c.lineDashOffset = -R.t * 60;
      c.beginPath(); c.moveTo(x, C.LANE_TOP); c.lineTo(x, C.CORE_Y); c.stroke(); c.restore();
    }
    /* стена улья */
    c.save();
    const hpT = U.clamp(G.core / G.coreMax, 0, 1);
    const g = c.createLinearGradient(0, C.CORE_Y - 26, 0, C.CORE_Y + 26);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, U.hsl(hpT > 0.5 ? 160 : 356, 100, 55, 0.55)); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, C.CORE_Y - 26, C.W, 52);
    c.strokeStyle = U.hsl(hpT > 0.5 ? 160 : 356, 100, 62, 0.85); c.lineWidth = 3;
    R.glow(c, hpT > 0.5 ? 160 : 356, 18);
    c.beginPath(); c.moveTo(0, C.CORE_Y); c.lineTo(C.W * hpT, C.CORE_Y); c.stroke();
    c.restore();

    /* сетка улья */
    R.grid(c, C.GRID, G.drag);

    /* соты */
    for (let i = 0; i < 16; i++) {
      const u = G.grid[i]; if (!u) continue;
      if (G.drag && G.drag.u === u) continue;
      const p = G.cellPos(i);
      R.comb(c, { x: p.x, y: p.y, size: 44, lin: u.lin, level: u.level, art: u.lin.art, mut: u.mut, ph: i });
    }
    for (let l = 0; l < 4; l++) {
      const u = G.front[l]; if (!u) continue;
      if (G.drag && G.drag.u === u) continue;
      const p = G.frontPos(l);
      R.comb(c, { x: p.x, y: p.y, size: 40, lin: u.lin, level: u.level, art: u.lin.art, mut: u.mut, ph: l, glow: 18 });
    }
    /* улей забит → подсвечиваем то, что можно сплести (ход всегда должен быть виден) */
    let freeN = 0; for (let i = 0; i < 16; i++) if (!G.grid[i]) freeN++;
    if (freeN <= 2 && !G.drag) {
      const pr = G.pairable(), k = 0.5 + 0.5 * Math.sin(R.t * 4.4);
      c.save(); c.lineWidth = 3; c.strokeStyle = U.hsl(165, 100, 66, 0.28 + 0.45 * k);
      R.glow(c, 165, 14);
      Object.keys(pr).forEach(i => { const p = G.cellPos(+i); R.hex(c, p.x, p.y, 58 + 4 * k, Math.PI / 6); c.stroke(); });
      R.noGlow(c); c.restore();
    }
    /* падды */
    const P = C.PADS;
    const hotF = G.drag && U.dist(G.drag.x, G.drag.y, P.fission.x, P.fission.y) < P.fission.r + 26;
    const hotR = G.drag && U.dist(G.drag.x, G.drag.y, P.recycle.x, P.recycle.y) < P.recycle.r + 26;
    R.pad(c, P.fission, { hue: 300, icon: '✂', label: 'РАСЩЕП', hot: hotF, count: G.fissionFree || null, alpha: G.drag ? 1 : 0.6 });
    R.pad(c, P.recycle, { hue: 44, icon: '♻', label: 'ПЕРЕПЛАВ', hot: hotR, alpha: G.drag ? 1 : 0.6 });

    /* реактор */
    const rc = C.REACTOR;
    R.reactor(c, rc.x, rc.y, rc.r, G.energy / G.energyMax, hpT, G.energy >= G.spawnCost() ? 165 : 20);
    R.text(c, '⚡ ' + Math.floor(G.energy) + '/' + Math.round(G.energyMax), rc.x, rc.y + rc.r + 34, 22, '#eaf6ff', 'center', '800');
    R.text(c, 'спавн ' + G.spawnCost(), rc.x, rc.y + rc.r + 60, 16, U.hsl(165, 90, 72), 'center', '700');

    /* враги и снаряды */
    G.foes.forEach(f => R.foe(c, f));
    G.shots.forEach(b => R.shot(c, b));
    G.zap.forEach(z => {
      c.save(); c.globalAlpha = U.clamp(z.t * 5, 0, 1); c.strokeStyle = U.hsl(z.hue, 100, 72);
      c.lineWidth = 3; R.glow(c, z.hue, 18);
      if (z.bolt) { c.beginPath(); c.moveTo(z.x, z.y); c.lineTo(z.x2, z.y2); c.stroke(); }
      else { c.beginPath(); c.arc(z.x, z.y, z.r, 0, U.TAU); c.stroke(); }
      c.restore();
    });

    /* перетаскиваемый сот поверх всего */
    if (G.drag) {
      const u = G.drag.u;
      c.save(); c.globalAlpha = 0.95;
      R.comb(c, { x: G.drag.x, y: G.drag.y, size: 48, lin: u.lin, level: u.level, art: u.lin.art, mut: u.mut, glow: 26, sc: 1.06 });
      c.restore();
    }
    /* Эхо-призрак: полоса «ты против человека» */
    if (G.ghostSrc) G.drawGhost(c);
    /* HUD */
    G.hud(c);
    if (G.waveMsg && (G.waveMsg.t -= 0.016) > 0) {
      c.save(); c.globalAlpha = Math.min(1, G.waveMsg.t * 1.4);
      R.text(c, G.waveMsg.text, C.W / 2, 330, 46, U.hsl(G.waveMsg.hue, 100, 72), 'center', '900', G.waveMsg.hue);
      c.restore();
    }
    R.vignette(c);
    R.end();
  };

  G.hud = (c) => {
    /* верхняя панель */
    R.panel(c, 14, 30, C.W - 28, 92, 195, 0.5);
    R.text(c, U.fmt(G.score), C.W / 2, 62, 40, '#ffffff', 'center', '900', 195);
    R.text(c, 'ВОЛНА ' + G.wave + (G.surge ? ' · МАТКА' : ''), C.W / 2, 100, 19, G.surge ? U.hsl(350, 100, 70) : U.hsl(195, 90, 74), 'center', '800');
    R.bar(c, 130, 108, C.W - 260, 9, U.clamp(G.core / G.coreMax, 0, 1), G.core / G.coreMax > 0.5 ? 155 : 8, 'rgba(0,0,0,.45)');
    R.text(c, 'УЛЕЙ ' + Math.max(0, Math.ceil(G.core)), C.W / 2, 128, 14, U.hsl(190, 60, 78), 'center', '700');
    /* кнопки */
    const pb = C.PAUSE_BTN;
    c.save(); c.beginPath(); c.arc(pb.x, pb.y, pb.r, 0, U.TAU);
    c.fillStyle = 'rgba(255,255,255,.1)'; c.fill(); c.strokeStyle = 'rgba(160,230,255,.6)'; c.lineWidth = 2; c.stroke();
    R.text(c, '❚❚', pb.x, pb.y, 22, '#eaf6ff'); c.restore();
    const eb = C.ECHO_BTN;
    c.save(); c.beginPath(); c.arc(eb.x, eb.y, eb.r, 0, U.TAU);
    c.fillStyle = G.echoCharges > 0 ? 'rgba(120,190,255,.22)' : 'rgba(255,255,255,.06)'; c.fill();
    c.strokeStyle = U.hsl(220, 100, 70, 0.9); c.lineWidth = 2.4; if (G.echoCharges > 0) R.glow(c, 220, 18); c.stroke(); R.noGlow(c);
    R.text(c, '◎', eb.x, eb.y - 2, 26, '#dff0ff');
    R.text(c, '×' + G.echoCharges, eb.x, eb.y + eb.r + 12, 15, U.hsl(220, 90, 78), 'center', '800');
    c.restore();
    /* таймер мягкого лимита */
    const over = G.time > C.RUN_SOFT_TIME;
    R.text(c, U.fmtTime(G.time), 130, 62, 20, over ? U.hsl(44, 100, 70) : U.hsl(190, 70, 80), 'center', '800');
    /* счётчик монет забега */
    R.text(c, '🍯 ' + U.fmt(G.coins), C.W - 130, 62, 20, U.hsl(44, 100, 74), 'center', '800');
    /* живые подсказки-сообщения */
    if (G.msgT > 0 && G.msg) {
      c.save(); c.globalAlpha = Math.min(1, G.msgT);
      R.text(c, G.msg.text, C.W / 2, 172, 20, U.hsl(G.msg.hue, 95, 76), 'center', '700', G.msg.hue);
      c.restore();
    }
    /* статусы внизу под паддами */
    const st = [];
    if (G.shield > 0) st.push('🛡 ' + G.shield);
    if (G.revive > 0) st.push('💠 ' + G.revive);
    if (G.echoT > 0) st.push('◎ ' + G.echoT.toFixed(1) + 'с');
    if (G.mods.length) st.push('✦ ' + G.mods.length);
    if (st.length) R.text(c, st.join('   '), C.W / 2, C.H - 26, 20, U.hsl(190, 80, 82), 'center', '800');
  };

  G.drawGhost = (c) => {
    const g = G.ghostSrc, gs = G.ghostScore();
    const top = C.H - 120, w = C.W - 120;
    const mine = G.score, mx = Math.max(1, Math.max(mine, gs, g.score || 1));
    c.save(); c.globalAlpha = 0.92;
    R.panel(c, 60, top - 22, w, 74, 220, 0.55);
    R.bar(c, 84, top, w - 48, 10, mine / mx, 165);
    R.bar(c, 84, top + 22, w - 48, 10, gs / mx, 220);
    R.text(c, 'ТЫ ' + U.fmt(mine), 84, top - 10, 15, U.hsl(165, 90, 78), 'left', '800');
    R.text(c, (g.me ? 'ТЫ ПРОШЛЫЙ' : g.name) + ' ' + U.fmt(gs), 84, top + 12, 15, U.hsl(220, 90, 80), 'left', '800');
    const d = Math.round(mine - gs);
    R.text(c, (d >= 0 ? '+' : '') + U.fmt(d), w + 40, top + 12, 22, U.hsl(d >= 0 ? 160 : 356, 100, 70), 'center', '900');
    R.text(c, 'человек · расклад ' + (g.seed || '').slice(0, 5), w + 40, top + 34, 13, U.hsl(220, 60, 76), 'center', '700');
    c.restore();
  };

  /* ── Пауза/выход ──────────────────────────────────────────────────── */
  G.pause = () => { if (G.state === 'play') { G.state = 'pause'; if (NH.UI) NH.UI.showScreen('pause'); } };
  G.resume = () => { if (G.state === 'pause') { G.state = 'play'; if (NH.UI) NH.UI.showScreen(null); } };
  G.quit = () => { G.state = 'idle'; G.drag = null; if (NH.UI) NH.UI.showScreen('home'); };
})(window.NH);
