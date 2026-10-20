/* ============================================================
   settings.js — страница настроек
   Переключатели: свечение магазина, история чисел,
   анимация переходов.
   ============================================================ */

(function (IR) {
  'use strict';

  const swShopGlow = document.getElementById('swShopGlow');
  const swHistory = document.getElementById('swHistory');
  const swTransitions = document.getElementById('swTransitions');

  function paint() {
    swShopGlow.classList.toggle('on', IR.settings.shopGlow);
    swHistory.classList.toggle('on', IR.settings.showHistory);
    swTransitions.classList.toggle('on', IR.settings.transitions);
  }

  function toggle(key, sw) {
    sw.addEventListener('click', () => {
      IR.settings[key] = !IR.settings[key];
      IR.saveSettings(IR.settings);
      paint();
    });
  }

  toggle('shopGlow', swShopGlow);
  toggle('showHistory', swHistory);
  toggle('transitions', swTransitions);

  paint();

  /* ---------------- Кнопка «назад» ---------------- */

  const backBtn = document.getElementById('backBtn');
  let returnHref = 'index.html';
  try {
    const from = sessionStorage.getItem('idleRandomizerSetFrom');
    if (from) returnHref = from;
  } catch (e) {}
  backBtn.setAttribute('href', returnHref);

  let leaving = false;
  backBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (leaving) return;
    leaving = true;
    IR.navigateWithIcon(backBtn, returnHref, 'house');
  });

  /* ---------------- Инициализация ---------------- */

  IR.guardInput();
  IR.revealOnLoad();
})(window.IR);
