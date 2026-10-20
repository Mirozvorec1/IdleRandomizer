/* ============================================================
   menu.js — страница меню
   Слоты сохранений, модалка сброса, переход в настройки.
   ============================================================ */

(function (IR) {
  'use strict';

  const SLOT_COUNT = 3;
  const SLOTS_UI_KEY = 'idleRandomizerUI_slots';

  const DEFAULT = {
    points: 0,
    best: 0,
    cooldownLevel: 0,
    rangeLevel: 0,
    sliderMin: 1,
    combo: 1
  };

  function slotKey(n) {
    return 'idleRandomizerSave_' + n;
  }

  /* Старый одиночный сейв переносим в слот 1 */
  function migrate() {
    try {
      const old = localStorage.getItem('idleRandomizerSave');
      if (!old) return;
      if (!localStorage.getItem(slotKey(1))) localStorage.setItem(slotKey(1), old);
      localStorage.removeItem('idleRandomizerSave');
    } catch (e) {}
  }

  function loadSlot(n) {
    try {
      const raw = localStorage.getItem(slotKey(n));
      if (!raw) return null;
      return Object.assign({}, DEFAULT, JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }

  migrate();

  const slotsEl = document.getElementById('slots');
  const playBtn = document.getElementById('playBtn');

  /* ---------------- Список слотов ---------------- */

  function renderSlots() {
    slotsEl.innerHTML = '';
    for (let i = 1; i <= SLOT_COUNT; i++) {
      const s = loadSlot(i);
      const row = document.createElement('div');
      row.className = 'slot-row';
      row.innerHTML =
        '<div class="slot">' +
          '<a class="slot-link" href="game.html?slot=' + i + '">' +
            '<span class="slot-name">Слот ' + i + '</span>' +
            '<div class="slot-info">' +
              (s
                ? '<div class="slot-stat"><span class="label">Очки</span><span class="value">' + IR.fmtNum(s.points) + '</span></div>' +
                  '<div class="slot-stat"><span class="label">Рекорд</span><span class="value">' + IR.fmtNum(s.best) + '</span></div>'
                : '<span class="slot-empty">Пусто</span>') +
            '</div>' +
          '</a>' +
        '</div>' +
        '<button class="slot-reset" type="button" data-slot="' + i + '" title="Сбросить слот">✕</button>';
      slotsEl.appendChild(row);
    }
  }

  /* ---------------- Раскрытие списка слотов ---------------- */

  playBtn.addEventListener('click', () => {
    const open = !slotsEl.classList.contains('open');
    slotsEl.classList.toggle('open', open);
    renderSlots();
    try { localStorage.setItem(SLOTS_UI_KEY, open ? '1' : '0'); } catch (e) {}
  });

  try {
    if (localStorage.getItem(SLOTS_UI_KEY) === '1') {
      renderSlots();
      slotsEl.classList.add('open');
    }
  } catch (e) {}

  /* ---------------- Сброс слота ---------------- */

  slotsEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('.slot-reset');
    if (!btn) return;
    const n = parseInt(btn.dataset.slot, 10);
    const ok = await IR.askConfirm('Сбросить слот ' + n + '?');
    if (!ok) return;
    localStorage.removeItem(slotKey(n));
    renderSlots();
    IR.toast('Слот ' + n + ' сброшен');
  });

  /* ---------------- Переход в настройки ---------------- */

  const gearBtn = document.getElementById('gearBtn');
  let leaving = false;

  gearBtn.addEventListener('click', () => {
    if (leaving) return;
    leaving = true;
    try { sessionStorage.setItem('idleRandomizerSetFrom', 'index.html'); } catch (e) {}
    IR.navigateWithIcon(gearBtn, 'settings.html', 'gear');
  });

  /* ---------------- Инициализация ---------------- */

  IR.initConfirm();
  IR.guardInput();
  IR.revealOnLoad();
})(window.IR);
