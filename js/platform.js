/* NEON HIVE — платформа: Telegram Mini App мост, процедурный звук, хаптика. */
window.NH = window.NH || {};
(function (NH) {
  'use strict';
  const U = NH.U;

  /* ══ Telegram Mini App ══════════════════════════════════════════════ */
  /* ?mobile=0|1 — QA-переключатель: включает/выключает мобильную ветку
     (фуллскрин по тапу, портретный страж) на десктопе, чтобы не гонять
     сборку на телефоне. */
  const MOBILE_FORCE = (location.search.match(/[?&]mobile=([01])/) || [])[1];
  const IS_MOBILE = MOBILE_FORCE != null ? MOBILE_FORCE === '1' : /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const TG = NH.TG = {
    app: null, ready: false, mobile: IS_MOBILE, _portrait: null,
    /* Сырой мост к клиенту Telegram: часть команд (полный экран, блокировка
       ориентации) есть только в приватном протоколе, не в публичном SDK. */
    sendEvent(type, data) {
      const ev = { eventType: type, eventData: data };
      try {
        if (window.TelegramWebviewProxy && window.TelegramWebviewProxy.postEvent) {
          window.TelegramWebviewProxy.postEvent(type, data ? JSON.stringify(data) : '');
        } else if (window.external && window.external.invoke) {
          window.external.invoke(JSON.stringify(ev));
        } else if (window.parent !== window) {
          window.parent.postMessage(JSON.stringify(ev), '*');
        }
      } catch (e) { }
    },
    isPortrait() { return window.innerHeight >= window.innerWidth; },
    /* Портрет обязателен (холст 720×1280). В ландшафте — оверлей «поверни
       телефон» и РАЗБЛОКИРОВКА ориентации, иначе пользователь не сможет
       повернуть аппарат. В портрете — наоборот, фиксируем экраны. */
    enforcePortrait(force) {
      try { document.documentElement.classList.add('orientation-guard-ready'); } catch (e) { }
      if (!this.mobile) return true;
      const ov = document.getElementById('rotate'), p = this.isPortrait();
      if (ov) ov.classList.toggle('visible', !p);
      if (force || p !== this._portrait) {
        if (!p && NH.Game && NH.Game.state === 'play') document.dispatchEvent(new CustomEvent('nh:pause'));
        try {
          const o = screen.orientation;
          if (o && p && typeof o.lock === 'function') o.lock('portrait').catch(() => { });
          else if (o && !p && typeof o.unlock === 'function') o.unlock();
        } catch (e) { }
        this.sendEvent('web_app_toggle_orientation_lock', { locked: p });
        const w = this.app;
        if (w && this.ver(7, 7)) {
          try { if (p && w.lockOrientation) w.lockOrientation('portrait'); else if (!p && w.unlockOrientation) w.unlockOrientation(); } catch (e) { }
        }
        this._portrait = p;
      }
      return p;
    },
    /* Полный экран: только мобильный клиент, только по жесту пользователя
       (клиент игнорирует fullscreen вне клика) и только в портрете. */
    requestFS() {
      if (!this.mobile || !this.enforcePortrait(true)) return;
      this.sendEvent('web_app_expand');
      this.sendEvent('web_app_request_fullscreen');
      const w = this.app;
      if (w && this.ver(8, 0) && w.requestFullscreen && !w.isFullscreen) {
        try { w.requestFullscreen(); } catch (e) { }
      }
    },
    /* Стартовый ритуал по документации 2026: ready → expand → цвета →
       swipe-lock; ориентация и полный экран — отдельно, см. выше.
       Никакого WebApp.init(). */
    init() {
      const w = window.Telegram && window.Telegram.WebApp;
      this.app = w || null;
      this.enforcePortrait(true);
      window.addEventListener('orientationchange', () => {
        setTimeout(() => this.enforcePortrait(true), 50);
        setTimeout(() => this.enforcePortrait(true), 250);
      });
      if (!this.mobile) {
        /* Десктопный клиент: принудительный фуллскрин ему только вредит,
           поэтому просим выйти из полноэкранного режима с повторами —
           клиент реагирует не с первого вызова. */
        this.sendEvent('web_app_ready');
        this.sendEvent('web_app_exit_fullscreen');
        setTimeout(() => this.sendEvent('web_app_exit_fullscreen'), 150);
        setTimeout(() => this.sendEvent('web_app_exit_fullscreen'), 500);
      }
      if (!w) { this.viewport(); return; }
      try {
        w.ready();
        if (w.expand) w.expand();
        this.ready = true;
        this.applyTheme();
        if (w.setHeaderColor) w.setHeaderColor('#07060f');
        if (w.setBackgroundColor) w.setBackgroundColor('#07060f');
        if (this.ver(8, 0) && w.disableVerticalSwipes) { try { w.disableVerticalSwipes(); } catch (e) { } }
        if (!this.mobile && w.exitFullscreen) { try { w.exitFullscreen(); } catch (e) { } }
        // Первый же тап раскрывает игру на весь экран — уже в портрете
        if (this.mobile) {
          const arm = () => this.requestFS();
          window.addEventListener('pointerdown', arm, { once: true, capture: true });
        }
        // Кнопка «назад» Android
        if (w.BackButton) {
          w.BackButton.onClick(() => document.dispatchEvent(new CustomEvent('nh:back')));
        }
        // Сохранение при закрытии приложения Telegram
        window.addEventListener('blur', () => document.dispatchEvent(new CustomEvent('nh:pause')));
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) document.dispatchEvent(new CustomEvent('nh:pause'));
          else document.dispatchEvent(new CustomEvent('nh:resume'));
        });
        if (w.onEvent) {
          w.onEvent('deactivated', () => document.dispatchEvent(new CustomEvent('nh:pause')));
          w.onEvent('activated', () => document.dispatchEvent(new CustomEvent('nh:resume')));
          w.onEvent('fullscreenFailed', (e) => console.warn('fullscreen failed', e && e.error));
          ['fullscreenChanged', 'safeAreaChanged', 'contentSafeAreaChanged'].forEach((ev) => {
            w.onEvent(ev, () => this.viewport());
          });
        }
        this.viewport();
      } catch (e) { console.warn('TMA init', e); }
    },
    /* Версии платформы: всё новое — только под isVersionAtLeast */
    ver(major, minor) {
      const w = this.app;
      if (!w) return false;
      try { if (w.isVersionAtLeast) return w.isVersionAtLeast(major + '.' + (minor || 0)); } catch (e) { }
      return true;
    },
    /* Размеры: viewportChanged + isStateStable + safe area (CSS-переменные) */
    viewport() {
      const w = this.app, root = document.documentElement;
      const apply = (stable) => {
        TG.enforcePortrait(false);
        const vp = w && w.viewport;
        const set = (n, v) => { if (v != null) root.style.setProperty(n, v + 'px'); };
        if (vp) {
          set('--vh', stable ? vp.stableHeight : vp.height);
          set('--vtop', vp.offsetTop);
          set('--vsafe', vp.safeAreaInset ? vp.safeAreaInset.top : 0);
          root.classList.toggle('vh-unstable', !stable);
          if (vp.safeAreaInset) {
            set('--safe-t', vp.safeAreaInset.top); set('--safe-b', vp.safeAreaInset.bottom);
            set('--safe-l', vp.safeAreaInset.left); set('--safe-r', vp.safeAreaInset.right);
          }
        } else {
          set('--vh', window.innerHeight);
        }
        if (NH.R && NH.R.resize) NH.R.resize();
        document.dispatchEvent(new CustomEvent('nh:viewport'));
      };
      apply(true);
      if (w && w.onEvent) w.onEvent('viewportChanged', () => apply(w.viewport ? w.viewport.isStateStable : true));
      window.addEventListener('resize', () => apply(w && w.viewport ? w.viewport.isStateStable : true));
    },
    /* start_param: ATTRIBUTION инвайтов и челленджей одной ссылкой (?startapp=) */
    get startParam() {
      const w = this.app;
      try {
        if (w && w.initDataUnsafe && w.initDataUnsafe.start_param) return w.initDataUnsafe.start_param;
      } catch (e) { }
      try {
        const q = new URLSearchParams(location.search);
        return q.get('tgWebAppStartParam') || q.get('startapp') || '';
      } catch (e) { return ''; }
    },
    get chatInstance() { const w = this.app; try { return (w.initDataUnsafe || {}).chat_instance || ''; } catch (e) { return ''; } },
    get chatType() { const w = this.app; try { return (w.initDataUnsafe || {}).chat_type || ''; } catch (e) { return ''; } },
    /* «гаснет» ли витрина Stars: платформа явно говорит, можно ли покупать */
    get canBuyStars() {
      const w = this.app;
      if (!w) return false;                                  // вне Telegram витрина скрыта
      try { if (w.canMakePayment) return !!w.canMakePayment(); } catch (e) { }
      return this.ver(6, 0);                                 // решение остаётся за бэкендом (createInvoiceLink)
    },
    applyTheme() {
      const w = this.app; if (!w) return;
      const map = { tg_bg_color: '--bg', tg_text_color: '--fg', tg_button_text_color: '--accent', tg_hint_text_color: '--muted' };
      const c = w.colorScheme || (w.themeParams && w.themeParams.color_scheme);
      document.documentElement.classList.toggle('light', c === 'light');
      if (w.themeParams) for (const k in map) if (w.themeParams[k]) document.documentElement.style.setProperty(map[k], w.themeParams[k]);
      if (w.onEvent) w.onEvent('themeChanged', () => this.applyTheme());
    },
    get userName() {
      const u = this.app && this.app.initDataUnsafe && this.app.initDataUnsafe.user;
      return u ? (u.first_name || u.username || 'Роевик') : 'Роевик';
    },
    get userId() {
      const u = this.app && this.app.initDataUnsafe && this.app.initDataUnsafe.user;
      return u ? u.id : 0;
    },
    haptic(style) {
      if (!this.app) return false;
      try {
        const H = this.app.HapticFeedback;
        if (!H) return false;
        if (H.impactOccurred) H.impactOccurred(style || 'light');
        else if (H.impactFeedbackOccurred) H.impactFeedbackOccurred(style || 'light');
        return true;
      } catch (e) { return false; }
    },
    notify(type) {
      if (!this.app) return false;
      try {
        const H = this.app.HapticFeedback;
        if (H && H.notificationOccurred) { H.notificationOccurred(type); return true; }
        if (H && H.notificationFeedbackOccurred) { H.notificationFeedbackOccurred(type); return true; }
      } catch (e) { }
      return false;
    },
    /* Шеринг. Приоритет: медиа-карточка (shareMessage) → inline-кнопка → буфер обмена.
       Принудительных «поделись, чтобы играть» нет никогда (антипаттерн). */
    share(text, query) {
      const w = this.app;
      if (w && w.switchInlineQuery) {
        try { w.switchInlineQuery(query || 'share', ['users', 'groups', 'channels']); return 'inline'; } catch (e) { }
      }
      if (navigator.share) { try { navigator.share({ text }); return 'native'; } catch (e) { } }
      if (navigator.clipboard) { navigator.clipboard.writeText(text).then(() => U.toast('Скопировано', 'ok')); return 'clipboard'; }
      return false;
    },
    /* Эхо-карточка: делимся результатом как медиа, а не ссылкой (выше конверсия) */
    shareEcho(card) {
      const w = this.app;
      if (w && this.ver(8, 0) && w.shareMessage) {
        try { w.shareMessage({ media_type: 'photo', url: card.url, caption: card.text }); return 'message'; } catch (e) { }
      }
      if (w && this.ver(7, 8) && w.shareToStory && card.toStory) {
        try { w.shareToStory(card.url, { widget_link: { url: card.link } }); return 'story'; } catch (e) { }
      }
      return this.share(card.text, card.query);
    },
    openLink(url) {
      const w = this.app;
      if (w && w.openTelegramLink && /t\.me/.test(url)) { try { w.openTelegramLink(url); return; } catch (e) { } }
      if (w && w.openLink) { try { w.openLink(url); return; } catch (e) { } }
      window.open(url, '_blank');
    },
    /* Счёт на Stars: ссылку создаёт бэкенд (createInvoiceLink, currency="XTR").
       Здесь только «курьер»: получили url → открыли. Без внешних платёжек и TON Connect. */
    pay(invoiceUrl) {
      const w = this.app;
      if (!invoiceUrl) return false;
      if (w && w.openInvoice) { try { w.openInvoice(invoiceUrl, r => document.dispatchEvent(new CustomEvent('nh:paid', { detail: r }))); return true; } catch (e) { } }
      return this.openLink(invoiceUrl) || true;
    },
    /* CloudStorage: пилим сейв на ключи ≤4096 симв. и отправляем батчем.
       Реализация — NH.Cloud (локальная эмуляция + заготовка под REST-бэкенд). */
    cloudSave(keys) { return NH.Cloud ? NH.Cloud.put(keys) : false; },
    cloudLoad(cb) { return NH.Cloud ? NH.Cloud.get(cb) : cb({}); },
    feedback(type) {
      try { if (this.app && this.app.HapticFeedback) this.app.HapticFeedback.impactOccurred(type); } catch (e) { }
    }
  };

  /* ══ Звук: весь саундтрек и SFX синтезируются (нет внешних файлов) ══ */
  const AU = NH.Audio = {
    ctx: null, master: null, musGain: null, sfxGain: null, enabled: true, musicOn: true,
    started: false, musicTimer: 0, step: 0,
    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      try { this.ctx = new AC(); } catch (e) { this.enabled = false; return; }
      this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.85; this.sfxGain.connect(this.master);
      this.musGain = this.ctx.createGain(); this.musGain.gain.value = 0.30; this.musGain.connect(this.master);
    },
    resume() {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      this.started = true;
    },
    tone(freq, dur, type, gain, slide, dest) {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain == null ? 0.25 : gain, t + Math.min(0.02, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g); g.connect(dest || this.sfxGain);
      o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, gain, freq, q) {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 900; f.Q.value = q || 1.1;
      const g = this.ctx.createGain(); g.gain.value = gain == null ? 0.3 : gain;
      src.connect(f); f.connect(g); g.connect(this.sfxGain); src.start(t);
    },
    arp(notes, step, type, gain) {
      if (!this.enabled || !this.ctx) return;
      notes.forEach((f, i) => setTimeout(() => this.tone(f, 0.16, type || 'triangle', gain == null ? 0.16 : gain), i * step));
    },
    /* Именование событий */
    play(name, p) {
      if (!this.enabled) return;
      if (!this.ctx) this.init();
      if (!this.ctx) return;
      if (name === 'shot') name = 'shoot';
      if (name === 'pick') name = 'ui';
      name = { recycle: 'fission', split: 'fission', record: 'level' }[name] || name;
      switch (name) {
        case 'tap': this.tone(360 + Math.random() * 60, 0.06, 'square', 0.06, 220); break;
        case 'spawn': this.tone(520, 0.11, 'triangle', 0.16, 880); break;
        case 'merge': { const l = (p && p.level) || 1; this.arp([440, 660, 880, 1100].slice(0, 2 + Math.min(2, l / 3)), 52, 'triangle', 0.16); } break;
        case 'fission': this.arp([880, 620, 440, 300], 46, 'sawtooth', 0.12); this.noise(0.18, 0.12, 1500, 0.8); break;
        case 'shoot': this.tone(1200 + Math.random() * 200, 0.035, 'square', 0.028, 700); break;
        case 'hit': this.noise(0.05, 0.05, 2400, 1.4); break;
        case 'kill': this.noise(0.13, 0.12, 700, 0.7); this.tone(180, 0.1, 'sawtooth', 0.07, 90); break;
        case 'hurt': this.tone(140, 0.24, 'sawtooth', 0.2, 60); this.noise(0.2, 0.16, 320, 0.6); break;
        case 'wave': this.arp([392, 523, 659], 70, 'sine', 0.14); break;
        case 'boss': this.arp([110, 98, 130, 87], 130, 'sawtooth', 0.19); break;
        case 'echo': this.arp([523, 392, 523, 784, 1046], 78, 'sine', 0.13); break;
        case 'ui': this.tone(760, 0.045, 'sine', 0.07, 620); break;
        case 'orb': this.arp([700, 1050, 1400], 60, 'sine', 0.15); break;
        case 'coin': this.tone(1150, 0.07, 'triangle', 0.09, 1500); break;
        case 'win': this.arp([523, 659, 784, 1046, 1318], 90, 'triangle', 0.17); break;
        case 'lose': this.arp([440, 349, 262, 196], 140, 'sawtooth', 0.15); break;
        case 'level': this.arp([659, 880, 1174], 80, 'triangle', 0.17); break;
        case 'deny': this.tone(180, 0.14, 'square', 0.11, 120); break;
      }
    },
    /* Фоновая музыка: зацикленный неоновый пэд + арпеджио, темп растёт в бою */
    musicTick(dt, intensity) {
      if (!this.enabled || !this.musicOn || !this.ctx || !this.started) return;
      this.musicTimer -= dt;
      if (this.musicTimer > 0) return;
      const bpm = 92 + intensity * 34;
      this.musicTimer = 60 / bpm / 2;
      const scale = [0, 3, 5, 7, 10, 12, 15, 14];
      const root = 55;
      const n = scale[this.step % scale.length];
      const f = root * Math.pow(2, n / 12);
      this.tone(f * 2, 0.42, 'sine', 0.055 + intensity * 0.02, null, this.musGain);
      if (this.step % 4 === 0) this.tone(f, 0.9, 'triangle', 0.05, null, this.musGain);
      if (this.step % 8 === 4 && intensity > 0.2) this.noise(0.09, 0.05 * intensity, 5200, 0.9);
      if (this.step % 2 === 1) this.tone(f * 4 * (1 + ((this.step * 7) % 3)), 0.2, 'square', 0.018 + intensity * 0.02, null, this.musGain);
      this.step++;
    }
  };

  /* Единая точка «отклик на действие»: звук + хаптика + вибрация */
  NH.fx = (sound, haptic, vib, isMusic) => {
    const s = NH.Save && NH.Save.s;
    if (s && !s.settings.sound) return;
    NH.Audio.play(sound);
    if (haptic) TG.haptic(haptic);
    if (vib && (!s || s.settings.vibration)) U.vibrate(vib);
  };
})(window.NH);
