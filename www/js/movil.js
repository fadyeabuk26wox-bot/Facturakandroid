// FacturaK — adaptación a teléfono: copia el título de cada columna a cada celda (data-label)
// para que mobile.css pueda mostrar las filas de las tablas como tarjetas sin cortar nada.
(function () {
  'use strict';
  function etiquetar(t) {
    if (!t || !t.tHead) return;
    const ths = [...t.tHead.querySelectorAll('th')].map((h) => h.textContent.trim());
    if (!ths.length) return;
    t.classList.add('fk-tabla');
    t.querySelectorAll('tbody tr').forEach((tr) => {
      const tds = tr.children;
      if (tds.length === 1 && ths.length > 1) { tr.classList.add('fk-fila-vacia'); return; }
      for (let i = 0; i < tds.length && i < ths.length; i++) if (ths[i] && tds[i].dataset.label !== ths[i]) tds[i].dataset.label = ths[i];
    });
  }
  let pend = false;
  function todo() { pend = false; document.querySelectorAll('table').forEach(etiquetar); }
  function pedir() { if (!pend) { pend = true; requestAnimationFrame(todo); } }
  function iniciar() {
    todo();
    new MutationObserver(pedir).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
