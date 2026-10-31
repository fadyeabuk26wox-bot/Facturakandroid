// FacturaK — Sincronización en la nube (renderer). Habla con el proceso
// principal por IPC (window.api.nube.*); el proceso principal es quien
// realmente llama a la API web / Supabase. Ver ../../nube.js.
(function () {
  'use strict';
  const FK = window.FK;
  const $ = FK.$;
  const esc = FK.esc;

  let estadoActual = { conectado: false };
  let productosActuales = [];

  function contenedor() { return document.getElementById('tab-sync'); }

  function formatoFecha(iso) {
    if (!iso) return '';
    try { return FK.fechaHora(iso); } catch (_) { return ''; }
  }

  function vistaDesconectado(mensajeError) {
    return `
      <div class="max-w-md mx-auto bg-white rounded-2xl shadow-sm p-6 mt-6">
        <h2 class="text-lg font-bold text-dark333 mb-1">Sincronización en la nube</h2>
        <p class="text-xs text-greym mb-5 leading-relaxed">
          Conecta esta computadora con tu FacturaK web para que el inventario y las
          ventas se compartan en vivo entre el punto de venta y la web.
        </p>
        <form id="form-nube-login" class="space-y-3">
          <div>
            <label class="text-xs font-semibold text-greym">URL de tu FacturaK web</label>
            <input id="nube-baseurl" type="text" class="input-field" placeholder="https://tu-empresa.vercel.app"
              value="${esc(estadoActual.baseUrl || '')}">
          </div>
          <div>
            <label class="text-xs font-semibold text-greym">Código de empresa</label>
            <input id="nube-codigo" type="text" class="input-field" placeholder="Ej: FK-3391"
              value="${esc(estadoActual.empresaCodigo || '')}">
          </div>
          <div>
            <label class="text-xs font-semibold text-greym">Usuario</label>
            <input id="nube-usuario" type="text" class="input-field" value="${esc(estadoActual.usuario || '')}">
          </div>
          <div>
            <label class="text-xs font-semibold text-greym">Contraseña</label>
            <input id="nube-password" type="password" class="input-field">
          </div>
          ${mensajeError ? `<div class="text-xs text-accent bg-accent/10 rounded-xl px-3 py-2">${esc(mensajeError)}</div>` : ''}
          <button type="submit" id="nube-btn-conectar"
            class="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-2.5 rounded-xl transition active:scale-95">
            Conectar
          </button>
        </form>
      </div>`;
  }

  function vistaConectado() {
    const pendientes = estadoActual.pendientes || 0;
    const filas = productosActuales.map((p) => {
      const bajo = Number(p.stock_actual) <= Number(p.stock_minimo);
      return `
        <tr class="border-b border-gray-100">
          <td class="py-2 pr-3 text-greym">${esc(p.codigo)}</td>
          <td class="py-2 pr-3 text-dark333">${esc(p.nombre)}</td>
          <td class="py-2 pr-3 text-right">${esc(p.stock_actual)}</td>
          <td class="py-2 pr-3 text-right">${FK.usd(p.precio)}</td>
          <td class="py-2 text-right">
            <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full ${bajo ? 'bg-accent/15 text-accent' : 'bg-teal/15 text-teal'}">
              ${bajo ? 'Stock bajo' : 'Disponible'}
            </span>
          </td>
        </tr>`;
    }).join('') || `<tr><td colspan="5" class="py-4 text-center text-greym">Sin productos todavía.</td></tr>`;

    const opciones = productosActuales
      .map((p) => `<option value="${esc(p.id)}">${esc(p.codigo)} — ${esc(p.nombre)} (stock: ${esc(p.stock_actual)})</option>`)
      .join('');

    return `
      <div class="bg-white rounded-2xl shadow-sm p-5 mb-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="text-sm font-bold text-dark333">${esc(estadoActual.empresaNombre || estadoActual.empresaCodigo)}</div>
            <div class="text-xs text-greym">
              Conectado como <b>${esc(estadoActual.usuario)}</b> · ${esc(FK.rolNombre(estadoActual.rol))} ·
              <span class="${estadoActual.enLinea === false ? 'text-accent' : 'text-teal'}">
                ${estadoActual.enLinea === false ? 'Sin conexión — reintentando…' : 'En línea'}
              </span>
              ${pendientes ? ` · ${pendientes} movimiento(s) pendientes de enviar` : ''}
            </div>
          </div>
          <button id="nube-btn-desconectar" class="text-xs font-semibold text-greym hover:text-accent px-3 py-2 rounded-lg hover:bg-gray-100 transition">
            Cerrar sesión de la nube
          </button>
        </div>
      </div>

      <div class="bg-white rounded-2xl shadow-sm p-5 mb-5">
        <div class="flex items-center justify-between mb-3">
          <div class="text-sm font-bold text-dark333">Inventario (en vivo — se refresca solo)</div>
          <button id="nube-btn-refrescar" class="text-xs font-semibold text-primary hover:underline">Actualizar ahora</button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-greym border-b border-gray-100">
                <th class="py-2 font-normal">Código</th><th class="py-2 font-normal">Producto</th>
                <th class="py-2 font-normal text-right">Stock</th><th class="py-2 font-normal text-right">Precio</th>
                <th class="py-2 font-normal text-right">Estado</th>
              </tr>
            </thead>
            <tbody>${filas}</tbody>
          </table>
        </div>
      </div>

      <div class="bg-white rounded-2xl shadow-sm p-5">
        <div class="text-sm font-bold text-dark333 mb-3">Registrar movimiento manual</div>
        <form id="form-nube-ajuste" class="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div class="sm:col-span-2">
            <label class="text-xs font-semibold text-greym">Producto</label>
            <select id="nube-ajuste-producto" class="input-field">${opciones}</select>
          </div>
          <div>
            <label class="text-xs font-semibold text-greym">Cantidad (+entrada / -salida)</label>
            <input id="nube-ajuste-delta" type="number" step="0.01" class="input-field" placeholder="-1">
          </div>
          <div>
            <label class="text-xs font-semibold text-greym">Tipo</label>
            <select id="nube-ajuste-tipo" class="input-field">
              <option value="venta">Venta</option>
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
              <option value="ajuste">Ajuste</option>
            </select>
          </div>
          <div class="sm:col-span-4">
            <button type="submit" class="bg-primary hover:bg-primary/90 text-white font-semibold px-4 py-2.5 rounded-xl transition active:scale-95">
              Registrar
            </button>
          </div>
        </form>
      </div>`;
  }

  function pintar(mensajeError) {
    const c = contenedor();
    if (!c) return;
    c.innerHTML = estadoActual.conectado ? vistaConectado() : vistaDesconectado(mensajeError);
    conectarEventos();
  }

  function conectarEventos() {
    const formLogin = document.getElementById('form-nube-login');
    if (formLogin) {
      formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('nube-btn-conectar');
        btn.disabled = true; btn.textContent = 'Conectando…';
        const r = await window.api.nube.login({
          baseUrl: document.getElementById('nube-baseurl').value.trim(),
          codigoEmpresa: document.getElementById('nube-codigo').value.trim(),
          usuario: document.getElementById('nube-usuario').value.trim(),
          password: document.getElementById('nube-password').value,
        });
        if (r.ok) {
          FK.toast('Conectado a la nube', 'ok');
          estadoActual = await window.api.nube.estado();
          productosActuales = await window.api.nube.productosListar();
          pintar();
        } else {
          btn.disabled = false; btn.textContent = 'Conectar';
          pintar(r.error);
        }
      });
    }

    const btnDesconectar = document.getElementById('nube-btn-desconectar');
    if (btnDesconectar) {
      btnDesconectar.addEventListener('click', async () => {
        const ok = await FK.confirmar('¿Cerrar la sesión de sincronización en la nube en esta computadora?');
        if (!ok) return;
        estadoActual = await window.api.nube.logout();
        productosActuales = [];
        pintar();
      });
    }

    const btnRefrescar = document.getElementById('nube-btn-refrescar');
    if (btnRefrescar) btnRefrescar.addEventListener('click', () => window.api.nube.productosRefrescar());

    const formAjuste = document.getElementById('form-nube-ajuste');
    if (formAjuste) {
      formAjuste.addEventListener('submit', async (e) => {
        e.preventDefault();
        const productoId = document.getElementById('nube-ajuste-producto').value;
        const delta = FK.num(document.getElementById('nube-ajuste-delta').value);
        const tipo = document.getElementById('nube-ajuste-tipo').value;
        if (!productoId || !delta) { FK.toast('Elige un producto y una cantidad distinta de 0', 'error'); return; }
        const r = await window.api.nube.ajustarStock({ productoId, delta, tipo });
        if (r.ok) {
          FK.toast(r.encolado ? (r.aviso || 'Guardado, pendiente de enviar') : 'Movimiento registrado', 'ok');
          document.getElementById('nube-ajuste-delta').value = '';
        } else {
          FK.toast(r.error || 'No se pudo registrar el movimiento', 'error');
        }
      });
    }
  }

  FK.render.sync = async function () {
    if (!(window.api && window.api.nube)) { contenedor().innerHTML = '<div class="max-w-md mx-auto bg-white rounded-2xl shadow-sm p-6 mt-6 text-sm text-greym">La sincronización con la nube está disponible en la aplicación de escritorio y en la APK, no en el navegador.</div>'; return; }
    estadoActual = await window.api.nube.estado();
    productosActuales = estadoActual.conectado ? await window.api.nube.productosListar() : [];
    pintar();
  };

  // Actualizaciones empujadas por el proceso principal (sondeo cada pocos
  // segundos). Solo repintamos si la pestaña está visible, para no gastar
  // trabajo de más mientras el usuario está en POS, inventario, etc.
  // En el navegador (sin Electron ni APK) no existe window.api: la nube Supabase queda deshabilitada, el resto funciona.
  if (window.api && window.api.nube) {
    window.api.nube.onProductos((productos) => {
      productosActuales = productos;
      if (FK.tabActual() === 'sync') pintar();
    });
    window.api.nube.onEstado((estado) => {
      estadoActual = estado;
      if (FK.tabActual() === 'sync') pintar();
    });
  }
})();
