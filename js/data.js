/* NEON HIVE — игровые данные и баланс. Все числа собраны здесь, чтобы балансился правкой одного файла. */
window.NH = window.NH || {};
(function (NH) {
  'use strict';
  const D = NH.DATA = {};

  D.VERSION = '1.0.0';
  D.SAVE_KEY = 'neonhive_save_v1';

  D.CONFIG = {
    W: 720, H: 1280,                 // логическое пространство рендера (портрет 9:16)
    LANES: 4,
    GRID: { cols: 4, rows: 4, cell: 128, x: 104, y: 600 },
    LANE_TOP: 140, CORE_Y: 576,
    REACTOR: { x: 360, y: 1200, r: 66 },
    PADS: { fission: { x: 140, y: 1200, r: 48 }, recycle: { x: 580, y: 1200, r: 48 } },
    ECHO_BTN: { x: 650, y: 74, r: 36 },
    PAUSE_BTN: { x: 70, y: 74, r: 34 },

    ENERGY_MAX: 100,                 // энергия забега (тапы реактора)
    ENERGY_COST: 1,
    ENERGY_REGEN: 7.5,               // единиц/сек внутри забега
    SPAWN_COST_GROWTH: 0.055,         // подорожание спавна за каждого юнита на поле
    MERGE_MAX_LEVEL: 10,

    CORE_HP: 150, CORE_HP_PER_PRESTIGE: 18,
    WAVE_BREAK: 2.6,
    ECHO_DURATION: 15, ECHO_POWER: 0.42, ECHO_CHARGES: 1,

    OFFLINE_CAP_H: 8,
    RECRACY_RATE: 0.5,               // курс переплавки: 50% от влитых сот (docs/RESEARCH.md §4.4)

    /* ── Режимы и «нектар» (билеты) — см. docs/RESEARCH.md §6.4 ──────── */
    RUN_WAVES: 8,                    // регулярный забег: 8 волн ≈ 100 секунд
    RUN_SOFT_TIME: 100,              // ориентир длительности, сек
    SURGE_LAST: 1.32,                // множитель силы финальной волны
    NECTAR: { max: 8, regen: 240, run: 1, siege: 2, duel: 0 },  // секунд на 1 единицу
    MODES: {
      run: { id: 'run', name: 'Забег', cost: 1, desc: '8 волн, ~100 секунд, итог и драфт модификаторов.' },
      echo: { id: 'echo', name: 'Эхо', cost: 0, desc: 'Расклад друга один в один по seed. Нектар не тратится.' },
      siege: { id: 'siege', name: 'Осада', cost: 2, desc: 'Бесконечные волны до пробоя улья. Условие Перерождения.' }
    }
  };

  D.RARITY = [
    { id: 0, key: 'common', name: 'Обычный', w: 52, color: '#8fd8ff', stars: 3 },
    { id: 1, key: 'rare', name: 'Редкий', w: 28, color: '#7dffb0', stars: 4 },
    { id: 2, key: 'epic', name: 'Эпический', w: 15, color: '#d48bff', stars: 5 },
    { id: 3, key: 'legend', name: 'Легендарный', w: 5, color: '#ffd166', stars: 6 }
  ];

  /* ── Юниты-линии (12 процедурных существ) ─────────────────────────────
     kind — поведение стрельбы; base — урон/скорострельность/скорость пули  */
  D.LINEAGES = [
    { id: 'drone', name: 'Трутень', rar: 0, kind: 'single', base: { dmg: 11, rate: 1.15, ps: 760 }, hue: 196, art: { body: 'oval', wings: 'twin', horns: 0, eyes: 'dot', ring: 0 }, desc: 'Базовый воин роя. Дешёвый, быстрый, всегда в тему.' },
    { id: 'sting', name: 'Жало', rar: 0, kind: 'rapid', base: { dmg: 6, rate: 2.4, ps: 900 }, hue: 44, art: { body: 'dart', wings: 'twin', horns: 1, eyes: 'visor', ring: 0 }, desc: 'Скорострел. Собирает урон частотой, а не весом.' },
    { id: 'hiveguard', name: 'Страж', rar: 0, kind: 'single', base: { dmg: 15, rate: 0.85, ps: 680 }, hue: 160, art: { body: 'hex', wings: 'none', horns: 2, eyes: 'dot', ring: 1 }, desc: 'Плотный удар и стабильный темп. Хорош в первых рядах.' },
    { id: 'hornet', name: 'Шершень', rar: 1, kind: 'splash', base: { dmg: 30, rate: 0.55, ps: 600, splash: 78 }, hue: 20, art: { body: 'heavy', wings: 'twin', horns: 3, eyes: 'visor', ring: 1 }, desc: 'Взрыв по площади. Выкашивает плотные рои врага.' },
    { id: 'borer', name: 'Борон', rar: 1, kind: 'pierce', base: { dmg: 17, rate: 0.95, ps: 980, pierce: 2 }, hue: 300, art: { body: 'dart', wings: 'swept', horns: 1, eyes: 'quad', ring: 0 }, desc: 'Пробивает до 3 врагов на линии.' },
    { id: 'frost', name: 'Морозник', rar: 1, kind: 'slow', base: { dmg: 9, rate: 0.95, ps: 700, slow: 0.42, slowT: 1.6 }, hue: 186, art: { body: 'crystal', wings: 'fan', horns: 4, eyes: 'dot', ring: 1 }, desc: 'Замедляет цель на 42%. Основа контроля толпы.' },
    { id: 'volta', name: 'Вольта', rar: 2, kind: 'chain', base: { dmg: 16, rate: 0.8, ps: 840, chain: 3 }, hue: 265, art: { body: 'hex', wings: 'fan', horns: 2, eyes: 'visor', ring: 1 }, desc: 'Молния перескакивает на 3 соседние цели.' },
    { id: 'venom', name: 'Чёрная Мамба', rar: 2, kind: 'venom', base: { dmg: 8, rate: 1.0, ps: 720, dot: 9, dotT: 4 }, hue: 108, art: { body: 'oval', wings: 'swept', horns: 2, eyes: 'quad', ring: 0 }, desc: 'Яд капает 4 секунды и стакается до 5 раз.' },
    { id: 'solar', name: 'Соларис', rar: 2, kind: 'splash', base: { dmg: 46, rate: 0.5, ps: 640, splash: 108 }, hue: 38, art: { body: 'star', wings: 'fan', horns: 5, eyes: 'visor', ring: 1 }, desc: 'Тяжёлая плазма. Долго заряжается — страшно бьёт.' },
    { id: 'prism', name: 'Призма', rar: 2, kind: 'pierce', base: { dmg: 21, rate: 0.85, ps: 1060, pierce: 4 }, hue: 320, art: { body: 'crystal', wings: 'swept', horns: 3, eyes: 'quad', ring: 1 }, desc: 'Игольчатый луч сквозь строй: до 5 целей.' },
    { id: 'quantum', name: 'Квант', rar: 3, kind: 'crit', base: { dmg: 27, rate: 1.0, ps: 900, crit: 0.34, critX: 2.4 }, hue: 214, art: { body: 'star', wings: 'twin', horns: 2, eyes: 'visor', ring: 1 }, desc: '34% шанс критического урона ×2.4.' },
    { id: 'magnetar', name: 'Магнетар', rar: 3, kind: 'support', base: { dmg: 9, rate: 0.7, ps: 700, energy: 0.55 }, hue: 58, art: { body: 'ring', wings: 'fan', horns: 6, eyes: 'visor', ring: 1 }, desc: 'Даёт +0.55 энергии/сек за каждый уровень. Топ-приоритет в длинных забегах.' }
  ];
  /* ── Мутации (выдаёт Расщепление — наша «двунаправленная» механика) ─── */
  D.MUTATIONS = [
    { id: 'blaze', name: 'Горение', hue: 22, w: 20, short: 'ожог 12/с', desc: 'Подожжённый враг получает 12 урона/сек 3 сек.' },
    { id: 'hoarfrost', name: 'Иней', hue: 186, w: 18, short: '−35% скорости', desc: 'Замедление цели на 35% на 1.4 сек.' },
    { id: 'arc', name: 'Дуга', hue: 265, w: 15, short: 'цепь ×2', desc: 'Снаряд бьёт по 2 соседним целям (55% урона).' },
    { id: 'toxin', name: 'Токсин', hue: 108, w: 15, short: 'яд-стан', desc: 'Накопление яда: на 5-м стаке враг замирает на 0.8 сек.' },
    { id: 'ricochet', name: 'Рикошет', hue: 44, w: 12, short: 'пробой +2', desc: 'Снаряд проходит сквозь 2 дополнительных врага.' },
    { id: 'overshoot', name: 'Перелёт', hue: 320, w: 9, short: 'крит ×2.6', desc: '18% шанс выстрелить вдвое сильнее.' },
    { id: 'dynamo', name: 'Динамо', hue: 58, w: 7, short: '+энергия', desc: '+0.35 энергии/сек за каждый уровень юнита.' },
    { id: 'twinshot', name: 'Дуплет', hue: 214, w: 4, short: 'двойной выстрел', desc: 'Каждый 3-й выстрел — двумя снарядами.' }
  ];

  /* ── Враги ─────────────────────────────────────────────────────────── */
  D.ENEMIES = {
    mite: { name: 'Клещ', hp: 16, spd: 74, dmg: 5, r: 18, hue: 96, coin: 2, art: { legs: 6, shell: 0 }, w: 40 },
    skarab: { name: 'Скарабей', hp: 42, spd: 56, dmg: 8, r: 22, hue: 268, coin: 4, art: { legs: 6, shell: 1 }, w: 28 },
    moth: { name: 'Мотылёк', hp: 30, spd: 116, dmg: 6, r: 19, hue: 316, coin: 5, art: { legs: 2, shell: 0, zig: 1 }, w: 18 },
    goliath: { name: 'Голиаф', hp: 132, spd: 34, dmg: 16, r: 32, hue: 12, coin: 12, art: { legs: 8, shell: 1, armor: .15 }, w: 10 },
    splitter: { name: 'Делитель', hp: 64, spd: 62, dmg: 9, r: 25, hue: 78, coin: 8, art: { legs: 4, split: 2 }, w: 9 },
    armos: { name: 'Панцирник', hp: 98, spd: 44, dmg: 13, r: 28, hue: 204, coin: 10, art: { legs: 6, armorFlat: 9 }, w: 7 },
    phantom: { name: 'Фантом', hp: 70, spd: 90, dmg: 11, r: 21, hue: 240, coin: 11, art: { legs: 0, phase: 1, zig: 1 }, w: 6 },
    boss: { name: 'МАТКА', hp: 640, spd: 26, dmg: 40, r: 62, hue: 350, coin: 90, art: { legs: 8, shell: 1, boss: 1, crown: 1 }, w: 0 }
  };

  /* ── Бустеры (покупаются до забега за соты) ─────────────────────────── */
  D.BOOSTERS = [
    { id: 'startlvl', name: 'Инкубатор', icon: '🧬', cost: 420, desc: 'Старт забега с тремя юнитами 2-го уровня.' },
    { id: 'energy', name: 'Перегрузка', icon: '⚡', cost: 300, desc: '+70 макс. энергии и +35% её регена на забег.' },
    { id: 'shield', name: 'Щит улья', icon: '🛡', cost: 520, desc: 'Поглощает 4 удара врага до пробоя улья.' },
    { id: 'fury', name: 'Ярость', icon: '🔥', cost: 640, desc: '+25% урона всего роя до 12-й волны.' },
    { id: 'fission', name: 'Кристалл-нож', icon: '🔪', cost: 380, desc: '3 бесплатных Расщепления в каждом забеге.' },
    { id: 'revive', name: 'Второе дыхание', icon: '💠', cost: 900, desc: 'Оживление: улей восстанавливает 45% HP, поле очищается.' }
  ];

  /* ── Пасека (idle-доход) ───────────────────────────────────────────── */
  D.APIARY = [
    { id: 'comb', name: 'Сотовая башня', icon: '🍯', base: 3.2, grow: 1.36, cost: 140, desc: 'Базовый поток сот в секунду.' },
    { id: 'reactor', name: 'Неон-реактор', icon: '☢️', base: 2.0, grow: 1.40, cost: 220, desc: 'Меньше сот, но растёт быстрее остальных.' },
    { id: 'beacon', name: 'Маяк роя', icon: '📡', base: 6.5, grow: 1.44, cost: 900, desc: 'Дорогая постройка с высоким доходом.' }
  ];

  /* ── Ежедневные квесты (шаблон пула; 3 на день по сид-дате) ────────── */
  D.DAILY_POOL = [
    { id: 'tap', name: 'Разогреть реактор', goal: 200, scale: 26, cur: 's_taps', coin: 340, xp: 22, icon: '👆' },
    { id: 'merge', name: 'Сплести 40 слияний', goal: 40, scale: 6, cur: 's_merges', coin: 380, xp: 24, icon: '🧩' },
    { id: 'wave', name: 'Держать 10 волн в забеге', goal: 10, scale: 2, cur: 's_wave', coin: 460, xp: 30, icon: '🌊' },
    { id: 'fission', name: '3 Расщепления', goal: 3, scale: 1, cur: 's_fission', coin: 420, xp: 26, icon: '🔪' },
    { id: 'boss', name: 'Убить 2 матки', goal: 2, scale: 1, cur: 's_boss', coin: 700, xp: 44, icon: '👑' },
    { id: 'echo', name: 'Позвать Эхо', goal: 1, scale: 1, cur: 's_echo', coin: 300, xp: 18, icon: '👻', orb: 1 },
    { id: 'kills', name: 'Перебить 600 врагов', goal: 600, scale: 90, cur: 's_kills', coin: 400, xp: 25, icon: '☠️' },
    { id: 'collect', name: 'Собрать 4000 сот', goal: 4000, scale: 700, cur: 's_coin', coin: 360, xp: 20, icon: '🍯' },
    { id: 'runs', name: 'Три забега', goal: 3, scale: 1, cur: 's_runs', coin: 320, xp: 20, icon: '▶️' },
    { id: 'mut', name: 'Получить 2 мутации', goal: 2, scale: 1, cur: 's_mut', coin: 480, xp: 28, icon: '🧪' }
  ];

  /* ── Достижения ─────────────────────────────────────────────────────── */
  D.ACHIEVEMENTS = [
    { id: 'a_run1', name: 'Первый улей', goal: 1, cur: 'runs', coin: 200, xp: 10, icon: '▶️', desc: 'Сыграй первый забег.' },
    { id: 'a_wave5', name: 'Держим строй', goal: 5, cur: 'bestWave', coin: 350, xp: 16, icon: '🌊', desc: 'Переживи 5 волн.' },
    { id: 'a_wave15', name: 'Рой не дрогнул', goal: 15, cur: 'bestWave', coin: 1200, xp: 40, icon: '🌊', orb: 2, desc: 'Переживи 15 волн.' },
    { id: 'a_wave30', name: 'Легенда дорожки', goal: 30, cur: 'bestWave', coin: 4000, xp: 90, orb: 4, desc: 'Переживи 30 волн.' },
    { id: 'a_merge250', name: 'Плетельщик', goal: 250, cur: 'merges', coin: 900, xp: 32, icon: '🧩', desc: '250 слияний за всё время.' },
    { id: 'a_tap3000', name: 'Палец-молния', goal: 3000, cur: 'taps', coin: 800, xp: 28, icon: '👆', desc: '3000 тапов по реактору.' },
    { id: 'a_kill5000', name: 'Истребитель', goal: 5000, cur: 'kills', coin: 1500, xp: 46, icon: '☠️', desc: '5000 врагов.' },
    { id: 'a_fis25', name: 'Хирург неона', goal: 25, cur: 'fissions', coin: 1400, xp: 42, icon: '🔪', orb: 2, desc: '25 Расщеплений.' },
    { id: 'a_echo5', name: 'Говорящий с эхом', goal: 5, cur: 'echoes', coin: 1100, xp: 34, icon: '👻', desc: '5 вызовов Эха.' },
    { id: 'a_summon20', name: 'Инкубаторий', goal: 20, cur: 'summons', coin: 1300, xp: 38, icon: '🥚', desc: '20 призывов личинок.' },
    { id: 'a_star10', name: 'Коллекционер', goal: 10, cur: 'stars', coin: 2200, xp: 60, orb: 3, icon: '⭐', desc: '10 звёзд коллекции.' },
    { id: 'a_pres1', name: 'Перерождение', goal: 1, cur: 'prestiges', coin: 5000, xp: 120, orb: 6, icon: '🌀', desc: 'Соверши Первый Рой (престиж).' }
  ];

  /* ── Сезонный пропуск: 12 тиров ─────────────────────────────────────── */
  D.SEASON_TIERS = (() => {
    const free = [
      { coin: 800 }, { orb: 1 }, { coin: 1600 }, { b: 'energy' }, { orb: 2 }, { coin: 2600 },
      { b: 'shield' }, { orb: 2 }, { coin: 4000 }, { orb: 3 }, { coin: 6000 }, { orb: 5, pollen: 3 }
    ];
    const prem = [
      { coin: 2200 }, { b: 'fission' }, { orb: 3 }, { coin: 4400 }, { pollen: 4 }, { orb: 4 },
      { coin: 8000 }, { b: 'revive' }, { orb: 5 }, { pollen: 6 }, { coin: 14000 }, { orb: 10, pollen: 10 }
    ];
    return free.map((f, i) => ({ tier: i + 1, need: 260 * (i + 1) + 90 * i * i, free: f, prem: prem[i] }));
  })();

  /* ── Перерождение (престиж) ─────────────────────────────────────────── */
  D.PRESTIGE = {
    needWave: 40,
    pollenFormula: w => Math.max(0, Math.floor(Math.pow(Math.max(0, w - 39), 1.25) * 4)),
    pollenPerBonus: 2,               // +2% урона за каждую пылинку пассивно
    upgrades: [
      { id: 'core', name: 'Армия сот', per: 1, cost: p => 6 + p * 8, desc: '+18 HP улья за уровень, навсегда.' },
      { id: 'echo', name: 'Резонанс', per: 2, cost: p => 10 + p * 14, desc: '+1 заряд Эха за уровень.' },
      { id: 'energy', name: 'Клетки-конденсаторы', per: 1, cost: p => 8 + p * 10, desc: '+8 макс. энергии и +4% регена.' },
      { id: 'fortune', name: 'Мёдовый заговор', per: 1, cost: p => 12 + p * 12, desc: '+8% сот за забег.' }
    ]
  };

  /* ── Roguelite-драфт: 3 модификатора после каждого забега ─────────────
     Формат подачи — «1 строка + 1 число» (урок Slay the Spire).
     Ключи кроме id/name/rar/short механически применяются в Game.stats.  */
  D.MODIFIERS = [
    { id: 'hotcomb', name: 'Раскалённые соты', rar: 0, short: 'Урон роя +15%', dmgMul: 0.15 },
    { id: 'quickwing', name: 'Быстрое крыло', rar: 0, short: 'Скорострельность +12%', rateMul: 0.12 },
    { id: 'nectarflow', name: 'Поток нектара', rar: 0, short: 'Реген энергии +25%', energyRegen: 0.25 },
    { id: 'deepcells', name: 'Глубокие соты', rar: 0, short: 'Максимум энергии +30', energyMax: 30 },
    { id: 'hivecoat', name: 'Панцирный воск', rar: 0, short: 'HP улья +25', coreHp: 25 },
    { id: 'beeconomy', name: 'Мёдовая казна', rar: 0, short: 'Соты +25%', coinMul: 0.25 },
    { id: 'melter', name: 'Плавильня', rar: 1, short: 'Переплавка +80%', recycleMul: 0.8 },
    { id: 'fissionrush', name: 'Кристалл-нож', rar: 1, short: '2 Расщепления бесплатно', fissionFree: 2 },
    { id: 'sharppollen', name: 'Острая пыльца', rar: 1, short: 'Крит-шанс +10%', critAdd: 0.10 },
    { id: 'longneedle', name: 'Длинное жало', rar: 1, short: 'Пробой +1', pierceAdd: 1 },
    { id: 'conductive', name: 'Сухой воздух', rar: 1, short: 'Цепь молний +1', chainAdd: 1 },
    { id: 'cheapbrood', name: 'Дешёвый расплод', rar: 1, short: 'Спавн на 20% дешевле', spawnCostMul: -0.20 },
    { id: 'seedsow', name: 'Посев роя', rar: 1, short: 'Старт: 3 соты 2 ур.', startComb: 2 },
    { id: 'thorns', name: 'Колючки', rar: 2, short: 'Враг взрывается при смерти', zapDeath: 16 },
    { id: 'vampiric', name: 'Вампирский неон', rar: 2, short: 'Улей чинится 6% урона', lifesteal: 0.06 },
    { id: 'echoamp', name: 'Усилитель эха', rar: 2, short: 'Эхо сильнее на 60%', echoPower: 0.6 },
    { id: 'slowfield', name: 'Смоляное поле', rar: 2, short: 'Враги медленнее на 12%', slowAdd: 0.12 },
    { id: 'surgebonus', name: 'Глоток перед бурей', rar: 2, short: 'Финал: очки ×2', surgeScore: 1 }
  ];

  /* ── 48-часовые live-ивенты: общий модификатор на всех (DoF: ивенты > стриков) */
  D.EVENTS = [
    { id: 'melt', name: 'ЯРОСТЬ РОЯ', desc: 'Переплавка приносит ×2', recycleMul: 1 },
    { id: 'brood', name: 'ИНКУБАТОР', desc: 'Спавн сот на 25% дешевле', spawnCostMul: -0.25 },
    { id: 'venom', name: 'ТИХИЙ ЯД', desc: 'Яд и ожог бьют ×2', dotMul: 2 },
    { id: 'echonight', name: 'НОЧЬ ЭХА', desc: 'Эхо сильнее, заряд +1', echoPower: 0.6, echoCharge: 1 },
    { id: 'honeyrain', name: 'МЁДОВЫЙ ДОЖДЬ', desc: 'Соты за забег +40%', coinMul: 0.4 },
    { id: 'neostorm', name: 'НЕОН-ШТОРМ', desc: 'Скорострельность +20%, враги живучее на 10%', rateMul: 0.2, enemyHp: 0.1 }
  ];

  /* ── Лиги: таблицы по 8 человек, ротация 3 дня, награда — косметика ──── */
  D.LEAGUE = {
    rotateDays: 3,
    tiers: [
      { id: 0, name: 'Личинка', need: 0, color: '#8fd8ff', prize: { coin: 600 } },
      { id: 1, name: 'Трутень', need: 1400, color: '#9fb4c8', prize: { coin: 1200 } },
      { id: 2, name: 'Рабочая пчела', need: 3200, color: '#7dffb0', prize: { coin: 2200, orb: 1 } },
      { id: 3, name: 'Фуражир', need: 6000, color: '#5ff0e0', prize: { coin: 3600, orb: 2 } },
      { id: 4, name: 'Страж', need: 10000, color: '#d48bff', prize: { coin: 5600, orb: 3 } },
      { id: 5, name: 'Жало', need: 16000, color: '#ff8bd0', prize: { coin: 8200, orb: 4 } },
      { id: 6, name: 'Матка', need: 24000, color: '#ffd166', prize: { coin: 12000, orb: 6 } },
      { id: 7, name: 'Неоновый рой', need: 36000, color: '#fff3b0', prize: { coin: 18000, orb: 9, pollen: 2 } }
    ]
  };

  /* ── Серия забегов: страхи потери лечим реформом (DoF Win Streak) ───── */
  D.STREAK = {
    shieldPerMonth: 1,               // «щит серии» выдаётся раз в месяц
    reformStars: 20,                 // или 1 просмотр, окно 24 ч
    reformWindowH: 24,
    rewards: [
      { coin: 500 }, { coin: 900 }, { orb: 1 }, { coin: 1600 }, { orb: 2 }, { coin: 2400, b: 'energy' }, { orb: 4, pollen: 1 }
    ]
  };

  /* ── Онбординг: подсказки ≤8 слов, отношение обучение:практика 1:2,5 ── */
  D.TUTORIAL = [
    { id: 'tap', text: 'Тап по реактору — сота', at: 'reactor' },
    { id: 'merge', text: 'Две одинаковых — слияние', at: 'grid' },
    { id: 'place', text: 'Тяни соту на дорожку', at: 'lane' },
    { id: 'melt', text: 'Забилась сетка? Переплавь', at: 'recycle' },
    { id: 'fiss', text: 'Расщепи — получишь мутацию', at: 'fission' },
    { id: 'echo', text: 'Эхо — это реальный игрок', at: 'echo' }
  ];

  /* ── Магазин: цифровые товары продаются только за Telegram Stars (XTR) ──
     Витрина «гаснет», если платформа не дала Stars (см. docs/RESEARCH.md §3.2). */
  D.SHOP = {
    currency: 'XTR', starNote: 'Оплата Telegram Stars',
    regionLockedText: 'Ваш регион пока не может покупать Stars. Игра полностью играбельна без витрины.',
    orbs: [
      { n: 5, price: '50 Stars', usd: 0.99 }, { n: 14, price: '150 Stars', usd: 2.99, best: 1 },
      { n: 40, price: '400 Stars', usd: 7.99 }, { n: 120, price: '900 Stars', usd: 17.99 }
    ],
    coins: [
      { n: 25000, price: '75 Stars', usd: 1.49 }, { n: 80000, price: '250 Stars', usd: 4.99, best: 1 },
      { n: 220000, price: '600 Stars', usd: 11.99 }
    ],
    pass: { name: 'Неоновый пропуск сезона', price: '400 Stars', usd: 7.99, days: 21, desc: 'Премиум-трек сезона 21 день + 1 энергия/час.' },
    starter: { name: 'Старт-набор роя', price: '90 Stars', usd: 1.99, desc: '5000 сот · 3 орба · бустер «Инкубатор» · 3 дня ×2 энергии.' },
    nectar: { name: 'Бак нектара', price: '40 Stars', usd: 0.99, desc: '+4 нектара сразу, максимум не меняется.' },
    streak: { name: 'Починить серию', price: '20 Stars', usd: 0.49, desc: 'Восстановить серию забегов (окно 24 часа).' },
    summonCost: 18, summonCostGrow: 4, summonMaxDiscount: 90
  };


  /* ── Имена для лидерборда/эхо-лент (процедурная генерация) ─────────── */
  D.NAME_A = ['Нео', 'УЛЬТРА', 'ВАПИД', 'ЗЕРО', 'ЛЮМЕН', 'ГАРД', 'МИКС', 'ФАЗО', 'ТЕРРА', 'АВРО', 'КВАНТ', 'СИГМА', 'ГИПЕР', 'ЭХО', 'ДРИФТ', 'АРТОН'];
  D.NAME_B = ['МОт', 'КОМП', 'БИТ', 'РАЙД', 'ЛУКС', 'СВОРМ', 'НЕКС', 'ФЛОУ', 'ПУЛЬС', 'ВИКС', 'ОРБИТ', 'КРЕСТ', 'ШТОРМ', 'АЙС', 'ДЖЕТ', 'ТАЙМ'];

  /* ── Формулы ────────────────────────────────────────────────────────── */
  D.unitStats = (lin, level, stars, mods) => {
    const mul = Math.pow(1.52, level - 1);
    const s = {
      dmg: lin.base.dmg * mul * (1 + 0.08 * stars),
      rate: lin.base.rate * (1 + 0.03 * (level - 1)) * (1 + 0.02 * stars),
      ps: lin.base.ps,
      splash: lin.base.splash || 0,
      pierce: lin.base.pierce || 0,
      slow: lin.base.slow || 0, slowT: lin.base.slowT || 0,
      chain: lin.base.chain || 0,
      dot: lin.base.dot ? lin.base.dot * mul : 0, dotT: lin.base.dotT || 0,
      crit: lin.base.crit || 0, critX: lin.base.critX || 2,
      energy: lin.base.energy ? lin.base.energy * level : 0
    };
    if (mods) {
      s.dmg *= mods.dmgMul || 1;
      s.energy += (mods.echoEnergy || 0);
    }
    return s;
  };

  D.waveScale = w => ({
    hp: 1 + 0.24 * w + 0.019 * w * w,
    spd: 1 + Math.min(0.55, 0.014 * w),
    count: Math.round(3 + w * 1.15 + Math.max(0, w - 12) * 0.55)
  });

  /* Состав волны: список {id, lane, t} */
  D.composeWave = (w, rnd) => {
    const sc = D.waveScale(w), out = [];
    const isBoss = w % 5 === 0;
    const pool = Object.keys(D.ENEMIES).filter(k => k !== 'boss');
    // доступность врагов по номеру волны
    const unlocked = pool.filter(k => ({ mite: 1, skarab: 2, moth: 4, goliath: 6, splitter: 8, armos: 10, phantom: 13 }[k] <= w));
    let tot = 0; unlocked.forEach(k => tot += D.ENEMIES[k].w);
    const n = sc.count;
    for (let i = 0; i < n; i++) {
      let r = rnd() * tot, id = unlocked[0];
      for (const k of unlocked) { r -= D.ENEMIES[k].w; if (r <= 0) { id = k; break; } }
      out.push({ id, lane: (rnd() * D.CONFIG.LANES) | 0, t: i * (0.72 - Math.min(0.38, w * 0.012)) + rnd() * 0.3 });
    }
    if (isBoss) out.push({ id: 'boss', lane: (rnd() * D.CONFIG.LANES) | 0, t: 1.6 });
    return { list: out, hp: sc.hp, spd: sc.spd, boss: isBoss };
  };

  D.coinReward = (run) => Math.floor((run.kills * 2.4 + run.wave * 34 + Math.sqrt(run.score) * 1.6) * (run.coinMul || 1));
  D.xpReward = run => Math.floor(run.wave * 11 + run.kills * 0.35);
  D.levelNeed = lvl => Math.floor(240 * Math.pow(lvl, 1.42));
  D.hiveCost = (def, lvl) => Math.floor(def.cost * Math.pow(1.42, lvl));
  D.hiveOutput = (def, lvl) => lvl <= 0 ? 0 : def.base * Math.pow(def.grow, lvl - 1) * lvl / 1.4;
  D.starCost = (rar, star) => Math.floor((900 + 700 * star * star) * (1 + rar * 0.85));
})(window.NH);
