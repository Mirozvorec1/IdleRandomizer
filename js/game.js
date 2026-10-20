/* ============================================================
   game.js — страница игры
   Бросок числа, комбо и его рекорд, кулдаун, ползунок
   диапазона, магазин улучшений.
   ============================================================ */

(function (IR) {
  'use strict';

  /* ---------------- Слот и ключи хранилища ---------------- */

  const SLOT = (() => {
    const n = parseInt(new URLSearchParams(location.search).get('slot'), 10);
    return n >= 1 && n <= 3 ? n : 1;
  })();

  const SAVE_KEY = 'idleRandomizerSave_' + SLOT;
  const CD_KEY = SAVE_KEY + '_cd';
  const SHOP_UI_KEY = 'idleRandomizerUI_shop';

  try {
    const old = localStorage.getItem('idleRandomizerSave');
    if (old) {
      if (!localStorage.getItem('idleRandomizerSave_1')) localStorage.setItem('idleRandomizerSave_1', old);
      localStorage.removeItem('idleRandomizerSave');
    }
  } catch (e) {}

  /* ---------------- Правила и баланс ---------------- */

  const SPECIALS = [100, 42, 69, 67, 72, 89, 111, 141, 123, 200];
  const SPECIAL_POINTS = 10;
  const NORMAL_POINTS = 1;

  const DOUBLE_MULT = 2;
  const REPEAT_MULT = 10;
  const DECADE_MULT = 1.5;
  const SPECIAL_MULT = 2;

  const HUNDRED_MIN = 101;
  const HUNDRED_MAX = 200;
  const HUNDRED_MULT = 2;

  const BASE_COOLDOWN = 3000;
  const COOLDOWN_STEP = 250;
  const MIN_COOLDOWN = 250;
  const CD_PENALTY = 500;
  const MAX_CD_MS = 10000;
  const MAX_CD_LEVEL = Math.round((BASE_COOLDOWN - MIN_COOLDOWN) / COOLDOWN_STEP);
  const MAX_RANGE_LEVEL = 100;

  /* Кривые цен улучшений — разные, потому что бонусы разные.
     Кулдаун: 11 уровней, но каждый срезает 0.25 с с броска — эффект
     накапливается и реально ускоряет игру. Поэтому дорогой.
     Диапазон: 100 уровней, каждый добавляет лишь +1 к максимуму броска
     и к ползунку. Поэтому дешёвый за уровень — это длинная раскачка. */
  const CD_BASE_COST = 15;
  const CD_COST_RATIO = 1.75;
  const RANGE_BASE_COST = 8;
  const RANGE_COST_RATIO = 1.3;
  const RANGE_STEPPED_LEVEL = 11;  /* до этого уровня цена растёт быстро */
  const RANGE_SLOW_RATIO = 1.05;   /* дальше — плавный рост, 100-й уровень ≈ 8.5 тыс. */

  const DEFAULT = {
    points: 0,
    best: 0,
    cooldownLevel: 0,
    rangeLevel: 0,
    sliderMin: 1,
    combo: 1,
    lastNumber: null,
    lastResult: '',
    lastSpecial: false,
    history: [],
    bestCombo: 0,
    bestComboPoints: 0,
    bestComboNumbers: [],
    comboChain: []
  };

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return Object.assign({}, DEFAULT);
      return Object.assign({}, DEFAULT, JSON.parse(raw));
    } catch (e) {
      return Object.assign({}, DEFAULT);
    }
  }

  let state = load();
  const settings = IR.settings;

  /* ---------------- Элементы страницы ---------------- */

  const $ = (id) => document.getElementById(id);
  const pointsEl = $('points');
  const numberEl = $('number');
  const resultLabelEl = $('resultLabel');
  const comboBadgeEl = $('comboBadge');
  const comboRecordEl = $('comboRecord');
  const comboRecordValue = $('comboRecordValue');
  const historyEl = $('history');
  const generateBtn = $('generateBtn');
  const cdFill = $('cdFill');
  const cdText = $('cdText');
  const rangeRow = $('rangeRow');
  const rangeSlider = $('rangeSlider');
  const sliderThumb = $('sliderThumb');
  const sliderTicks = $('sliderTicks');
  const rangeValue = $('rangeValue');
  const cdLevelEl = $('cdLevel');
  const rangeLevelEl = $('rangeLevel');
  const cdValEl = $('cdVal');
  const rangeValEl = $('rangeVal');
  const buyCd = $('buyCd');
  const buyRange = $('buyRange');
  const shopTab = $('shopTab');
  const shopDrawer = $('shopDrawer');
  const recordEl = $('record');
  const pointsWrap = $('pointsWrap');
  const comboTip = $('comboTip');
  const backBtn = $('backBtn');
  const gearBtn = $('gearBtn');

  /* ---------------- Состояние сессии ---------------- */

  let cooldownUntil = 0;
  let cooldownMs = getCooldownMs();
  let cdTotal = cooldownMs;
  let lastNumber = state.lastNumber !== undefined ? state.lastNumber : null;
  let lastRollSpecial = state.lastSpecial === true;
  let combo = state.combo > 1 ? state.combo : 1;
  let history = Array.isArray(state.history) ? state.history.slice(-30) : [];
  let comboChain = Array.isArray(state.comboChain) ? state.comboChain.slice() : [];
  let sliderRange = { min: 0, max: 0 };
  let shownPoints = state.points;
  let pointsRaf = 0;

  restoreCd();

  /* ---------------- Сохранение ---------------- */

  function save() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }

  function saveCd() {
    try { localStorage.setItem(CD_KEY, JSON.stringify({ until: cooldownUntil, total: cdTotal })); } catch (e) {}
  }

  function restoreCd() {
    try {
      const raw = localStorage.getItem(CD_KEY);
      if (!raw) return;
      const cd = JSON.parse(raw);
      if (!cd || typeof cd.until !== 'number') return;
      const remaining = cd.until - Date.now();
      if (remaining <= 0) return;
      cooldownUntil = cd.until;
      cdTotal = Math.max(typeof cd.total === 'number' ? cd.total : 0, remaining);
      generateBtn.classList.add('cooling');
      requestAnimationFrame(tick);
    } catch (e) {}
  }

  /* ---------------- Уровни улучшений ---------------- */

  function getCooldownMs() {
    return Math.max(MIN_COOLDOWN, BASE_COOLDOWN - state.cooldownLevel * COOLDOWN_STEP);
  }

  function cdCost() {
    return Math.round(CD_BASE_COST * Math.pow(CD_COST_RATIO, state.cooldownLevel));
  }

  function rangeCost() {
    const L = state.rangeLevel;
    const head = Math.min(L, RANGE_STEPPED_LEVEL);
    const tail = Math.max(0, L - RANGE_STEPPED_LEVEL);
    return Math.round(
      RANGE_BASE_COST *
      Math.pow(RANGE_COST_RATIO, head) *
      Math.pow(RANGE_SLOW_RATIO, tail)
    );
  }

  function getMinValue() {
    if (state.rangeLevel <= 0) return 1;
    const cap = Math.min(100, 1 + state.rangeLevel);
    return Math.min(Math.max(state.sliderMin, 1), cap);
  }

  function getRollMax() {
    return 100 + state.rangeLevel;
  }

  /* ---------------- Ползунок диапазона ---------------- */

  function setSliderRange(min, max) {
    if (sliderRange.min === min && sliderRange.max === max) return;
    sliderRange = { min, max };
    buildTicks();
  }

  function setThumb(v) {
    const span = sliderRange.max - sliderRange.min;
    const pct = span > 0 ? ((v - sliderRange.min) / span) * 100 : 0;
    sliderThumb.style.left = pct + '%';
  }

  function buildTicks() {
    const min = sliderRange.min;
    const max = sliderRange.max;
    const span = max - min;
    const major = span > 40 ? 10 : span > 12 ? 5 : 1;
    const minor = major >= 10 ? 2 : 1;

    const values = [];
    for (let v = min; v <= max; v += minor) values.push(v);
    if (values[values.length - 1] !== max) values.push(max);

    let lastLabel = null;
    sliderTicks.innerHTML = values.map((v) => {
      const pos = span > 0 ? ((v - min) / span) * 100 : 0;
      const gridMajor = (v - min) % major === 0;
      const isMajor = gridMajor || v === max;
      let label = '';
      if (gridMajor || (v === max && (lastLabel === null || v - lastLabel >= major * 0.6))) {
        label = '<span class="lbl">' + v + '</span>';
        lastLabel = v;
      }
      return '<span class="tick' + (isMajor ? ' major' : '') +
        '" style="left:' + pos + '%">' + label + '</span>';
    }).join('');
  }

  function sliderFraction(clientX) {
    const rect = rangeSlider.getBoundingClientRect();
    if (!rect.width) return 0;
    return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  }

  function sliderValueAt(clientX) {
    const span = sliderRange.max - sliderRange.min;
    return sliderRange.min + Math.round(sliderFraction(clientX) * span);
  }

  function applySliderValue(v) {
    const c = Math.min(Math.max(v, sliderRange.min), sliderRange.max);
    if (c === state.sliderMin) return;
    state.sliderMin = c;
    rangeValue.textContent = c + ' – ' + getRollMax();
    save();
  }

  /* ---------------- Отрисовка ---------------- */

  function animatePoints(to) {
    cancelAnimationFrame(pointsRaf);
    const from = shownPoints;
    if (from === to) {
      pointsEl.textContent = IR.fmtNum(to);
      return;
    }
    const start = performance.now();
    const dur = 450;
    function step(t) {
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      shownPoints = p < 1 ? Math.round(from + (to - from) * e) : to;
      pointsEl.textContent = IR.fmtNum(shownPoints);
      if (p < 1) pointsRaf = requestAnimationFrame(step);
    }
    pointsRaf = requestAnimationFrame(step);
  }

  function spawnGain(amount) {
    const el = document.createElement('span');
    el.className = 'gain-pop';
    el.textContent = '+' + IR.fmtNum(amount);
    pointsWrap.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  function render() {
    animatePoints(state.points);
    recordEl.textContent = IR.fmtNum(state.best);

    cooldownMs = getCooldownMs();
    cdValEl.textContent = (cooldownMs / 1000).toFixed(2) + ' с';

    cdLevelEl.textContent = 'Ур. ' + state.cooldownLevel + '/' + MAX_CD_LEVEL;
    rangeLevelEl.textContent = 'Ур. ' + state.rangeLevel + '/' + MAX_RANGE_LEVEL;
    rangeValEl.textContent = 'Макс. броска: ' + getRollMax() + ' · ползунок до ' + Math.min(100, 1 + state.rangeLevel);

    renderBuy(buyCd, state.cooldownLevel >= MAX_CD_LEVEL, cdCost());
    renderBuy(buyRange, state.rangeLevel >= MAX_RANGE_LEVEL, rangeCost());

    const canCd = state.cooldownLevel < MAX_CD_LEVEL && state.points >= cdCost();
    const canRange = state.rangeLevel < MAX_RANGE_LEVEL && state.points >= rangeCost();
    shopTab.classList.toggle('affordable', settings.shopGlow && (canCd || canRange));

    if (state.rangeLevel > 0) {
      rangeRow.classList.add('visible');
      const sliderMax = Math.min(100, 1 + state.rangeLevel);
      setSliderRange(1, sliderMax);
      if (state.sliderMin > sliderMax) state.sliderMin = sliderMax;
      if (state.sliderMin < 1) state.sliderMin = 1;
      setThumb(state.sliderMin);
      rangeValue.textContent = state.sliderMin + ' – ' + getRollMax();
    } else {
      rangeRow.classList.remove('visible');
      rangeValue.textContent = '1 – ' + getRollMax();
    }

    save();
  }

  function renderBuy(btn, maxed, cost) {
    if (maxed) {
      btn.textContent = 'Макс.';
      btn.disabled = true;
      btn.classList.remove('affordable');
      return;
    }
    const can = state.points >= cost;
    btn.textContent = 'Купить · ' + IR.fmtNum(cost);
    btn.disabled = !can;
    btn.classList.toggle('affordable', can);
  }

  function renderHistory() {
    historyEl.style.display = settings.showHistory ? '' : 'none';
    if (!settings.showHistory) return;
    historyEl.innerHTML = '';
    history.slice(-12).forEach((n) => {
      const chip = document.createElement('span');
      chip.className = 'chip' + (SPECIALS.includes(n) ? ' special' : '');
      chip.textContent = n;
      historyEl.appendChild(chip);
    });
  }

  /* ---------------- Комбо и его рекорд ---------------- */

  function renderCombo() {
    comboBadgeEl.textContent = 'Комбо ×' + IR.fmtMult(combo);
    comboBadgeEl.classList.toggle('active', combo > 1);
    comboBadgeEl.classList.toggle('special', lastRollSpecial);
  }

  function renderComboRecord(fresh) {
    const has = state.bestCombo > 1;
    comboRecordEl.classList.toggle('set', has);
    comboRecordValue.textContent = has
      ? '×' + IR.fmtMult(state.bestCombo) + ' · +' + IR.fmtNum(state.bestComboPoints) + ' очков'
      : '—';
    if (has && fresh) {
      comboRecordEl.classList.remove('fresh');
      void comboRecordEl.offsetWidth;
      comboRecordEl.classList.add('fresh');
    }
  }

  function pluralRolls(n) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'бросок';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'броска';
    return 'бросков';
  }

  function hideComboTip() {
    comboTip.classList.remove('show');
  }

  function showComboTip() {
    const nums = Array.isArray(state.bestComboNumbers) ? state.bestComboNumbers : [];
    if (!nums.length) return;
    const chips = nums
      .map((n) => '<span class="tip-num">' + n + '</span>')
      .join('<span class="tip-arrow">→</span>');
    comboTip.innerHTML =
      '<div class="tip-title">Числа рекорда · ' + nums.length + ' ' + pluralRolls(nums.length) + '</div>' +
      '<div class="tip-chain">' + chips + '</div>';
    comboTip.classList.add('show');

    const r = comboRecordEl.getBoundingClientRect();
    const tw = comboTip.offsetWidth;
    const th = comboTip.offsetHeight;
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    let top = r.bottom + 8;
    if (top + th > window.innerHeight - 8) top = Math.max(8, r.top - th - 8);
    comboTip.style.left = left + 'px';
    comboTip.style.top = top + 'px';
  }

  comboRecordEl.addEventListener('mouseenter', showComboTip);
  comboRecordEl.addEventListener('mouseleave', hideComboTip);
  comboRecordEl.addEventListener('click', (e) => {
    e.stopPropagation();
    if (comboTip.classList.contains('show')) hideComboTip();
    else showComboTip();
  });
  window.addEventListener('scroll', hideComboTip, true);
  window.addEventListener('resize', hideComboTip);

  /* ---------------- Бросок ---------------- */

  function generate() {
    const now = Date.now();

    if (now < cooldownUntil) {
      cooldownUntil = Math.min(cooldownUntil + CD_PENALTY, now + MAX_CD_MS);
      cdTotal = cooldownUntil - now;
      saveCd();
      shakeBtn();
      return;
    }

    const min = getMinValue();
    const rollMax = getRollMax();
    const value = Math.floor(Math.random() * (rollMax - min + 1)) + min;
    const isSpecial = SPECIALS.includes(value);
    const isHundred = value >= HUNDRED_MIN && value <= HUNDRED_MAX;
    const base = isSpecial ? SPECIAL_POINTS : NORMAL_POINTS;

    const isDouble = value >= 11 && value <= 99 && value % 11 === 0;
    const isRepeat = lastNumber !== null && value === lastNumber;
    const isDecade = lastNumber !== null && !isRepeat &&
      Math.floor(lastNumber / 10) === Math.floor(value / 10);

    const parts = [];
    let rollMult = 1;

    if (isSpecial) {
      rollMult *= SPECIAL_MULT;
      parts.push('особое ×' + IR.fmtMult(SPECIAL_MULT));
    }
    if (isDouble) {
      rollMult *= DOUBLE_MULT;
      parts.push('×' + DOUBLE_MULT);
    }
    if (isRepeat) {
      rollMult *= REPEAT_MULT;
      parts.push('×' + REPEAT_MULT);
    } else if (isDecade) {
      rollMult *= DECADE_MULT;
      parts.push('×' + IR.fmtMult(DECADE_MULT));
    }

    if (rollMult > 1) combo *= rollMult;
    else combo = 1;
    state.combo = combo;

    // Цепочка бросков комбо. Для «парных» бонусов (повтор / десяток)
    // добавляем и предыдущий бросок — именно он образует пару.
    if (rollMult > 1) {
      if ((isRepeat || isDecade) && comboChain[comboChain.length - 1] !== lastNumber) {
        comboChain.push(lastNumber);
      }
      comboChain.push(value);
    } else {
      comboChain = [];
    }
    state.comboChain = comboChain;

    const hundredMult = isHundred ? HUNDRED_MULT : 1;
    const gained = Math.round(base * hundredMult * combo);

    let newComboRecord = false;
    if (combo > 1 && combo > state.bestCombo) {
      state.bestCombo = combo;
      state.bestComboPoints = gained;
      state.bestComboNumbers = comboChain.slice();
      newComboRecord = true;
    }

    lastNumber = value;
    lastRollSpecial = isSpecial;
    state.lastNumber = value;
    state.lastSpecial = isSpecial;
    state.points += gained;
    if (state.points > state.best) state.best = state.points;

    numberEl.textContent = value;
    numberEl.classList.remove('pop', 'special');
    void numberEl.offsetWidth;
    numberEl.classList.add('pop');
    if (isSpecial) numberEl.classList.add('special');

    const inherited = combo > rollMult;
    resultLabelEl.innerHTML =
      '<span class="gain">+' + gained + '</span>' +
      (isHundred ? ' <span class="bonus">· сотня ×' + IR.fmtMult(HUNDRED_MULT) + '</span>' : '') +
      (parts.length ? ' <span class="bonus">· ' + parts.join(' ') + '</span>' : '') +
      (inherited ? ' <span class="bonus">· комбо ×' + IR.fmtMult(combo) + '</span>' : '');
    state.lastResult = resultLabelEl.innerHTML;

    renderCombo();
    renderComboRecord(newComboRecord);
    spawnGain(gained);

    history.push(value);
    if (history.length > 30) history.shift();
    state.history = history;
    renderHistory();

    startCooldown();
    render();
  }

  /* ---------------- Кулдаун ---------------- */

  function shakeBtn() {
    generateBtn.classList.remove('shake');
    void generateBtn.offsetWidth;
    generateBtn.classList.add('shake');
  }

  function startCooldown() {
    cooldownUntil = Date.now() + cooldownMs;
    cdTotal = cooldownMs;
    saveCd();
    generateBtn.classList.add('cooling');
    requestAnimationFrame(tick);
  }

  function tick() {
    const remaining = cooldownUntil - Date.now();

    if (remaining <= 0) {
      generateBtn.classList.remove('cooling');
      cdFill.style.transform = 'scaleX(0)';
      cdText.textContent = '🎲 Генерировать';
      return;
    }

    cdFill.style.transform = 'scaleX(' + Math.min(1, remaining / cdTotal).toFixed(4) + ')';
    cdText.textContent = '⏳ ' + (remaining / 1000).toFixed(1) + ' с';
    requestAnimationFrame(tick);
  }

  /* ---------------- Магазин ---------------- */

  function setShopOpen(open) {
    shopDrawer.classList.toggle('open', open);
    shopTab.classList.toggle('open', open);
    document.body.classList.toggle('shop-open', open);
    shopTab.setAttribute('aria-expanded', String(open));
    try { localStorage.setItem(SHOP_UI_KEY, open ? '1' : '0'); } catch (e) {}
  }

  try {
    if (localStorage.getItem(SHOP_UI_KEY) === '1') setShopOpen(true);
  } catch (e) {}

  shopTab.addEventListener('click', () => {
    setShopOpen(!shopDrawer.classList.contains('open'));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setShopOpen(false);
  });

  buyCd.addEventListener('click', () => {
    const cost = cdCost();
    if (cooldownMs <= MIN_COOLDOWN || state.points < cost) return;
    state.points -= cost;
    state.cooldownLevel += 1;
    cooldownMs = getCooldownMs();
    render();
  });

  buyRange.addEventListener('click', () => {
    if (state.rangeLevel >= MAX_RANGE_LEVEL) return;
    const cost = rangeCost();
    if (state.points < cost) return;
    state.points -= cost;
    state.rangeLevel += 1;
    render();
  });

  /* ---------------- Обработчики ---------------- */

  generateBtn.addEventListener('click', generate);

  rangeSlider.addEventListener('pointerdown', (e) => {
    if (state.rangeLevel <= 0) return;
    rangeSlider.focus();
    rangeSlider.setPointerCapture(e.pointerId);
    rangeSlider.classList.add('dragging');
    sliderThumb.style.left = (sliderFraction(e.clientX) * 100) + '%';
    applySliderValue(sliderValueAt(e.clientX));
  });

  rangeSlider.addEventListener('pointermove', (e) => {
    if (!rangeSlider.classList.contains('dragging')) return;
    sliderThumb.style.left = (sliderFraction(e.clientX) * 100) + '%';
    applySliderValue(sliderValueAt(e.clientX));
  });

  function endSliderDrag() {
    if (!rangeSlider.classList.contains('dragging')) return;
    rangeSlider.classList.remove('dragging');
    setThumb(state.sliderMin);
  }

  rangeSlider.addEventListener('pointerup', endSliderDrag);
  rangeSlider.addEventListener('pointercancel', endSliderDrag);

  rangeSlider.addEventListener('keydown', (e) => {
    if (state.rangeLevel <= 0) return;
    let v = state.sliderMin;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v -= 1;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v += 1;
    else if (e.key === 'Home') v = sliderRange.min;
    else if (e.key === 'End') v = sliderRange.max;
    else return;
    e.preventDefault();
    applySliderValue(v);
    setThumb(state.sliderMin);
  });

  /* ---------------- Переходы между страницами ---------------- */

  let leaving = false;

  backBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (leaving) return;
    leaving = true;
    IR.navigateWithIcon(backBtn, backBtn.href, 'house');
  });

  gearBtn.addEventListener('click', () => {
    if (leaving) return;
    leaving = true;
    try { sessionStorage.setItem('idleRandomizerSetFrom', 'game.html?slot=' + SLOT); } catch (err) {}
    IR.navigateWithIcon(gearBtn, 'settings.html', 'gear');
  });

  /* ---------------- Ввод ---------------- */

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') {
      e.preventDefault();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
      generate();
    }
  });

  IR.guardInput();

  /* ---------------- Инициализация ---------------- */

  render();
  renderCombo();
  renderComboRecord(false);
  renderHistory();

  if (lastNumber !== null && lastNumber !== undefined) {
    numberEl.textContent = lastNumber;
    if (SPECIALS.includes(lastNumber)) numberEl.classList.add('special');
    if (state.lastResult) resultLabelEl.innerHTML = state.lastResult;
  }

  IR.revealOnLoad();
})(window.IR);
