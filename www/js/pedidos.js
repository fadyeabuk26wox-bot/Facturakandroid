// FacturaK — Pedidos: el vendedor (celular o PC) envía el pedido a la caja; el Cajero y el Admin lo reciben
// en tiempo real y lo facturan. La PC central decide en Usuarios si cada vendedor solo toma pedidos o también factura.
(function () {
  'use strict';
  const FK = window.FK, $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pos = () => FK.pos;

  // ---------- permisos ----------
  FK.puedeFacturar = () => {
    const u = FK.sesion && FK.sesion.usuario; if (!u) return true;
    if (u.rol === 'vendedor') return u.factura === true;
    return true;                                   // admin, cajero, autoservicio
  };
  FK.puedePedir = () => { const u = FK.sesion && FK.sesion.usuario; return !!u && (u.rol === 'vendedor' || u.rol === 'admin'); };
  const esCaja = () => { const u = FK.sesion && FK.sesion.usuario; return !!u && (u.rol === 'admin' || u.rol === 'cajero'); };

  const lista = () => { const e = FK.emp(); if (e && !Array.isArray(e.pedidos)) e.pedidos = []; return e ? e.pedidos : []; };
  const pendientes = () => lista().filter((p) => p.estado === 'pendiente');
  const total = (p) => FK.r2((p.items || []).reduce((s, i) => s + FK.r2(i.cantidad * i.precio), 0));

  function numeroNuevo() {
    const usados = new Set(lista().map((p) => p.numero)); const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let n = 0; n < 50; n++) { let c = 'P-'; for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)]; if (!usados.has(c)) return c; }
    return 'P-' + Date.now().toString(36).toUpperCase().slice(-6);
  }
  const hace = (iso) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000)); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.floor(m / 60)} h` : FK.fecha(iso); };

  // ---------- POS: botones según el perfil ----------
  FK.ajustarPOS = () => {
    const g = $('btn-generar-factura'); if (!g) return;
    const factura = FK.puedeFacturar(), pedir = FK.puedePedir() && !pos().pedidoId;
    const auto = FK.rol() === 'autoservicio';
    g.classList.toggle('hidden', !factura);
    const met = $('pos-metodo-pago'); if (met && met.parentElement) met.parentElement.classList.toggle('hidden', !factura);
    ['chk-enviar-correo', 'chk-imprimir'].forEach((id) => { const c = $(id); if (c && c.closest('label')) { if (!factura) c.closest('label').classList.add('hidden'); else if (id === 'chk-enviar-correo') c.closest('label').classList.remove('hidden'); } });
    if (factura && FK.tieneModulo && FK.tieneModulo('termica') && $('chk-imprimir')) $('chk-imprimir').closest('label').classList.remove('hidden');
    const b = $('btn-enviar-pedido'); if (b) { b.classList.toggle('hidden', !pedir || auto); b.disabled = !pos().carrito.length; }
    const n = $('pos-pedido-nota'); if (n) n.classList.toggle('hidden', !pedir || auto);
    const bn = $('pos-pedido-banner'), p = pos().pedidoId && lista().find((x) => x.id === pos().pedidoId);
    if (bn) { bn.classList.toggle('hidden', !p); if (p) $('pos-pedido-banner-txt').textContent = `Facturando pedido ${p.numero} · ${p.vendedor}`; }
    const pn = $('pos-cliente-panel'); if (pn && !FK.puedeFacturar() && !auto) pn.classList.remove('hidden');
  };

  // ---------- enviar pedido (vendedor) ----------
  function enviarPedido() {
    const P = pos();
    if (!P.carrito.length) return FK.toast('El pedido está vacío', 'error');
    const falta = FK.validarStock(P.carrito); if (falta) return FK.toast(falta, 'error');
    const u = FK.sesion.usuario, c = P.cliente;
    const items = P.carrito.map((it) => ({ productoId: it.productoId, varianteId: it.varianteId, nombre: it.nombre, detalle: it.detalle || '', cantidad: it.cantidad, precio: it.precio, subtotal: FK.r2(it.cantidad * it.precio), porPeso: !!it.porPeso, tipoItem: it.tipoItem, impuestoPct: it.impuestoPct == null ? null : it.impuestoPct }));
    const ped = {
      id: FK.uid(), numero: numeroNuevo(), fecha: new Date().toISOString(), vendedor: u.usuario, vendedorId: u.id,
      clienteId: c ? c.id : null, clienteNombre: c ? c.nombre : '', clienteCedula: c ? c.cedula || '' : '', clienteTelefono: c ? c.telefono || '' : '',
      items, total: FK.r2(items.reduce((s, i) => s + i.subtotal, 0)), nota: ($('pos-pedido-nota').value || '').trim(), estado: 'pendiente', ventaId: null
    };
    lista().push(ped); FK.store.saveNow();
    P.carrito = []; P.cliente = null; P.promo = null; $('pos-pedido-nota').value = '';
    FK.render.pos();
    FK.toast(`Pedido ${ped.numero} enviado a caja · ${FK.usd(ped.total)}`);
    vistos.add(ped.id); badge();
  }

  // ---------- facturar un pedido (cajero / admin) ----------
  async function facturar(id) {
    if (FK.red && FK.red.activo && FK.red.activo()) { try { await FK.red.sincronizarAhora(); } catch (_) {} }   // ver si otro cajero ya lo tomó
    const ped = lista().find((x) => x.id === id);
    if (!ped) return FK.toast('Ese pedido ya no existe', 'error');
    if (ped.estado !== 'pendiente') return FK.toast(`El pedido ${ped.numero} ya fue ${ped.estado === 'facturado' ? 'facturado' : 'anulado'}`, 'error');
    const P = pos();
    if (P.carrito.length && !(await FK.confirmar('El carrito del POS tiene productos. Se reemplazarán por los del pedido.', { titulo: 'Facturar pedido', ok: 'Continuar' }))) return;
    if (!FK.caja() && FK.rol() !== 'autoservicio') return FK.toast('Abre la caja (con la tasa del día) para poder facturar', 'error');
    P.carrito = ped.items.map((i) => ({
      key: i.productoId + '|' + (i.varianteId || '') + '|ped', productoId: i.productoId, varianteId: i.varianteId || null, nombre: i.nombre,
      detalle: i.detalle || '', detalleExtra: '', cantidad: i.cantidad, precio: i.precio, porPeso: !!i.porPeso, tipoItem: i.tipoItem || 'PRODUCTO_NORMAL', precioVariable: false, impuestoPct: i.impuestoPct == null ? null : i.impuestoPct
    }));
    P.promo = null; P.cliente = ped.clienteId ? (FK.emp().clientes.find((c) => c.id === ped.clienteId) || null) : null; P.pedidoId = ped.id;
    FK.irTab('pos');
    FK.toast(`Pedido ${ped.numero} cargado: elige el método de pago y genera la factura`);
  }
  FK.antesFacturar = async () => {
    const id = pos().pedidoId; if (!id) return true;
    if (FK.red && FK.red.activo && FK.red.activo()) { try { await FK.red.sincronizarAhora(); } catch (_) {} }
    const ped = lista().find((x) => x.id === id);
    if (!ped || ped.estado !== 'pendiente') { FK.toast('Este pedido ya fue facturado o anulado por otra persona', 'error'); pos().pedidoId = null; pos().carrito = []; FK.render.pos(); return false; }
    return true;
  };
  FK.alFacturar = (v) => {
    const id = pos().pedidoId; if (!id) return;
    const ped = lista().find((x) => x.id === id); if (!ped) return;
    ped.estado = 'facturado'; ped.ventaId = v.id; ped.factura = v.numero; ped.facturadoPor = FK.sesion.usuario.usuario; ped.fechaFactura = new Date().toISOString();
    FK.store.saveNow();
  };

  async function anular(id) {
    const ped = lista().find((x) => x.id === id); if (!ped || ped.estado !== 'pendiente') return;
    if (!(await FK.confirmar(`¿Anular el pedido ${ped.numero} de ${ped.vendedor}?`, { titulo: 'Anular pedido', ok: 'Anular', peligro: true }))) return;
    ped.estado = 'anulado'; ped.anuladoPor = FK.sesion.usuario.usuario; FK.store.saveNow();
    if (pos().pedidoId === id) { pos().pedidoId = null; pos().carrito = []; }
    FK.render.pedidos(); badge();
  }

  // ---------- pestaña Pedidos ----------
  let filtro = 'pendiente', busca = '';
  FK.render.pedidos = () => {
    const u = FK.sesion.usuario, caja = esCaja();
    let l = lista().slice().reverse();
    if (!caja) l = l.filter((p) => p.vendedorId === u.id);                      // el vendedor solo ve los suyos
    const cuenta = { pendiente: 0, facturado: 0, anulado: 0 }; l.forEach((p) => { cuenta[p.estado] = (cuenta[p.estado] || 0) + 1; });
    $('pedidos-filtros').innerHTML = [['pendiente', 'Pendientes'], ['facturado', 'Facturados'], ['anulado', 'Anulados'], ['todos', 'Todos']].map(([k, t]) =>
      `<button type="button" data-f="${k}" class="px-4 py-2 rounded-full text-sm font-semibold ${filtro === k ? 'bg-primary text-white' : 'bg-white text-greym shadow-sm'}">${t}${k !== 'todos' ? ` <span class="opacity-70">${cuenta[k] || 0}</span>` : ''}</button>`).join('');
    if (filtro !== 'todos') l = l.filter((p) => p.estado === filtro);
    const q = FK.norm ? FK.norm(busca) : busca.toLowerCase();
    if (q) l = l.filter((p) => FK.norm([p.numero, p.vendedor, p.clienteNombre].join(' ')).includes(q));
    const tasa = FK.tasa();
    $('pedidos-lista').innerHTML = l.length ? l.map((p) => {
      const puedeAnular = p.estado === 'pendiente' && (caja || p.vendedorId === u.id);
      const puedeFact = p.estado === 'pendiente' && (caja || (u.rol === 'vendedor' && u.factura === true && p.vendedorId === u.id));
      const est = p.estado === 'pendiente' ? '<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pendiente</span>' : p.estado === 'facturado' ? `<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal/10 text-teal">Factura N° ${esc(FK.nroFactura ? FK.nroFactura(p.factura) : p.factura)}</span>` : '<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-greym">Anulado</span>';
      return `<div class="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2"><div class="font-extrabold text-dark333">${esc(p.numero)}</div>${est}</div>
        <div class="text-xs text-greym">${esc(p.vendedor)} · ${hace(p.fecha)}${p.clienteNombre ? ' · ' + esc(p.clienteNombre) : ''}</div>
        <div class="text-sm divide-y divide-gray-100">${p.items.map((i) => `<div class="flex justify-between gap-2 py-1"><span class="min-w-0">${esc(i.cantidad)} × ${esc(i.nombre)}${i.detalle ? ` <span class="text-[11px] text-greym">${esc(i.detalle)}</span>` : ''}</span><span class="font-semibold shrink-0">${FK.usd(FK.r2(i.cantidad * i.precio))}</span></div>`).join('')}</div>
        ${p.nota ? `<div class="text-xs fk-nota rounded-lg px-2 py-1">📝 ${esc(p.nota)}</div>` : ''}
        <div class="flex items-baseline justify-between"><span class="text-lg font-extrabold text-teal">${FK.usd(p.total)}</span><span class="text-xs font-semibold text-primary">${tasa ? FK.bs(p.total * tasa) : ''}</span></div>
        ${puedeFact || puedeAnular ? `<div class="flex gap-2">${puedeFact ? `<button type="button" data-fact="${p.id}" class="flex-1 bg-teal text-white font-bold py-2.5 rounded-xl">Facturar</button>` : ''}${puedeAnular ? `<button type="button" data-anular="${p.id}" class="px-4 bg-red-50 text-accent font-semibold py-2.5 rounded-xl">Anular</button>` : ''}</div>` : ''}
      </div>`;
    }).join('') : `<div class="text-center text-greym py-12" style="grid-column:1/-1">${filtro === 'pendiente' ? 'No hay pedidos pendientes 🎉' : 'No hay pedidos para mostrar'}</div>`;
    badge();
  };

  // ---------- aviso de pedidos nuevos (cajero / admin) ----------
  const vistos = new Set(); let iniciado = false;
  function badge() {
    const b = $('badge-pedidos'); if (!b) return;
    const n = esCaja() ? pendientes().length : 0;
    b.textContent = n > 99 ? '99+' : n; b.classList.toggle('on', !!n);
  }
  function pitido() {
    try { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; const a = new C(), o = a.createOscillator(), g = a.createGain();
      o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.setValueAtTime(0.15, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.35); o.start(); o.stop(a.currentTime + 0.36); } catch (_) {}
  }
  function vigilar() {
    if (!FK.sesion || !FK.sesion.usuario || !FK.emp()) { iniciado = false; vistos.clear(); return; }
    if (!esCaja()) return;
    const pend = pendientes();
    if (!iniciado) { pend.forEach((p) => vistos.add(p.id)); iniciado = true; badge(); return; }
    const nuevos = pend.filter((p) => !vistos.has(p.id));
    nuevos.forEach((p) => vistos.add(p.id));
    if (nuevos.length) {
      pitido();
      FK.toast(nuevos.length === 1 ? `🛎 Pedido nuevo ${nuevos[0].numero} de ${nuevos[0].vendedor} · ${FK.usd(nuevos[0].total)}` : `🛎 ${nuevos.length} pedidos nuevos`);
      if (FK.tabActual() === 'pedidos') FK.render.pedidos();
    }
    badge();
  }
  setInterval(vigilar, 2000);

  // ---------- eventos ----------
  document.addEventListener('click', (e) => {
    const f = e.target.closest('#pedidos-filtros [data-f]'); if (f) { filtro = f.dataset.f; FK.render.pedidos(); return; }
    const a = e.target.closest('#pedidos-lista [data-fact]'); if (a) { facturar(a.dataset.fact); return; }
    const n = e.target.closest('#pedidos-lista [data-anular]'); if (n) { anular(n.dataset.anular); return; }
    if (e.target.closest('#btn-enviar-pedido')) { enviarPedido(); return; }
    if (e.target.closest('#btn-pedido-soltar')) { pos().pedidoId = null; pos().carrito = []; pos().cliente = null; FK.render.pos(); return; }
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'pedidos-buscar') { busca = e.target.value; FK.render.pedidos(); } });
})();
