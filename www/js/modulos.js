// FacturaK — módulos: mesas, estaciones (ciber), usuarios, promociones, fiscal, préstamos, impresoras/correo/respaldo.
(function () {
  'use strict';
  const FK = window.FK;
  const $ = FK.$;
  const esc = FK.esc;
  const render = FK.render;

  // ======================= MÉTODO DE PAGO GENÉRICO =======================
  let mpgCallback = null;
  FK.pedirMetodoPago = (descripcion, cb) => {
    mpgCallback = cb;
    $('mpg-descripcion').innerHTML = descripcion;
    $('mpg-select').value = '';
    FK.openModal('modal-metodo-pago-generico');
    FK.enfocar('mpg-select');
  };

  // ======================= MESAS (restaurante) =======================
  let mesaActual = null;
  let ultimaComanda = null;
  const totalMesa = (m) => FK.r2((m.pedido || []).reduce((s, i) => s + FK.r2(i.cantidad * i.precio), 0));

  render.mesas = () => {
    const e = FK.emp(), admin = FK.esAdmin();
    const plano = $('mesas-plano');
    plano.querySelectorAll('.mesa-tile').forEach(t => t.remove());
    FK.show('btn-nueva-mesa'); $('btn-nueva-mesa').classList.toggle('hidden', !admin);
    $('mesas-hint').textContent = admin
      ? 'Arrastra las mesas para ubicarlas como en tu local. Toca una mesa para abrir su cuenta.'
      : 'Toca una mesa para abrir su cuenta. Cada mesa lleva su propio pedido y se factura por separado.';
    $('mesas-plano-vacio').classList.toggle('hidden', e.mesas.length > 0);
    const W = plano.clientWidth || 800, H = plano.clientHeight || 560;
    e.mesas.forEach(m => {
      const ocupada = (m.pedido || []).length > 0;
      const t = document.createElement('div');
      t.className = 'mesa-tile ' + (ocupada ? 'mesa-ocupada' : 'mesa-libre') + (admin ? ' cursor-move' : ' cursor-pointer');
      t.dataset.mid = m.id;
      t.style.left = Math.min(Math.max(0, m.x || 0), W - 104) + 'px';
      t.style.top = Math.min(Math.max(0, m.y || 0), H - 104) + 'px';
      t.innerHTML = `<div class="text-[10px] uppercase tracking-wide opacity-80">Mesa</div>
        <div class="text-2xl font-extrabold leading-none">${esc(m.numero)}</div>
        ${m.nombre ? `<div class="text-[10px] truncate max-w-full px-1">${esc(m.nombre)}</div>` : ''}
        <div class="text-[11px] font-bold mt-0.5">${ocupada ? FK.usd(totalMesa(m)) : 'Libre'}</div>
        ${admin && !ocupada ? '<button class="mesa-del" title="Eliminar mesa">&times;</button>' : ''}`;
      plano.appendChild(t);
      enlazarArrastre(t, m, admin);
    });
  };

  function enlazarArrastre(tile, mesa, admin) {
    let ini = null, movido = false;
    tile.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.mesa-del')) return;
      ini = { x: e.clientX, y: e.clientY, l: tile.offsetLeft, t: tile.offsetTop };
      movido = false;
      tile.setPointerCapture(e.pointerId);
    });
    tile.addEventListener('pointermove', (e) => {
      if (!ini || !admin) return;
      const dx = e.clientX - ini.x, dy = e.clientY - ini.y;
      if (!movido && Math.hypot(dx, dy) < 6) return;
      movido = true;
      tile.classList.add('mesa-arrastrando');
      const plano = $('mesas-plano');
      tile.style.left = Math.min(Math.max(0, ini.l + dx), plano.clientWidth - tile.offsetWidth) + 'px';
      tile.style.top = Math.min(Math.max(0, ini.t + dy), plano.clientHeight - tile.offsetHeight) + 'px';
    });
    tile.addEventListener('pointerup', () => {
      if (!ini) return;
      ini = null;
      tile.classList.remove('mesa-arrastrando');
      if (movido) { mesa.x = tile.offsetLeft; mesa.y = tile.offsetTop; FK.store.save(); }
      else abrirCuentaMesa(mesa);
    });
    const del = tile.querySelector('.mesa-del');
    if (del) del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (await FK.confirmar(`¿Eliminar la mesa ${mesa.numero}?`, { titulo: 'Eliminar mesa', ok: 'Eliminar', peligro: true })) {
        FK.emp().mesas = FK.emp().mesas.filter(x => x !== mesa); FK.store.saveNow(); render.mesas();
      }
    });
  }

  const ORDEN_CAT = { entrada: 0, plato: 1, bebida: 2, adicional: 3 };
  function renderProductosMesa() {
    const q = FK.norm($('cm-search').value.trim());
    // Mesas: platos y productos vendibles (bebidas, etc.); los servicios no se piden a una mesa.
    const lista = FK.emp().productos.filter(p => FK.vendible(p) && FK.tipoItem(p) !== 'SERVICIO' && (!q || FK.norm(p.nombre).includes(q) || FK.norm(p.codigo).includes(q) || FK.norm(p.categoria).includes(q)))
      .sort((a, b) => (ORDEN_CAT[a.categoriaProducto] ?? 9) - (ORDEN_CAT[b.categoriaProducto] ?? 9) || a.nombre.localeCompare(b.nombre));
    $('cm-products-grid').innerHTML = lista.length ? lista.map(p => `<button data-pid="${p.id}" ${p.agotado ? 'disabled' : ''} class="bg-gray-50 hover:bg-primary/5 border border-gray-100 rounded-xl p-2 text-left transition active:scale-95 ${p.agotado ? 'opacity-40' : ''}">
        <div class="text-xs font-semibold text-dark333 leading-tight line-clamp-2">${esc(p.nombre)}</div>
        <div class="text-xs font-bold text-teal mt-1">${FK.usd(p.precio)}</div></button>`).join('')
      : '<div class="col-span-3 text-center text-sm text-greym py-4">Sin productos. Agrégalos en Inventario.</div>';
  }

  function renderPedidoMesa() {
    const m = mesaActual; if (!m) return;
    m.pedido = m.pedido || [];
    $('cm-items').innerHTML = m.pedido.map((i, idx) => `<div class="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
        <div class="flex-1 min-w-0"><div class="text-sm font-semibold text-dark333 truncate">${esc(i.nombre)}</div>
          <div class="text-[11px] ${i.enviado >= i.cantidad ? 'text-teal' : 'text-amber-600'}">${i.enviado >= i.cantidad ? '✓ En cocina' : i.enviado > 0 ? `${i.enviado} en cocina · ${i.cantidad - i.enviado} por enviar` : 'Por enviar a cocina'}</div></div>
        <div class="flex items-center gap-1">
          <button data-act="menos" data-idx="${idx}" class="w-6 h-6 rounded-lg bg-white border border-gray-200 font-bold leading-none">−</button>
          <span class="w-6 text-center text-sm font-semibold">${i.cantidad}</span>
          <button data-act="mas" data-idx="${idx}" class="w-6 h-6 rounded-lg bg-white border border-gray-200 font-bold leading-none">+</button></div>
        <div class="text-sm font-bold w-16 text-right">${FK.usd(i.cantidad * i.precio)}</div>
        <button data-act="del" data-idx="${idx}" class="text-greym hover:text-accent text-lg leading-none px-1">&times;</button></div>`).join('');
    $('cm-empty').classList.toggle('hidden', m.pedido.length > 0);
    const t = totalMesa(m);
    $('cm-subtotal').textContent = FK.usd(t);
    $('cm-total').textContent = FK.usd(t);
    $('cm-total-bs').textContent = FK.tasa() ? FK.bs(t * FK.tasa()) : '';
  }

  function abrirCuentaMesa(m) {
    mesaActual = m;
    $('cuenta-mesa-title').textContent = `Mesa ${m.numero}${m.nombre ? ' · ' + m.nombre : ''}`;
    $('cm-search').value = '';
    const cli = m.clienteId ? FK.emp().clientes.find(c => c.id === m.clienteId) : null;
    $('cm-cliente-search').value = cli ? cli.nombre : '';
    $('cm-metodo-pago').value = '';
    renderProductosMesa();
    renderPedidoMesa();
    FK.openModal('modal-cuenta-mesa');
  }

  function guardarMesa() {
    const m = mesaActual;
    if (m.pedido.length && !m.abiertaDesde) m.abiertaDesde = new Date().toISOString();
    if (!m.pedido.length) m.abiertaDesde = null;
    FK.store.save();
    renderPedidoMesa();
    if (FK.tabActual() === 'mesas') render.mesas();
  }

  function ordenarMesa() {
    const m = mesaActual; if (!m) return;
    const nuevos = m.pedido.filter(i => i.cantidad > (i.enviado || 0)).map(i => ({ nombre: i.nombre, cantidad: i.cantidad - (i.enviado || 0) }));
    if (!nuevos.length) return FK.toast('No hay ítems nuevos para enviar a cocina', 'error');
    ultimaComanda = { mesa: `Mesa ${m.numero}${m.nombre ? ' · ' + m.nombre : ''}`, items: nuevos, mesero: FK.sesion.usuario.usuario, fecha: new Date().toISOString() };
    m.pedido.forEach(i => { i.enviado = i.cantidad; });
    guardarMesa();
    $('comanda-preview').innerHTML = `<div class="text-center font-bold text-sm">COMANDA</div><div class="text-center font-bold">${esc(ultimaComanda.mesa)}</div>
      <div class="text-center text-greym">${FK.fechaHora(ultimaComanda.fecha)} · ${esc(ultimaComanda.mesero)}</div><div class="border-t border-dashed border-gray-400 my-2"></div>
      ${nuevos.map(i => `<div class="font-bold text-sm">${i.cantidad} x ${esc(i.nombre)}</div>`).join('')}`;
    FK.openModal('modal-comanda');
    FK.imprimir(FK.doc.comanda(ultimaComanda), { destino: 'cocina', ancho: 58 });
  }

  async function cerrarMesa() {
    const m = mesaActual; if (!m) return;
    if (!m.pedido.length) return FK.toast('La mesa no tiene consumo', 'error');
    const metodo = $('cm-metodo-pago').value;
    if (!metodo) { FK.toast('Selecciona el método de pago', 'error'); $('cm-metodo-pago').focus(); return; }
    if (m.pedido.some(i => i.cantidad > (i.enviado || 0)) &&
      !(await FK.confirmar('Hay ítems que aún no se enviaron a cocina. ¿Facturar igualmente?', { titulo: 'Ítems sin ordenar', ok: 'Facturar' }))) return;
    const cliente = m.clienteId ? FK.emp().clientes.find(c => c.id === m.clienteId) : null;
    const items = m.pedido.map(i => ({ productoId: i.productoId, varianteId: null, nombre: i.nombre, detalle: '', cantidad: i.cantidad, precio: i.precio, subtotal: FK.r2(i.cantidad * i.precio), porPeso: false }));
    const sub = totalMesa(m);
    const v = FK.registrarVenta({ items, cliente, subtotal: sub, metodoPago: metodo, origen: 'mesa', referencia: `Mesa ${m.numero}` });
    m.pedido = []; m.clienteId = null; m.abiertaDesde = null;
    FK.store.saveNow();
    FK.closeModal('modal-cuenta-mesa');
    mesaActual = null;
    render.mesas();
    FK.postVenta(v);
  }

  // ======================= ESTACIONES (ciber) =======================
  let timerCiber = null;
  let audioCtx = null, ultimoBeep = 0;
  const restanteMs = (s) => new Date(s.inicio).getTime() + s.minutos * 60000 - Date.now();
  const mmss = (ms) => { const neg = ms < 0; ms = Math.abs(ms); const t = Math.floor(ms / 1000); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; const p = (x) => String(x).padStart(2, '0'); return (neg ? '+' : '') + (h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`); };
  const montoSesion = (s) => FK.r2(s.minutos / 60 * s.precioHora);

  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audioCtx.currentTime;
      [0, 0.25, 0.5].forEach(d => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'square'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.25, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.18);
        o.connect(g).connect(audioCtx.destination); o.start(t0 + d); o.stop(t0 + d + 0.2);
      });
    } catch (_) {}
  }

  function tickCiber() {
    const e = FK.emp(); if (!e) return;
    let sonar = false;
    e.estaciones.forEach(est => {
      const s = est.sesion; if (!s) return;
      const r = restanteMs(s);
      if (r <= 0 && !s.avisado) { s.avisado = true; FK.toast(`⏰ Se agotó el tiempo en ${est.nombre}`, 'error'); FK.store.save(); if (FK.tabActual() === 'estaciones') render.estaciones(); }
      if (r <= 0 && !s.silenciada) sonar = true;
      const el = document.querySelector(`[data-timer="${est.id}"]`);
      if (el) el.textContent = mmss(r);
    });
    if (sonar && Date.now() - ultimoBeep > 2500) { ultimoBeep = Date.now(); beep(); }
  }

  render.estaciones = () => {
    const e = FK.emp(), admin = FK.esAdmin();
    $('estaciones-grid').innerHTML = e.estaciones.length ? e.estaciones.map(est => {
      const s = est.sesion;
      const r = s ? restanteMs(s) : 0;
      const agotado = s && r <= 0;
      const estado = !s ? 'libre' : agotado ? 'agotado' : 'uso';
      return `<div class="estacion-card estacion-${estado} bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-2 animate-fadeIn">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2"><span class="text-xl">🖥️</span><span class="font-bold text-dark333">${esc(est.nombre)}</span></div>
          ${admin && !s ? `<button data-del="${est.id}" class="text-greym hover:text-accent text-lg leading-none" title="Eliminar">&times;</button>` : ''}
        </div>
        <span class="self-start text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${estado === 'libre' ? 'bg-gray-100 text-greym' : estado === 'uso' ? 'bg-teal/10 text-teal' : 'bg-accent/10 text-accent'}">${estado === 'libre' ? 'Libre' : estado === 'uso' ? 'En uso' : 'Tiempo agotado'}</span>
        ${s ? `<div class="text-3xl font-extrabold tabular-nums ${agotado ? 'text-accent' : 'text-dark333'}" data-timer="${est.id}">${mmss(r)}</div>
          <div class="text-[11px] text-greym leading-snug">${s.cliente ? esc(s.cliente) + ' · ' : ''}${s.minutos} min · ${FK.usd(montoSesion(s))}<br>Desde ${FK.hora(s.inicio)}</div>
          <div class="grid grid-cols-2 gap-2 mt-1">
            <button data-mas="${est.id}" class="bg-primary/10 text-primary text-xs font-bold py-2 rounded-lg hover:bg-primary/20 transition">+15 min</button>
            <button data-cobrar="${est.id}" class="bg-teal text-white text-xs font-bold py-2 rounded-lg hover:bg-teal/90 transition">Cobrar</button>
          </div>
          ${agotado && !s.silenciada ? `<button data-silenciar="${est.id}" class="text-xs font-semibold text-accent hover:underline">🔕 Silenciar alarma</button>` : ''}`
        : `<div class="text-3xl font-extrabold text-gray-200">--:--</div>
          <button data-iniciar="${est.id}" class="mt-1 bg-primary text-white text-sm font-bold py-2 rounded-lg hover:bg-primary/90 transition active:scale-95">Iniciar sesión</button>`}
      </div>`;
    }).join('') : '<div class="col-span-full text-center text-greym text-sm py-12 bg-white rounded-2xl">Aún no hay estaciones. Usa "+ Agregar Estación".</div>';
  };

  function cobrarEstacion(est) {
    const s = est.sesion; if (!s) return;
    const monto = montoSesion(s);
    const usados = Math.max(1, Math.ceil((Date.now() - new Date(s.inicio)) / 60000));
    FK.pedirMetodoPago(`<b>${esc(est.nombre)}</b>${s.cliente ? ' · ' + esc(s.cliente) : ''}<br>${s.minutos} min contratados (${usados} min usados) · <b class="text-teal">${FK.usd(monto)}</b>${FK.tasa() ? ' · ' + FK.bs(monto * FK.tasa()) : ''}`, (metodo) => {
      if (!est.sesion) return;
      const cliente = s.cliente ? (FK.emp().clientes.find(c => FK.norm(c.nombre) === FK.norm(s.cliente)) || { id: null, nombre: s.cliente, cedula: '', correo: '' }) : null;
      const v = FK.registrarVenta({
        items: [{ productoId: null, varianteId: null, nombre: `Tiempo de uso ${est.nombre}`, detalle: `${s.minutos} min · ${FK.usd(s.precioHora)}/hora`, cantidad: 1, precio: monto, subtotal: monto, porPeso: false }],
        cliente, subtotal: monto, metodoPago: metodo, origen: 'ciber', referencia: est.nombre
      });
      FK.emp().sesionesCiber.push({ id: FK.uid(), estacion: est.nombre, cliente: s.cliente, inicio: s.inicio, fin: new Date().toISOString(), minutos: s.minutos, usados, precioHora: s.precioHora, monto, ventaId: v.id, usuario: FK.sesion.usuario.usuario });
      est.sesion = null;
      FK.store.saveNow();
      render.estaciones();
      FK.postVenta(v);
    });
  }

  function abrirHistorialCiber() {
    const lista = [...FK.emp().sesionesCiber].reverse().slice(0, 200);
    $('hist-ciber-lista').innerHTML = lista.length ? lista.map(h => `<div class="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
        <div><div class="text-sm font-semibold text-dark333">${esc(h.estacion)}${h.cliente ? ' · ' + esc(h.cliente) : ''}</div>
        <div class="text-[11px] text-greym">${FK.fecha(h.inicio)} ${FK.hora(h.inicio)}–${FK.hora(h.fin)} · ${h.minutos} min (usó ${h.usados}) · ${esc(h.usuario)}</div></div>
        <div class="text-sm font-bold text-teal">${FK.usd(h.monto)}</div></div>`).join('')
      : '<div class="text-sm text-greym text-center py-6">Aún no hay sesiones finalizadas.</div>';
    FK.openModal('modal-historial-ciber');
  }

  // ======================= USUARIOS =======================
  render.usuarios = () => {
    const e = FK.emp(), yo = FK.sesion.usuario;
    $('usuarios-tbody').innerHTML = e.usuarios.map(u => `<tr class="border-t border-gray-100">
        <td class="px-5 py-3 font-semibold text-dark333">${esc(u.usuario)}${u.id === yo.id ? ' <span class="text-[10px] text-greym font-normal">(tú)</span>' : ''}</td>
        <td class="px-5 py-3"><span class="text-xs font-semibold px-2 py-0.5 rounded-full ${u.rol === 'admin' ? 'bg-primary/10 text-primary' : u.rol === 'vendedor' ? 'bg-teal/10 text-teal' : u.rol === 'cajero' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}">${esc(FK.rolNombre(u.rol))}</span></td>
        <td class="px-5 py-3">${u.rol === 'vendedor' ? `<select data-fact="${u.id}" class="input-field" style="padding:4px 8px;font-size:12px"><option value="0" ${u.factura ? '' : 'selected'}>Solo pedidos</option><option value="1" ${u.factura ? 'selected' : ''}>Pedidos y factura</option></select>` : `<span class="text-xs text-greym">${u.rol === 'admin' ? 'Todo' : u.rol === 'cajero' ? 'Factura pedidos' : '—'}</span>`}</td>
        <td class="px-5 py-3 text-center"><span class="text-xs font-semibold ${u.activo ? 'text-teal' : 'text-accent'}">${u.activo ? '● Activo' : '● Deshabilitado'}</span></td>
        <td class="px-5 py-3 text-right whitespace-nowrap">${u.rol === 'admin' ? '<span class="text-xs text-greym">—</span>' : `
          <button data-toggle="${u.id}" class="text-xs font-semibold ${u.activo ? 'text-amber-600' : 'text-teal'} hover:underline mr-3">${u.activo ? 'Deshabilitar' : 'Habilitar'}</button>
          <button data-del="${u.id}" class="text-xs font-semibold text-accent hover:underline">Eliminar</button>`}</td></tr>`).join('');
  };

  // ======================= PROMOCIONES =======================
  render.promociones = () => {
    const lista = FK.emp().promociones;
    $('promociones-tbody').innerHTML = lista.length ? lista.map(p => `<tr class="border-t border-gray-100">
        <td class="px-5 py-3"><div class="font-mono font-bold text-dark333">${esc(p.codigo)}</div><div class="text-[11px] text-greym">${p.usos || 0} uso(s)</div></td>
        <td class="px-5 py-3 text-greym">${p.tipo === 'porcentaje' ? 'Porcentaje' : 'Valor fijo'}</td>
        <td class="px-5 py-3 font-semibold">${p.tipo === 'porcentaje' ? p.valor + '%' : FK.usd(p.valor)}</td>
        <td class="px-5 py-3 text-center"><span class="text-xs font-semibold ${p.activa ? 'text-teal' : 'text-greym'}">${p.activa ? '● Activa' : '● Inactiva'}</span></td>
        <td class="px-5 py-3 text-right whitespace-nowrap"><button data-toggle="${p.id}" class="text-xs font-semibold text-primary hover:underline mr-3">${p.activa ? 'Desactivar' : 'Activar'}</button>
          <button data-del="${p.id}" class="text-xs font-semibold text-accent hover:underline">Eliminar</button></td></tr>`).join('')
      : '<tr><td colspan="5" class="text-center text-greym py-10">Aún no hay códigos de promoción</td></tr>';
  };

  // ======================= FISCAL =======================
  render.fiscal = () => {
    const f = FK.emp().fiscal;
    $('fiscal-activo').checked = !!f.activo;
    $('fiscal-cuit').value = f.cuit || '';
    $('fiscal-ingresos-brutos').value = f.ingresosBrutos || '';
    $('fiscal-inicio-actividades').value = f.inicioActividades || '';
    $('fiscal-condicion-iva').value = f.condicionIva || 'Monotributo';
    $('fiscal-punto-venta').value = f.puntoVenta || '';
    $('fiscal-tipo-comprobante').value = f.tipoComprobante || 'C';
    $('fiscal-iva-pct').value = f.ivaPct ?? '';
  };
  function guardarFiscal() {
    const f = FK.emp().fiscal;
    Object.assign(f, {
      activo: $('fiscal-activo').checked, cuit: $('fiscal-cuit').value.trim(), ingresosBrutos: $('fiscal-ingresos-brutos').value.trim(),
      inicioActividades: $('fiscal-inicio-actividades').value.trim(), condicionIva: $('fiscal-condicion-iva').value,
      puntoVenta: parseInt($('fiscal-punto-venta').value, 10) || 1, tipoComprobante: $('fiscal-tipo-comprobante').value,
      ivaPct: FK.num($('fiscal-iva-pct').value)
    });
    FK.store.saveNow();
  }

  // (Préstamos fue reemplazado por el módulo de Créditos: js/creditos.js)

  // ======================= IMPRESORAS / CORREO / RESPALDO =======================
  async function cargarImpresoras() {
    const cfg = FK.emp().impresoras;
    let lista = [];
    if (FK.API) { try { lista = await FK.API.listarImpresoras(); } catch (_) {} }
    ['impresora-cocina', 'impresora-caja'].forEach((id, i) => {
      const sel = $(id), actual = i === 0 ? cfg.cocina : cfg.caja;
      const nombres = lista.map(p => p.name);
      sel.innerHTML = '<option value="">Sin asignar (usar diálogo de impresión)</option>' + lista.map(p => `<option value="${esc(p.name)}">${esc(p.displayName)}${p.isDefault ? ' (predeterminada)' : ''}</option>`).join('')
        + (actual && !nombres.includes(actual) ? `<option value="${esc(actual)}">${esc(actual)} (no detectada)</option>` : '');
      sel.value = actual || '';
    });
    $('impresoras-sin-detectar').textContent = FK.API
      ? 'No se detectó ninguna impresora instalada en este equipo. Instala el driver (ej. MPT2) y vuelve a buscar.'
      : 'La impresión directa solo está disponible en la aplicación de escritorio.';
    $('impresoras-sin-detectar').classList.toggle('hidden', lista.length > 0);
  }

  render.impresoras = () => {
    const e = FK.emp();
    $('impresoras-activa').checked = !!e.impresoras.activa;
    cargarImpresoras();
    const c = e.correo;
    $('correo-activo').checked = !!c.activo;
    $('correo-host').value = c.host || '';
    $('correo-puerto').value = c.puerto || '';
    $('correo-seguridad').value = c.seguridad || 'ssl';
    $('correo-usuario').value = c.usuario || '';
    $('correo-password').value = c.password || '';
    $('correo-remitente').value = c.remitente || '';
    $('emp-nombre').value = e.nombre;
    $('emp-rif').value = e.rif || '';
    $('emp-telefono').value = e.telefono || '';
    $('emp-logo').value = '';
    $('emp-codigo').textContent = e.codigo;
    $('emp-rubro').textContent = FK.cat().nombre || '';
    pintarSelectorCategoria();
    pintarFuncionesSistema();
  };

  function pintarSelectorCategoria() {
    const sel = $('emp-categoria');
    const actual = FK.emp().categoria || 'general';
    sel.innerHTML = Object.entries(window.FACTURAK_CATEGORIAS || {})
      .map(([clave, c]) => `<option value="${esc(clave)}" ${clave === actual ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');
  }

  function pintarFuncionesSistema() {
    $('emp-modulos-lista').innerHTML = FK.MODULOS.map((m) => `
      <label class="flex items-center gap-2 text-sm text-dark333 cursor-pointer">
        <input type="checkbox" data-modulo="${m.clave}" class="rounded accent-teal" ${FK.tieneModulo(m.clave) ? 'checked' : ''}>
        ${esc(m.label)}
      </label>`).join('');
    $('emp-funciones-lista').innerHTML = FK.FUNCIONES_TOGGLEABLES.map((f) => `
      <label class="flex items-center gap-2 text-sm text-dark333 cursor-pointer">
        <input type="checkbox" data-funcion="${f.clave}" class="rounded accent-teal" ${FK.tiene(f.clave) ? 'checked' : ''}>
        ${esc(f.label)}
      </label>`).join('');
  }

  function leerCorreoForm() {
    return {
      activo: $('correo-activo').checked, host: $('correo-host').value.trim(), puerto: parseInt($('correo-puerto').value, 10) || 465,
      seguridad: $('correo-seguridad').value, usuario: $('correo-usuario').value.trim(), password: $('correo-password').value,
      remitente: $('correo-remitente').value.trim()
    };
  }

  // ======================= ENLACES =======================
  function init() {
    // Método de pago genérico
    $('mpg-confirmar').onclick = () => {
      const m = $('mpg-select').value;
      if (!m) return FK.toast('Selecciona un método de pago', 'error');
      FK.closeModal('modal-metodo-pago-generico');
      const cb = mpgCallback; mpgCallback = null;
      if (cb) cb(m);
    };

    // Mesas
    $('btn-nueva-mesa').onclick = () => {
      $('form-nueva-mesa').reset();
      const usados = FK.emp().mesas.map(m => +m.numero);
      let n = 1; while (usados.includes(n)) n++;
      $('nm-numero').value = n;
      FK.openModal('modal-nueva-mesa');
      FK.enfocar('nm-nombre');
    };
    $('form-nueva-mesa').onsubmit = (ev) => {
      ev.preventDefault();
      const e = FK.emp();
      const numero = parseInt($('nm-numero').value, 10);
      if (!(numero > 0)) return FK.toast('Número de mesa no válido', 'error');
      if (e.mesas.some(m => +m.numero === numero)) return FK.toast('Ya existe una mesa con ese número', 'error');
      const i = e.mesas.length, W = $('mesas-plano').clientWidth || 800;
      const porFila = Math.max(1, Math.floor((W - 20) / 124));
      e.mesas.push({ id: FK.uid(), numero, nombre: $('nm-nombre').value.trim(), x: 20 + (i % porFila) * 124, y: 20 + Math.floor(i / porFila) * 124, pedido: [], clienteId: null });
      FK.store.saveNow();
      FK.closeModal('modal-nueva-mesa');
      render.mesas();
      FK.toast(`Mesa ${numero} creada`);
    };
    $('cm-search').addEventListener('input', renderProductosMesa);
    $('cm-products-grid').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-pid]'); if (!b || !mesaActual) return;
      const p = FK.emp().productos.find(x => x.id === b.dataset.pid); if (!p) return;
      const ex = mesaActual.pedido.find(i => i.productoId === p.id && i.cantidad > (i.enviado || 0));
      if (ex) ex.cantidad++;
      else mesaActual.pedido.push({ productoId: p.id, nombre: p.nombre, precio: Number(p.precio) || 0, cantidad: 1, enviado: 0 });
      guardarMesa();
    });
    $('cm-items').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]'); if (!b || !mesaActual) return;
      const i = mesaActual.pedido[+b.dataset.idx]; if (!i) return;
      if (b.dataset.act === 'mas') i.cantidad++;
      else if (b.dataset.act === 'menos') { i.cantidad--; if (i.enviado > i.cantidad) i.enviado = i.cantidad; if (i.cantidad <= 0) mesaActual.pedido.splice(+b.dataset.idx, 1); }
      else mesaActual.pedido.splice(+b.dataset.idx, 1);
      guardarMesa();
    });
    FK.buscadorClientes('cm-cliente-search', 'cm-cliente-results', (c) => {
      if (!mesaActual) return;
      mesaActual.clienteId = c.id; $('cm-cliente-search').value = c.nombre; FK.store.save();
    });
    $('cm-cliente-search').addEventListener('input', () => { if (mesaActual) mesaActual.clienteId = null; });
    $('btn-ordenar').onclick = ordenarMesa;
    $('btn-cerrar-cuenta').onclick = cerrarMesa;
    $('btn-cerrar-modal-comanda').onclick = () => FK.closeModal('modal-comanda');
    $('btn-comanda-imprimir').onclick = () => ultimaComanda && FK.imprimir(FK.doc.comanda(ultimaComanda), { destino: 'cocina', ancho: 58 });
    let rzm;
    window.addEventListener('resize', () => { clearTimeout(rzm); rzm = setTimeout(() => { if (FK.emp() && FK.tabActual() === 'mesas') render.mesas(); }, 200); });

    // Estaciones
    $('btn-nueva-estacion').onclick = () => { $('form-nueva-estacion').reset(); $('ne-nombre').value = `PC ${FK.emp().estaciones.length + 1}`; FK.openModal('modal-nueva-estacion'); setTimeout(() => $('ne-nombre').select(), 50); };
    $('form-nueva-estacion').onsubmit = (ev) => {
      ev.preventDefault();
      const nombre = $('ne-nombre').value.trim();
      if (!nombre) return;
      if (FK.emp().estaciones.some(s => FK.norm(s.nombre) === FK.norm(nombre))) return FK.toast('Ya existe una estación con ese nombre', 'error');
      FK.emp().estaciones.push({ id: FK.uid(), nombre, sesion: null });
      FK.store.saveNow(); FK.closeModal('modal-nueva-estacion'); render.estaciones();
    };
    $('btn-historial-ciber').onclick = abrirHistorialCiber;
    $('estaciones-grid').addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-iniciar],[data-mas],[data-cobrar],[data-silenciar],[data-del]'); if (!b) return;
      const e = FK.emp();
      const id = b.dataset.iniciar || b.dataset.mas || b.dataset.cobrar || b.dataset.silenciar || b.dataset.del;
      const est = e.estaciones.find(x => x.id === id); if (!est) return;
      if (b.dataset.iniciar) {
        $('form-sesion-ciber').reset();
        $('sc-estacion-id').value = est.id;
        $('sesion-ciber-title').textContent = 'Iniciar sesión · ' + est.nombre;
        $('sc-minutos').value = 60;
        $('sc-precio-hora').value = e.ciberPrecioHora ?? 1;
        FK.openModal('modal-sesion-ciber');
        FK.enfocar('sc-cliente');
      } else if (b.dataset.mas) {
        est.sesion.minutos += 15; est.sesion.silenciada = false; est.sesion.avisado = restanteMs(est.sesion) <= 0;
        FK.store.saveNow(); render.estaciones(); FK.toast(`+15 min en ${est.nombre}`);
      } else if (b.dataset.cobrar) cobrarEstacion(est);
      else if (b.dataset.silenciar) { est.sesion.silenciada = true; FK.store.save(); render.estaciones(); }
      else if (await FK.confirmar(`¿Eliminar la estación "${est.nombre}"?`, { titulo: 'Eliminar estación', ok: 'Eliminar', peligro: true })) {
        e.estaciones = e.estaciones.filter(x => x !== est); FK.store.saveNow(); render.estaciones();
      }
    });
    $('form-sesion-ciber').onsubmit = (ev) => {
      ev.preventDefault();
      const e = FK.emp();
      const est = e.estaciones.find(x => x.id === $('sc-estacion-id').value); if (!est) return;
      const minutos = parseInt($('sc-minutos').value, 10), precioHora = FK.r2(FK.num($('sc-precio-hora').value));
      if (!(minutos > 0)) return FK.toast('Minutos no válidos', 'error');
      e.ciberPrecioHora = precioHora;
      est.sesion = { cliente: $('sc-cliente').value.trim(), inicio: new Date().toISOString(), minutos, precioHora, silenciada: false, avisado: false };
      FK.store.saveNow(); FK.closeModal('modal-sesion-ciber'); render.estaciones();
      // Desbloquea el audio con este gesto del usuario
      try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (_) {}
    };

    // Usuarios
    $('form-nuevo-usuario').onsubmit = async (ev) => {
      ev.preventDefault();
      const e = FK.emp();
      const usuario = $('nu-usuario').value.trim().toLowerCase(), pass = $('nu-password').value, rol = $('nu-rol').value;
      if (!/^[a-z0-9._-]{3,}$/.test(usuario)) return FK.toast('Usuario: mínimo 3 caracteres (letras, números, punto o guion)', 'error');
      if (pass.length < 3) return FK.toast('La contraseña debe tener al menos 3 caracteres', 'error');
      if (e.usuarios.some(u => u.usuario.toLowerCase() === usuario)) return FK.toast('Ese usuario ya existe', 'error');
      e.usuarios.push(await FK.crearUsuario(usuario, pass, rol, $('nu-factura').value === '1'));
      FK.store.saveNow(); $('form-nuevo-usuario').reset(); render.usuarios();
      FK.toast(`Perfil "${usuario}" creado`);
    };
    $('nu-rol').onchange = () => $('nu-factura').classList.toggle('hidden', $('nu-rol').value !== 'vendedor');
    $('usuarios-tbody').addEventListener('change', (ev) => {
      const sel = ev.target.closest('[data-fact]'); if (!sel) return;
      const u = FK.emp().usuarios.find(x => x.id === sel.dataset.fact); if (!u) return;
      u.factura = sel.value === '1'; FK.store.saveNow();
      FK.toast(u.factura ? `${u.usuario}: tomará pedidos y también facturará` : `${u.usuario}: solo enviará pedidos a la caja`);
    });
    $('usuarios-tbody').addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-toggle],[data-del]'); if (!b) return;
      const e = FK.emp(); const u = e.usuarios.find(x => x.id === (b.dataset.toggle || b.dataset.del));
      if (!u || u.rol === 'admin') return;
      if (b.dataset.toggle) { u.activo = !u.activo; FK.store.saveNow(); render.usuarios(); FK.toast(`Perfil ${u.activo ? 'habilitado' : 'deshabilitado'}`); }
      else if (await FK.confirmar(`¿Eliminar el perfil "${u.usuario}"?`, { titulo: 'Eliminar perfil', ok: 'Eliminar', peligro: true })) {
        e.usuarios = e.usuarios.filter(x => x !== u); FK.store.saveNow(); render.usuarios();
      }
    });

    // Promociones
    $('form-nueva-promocion').onsubmit = async (ev) => {
      ev.preventDefault();
      const e = FK.emp();
      const codigo = $('np-codigo').value.trim().toUpperCase().replace(/\s+/g, '');
      const tipo = $('np-tipo').value, valor = FK.r2(FK.num($('np-valor').value)), clave = $('np-clave').value;
      if (!codigo) return FK.toast('Escribe el código', 'error');
      if (e.promociones.some(p => p.codigo === codigo)) return FK.toast('Ese código ya existe', 'error');
      if (!(valor > 0) || (tipo === 'porcentaje' && valor > 100)) return FK.toast('Valor de descuento no válido', 'error');
      if (clave.length < 4) return FK.toast('La clave de aprobación debe tener al menos 4 caracteres', 'error');
      const sal = FK.nuevaSal();
      e.promociones.push({ id: FK.uid(), codigo, tipo, valor, sal, claveHash: await FK.hash(clave, sal), activa: true, usos: 0, creada: new Date().toISOString() });
      FK.store.saveNow(); $('form-nueva-promocion').reset(); render.promociones(); FK.toast(`Código ${codigo} creado`);
    };
    $('promociones-tbody').addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-toggle],[data-del]'); if (!b) return;
      const e = FK.emp(); const p = e.promociones.find(x => x.id === (b.dataset.toggle || b.dataset.del)); if (!p) return;
      if (b.dataset.toggle) { p.activa = !p.activa; FK.store.saveNow(); render.promociones(); }
      else if (await FK.confirmar(`¿Eliminar el código ${p.codigo}?`, { titulo: 'Eliminar promoción', ok: 'Eliminar', peligro: true })) {
        e.promociones = e.promociones.filter(x => x !== p); FK.store.saveNow(); render.promociones();
      }
    });

    // Fiscal
    $('form-fiscal').onsubmit = (ev) => { ev.preventDefault(); guardarFiscal(); FK.toast('Configuración fiscal guardada'); };
    $('fiscal-activo').addEventListener('change', () => { guardarFiscal(); FK.toast($('fiscal-activo').checked ? 'Ticket térmico 58mm activado' : 'Ticket térmico 58mm desactivado'); });

    // Impresoras
    $('form-impresoras').onsubmit = (ev) => {
      ev.preventDefault();
      Object.assign(FK.emp().impresoras, { activa: $('impresoras-activa').checked, cocina: $('impresora-cocina').value, caja: $('impresora-caja').value });
      FK.store.saveNow(); FK.toast('Configuración de impresoras guardada');
    };
    $('impresoras-activa').addEventListener('change', () => { FK.emp().impresoras.activa = $('impresoras-activa').checked; FK.store.saveNow(); });
    $('btn-recargar-impresoras').onclick = async () => { await cargarImpresoras(); FK.toast('Lista de impresoras actualizada'); };
    $('btn-probar-impresora').onclick = () => {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{width:58mm;margin:0;padding:3mm;font-family:Consolas,monospace;font-size:12px}@page{size:58mm auto;margin:0}</style></head><body>
        <div style="text-align:center;font-weight:bold">PRUEBA DE IMPRESIÓN</div><div style="text-align:center">${esc(FK.emp().nombre)}</div><div style="text-align:center">${FK.fechaHora(new Date().toISOString())}</div><div>--------------------------</div><div>FacturaK funciona ✓</div></body></html>`;
      Object.assign(FK.emp().impresoras, { activa: $('impresoras-activa').checked, cocina: $('impresora-cocina').value, caja: $('impresora-caja').value });
      FK.imprimir(html, { destino: 'caja', ancho: 58 });
    };

    // Correo
    $('form-correo').onsubmit = (ev) => { ev.preventDefault(); FK.emp().correo = leerCorreoForm(); FK.store.saveNow(); FK.toast('Configuración de correo guardada'); };
    $('correo-seguridad').addEventListener('change', () => { $('correo-puerto').value = $('correo-seguridad').value === 'ssl' ? 465 : 587; });
    $('btn-probar-correo').onclick = async () => {
      if (!FK.API) return FK.toast('El envío de correo solo funciona en la aplicación de escritorio', 'error');
      const cfg = leerCorreoForm();
      if (!cfg.host || !cfg.usuario || !cfg.password) return FK.toast('Completa servidor, usuario y contraseña', 'error');
      const btn = $('btn-probar-correo'); btn.disabled = true; btn.textContent = 'Enviando…';
      const r = await FK.API.enviarCorreo({ smtp: { ...cfg, nombreRemitente: FK.emp().nombre }, para: cfg.remitente || cfg.usuario, asunto: 'Prueba de correo - FacturaK', html: '<p>¡La configuración de correo de <b>FacturaK</b> funciona correctamente!</p>' });
      btn.disabled = false; btn.textContent = 'Enviar correo de prueba';
      FK.toast(r.ok ? `Correo de prueba enviado a ${cfg.remitente || cfg.usuario}` : 'Falló: ' + r.error, r.ok ? 'ok' : 'error');
    };

    // Empresa
    $('form-empresa').onsubmit = async (ev) => {
      ev.preventDefault();
      const e = FK.emp();
      const nombre = $('emp-nombre').value.trim();
      if (!nombre) return FK.toast('El nombre es obligatorio', 'error');
      const marcados = [...document.querySelectorAll('#emp-modulos-lista [data-modulo]')];
      if (marcados.length && !marcados.some((c) => c.checked)) return FK.toast('Deja al menos un módulo principal activado', 'error');
      let logo = null;
      try { logo = await FK.leerImagen($('emp-logo').files[0], 480); } catch (_) { return FK.toast('El logo no es una imagen válida', 'error'); }
      e.nombre = nombre; e.rif = $('emp-rif').value.trim(); e.telefono = $('emp-telefono').value.trim(); if (logo) e.logo = logo;
      e.categoria = $('emp-categoria').value;
      // Mapa explícito on/off por función: tiene prioridad sobre el rubro
      // (ver FK.tiene en core.js), así que esto SÍ permite apagar algo que
      // el rubro trae por defecto, no solo prender cosas extra.
      const nuevoOverride = { ...(e.funcionesOverride || {}) };
      document.querySelectorAll('#emp-funciones-lista [data-funcion]').forEach((chk) => {
        nuevoOverride[chk.dataset.funcion] = chk.checked;
      });
      e.funcionesOverride = nuevoOverride;
      e.modulos = Object.fromEntries(marcados.map((c) => [c.dataset.modulo, c.checked]));
      FK.store.saveNow();
      FK.configurarShell();
      pintarSelectorCategoria();
      pintarFuncionesSistema();
      if (e.logo) { $('app-logo-img').src = e.logo; FK.show('app-logo-img'); FK.hide('app-empresa-nombre'); }
      else $('app-empresa-nombre').textContent = e.nombre;
      FK.toast('Datos de la empresa y funciones actualizadas');
    };
    $('btn-quitar-logo').onclick = () => {
      const e = FK.emp(); e.logo = null; FK.store.saveNow();
      FK.hide('app-logo-img'); $('app-empresa-nombre').textContent = e.nombre; FK.show('app-empresa-nombre');
      FK.toast('Logo eliminado');
    };

    // Respaldo
    $('btn-exportar-datos').onclick = async () => {
      FK.store.saveNow();
      const json = JSON.stringify(FK.store.data, null, 1);
      if (FK.API) { const ruta = await FK.API.exportarDatos(json); if (ruta) FK.toast('Respaldo guardado'); }
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = 'FacturaK-respaldo.json'; a.click(); }
    };
    $('btn-importar-datos').onclick = async () => {
      if (!FK.API) return FK.toast('Disponible en la aplicación de escritorio', 'error');
      const txt = await FK.API.importarDatos(); if (!txt) return;
      let d; try { d = JSON.parse(txt); } catch (_) { return FK.toast('El archivo no es un respaldo válido', 'error'); }
      if (!d || !Array.isArray(d.empresas)) return FK.toast('El archivo no es un respaldo de FacturaK', 'error');
      if (!(await FK.confirmar(`Se reemplazarán TODOS los datos actuales por los del respaldo (${d.empresas.length} empresa(s)). Esta acción no se puede deshacer.`, { titulo: 'Restaurar respaldo', ok: 'Restaurar', peligro: true }))) return;
      FK.store.data = d; FK.store.saveNow();
      setTimeout(() => location.reload(), 400);
    };
    $('btn-abrir-carpeta-datos').onclick = () => FK.API ? FK.API.abrirCarpetaDatos() : FK.toast('Disponible en la aplicación de escritorio', 'error');
    $('btn-abrir-carpeta-facturas').onclick = () => FK.API ? FK.API.abrirCarpetaFacturas() : FK.toast('Disponible en la aplicación de escritorio', 'error');

    // Ciclo de vida de la sesión
    FK.alEntrar = () => {
      clearInterval(timerCiber);
      if (FK.tiene('estaciones')) timerCiber = setInterval(tickCiber, 1000);
    };
    FK.alSalir = () => { clearInterval(timerCiber); timerCiber = null; mesaActual = null; };
  }

  const initBase = FK.app.init;
  FK.app.init = () => { initBase(); init(); };
})();
