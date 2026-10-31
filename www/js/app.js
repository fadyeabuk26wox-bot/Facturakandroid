// FacturaK — aplicación principal: navegación, caja, POS, inventario, clientes y reportes.
(function () {
  'use strict';
  const FK = window.FK;
  const $ = FK.$;
  const esc = FK.esc;

  const TITULOS = {
    pos: 'Punto de Venta', mesas: 'Mesas', estaciones: 'Estaciones', inventario: 'Inventario', clientes: 'Clientes',
    pedidos: 'Pedidos', reportes: 'Reportes', usuarios: 'Usuarios', promociones: 'Promociones', fiscal: 'Configuración Fiscal',
    creditos: 'Créditos y Cobranza', apariencia: 'Apariencia', impresoras: 'Impresoras, correo y respaldo',
    sync: 'Sincronización en la nube', red: 'Red y dispositivos', mensajes: 'Mensajes de WhatsApp', api: 'API e Integraciones'
  };
  const render = FK.render = {};
  let tabActual = 'pos';
  FK.tabActual = () => tabActual;

  // ======================= NAVEGACIÓN =======================
  function tabsPermitidas() {
    const rol = FK.rol();
    if (rol === 'autoservicio') return ['pos'];
    const M = FK.tieneModulo;
    if (rol === 'cajero') return [...(M('pos') ? ['pedidos', 'pos', 'clientes'] : []), 'apariencia'];   // recibe pedidos y factura
    const t = [];
    if (M('pos')) t.push('pos', 'pedidos');
    if (FK.tiene('mesas')) t.push('mesas');
    if (FK.tiene('estaciones')) t.push('estaciones');
    if (M('inventario')) t.push('inventario');
    if (M('pos')) t.push('clientes');
    if (M('reportes')) t.push('reportes');
    if (FK.tiene('creditos')) t.push('creditos');
    if (rol === 'admin') {
      if (M('usuarios')) t.push('usuarios');
      if (M('pos')) t.push('promociones', 'fiscal');
      t.push('impresoras', 'sync', 'red');
      if (M('whatsapp')) t.push('mensajes');
      t.push('api');
    }
    t.push('apariencia');
    return t;
  }
  function irTab(tab) {
    const permitidas = tabsPermitidas();
    if (!permitidas.includes(tab)) tab = permitidas[0] || 'pos';
    if (tabActual === 'apariencia' && tab !== 'apariencia' && FK.tema) FK.tema.alSalirDeApariencia();
    tabActual = tab;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active-nav', b.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== 'tab-' + tab));
    $('page-title').textContent = TITULOS[tab] || 'FacturaK';
    if (render[tab]) render[tab]();
    if (FK.carritoFlotante) FK.carritoFlotante();
    const main = document.querySelector('main'); if (main) main.scrollTop = 0;
  }
  FK.irTab = irTab;

  function configurarShell() {
    const e = FK.emp(), u = FK.sesion.usuario;
    const permitidas = tabsPermitidas();
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('hidden', !permitidas.includes(b.dataset.tab)));
    if (e.logo) { $('app-logo-img').src = e.logo; FK.show('app-logo-img'); FK.hide('app-empresa-nombre'); }
    else { FK.hide('app-logo-img'); $('app-empresa-nombre').textContent = e.nombre; FK.show('app-empresa-nombre'); }
    $('sidebar-rol-badge').innerHTML = `<div class="text-white/90 font-semibold truncate">${esc(u.usuario)}</div>
      <div>${esc(FK.rolNombre(u.rol))} · ${esc(e.codigo)}</div><div class="truncate">${esc(FK.cat().nombre || '')}</div>`;
    document.title = `FacturaK — ${e.nombre}`;
    aplicarModulos();
  }
  FK.configurarShell = configurarShell;

  // Oculta/muestra las piezas sueltas que dependen de un módulo apagado
  // (las pestañas ya las filtra tabsPermitidas).
  function aplicarModulos() {
    FK.invalidarIndice();
    const termica = FK.tieneModulo('termica'), wa = FK.tieneModulo('whatsapp');
    const imp = $('btn-preview-imprimir'); if (imp) imp.classList.toggle('hidden', !termica);
    const chk = $('chk-imprimir');
    if (chk) { chk.closest('label').classList.toggle('hidden', !termica); if (!termica) chk.checked = false; }
    const bw = $('btn-preview-whatsapp'); if (bw) bw.classList.toggle('hidden', !wa);
  }

  function actualizarTasaBadge() {
    const c = FK.caja();
    if (c) { $('tasa-badge-valor').textContent = FK.bs(c.tasa); FK.show('btn-tasa-badge'); }
    else FK.hide('btn-tasa-badge');
  }
  FK.actualizarTasaBadge = actualizarTasaBadge;

  // ======================= SESIÓN Y CAJA =======================
  function entrar(emp, u) {
    FK.sesion.empresa = emp; FK.sesion.usuario = u;
    FK.hide('auth-screen');
    pos.reset();
    if (FK.tema) FK.tema.aplicarActual();
    configurarShell();
    // un vendedor que solo toma pedidos no necesita abrir caja
    if (FK.caja() || (FK.puedeFacturar && !FK.puedeFacturar())) mostrarApp(); else mostrarCaja();
  }

  function mostrarCaja() {
    FK.hide('app-shell');
    FK.show('caja-screen', 'flex');
    const auto = FK.rol() === 'autoservicio';
    $('caja-apertura-form-wrap').classList.toggle('hidden', auto);
    $('caja-espera-wrap').classList.toggle('hidden', !auto);
    const ultima = [...FK.emp().cajas].reverse()[0];
    $('caja-tasa').value = ultima ? ultima.tasa : '';
    if (!auto) FK.enfocar('caja-tasa');
  }

  function mostrarApp() {
    FK.hide('caja-screen');
    FK.show('app-shell', 'flex');
    actualizarTasaBadge();
    const def = FK.rol() === 'cajero' ? 'pedidos' : FK.rol() !== 'autoservicio' && FK.tiene('mesas') ? 'mesas' : 'pos';
    irTab(def);
    if (FK.alEntrar) FK.alEntrar();
    if (FK.actualizarBadgeCreditos) FK.actualizarBadgeCreditos();
  }

  function salir() {
    FK.store.saveNow();
    FK.closeModals();
    if (FK.alSalir) FK.alSalir();
    FK.sesion.empresa = null; FK.sesion.usuario = null;
    FK.auth.mostrar();
  }

  function abrirOpcionesCaja() {
    if (FK.rol() === 'autoservicio') return FK.toast('Solo Admin o Vendedor pueden gestionar la caja', 'error');
    const c = FK.caja(); if (!c) return;
    const ventas = FK.emp().ventas.filter(v => v.cajaId === c.id);
    const total = ventas.reduce((s, v) => s + v.total, 0);
    $('co-info').innerHTML = `
      <div class="flex justify-between"><span class="text-greym">Abierta por</span><b>${esc(c.abiertaPor)}</b></div>
      <div class="flex justify-between"><span class="text-greym">Desde</span><b>${FK.fechaHora(c.fechaApertura)}</b></div>
      <div class="flex justify-between"><span class="text-greym">Tasa actual</span><b>${FK.bs(c.tasa)}</b></div>
      <div class="flex justify-between"><span class="text-greym">Ventas en esta caja</span><b>${ventas.length} · ${FK.usd(total)}</b></div>`;
    $('co-tasa').value = c.tasa;
    FK.openModal('modal-caja-opciones');
  }

  function abrirResumenCierre() {
    const c = FK.caja(); if (!c) return;
    const ventas = FK.emp().ventas.filter(v => v.cajaId === c.id);
    const total = FK.r2(ventas.reduce((s, v) => s + v.total, 0));
    $('cierre-total').textContent = FK.usd(total);
    $('cierre-cantidad').textContent = ventas.length;
    let extra = $('cierre-creditos');
    if (!extra) { extra = document.createElement('div'); extra.id = 'cierre-creditos'; extra.className = 'text-xs bg-gray-50 rounded-xl px-3 py-2 mb-4 flex justify-between text-greym'; $('cierre-total').closest('.grid').after(extra); }
    const cc = FK.creditos && FK.tiene('creditos') ? FK.creditos.cobrosDeCaja(c.id) : null;
    extra.classList.toggle('hidden', !cc || !cc.n);
    if (cc) extra.innerHTML = `<span>Cobros de créditos (iniciales y abonos): ${cc.n}</span><b class="text-dark333">${FK.usd(cc.total)}</b>`;
    FK.closeModal('modal-caja-opciones');
    FK.openModal('modal-resumen-caja');
    const canvasWrap = $('grafico-cierre-canvas').parentElement;
    if (!ventas.length) { FK.show('cierre-vacio'); canvasWrap.classList.add('hidden'); }
    else {
      FK.hide('cierre-vacio'); canvasWrap.classList.remove('hidden');
      const porMetodo = {};
      ventas.forEach(v => { porMetodo[v.metodoPago] = (porMetodo[v.metodoPago] || 0) + v.total; });
      const keys = Object.keys(porMetodo);
      requestAnimationFrame(() => FKChart.barChart($('grafico-cierre-canvas'), {
        labels: keys.map(k => FK.metodoNombre(k).split(' (')[0]), values: keys.map(k => FK.r2(porMetodo[k])),
        colors: [FK.tema.css('secundario'), FK.tema.css('primario'), '#F4A261', FK.tema.css('peligro'), '#7B61FF', '#2A9D8F', '#6B7280'], format: FK.usd
      }));
    }
    // Botón extra para cancelar (el modal no se cierra al hacer clic fuera)
    let cancelar = $('btn-cancelar-cierre-caja');
    if (!cancelar) {
      cancelar = document.createElement('button');
      cancelar.id = 'btn-cancelar-cierre-caja';
      cancelar.className = 'w-full mt-2 text-sm text-greym hover:text-primary font-semibold';
      cancelar.textContent = 'Cancelar';
      $('btn-confirmar-cierre-caja').after(cancelar);
      cancelar.onclick = () => FK.closeModal('modal-resumen-caja');
    }
  }

  function confirmarCierre() {
    const c = FK.caja(); if (!c) return;
    const ventas = FK.emp().ventas.filter(v => v.cajaId === c.id);
    c.abierta = false; c.fechaCierre = new Date().toISOString(); c.cerradaPor = FK.sesion.usuario.usuario;
    c.totalVendido = FK.r2(ventas.reduce((s, v) => s + v.total, 0)); c.facturas = ventas.length;
    FK.store.saveNow();
    FK.closeModals();
    FK.toast('Caja cerrada correctamente');
    salir();
  }

  // ======================= CLIENTES (buscador reutilizable) =======================
  FK.buscarClientes = (q) => {
    const n = FK.norm(q.trim());
    if (!n) return [];
    return FK.emp().clientes.filter(c => FK.norm(c.nombre).includes(n) || FK.norm(c.cedula).includes(n)).slice(0, 8);
  };

  FK.buscadorClientes = (inputId, resultsId, onSelect, { permitirNuevo = true } = {}) => {
    const inp = $(inputId), res = $(resultsId);
    const pintar = () => {
      const q = inp.value.trim();
      if (!q) { res.classList.add('hidden'); return; }
      const lista = FK.buscarClientes(q);
      res.innerHTML = lista.map(c => `<div data-cid="${c.id}" class="px-3 py-2 hover:bg-primary/5 cursor-pointer text-sm border-b border-gray-50">
          <div class="font-semibold text-dark333">${esc(c.nombre)}</div><div class="text-[11px] text-greym">${esc(c.cedula || 'Sin cédula')}${c.correo ? ' · ' + esc(c.correo) : ''}</div></div>`).join('')
        + (permitirNuevo ? `<div data-nuevo="1" class="px-3 py-2 hover:bg-teal/10 cursor-pointer text-sm text-teal font-semibold">＋ Registrar nuevo cliente "${esc(q)}"</div>` : '')
        + (!lista.length && !permitirNuevo ? '<div class="px-3 py-2 text-sm text-greym">Sin resultados</div>' : '');
      res.classList.remove('hidden');
    };
    inp.addEventListener('input', pintar);
    inp.addEventListener('focus', pintar);
    inp.addEventListener('blur', () => setTimeout(() => res.classList.add('hidden'), 180));
    res.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const it = e.target.closest('[data-cid],[data-nuevo]');
      if (!it) return;
      res.classList.add('hidden');
      if (it.dataset.nuevo) {
        const q = inp.value.trim();
        const pre = /^[VEJGPvejgp]?-?\d[\d.-]*$/.test(q) ? { cedula: q } : { nombre: q };
        abrirCliente(null, pre, (c) => onSelect(c));
      } else onSelect(FK.emp().clientes.find(c => c.id === it.dataset.cid));
    });
  };

  // ======================= PUNTO DE VENTA =======================
  const pos = {
    carrito: [], cliente: null, promo: null, comprador: null, pedidoId: null,
    reset() { this.carrito = []; this.cliente = null; this.promo = null; this.comprador = null; this.pedidoId = null; }
  };
  FK.pos = pos;

  const controlaStock = FK.controlaStock = () => !FK.tiene('sinStock');
  const stockDe = (p) => p.variantes && p.variantes.length ? p.variantes.reduce((s, v) => s + (Number(v.stock) || 0), 0) : Number(p.stock) || 0;
  FK.stockDe = stockDe;
  const esPeso = (p) => FK.tiene('peso') && p.tipoVenta === 'peso';
  FK.esPeso = esPeso;

  // ======================= TIPOS DE ÍTEM =======================
  // Un mismo negocio puede vender 3 tipos de ítems en el mismo ticket:
  //   PLATO (menú, con receta opcional), PRODUCTO_NORMAL (reventa con stock)
  //   y SERVICIO (sin stock, con precio variable opcional).
  const TIPOS_ITEM = {
    PLATO: { icono: '🍔', corto: 'Menú', etiqueta: 'Plato / Menú', color: 'bg-amber-100 text-amber-700', ayuda: 'Plato elaborado del menú. Puede tener receta para descontar insumos, o venderse directo.' },
    PRODUCTO_NORMAL: { icono: '📦', corto: 'Productos', etiqueta: 'Producto', color: 'bg-blue-100 text-blue-700', ayuda: 'Producto de reventa con control de stock: se descuenta solo en cada venta.' },
    SERVICIO: { icono: '✂️', corto: 'Servicios', etiqueta: 'Servicio', color: 'bg-sky-100 text-sky-700', ayuda: 'Servicio o trabajo personalizado: no descuenta stock y puede tener precio variable.' },
  };
  FK.TIPOS_ITEM = TIPOS_ITEM;
  const ORDEN_TIPOS = ['PLATO', 'PRODUCTO_NORMAL', 'SERVICIO'];
  const CAT_GASTRO = { entrada: 'Entrada', plato: 'Plato fuerte', bebida: 'Bebida', adicional: 'Adicional' };

  const tipoItem = FK.tipoItem = (p) => {
    if (p.tipoItem && TIPOS_ITEM[p.tipoItem]) return p.tipoItem;
    // Productos anteriores a los 3 tipos: en un restaurante lo que era "plato" sigue siéndolo.
    if (FK.tiene('mesas') && (p.tipoInventario || 'plato') === 'plato') return 'PLATO';
    return 'PRODUCTO_NORMAL';
  };
  // ¿Se puede vender en el POS? (los insumos de solo-receta se ocultan)
  FK.vendible = (p) => {
    if (p.activo === false) return false;
    if (p.ventaPOS != null) return !!p.ventaPOS;
    return !(p.tipoItem == null && FK.tiene('mesas') && p.tipoInventario === 'insumo');
  };
  // Descuenta stock solo si el ítem lo controla: productos sí (por defecto),
  // servicios nunca, platos solo si se configura (o vía receta).
  FK.itemControlaStock = (p) => {
    if (p.controlaStock != null) return !!p.controlaStock;
    const t = tipoItem(p);
    if (t !== 'PRODUCTO_NORMAL') return false;
    return !FK.tiene('sinStock');
  };
  const itemControlaStock = FK.itemControlaStock;

  // Productos creados antes de los 3 tipos: se les fija el tipo UNA vez al
  // cargar (según cómo estaba configurado el negocio entonces), para que
  // activar o desactivar "Mesas" después no los cambie de tipo.
  (FK.normalizadores = FK.normalizadores || []).push((e) => {
    const rub = ((window.FACTURAK_CATEGORIAS || {})[e.categoria] || {}).funciones || [];
    const ov = e.funcionesOverride || {};
    const mesas = Object.prototype.hasOwnProperty.call(ov, 'mesas') ? !!ov.mesas : (rub.includes('mesas') || (e.funcionesExtra || []).includes('mesas'));
    for (const p of e.productos || []) {
      if (p.tipoItem) continue;
      if (mesas && (p.tipoInventario || 'plato') === 'plato') p.tipoItem = 'PLATO';
      else { p.tipoItem = 'PRODUCTO_NORMAL'; if (mesas && p.tipoInventario === 'insumo' && p.ventaPOS == null) p.ventaPOS = false; }
    }
  });
  const redondeo3 = (n) => Math.round(n * 1000) / 1000;

  // Índice para el POS y el inventario: búsqueda sin recalcular textos y
  // conteo por tipo. Se reconstruye solo cuando cambia el catálogo.
  let _ix = null;
  FK.invalidarIndice = () => { _ix = null; };
  function indice() {
    const e = FK.emp();
    if (_ix && _ix.emp === e && _ix.n === e.productos.length) return _ix;
    const tipo = new Map(), busq = new Map(), porId = new Map(), vendibles = [];
    const conteoVendibles = { PLATO: 0, PRODUCTO_NORMAL: 0, SERVICIO: 0 };
    const conteoTodos = { PLATO: 0, PRODUCTO_NORMAL: 0, SERVICIO: 0 };
    for (const p of e.productos) {
      const t = tipoItem(p);
      tipo.set(p.id, t); porId.set(p.id, p); conteoTodos[t]++;
      busq.set(p.id, FK.norm([p.nombre, p.codigo, p.categoria, p.descripcion, t === 'PLATO' ? CAT_GASTRO[p.categoriaProducto] : ''].filter(Boolean).join(' ')));
      if (FK.vendible(p)) { vendibles.push(p); conteoVendibles[t]++; }
    }
    return (_ix = { emp: e, n: e.productos.length, tipo, busq, porId, vendibles, conteoVendibles, conteoTodos });
  }
  const MAX_TARJETAS = 150; // con miles de ítems no se dibujan todos: se usa el buscador

  function tabsTipoHTML(conteo, actual, attr) {
    const total = ORDEN_TIPOS.reduce((s, t) => s + conteo[t], 0);
    const chip = (clave, txt, n) => `<button type="button" ${attr}="${clave}" class="px-3.5 py-2 rounded-xl text-sm font-semibold transition ${clave === actual ? 'bg-primary text-white shadow-sm' : 'bg-white text-greym hover:bg-gray-100'}">${txt} <span class="text-[11px] opacity-70">${n}</span></button>`;
    return chip('TODOS', 'Todo', total) + ORDEN_TIPOS.map(t => chip(t, `${TIPOS_ITEM[t].icono} ${TIPOS_ITEM[t].corto}`, conteo[t])).join('');
  }

  // Lo que hay que descontar del stock por una lista de ítems vendidos:
  // el propio ítem (si controla stock) y, si es un plato con receta, sus insumos.
  FK.consumoStock = (items) => {
    const ix = indice(), out = [];
    for (const it of items) {
      const p = it.productoId && ix.porId.get(it.productoId); if (!p) continue;
      if (itemControlaStock(p)) out.push({ p, varianteId: it.varianteId || null, cantidad: it.cantidad, nombre: it.nombre });
      if (tipoItem(p) === 'PLATO' && Array.isArray(p.receta)) {
        for (const r of p.receta) {
          const ing = ix.porId.get(r.productoId);
          if (ing && itemControlaStock(ing)) out.push({ p: ing, varianteId: null, cantidad: (Number(r.cantidad) || 0) * it.cantidad, nombre: ing.nombre, insumoDe: p.nombre });
        }
      }
    }
    return out;
  };
  function agruparConsumo(items) {
    const acum = new Map();
    for (const c of FK.consumoStock(items)) {
      const k = c.p.id + '|' + (c.varianteId || ''), a = acum.get(k);
      if (a) a.cantidad += c.cantidad; else acum.set(k, { ...c });
    }
    return [...acum.values()];
  }
  // signo -1 = vender (descuenta), +1 = anular/reponer
  FK.descontarStock = (items, signo = -1) => {
    for (const c of agruparConsumo(items)) {
      const p = c.p;
      if (c.varianteId) {
        const va = (p.variantes || []).find(x => x.id === c.varianteId);
        if (va) va.stock = Math.max(0, redondeo3((Number(va.stock) || 0) + signo * c.cantidad));
        p.stock = stockDe(p);
      } else p.stock = Math.max(0, redondeo3((Number(p.stock) || 0) + signo * c.cantidad));
    }
  };
  // Devuelve un mensaje si falta stock (del ítem o de algún insumo), o '' si todo está bien.
  FK.validarStock = (items) => {
    const ix = indice();
    for (const it of items) if (it.productoId && !ix.porId.has(it.productoId)) return `"${it.nombre}" ya no existe en inventario`;
    for (const c of agruparConsumo(items)) {
      const disp = c.varianteId ? Number(((c.p.variantes || []).find(v => v.id === c.varianteId) || {}).stock) || 0 : stockDe(c.p);
      if (c.cantidad > disp + 1e-9) return `Stock insuficiente de "${c.nombre}"` + (c.insumoDe ? ` (insumo de "${c.insumoDe}")` : '');
    }
    return '';
  };

  let posFiltroTipo = 'TODOS';

  function productoCard(p) {
    const t = tipoItem(p);
    const controla = itemControlaStock(p);
    const st = stockDe(p);
    const agotado = (t === 'PLATO' && !!p.agotado) || (controla && st <= 0);
    const tasa = FK.tasa();
    const stockTxt = !controla ? '' : esPeso(p) ? FK.kg(st) : `${st} und`;
    let chip = '';
    if (agotado) chip = '<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">Agotado</span>';
    else if (stockTxt) chip = `<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${st <= 5 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-greym'}">${stockTxt}</span>`;
    else if (t === 'SERVICIO' && p.precioVariable) chip = '<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700">Precio variable</span>';
    else if (t === 'PLATO' && p.tiempoPrep) chip = `<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-greym">⏱ ${p.tiempoPrep} min</span>`;
    return `<button data-pid="${p.id}" class="pos-card bg-white rounded-2xl shadow-sm p-3 text-left hover:shadow-md hover:-translate-y-0.5 transition-all active:scale-[0.98] flex flex-col gap-2 ${agotado ? 'opacity-50' : ''}">
      <div class="relative">
        <div class="aspect-square w-full rounded-xl bg-gray-50 overflow-hidden flex items-center justify-center">
          ${p.imagen ? `<img src="${p.imagen}" class="w-full h-full object-cover" alt="">` : `<span class="text-4xl font-extrabold text-primary/25">${esc((p.nombre || '?').charAt(0).toUpperCase())}</span>`}
        </div>
        <span class="absolute text-xs rounded-full px-1.5 py-0.5 shadow-sm" style="top:2px;left:2px;z-index:1;background:rgba(255,255,255,.95)">${TIPOS_ITEM[t].icono}</span>
      </div>
      <div class="text-sm font-semibold text-dark333 leading-tight line-clamp-2 min-h-[2.5em]">${esc(p.nombre)}</div>
      <div class="flex items-end justify-between gap-1">
        <div><div class="text-teal font-extrabold leading-none">${t === 'SERVICIO' && p.precioVariable ? 'desde ' : ''}${FK.usd(p.precio)}${esPeso(p) ? '<span class="text-[10px] font-semibold">/kg</span>' : ''}</div>
        ${tasa ? `<div class="text-[11px] text-primary font-semibold mt-0.5">${FK.bs(p.precio * tasa)}</div>` : ''}</div>
        ${chip}
      </div></button>`;
  }

  function renderProductosPOS() {
    const ix = indice();
    const q = FK.norm($('pos-search').value.trim());
    $('pos-tipo-tabs').innerHTML = ix.vendibles.length ? tabsTipoHTML(ix.conteoVendibles, posFiltroTipo, 'data-tipo-pos') : '';
    const base = posFiltroTipo === 'TODOS' ? ix.vendibles : ix.vendibles.filter(p => ix.tipo.get(p.id) === posFiltroTipo);
    const lista = q ? base.filter(p => ix.busq.get(p.id).includes(q)) : base;
    const visibles = lista.slice(0, MAX_TARJETAS);
    $('pos-products-grid').innerHTML = lista.length
      ? visibles.map(productoCard).join('') + (lista.length > visibles.length ? `<div class="col-span-full text-center text-xs text-greym py-2">Mostrando ${visibles.length} de ${lista.length}. Usa el buscador para acotar.</div>` : '')
      : `<div class="col-span-full text-center text-greym text-sm py-12 bg-white rounded-2xl">${FK.emp().productos.length ? 'Ningún ítem coincide con la búsqueda' : 'Aún no hay ítems. Agrégalos en Inventario.'}</div>`;
  }

  function calcularTotales() {
    const subtotal = FK.r2(pos.carrito.reduce((s, it) => s + FK.r2(it.cantidad * it.precio), 0));
    let descuento = 0;
    if (pos.promo) descuento = pos.promo.tipo === 'porcentaje' ? FK.r2(subtotal * pos.promo.valor / 100) : Math.min(pos.promo.valor, subtotal);
    descuento = FK.r2(descuento);
    return { subtotal, descuento, total: FK.r2(subtotal - descuento) };
  }

  function renderCarrito() {
    const cont = $('cart-items');
    cont.innerHTML = pos.carrito.map(it => `
      <div class="flex items-center gap-2 bg-gray-50 rounded-xl p-2 animate-fadeIn">
        <div class="flex-1 min-w-0">
          <div class="text-sm font-semibold text-dark333 truncate">${TIPOS_ITEM[it.tipoItem] ? TIPOS_ITEM[it.tipoItem].icono + ' ' : ''}${esc(it.nombre)}</div>
          <div class="text-[11px] text-greym truncate">${it.detalle ? esc(it.detalle) + ' · ' : ''}${it.precioVariable ? `<button type="button" data-act="precio" data-key="${it.key}" class="underline decoration-dotted hover:text-primary" title="Cambiar precio">${FK.usd(it.precio)}</button>` : FK.usd(it.precio)}${it.porPeso ? '/kg' : ''}</div>
        </div>
        ${it.porPeso ? `<span class="text-xs font-semibold text-dark333">${FK.kg(it.cantidad)}</span>` : `
        <div class="flex items-center gap-1">
          <button data-act="menos" data-key="${it.key}" class="w-6 h-6 rounded-lg bg-white border border-gray-200 text-dark333 font-bold leading-none hover:border-primary">−</button>
          <span class="w-6 text-center text-sm font-semibold">${it.cantidad}</span>
          <button data-act="mas" data-key="${it.key}" class="w-6 h-6 rounded-lg bg-white border border-gray-200 text-dark333 font-bold leading-none hover:border-primary">+</button>
        </div>`}
        <div class="text-sm font-bold text-dark333 w-16 text-right">${FK.usd(it.cantidad * it.precio)}</div>
        <button data-act="del" data-key="${it.key}" class="text-greym hover:text-accent text-lg leading-none px-1" title="Quitar">&times;</button>
      </div>`).join('');
    $('cart-empty').classList.toggle('hidden', pos.carrito.length > 0);
    const t = calcularTotales();
    $('sum-subtotal').textContent = FK.usd(t.subtotal);
    $('sum-descuento').textContent = '-' + FK.usd(t.descuento);
    $('sum-descuento-row').classList.toggle('hidden', !t.descuento);
    $('sum-total').textContent = FK.usd(t.total);
    $('sum-total-bs').textContent = FK.tasa() ? FK.bs(t.total * FK.tasa()) : '';
    $('btn-generar-factura').disabled = !pos.carrito.length;
    if (FK.ajustarPOS) FK.ajustarPOS();
    carritoFlotante(pos.carrito.length, t.total);
  }

  // Teléfono: botón flotante con el resumen del carrito; al tocarlo baja al carrito y al botón de facturar.
  let cfN = 0, cfTotal = 0;
  function carritoFlotante(n, total) {
    if (n != null) { cfN = n; cfTotal = total; }
    let b = $('btn-carrito-flotante');
    if (!b) {
      b = document.createElement('button'); b.id = 'btn-carrito-flotante'; b.type = 'button';
      b.onclick = () => { const g = (FK.puedeFacturar && !FK.puedeFacturar()) ? $('btn-enviar-pedido') : $('btn-generar-factura'); if (g) g.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
      document.body.appendChild(b);
    }
    const solo = FK.puedeFacturar && !FK.puedeFacturar();
    b.textContent = `🛒 ${cfN} · ${FK.usd(cfTotal)}  ${solo ? 'Enviar pedido' : 'Cobrar'} ›`;
    b.classList.toggle('hidden', !cfN || tabActual !== 'pos');
  }
  FK.carritoFlotante = carritoFlotante;

  function faltanteReceta(p, cantidadPlatos) {
    if (tipoItem(p) !== 'PLATO' || !Array.isArray(p.receta)) return null;
    const ix = indice();
    for (const r of p.receta) {
      const ing = ix.porId.get(r.productoId);
      if (ing && itemControlaStock(ing) && (Number(r.cantidad) || 0) * cantidadPlatos > stockDe(ing) + 1e-9) return ing;
    }
    return null;
  }

  // extra = { precio, detalle } para servicios con precio variable
  function agregarItem(p, variante, cantidad, porPeso = false, extra = null) {
    const t = tipoItem(p);
    if (t === 'PLATO' && p.agotado) { FK.toast(`"${p.nombre}" está agotado`, 'error'); return false; }
    const precioUnit = extra && extra.precio != null ? extra.precio : Number(p.precio) || 0;
    const detalleExtra = extra && extra.detalle ? extra.detalle : '';
    const key = p.id + '|' + (variante ? variante.id : '') + (extra ? '|' + precioUnit + '|' + detalleExtra : '');
    const existente = pos.carrito.find(i => i.key === key);
    const ya = existente ? existente.cantidad : 0;
    if (itemControlaStock(p)) {
      const disponible = variante ? Number(variante.stock) || 0 : Number(p.stock) || 0;
      if (ya + cantidad > disponible + 1e-9) {
        FK.toast(disponible <= ya ? `Sin stock de "${p.nombre}"` : `Solo quedan ${porPeso ? FK.kg(disponible) : disponible} de "${p.nombre}"`, 'error');
        return false;
      }
    }
    const faltante = faltanteReceta(p, pos.carrito.filter(i => i.productoId === p.id).reduce((s, i) => s + i.cantidad, 0) + cantidad);
    if (faltante) { FK.toast(`No alcanza "${faltante.nombre}" para preparar "${p.nombre}"`, 'error'); return false; }
    if (existente) existente.cantidad = porPeso ? Math.round((ya + cantidad) * 1000) / 1000 : ya + cantidad;
    else pos.carrito.push({
      key, productoId: p.id, varianteId: variante ? variante.id : null, nombre: p.nombre,
      detalle: [variante ? [variante.modelo, variante.talla ? 'Talla ' + variante.talla : ''].filter(Boolean).join(' · ') : '', detalleExtra].filter(Boolean).join(' · '),
      detalleExtra, cantidad, precio: precioUnit, porPeso, tipoItem: t, precioVariable: !!extra,
      impuestoPct: p.impuestoPct != null ? p.impuestoPct : null
    });
    renderCarrito();
    return true;
  }

  function agregarProducto(p) {
    if (!p) return;
    const t = tipoItem(p);
    if (t === 'SERVICIO' && p.precioVariable) return abrirServicio(p);
    if (p.variantes && p.variantes.length && FK.tiene('variantes') && t === 'PRODUCTO_NORMAL') return abrirVariantes(p);
    if (esPeso(p) && t === 'PRODUCTO_NORMAL') return abrirPeso(p);
    agregarItem(p, null, 1);
  }
  FK.agregarProducto = agregarProducto;

  // Servicio con precio variable: se pregunta el precio del trabajo (o se corrige uno ya agregado).
  let servicioActual = null;
  function actualizarSrvBs() {
    const v = FK.num($('srv-precio').value);
    $('srv-precio-bs').textContent = FK.tasa() && v > 0 ? FK.bs(v * FK.tasa()) : '';
  }
  function abrirServicio(p, itemExistente = null) {
    servicioActual = { p, item: itemExistente };
    $('srv-title').textContent = p.nombre;
    $('srv-info').textContent = [p.duracionMin ? `⏱ ${p.duracionMin} min` : '', p.empleado ? `👤 ${p.empleado}` : '', `Precio base ${FK.usd(p.precio)}`].filter(Boolean).join(' · ');
    $('srv-precio').value = itemExistente ? itemExistente.precio : (p.precio || '');
    $('srv-detalle').value = itemExistente ? itemExistente.detalleExtra || '' : '';
    $('srv-btn').textContent = itemExistente ? 'Guardar cambios' : 'Agregar al carrito';
    actualizarSrvBs();
    FK.openModal('modal-servicio');
    FK.enfocar('srv-precio');
  }

  function abrirVariantes(p) {
    $('variante-title').textContent = p.nombre;
    $('variante-lista').innerHTML = p.variantes.map(v => {
      const sin = itemControlaStock(p) && (Number(v.stock) || 0) <= 0;
      return `<button data-vid="${v.id}" ${sin ? 'disabled' : ''} class="flex items-center justify-between bg-gray-50 hover:bg-primary/5 border border-gray-100 rounded-xl px-4 py-3 text-left transition disabled:opacity-40 disabled:cursor-not-allowed">
        <div><div class="font-semibold text-sm text-dark333">${esc(v.modelo || 'Único')}</div><div class="text-xs text-greym">Talla ${esc(v.talla || '-')}</div></div>
        <span class="text-xs font-semibold ${sin ? 'text-accent' : 'text-greym'}">${sin ? 'Agotado' : v.stock + ' und'}</span></button>`;
    }).join('');
    $('variante-lista').onclick = (e) => {
      const b = e.target.closest('[data-vid]'); if (!b) return;
      const v = p.variantes.find(x => x.id === b.dataset.vid);
      if (agregarItem(p, v, 1)) FK.closeModal('modal-variante');
    };
    FK.openModal('modal-variante');
  }

  let productoPeso = null;
  function abrirPeso(p) {
    productoPeso = p;
    $('peso-title').textContent = p.nombre;
    $('peso-precio-kg').textContent = FK.usd(p.precio) + (FK.tasa() ? ` (${FK.bs(p.precio * FK.tasa())})` : '');
    $('peso-valor').value = '';
    $('peso-total').textContent = FK.usd(0);
    FK.openModal('modal-peso');
    FK.enfocar('peso-valor');
  }

  function seleccionarClientePOS(c) {
    pos.cliente = c || null;
    $('cliente-search').value = '';
    const box = $('cliente-seleccionado');
    if (!c) { box.classList.add('hidden'); return; }
    $('cs-nombre').textContent = c.nombre;
    $('cs-detalle').innerHTML = `${esc(c.cedula || 'Sin cédula')}${c.correo ? ' · ' + esc(c.correo) : ' · <span class="text-accent">sin correo</span>'}
      <button type="button" id="btn-quitar-cliente" class="ml-1 text-accent font-semibold hover:underline">Quitar</button>`;
    box.classList.remove('hidden');
    $('btn-quitar-cliente').onclick = () => seleccionarClientePOS(null);
  }
  FK.seleccionarClientePOS = seleccionarClientePOS;

  function renderPromo() {
    const aplica = !!pos.promo;
    $('promo-form').classList.toggle('hidden', aplica);
    $('promo-aplicada').classList.toggle('hidden', !aplica);
    if (aplica) $('promo-aplicada-label').textContent = `${pos.promo.codigo} · ${pos.promo.tipo === 'porcentaje' ? pos.promo.valor + '%' : FK.usd(pos.promo.valor)} de descuento`;
  }

  function renderComprador() {
    const auto = FK.rol() === 'autoservicio';
    $('autoservicio-registro').classList.toggle('hidden', !auto || !!pos.comprador);
    $('autoservicio-activo').classList.toggle('hidden', !auto || !pos.comprador);
    if (auto && pos.comprador) $('auto-comprador-nombre').textContent = pos.comprador.nombre + (pos.comprador.cedula ? ` (${pos.comprador.cedula})` : '');
  }

  render.pos = () => {
    const auto = FK.rol() === 'autoservicio';
    $('pos-cliente-panel').classList.toggle('hidden', auto);
    $('promo-panel').classList.toggle('hidden', auto);
    renderComprador();
    renderPromo();
    if (FK.ajustarPOS) FK.ajustarPOS();
    renderProductosPOS();
    renderCarrito();
    seleccionarClientePOS(pos.cliente);
    setTimeout(() => { if (FK.tabActual() === 'pos' && !document.querySelector('.modal-overlay:not(.hidden)')) (auto && !pos.comprador ? $('auto-nombre') : $('barcode-input')).focus(); }, 60);
  };

  async function generarFactura() {
    if (!pos.carrito.length) return;
    if (FK.puedeFacturar && !FK.puedeFacturar()) return FK.toast('Tu perfil solo envía pedidos a caja', 'error');
    const auto = FK.rol() === 'autoservicio';
    const metodo = $('pos-metodo-pago').value;
    if (auto && !pos.comprador) { FK.toast('Regístrate como comprador antes de facturar', 'error'); $('auto-nombre').focus(); return; }
    if (!metodo) { FK.toast('Selecciona un método de pago', 'error'); $('pos-metodo-pago').focus(); return; }
    // Revalidar stock por si cambió (incluye los insumos de las recetas)
    const faltaStock = FK.validarStock(pos.carrito);
    if (faltaStock) { FK.toast(faltaStock, 'error'); return; }
    let cliente = pos.cliente;
    if (auto) {
      const { nombre, cedula } = pos.comprador;
      cliente = cedula ? FK.emp().clientes.find(c => FK.norm(c.cedula) === FK.norm(cedula)) : null;
      if (!cliente && cedula) {
        cliente = { id: FK.uid(), nombre, cedula, telefono: '', correo: '', creado: new Date().toISOString() };
        FK.emp().clientes.push(cliente);
      }
      if (!cliente) cliente = { id: null, nombre, cedula: '', correo: '' };
    }
    if (FK.antesFacturar && !(await FK.antesFacturar())) return;     // el pedido ya no está pendiente
    const t = calcularTotales();
    if (pos.promo) pos.promo.usos = (pos.promo.usos || 0) + 1;
    const v = FK.registrarVenta({
      items: pos.carrito.map(it => ({ productoId: it.productoId, varianteId: it.varianteId, nombre: it.nombre, detalle: it.detalle, cantidad: it.cantidad, precio: it.precio, subtotal: FK.r2(it.cantidad * it.precio), porPeso: it.porPeso, tipoItem: it.tipoItem, impuestoPct: it.impuestoPct })),
      cliente, subtotal: t.subtotal, descuento: t.descuento, promoCodigo: pos.promo ? pos.promo.codigo : '', metodoPago: metodo, origen: 'pos'
    });
    if (FK.alFacturar) FK.alFacturar(v);                             // marca el pedido como facturado
    pos.carrito = []; pos.promo = null; pos.cliente = null; pos.pedidoId = null;
    if (auto) pos.comprador = null;
    $('pos-metodo-pago').value = '';
    render.pos();
    FK.postVenta(v);
  }

  // ======================= VENTAS (compartido) =======================
  FK.registrarVenta = ({ items, cliente, subtotal, descuento = 0, promoCodigo = '', metodoPago, origen = 'pos', referencia = '' }) => {
    const e = FK.emp(), caja = FK.caja();
    e.secuenciaFactura = (e.secuenciaFactura || 0) + 1;
    const total = FK.r2(subtotal - descuento);
    const tasa = caja ? caja.tasa : 0;
    const v = {
      id: FK.uid(), numero: e.secuenciaFactura, fecha: new Date().toISOString(), items,
      subtotal: FK.r2(subtotal), descuento: FK.r2(descuento), promoCodigo, total, tasa, totalBs: FK.r2(total * tasa),
      metodoPago, origen, referencia, usuario: FK.sesion.usuario.usuario, cajaId: caja ? caja.id : null,
      clienteId: cliente ? cliente.id : null, clienteNombre: cliente ? cliente.nombre : 'Consumidor final',
      clienteCedula: cliente ? cliente.cedula || '' : '', clienteCorreo: cliente ? cliente.correo || '' : '',
      clienteTelefono: cliente ? cliente.telefono || '' : '',
      correo: 'pendiente', cae: '', caeVencimiento: ''
    };
    // Cada ítem guarda su tipo y su impuesto, para los reportes y el ticket fiscal.
    const ix = indice();
    items.forEach(it => {
      const pr = it.productoId && ix.porId.get(it.productoId);
      if (!it.tipoItem) it.tipoItem = pr ? tipoItem(pr) : 'PRODUCTO_NORMAL';
      if (it.impuestoPct === undefined) it.impuestoPct = pr && pr.impuestoPct != null ? pr.impuestoPct : null;
    });
    FK.descontarStock(items); // solo descuenta ítems que controlan stock (+ insumos de recetas)
    e.ventas.push(v);
    FK.store.saveNow();
    return v;
  };

  FK.imprimirVenta = (v) => {
    // Antes: en modo no-fiscal mandaba la factura completa tamaño carta a
    // la impresora de caja. Ahora siempre manda el ticket POS de 58mm
    // (fiscal o genérico según corresponda) — la impresora térmica de punto
    // de venta nunca recibe un documento tamaño carta.
    return FK.imprimir(FK.doc.ticketPOS(v, FK.emp()), { destino: 'caja', ancho: 58 });
  };

  FK.postVenta = (v) => {
    FK.toast(`Factura N° ${FK.nroFactura(v.numero)} generada · ${FK.usd(v.total)}`);
    verFactura(v);
    if ($('chk-imprimir').checked) FK.imprimirVenta(v);
    if (v.clienteCorreo && $('chk-enviar-correo').checked) FK.enviarFacturaCorreo(v, { silencioso: true });
    else { v.correo = v.clienteCorreo ? 'no-enviado' : 'sin-correo'; FK.store.save(); }
    if (FK.onVentasCambiadas) FK.onVentasCambiadas();
  };

  let ventaVista = null;
  function verFactura(v) {
    ventaVista = v;
    const e = FK.emp();
    $('preview-factura-iframe').srcdoc = FK.doc.factura(v, e);
    $('btn-preview-ticket58').classList.toggle('hidden', !(e.fiscal && e.fiscal.activo));
    FK.openModal('modal-preview-factura');
  }
  FK.verFactura = verFactura;

  function verTicket58() {
    if (!ventaVista) return;
    $('preview-ticket58-iframe').srcdoc = FK.doc.ticket58(ventaVista, FK.emp());
    FK.openModal('modal-preview-ticket58');
  }

  // ======================= INVENTARIO =======================
  let invFiltroTipo = 'TODOS';

  function inventarioCard(p, admin, tasa) {
    const t = tipoItem(p), controla = itemControlaStock(p), st = stockDe(p);
    const minimo = Number(p.stockMinimo) || 0;
    const bajo = controla && (minimo > 0 ? st <= minimo : st <= 5);
    const extras = [];
    if (t === 'PLATO') {
      extras.push(`<span class="text-[10px] bg-gray-100 text-greym font-semibold px-2 py-0.5 rounded-full">${CAT_GASTRO[p.categoriaProducto] || 'Plato fuerte'}</span>`);
      if (p.tiempoPrep) extras.push(`<span class="text-[10px] bg-gray-100 text-greym font-semibold px-2 py-0.5 rounded-full">⏱ ${p.tiempoPrep} min</span>`);
      if (p.receta && p.receta.length) extras.push(`<span class="text-[10px] bg-gray-100 text-greym font-semibold px-2 py-0.5 rounded-full">🧾 ${p.receta.length} ingrediente(s)</span>`);
    } else if (t === 'SERVICIO') {
      if (p.precioVariable) extras.push('<span class="text-[10px] bg-sky-100 text-sky-700 font-semibold px-2 py-0.5 rounded-full">Precio variable</span>');
      if (p.duracionMin) extras.push(`<span class="text-[10px] bg-gray-100 text-greym font-semibold px-2 py-0.5 rounded-full">⏱ ${p.duracionMin} min</span>`);
      if (p.empleado) extras.push(`<span class="text-[10px] bg-gray-100 text-greym font-semibold px-2 py-0.5 rounded-full">👤 ${esc(p.empleado)}</span>`);
    } else if (p.ventaPOS === false) extras.push('<span class="text-[10px] bg-gray-100 text-greym font-semibold px-2 py-0.5 rounded-full">Solo insumo</span>');
    if (p.categoria) extras.push(`<span class="text-[10px] bg-gray-100 text-greym font-semibold px-2 py-0.5 rounded-full">${esc(p.categoria)}</span>`);
    if (p.impuestoPct != null) extras.push(`<span class="text-[10px] bg-gray-100 text-greym font-semibold px-2 py-0.5 rounded-full">Imp. ${p.impuestoPct}%</span>`);
    return `<div class="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-3 animate-fadeIn">
        <div class="flex gap-3">
          <div class="w-16 h-16 rounded-xl bg-gray-50 overflow-hidden flex items-center justify-center shrink-0">
            ${p.imagen ? `<img src="${p.imagen}" class="w-full h-full object-cover" alt="">` : `<span class="text-2xl font-extrabold text-primary/25">${esc((p.nombre || '?').charAt(0).toUpperCase())}</span>`}
          </div>
          <div class="min-w-0 flex-1">
            <div class="font-semibold text-dark333 leading-tight">${esc(p.nombre)}</div>
            <div class="text-[11px] text-greym mt-0.5 truncate">${p.codigo ? '🏷️ ' + esc(p.codigo) : (t === 'PRODUCTO_NORMAL' ? 'Sin código' : '&nbsp;')}</div>
            <span class="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${TIPOS_ITEM[t].color}">${TIPOS_ITEM[t].icono} ${TIPOS_ITEM[t].etiqueta}</span>
          </div>
        </div>
        ${p.descripcion ? `<div class="text-xs text-greym line-clamp-2">${esc(p.descripcion)}</div>` : ''}
        ${extras.length ? `<div class="flex flex-wrap gap-1">${extras.join('')}</div>` : ''}
        <div class="flex items-end justify-between">
          <div><div class="text-lg font-extrabold text-teal leading-none">${FK.usd(p.precio)}${esPeso(p) ? '<span class="text-xs">/kg</span>' : ''}</div>
            ${tasa ? `<div class="text-[11px] text-primary font-semibold mt-0.5">${FK.bs(p.precio * tasa)}</div>` : ''}</div>
          ${controla ? `<div class="text-right"><div class="text-[10px] uppercase text-greym">Stock</div><div class="font-bold ${st <= 0 ? 'text-accent' : bajo ? 'text-amber-600' : 'text-dark333'}">${esPeso(p) ? FK.kg(st) : st}</div></div>` : ''}
          ${t === 'PLATO' ? `<button data-agotar="${p.id}" class="text-[11px] font-semibold px-2.5 py-1 rounded-full ${p.agotado ? 'bg-accent/10 text-accent' : 'bg-teal/10 text-teal'}" title="Clic para cambiar">${p.agotado ? 'Agotado' : 'Disponible'}</button>` : ''}
        </div>
        ${p.variantes && p.variantes.length ? `<div class="flex flex-wrap gap-1">${p.variantes.map(v => `<span class="text-[10px] bg-gray-100 text-greym px-2 py-0.5 rounded-full">${esc(v.modelo || '')} ${esc(v.talla || '')}: ${v.stock}</span>`).join('')}</div>` : ''}
        ${admin ? `<div class="grid grid-cols-2 gap-2 text-[11px] text-greym bg-gray-50 rounded-lg p-2"><div>Costo: <b class="text-dark333">${p.costo ? FK.usd(p.costo) : '-'}</b></div>${t === 'PRODUCTO_NORMAL' ? `<div>Mayor: <b class="text-dark333">${p.mayor ? FK.usd(p.mayor) : '-'}</b></div>` : '<div></div>'}</div>` : ''}
        <div class="flex gap-2 mt-auto">
          <button data-edit="${p.id}" class="flex-1 bg-primary/10 text-primary text-sm font-semibold py-2 rounded-xl hover:bg-primary/20 transition">Editar</button>
          ${admin ? `<button data-del="${p.id}" class="px-3 bg-accent/10 text-accent text-sm font-semibold py-2 rounded-xl hover:bg-accent/20 transition">Eliminar</button>` : ''}
        </div></div>`;
  }

  render.inventario = () => {
    const q = FK.norm($('inv-search').value.trim());
    const e = FK.emp();
    const admin = FK.esAdmin();
    const ix = indice();
    $('inv-subtabs').innerHTML = e.productos.length ? tabsTipoHTML(ix.conteoTodos, invFiltroTipo, 'data-tipo-inv') : '';
    const btnImp = $('btn-importar-excel'); if (btnImp) btnImp.classList.toggle('hidden', !admin);
    const base = invFiltroTipo === 'TODOS' ? e.productos : e.productos.filter(p => ix.tipo.get(p.id) === invFiltroTipo);
    const lista = q ? base.filter(p => ix.busq.get(p.id).includes(q)) : base;
    const visibles = lista.slice(0, MAX_TARJETAS);
    const tasa = FK.tasa();
    $('inventario-grid').innerHTML = lista.length
      ? visibles.map(p => inventarioCard(p, admin, tasa)).join('') + (lista.length > visibles.length ? `<div class="col-span-full text-center text-xs text-greym py-2">Mostrando ${visibles.length} de ${lista.length}. Usa el buscador para acotar.</div>` : '')
      : `<div class="col-span-full text-center text-greym text-sm py-12 bg-white rounded-2xl">${e.productos.length ? 'Ningún ítem coincide' : 'Aún no hay ítems. Usa "+ Agregar Producto" o importa un Excel.'}</div>`;
  };


  // ---------- Exportar inventario a Excel (.xlsx) ----------
  // Exporta lo que se está viendo (filtro por tipo + búsqueda). Las columnas con
  // los mismos nombres que usa "Importar Excel", así el archivo se puede volver a importar.
  async function exportarInventarioExcel() {
    if (typeof XLSX === 'undefined') return FK.toast('No se cargó el módulo de Excel', 'error');
    const e = FK.emp();
    const admin = FK.esAdmin();
    const ix = indice();
    const q = FK.norm($('inv-search').value.trim());
    const base = invFiltroTipo === 'TODOS' ? e.productos : e.productos.filter(p => ix.tipo.get(p.id) === invFiltroTipo);
    const lista = q ? base.filter(p => ix.busq.get(p.id).includes(q)) : base;
    if (!lista.length) return FK.toast('No hay ítems para exportar con el filtro actual', 'error');
    const filas = lista.map(p => {
      const t = ix.tipo.get(p.id) || tipoItem(p);
      const controla = itemControlaStock(p);
      const fila = {
        'Código': p.codigo || '',
        'Nombre': p.nombre || '',
        'Tipo': TIPOS_ITEM[t].etiqueta,
        'Categoría': p.categoria || '',
        'Precio de venta': Number(p.precio) || 0,
      };
      if (admin) fila['Costo'] = Number(p.costo) || 0;
      fila['Stock'] = controla ? stockDe(p) : '';
      fila['Stock mínimo'] = controla && t === 'PRODUCTO_NORMAL' ? (Number(p.stockMinimo) || 0) : '';
      fila['Impuesto %'] = p.impuestoPct == null || p.impuestoPct === '' ? '' : Number(p.impuestoPct);
      fila['Controla stock'] = controla ? 'Sí' : 'No';
      fila['Disponible en POS'] = FK.vendible(p) ? 'Sí' : 'No';
      fila['Precio variable'] = p.precioVariable ? 'Sí' : 'No';
      fila['Estado'] = t === 'PLATO' ? (p.agotado ? 'Agotado' : 'Disponible') : '';
      fila['Descripción'] = p.descripcion || '';
      if (admin) fila['Valor en inventario (costo)'] = controla ? Math.round(stockDe(p) * (Number(p.costo) || 0) * 100) / 100 : '';
      return fila;
    });
    const ws = XLSX.utils.json_to_sheet(filas);
    const cols = Object.keys(filas[0]);
    ws['!cols'] = cols.map(c => ({ wch: Math.min(40, Math.max(c.length + 2, ...filas.slice(0, 200).map(f => String(f[c] ?? '').length + 2))) }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: filas.length, c: cols.length - 1 } }) };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    const hoy = new Date().toISOString().slice(0, 10);
    const sufijo = invFiltroTipo === 'TODOS' ? '' : '-' + TIPOS_ITEM[invFiltroTipo].corto;
    const nombre = `Inventario-${(e.nombre || 'FacturaK').replace(/[^\w\-]+/g, '_')}${sufijo}-${hoy}.xlsx`;
    const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    if (window.api && window.api.guardarArchivoComo) {
      const r = await window.api.guardarArchivoComo({ nombre, base64: b64, filtros: [{ name: 'Excel', extensions: ['xlsx'] }] });
      if (r && r.ok) { FK.toast(`Inventario exportado (${filas.length} ítems)`); if (window.api.mostrarArchivo) window.api.mostrarArchivo(r.ruta); }
      else if (!(r && r.cancelado)) FK.toast('No se pudo guardar el archivo: ' + ((r && r.error) || 'error'), 'error');
    } else {
      XLSX.writeFile(wb, nombre);
      FK.toast(`Inventario exportado (${filas.length} ítems)`);
    }
  }
  FK.exportarInventarioExcel = exportarInventarioExcel;

  function filaVariante(v = {}) {
    const d = document.createElement('div');
    d.className = 'variante-row grid grid-cols-7 gap-2 items-center';
    d.innerHTML = `<input type="text" placeholder="Modelo/color" class="input-field !py-1.5 text-sm col-span-3 v-modelo" value="${esc(v.modelo || '')}">
      <input type="text" placeholder="Talla" class="input-field !py-1.5 text-sm col-span-2 v-talla" value="${esc(v.talla || '')}">
      <input type="number" min="0" step="1" placeholder="Stock" class="input-field !py-1.5 text-sm col-span-1 v-stock" value="${v.stock ?? ''}">
      <button type="button" class="text-accent text-lg leading-none v-quitar" title="Quitar">&times;</button>`;
    d.dataset.vid = v.id || '';
    d.querySelector('.v-quitar').onclick = () => d.remove();
    return d;
  }

  function actualizarEtiquetaPrecio() {
    const t = $('p-tipo-item').value;
    $('p-precio-label').textContent = t === 'SERVICIO' ? ($('p-precio-variable').checked ? 'Precio base / sugerido (USD)' : 'Precio del servicio *')
      : FK.tiene('peso') && t === 'PRODUCTO_NORMAL' && $('p-tipo-venta').value === 'peso' ? 'Precio por kg *' : 'Precio de Venta *';
  }

  function filaIngrediente(r = {}, excluirId = '') {
    const d = document.createElement('div');
    d.className = 'ingrediente-row grid grid-cols-7 gap-2 items-center';
    const opciones = FK.emp().productos.filter(x => tipoItem(x) === 'PRODUCTO_NORMAL' && x.id !== excluirId).sort((a, b) => a.nombre.localeCompare(b.nombre));
    d.innerHTML = `<select class="input-field !py-1.5 text-sm col-span-4 r-prod"><option value="">— Insumo —</option>${opciones.map(o => `<option value="${o.id}" ${o.id === r.productoId ? 'selected' : ''}>${esc(o.nombre)}</option>`).join('')}</select>
      <input type="number" step="0.001" min="0" placeholder="Cant." class="input-field !py-1.5 text-sm col-span-2 r-cant" value="${r.cantidad ?? ''}">
      <button type="button" class="text-accent text-lg leading-none r-del" title="Quitar">&times;</button>`;
    d.querySelector('.r-del').onclick = () => d.remove();
    return d;
  }

  // Muestra solo los campos que corresponden al tipo de ítem elegido.
  function setTipoFormulario(tipo) {
    $('p-tipo-item').value = tipo;
    document.querySelectorAll('.p-tipo-btn').forEach(b => {
      const activo = b.dataset.tipo === tipo;
      b.classList.toggle('border-primary', activo); b.classList.toggle('bg-primary/10', activo);
      b.classList.toggle('border-gray-200', !activo);
    });
    $('p-tipo-ayuda').textContent = TIPOS_ITEM[tipo].ayuda;
    const normal = tipo === 'PRODUCTO_NORMAL', plato = tipo === 'PLATO', servicio = tipo === 'SERVICIO';
    $('p-nombre-label').textContent = plato ? 'Nombre del plato *' : servicio ? 'Nombre del servicio *' : 'Nombre del producto *';
    $('p-codigo-wrap').classList.toggle('hidden', !normal);
    $('p-bloque-plato').classList.toggle('hidden', !plato);
    $('p-bloque-servicio').classList.toggle('hidden', !servicio);
    $('p-bloque-producto').classList.toggle('hidden', !normal);
    $('p-bloque-stock').classList.toggle('hidden', servicio);
    $('p-mayor-wrap').classList.toggle('hidden', !normal);
    $('p-stock-minimo-wrap').classList.toggle('hidden', !normal);
    $('p-tipo-venta-wrap').classList.toggle('hidden', !(normal && FK.tiene('peso')));
    const conVariantes = normal && FK.tiene('variantes');
    $('p-variantes-wrap').classList.toggle('hidden', !conVariantes);
    const controla = !servicio && $('p-controla-stock').checked;
    $('p-stock-campos').classList.toggle('hidden', !controla);
    $('p-stock-wrap').classList.toggle('hidden', conVariantes);
    $('p-stock').required = controla && !conVariantes;
    $('p-precio').required = !(servicio && $('p-precio-variable').checked);
    actualizarEtiquetaPrecio();
  }

  function abrirProducto(p, tipoSugerido) {
    const e = FK.emp();
    $('form-producto').reset();
    $('modal-producto-title').textContent = p ? 'Editar ítem' : 'Nuevo ítem';
    $('p-id').value = p ? p.id : '';
    const tipo = p ? tipoItem(p) : (tipoSugerido || (invFiltroTipo !== 'TODOS' ? invFiltroTipo : 'PRODUCTO_NORMAL'));
    $('p-codigo').value = p ? p.codigo || '' : '';
    $('p-nombre').value = p ? p.nombre : '';
    $('p-descripcion').value = p ? p.descripcion || '' : '';
    $('p-precio').value = p ? p.precio : '';
    $('p-impuesto').value = p && p.impuestoPct != null ? p.impuestoPct : '';
    $('p-categoria').value = p ? p.categoria || '' : '';
    $('p-stock').value = p ? p.stock : '';
    $('p-precio-costo').value = p && p.costo ? p.costo : '';
    $('p-precio-mayor').value = p && p.mayor ? p.mayor : '';
    $('p-stock-minimo').value = p && p.stockMinimo ? p.stockMinimo : '';
    $('p-categoria-producto').value = p ? p.categoriaProducto || 'plato' : 'plato';
    $('p-tipo-venta').value = p ? p.tipoVenta || 'unidad' : 'unidad';
    $('p-tiempo-prep').value = p && p.tiempoPrep ? p.tiempoPrep : '';
    $('p-estado').value = p && p.agotado ? 'agotado' : 'disponible';
    $('p-precio-variable').checked = !!(p && p.precioVariable);
    $('p-duracion').value = p && p.duracionMin ? p.duracionMin : '';
    $('p-empleado').value = p ? p.empleado || '' : '';
    $('p-controla-stock').checked = p ? itemControlaStock(p) : (tipo === 'PRODUCTO_NORMAL' && !FK.tiene('sinStock'));
    $('p-venta-pos').checked = p ? (p.ventaPOS != null ? !!p.ventaPOS : FK.vendible(p)) : true;
    $('p-precios-admin-wrap').classList.toggle('hidden', !FK.esAdmin());
    const cats = [...new Set(e.productos.map(x => (x.categoria || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    $('dl-categorias').innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');
    $('dl-empleados').innerHTML = (e.usuarios || []).map(u => `<option value="${esc(u.nombre || u.usuario)}">`).join('');
    const rl = $('p-receta-lista'); rl.innerHTML = '';
    (p && p.receta ? p.receta : []).forEach(r => rl.appendChild(filaIngrediente(r, p.id)));
    const lista = $('p-variantes-lista'); lista.innerHTML = '';
    if (FK.tiene('variantes')) (p && p.variantes && p.variantes.length ? p.variantes : []).forEach(v => lista.appendChild(filaVariante(v)));
    setTipoFormulario(tipo);
    FK.openModal('modal-producto');
    FK.enfocar(tipo === 'PRODUCTO_NORMAL' && !p ? 'p-codigo' : 'p-nombre');
  }
  FK.abrirProducto = abrirProducto;

  async function guardarProducto(ev) {
    ev.preventDefault();
    const e = FK.emp();
    const id = $('p-id').value;
    const tipo = $('p-tipo-item').value;
    const normal = tipo === 'PRODUCTO_NORMAL', plato = tipo === 'PLATO', servicio = tipo === 'SERVICIO';
    const nombre = $('p-nombre').value.trim();
    const codigo = normal ? $('p-codigo').value.trim() : '';
    const precioVariable = servicio && $('p-precio-variable').checked;
    const precio = FK.num($('p-precio').value);
    if (!nombre) return FK.toast('El nombre es obligatorio', 'error');
    if (precio < 0) return FK.toast('Precio no válido', 'error');
    if (!precioVariable && !(precio > 0) && !(await FK.confirmar('El precio es 0. ¿Guardar igualmente?', { titulo: 'Precio en cero', ok: 'Guardar' }))) return;
    if (codigo && e.productos.some(p => p.codigo === codigo && p.id !== id)) return FK.toast('Ya existe un ítem con ese código de barras', 'error');
    const impRaw = $('p-impuesto').value.trim();
    const impuestoPct = impRaw === '' ? null : Math.min(100, Math.max(0, FK.num(impRaw)));
    let imagen;
    try { imagen = await FK.leerImagen($('p-imagen').files[0]); } catch (_) { return FK.toast('La foto no es una imagen válida', 'error'); }
    let p = id ? e.productos.find(x => x.id === id) : null;
    if (!p) { p = { id: FK.uid(), creado: new Date().toISOString(), variantes: [], imagen: null }; e.productos.push(p); }
    const controla = !servicio && $('p-controla-stock').checked;
    Object.assign(p, {
      tipoItem: tipo, codigo: normal ? codigo : (p.codigo || ''), nombre, descripcion: $('p-descripcion').value.trim(),
      precio: FK.r2(precio), impuestoPct, categoria: $('p-categoria').value.trim(), controlaStock: controla,
      categoriaProducto: plato ? $('p-categoria-producto').value : (p.categoriaProducto || 'plato'),
      tipoVenta: normal && FK.tiene('peso') ? $('p-tipo-venta').value : 'unidad',
      ventaPOS: normal ? $('p-venta-pos').checked : true,
    });
    delete p.tipoInventario; // reemplazado por tipoItem
    if (FK.esAdmin()) { p.costo = FK.r2(FK.num($('p-precio-costo').value)); if (normal) p.mayor = FK.r2(FK.num($('p-precio-mayor').value)); }
    p.stockMinimo = normal && controla ? Math.max(0, Math.floor(FK.num($('p-stock-minimo').value)) || 0) : 0;
    if (imagen) p.imagen = imagen;
    // Campos propios de cada tipo (los de otros tipos se limpian)
    p.tiempoPrep = plato ? Math.max(0, Math.floor(FK.num($('p-tiempo-prep').value)) || 0) || null : null;
    p.agotado = plato && $('p-estado').value === 'agotado';
    p.receta = plato ? [...document.querySelectorAll('#p-receta-lista .ingrediente-row')].map(r => ({
      productoId: r.querySelector('.r-prod').value, cantidad: FK.num(r.querySelector('.r-cant').value)
    })).filter(r => r.productoId && r.cantidad > 0) : [];
    p.precioVariable = precioVariable;
    p.duracionMin = servicio ? Math.max(0, Math.floor(FK.num($('p-duracion').value)) || 0) || null : null;
    p.empleado = servicio ? $('p-empleado').value.trim() : '';
    if (normal && FK.tiene('variantes')) {
      p.variantes = [...document.querySelectorAll('#p-variantes-lista .variante-row')].map(r => ({
        id: r.dataset.vid || FK.uid(), modelo: r.querySelector('.v-modelo').value.trim(), talla: r.querySelector('.v-talla').value.trim(),
        stock: Math.max(0, Math.floor(FK.num(r.querySelector('.v-stock').value)))
      })).filter(v => v.modelo || v.talla);
    } else p.variantes = [];
    if (!controla) p.stock = servicio ? 0 : (p.stock || 0);
    else if (p.variantes.length) p.stock = stockDe(p);
    else p.stock = Math.max(0, Math.round(FK.num($('p-stock').value) * 1000) / 1000);
    FK.invalidarIndice();
    FK.store.saveNow();
    FK.closeModal('modal-producto');
    FK.toast(id ? 'Ítem actualizado' : 'Ítem agregado');
    if (render[tabActual]) render[tabActual]();
  }

  // ======================= CLIENTES =======================
  render.clientes = () => {
    const q = FK.norm($('cli-search').value.trim());
    const lista = FK.emp().clientes.filter(c => !q || FK.norm(c.nombre).includes(q) || FK.norm(c.cedula).includes(q) || FK.norm(c.correo).includes(q));
    $('clientes-tbody').innerHTML = lista.length ? lista.map(c => `<tr class="border-t border-gray-100 hover:bg-gray-50/60">
        <td class="px-5 py-3 font-semibold text-dark333">${esc(c.nombre)}</td>
        <td class="px-5 py-3 text-greym">${esc(c.cedula || '-')}</td>
        <td class="px-5 py-3 text-greym">${esc(c.telefono || '-')}</td>
        <td class="px-5 py-3 text-greym">${esc(c.correo || '-')}</td>
        <td class="px-5 py-3 text-right whitespace-nowrap">
          <button data-hist="${c.id}" class="text-xs font-semibold text-teal hover:underline mr-3">Historial</button>
          <button data-edit="${c.id}" class="text-xs font-semibold text-primary hover:underline mr-3">Editar</button>
          ${FK.esAdmin() ? `<button data-del="${c.id}" class="text-xs font-semibold text-accent hover:underline">Eliminar</button>` : ''}
        </td></tr>`).join('')
      : `<tr><td colspan="5" class="text-center text-greym py-10">${FK.emp().clientes.length ? 'Ningún cliente coincide' : 'Aún no hay clientes registrados'}</td></tr>`;
  };

  let clienteGuardadoCb = null;
  function abrirCliente(c, pre = {}, cb = null) {
    clienteGuardadoCb = cb;
    $('form-cliente').reset();
    $('modal-cliente-title').textContent = c ? 'Editar Cliente' : 'Nuevo Cliente';
    $('c-id').value = c ? c.id : '';
    $('c-nombre').value = c ? c.nombre : pre.nombre || '';
    $('c-cedula').value = c ? c.cedula || '' : pre.cedula || '';
    $('c-telefono').value = c ? c.telefono || '' : '';
    $('c-correo').value = c ? c.correo || '' : '';
    FK.openModal('modal-cliente');
    FK.enfocar(c || pre.nombre ? 'c-cedula' : 'c-nombre');
  }
  FK.abrirCliente = abrirCliente;

  function guardarCliente(ev) {
    ev.preventDefault();
    const e = FK.emp();
    const id = $('c-id').value;
    const nombre = $('c-nombre').value.trim();
    const cedula = $('c-cedula').value.trim().toUpperCase();
    const correo = $('c-correo').value.trim();
    if (!nombre) return FK.toast('El nombre es obligatorio', 'error');
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return FK.toast('El correo no es válido', 'error');
    if (cedula && e.clientes.some(c => FK.norm(c.cedula) === FK.norm(cedula) && c.id !== id)) return FK.toast('Ya existe un cliente con esa cédula/RIF', 'error');
    let c = id ? e.clientes.find(x => x.id === id) : null;
    if (!c) { c = { id: FK.uid(), creado: new Date().toISOString() }; e.clientes.push(c); }
    Object.assign(c, { nombre, cedula, telefono: $('c-telefono').value.trim(), correo });
    FK.store.saveNow();
    FK.closeModal('modal-cliente');
    FK.toast(id ? 'Cliente actualizado' : 'Cliente registrado');
    const cb = clienteGuardadoCb; clienteGuardadoCb = null;
    if (cb) cb(c);
    if (tabActual === 'clientes') render.clientes();
  }

  function abrirHistorial(c) {
    const ventas = FK.emp().ventas.filter(v => v.clienteId === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    $('hist-cliente-title').textContent = 'Historial · ' + c.nombre;
    const total = ventas.reduce((s, v) => s + v.total, 0);
    $('hist-cantidad-compras').textContent = ventas.length;
    $('hist-gasto-total').textContent = FK.usd(total);
    let frecuencia = null;
    if (ventas.length >= 2) {
      const primera = new Date(ventas[ventas.length - 1].fecha), ultima = new Date(ventas[0].fecha);
      frecuencia = (ultima - primera) / 86400000 / (ventas.length - 1);
    }
    $('hist-frecuencia').textContent = frecuencia == null ? '-' : frecuencia < 1 ? '<1' : Math.round(frecuencia);

    const recs = [];
    if (ventas.length) {
      const conteo = {};
      ventas.forEach(v => v.items.forEach(it => { conteo[it.nombre] = (conteo[it.nombre] || 0) + (it.porPeso ? 1 : it.cantidad); }));
      const top = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 3);
      recs.push(['⭐', `Compra habitualmente: <b>${top.map(([n, q]) => `${esc(n)} (${q})`).join(', ')}</b>. Ten stock disponible para él.`]);
      recs.push(['🧾', `Ticket promedio: <b>${FK.usd(total / ventas.length)}</b>.`]);
      const dias = Math.floor((Date.now() - new Date(ventas[0].fecha)) / 86400000);
      if (frecuencia != null && dias > Math.max(3, frecuencia * 1.5)) recs.push(['📣', `Su última compra fue hace <b>${dias} días</b>, más de lo habitual. Buen momento para contactarlo${c.telefono ? ' al ' + esc(c.telefono) : ''} u ofrecerle una promoción.`]);
      else recs.push(['🕒', `Última compra: <b>${dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : 'hace ' + dias + ' días'}</b>.`]);
      if (!c.correo) recs.push(['✉️', 'No tiene correo registrado: agrégalo para enviarle sus facturas automáticamente.']);
    }
    $('hist-recomendaciones').innerHTML = recs.map(([i, t]) => `<div class="flex gap-2 bg-primary/5 rounded-lg p-2.5 text-xs text-dark333"><span>${i}</span><span>${t}</span></div>`).join('');
    $('hist-ventas-lista').innerHTML = ventas.slice(0, 50).map(v => `<button data-vid="${v.id}" class="flex items-center justify-between bg-gray-50 hover:bg-primary/5 rounded-xl px-3 py-2 text-left transition">
        <div><div class="text-sm font-semibold text-dark333">Factura N° ${FK.nroFactura(v.numero)}</div>
        <div class="text-[11px] text-greym">${FK.fechaHora(v.fecha)} · ${v.items.length} ítem(s) · ${esc(FK.metodoNombre(v.metodoPago))}</div></div>
        <div class="text-sm font-bold text-teal">${FK.usd(v.total)}</div></button>`).join('');
    $('hist-ventas-vacio').classList.toggle('hidden', ventas.length > 0);
    $('hist-ventas-lista').onclick = (ev) => {
      const b = ev.target.closest('[data-vid]'); if (!b) return;
      verFactura(FK.emp().ventas.find(v => v.id === b.dataset.vid));
    };
    FK.openModal('modal-historial-cliente');
  }

  // ======================= REPORTES =======================
  let periodo = 'diario';
  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  function datosGrafico() {
    const ventas = FK.emp().ventas;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const buckets = [];
    if (periodo === 'diario') {
      for (let i = 13; i >= 0; i--) { const d = new Date(hoy); d.setDate(d.getDate() - i); const f = new Date(d); f.setDate(f.getDate() + 1); buckets.push({ ini: d, fin: f, label: `${d.getDate()}/${d.getMonth() + 1}` }); }
    } else if (periodo === 'semanal') {
      const lunes = new Date(hoy); lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
      for (let i = 7; i >= 0; i--) { const d = new Date(lunes); d.setDate(d.getDate() - i * 7); const f = new Date(d); f.setDate(f.getDate() + 7); buckets.push({ ini: d, fin: f, label: `${d.getDate()}/${d.getMonth() + 1}` }); }
    } else {
      for (let i = 11; i >= 0; i--) { const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1); const f = new Date(d.getFullYear(), d.getMonth() + 1, 1); buckets.push({ ini: d, fin: f, label: `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` }); }
    }
    const values = buckets.map(b => FK.r2(ventas.filter(v => { const t = new Date(v.fecha); return t >= b.ini && t < b.fin; }).reduce((s, v) => s + v.total, 0)));
    return { labels: buckets.map(b => b.label), values };
  }

  function dibujarGrafico() {
    document.querySelectorAll('.grafico-tab-btn').forEach(b => b.classList.toggle('grafico-activo', b.dataset.grafico === periodo));
    const d = datosGrafico();
    const vacio = d.values.every(v => !v);
    $('grafico-vacio').classList.toggle('hidden', !vacio);
    $('grafico-ventas-canvas').parentElement.classList.toggle('hidden', vacio);
    if (!vacio) FKChart.barChart($('grafico-ventas-canvas'), { ...d, color: FK.tema.css('secundario'), format: (v) => '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(v < 10 ? 2 : 0)) });
  }

  const ESTADO_CORREO = {
    enviado: '<span class="text-[11px] font-semibold text-teal">✓ Enviado</span>',
    enviando: '<span class="text-[11px] font-semibold text-greym">Enviando…</span>',
    error: '<span class="text-[11px] font-semibold text-accent">✗ Error</span>',
    'no-configurado': '<span class="text-[11px] font-semibold text-amber-600">Sin configurar</span>',
    'no-enviado': '<span class="text-[11px] text-greym">No enviado</span>',
    'sin-correo': '<span class="text-[11px] text-greym">—</span>',
    pendiente: '<span class="text-[11px] text-greym">—</span>'
  };

  // Suma el stock real de un producto (si tiene variantes, el total de
  // todas sus variantes; si no, su propio campo stock). Mismo criterio que
  // ya usa el POS para saber si hay existencias.
  function stockTotalProducto(p) {
    return p.variantes && p.variantes.length ? p.variantes.reduce((s, v) => s + (Number(v.stock) || 0), 0) : Number(p.stock) || 0;
  }
  FK.stockTotalProducto = stockTotalProducto;

  function pintarValoracionInventario() {
    const cont = $('valoracion-inventario');
    if (!cont) return;
    const filtro = $('val-tipo').value;
    const productos = FK.emp().productos.filter(p => p.activo !== false && itemControlaStock(p) && (filtro === 'TODOS' || tipoItem(p) === filtro));
    let valorVenta = 0, invertido = 0;
    for (const p of productos) {
      const stock = stockTotalProducto(p);
      if (stock <= 0) continue;
      valorVenta += stock * (Number(p.precio) || 0);
      invertido += stock * (Number(p.costo) || 0);
    }
    valorVenta = FK.r2(valorVenta); invertido = FK.r2(invertido);
    const ganancia = FK.r2(valorVenta - invertido);
    const tarjeta = (titulo, valor, tono, nota) => `
      <div class="rounded-xl border border-gray-100 p-4">
        <div class="text-xs text-greym">${titulo}</div>
        <div class="text-xl font-bold ${tono} mt-1">${FK.usd(valor)}</div>
        <div class="text-[11px] text-greym mt-0.5">${nota}</div>
      </div>`;
    cont.innerHTML =
      tarjeta('Valoración a precio de venta', valorVenta, 'text-dark333', 'Stock actual × precio de venta (solo ítems con control de stock)') +
      tarjeta('Dinero invertido', invertido, 'text-primary', 'Stock actual × costo de adquisición') +
      tarjeta('Ganancia potencial', ganancia, ganancia >= 0 ? 'text-teal' : 'text-accent',
        valorVenta > 0 ? `Margen del ${((ganancia / valorVenta) * 100).toFixed(1)}% si se vende todo` : 'Sin inventario valorado');
  }

  // Ventas e ingresos separados por tipo de ítem (platos / productos / servicios).
  function pintarVentasPorTipo() {
    const cont = $('ventas-por-tipo');
    if (!cont) return;
    const dias = parseInt($('ventas-tipo-periodo').value, 10);
    let desde = 0;
    if (dias === 1) { const h = new Date(); h.setHours(0, 0, 0, 0); desde = h.getTime(); }
    else if (dias > 1) desde = Date.now() - dias * 86400000;
    const acum = { PLATO: { n: 0, total: 0 }, PRODUCTO_NORMAL: { n: 0, total: 0 }, SERVICIO: { n: 0, total: 0 } };
    const ix = indice();
    for (const v of FK.emp().ventas) {
      if (desde && new Date(v.fecha).getTime() < desde) continue;
      const factor = v.subtotal > 0 ? v.total / v.subtotal : 1; // reparte el descuento entre los ítems
      for (const it of v.items) {
        const t = it.tipoItem || (it.productoId && ix.tipo.get(it.productoId)) || 'PRODUCTO_NORMAL';
        acum[t].n += it.porPeso ? 1 : it.cantidad;
        acum[t].total += (Number(it.subtotal) || 0) * factor;
      }
    }
    cont.innerHTML = ORDEN_TIPOS.map(t => `
      <div class="rounded-xl border border-gray-100 p-4">
        <div class="text-xs text-greym">${TIPOS_ITEM[t].icono} ${TIPOS_ITEM[t].corto}</div>
        <div class="text-xl font-bold text-dark333 mt-1">${FK.usd(FK.r2(acum[t].total))}</div>
        <div class="text-[11px] text-greym mt-0.5">${acum[t].n} vendido(s)</div>
      </div>`).join('');
  }

  render.reportes = () => {
    pintarValoracionInventario();
    pintarVentasPorTipo();
    requestAnimationFrame(dibujarGrafico);
    const ventas = [...FK.emp().ventas].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 300);
    $('ventas-tbody').innerHTML = ventas.length ? ventas.map(v => `<tr class="border-t border-gray-100 hover:bg-gray-50/60">
        <td class="px-5 py-3 font-mono text-xs text-greym">${FK.nroFactura(v.numero)}</td>
        <td class="px-5 py-3 text-greym whitespace-nowrap">${FK.fechaHora(v.fecha)}</td>
        <td class="px-5 py-3"><div class="font-semibold text-dark333">${esc(v.clienteNombre)}</div><div class="text-[11px] text-greym">${esc(FK.metodoNombre(v.metodoPago))} · ${esc(v.usuario)}</div></td>
        <td class="px-5 py-3 text-right"><div class="font-bold text-teal">${FK.usd(v.total)}</div><div class="text-[11px] text-primary">${FK.bs(v.totalBs)}</div></td>
        <td class="px-5 py-3 text-center">${ESTADO_CORREO[v.correo] || '—'}${v.clienteCorreo && v.correo !== 'enviado' && v.correo !== 'enviando' ? `<br><button data-mail="${v.id}" class="text-[11px] text-primary font-semibold hover:underline" title="${esc(v.correoError || '')}">Enviar</button>` : ''}</td>
        <td class="px-5 py-3 text-right whitespace-nowrap"><button data-ver="${v.id}" class="text-xs font-semibold text-primary hover:underline mr-2">Ver</button><button data-print="${v.id}" class="text-xs font-semibold text-greym hover:text-primary">🖨️</button></td>
      </tr>`).join('') : '<tr><td colspan="6" class="text-center text-greym py-10">Aún no hay ventas registradas</td></tr>';
  };
  FK.onVentasCambiadas = () => { if (tabActual === 'reportes' && FK.emp()) render.reportes(); };

  // ======================= ENLACES DE EVENTOS =======================
  function init() {
    // Notificaciones siempre visibles, por encima de todo
    document.body.appendChild($('toast-zone'));

    document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => irTab(b.dataset.tab)));
    $('btn-logout').onclick = salir;
    $('btn-caja-salir').onclick = salir;
    $('btn-tasa-badge').onclick = abrirOpcionesCaja;

    $('form-apertura-caja').onsubmit = (ev) => {
      ev.preventDefault();
      const tasa = FK.r2(FK.num($('caja-tasa').value));
      if (!(tasa > 0)) return FK.toast('Ingresa una tasa válida', 'error');
      FK.emp().cajas.push({ id: FK.uid(), abierta: true, tasa, abiertaPor: FK.sesion.usuario.usuario, fechaApertura: new Date().toISOString(), historialTasa: [{ tasa, fecha: new Date().toISOString() }] });
      FK.store.saveNow();
      FK.toast(`Caja abierta · Tasa ${FK.bs(tasa)}`);
      mostrarApp();
    };
    $('btn-caja-reintentar').onclick = async () => {
      await FK.store.load();
      const emp = FK.store.data.empresas.find(x => x.id === FK.emp().id);
      if (emp) { FK.sesion.empresa = emp; FK.sesion.usuario = emp.usuarios.find(u => u.id === FK.sesion.usuario.id) || FK.sesion.usuario; }
      if (FK.caja()) mostrarApp(); else FK.toast('La caja todavía no está abierta', 'error');
    };
    $('form-actualizar-tasa').onsubmit = (ev) => {
      ev.preventDefault();
      const c = FK.caja(); const tasa = FK.r2(FK.num($('co-tasa').value));
      if (!c || !(tasa > 0)) return FK.toast('Ingresa una tasa válida', 'error');
      c.tasa = tasa; (c.historialTasa = c.historialTasa || []).push({ tasa, fecha: new Date().toISOString(), usuario: FK.sesion.usuario.usuario });
      FK.store.saveNow();
      FK.closeModal('modal-caja-opciones');
      actualizarTasaBadge();
      FK.toast(`Tasa actualizada a ${FK.bs(tasa)}`);
      if (render[tabActual]) render[tabActual]();
    };
    $('btn-cerrar-caja').onclick = abrirResumenCierre;
    $('btn-confirmar-cierre-caja').onclick = confirmarCierre;

    // POS
    $('pos-search').addEventListener('input', renderProductosPOS);
    $('pos-products-grid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pid]'); if (!b) return;
      agregarProducto(FK.emp().productos.find(p => p.id === b.dataset.pid));
    });
    $('barcode-input').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const cod = e.target.value.trim(); e.target.value = '';
      if (!cod) return;
      const p = FK.emp().productos.find(x => x.codigo && x.codigo === cod && FK.vendible(x));
      if (!p) return FK.toast(`Código "${cod}" no encontrado`, 'error');
      agregarProducto(p);
    });
    $('cart-items').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const it = pos.carrito.find(i => i.key === b.dataset.key); if (!it) return;
      if (b.dataset.act === 'precio') { const ps = FK.emp().productos.find(x => x.id === it.productoId); if (ps) abrirServicio(ps, it); return; }
      if (b.dataset.act === 'del') pos.carrito = pos.carrito.filter(i => i !== it);
      else if (b.dataset.act === 'menos') { it.cantidad -= 1; if (it.cantidad <= 0) pos.carrito = pos.carrito.filter(i => i !== it); }
      else if (b.dataset.act === 'mas' && it.precioVariable) it.cantidad += 1;
      else if (b.dataset.act === 'mas') {
        const p = FK.emp().productos.find(x => x.id === it.productoId);
        if (p) { const v = it.varianteId ? p.variantes.find(x => x.id === it.varianteId) : null; agregarItem(p, v, 1); return; }
      }
      renderCarrito();
    });
    $('btn-limpiar-carrito').onclick = async () => {
      if (!pos.carrito.length) return;
      if (await FK.confirmar('¿Vaciar el carrito actual?', { titulo: 'Vaciar carrito', ok: 'Vaciar', peligro: true })) { pos.carrito = []; pos.promo = null; renderPromo(); renderCarrito(); }
    };
    $('btn-generar-factura').onclick = generarFactura;
    FK.buscadorClientes('cliente-search', 'cliente-results', seleccionarClientePOS);

    $('btn-aplicar-promo').onclick = async () => {
      const codigo = $('promo-codigo').value.trim().toUpperCase();
      const clave = $('promo-clave').value;
      if (!codigo || !clave) return FK.toast('Ingresa el código y la clave de aprobación', 'error');
      const p = FK.emp().promociones.find(x => x.codigo === codigo);
      if (!p) return FK.toast('Código de promoción no encontrado', 'error');
      if (!p.activa) return FK.toast('Esta promoción está desactivada', 'error');
      if ((await FK.hash(clave, p.sal)) !== p.claveHash) return FK.toast('Clave de aprobación incorrecta', 'error');
      pos.promo = p;
      $('promo-codigo').value = ''; $('promo-clave').value = '';
      renderPromo(); renderCarrito();
      FK.toast('Descuento aplicado');
    };
    $('btn-quitar-promo').onclick = () => { pos.promo = null; renderPromo(); renderCarrito(); };

    $('btn-auto-registrar').onclick = () => {
      const nombre = $('auto-nombre').value.trim();
      if (!nombre) { FK.toast('Escribe tu nombre para comenzar', 'error'); $('auto-nombre').focus(); return; }
      pos.comprador = { nombre, cedula: $('auto-cedula').value.trim().toUpperCase() };
      $('auto-nombre').value = ''; $('auto-cedula').value = '';
      renderComprador();
      $('barcode-input').focus();
    };
    $('auto-cedula').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-auto-registrar').click(); });
    $('auto-nombre').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-auto-registrar').click(); });
    $('btn-auto-cambiar').onclick = () => { pos.comprador = null; pos.carrito = []; render.pos(); };

    $('peso-valor').addEventListener('input', () => {
      if (productoPeso) $('peso-total').textContent = FK.usd(FK.num($('peso-valor').value) * productoPeso.precio);
    });
    $('form-peso').onsubmit = (e) => {
      e.preventDefault();
      const kg = Math.round(FK.num($('peso-valor').value) * 1000) / 1000;
      if (!(kg > 0)) return FK.toast('Ingresa un peso válido', 'error');
      if (agregarItem(productoPeso, null, kg, true)) FK.closeModal('modal-peso');
    };

    // Vista previa de factura
    $('btn-preview-imprimir').onclick = () => ventaVista && FK.imprimir(FK.doc.ticketPOS(ventaVista, FK.emp()), { destino: 'caja', ancho: 58 });
    $('btn-preview-descargar').onclick = (e) => { e.preventDefault(); if (ventaVista) FK.pdfFactura(ventaVista); };
    $('btn-preview-whatsapp').onclick = () => {
      if (!ventaVista) return;
      $('whatsapp-telefono').value = ventaVista.clienteTelefono || '';
      $('whatsapp-pegar-wrap').classList.toggle('hidden', !(window.api && window.api.pegarEnWhatsapp));
      $('whatsapp-manual').checked = !!(FK.emp().mensajesWhatsApp && FK.emp().mensajesWhatsApp.manual);
      $('whatsapp-vel-wrap').classList.toggle('hidden', !(window.api && window.api.pegarEnWhatsapp));
      $('whatsapp-velocidad').value = String((FK.emp().mensajesWhatsApp || {}).velocidad || 1);
      FK.openModal('modal-whatsapp');
      FK.enfocar('whatsapp-telefono');
    };
    $('btn-wa-registro').onclick = () => window.api && window.api.registroWhatsapp && window.api.registroWhatsapp();
    $('btn-wa-recopiar').onclick = async () => {
      const ok = FK.ultimaImagenFactura && window.api.copiarImagenFactura ? await window.api.copiarImagenFactura(FK.ultimaImagenFactura) : false;
      FK.toast(ok ? 'Imagen copiada de nuevo: pégala con Ctrl+V' : 'No se pudo copiar la imagen', ok ? undefined : 'error');
    };
    $('form-whatsapp').onsubmit = async (e) => {
      e.preventDefault();
      if (!ventaVista) return;
      const mw = FK.emp().mensajesWhatsApp;
      if (mw) {
        const vel = Number($('whatsapp-velocidad').value) || 1;
        if (!!mw.manual !== $('whatsapp-manual').checked || (mw.velocidad || 1) !== vel) { mw.manual = $('whatsapp-manual').checked; mw.velocidad = vel; FK.store.save(); }
      }
      const ok = await FK.enviarFacturaWhatsapp(ventaVista, $('whatsapp-telefono').value);
      if (ok) FK.closeModal('modal-whatsapp');
    };
    $('preview-factura-fallback-link').onclick = (e) => { e.preventDefault(); if (ventaVista) FK.pdfFactura(ventaVista); };
    $('btn-preview-ticket58').onclick = verTicket58;
    $('btn-ticket58-imprimir').onclick = () => ventaVista && FK.imprimir(FK.doc.ticket58(ventaVista, FK.emp()), { destino: 'caja', ancho: 58 });
    $('btn-ticket58-cargar-cae').onclick = () => {
      if (!ventaVista) return;
      $('cae-numero').value = ventaVista.cae || '';
      $('cae-vencimiento').value = ventaVista.caeVencimiento || '';
      FK.openModal('modal-cargar-cae');
      FK.enfocar('cae-numero');
    };
    $('form-cargar-cae').onsubmit = (e) => {
      e.preventDefault();
      const cae = $('cae-numero').value.replace(/\s/g, '');
      if (!/^\d{6,20}$/.test(cae)) return FK.toast('El CAE debe contener solo números', 'error');
      ventaVista.cae = cae; ventaVista.caeVencimiento = $('cae-vencimiento').value.trim();
      FK.store.saveNow();
      FK.closeModal('modal-cargar-cae');
      $('preview-ticket58-iframe').srcdoc = FK.doc.ticket58(ventaVista, FK.emp());
      FK.toast('CAE guardado');
    };

    // Inventario
    $('inv-search').addEventListener('input', () => render.inventario());
    $('btn-nuevo-producto').onclick = () => abrirProducto(null);
    $('val-tipo').addEventListener('change', pintarValoracionInventario);
    $('ventas-tipo-periodo').addEventListener('change', pintarVentasPorTipo);
    $('btn-exportar-excel').onclick = exportarInventarioExcel;
    $('inv-subtabs').addEventListener('click', (ev) => { const b = ev.target.closest('[data-tipo-inv]'); if (b) { invFiltroTipo = b.dataset.tipoInv; render.inventario(); } });
    $('pos-tipo-tabs').addEventListener('click', (ev) => { const b = ev.target.closest('[data-tipo-pos]'); if (b) { posFiltroTipo = b.dataset.tipoPos; renderProductosPOS(); } });
    document.querySelectorAll('.p-tipo-btn').forEach(b => b.addEventListener('click', () => setTipoFormulario(b.dataset.tipo)));
    ['p-controla-stock', 'p-precio-variable'].forEach(id => $(id).addEventListener('change', () => setTipoFormulario($('p-tipo-item').value)));
    $('btn-add-ingrediente').onclick = () => { $('p-receta-lista').appendChild(filaIngrediente({}, $('p-id').value)); };
    $('srv-precio').addEventListener('input', actualizarSrvBs);
    $('form-servicio').onsubmit = (ev) => {
      ev.preventDefault();
      if (!servicioActual) return;
      const precio = FK.r2(FK.num($('srv-precio').value));
      if (!(precio >= 0) || $('srv-precio').value === '') return FK.toast('Ingresa el precio del trabajo', 'error');
      const detalle = $('srv-detalle').value.trim();
      const { p, item } = servicioActual;
      if (item) {
        item.precio = precio; item.detalleExtra = detalle; item.detalle = detalle;
        item.key = p.id + '||' + precio + '|' + detalle;
        renderCarrito();
      } else if (!agregarItem(p, null, 1, false, { precio, detalle })) return;
      FK.closeModal('modal-servicio');
    };
    $('inventario-grid').addEventListener('click', async (e) => {
      const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]'), ago = e.target.closest('[data-agotar]');
      const emp = FK.emp();
      if (ago) { const pl = emp.productos.find(x => x.id === ago.dataset.agotar); if (pl) { pl.agotado = !pl.agotado; FK.store.saveNow(); render.inventario(); } return; }
      if (ed) abrirProducto(emp.productos.find(p => p.id === ed.dataset.edit));
      if (del) {
        const p = emp.productos.find(x => x.id === del.dataset.del);
        if (p && await FK.confirmar(`¿Eliminar "${p.nombre}" del inventario? Las facturas ya emitidas no se modifican.`, { titulo: 'Eliminar producto', ok: 'Eliminar', peligro: true })) {
          emp.productos = emp.productos.filter(x => x !== p); FK.invalidarIndice(); FK.store.saveNow(); render.inventario(); FK.toast('Producto eliminado');
        }
      }
    });
    $('form-producto').onsubmit = guardarProducto;
    $('btn-add-variante').onclick = () => { const f = filaVariante(); $('p-variantes-lista').appendChild(f); f.querySelector('.v-modelo').focus(); };
    $('p-tipo-venta').addEventListener('change', actualizarEtiquetaPrecio);

    // Clientes
    $('cli-search').addEventListener('input', () => render.clientes());
    $('btn-nuevo-cliente').onclick = () => abrirCliente(null);
    $('form-cliente').onsubmit = guardarCliente;
    $('clientes-tbody').addEventListener('click', async (e) => {
      const emp = FK.emp();
      const b = e.target.closest('[data-hist],[data-edit],[data-del]'); if (!b) return;
      const c = emp.clientes.find(x => x.id === (b.dataset.hist || b.dataset.edit || b.dataset.del));
      if (!c) return;
      if (b.dataset.hist) abrirHistorial(c);
      else if (b.dataset.edit) abrirCliente(c);
      else if (await FK.confirmar(`¿Eliminar al cliente "${c.nombre}"? Sus facturas se conservan.`, { titulo: 'Eliminar cliente', ok: 'Eliminar', peligro: true })) {
        emp.clientes = emp.clientes.filter(x => x !== c); FK.store.saveNow(); render.clientes(); FK.toast('Cliente eliminado');
      }
    });

    // Reportes
    document.querySelectorAll('.grafico-tab-btn').forEach(b => b.onclick = () => { periodo = b.dataset.grafico; dibujarGrafico(); });
    $('ventas-tbody').addEventListener('click', (e) => {
      const emp = FK.emp();
      const b = e.target.closest('[data-ver],[data-print],[data-mail]'); if (!b) return;
      const v = emp.ventas.find(x => x.id === (b.dataset.ver || b.dataset.print || b.dataset.mail));
      if (!v) return;
      if (b.dataset.ver) verFactura(v);
      else if (b.dataset.print) FK.imprimirVenta(v);
      else { FK.enviarFacturaCorreo(v); render.reportes(); }
    });
    let rz;
    window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (tabActual === 'reportes' && FK.emp() && !$('app-shell').classList.contains('hidden')) dibujarGrafico(); }, 150); });

    // Atajo: F2 enfoca el lector de código de barras en el POS
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F2' && FK.emp() && tabActual === 'pos') { e.preventDefault(); $('barcode-input').focus(); }
    });
  }

  FK.app = { init, entrar, salir, mostrarApp };
})();
