/* NEON HIVE — интерфейс: меню, подготовка, итог забега, драфт, мета, настройки.
   DOM поверх холста; вся логика экранов — один обработчик действий [data-a]. */
window.NH = window.NH || {};
(function (NH) {
  'use strict';
  const U = NH.U, D = NH.DATA, S = NH.Save, G = NH.Game, TG = NH.TG;
  const UI = NH.UI = {};
  const C = D.CONFIG;
  let root = null, current = null, lastResult = null, chain = [];

  UI.el = id => document.getElementById(id);

  /* ── Ресайз/цикл ──────────────────────────────────────────────────── */
  UI.boot = () => {
    S.load();
    TG.init();
    root = UI.el('ui');
    R_initCanvas();
    bindInput();
    bootDeep();
    UI.renderTop();
    UI.showScreen(S.s.stats.runs === 0 ? 'intro' : 'home');
    UI.loop();
    document.addEventListener('nh:back', () => {
      if (G.state === 'play') { G.pause(); return; }
      if (current !== 'home') UI.showScreen('home');
    });
    document.addEventListener('nh:pause', () => { if (G.state === 'play') G.pause(); S.flush(); });
    setInterval(() => { S.tick(1); if (current === 'home' || current === 'hive') UI.renderTop(); }, 1000);
  };
  function R_initCanvas() { NH.R.init(UI.el('cv')); }

  function bootDeep() {
    if (TG.userName !== 'Роевик') { S.s.player.name = TG.userName; S.save(); }
    S.leagueCheck && S.leagueCheck();
    S.checkDaily(); S.checkSeason();
    /* облачная копия → мержим, если она свежее */
    S.cloudPull(str => { if (str && S.mergeCloud(str)) UI.refresh(); });
    const chat = TG.chatInstance;
    if (chat) S.chatJoin(String(chat).slice(-12));
    /* start_param: инвайт или челлендж */
    const sp = NH.Share.parse(TG.startParam);
    if (sp && sp.type === 'challenge' && sp.seed) {
      S.setChal({ seed: sp.seed, name: 'Соперник', score: 0, track: null });
      setTimeout(() => U.toast('Челлендж: расклад ' + sp.seed.slice(0, 6), 'ok'), 900);
    } else if (sp && sp.type === 'invite') {
      S.s.ref = sp.id; S.s.player.orbs += 2; S.save();
      setTimeout(() => U.toast('+2 орба за приглашение друга', 'ok'), 900);
    }
    const off = S.offlineInfo();
    if (off && off.amount > 60) setTimeout(() => UI.collect(true), 1200);
    if (S.dailyRewardReady()) setTimeout(() => U.toast('Ежедневная награда готова', 'ok'), 1800);
  }

  let last = 0, loopErr = 0;
  UI.loop = () => {
    const step = (ts) => {
      const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
      try {
        S.tick(dt);
        if (G.state === 'play') { G.tick(dt); G.draw(); }
        else if (G.state === 'pause' || G.state === 'over') { G.draw(); }
        else UI.idleScene(dt);
        NH.Audio.musicTick(dt, G.state === 'play' ? (G.surge ? 1 : Math.min(0.8, G.wave / 8)) : 0.05);
      } catch (e) {
        if (++loopErr < 4) console.error(e);
        if (G.state === 'play') { G.pause(); }
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  /* Меню: живой фон + крутящийся рой-эмблема */
  UI.idleScene = (dt) => {
    const R = NH.R, c = R.begin(dt);
    R.bg(c, 0.25 + 0.12 * Math.sin(R.t * 0.6));
    c.fillStyle = 'rgba(7,6,15,0.62)'; c.fillRect(0, 0, C.W, C.H);   /* под меню фон глушим */
    const cx = C.W / 2, cy = C.H * 0.76;
    c.save(); c.globalAlpha = 0.55;
    for (let i = 0; i < 7; i++) {
      const a = R.t * 0.4 + i * U.TAU / 7, r = 132 + 22 * Math.sin(R.t * 1.1 + i);
      const lin = D.LINEAGES[i % D.LINEAGES.length];
      R.comb(c, { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.5, size: 26 + 5 * Math.sin(R.t + i), lin, level: 0, art: lin.art, ph: i, sc: 0.82, noLvl: true });
    }
    R.reactor(c, cx, cy, 56, 0.35 + 0.16 * Math.sin(R.t * 2), 1, 165);
    c.restore();
    R.vignette(c);
    R.end();
  };

  /* ── Верхняя ресурсная панель ─────────────────────────────────────── */
  UI.renderTop = () => {
    const p = S.s.player, n = S.nectar(), nn = S.nectarNextSec();
    let pips = '';
    for (let i = 0; i < C.NECTAR.max; i++) pips += '<i class="pip' + (i < n ? ' on' : '') + '"></i>';
    UI.el('top').innerHTML =
      `<div class="res"><b class="lv">LVL ${p.level}</b><span class="xp"><i style="width:${U.clamp(S.s.player.xp / (S.s.player.level * 120) * 100, 0, 100)}%"></i></span></div>
       <div class="res gold">🍯 ${U.fmt(p.coins)}</div>
       <div class="res orb">◎ ${p.orbs}</div>
       <div class="nectar" title="Нектар: 1 шт. / 4 мин">${pips}<em>${nn ? U.fmtTime(nn) : 'полон'}</em></div>`;
  };

  /* ── Экраны ───────────────────────────────────────────────────────── */
  UI.showScreen = (id) => {
    current = id;
    document.body.classList.toggle('playing', !id);   /* в забеге DOM-слой и верхняя панель скрыты */
    if (!id) { root.innerHTML = ''; return; }
    if (id !== 'pause' && G.state !== 'idle') G.state = 'idle';   /* за меню не должен проступать забег */
    root.innerHTML = SCRENS[id] ? SCRENS[id]() : '<div class="screen"><div class="card"><h2>—</h2></div></div>';
    root.dataset.screen = id;
    UI.renderTop();
  };
  UI.refresh = () => { if (current) UI.showScreen(current); UI.renderTop(); };

  const fmtR = (m) => `<span class="rar${m.rar}">${['Обычный', 'Редкий', 'Эпический'][m.rar] || ''}</span>`;
  const rewardTxt = r => r ? [r.coin && `🍯 ${U.fmt(r.coin)}`, r.orb && `◎ ${r.orb}`, r.pollen && `🌸 ${r.pollen}`, r.b && D.BOOSTERS.find(b => b.id === r.b).name].filter(Boolean).join(' · ') : '';

  const SCRENS = {};

  /* ── Онбординг: 3 экрана по 5 секунд, первый мерж на 3-й секунде ──── */
  SCRENS.intro = () => `
  <div class="screen center">
    <div class="logo"><b>НЕОНОВЫЙ</b><span>УЛЕЙ</span></div>
    <p class="lead">Сплетай соты в рой, держи 4 дорожки и обгоняй <b>живых игроков</b> — их забеги приходят к тебе как Эхо.</p>
    <div class="card">
      <div class="row3">
        <div><b>1</b><i>Тап — сота</i></div><div><b>2</b><i>Слей две</i></div><div><b>3</b><i>Тяни в строй</i></div>
      </div>
      <p class="mut">Расщепление режет соту пополам и даёт мутацию. Переплавка возвращает 50% энергии. Этого нет ни у кого.</p>
    </div>
    <button class="big" data-a="intro-start">▶ Начать забег</button>
    <button class="ghostline" data-a="to-settings">Настройки</button>
  </div>`;

  /* ── Главное меню ─────────────────────────────────────────────────── */
  SCRENS.home = () => {
    const ev = S.eventNow(), chal = S.s.chal, st = S.streakState();
    const echo = S.equippedEcho(), best = S.bestRun();
    const n = S.nectar();
    return `
    <div class="screen">
      ${ev ? `<div class="event" data-a="noop"><b>${ev.name}</b><span>${ev.desc}</span><em>до ${U.fmtTime(S.eventEndsIn() / 1000)}</em></div>` : ''}
      ${chal ? `<div class="chal" data-a="echo"><b>ЧЕЛЛЕНДЖ</b><span>Расклад ${chal.seed.slice(0, 6)} · ${chal.name}</span><em>Обогнать →</em></div>` : ''}
      <div class="hero">
        <button class="big play" data-a="prep"><b>ИГРАТЬ</b><span>8 волн · ~100 секунд · ${C.NECTAR.run} нектар</span></button>
        <div class="duo">
          <button data-a="echo"><i>◎</i>Эхо<small>${echo ? U.fmt(echo.score) : 'нет'}</small></button>
          <button data-a="siege"><i>∞</i>Осада<small>${C.NECTAR.siege} нек.</small></button>
        </div>
      </div>
      <div class="strip">
        <button data-a="hive"><i>🏠</i>Улей</button>
        <button data-a="dex"><i>🧬</i>Коллекция</button>
        <button data-a="quests"><i>📜</i>Задания${S.s.daily.quests.some(q => (S.s.day[q.id] || 0) >= q.goal && !q.done) ? '<em class="dot"></em>' : ''}</button>
        <button data-a="league"><i>🏆</i>Лига</button>
        <button data-a="shop"><i>✦</i>Магазин</button>
        <button data-a="settings"><i>⚙</i>Ещё</button>
      </div>
      <div class="meta">
        <div class="cell"><small>Рекорд</small><b>${U.fmt(S.s.stats.bestScore)}</b></div>
        <div class="cell"><small>Волна</small><b>${S.s.stats.bestWave}</b></div>
        <div class="cell"><small>Серия</small><b>${st.n}🔥${st.shield ? ' 🛡' + st.shield : ''}</b></div>
        <div class="cell" data-a="share-invite"><small>Позвать друга</small><b>+2 ◎</b></div>
      </div>
      ${n === 0 ? `<div class="warn" data-a="nectar-ad">Нектар кончился: посмотреть видео или позвать друга</div>` : ''}
      ${S.dailyRewardReady() ? `<div class="warn ok" data-a="claim-daily">Ежедневная награда готова — забрать</div>` : ''}
      ${S.s.mods.length ? `<div class="chain">Цепочка роя: ${S.s.mods.map(id => { const m = D.MODIFIERS.find(x => x.id === id); return m ? `<span title="${m.short}">${m.name}</span>` : ''; }).join(' + ')}</div>` : ''}
      ${best ? `<div class="rec">Последний забег: ${U.fmt(best.score)} · волна ${best.wave}</div>` : ''}
    </div>`;
  };

  /* ── Подготовка к забегу: режим, бустеры, цепочка ─────────────────── */
  SCRENS.prep = () => {
    const b = S.s.boosters;
    const chips = D.BOOSTERS.map(x => {
      const on = !!b[x.id], afford = S.s.player.coins >= x.cost;
      return `<button class="chip ${on ? 'on' : ''}" data-a="boost" data-arg="${x.id}" ${!on && !afford ? 'disabled' : ''}>
        <b>${x.icon} ${x.name}</b><span>${x.desc}</span><em>${on ? 'включён' : U.fmt(x.cost) + ' 🍯'}</em></button>`;
    }).join('');
    const mods = (S.s.mods || []).map(id => D.MODIFIERS.find(m => m.id === id)).filter(Boolean);
    return `
    <div class="screen">
      <div class="head"><button class="back" data-a="home">←</button><h2>Подготовка</h2></div>
      <div class="card modes">
        <button class="mode ${UI.mode === 'run' || !UI.mode ? 'on' : ''}" data-a="mode" data-arg="run"><b>${D.CONFIG.MODES.run.name}</b><span>${D.CONFIG.MODES.run.desc}</span></button>
        <button class="mode ${UI.mode === 'siege' ? 'on' : ''}" data-a="mode" data-arg="siege"><b>${D.CONFIG.MODES.siege.name}</b><span>${D.CONFIG.MODES.siege.desc}</span></button>
      </div>
      <div class="sect">Бустеры забега <small>покупаются один раз за забег</small></div>
      <div class="chips">${chips}</div>
      ${mods.length ? `<div class="sect">Цепочка модификаторов</div><div class="modlist">${mods.map(m => `<div class="mod r${m.rar}"><b>${m.name}</b><span>${m.short}</span></div>`).join('')}</div>` : ''}
      <button class="big" data-a="start">${UI.mode === 'siege' ? '∞ В осаду' : '▶ В бой'}</button>
    </div>`;
  };

  /* ── Итог забега + драфт ──────────────────────────────────────────── */
  SCRENS.result = () => {
    const r = lastResult; if (!r) return SCRENS.home();
    const gh = r.ghost;
    const win = r.win;
    const beat = r.beat || 0;
    return `
    <div class="screen ${win ? 'win' : 'fail'}">
      <div class="verdict"><b>${win ? 'УЛЕЙ УСТОЯЛ' : 'ПРОБОЙ'}</b><span>волна ${r.wave} · ${U.fmtTime(r.time)}</span></div>
      <div class="score">${U.fmt(r.score)}</div>
      ${r.record ? '<div class="record">НОВЫЙ РЕКОРД УЛЬЯ</div>' : ''}
      ${gh ? `<div class="vs ${beat > 0 ? 'up' : 'down'}">${beat > 0 ? 'Обогнали ' + (gh.me ? 'себя прошлого' : gh.name) + ' на ' + U.fmt(beat) : 'Отстали на ' + U.fmt(-beat) + ' — реванш?'}</div>` : ''}
      <div class="grid4">
        <div><small>Убито</small><b>${r.kills}</b></div>
        <div><small>Слияний</small><b>${r.merges}</b></div>
        <div><small>Расщепл.</small><b>${r.fissions}</b></div>
        <div><small>Сот добыто</small><b>${U.fmt(r.coins)}</b></div>
      </div>
      <div class="shareline">
        <button data-a="share-result">${gh && beat > 0 ? 'Карточка: я обогнал' : 'Поделиться счётом'}</button>
        <button data-a="share-invite">Позвать друга</button>
      </div>
      <button class="big" data-a="draft">Далее: выбор роя →</button>
      <button class="ghostline" data-a="home">В меню</button>
    </div>`;
  };

  SCRENS.draft = () => {
    const pool = D.MODIFIERS.filter(m => S.s.mods.indexOf(m.id) < 0);
    const rng = U.rng('draft' + (S.s.stats.runs || 0) + (S.s.stats.bestScore || 0));
    const pick = [];
    while (pick.length < 3 && pool.length) {
      const i = Math.floor(rng() * pool.length);
      pick.push(pool.splice(i, 1)[0]);
    }
    chain = pick;
    const full = S.s.mods.length >= 4;
    return `
    <div class="screen">
      <div class="head"><h2>ДРАФТ РОЯ</h2><small>выбранный модификатор действует до пробоя улья</small></div>
      ${full ? '<div class="warn">Цепочка полна — новый модификатор заменит самый первый</div>' : ''}
      <div class="draftcards">
        ${pick.map((m, i) => `<button class="dcard r${m.rar}" data-a="pick" data-arg="${m.id}">
            ${fmtR(m)}<b>${m.name}</b><span>${m.short}</span>
            <em>${['', '+', '++', '+++'][m.rar]}</em></button>`).join('')}
      </div>
      <button class="ghostline" data-a="home">Пропустить</button>
    </div>`;
  };

  /* ── Улей (idle + постройка + перерождение) ───────────────────────── */
  SCRENS.hive = () => {
    const out = S.apiaryOutput();
    const bld = D.APIARY.map(a => {
      const lvl = S.s.apiary[a.id] || 0;
      const cost = Math.round(a.cost * Math.pow(a.grow, lvl));
      return `<button class="chip" data-a="build" data-arg="${a.id}" ${S.s.player.coins < cost ? 'disabled' : ''}>
        <b>${a.icon} ${a.name}</b><span>${a.desc}</span><em>ур. ${lvl} · ${U.fmt(cost)} 🍯</em></button>`;
    }).join('');
    const up = D.PRESTIGE.upgrades.map(u => {
      const lvl = S.s.prestige.up[u.id] || 0, cost = u.cost(lvl);
      return `<button class="chip pollen" data-a="pupgrade" data-arg="${u.id}" ${S.s.player.pollen < cost ? 'disabled' : ''}>
        <b>${u.name}</b><span>${u.desc}</span><em>ур. ${lvl} · 🌸 ${cost}</em></button>`;
    }).join('');
    const pg = S.prestigeGain();
    return `
    <div class="screen">
      <div class="head"><button class="back" data-a="home">←</button><h2>Улей</h2>
        <button class="right" data-a="collect">Забрать ${U.fmt(S.offlineInfo().amount)}</button></div>
      <div class="card"><b>Доход ${U.fmt(out)}/сек</b><span>собирается, пока ты в Telegram — до ${C.OFFLINE_CAP_H} ч</span></div>
      <div class="chips">${bld}</div>
      <div class="sect">Перерождение <small>пылинки: 🌸 ${U.fmt(S.s.player.pollen)}</small></div>
      <div class="chips">${up}</div>
      <button class="big ${S.prestigeReady() ? '' : 'dim'}" data-a="prestige" ${S.prestigeReady() ? '' : 'disabled'}>
        ${S.prestigeReady() ? '🌀 Переродиться: +' + pg + ' 🌸' : 'Перерождение с волны ' + D.PRESTIGE.needWave + ' (сейчас ' + S.s.stats.bestWave + ')'}</button>
    </div>`;
  };

  /* ── Коллекция + призыв ───────────────────────────────────────────── */
  SCRENS.dex = () => {
    const cards = D.LINEAGES.map(l => {
      const c = S.s.collection[l.id];
      return `<button class="unit ${c.unlocked ? '' : 'lock'}" data-a="unit" data-arg="${l.id}">
        <i style="--h:${l.hue}deg"></i><b>${c.unlocked ? l.name : '???'}</b>
        <em>${c.unlocked ? '★'.repeat(c.stars + 1) : 'закрыт'} · ${D.RARITY[l.rar].name}</em></button>`;
    }).join('');
    const price = S.summonPrice();
    return `
    <div class="screen">
      <div class="head"><button class="back" data-a="home">←</button><h2>Коллекция роя</h2></div>
      <div class="card summon">
        <b>Личинка неона</b><span>Дубликат = звезда: +8% урона линии навсегда</span>
        <button class="big" data-a="summon" ${S.s.player.orbs < price ? 'disabled' : ''}>Призыв · ${price} ◎</button>
      </div>
      <div class="units">${cards}</div>
    </div>`;
  };

  /* ── Задания: ежедневка, серия, достижения, сезон ─────────────────── */
  SCRENS.quests = () => {
    const qs = S.s.daily.quests.map(q => {
      const def = S.questDef(q.id) || {}, cur = S.questProgress(q), done = cur >= q.goal;
      return `<button class="quest ${q.claimed ? 'done' : ''}" data-a="claim-quest" data-arg="${q.id}" ${done && !q.claimed ? '' : 'disabled'}>
        <i>${def.icon || '•'}</i><b>${def.name || q.id}</b><span>${cur} / ${q.goal}${q.claimed ? ' · получено' : ''}</span>
        <div class="qbar"><i style="width:${U.clamp(cur / q.goal * 100, 0, 100)}%"></i></div>
        <em>${rewardTxt(def)}</em></button>`;
    }).join('');
    const st = S.streakState();
    const ach = S.achState().map(x => { const a = x.a, ready = x.done && !x.claimed;
      return `<button class="ach ${x.claimed ? 'done' : ''}" data-a="claim-ach" data-arg="${a.id}" ${ready ? '' : 'disabled'}>
      <i>${a.icon || '•'}</i><b>${a.name}</b><span>${Math.min(x.cur, a.goal)} / ${a.goal}${x.claimed ? ' ✓' : ''}</span><em>${rewardTxt(a)}</em></button>`; }).join('');
    const tier = S.seasonTierOf(), stt = D.SEASON_TIERS;
    const tiers = stt.map(t => {
      const ok = tier >= t.tier;
      return `<div class="tier ${ok ? 'on' : ''}"><b>${t.tier}</b>
        <button data-a="tier" data-arg="${t.tier}:0" class="${ok && !S.s.season.free.includes(t.tier) ? 'ready' : ''}">${rewardTxt(t.free)}</button>
        <button data-a="tier" data-arg="${t.tier}:1" class="${S.s.season.pass ? '' : 'locked'} ${ok && !S.s.season.prem.includes(t.tier) ? 'ready' : ''}">${rewardTxt(t.prem)}</button></div>`;
    }).join('');
    return `
    <div class="screen">
      <div class="head"><button class="back" data-a="home">←</button><h2>Задания</h2></div>
      <div class="sect">Сегодня <small>серия ${S.s.daily.streak} дн.</small></div>
      <div class="list">${qs}</div>
      ${S.dailyRewardReady() ? `<button class="big" data-a="claim-daily">🎁 Награда дня</button>` : ''}
      <div class="sect">Серия забегов <small>${st.n} из 7 · щитов ${st.shield}</small></div>
      <div class="streak">${D.STREAK.rewards.map((r, i) => `<div class="sday ${st.n > i ? 'on' : ''}"><b>${i + 1}</b><span>${rewardTxt(r)}</span></div>`).join('')}</div>
      ${S.streakReformable() ? `<div class="warn" data-a="reform">${TG.canBuyStars ? '⚡ Починить серию: ' + D.SHOP.streak.price : '⚡ Починить серию бесплатно'} (окно ${D.STREAK.reformWindowH} ч)</div>` : ''}
      <div class="sect">Сезонный пропуск <small>${S.s.season.xp} XP · тир ${tier}</small></div>
      <div class="tiers">${tiers}</div>
      <div class="sect">Достижения</div>
      <div class="list">${ach}</div>
    </div>`;
  };

  /* ── Лиги и группа ────────────────────────────────────────────────── */
  SCRENS.league = () => {
    const lg = S.s.league, tiers = D.LEAGUE.tiers, tier = tiers[lg.tier];
    const rows = NH.Lb.list(Math.max(1200, 900 + lg.tier * 1400));
    const chat = NH.Lb.chat();
    return `
    <div class="screen">
      <div class="head"><button class="back" data-a="home">←</button><h2>Лиги</h2></div>
      <div class="card leaguehead" style="--c:${tier.color}">
        <b>${tier.name}</b><span>${U.fmt(lg.pts)} очков · до «${(tiers[lg.tier + 1] || tier).name}» ${U.fmt(Math.max(0, (tiers[lg.tier + 1] || tier).need - lg.pts))}</span>
        <em>таблица из 8 игроков, ротация ${D.LEAGUE.rotateDays} дня · награда — косметика улья</em>
      </div>
      <div class="board">${rows.map((r, i) => `<div class="brow ${r.me ? 'me' : ''}"><i>${i + 1}</i><b>${r.name}</b><span>${U.fmt(r.score)}</span>${r.ghost ? '<em>призрак</em>' : ''}</div>`).join('')}</div>
      <div class="sect">Улей-группа ${S.s.chat.id ? '' : '<small>определяется автоматически из чата Telegram</small>'}</div>
      ${chat ? `<div class="board">${chat.map((r, i) => `<div class="brow ${r.me ? 'me' : ''}"><i>${i + 1}</i><b>${r.name}</b><span>${U.fmt(r.score)}</span></div>`).join('')}</div>` : '<div class="warn">Сыграй забег, открыт из группового чата — и ты в таблице группы</div>'}
      <button class="big" data-a="share-invite">Позвать друга в улей</button>
    </div>`;
  };

  /* ── Эхо ──────────────────────────────────────────────────────────── */
  SCRENS.echo = () => {
    const bank = S.s.echoBank.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    const runs = S.s.runs24.slice().reverse();
    return `
    <div class="screen">
      <div class="head"><button class="back" data-a="home">←</button><h2>Эхо</h2></div>
      <div class="card"><b>Что такое Эхо</b><span>Кто-то сыграл расклад — и его забег приходит к тебе призраком. Ты видишь его счёт в реальном времени и бежишь против живого человека. Эхо бесплатно, нектар не тратится.</span></div>
      <div class="sect">Твои лучшие расклады <small>сыграть снова или отправить другу</small></div>
      <div class="echoes">${bank.map((e, i) => `<button class="echoc" data-a="echo-play" data-arg="${i}">
        <b>${U.fmt(e.score)}</b><span>волна ${e.wave} · расклад ${String(e.seed).slice(0, 6)}</span>
        <em>Обогнать →</em></button>`).join('') || '<div class="warn">Сыграй забег — расклад появится здесь</div>'}</div>
      ${S.s.chal ? `<div class="chal big" data-a="chal-play"><b>ЧЕЛЛЕНДЖ ОТ ${S.s.chal.name}</b><span>расклад ${S.s.chal.seed.slice(0, 6)}</span><em>В бой →</em></div>` : ''}
      <div class="sect">Последние забеги</div>
      <div class="board">${runs.map(r => `<div class="brow"><i>${r.wave}</i><b>${U.fmt(r.score)}</b><span>${U.fmtTime(r.time)}</span><em data-a="share-chal" data-arg="${r.seed}">бросить вызов</em></div>`).join('') || '<div class="warn">Пусто</div>'}</div>
    </div>`;
  };

  /* ── Магазин Stars ────────────────────────────────────────────────── */
  SCRENS.shop = () => {
    const s = D.SHOP, ok = NH.Store.available();
    const grid = (arr, kind) => arr.map(x => `<button class="buy" data-a="buy" data-arg="${kind}|${x.price}" ${ok ? '' : 'disabled'}>
        <b>${kind === 'orbs' ? '◎' : '🍯'} ${U.fmt(x.n)}</b><span>${x.price}</span>${x.best ? '<em>выгодно</em>' : ''}</button>`).join('');
    return `
    <div class="screen">
      <div class="head"><button class="back" data-a="home">←</button><h2>Магазин</h2></div>
      ${ok ? `<div class="card"><b>${s.starNote}</b><span>Витрина цифровых товаров работает только на Telegram Stars.</span></div>` : `<div class="warn lock">${s.regionLockedText}</div>`}
      <div class="sect">Орбы</div><div class="buys">${grid(s.orbs, 'orbs')}</div>
      <div class="sect">Соты</div><div class="buys">${grid(s.coins, 'coins')}</div>
      <div class="sect">Навсегда</div>
      <div class="buys">
        <button class="buy wide" data-a="buy" data-arg="pass" ${ok ? '' : 'disabled'}><b>${s.pass.name}</b><span>${s.pass.price}</span><em>${s.pass.desc}</em></button>
        <button class="buy wide" data-a="buy" data-arg="starter" ${ok ? '' : 'disabled'}><b>${s.starter.name}</b><span>${s.starter.price}</span><em>${s.starter.desc}</em></button>
        <button class="buy wide" data-a="buy" data-arg="nectar" ${ok ? '' : 'disabled'}><b>${s.nectar.name}</b><span>${s.nectar.price}</span><em>${s.nectar.desc}</em></button>
      </div>
      <div class="card muted"><b>Без рекламы и без pay-to-win</b><span>Видео-награды дают косметику и ускорение, никогда — прогресс целиком. Если ты уже покупал Stars, офферы видео тебе не показываются.</span></div>
    </div>`;
  };

  /* ── Настройки ────────────────────────────────────────────────────── */
  SCRENS.settings = () => {
    const g = S.s.settings;
    const sw = (k, label, val) => `<button class="sw ${val ? 'on' : ''}" data-a="sw" data-arg="${k}"><b>${label}</b><i>${val ? 'вкл' : 'выкл'}</i></button>`;
    const ver = TG.app ? ('Telegram ' + (TG.app.version || '?') + (TG.canBuyStars ? ' · Stars есть' : ' · Stars нет')) : 'Браузер / без Telegram';
    return `
    <div class="screen">
      <div class="head"><button class="back" data-a="home">←</button><h2>Ещё</h2></div>
      <div class="card"><b>${TG.userName}</b><span>уровень ${S.s.player.level} · забегов ${S.s.stats.runs} · наиграно ${U.fmtTime(S.s.stats.play)}<br>${ver}</span></div>
      <div class="sws">
        ${sw('sound', 'Звук', g.sound)}${sw('music', 'Музыка', g.music)}
        ${sw('vibration', 'Вибро и хаптика', g.vibration)}${sw('hints', 'Подсказки', g.hints)}
        ${S.canAds() ? sw('ads', 'Видео-награды', g.ads !== false) : ''}
      </div>
      <div class="sect">Качество графики</div>
      <div class="sws">${[0, 1, 2].map(q => `<button class="sw ${g.quality === q ? 'on' : ''}" data-a="quality" data-arg="${q}"><b>${['Плавно', 'Баланс', 'Неон'][q]}</b></button>`).join('')}</div>
      <div class="card muted"><b>Как победить</b><span>Держи по 2 соты в каждой дорожке, выдвигай тяжёлых в строй первыми, лётных — назад. Расщепляй до волны 5, переплавляй мусор перед боем.</span></div>
      <div class="sws">
        <button class="sw" data-a="share-invite"><b>Позвать друга</b><i>+2 ◎</i></button>
        <button class="sw" data-a="reset"><b>Сбросить улей</b><i>удаляет прогресс</i></button>
      </div>
      <div class="rec">NEON HIVE v${D.VERSION} · без внешних ассетов · Canvas2D + WebAudio</div>
    </div>`;
  };

  SCRENS.pause = () => `
    <div class="screen center">
      <div class="logo"><b>ПАУЗА</b><span>волна ${G.wave || 1} · ${U.fmt(G.score || 0)}</span></div>
      <button class="big" data-a="resume">▶ Продолжить</button>
      <button class="ghostline" data-a="surrender">Сдаться и показать итог</button>
      <button class="ghostline" data-a="home">В меню (прогресс забега сгорит)</button>
    </div>`;

  /* ── Туториальные подсказки ───────────────────────────────────────── */
  const HINT_ALIAS = { front: 'place', recycle: 'melt', fission: 'fiss' };
  UI.hint = (key) => {
    if (!S.s.settings.hints) return;
    const id = HINT_ALIAS[key] || key;
    const t = D.TUTORIAL.find(x => x.id === id); if (!t) return;
    UI.toastTop({ text: t.text, hue: 52 });
  };
  UI.toastTop = (m) => { U.toast(m.text); };
  UI.runEnd = (r) => { lastResult = r; UI.showScreen('result'); };
  UI.collect = (all) => {
    const got = S.collectIdle(all);
    if (got > 0) { U.toast('+' + U.fmt(got) + ' 🍯', 'ok'); NH.fx('coin'); UI.refresh(); }
    else U.toast('Пока пусто');
  };

  /* ── Действия ─────────────────────────────────────────────────────── */
  const ACT = {
    noop() { },
    home() { G.state = 'idle'; UI.showScreen('home'); },
    intro() { UI.showScreen('intro'); },
    'intro-start'() { ACT.start(); },
    prep() { UI.mode = UI.mode || 'run'; UI.showScreen('prep'); },
    settings() { UI.showScreen('settings'); },
    'to-settings'() { UI.showScreen('settings'); },
    hive() { UI.showScreen('hive'); }, dex() { UI.showScreen('dex'); },
    quests() { UI.showScreen('quests'); }, league() { UI.showScreen('league'); },
    shop() { UI.showScreen('shop'); }, echo() { UI.showScreen('echo'); },
    pause() { UI.showScreen('pause'); },
    resume() { G.resume(); },
    boost(id) {
      const b = D.BOOSTERS.find(x => x.id === id);
      if (S.s.boosters[id]) { delete S.s.boosters[id]; }
      else if (S.buy(b.cost)) S.s.boosters[id] = 1;
      else return U.toast('Не хватает сот', 'warn');
      S.save(); NH.fx('ui'); UI.refresh();
    },
    mode(m) { UI.mode = m; UI.refresh(); },
    start() {
      const mode = UI.mode || 'run';
      const cost = C.MODES[mode].cost;
      if (!S.nectarSpend(cost)) return U.toast('Нет нектара: ' + U.fmtTime(S.nectarNextSec()) + ' до капли', 'warn');
      S.s.boosters = {};                       // бустеры горят, если забег не начат — чистим после старта
      S.save();
      const ghost = mode === 'echo' || S.s.chal ? (S.s.chal || S.equippedEcho()) : null;
      G.start({ mode, mods: S.s.mods, chal: S.s.chal, ghost, seed: S.s.chal ? S.s.chal.seed : null });
      UI.showScreen(null);
      NH.Audio.resume();
    },
    siege() { UI.mode = 'siege'; UI.showScreen('prep'); },
    'echo-play'(i) {
      const e = S.s.echoBank.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[+i];
      if (!e) return;
      G.start({ mode: 'echo', seed: e.seed, ghost: Object.assign({ me: false }, e), mods: [] });
      NH.Audio.resume();
      UI.showScreen(null);
    },
    'chal-play'() {
      const c = S.s.chal; if (!c) return;
      G.start({ mode: 'echo', seed: c.seed, ghost: c, mods: [] });
      UI.showScreen(null); S.clearChal(); NH.Audio.init();
    },
    draft() { UI.showScreen('draft'); },
    pick(id) {
      const m = D.MODIFIERS.find(x => x.id === id); if (!m) return;
      if (S.s.mods.length >= 4) S.s.mods.shift();
      S.s.mods.push(id); S.save();
      U.toast('Действует до пробоя: ' + m.short, 'ok');
      UI.showScreen('home');
    },
    surrender() { G.finish(false); },
    build(id) {
      const a = D.APIARY.find(x => x.id === id), lvl = S.s.apiary[id] || 0;
      const cost = Math.round(a.cost * Math.pow(a.grow, lvl));
      if (!S.buy(cost)) return U.toast('Не хватает сот', 'warn');
      S.s.apiary[id] = lvl + 1; S.save(); NH.fx('level'); UI.refresh();
    },
    pupgrade(id) {
      const u = D.PRESTIGE.upgrades.find(x => x.id === id), lvl = S.s.prestige.up[id] || 0, cost = u.cost(lvl);
      if (S.s.player.pollen < cost) return U.toast('Мало пылинок', 'warn');
      S.s.player.pollen -= cost; S.s.prestige.up[id] = lvl + 1; S.save(); NH.fx('level'); UI.refresh();
    },
    prestige() {
      if (!S.prestigeReady()) return;
      U.confirm('Перерождение', 'Соты и постройки останутся, линия и бустеры — сброс. Ты получишь <b>+' + S.prestigeGain() + ' 🌸</b> и постоянные бонусы.', 'Переродиться').then(ok => {
        if (!ok) return; S.prestigeDo(); NH.fx('win'); UI.showScreen('hive');
      });
    },
    summon() {
      const r = S.summon();
      if (r.err) return U.toast(r.err, 'warn');
      NH.fx('orb'); UI.showScreen('dex');
      setTimeout(() => U.toast(r.newUnlock ? 'Новая линия: ' + r.lin.name : (r.newStar ? r.lin.name + ': ещё одна звезда' : 'Дубликат: ' + r.lin.name), r.newUnlock ? 'ok' : ''), 60);
    },
    unit(id) {
      const l = D.LINEAGES.find(x => x.id === id), c = S.s.collection[id];
      if (!c || !c.unlocked) return U.toast('Линия закрыта — зови личинок', 'warn');
      const cost = D.starCost(l.rar, c.stars);
      if (c.stars >= D.RARITY[l.rar].stars) return U.toast(l.name + ': максимум звёзд', 'ok');
      const r = S.starUp(id);
      if (r.err) return U.toast(r.err, 'warn');
      U.toast(l.name + ' ★' + r.star + ' · −' + U.fmt(r.cost) + ' 🍯', 'ok');
      NH.fx('level'); UI.refresh();
    },
    'claim-quest'(id) {
      if (!S.s.day[id] || (S.s.day[id] || 0) < (S.questOf(id) || {}).goal) return;
      const t = S.claimQuest(id); if (t) { U.toast('Награда: ' + rewardTxt(t), 'ok'); NH.fx('orb'); }
      UI.refresh();
    },
    'claim-daily'() { const t = S.claimDailyReward(); if (t) { U.toast('+' + rewardTxt(t), 'ok'); NH.fx('win'); } UI.refresh(); },
    'claim-ach'(id) { const t = S.claimAch(id); if (t) U.toast('Достижение: ' + rewardTxt(t), 'ok'); UI.refresh(); },
    tier(arg) {
      const [n, prem] = arg.split(':').map(Number);
      const t = S.claimTier(n, !!prem);
      if (t) U.toast('Получено: ' + rewardTxt(t), 'ok'); else U.toast('Ещё недоступно', 'warn');
      UI.refresh();
    },
    collect() { UI.collect(true); },
    buy(id) {
      const r = NH.Store.buyItem(id);
      if (r && r.err === 'region') return U.toast(D.SHOP.regionLockedText, 'warn');
      if (r && r.mock) {
        const msg = NH.Store.granted(id);
        if (msg) U.toast(msg, 'ok');
        UI.refresh();
      }
    },
    'nectar-ad'() {
      NH.Ads.show('nectar', () => { S.nectarAdd(1); UI.refresh(); U.toast('+1 нектар', 'ok'); });
    },
    reform() {
      if (TG.canBuyStars) { const r = NH.Store.buyItem('streak'); if (r && r.mock) { S.streakReform('stars'); } }
      else NH.Ads.show('streak_reform', () => S.streakReform('ad'));
      UI.refresh();
    },
    sw(k) {
      const g = S.s.settings;
      if (k === 'music') { g.music = !g.music; NH.Audio.musicOn = g.music; }
      else g[k] = k === 'ads' ? g.ads === false : !g[k];
      if (k === 'sound') NH.Audio.enabled = g.sound;
      S.save(); NH.fx('ui'); UI.refresh();
    },
    quality(q) { S.s.settings.quality = +q; NH.R.quality = +q; NH.R.resize(); S.save(); UI.refresh(); },
    reset() {
      U.confirm('Сбросить улей?', 'Прогресс удалится безвозвратно, в том числе облачная копия.', 'Удалить').then(ok => {
        if (ok) { S.reset(); UI.showScreen('intro'); }
      });
    },
    'share-result'() {
      const r = lastResult || { score: S.s.stats.bestScore, wave: S.s.stats.bestWave, time: 60, seed: 'me' };
      const card = NH.Share.echoCard(r, r.ghost && r.beat > 0);
      if (!(TG.ver(8, 0) && TG.shareEcho(card))) TG.share(card.text, card.query);
      U.toast('Счёт отправлен в чаты', 'ok');
    },
    'share-chal'(seed) {
      const c = NH.Share.challenge({ seed, score: S.s.stats.bestScore });
      NH.TG.share(c.text, c.query);
    },
    'share-invite'() { const c = NH.Share.inviteText(); NH.TG.share(c.text, c.query); }
  };

  root_click();
  function root_click() {
    document.addEventListener('click', ev => {
      const t = ev.target.closest('[data-a]'); if (!t) return;
      const a = t.getAttribute('data-a'), arg = t.getAttribute('data-arg');
      if (t.disabled) return;
      NH.Audio.resume();
      if (!ACT[a]) { console.warn('нет действия', a); return; }
      ACT[a](arg);
    }, true);
    document.addEventListener('pointerdown', () => { NH.Audio.resume(); }, { once: true });
  }

  function bindInput() {
    const cv = UI.el('cv');
    const P = (e) => NH.R.toLogical(e.clientX, e.clientY);
    U.on(cv, 'pointerdown', e => { if (G.state !== 'play') return; const p = P(e); G.down(p.x, p.y); try { cv.setPointerCapture(e.pointerId); } catch (err) { } /* указатель мог отпуститься раньше — в Firefox это бросает */ });
    U.on(cv, 'pointermove', e => { if (G.state !== 'play') return; const p = P(e); G.move(p.x, p.y); });
    U.on(cv, 'pointerup', e => { if (G.state !== 'play') return; const p = P(e); G.up(p.x, p.y); });
    U.on(cv, 'pointercancel', () => { G.drag = null; });
    U.on(cv, 'contextmenu', e => e.preventDefault());
  }
})(window.NH);
