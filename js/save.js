/* NEON HIVE — сохранения, мета-прогресс, экономика, ежедневные петли. */
window.NH = window.NH || {};
(function (NH) {
  'use strict';
  const U = NH.U, D = NH.DATA;

  const S = NH.Save = {};
  S.s = null;

  const ZERO = () => ({
    runs: 0, taps: 0, merges: 0, kills: 0, fissions: 0, echoes: 0, summons: 0, bosses: 0,
    coinsEarned: 0, bestWave: 0, bestScore: 0, prestiges: 0, stars: 0, play: 0, splits: 0, maxLevel: 1
  });
  const SDAY = () => ({ s_taps: 0, s_merges: 0, s_wave: 0, s_fission: 0, s_boss: 0, s_echo: 0, s_kills: 0, s_coin: 0, s_runs: 0, s_mut: 0, ads: 0 });

  S.default = () => {
    const col = {};
    D.LINEAGES.forEach((l, i) => col[l.id] = { stars: 0, unlocked: i < 3, dup: 0 });
    return {
      v: 1, created: Date.now(), lastSeen: Date.now(),
      player: { name: 'Роевик', level: 1, xp: 0, coins: 700, orbs: 4, pollen: 0, invites: 0 },
      stats: ZERO(), day: SDAY(),
      collection: col,
      apiary: { comb: 1, reactor: 0, beacon: 0 },
      daily: { date: '', quests: [], streak: 0, streakDay: '', reward: '' },
      ach: {}, season: { key: '', xp: 0, tier: 0, free: [], prem: [], pass: false },
      prestige: { count: 0, up: { core: 0, echo: 0, energy: 0, fortune: 0 } },
      echoBank: [], echoEquipped: -1,
      boosters: {},
      settings: { sound: true, music: true, vibration: true, quality: 2, hints: true, ads: true },
      tutorial: { step: 0, done: false },
      lbWeek: '', seenFriends: [], lbScores: {},
      purchased: {},
      /* ── поля продукта по docs/RESEARCH.md §6 ── */
      nectar: { n: 8, t: Date.now() },        // билеты: кап 8, 1 шт. / 4 мин
      runStreak: { n: 0, day: '', shield: 0, shieldMonth: '', brokenAt: 0, reformed: '' },
      payer: 0,                               // 1 = платил: не показывать rewarded-офферы (Rovio)
      runs24: [],                             // история забегов для Эха: seed + счёт
      chal: null,                             // активный челлендж: {seed,name,score,from}
      chat: { id: '', lb: [], goal: 0 },      // клан = группа Telegram (chat_instance)
      ref: null,                              // startapp=inv_...
      mods: [],                               // цепочка roguelite-модификаторов (до 4)
      league: { tier: 0, week: '', pts: 0, promoted: '' }
    };
  };

  S.load = () => {
    let raw = null;
    try { raw = localStorage.getItem(D.SAVE_KEY); } catch (e) { }
    let s = null;
    if (raw) { try { s = JSON.parse(raw); } catch (e) { s = null; } }
    if (!s || typeof s !== 'object') s = S.default();
    S.hydrate(s);
    S.s = s;
    S.checkDaily();
    S.checkSeason();
    S.recountStars();
    return s;
  };

  /* мягкая миграция: докидываем недостающие поля (вызывается и для облачной копии) */
  S.hydrate = (s) => {
    const def = S.default();
    for (const k in def) if (s[k] === undefined) s[k] = def[k];
    for (const k in def.player) if (s.player[k] === undefined) s.player[k] = def.player[k];
    for (const k in def.stats) if (s.stats[k] === undefined) s.stats[k] = def.stats[k];
    for (const k in def.day) if (s.day[k] === undefined) s.day[k] = def.day[k];
    for (const k in def.prestige.up) if (s.prestige.up[k] === undefined) s.prestige.up[k] = 0;
    for (const k in def.settings) if (s.settings[k] === undefined) s.settings[k] = def.settings[k];
    for (const k of ['nectar', 'runStreak', 'chat', 'league']) s[k] = Object.assign({}, def[k], s[k] || {});
    if (!Array.isArray(s.runs24)) s.runs24 = [];
    if (!Array.isArray(s.mods)) s.mods = [];
    if (typeof s.league.week !== 'string') s.league.week = '';
    D.LINEAGES.forEach((l, i) => {
      if (!s.collection[l.id]) s.collection[l.id] = { stars: 0, unlocked: i < 3, dup: 0 };
    });
    return s;
  };

  let dirty = false, timer = 0;
  S.save = (immediate) => {
    dirty = true;
    if (immediate) S.flush();
  };
  S.flush = () => {
    if (!S.s) return;
    S.s.lastSeen = Date.now();
    const json = JSON.stringify(S.s);
    try { localStorage.setItem(D.SAVE_KEY, json); } catch (e) { }
    S.cloudPush(json);
    dirty = false;
  };
  S.tick = (dt) => {
    if (!dirty) return;
    timer += dt;
    if (timer > 2.5) { timer = 0; S.flush(); }
  };
  S.reset = () => { try { localStorage.removeItem(D.SAVE_KEY); } catch (e) { } S.s = S.default(); S.checkDaily(); S.checkSeason(); S.save(true); };

  /* ── Облачный сейв через CloudStorage: ≤4096 символов на ключ, батчем ──
     Telegram даёт 1024 ключа по 4096 симв.; режем JSON на куски по 3400. */
  const CHUNK = 3400, CKEY = 'nh_s';
  S.cloudPush = (json) => {
    if (!NH.TG || !NH.TG.ready) return;
    const keys = {}; let n = 0;
    for (let i = 0; i < json.length; i += CHUNK) { keys[CKEY + n] = json.slice(i, i + CHUNK); n++; }
    keys[CKEY + 'n'] = String(n);
    NH.TG.cloudSave(keys);
  };
  /* Собирает сейв из облака (вызывается один раз на старте, колбэк получает строку или null) */
  S.cloudPull = (done) => {
    if (!NH.TG || !NH.TG.ready) { done(null); return; }
    NH.TG.cloudLoad(async (store) => {
      try {
        const n = store && store[CKEY + 'n'] ? parseInt(store[CKEY + 'n'], 10) : 0;
        if (!n) return done(null);
        let json = '';
        for (let i = 0; i < n; i++) json += (store[CKEY + i] || '');
        done(json && json.length > 40 ? json : null);
      } catch (e) { done(null); }
    });
  };
  S.mergeCloud = (json) => {
    /* облачная копии выбираем по lastSeen — локальная версия не должна теряться */
    let cloud = null;
    try { cloud = JSON.parse(json); } catch (e) { return false; }
    if (!cloud || typeof cloud !== 'object') return false;
    if ((cloud.lastSeen || 0) <= (S.s ? S.s.lastSeen || 0 : 0)) return false;
    S.hydrate(cloud); S.s = cloud;
    S.checkDaily(); S.checkSeason(); S.recountStars(); S.save();
    return true;
  };

  /* ── Ежедневный сброс и квесты ───────────────────────────────────── */
  S.checkDaily = (force) => {
    const s = S.s, key = U.dateKey();
    if (s.daily.date === key && !force) return false;
    // streak
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yKey = U.dateKey(y);
    if (s.daily.streakDay === key) { /* уже считали */ }
    else s.daily.streak = (s.daily.streakDay === yKey) ? s.daily.streak + 1 : 1;
    s.daily.streakDay = key;
    s.daily.date = key;
    s.day = SDAY();
    const rng = U.rng('daily' + key + (s.player.name || ''));
    const pool = D.DAILY_POOL.slice();
    const picked = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      const idx = Math.floor(rng() * pool.length);
      const t = pool.splice(idx, 1)[0];
      const st = (s.stats.runs || 0);
      const goal = Math.max(1, Math.round(t.goal + t.scale * Math.min(10, Math.floor(st / 4))));
      picked.push({ id: t.id, goal, claimed: false });
    }
    s.daily.quests = picked;
    S.save();
    return true;
  };

  /* Универсальный счётчик прогресса: пик (для волн) или сумма */
  /* какие счётчики идут в вечную статистику: суммой / пиком */
  const LIVE = { s_taps: 1, s_merges: 1, s_fission: 1, s_boss: 1, s_echo: 1, s_kills: 1, s_runs: 1, s_mut: 1 };
  const PEAK = { s_wave: 1 };
  const MAP = { s_taps: 'taps', s_merges: 'merges', s_fission: 'fissions', s_boss: 'bosses', s_echo: 'echoes', s_kills: 'kills', s_runs: 'runs', s_mut: 'fissions', s_wave: 'bestWave' };
  S.count = (key, n) => {
    if (key === 's_wave') S.s.day[key] = Math.max(S.s.day[key] || 0, n);
    else if (S.s.day[key] !== undefined) S.s.day[key] += n;
    const stat = MAP[key];
    if (!stat) return;
    if (key === 's_wave') S.s.stats.bestWave = Math.max(S.s.stats.bestWave || 0, n);
    else if (LIVE[key]) S.s.stats[stat] = (S.s.stats[stat] || 0) + n;
  };
  S.questProgress = q => Math.min(q.goal, S.s.day[((S.questDef(q.id) || {}).cur)] || 0);
  S.questOf = id => S.s.daily.quests.find(q => q.id === id);
  S.questDef = id => D.DAILY_POOL.find(q => q.id === id);

  S.claimQuest = (id) => {
    const s = S.s, q = S.questOf(id), def = S.questDef(id);
    if (!q || q.claimed || !def) return null;
    if (S.questProgress(q) < q.goal) return null;
    q.claimed = true;
    S.coin(def.coin); S.orb(def.orb || 0); S.xp(def.xp);
    S.save();
    return def;
  };
  S.dailyRewardReady = () => S.s.daily.reward !== S.s.daily.date;
  S.claimDailyReward = () => {
    const s = S.s;
    if (!S.dailyRewardReady()) return null;
    s.daily.reward = s.daily.date;
    const day = Math.min(7, s.daily.streak || 1);
    const r = { coin: 400 + day * 320, orb: day >= 3 ? 1 : 0, xp: 12 + day * 4 };
    S.coin(r.coin); S.orb(r.orb); S.xp(r.xp);
    S.save();
    return r;
  };

  /* ── Ресурсы ─────────────────────────────────────────────────────── */
  S.coin = n => { if (n > 0) S.s.stats.coinsEarned += n; S.s.player.coins = Math.max(0, S.s.player.coins + n); S.save(); };
  S.orb = n => { S.s.player.orbs = Math.max(0, S.s.player.orbs + n); S.save(); };
  S.pollen = n => { S.s.player.pollen = Math.max(0, S.s.player.pollen + n); S.save(); };
  S.buy = (price) => { if (S.s.player.coins < price) return false; S.s.player.coins -= price; S.save(); return true; };
  S.buyOrb = (price) => { if (S.s.player.orbs < price) return false; S.s.player.orbs -= price; S.save(); return true; };

  S.xp = (n) => {
    const p = S.s.player; p.xp += n; let ups = 0;
    while (p.xp >= D.levelNeed(p.level)) { p.xp -= D.levelNeed(p.level); p.level++; ups++; }
    if (ups) { NH.fx('level'); }
    S.save(); return ups;
  };

  /* ── Производные характеристики ─────────────────────────────────── */
  S.recountStars = () => {
    let t = 0; for (const k in S.s.collection) t += S.s.collection[k].stars;
    S.s.stats.stars = t;
  };
  S.dmgMul = () => {
    const s = S.s;
    let m = 1 + 0.012 * s.stats.stars;
    m *= 1 + (D.PRESTIGE.pollenPerBonus / 100) * s.player.pollen;
    m *= 1 + 0.02 * s.player.level;
    return m;
  };
  S.energyMax = () => {
    const s = S.s; let e = D.CONFIG.ENERGY_MAX + s.prestige.up.energy * 8;
    if (s.boosters.energy > 0) e += 70;
    return e;
  };
  S.energyRegen = () => {
    const s = S.s; let r = D.CONFIG.ENERGY_REGEN * (1 + 0.04 * s.prestige.up.energy);
    if (s.boosters.energy > 0) r *= 1.35;
    return r;
  };
  S.coreHp = () => D.CONFIG.CORE_HP + S.s.prestige.up.core * D.CONFIG.CORE_HP_PER_PRESTIGE + S.s.player.level * 3;
  S.coinMul = () => 1 + 0.08 * S.s.prestige.up.fortune + 0.01 * S.s.prestige.count;
  S.echoCharges = () => D.CONFIG.ECHO_CHARGES + S.s.prestige.up.echo;
  S.unlockedLineages = () => D.LINEAGES.filter(l => S.s.collection[l.id].unlocked);
  S.isUnlocked = id => !!S.s.collection[id] && S.s.collection[id].unlocked;

  /* ── Пасека / idle-доход ─────────────────────────────────────────── */
  S.apiaryOutput = () => {
    const s = S.s; let out = 0;
    D.APIARY.forEach(def => { out += D.hiveOutput(def, s.apiary[def.id] || 0); });
    return out * (1 + 0.05 * s.prestige.count) * (1 + 0.01 * s.stats.stars);
  };
  S.offlineInfo = () => {
    const s = S.s, out = S.apiaryOutput();
    const sec = Math.min((Date.now() - (s.lastSeen || Date.now())) / 1000, D.CONFIG.OFFLINE_CAP_H * 3600);
    return { out, sec, amount: Math.floor(out * sec * 0.75) };
  };
  S.collectIdle = (all) => {
    const s = S.s, out = S.apiaryOutput();
    let sec = (Date.now() - (s.lastSeen || Date.now())) / 1000;
    sec = Math.min(sec, D.CONFIG.OFFLINE_CAP_H * 3600);
    if (sec < 5 || out <= 0) { s.lastSeen = Date.now(); return 0; }
    const amount = Math.floor(out * sec * (all ? 1 : 0.75));
    s.lastSeen = Date.now();
    if (amount > 0) S.coin(amount);
    return amount;
  };

  /* ── Коллекция: звёзды за дубликаты ─────────────────────────────── */
  S.starUp = (id) => {
    const c = S.s.collection[id], lin = D.LINEAGES.find(l => l.id === id);
    if (!c || !lin) return { err: 'Нет такой личинки' };
    const max = D.RARITY[lin.rar].stars;
    if (c.stars >= max) return { err: 'Максимум звёзд' };
    const cost = D.starCost(lin.rar, c.stars);
    if (!S.buy(cost)) return { err: 'Мало сот: ' + U.fmt(cost - S.s.player.coins) };
    c.stars++; S.recountStars(); S.save();
    return { star: c.stars, cost };
  };

  /* Призыв личинки: вес по редкости, дубликат → +звезда */
  S.summon = () => {
    const s = S.s, price = S.summonPrice();
    if (!S.buyOrb(price)) return { err: 'Мало орбов' };
    const unlockedAll = true;
    let tot = 0; const pool = D.LINEAGES.map(l => { tot += D.RARITY[l.rar].w; return { l, w: tot }; });
    const r = Math.random() * tot;
    let chosen = pool[0].l;
    for (const p of pool) if (r <= p.w) { chosen = p.l; break; }
    const c = s.collection[chosen.id];
    let res = { lin: chosen, newStar: false, newUnlock: false };
    if (!c.unlocked) { c.unlocked = true; res.newUnlock = true; }
    else if (c.stars < D.RARITY[chosen.rar].stars && Math.random() < 0.75) { c.stars++; res.newStar = true; S.recountStars(); }
    else c.dup++;
    s.stats.summons++;
    S.save();
    return res;
  };
  S.summonPrice = () => Math.min(D.SHOP.summonCost + Math.floor(S.s.stats.summons / 10) * 2, D.SHOP.summonCost + D.SHOP.summonMaxDiscount);

  /* ── Сезон ──────────────────────────────────────────────────────── */
  S.checkSeason = () => {
    const s = S.s, key = U.seasonKey();
    if (s.season.key === key) return false;
    s.season.key = key; s.season.xp = 0; s.season.tier = 0; s.season.free = []; s.season.prem = [];
    S.save(); return true;
  };
  S.seasonXp = n => { S.s.season.xp += n; S.save(); };
  S.seasonTierOf = () => {
    let t = 0; const x = S.s.season.xp;
    D.SEASON_TIERS.forEach(tr => { if (x >= tr.need) t = tr.tier; });
    return t;
  };
  S.claimTier = (tier, prem) => {
    const s = S.s, tr = D.SEASON_TIERS.find(t => t.tier === tier);
    if (!tr) return null;
    if (S.seasonTierOf() < tier) return null;
    const bag = prem ? 'prem' : 'free';
    if (s.season[bag].includes(tier)) return null;
    if (prem && !s.season.pass) return null;
    s.season[bag].push(tier);
    const r = prem ? tr.prem : tr.free;
    if (r.coin) S.coin(r.coin); if (r.orb) S.orb(r.orb); if (r.pollen) S.pollen(r.pollen);
    if (r.b) s.boosters[r.b] = (s.boosters[r.b] || 0) + 1;
    S.save();
    return r;
  };

  /* ── Достижения ─────────────────────────────────────────────────── */
  S.achState = () => D.ACHIEVEMENTS.map(a => {
    const cur = S.s.stats[a.cur] || 0;
    return { a, cur, done: cur >= a.goal, claimed: !!S.s.ach[a.id] };
  });
  S.claimAch = (id) => {
    const s = S.s, a = D.ACHIEVEMENTS.find(x => x.id === id);
    if (!a || s.ach[id] || (s.stats[a.cur] || 0) < a.goal) return null;
    s.ach[id] = 1; S.coin(a.coin); S.orb(a.orb || 0); S.xp(a.xp);
    S.save(); return a;
  };

  /* ── Перерождение ───────────────────────────────────────────────── */
  S.prestigeGain = () => D.PRESTIGE.pollenFormula(S.s.stats.bestWave);
  S.prestigeReady = () => S.s.stats.bestWave >= D.PRESTIGE.needWave;
  S.prestigeDo = () => {
    const s = S.s, gain = S.prestigeGain();
    if (!S.prestigeReady()) return 0;
    s.prestige.count++; s.stats.prestiges++;
    s.player.pollen += gain;
    s.player.coins = 800; s.player.orbs = Math.max(s.player.orbs, 3);
    for (const k in s.collection) s.collection[k].stars = 0;
    for (const k in s.apiary) s.apiary[k] = k === 'comb' ? 1 : 0;
    s.stats.bestWave = 0; s.stats.bestScore = 0;
    s.day = SDAY();
    S.recountStars(); S.save(true);
    return gain;
  };
  S.upCost = id => {
    const u = D.PRESTIGE.upgrades.find(x => x.id === id);
    return u.cost(S.s.prestige.up[id] || 0);
  };
  S.buyUp = (id) => {
    const c = S.upCost(id);
    if (S.s.player.pollen < c) return { err: 'Мало пыльцы' };
    S.s.prestige.up[id] = (S.s.prestige.up[id] || 0) + 1; S.pollen(-c);
    return { lvl: S.s.prestige.up[id] };
  };

  /* ── Эхо-банк (наша подпись: призраки прошлых забегов) ──────────── */
  S.pushEcho = (rec) => {
    const s = S.s;
    s.echoBank.unshift(rec);
    s.echoBank.sort((a, b) => (b.score || b.wave) - (a.score || a.wave));
    s.echoBank = s.echoBank.slice(0, 8);
    if (s.echoEquipped < 0) s.echoEquipped = 0;
    S.save(true);
  };
  S.equippedEcho = () => S.s.echoBank[S.s.echoEquipped] || S.s.echoBank[0] || null;

  /* ── Нектар: расписание возврата, а не стена (docs/RESEARCH.md §6.4) ──
     Кап 8, 1 шт. / 4 мин. Эхо и дуэли нектар не тратят — в них можно играть всегда. */
  S.NECTAR_CAP = () => D.CONFIG.NECTAR.max;
  S.nectar = () => {
    const s = S.s, n = D.CONFIG.NECTAR, now = Date.now();
    const nt = s.nectar;
    if (nt.n < n.max) {
      const gained = Math.floor((now - (nt.t || now)) / (n.regen * 1000));
      if (gained > 0) { nt.n = Math.min(n.max, nt.n + gained); nt.t = now; S.save(); }
    }
    if (nt.n >= n.max) nt.t = now;
    return Math.floor(nt.n);
  };
  S.nectarNextSec = () => {
    const nt = S.s.nectar, n = D.CONFIG.NECTAR;
    if (nt.n >= n.max) return 0;
    return Math.max(0, Math.ceil((nt.t + n.regen * 1000 - Date.now()) / 1000));
  };
  S.nectarSpend = (k) => {
    if (S.nectar() < k) return false;
    S.s.nectar.n -= k; if (S.s.nectar.n >= D.CONFIG.NECTAR.max) S.s.nectar.t = Date.now();
    S.save(); return true;
  };
  S.nectarAdd = (k) => {
    const nt = S.s.nectar; S.nectar();
    nt.n = Math.min(D.CONFIG.NECTAR.max * 2, nt.n + k);   // перелив выше капа разрешён
    S.save(); return nt.n;
  };

  /* ── Серия забегов + щит + реформ (DoF: live-стрики, window 24 ч) ────── */
  S.streakState = () => {
    const rs = S.s.runStreak, today = U.dateKey();
    if (rs.day && rs.day !== today && rs.n > 0) {
      const gap = Math.round((Date.parse(today) - Date.parse(rs.day)) / 864e5);
      if (gap > 1) {
        if (rs.shield > 0 && gap === 2) { rs.shield--; rs.day = today; }   // щит серии отработал
        else { rs.brokenAt = Date.now(); rs.n = 0; rs.day = ''; }
        S.save();
      }
    }
    return rs;
  };
  S.streakCount = () => {
    const rs = S.streakState(), today = U.dateKey();
    if (rs.day === today) return rs.n;
    const y = new Date(); y.setDate(y.getDate() - 1);
    rs.n = (rs.day === U.dateKey(y)) ? rs.n + 1 : 1;
    rs.day = today; S.save();
    return rs.n;
  };
  S.streakReward = () => D.STREAK.rewards[Math.min(D.STREAK.rewards.length - 1, Math.max(0, S.streakState().n - 1))];
  S.streakGiveShield = () => {
    const rs = S.s.runStreak, m = new Date().toISOString().slice(0, 7);
    if (rs.shieldMonth === m) return false;
    rs.shield = D.STREAK.shieldPerMonth; rs.shieldMonth = m; S.save(); return true;
  };
  S.streakReformable = () => {
    const rs = S.s.runStreak;
    return !!rs.brokenAt && (Date.now() - rs.brokenAt) < D.STREAK.reformWindowH * 3600e3 && rs.reformed !== U.dateKey();
  };
  S.streakReform = (method) => {
    const rs = S.s.runStreak;
    if (!S.streakReformable()) return { err: 'Серия не сломана' };
    if (method === 'stars') {
      if (!NH.Store || !NH.Store.buyItem('streak')) return { err: 'VitrineUnavailable' };
    } else if (!NH.Ads || !NH.Ads.show('streak_reform')) {
      return { err: 'Нет доступного видео' };
    }
    rs.n = Math.max(1, rs.n); rs.brokenAt = 0; rs.reformed = U.dateKey(); S.save();
    return { ok: true, n: rs.n };
  };

  /* ── Сегмент «плательщик»: rewarded-офферы такому игроку не показываем ── */
  S.markPayer = () => { if (!S.s.payer) { S.s.payer = 1; S.save(); } };
  S.canAds = () => !S.s.payer && S.s.settings.ads !== false;
  S.adBudget = () => S.s.day.ads < 15;                       // жёсткий дневной потолок показов
  S.adShown = () => { S.s.day.ads = (S.s.day.ads || 0) + 1; S.save(); };

  /* ── История забегов для Эха: seed обязателен, иначе расклад не повторяем ── */
  S.pushRun = (rec) => {
    const s = S.s;
    s.runs24.unshift(rec);
    s.runs24 = s.runs24.filter(r => Date.now() - r.t < 3 * 864e5).slice(0, 6);
    S.save();
  };
  S.bestRun = () => s_best(S.s.runs24);
  function s_best(arr) {
    let b = null; for (const r of arr) if (!b || r.score > b.score) b = r; return b;
  }
  S.setChal = (c) => { S.s.chal = c; S.save(); };
  S.clearChal = () => { S.s.chal = null; S.save(); };

  /* ── Клан = группа Telegram: командная цель недели ─────────────────── */
  S.chatJoin = (id) => { if (id && S.s.chat.id !== id) { S.s.chat.id = id; S.save(); } };
  S.chatAdd = (score) => {
    const c = S.s.chat; if (!c.id) return;
    c.goal += score;
    if (!Array.isArray(c.lb)) c.lb = [];
    S.save();
  };

  /* ── Лига на 8 человек, ротация 3 дня (награда — косметика, не энергия) ── */
  S.leagueWeek = () => 'r' + Math.floor(Date.now() / (D.LEAGUE.rotateDays * 864e5));
  S.leagueCheck = () => {
    const s = S.s, wk = S.leagueWeek();
    if (s.league.week !== wk) {
      const prize = D.LEAGUE.tiers[s.league.tier].prize;
      if (prize.coin) S.coin(prize.coin); if (prize.orb) S.orb(prize.orb); if (prize.pollen) S.pollen(prize.pollen);
      const pts = s.league.pts;
      let t = s.league.tier;
      if (pts >= D.LEAGUE.tiers[Math.min(7, t + 1)].need && t < 7) t++;
      else if (pts < D.LEAGUE.tiers[t].need * 0.4 && t > 0) t--;
      s.league.tier = t; s.league.week = wk; s.league.pts = 0; s.league.promoted = '';
      S.save();
    }
    return D.LEAGUE.tiers[s.league.tier];
  };
  S.leagueAdd = pts => { S.s.league.pts += pts; S.save(); };

  /* ── Ивент текущих 48 часов (детерминированный по окну) ─────────────── */
  S.eventNow = () => {
    const win = Math.floor(Date.now() / (48 * 3600e3));
    return D.EVENTS[U.hash('nh_event' + win) % D.EVENTS.length];
  };
  S.eventEndsIn = () => 48 * 3600e3 - (Date.now() % (48 * 3600e3));
})(window.NH);
