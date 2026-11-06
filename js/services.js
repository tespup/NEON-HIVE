/* NEON HIVE — сервисный слой: облачный сейв, витрина Stars, rewarded-заглушки,
   лидерборды, шеринг. Всё работает БЕЗ бэкенда; реальный сервер включается одной строкой (CFG.api). */
window.NH = window.NH || {};
(function (NH) {
  'use strict';
  const U = NH.U, D = NH.DATA;

  /* Пусто = локальный режим. Заполни — и игра начнёт ходить на твой бэкенд. */
  const CFG = NH.CFG = {
    api: '',                       // 'https://example.com/nh'
    bot: 'NeonHiveGameBot',        // для ссылок ?startapp=
    forceStore: false,             // true — показывать витрину и вне Telegram (для QA)
    cloudKey: 'nh_cloud_v1'
  };

  /* ── CloudStorage-адаптер. Те же лимиты, что у Telegram:
        ключ 1–128 симв. [A-Za-z0-9_-], значение ≤4096, ≤1024 ключей. ───── */
  const Cloud = NH.Cloud = {
    MAX_KEY: 128, MAX_VAL: 4096, MAX_KEYS: 1024,
    ok(k, v) {
      return /^[A-Za-z0-9_-]{1,128}$/.test(k) && String(v).length <= Cloud.MAX_VAL;
    },
    put(keys) {
      const clean = {}; let n = 0;
      for (const k in keys) {
        const v = String(keys[k]);
        if (!Cloud.ok(k, v)) { console.warn('Cloud: ключ/значение вне лимита', k); continue; }
        clean[k] = v; n++;
        if (n >= Cloud.MAX_KEYS) break;
      }
      if (!n) return false;
      try {                                        // локальная эмуляция (всегда)
        const cur = JSON.parse(localStorage.getItem(CFG.cloudKey) || '{}');
        Object.assign(cur, clean);
        localStorage.setItem(CFG.cloudKey, JSON.stringify(cur));
      } catch (e) { }
      if (CFG.api) {                               // батч на бэкенд (best effort)
        try { fetch(CFG.api + '/storage/set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys: clean }) }); } catch (e) { }
      }
      return true;
    },
    get(cb) {
      const local = () => {
        try { return JSON.parse(localStorage.getItem(CFG.cloudKey) || '{}'); } catch (e) { return {}; }
      };
      if (CFG.api && window.fetch) {
        let done = false;
        try {
          fetch(CFG.api + '/storage/get').then(r => r.ok ? r.json() : {}).then(j => {
            if (done) return; done = true;
            cb(Object.assign({}, local(), (j && j.keys) || {}));
          }).catch(() => { if (!done) { done = true; cb(local()); } });
          setTimeout(() => { if (!done) { done = true; cb(local()); } }, 2500);
          return;
        } catch (e) { }
      }
      cb(local());
    }
  };

  /* ── Витрина Telegram Stars (единственная разрешённая платёжка для цифровых
        товаров). Ссылку на счёт создаёт бэкенд: createInvoiceLink, currency="XTR". ── */
  const Store = NH.Store = {
    locked: false,
    available() {
      if (Store.locked) return false;
      if (CFG.forceStore) return true;
      return !!(NH.TG.app && NH.TG.canBuyStars);
    },
    lock(reason) { Store.locked = true; if (reason) U.toast(reason, 'warn'); },
    priceOf(id) {
      const s = D.SHOP;
      if (s[id]) return s[id].price;
      if (/^(orbs|coins)\|/.test(id)) return id.split('|')[1];   // «orbs|400 Stars»
      const all = s.orbs.concat(s.coins);
      const it = all.find(x => x.id === id);
      return it ? it.price : null;
    },
    /* Покупка: есть бэкенд — получаем invoice; нет — тестовый режим (не ломает цикл). */
    buyItem(id, payload) {
      if (!Store.available()) return { err: 'region' };
      if (CFG.api) {
        try {
          fetch(CFG.api + '/invoice', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item: id, payload: payload || null })
          }).then(r => r.json()).then(j => {
            if (j && j.url) NH.TG.pay(j.url); else U.toast('Платёж недоступен', 'warn');
          }).catch(() => U.toast('Нет связи с сервером', 'warn'));
          return { pending: true };
        } catch (e) { return { err: 'net' }; }
      }
      NH.Save.markPayer();
      U.toast('Тестовая покупка: бэкенд не подключён', 'ok');
      return { mock: true };
    },
    granted(id) {                                  // что выдаём после успешной оплаты
      const S = NH.Save, s = D.SHOP;
      if (id === 'pass') { S.s.season.pass = true; S.save(); return 'Пропуск сезона открыт'; }
      if (id === 'starter') { S.coin(5000); S.orb(3); S.s.boosters.startlvl = (S.s.boosters.startlvl || 0) + 1; S.save(); return 'Старт-набор получен'; }
      if (id === 'nectar') { S.nectarAdd(4); return '+4 нектара'; }
      if (id && id.indexOf('orbs') === 0) { const o = Store.priceOf(id); const it = s.orbs.find(x => x.price === o); S.orb(it ? it.n : 5); return 'Орбы зачислены'; }
      if (id && id.indexOf('coins') === 0) { const o = Store.priceOf(id); const it = s.coins.find(x => x.price === o); S.coin(it ? it.n : 25000); return 'Соты зачислены'; }
      return null;
    }
  };

  /* ── Rewarded-заглушки. Правилa из исследования: 3–5 показов на сессию,
        ≤15 в день, плательщик их вообще не видит, награда ≠ единственный источник прогресса. ── */
  const Ads = NH.Ads = {
    session: 0, capSession: 5, capDay: 15,
    offerable() {
      const S = NH.Save;
      return !!S.s && S.canAds() && (S.s.day.ads || 0) < Ads.capDay && Ads.session < Ads.capSession;
    },
    show(reason, onReward) {
      if (!Ads.offerable()) { U.toast('Видео сейчас недоступно', 'warn'); return false; }
      const grant = () => { Ads.session++; NH.Save.adShown(); NH.fx('orb'); onReward && onReward(); };
      if (CFG.api && window.fetch) {                 // реальный провайдер появится здесь
        try { fetch(CFG.api + '/ad/next', { method: 'POST', body: JSON.stringify({ reason }) }); } catch (e) { }
      }
      U.confirm('Тестовый rewarded-ролик', 'Бэкенда рекламы нет. Имитировать просмотр и выдать награду?').then(ok => {
        if (ok) grant();
      });
      return true;
    }
  };

  /* ── Лидерборды: неделя (лига на 8) и клан = группа Telegram.
        Беpp-разметка по сидy недели: таблица выглядит живой до появления бэкенда,
        но соперники честно подписаны как «призраки» — не «друзья». ── */
  const Lb = NH.Lb = {
    weekKey: () => U.weekKey(),
    seeded(key, n, base) {
      const rng = U.rng('lb' + key);
      const out = [];
      for (let i = 0; i < n; i++) {
        const nm = U.pickSeeded(rng, D.NAME_A) + U.pickSeeded(rng, D.NAME_B);
        out.push({ name: nm, score: Math.floor(base * (0.55 + rng() * 1.15)), me: false, ghost: true });
      }
      return out;
    },
    list(base) {
      const S = NH.Save, key = Lb.weekKey();
      if (S.s.lbWeek !== key) { S.s.lbWeek = key; S.s.lbScores = S.s.lbScores || {}; S.s.lbScores[key] = 0; S.save(); }
      const mine = (S.s.lbScores && S.s.lbScores[key]) || 0;
      const rows = Lb.seeded(key, 7, base || Math.max(1200, mine));
      rows.push({ name: S.s.player.name, score: mine, me: true, ghost: false });
      rows.sort((a, b) => b.score - a.score);
      return rows;
    },
    submit(score) {
      const S = NH.Save, key = Lb.weekKey();
      S.s.lbScores = S.s.lbScores || {};
      if (score > (S.s.lbScores[key] || 0)) { S.s.lbScores[key] = score; S.save(); }
      S.leagueAdd(Math.floor(score / 40));
      return (S.s.lbScores[key] || 0) === score;
    },
    chat() {
      const S = NH.Save, c = S.s.chat;
      if (!c.id) return null;
      const rows = Lb.seeded('chat' + c.id, 7, Math.max(2000, c.goal));
      rows.push({ name: S.s.player.name, score: c.goal, me: true, ghost: false });
      rows.sort((a, b) => b.score - a.score);
      return rows;
    }
  };

  /* ── Шеринг: инвайт, челлендж (тот же seed у обеих сторон), карточка Эха ── */
  const Share = NH.Share = {
    link(param) {
      const base = 'https://t.me/' + CFG.bot;
      return param ? base + '?startapp=' + encodeURIComponent(param) : base;
    },
    inviteText() {
      const S = NH.Save;
      const id = (NH.TG.userId || 'me') + '-' + (S.s.stats.runs || 0);
      return {
        text: 'НЕОНОВЫЙ УЛЕЙ — собираю рой за 100 секунд. Обгони меня: ' + Share.link('inv_' + id),
        query: 'inv_' + id
      };
    },
    challenge(run) {
      const S = NH.Save, me = S.s.player.name;
      return {
        text: me + ' набрал ' + U.fmt(run.score) + ' в НЕОНОВОМ УЛЕЕ. Расклад тот же — переиграй: ' + Share.link('ch_' + run.seed),
        query: 'ch_' + run.seed,
        link: Share.link('ch_' + run.seed)
      };
    },
    echoCard(run, beaten) {
      const S = NH.Save;
      const who = beaten ? beaten.name : 'свой прошлый забег';
      const d = run.score - (beaten ? beaten.score : 0);
      const text = beaten
        ? 'Я обошёл ' + who + ' на ' + U.fmt(Math.abs(d)) + ' очков в НЕОНОВОМ УЛЕЕ (' + U.fmt(run.score) + '). Твоя очередь: '
        : 'Мой рой в НЕОНОВОМ УЛЕЕ: ' + U.fmt(run.score) + ' очков за ' + U.fmtTime(run.time) + '. Повтори: ';
      return { text: text + Share.link('ch_' + run.seed), query: 'ch_' + run.seed, link: Share.link('ch_' + run.seed) };
    },
    /* Разбор start_param: inv_… — инвайт, ch_… — челлендж (seed = остальное) */
    parse(p) {
      if (!p) return null;
      if (p.indexOf('inv_') === 0) return { type: 'invite', id: p.slice(4) };
      if (p.indexOf('ch_') === 0) return { type: 'challenge', seed: p.slice(3) };
      return { type: 'other', id: p };
    }
  };
})(window.NH);
