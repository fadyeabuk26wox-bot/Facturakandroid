// FacturaK — Panel "API e Integraciones".
//
// IMPORTANTE (para que quede documentado en el propio código, no solo en el
// chat): esta pantalla genera y guarda de verdad la clave, las funciones
// permitidas y los límites — igual que cualquier otro ajuste de FacturaK.
// Lo que NO hace todavía es usarse para autorizar nada: hoy FacturaK no
// expone una API pública para que un tercero la llame con esta clave. Para
// que estos permisos y límites se apliquen de verdad hace falta conectar
// esta configuración con el backend web (facturak-web) — ver nota al final
// del archivo.
(function () {
  'use strict';
  const FK = window.FK;
  const $ = FK.$;
  const esc = FK.esc;

  const FUNCIONES_API = [
    { clave: 'facturacion', label: 'Facturación y ventas (POS)' },
    { clave: 'inventario', label: 'Gestión de inventario' },
    { clave: 'clientes', label: 'Gestión de clientes' },
    { clave: 'reportes', label: 'Generar reportes' },
    { clave: 'whatsapp', label: 'Notificaciones por WhatsApp' },
    { clave: 'sincronizacion', label: 'Sincronización con FacturaK Web' },
  ];

  let revelada = false;
  let nubeEstado = { conectado: false };
  function nubeConectada() { return !!nubeEstado.conectado; }

  function mascara(clave) {
    if (!clave) return '';
    return clave.slice(0, 11) + '•'.repeat(18) + clave.slice(-6);
  }

  function vista() {
    const cfg = FK.emp().apiConfig;
    return `
      <div class="max-w-2xl">
        <div class="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button type="button" id="api-acc-head" class="w-full flex items-start gap-3 p-5 text-left hover:bg-gray-50 transition">
            <svg class="w-5 h-5 shrink-0 mt-0.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 20l4-16M6 9l-4 3 4 3m12-6l4 3-4 3"/></svg>
            <div class="flex-1">
              <div class="text-sm font-bold text-dark333">Características y limitantes para la API</div>
              <div class="text-xs text-greym font-mono mt-0.5">${cfg.clave ? esc(cfg.clave.slice(0, 11) + '…' + cfg.clave.slice(-6)) : 'Todavía no se generó una clave'}</div>
            </div>
            <svg id="api-acc-chev" class="w-4 h-4 text-greym mt-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6"/></svg>
          </button>

          <div id="api-acc-body" class="border-t border-gray-100 p-5 pt-4 space-y-5">

            <div>
              <div class="text-xs font-semibold text-greym mb-2">Funciones de la API</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                ${FUNCIONES_API.map(f => `
                  <label class="flex items-center gap-2 text-sm text-dark333 cursor-pointer">
                    <input type="checkbox" data-api-fn="${f.clave}" class="rounded accent-teal" ${cfg.funciones[f.clave] ? 'checked' : ''}>
                    ${esc(f.label)}
                  </label>`).join('')}
              </div>
            </div>

            <div class="pt-4 border-t border-gray-100">
              <div class="text-xs font-semibold text-greym mb-2">Limitantes de uso</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="text-xs text-greym">Límite diario de solicitudes</label>
                  <input id="api-limite-diario" type="number" min="0" class="input-field" value="${cfg.limiteDiario}">
                  <div class="text-[11px] text-greym mt-0.5">requests / day</div>
                </div>
                <div>
                  <label class="text-xs text-greym">Límite de tasa</label>
                  <input id="api-limite-minuto" type="number" min="0" class="input-field" value="${cfg.limiteMinuto}">
                  <div class="text-[11px] text-greym mt-0.5">requests / minute</div>
                </div>
              </div>
              <label class="flex items-center gap-2 text-sm text-dark333 cursor-pointer mt-3">
                <input type="checkbox" id="api-restringir-ip" class="rounded accent-teal" ${cfg.restringirIp ? 'checked' : ''}>
                Restringir direcciones IP
              </label>
              <div id="api-ip-wrap" class="mt-2 ${cfg.restringirIp ? '' : 'opacity-40 pointer-events-none'}">
                <input id="api-ips" type="text" class="input-field font-mono text-sm" placeholder="192.168.1.1, 10.0.0.5"
                  value="${esc(cfg.ips || '')}">
                <div class="text-[11px] text-greym mt-1 font-mono">Ejemplo: 192.168.1.1, 10.0.0.5</div>
              </div>
            </div>

            <div class="pt-4 border-t border-gray-100">
              <div class="text-xs font-semibold text-greym mb-2">Datos de la API</div>
              <label class="text-xs text-greym">Llave API activa</label>
              <div class="flex gap-2 mt-1">
                <div id="api-clave-ro" class="flex-1 min-w-0 truncate font-mono text-sm bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                  ${cfg.clave ? esc(mascara(cfg.clave)) : '—'}
                </div>
                ${cfg.clave ? `
                  <button type="button" id="api-btn-revelar" class="shrink-0 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-greym transition">👁️</button>
                  <button type="button" id="api-btn-copiar" class="shrink-0 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-greym transition">📋</button>
                ` : ''}
              </div>
              <button type="button" id="api-btn-generar" class="text-xs text-primary hover:underline font-semibold mt-2">
                ${cfg.clave ? 'Generar una nueva llave (invalida la anterior)' : 'Generar llave de API'}
              </button>
            </div>

            <div class="flex justify-end gap-2 pt-2">
              <button type="button" id="api-btn-cancelar" class="px-4 py-2.5 rounded-xl text-sm font-semibold text-greym hover:bg-gray-100 transition">Cancelar</button>
              <button type="button" id="api-btn-guardar" class="px-5 py-2.5 rounded-xl text-sm font-bold bg-primary hover:bg-primary/90 text-white transition active:scale-95">Guardar cambios</button>
            </div>
          </div>
        </div>

        <p class="text-[11px] mt-3 leading-relaxed ${nubeConectada() ? 'text-teal' : 'text-greym'}">
          ${nubeConectada()
            ? '✓ Sincronizado con FacturaK Web — esta clave ya autoriza y limita llamadas reales a /api/public/v1/…'
            : 'Conecta la nube (pestaña Sincronización) para que esta clave funcione de verdad desde afuera; mientras tanto solo queda guardada en esta computadora.'}
        </p>
      </div>`;
  }

  function conectarEventos() {
    $('api-acc-head').onclick = () => {
      $('api-acc-body').classList.toggle('hidden');
      $('api-acc-chev').classList.toggle('rotate-180');
    };

    const ipCheck = $('api-restringir-ip');
    ipCheck.addEventListener('change', () => {
      $('api-ip-wrap').classList.toggle('opacity-40', !ipCheck.checked);
      $('api-ip-wrap').classList.toggle('pointer-events-none', !ipCheck.checked);
    });

    const btnRevelar = $('api-btn-revelar');
    if (btnRevelar) {
      btnRevelar.onclick = () => {
        revelada = !revelada;
        $('api-clave-ro').textContent = revelada ? FK.emp().apiConfig.clave : mascara(FK.emp().apiConfig.clave);
      };
    }
    const btnCopiar = $('api-btn-copiar');
    if (btnCopiar) {
      btnCopiar.onclick = async () => {
        try { await navigator.clipboard.writeText(FK.emp().apiConfig.clave); FK.toast('Llave copiada'); }
        catch (_) { FK.toast('No se pudo copiar', 'error'); }
      };
    }

    $('api-btn-generar').onclick = async () => {
      const cfg = FK.emp().apiConfig;
      if (cfg.clave) {
        const ok = await FK.confirmar('¿Generar una nueva llave? La anterior dejará de servir para cualquier integración que ya la use.', { peligro: true });
        if (!ok) return;
      }
      cfg.clave = FK.generarClaveAPI();
      cfg.creada = new Date().toISOString();
      revelada = false;
      FK.store.saveNow();
      if (nubeConectada()) {
        const r = await window.api.nube.guardarApiConfig({
          clave: cfg.clave, funciones: cfg.funciones, limiteDiario: cfg.limiteDiario,
          limiteMinuto: cfg.limiteMinuto, restringirIp: cfg.restringirIp, ips: cfg.ips,
        });
        FK.toast(r.ok ? 'Nueva llave generada y sincronizada con FacturaK Web' : ('Llave generada, pero no se pudo sincronizar: ' + r.error), r.ok ? undefined : 'error');
      } else {
        FK.toast('Nueva llave de API generada (guardada solo en esta computadora)');
      }
      FK.render.api();
    };

    $('api-btn-cancelar').onclick = () => FK.render.api();

    $('api-btn-guardar').onclick = async () => {
      const cfg = FK.emp().apiConfig;
      FUNCIONES_API.forEach(f => { cfg.funciones[f.clave] = document.querySelector(`[data-api-fn="${f.clave}"]`).checked; });
      cfg.limiteDiario = Math.max(0, FK.num($('api-limite-diario').value) || 0);
      cfg.limiteMinuto = Math.max(0, FK.num($('api-limite-minuto').value) || 0);
      cfg.restringirIp = ipCheck.checked;
      cfg.ips = $('api-ips').value.trim();
      FK.store.saveNow();
      if (nubeConectada()) {
        // Sin "clave": no se reenvía (ya está guardada hasheada desde que se
        // generó); esto solo actualiza funciones/límites/IP.
        const r = await window.api.nube.guardarApiConfig({
          funciones: cfg.funciones, limiteDiario: cfg.limiteDiario, limiteMinuto: cfg.limiteMinuto,
          restringirIp: cfg.restringirIp, ips: cfg.ips,
        });
        FK.toast(r.ok ? 'Configuración guardada y sincronizada' : ('Guardado local; no se pudo sincronizar: ' + r.error), r.ok ? undefined : 'error');
      } else {
        FK.toast('Configuración de API guardada');
      }
      FK.render.api();
    };
  }

  FK.render.api = async function () {
    nubeEstado = (window.api && window.api.nube) ? await window.api.nube.estado() : { conectado: false };
    $('tab-api').innerHTML = vista();
    conectarEventos();
  };
})();
