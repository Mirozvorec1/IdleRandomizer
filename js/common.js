/* ============================================================
   common.js — общее ядро для всех страниц
   Хранится в window.IR. Подключается ПЕРВЫМ на каждой странице.

   Содержит:
     - настройки (load/save + текущий объект IR.settings)
     - иконки перехода (домик / шестерёнка)
     - форматирование чисел (fmtNum / fmtMult)
     - переход между страницами (navigateWithIcon / revealOnLoad)
     - блокировка Tab и снятие фокуса (guardInput)
     - тост (toast) и модалка подтверждения (initConfirm / askConfirm)
   ============================================================ */

window.IR = window.IR || {};

(function (IR) {
  'use strict';

  /* ---------------- Настройки ---------------- */

  IR.SETTINGS_KEY = 'idleRandomizerSettings';
  IR.DEFAULT_SETTINGS = {
    shopGlow: true,
    showHistory: true,
    transitions: true
  };

  IR.loadSettings = function () {
    const def = IR.DEFAULT_SETTINGS;
    try {
      const raw = localStorage.getItem(IR.SETTINGS_KEY);
      if (!raw) return Object.assign({}, def);
      return Object.assign({}, def, JSON.parse(raw));
    } catch (e) {
      return Object.assign({}, def);
    }
  };

  IR.saveSettings = function (s) {
    try { localStorage.setItem(IR.SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
  };

  /** Текущие настройки — общий изменяемый объект для всей страницы */
  IR.settings = IR.loadSettings();

  /* ---------------- Иконки перехода ---------------- */

  IR.ICONS = {
    house:
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M3 11 12 3l9 8"/><path d="M5.5 9.5V21h13V9.5"/><path d="M10 21v-6h4v6"/></svg>',
    gear:
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="3"/>' +
      '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
  };

  /* ---------------- Форматирование ---------------- */

  const NUM_SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No'];

  /** 12345 -> "12 345";  1234567 -> "1,2M";  1.6e16 -> "16Qa" */
  IR.fmtNum = function (n) {
    n = Math.round(n);
    const abs = Math.abs(n);
    if (abs < 100000) return n.toLocaleString('ru-RU');

    let tier = Math.min(Math.floor(Math.log10(abs) / 3), NUM_SUFFIX.length - 1);
    let div = Math.pow(1000, tier);
    let v = Math.round((n / div) * 10) / 10;
    if (Math.abs(v) >= 1000 && tier < NUM_SUFFIX.length - 1) {
      tier += 1;
      div = Math.pow(1000, tier);
      v = Math.round((n / div) * 10) / 10;
    }
    return String(v).replace('.', ',') + NUM_SUFFIX[tier];
  };

  /** Множитель без лишних нулей: 1.5000 -> "1.5" */
  IR.fmtMult = function (x) {
    return String(Number(x.toFixed(4)));
  };

  /* ---------------- Переход между страницами ---------------- */

  /* Тайминги перехода (мс). Короткий и мягкий: ~250 мс вперёд + ~250 мс назад */
  const TRANS = {
    veilIn: 130,        /* затемнение экрана */
    iconMove: 240,      /* иконка летит от кнопки в центр */
    navigateAt: 250,    /* момент перехода на другую страницу */
    revealIcon: 250,    /* иконка сжимается на новой странице */
    revealVeil: 250,    /* завеса тает */
    iconScale: 2.4      /* во сколько раз вырастает иконка (было ~60x) */
  };

  const EASE = 'cubic-bezier(0.3, 0, 0.2, 1)';

  function makeOverlay(iconName) {
    const overlay = document.createElement('div');
    overlay.className = 'nav-overlay';
    overlay.innerHTML =
      '<div class="nav-house"><span class="nav-icon">' +
      (IR.ICONS[iconName] || IR.ICONS.house) +
      '</span></div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  /**
   * Мягкий переход: экран слегка темнеет, иконка кнопки (домик / шестерёнка)
   * плавно уходит в центр и уменьшается на новой странице.
   * Если переходы отключены — переход мгновенный.
   */
  IR.navigateWithIcon = function (btn, href, iconName) {
    if (!IR.settings.transitions) {
      window.location.href = href;
      return;
    }
    try {
      sessionStorage.setItem('idleRandomizerTrans', '1');
      sessionStorage.setItem('idleRandomizerTransIcon', iconName);
    } catch (e) {}

    const r = btn.getBoundingClientRect();
    const bx = r.left + r.width / 2;
    const by = r.top + r.height / 2;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    const overlay = makeOverlay(iconName);
    const icon = overlay.querySelector('.nav-house');

    /* Завеса мягко темнеет */
    overlay.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: TRANS.veilIn, easing: 'ease-out', fill: 'forwards' }
    );

    /* Иконка: от кнопки в центр экрана и слегка увеличивается */
    icon.animate(
      [
        { transform: 'translate(' + bx + 'px,' + by + 'px) scale(1)', opacity: 1 },
        { transform: 'translate(' + cx + 'px,' + cy + 'px) scale(' + TRANS.iconScale + ')', opacity: 0.9 }
      ],
      { duration: TRANS.iconMove, easing: EASE, fill: 'forwards' }
    );

    setTimeout(() => { window.location.href = href; }, TRANS.navigateAt);
  };

  /** Обратная анимация при загрузке страницы: завеса тает, иконка сжимается */
  IR.revealOnLoad = function () {
    try {
      if (sessionStorage.getItem('idleRandomizerTrans') !== '1') return;
      sessionStorage.removeItem('idleRandomizerTrans');
      const iconName = sessionStorage.getItem('idleRandomizerTransIcon') || 'house';
      sessionStorage.removeItem('idleRandomizerTransIcon');

      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;

      const overlay = makeOverlay(iconName);
      overlay.style.opacity = '1';
      const icon = overlay.querySelector('.nav-house');

      overlay.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: TRANS.revealVeil, easing: 'ease-in', fill: 'forwards' }
      );

      icon.animate(
        [
          { transform: 'translate(' + cx + 'px,' + cy + 'px) scale(' + TRANS.iconScale + ')', opacity: 0.9 },
          { transform: 'translate(' + cx + 'px,' + cy + 'px) scale(1)', opacity: 0 }
        ],
        { duration: TRANS.revealIcon, easing: EASE, fill: 'forwards' }
      ).onfinish = () => overlay.remove();
    } catch (e) {}
  };

  /* ---------------- Ввод ---------------- */

  /** Запрещает Tab и снимает фокус после клика */
  IR.guardInput = function () {
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
    });
    document.addEventListener('click', () => {
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
    });
  };

  /* ---------------- Тост ---------------- */

  let toastTimer = null;

  IR.toast = function (msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
  };

  /* ---------------- Модалка подтверждения ---------------- */

  let modalEl = null;
  let modalTextEl = null;
  let modalResolve = null;

  /** Вешает обработчики на элементы модалки (если их нет — ничего не делает) */
  IR.initConfirm = function () {
    modalEl = document.getElementById('modal');
    modalTextEl = document.getElementById('modalText');
    if (!modalEl || !modalTextEl) return;

    const ok = document.getElementById('modalOk');
    const cancel = document.getElementById('modalCancel');

    if (ok) ok.addEventListener('click', () => IR.closeConfirm(true));
    if (cancel) cancel.addEventListener('click', () => IR.closeConfirm(false));
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) IR.closeConfirm(false);
    });
  };

  IR.closeConfirm = function (result) {
    if (modalEl) modalEl.hidden = true;
    if (modalResolve) {
      modalResolve(result);
      modalResolve = null;
    }
  };

  /** Показывает модалку и возвращает Promise<boolean> */
  IR.askConfirm = function (text) {
    if (!modalEl || !modalTextEl) return Promise.resolve(false);
    modalTextEl.textContent = text;
    modalEl.hidden = false;
    return new Promise((resolve) => { modalResolve = resolve; });
  };
})(window.IR);
