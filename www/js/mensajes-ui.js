// FacturaK — Panel centralizado de plantillas de WhatsApp.
// Reúne en un solo lugar los 3 mensajes automáticos del sistema:
//   1) Factura (se edita y se guarda aquí mismo, en e.mensajesWhatsApp.factura)
//   2) Alertas de cobro de Créditos (vive en e.creditoConfig.whatsapp.plantilla
//      — ya tenía su propio editor en Créditos > Configuración, con ajustes
//      extra como país y días de aviso; aquí se edita el MISMO campo, para
//      que de verdad sea un panel centralizado y no dos copias del texto).
//   3) Stock bajo (nuevo: e.mensajesWhatsApp.stockBajo + un botón para
//      mandar la alerta ya mismo a un número configurado).
(function () {
  'use strict';
  const FK = window.FK;
  const $ = FK.$;
  const esc = FK.esc;

  const DEFAULTS = {
    factura: 'Hola {cliente}, te enviamos tu factura N° {factura} de *{empresa}* por un total de *{total}* ({total_bs}). ¡Gracias por tu compra! 🧾',
    stockBajo: '📦 Alerta de stock bajo en *{empresa}*:\n{lista}\nRevisa el inventario para reponer a tiempo.'
  };
  const VARS_FACTURA = ['cliente', 'factura', 'empresa', 'total', 'total_bs'];
  const VARS_STOCK = ['empresa', 'cantidad', 'lista'];

  function chips(vars) {
    return vars.map((v) => `<span class="text-[10px] font-mono bg-gray-100 text-greym px-1.5 py-0.5 rounded">{${v}}</span>`).join(' ');
  }

  function productosStockBajo() {
    return FK.emp().productos.filter((p) => p.activo !== false && FK.itemControlaStock(p) && (p.stockMinimo || 0) > 0 && FK.stockTotalProducto(p) <= p.stockMinimo);
  }

  function vista() {
    const e = FK.emp();
    const mw = e.mensajesWhatsApp;
    const plantillaCobro = e.creditoConfig.whatsapp.plantilla;
    const bajos = productosStockBajo();

    return `
      <div class="max-w-3xl space-y-5">
        <p class="text-xs text-greym -mt-1">
          Estos son los textos que se usan al enviar mensajes por WhatsApp desde el sistema.
          Usa las variables entre llaves — se reemplazan automáticamente por el dato real al enviar.
        </p>

        <!-- Factura -->
        <div class="bg-white rounded-2xl shadow-sm p-5">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-bold text-dark333">🧾 Confirmación de factura</h3>
            <button type="button" data-restablecer="factura" class="text-xs text-greym hover:text-accent font-semibold">Restablecer</button>
          </div>
          <p class="text-[11px] text-greym mb-2">Se usa al tocar "📲 WhatsApp" después de generar una venta.</p>
          <textarea id="msg-factura" rows="3" class="input-field font-mono text-sm">${esc(mw.factura)}</textarea>
          <div class="mt-2 flex flex-wrap gap-1.5">${chips(VARS_FACTURA)}</div>
        </div>

        <!-- Cobranza de créditos -->
        <div class="bg-white rounded-2xl shadow-sm p-5">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-bold text-dark333">💳 Alertas de cobro (Créditos)</h3>
            <button type="button" data-restablecer="cobro" class="text-xs text-greym hover:text-accent font-semibold">Restablecer</button>
          </div>
          <p class="text-[11px] text-greym mb-2">
            Se usa desde el módulo de Créditos al mandar un recordatorio de cuota. El código de país, los días
            de aviso y el modo de apertura de WhatsApp se configuran en
            <button type="button" id="ir-creditos-config" class="text-primary hover:underline font-semibold">Créditos → Configuración</button>.
          </p>
          <textarea id="msg-cobro" rows="5" class="input-field font-mono text-sm">${esc(plantillaCobro)}</textarea>
          <div class="mt-2 flex flex-wrap gap-1.5">${chips(['cliente', 'empresa', 'credito', 'articulo', 'cuota', 'monto_cuota', 'monto_cuota_bs', 'vence', 'dias_atraso', 'mora', 'total_al_dia', 'saldo', 'cuotas_pendientes', 'situacion'])}</div>
        </div>

        <!-- Stock bajo -->
        <div class="bg-white rounded-2xl shadow-sm p-5">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-bold text-dark333">📦 Alerta de stock bajo</h3>
            <button type="button" data-restablecer="stockBajo" class="text-xs text-greym hover:text-accent font-semibold">Restablecer</button>
          </div>
          <p class="text-[11px] text-greym mb-2">
            Define el "Stock mínimo" de cada producto en Inventario para que entre en esta alerta.
          </p>
          <textarea id="msg-stockbajo" rows="3" class="input-field font-mono text-sm">${esc(mw.stockBajo)}</textarea>
          <div class="mt-2 flex flex-wrap gap-1.5">${chips(VARS_STOCK)}</div>

          <div class="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-end gap-3">
            <div class="flex-1 min-w-[180px]">
              <label class="text-xs font-semibold text-greym">Enviar alertas a (WhatsApp)</label>
              <input id="msg-stockbajo-tel" type="tel" class="input-field" placeholder="0412-1234567" value="${esc(mw.stockBajoTelefono || '')}">
            </div>
            <button type="button" id="btn-enviar-stockbajo"
              class="bg-[#25D366]/10 text-[#128C7E] font-bold px-4 py-2.5 rounded-xl hover:bg-[#25D366]/20 transition disabled:opacity-40"
              ${bajos.length ? '' : 'disabled'}>
              📲 Enviar alerta ahora (${bajos.length} producto${bajos.length === 1 ? '' : 's'})
            </button>
          </div>
          ${bajos.length ? `<ul class="mt-3 text-xs text-greym space-y-0.5">${bajos.map((p) => `<li>• ${esc(p.nombre)} — quedan ${FK.stockTotalProducto(p)} (mínimo ${p.stockMinimo})</li>`).join('')}</ul>`
            : '<p class="mt-3 text-xs text-greym">No hay productos por debajo de su stock mínimo ahora mismo.</p>'}
        </div>

        <button id="btn-guardar-mensajes" class="bg-teal hover:bg-teal/90 text-white font-bold px-5 py-2.5 rounded-xl transition active:scale-95">
          Guardar cambios
        </button>
      </div>`;
  }

  function conectarEventos() {
    document.querySelectorAll('[data-restablecer]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const campo = btn.dataset.restablecer;
        const ok = await FK.confirmar('¿Restablecer este mensaje al texto por defecto? Se perderá tu redacción actual.');
        if (!ok) return;
        if (campo === 'cobro') $('msg-cobro').value = FK.creditos.PLANTILLA_DEF;
        else if (campo === 'factura') $('msg-factura').value = DEFAULTS.factura;
        else if (campo === 'stockBajo') $('msg-stockbajo').value = DEFAULTS.stockBajo;
      });
    });

    $('ir-creditos-config').onclick = () => FK.irTab('creditos');

    $('btn-enviar-stockbajo').onclick = () => {
      const e = FK.emp();
      const bajos = productosStockBajo();
      const tel = FK.normalizarTelefonoWA($('msg-stockbajo-tel').value);
      if (!tel || tel.length < 11) { FK.toast('Ingresa un número de WhatsApp válido', 'error'); return; }
      const lista = bajos.map((p) => `• ${p.nombre}: quedan ${FK.stockTotalProducto(p)} (mínimo ${p.stockMinimo})`).join('\n');
      const mensaje = FK.creditos.llenarPlantilla($('msg-stockbajo').value, { empresa: e.nombre, cantidad: String(bajos.length), lista });
      window.open(`whatsapp://send?phone=${tel}&text=${encodeURIComponent(mensaje)}`, '_blank');
      FK.toast('Se abrió WhatsApp con la alerta de stock bajo.');
    };

    $('btn-guardar-mensajes').onclick = () => {
      const e = FK.emp();
      const fac = $('msg-factura').value.trim();
      const sb = $('msg-stockbajo').value.trim();
      const cob = $('msg-cobro').value.trim();
      if (!fac || !sb || !cob) { FK.toast('Ningún mensaje puede quedar vacío', 'error'); return; }
      e.mensajesWhatsApp.factura = fac;
      e.mensajesWhatsApp.stockBajo = sb;
      e.mensajesWhatsApp.stockBajoTelefono = $('msg-stockbajo-tel').value.trim();
      e.creditoConfig.whatsapp.plantilla = cob;
      FK.store.saveNow();
      FK.toast('Mensajes de WhatsApp guardados');
      FK.render.mensajes();
    };
  }

  FK.render.mensajes = function () {
    $('tab-mensajes').innerHTML = vista();
    conectarEventos();
  };
})();
