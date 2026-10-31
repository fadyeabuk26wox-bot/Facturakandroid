// FacturaK — utilidades comunes, almacenamiento y documentos imprimibles.
(function () {
  'use strict';
  const FK = window.FK = window.FK || {};
  const API = window.api && window.api.esEscritorio ? window.api : null;
  FK.API = API;

  // ---------- Utilidades ----------
  const $ = FK.$ = (id) => document.getElementById(id);
  FK.show = (el, disp) => { el = typeof el === 'string' ? $(el) : el; if (!el) return; el.classList.remove('hidden'); if (disp) el.classList.add(disp); };
  FK.hide = (el) => { el = typeof el === 'string' ? $(el) : el; if (!el) return; el.classList.add('hidden'); };
  FK.esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  FK.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  FK.generarClaveAPI = () => {
    const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let s = 'fk_live_';
    for (let i = 0; i < 32; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  };
  FK.r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  FK.num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };

  function fmtNum(n, miles, dec) {
    n = Number(n) || 0;
    const neg = n < 0; n = Math.abs(n);
    const [ent, fr] = n.toFixed(2).split('.');
    return (neg ? '-' : '') + ent.replace(/\B(?=(\d{3})+(?!\d))/g, miles) + dec + fr;
  }
  FK.usd = (n) => '$' + fmtNum(n, ',', '.');
  FK.bs = (n) => 'Bs ' + fmtNum(n, '.', ',');
  FK.kg = (n) => (Number(n) || 0).toFixed(3).replace(/\.?0+$/, '') + ' kg';
  FK.fecha = (iso) => { const d = new Date(iso); const p = (x) => String(x).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; };
  FK.fechaHora = (iso) => { const d = new Date(iso); const p = (x) => String(x).padStart(2, '0'); return `${FK.fecha(iso)} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  FK.hora = (iso) => { const d = new Date(iso); const p = (x) => String(x).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}`; };
  FK.nroFactura = (n) => String(n).padStart(8, '0');
  FK.norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  FK.metodoNombre = (k) => (window.FACTURAK_METODOS || {})[k] || k || '-';
  FK.rolNombre = (k) => (window.FACTURAK_ROLES || {})[k] || k;

  FK.hash = async (texto, sal) => {
    const data = new TextEncoder().encode(`${sal}::${texto}`);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  };
  FK.nuevaSal = () => Array.from(crypto.getRandomValues(new Uint8Array(12))).map(b => b.toString(16).padStart(2, '0')).join('');

  // Reduce imágenes a un tamaño razonable antes de guardarlas
  FK.leerImagen = (file, maxLado = 360) => new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagen no válida'));
      img.onload = () => {
        const esc = Math.min(1, maxLado / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const png = file.type === 'image/png' || file.type === 'image/svg+xml';
        resolve(c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.85));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });

  FK.copiar = async (texto) => {
    try { if (API) await API.copiar(texto); else await navigator.clipboard.writeText(texto); return true; }
    catch (_) { return false; }
  };

  // Enfoca un campo tras abrir un modal, salvo que el usuario ya esté escribiendo en otro
  FK.enfocar = (id, seleccionar = false) => setTimeout(() => {
    const el = $(id); if (!el) return;
    const a = document.activeElement;
    const cont = el.closest('.modal-overlay, #auth-screen, #caja-screen');
    if (a && a !== el && cont && cont.contains(a) && a.matches('input,textarea,select')) return;
    el.focus(); if (seleccionar && el.select) el.select();
  }, 50);

  // ---------- Notificaciones ----------
  FK.toast = (msg, tipo = 'ok') => {
    const z = $('toast-zone');
    if (!z) return;
    const d = document.createElement('div');
    d.className = 'fk-toast fk-toast-' + tipo;
    d.textContent = msg;
    z.appendChild(d);
    setTimeout(() => { d.classList.add('fk-toast-out'); setTimeout(() => d.remove(), 300); }, tipo === 'error' ? 5000 : 3200);
  };

  // ---------- Modales ----------
  FK.openModal = (id) => { const m = $(id); if (!m) return; m.classList.remove('hidden'); m.classList.add('flex'); document.body.appendChild(m); };
  FK.closeModal = (id) => { const m = typeof id === 'string' ? $(id) : id; if (m) m.classList.add('hidden'); };
  FK.closeModals = () => document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
  document.addEventListener('click', (e) => {
    const cerrar = e.target.closest('.modal-close');
    if (cerrar) { FK.closeModal(cerrar.closest('.modal-overlay')); return; }
    if (e.target.classList && e.target.classList.contains('modal-overlay') && !e.target.dataset.noOutsideClose) FK.closeModal(e.target);
  });
  // Las vistas previas (iframes) reenvían la tecla Escape al documento principal
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('iframe').forEach(f => f.addEventListener('load', () => {
      try {
        f.contentDocument.addEventListener('keydown', (ev) => {
          if (ev.key === 'Escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        });
      } catch (_) {}
    }));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const abiertos = [...document.querySelectorAll('.modal-overlay:not(.hidden)')];
    const top = abiertos[abiertos.length - 1];
    if (top && !top.dataset.noOutsideClose) FK.closeModal(top);
  });

  // Confirmación propia (evita los cuadros nativos, que en Windows dejan campos sin foco)
  FK.confirmar = (mensaje, { titulo = 'Confirmar', ok = 'Aceptar', peligro = false } = {}) => new Promise((resolve) => {
    $('confirm-titulo').textContent = titulo;
    $('confirm-mensaje').textContent = mensaje;
    const bOk = $('confirm-ok'), bNo = $('confirm-cancelar');
    bOk.textContent = ok;
    bOk.className = peligro
      ? 'flex-1 bg-accent hover:bg-accent/90 text-white font-bold py-2.5 rounded-xl transition active:scale-95'
      : 'flex-1 bg-teal hover:bg-teal/90 text-white font-bold py-2.5 rounded-xl transition active:scale-95';
    const fin = (v) => { bOk.onclick = bNo.onclick = null; FK.closeModal('modal-confirm'); resolve(v); };
    bOk.onclick = () => fin(true);
    bNo.onclick = () => fin(false);
    FK.openModal('modal-confirm');
    setTimeout(() => bOk.focus(), 50);
  });

  // ---------- Almacenamiento ----------
  const LS_KEY = 'facturak-datos';
  // Tiempos de guardado: cada cambio se guarda a los 250 ms; además hay un guardado
  // automático cada AUTO_MS aunque nadie toque nada, y se guarda al perder el foco,
  // al ocultar la ventana y al cerrar. Si hay un apagón, lo máximo que se pierde son
  // los últimos instantes (y el archivo nunca queda a medias: ver almacen.js).
  const AUTO_MS = 30000;
  FK.store = {
    data: null,
    _t: null,
    _sucio: false,
    recuperado: null,
    async load() {
      let raw = null, fallo = false;
      this.errorRed = null; this.bloqueado = false;
      // Red multi-dispositivo: si este equipo es cliente de una PC central (o es la central con el servidor
      // encendido), los datos vienen de red.js y NO del archivo local.
      if (FK.red) { try { await FK.red.preparar(); } catch (e) { console.error(e); } }
      const enRed = !!(FK.red && FK.red.activo());
      try { raw = enRed ? await FK.red.cargar() : (API ? await API.dbLoad() : localStorage.getItem(LS_KEY)); }
      catch (e) { console.error(e); fallo = true; if (enRed) { this.errorRed = String((e && e.message) || e); this.bloqueado = true; } }
      if (raw) { try { this.data = JSON.parse(raw); } catch (e) { console.error('Datos dañados', e); this.data = null; fallo = true; } }
      if (API && API.dbEstadoCarga) { try { const est = await API.dbEstadoCarga(); if (est && est.recuperado) this.recuperado = est; } catch (_) {} }
      if (!this.data || !Array.isArray(this.data.empresas)) {
        // Instalación nueva: base vacía. Si la lectura FALLÓ no se guarda nada encima
        // (para no pisar datos que quizá todavía se puedan recuperar).
        this.data = { version: 2, empresas: [], ultimoCodigo: '' };
        if (!fallo) this.saveNow();
      }
      if (migrarDatos(this.data)) this.saveNow();
      this._iniciarAuto();
      if (enRed && !this.bloqueado) FK.red.iniciar();
      return this.data;
    },
    save() { this._sucio = true; clearTimeout(this._t); this._t = setTimeout(() => this.saveNow(), 250); },
    saveNow() {
      clearTimeout(this._t); this._t = null; this._sucio = false;
      if (this.bloqueado) return;     // no se pudo cargar la copia de la PC central: no se escribe nada encima
      const s = JSON.stringify(this.data);
      if (FK.red && FK.red.activo()) { FK.red.guardar(s); return; }
      try {
        if (API) { Promise.resolve(API.dbSave(s)).then(ok => { if (ok === false) FK.toast('No se pudieron guardar los datos', 'error'); }).catch(() => FK.toast('No se pudieron guardar los datos', 'error')); }
        else localStorage.setItem(LS_KEY, s);
      } catch (e) { console.error(e); FK.toast('No se pudieron guardar los datos', 'error'); }
    },
    flushSync() {
      if (!this._t && !this._sucio) return;
      clearTimeout(this._t); this._t = null; this._sucio = false;
      if (this.bloqueado) return;
      const s = JSON.stringify(this.data);
      if (FK.red && FK.red.activo()) { FK.red.guardar(s); FK.red.guardarSync(); return; }
      try { if (API) API.dbSaveSync(s); else localStorage.setItem(LS_KEY, s); } catch (_) {}
    },
    _iniciarAuto() {
      if (this._auto) return;
      // Guardado periódico: reescribe aunque no haya pasado por save() (p. ej. cambios que olvidaron llamarlo)
      this._auto = setInterval(() => { if (this.data && this.data.empresas.length) this.saveNow(); }, AUTO_MS);
      window.addEventListener('blur', () => this.flushSync());
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.flushSync(); });
    }
  };
  window.addEventListener('beforeunload', () => FK.store.flushSync());

  function normalizarEmpresa(e) {
    const def = {
      usuarios: [], productos: [], clientes: [], ventas: [], pedidos: [], cajas: [], mesas: [], estaciones: [],
      sesionesCiber: [], promociones: [], prestamos: [], secuenciaFactura: 0, telefono: '',
      mensajesWhatsApp: {
        factura: 'Hola {cliente}, te enviamos tu factura N° {factura} de *{empresa}* por un total de *{total}* ({total_bs}). ¡Gracias por tu compra! 🧾',
        stockBajo: '📦 Alerta de stock bajo en *{empresa}*:\n{lista}\nRevisa el inventario para reponer a tiempo.',
        stockBajoTelefono: ''
      },
      funcionesOverride: {},
      modulos: {},
      apiConfig: {
        clave: '', creada: '',
        funciones: { facturacion: true, inventario: true, clientes: true, reportes: true, whatsapp: false, sincronizacion: true },
        limiteDiario: 500, limiteMinuto: 10, restringirIp: false, ips: '',
      },
      fiscal: { activo: false, cuit: '', ingresosBrutos: '', inicioActividades: '', condicionIva: 'Monotributo', puntoVenta: 1, tipoComprobante: 'C', ivaPct: 21 },
      impresoras: { activa: false, cocina: '', caja: '' },
      correo: { activo: false, host: 'smtp.gmail.com', puerto: 465, seguridad: 'ssl', usuario: '', password: '', remitente: '' }
    };
    for (const k in def) if (e[k] == null) e[k] = def[k];
    (FK.normalizadores || []).forEach(n => n(e));
    return e;
  }
  FK.normalizarEmpresa = normalizarEmpresa;

  FK.generarCodigoEmpresa = (data) => {
    let c;
    do { c = 'FK-' + Array.from(crypto.getRandomValues(new Uint8Array(3))).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase(); }
    while (data.empresas.some(e => e.codigo === c));
    return c;
  };

  FK.crearUsuario = async (usuario, password, rol, factura = false) => {
    const sal = FK.nuevaSal();
    const u = { id: FK.uid(), usuario, sal, hash: await FK.hash(password, sal), rol, activo: true, creado: new Date().toISOString() };
    if (rol === 'vendedor') u.factura = !!factura;     // vendedor: false = solo toma pedidos; true = también factura
    return u;
  };

  // ---------- Migraciones de datos (compatibilidad con la base v1) ----------
  // Cada módulo puede registrar normalizadores (valores por defecto) y migraciones.
  FK.normalizadores = FK.normalizadores || [];
  FK.migraciones = FK.migraciones || [];
  function migrarDatos(data) {
    let cambio = false;
    // v2: FacturaK sale a producción sin empresa de prueba. Se elimina la empresa demo
    // solo si nunca se usó (sin cajas ni ventas); si tiene movimientos se conserva.
    const antes = data.empresas.length;
    data.empresas = data.empresas.filter(e => !(e.demo && !(e.ventas || []).length && !(e.cajas || []).length));
    if (data.empresas.length !== antes) { cambio = true; if (data.ultimoCodigo === 'FK-DEMO01') data.ultimoCodigo = ''; }
    const mapa = window.FACTURAK_RUBROS_MIGRADOS || {};
    data.empresas.forEach(e => {
      if (mapa[e.categoria]) { e.categoria = mapa[e.categoria]; cambio = true; }
      normalizarEmpresa(e);
      FK.migraciones.forEach(m => { if (m(e)) cambio = true; });
    });
    if ((data.version || 1) < 2) { data.version = 2; cambio = true; }
    return cambio;
  }

  // ---------- Sesión ----------
  FK.sesion = { empresa: null, usuario: null };
  FK.emp = () => FK.sesion.empresa;
  FK.esAdmin = () => FK.sesion.usuario && FK.sesion.usuario.rol === 'admin';
  FK.rol = () => FK.sesion.usuario ? FK.sesion.usuario.rol : null;
  // Única lista de funciones activables/desactivables de FacturaK — la usan
  // tanto el registro de empresa nueva (selección libre) como "Funciones
  // del sistema" en Ajustes (para cambiarla después).
  FK.FUNCIONES_TOGGLEABLES = [
    { clave: 'mesas', label: 'Mesas y comandas a cocina', detalle: 'Para restaurantes: divide el inventario en Platos e Insumos.', icono: 'M4 6h16M6 6v14M18 6v14M4 12h16' },
    { clave: 'sinStock', label: 'Venta sin control de stock', detalle: 'Los ítems nuevos nacen sin control de stock (se puede cambiar en la ficha de cada uno).', icono: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' },
    { clave: 'peso', label: 'Venta por peso (kg)', detalle: 'Para productos que se venden a granel.', icono: 'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3' },
    { clave: 'variantes', label: 'Variantes (modelo / talla)', detalle: 'Para ropa, calzado y productos con tallas o modelos.', icono: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z' },
    { clave: 'estaciones', label: 'Estaciones por tiempo (ciber)', detalle: 'Cobro por tiempo de uso de un puesto o equipo.', icono: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { clave: 'creditos', label: 'Ventas a crédito / financiamiento', detalle: 'Cuotas, moras y cobranza por WhatsApp.', icono: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  ];

  // Módulos principales: se eligen al registrar la empresa y deciden qué
  // secciones de la app se ven. Si una empresa no tiene e.modulos (cuentas
  // anteriores), todos cuentan como activados — nada desaparece por sorpresa.
  FK.MODULOS = [
    { clave: 'pos', label: 'Punto de Venta (POS) y Facturación', detalle: 'Ventas, carrito, cobro, facturas, clientes y promociones.', icono: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z' },
    { clave: 'inventario', label: 'Control de Inventario y Stock', detalle: 'Productos, existencias, costos y alertas de stock bajo.', icono: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    { clave: 'termica', label: 'Impresión Térmica (58mm)', detalle: 'Imprime los tickets de venta en impresoras de rollo de 58mm.', icono: 'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z' },
    { clave: 'whatsapp', label: 'Notificaciones / WhatsApp', detalle: 'Envío de facturas y alertas por WhatsApp, con mensajes editables.', icono: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
    { clave: 'reportes', label: 'Reportes y Estadísticas de Ventas', detalle: 'Gráficos de ventas y valoración del inventario.', icono: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { clave: 'usuarios', label: 'Gestión de Usuarios y Roles', detalle: 'Cajeros, administradores y permisos por rol.', icono: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
  ];
  FK.tieneModulo = (m) => { const e = FK.emp(); const mods = e && e.modulos; return !mods || mods[m] !== false; };

  FK.cat = () => (window.FACTURAK_CATEGORIAS || {})[FK.emp()?.categoria] || { funciones: [] };
  // Un módulo está activo según el rubro, salvo que el administrador lo haya
  // encendido o apagado a mano desde "Funciones del sistema"
  // (e.funcionesOverride: { clave: true|false }), lo cual tiene prioridad.
  FK.tiene = (f) => {
    const e = FK.emp();
    const ov = e && e.funcionesOverride;
    if (ov && Object.prototype.hasOwnProperty.call(ov, f)) return !!ov[f];
    return (FK.cat().funciones || []).includes(f) || (e && (e.funcionesExtra || []).includes(f));
  };
  FK.caja = () => FK.emp() ? FK.emp().cajas.find(c => c.abierta) : null;
  FK.tasa = () => { const c = FK.caja(); if (c) return c.tasa; const e = FK.emp(); const u = e && e.cajas && e.cajas[e.cajas.length - 1]; return u ? u.tasa : 0; };   // sin caja abierta: última tasa conocida

  // ---------- Documentos imprimibles ----------
  // Colores de la factura = colores que la empresa eligió en Personalización (tema.colores)
  const hexOk = (h) => /^#[0-9a-fA-F]{6}$/.test(String(h || '').trim());
  const rgbDe = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const luminancia = (h) => { const [r, g, b] = rgbDe(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const aHex = (rgb) => '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mezclar = (h, con, t) => aHex(rgbDe(h).map((v, i) => v * (1 - t) + con[i] * t));
  // Color usable como TEXTO sobre fondo blanco: si es muy claro se oscurece hasta que se lea.
  const comoTexto = (h) => { let c = h, n = 0; while (luminancia(c) > 0.30 && n++ < 12) c = mezclar(c, [0, 0, 0], 0.15); return c; };
  FK.coloresFactura = (e) => {
    const c = (e && e.tema && e.tema.colores) || {};
    const primario = hexOk(c.primario) ? c.primario.trim() : '#004E98';
    const secundario = hexOk(c.secundario) ? c.secundario.trim() : '#00B89F';
    return { primario, secundario, textoPrimario: comoTexto(primario), textoSecundario: comoTexto(secundario),
      sobrePrimario: luminancia(primario) > 0.45 ? '#111827' : '#FFFFFF', caja: mezclar(primario, [255, 255, 255], 0.93) };
  };
  const cssFactura = (k) => `
    :root{--p:${k.primario};--pt:${k.textoPrimario};--s:${k.textoSecundario};--sp:${k.sobrePrimario};--caja:${k.caja}}
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact} body{font-family:"Segoe UI",Arial,sans-serif;color:#222;margin:0;padding:28px 34px;font-size:12.5px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid var(--p);padding-bottom:14px}
    .emp{display:flex;gap:14px;align-items:center}.emp img{max-height:64px;max-width:140px;object-fit:contain}
    .emp h1{margin:0;font-size:20px;color:var(--pt)}.muted{color:#6B7280}
    .fac{text-align:right}.fac .t{font-size:18px;font-weight:800;color:var(--pt);letter-spacing:.5px}.fac .n{font-size:15px;font-weight:700}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}
    .box{background:var(--caja);border-radius:8px;padding:10px 12px;border-left:4px solid var(--p)}.box b{display:block;font-size:10px;text-transform:uppercase;color:#6B7280;margin-bottom:3px;letter-spacing:.5px}
    table{width:100%;border-collapse:collapse;margin-top:6px}th{background:var(--p);color:var(--sp);font-size:11px;text-transform:uppercase;padding:8px;text-align:left}
    td{padding:8px;border-bottom:1px solid #E5E7EB}.r{text-align:right}.c{text-align:center}
    .tot{margin-left:auto;width:300px;margin-top:14px}.tot div{display:flex;justify-content:space-between;padding:4px 0}
    .tot .g{font-size:17px;font-weight:800;color:var(--s);border-top:2px solid var(--p);padding-top:8px;margin-top:4px}
    .tot .bs{font-weight:700;color:var(--pt)}
    .pie{margin-top:30px;text-align:center;color:#6B7280;font-size:11px;border-top:1px dashed var(--p);padding-top:10px}
    @page{size:letter;margin:10mm}`;

  FK.doc = {};
  FK.doc.factura = (v, e) => {
    const filas = v.items.map(it => `<tr><td>${FK.esc(it.nombre)}${it.detalle ? `<div class="muted" style="font-size:11px">${FK.esc(it.detalle)}</div>` : ''}</td>
      <td class="c">${it.porPeso ? FK.kg(it.cantidad) : it.cantidad}</td><td class="r">${FK.usd(it.precio)}${it.porPeso ? '/kg' : ''}</td><td class="r">${FK.usd(it.subtotal)}</td></tr>`).join('');
    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Factura ${FK.nroFactura(v.numero)}</title><style>${cssFactura(FK.coloresFactura(e))}</style></head><body>
      <div class="top"><div class="emp">${e.logo ? `<img src="${e.logo}">` : ''}<div><h1>${FK.esc(e.nombre)}</h1>
        ${e.rif ? `<div class="muted">RIF: ${FK.esc(e.rif)}</div>` : ''}
        ${e.telefono ? `<div class="muted">Tel: ${FK.esc(e.telefono)}</div>` : ''}</div></div>
        <div class="fac"><div class="t">FACTURA</div><div class="n">N° ${FK.nroFactura(v.numero)}</div><div class="muted">${FK.fechaHora(v.fecha)}</div></div></div>
      <div class="grid"><div class="box"><b>Cliente</b>${FK.esc(v.clienteNombre || 'Consumidor final')}
          ${v.clienteCedula ? `<div class="muted">C.I./RIF: ${FK.esc(v.clienteCedula)}</div>` : ''}
          ${v.clienteCorreo ? `<div class="muted">${FK.esc(v.clienteCorreo)}</div>` : ''}</div>
        <div class="box"><b>Pago</b>${FK.esc(FK.metodoNombre(v.metodoPago))}
          <div class="muted">Tasa: ${FK.bs(v.tasa)} por USD</div><div class="muted">Atendido por: ${FK.esc(v.usuario)}</div>
          ${v.referencia ? `<div class="muted">${FK.esc(v.referencia)}</div>` : ''}</div></div>
      <table><thead><tr><th>Descripción</th><th class="c">Cant.</th><th class="r">Precio</th><th class="r">Importe</th></tr></thead><tbody>${filas}</tbody></table>
      <div class="tot"><div><span>Subtotal</span><span>${FK.usd(v.subtotal)}</span></div>
        ${v.descuento > 0 ? `<div style="color:var(--s)"><span>Descuento${v.promoCodigo ? ' (' + FK.esc(v.promoCodigo) + ')' : ''}</span><span>-${FK.usd(v.descuento)}</span></div>` : ''}
        <div class="g"><span>TOTAL</span><span>${FK.usd(v.total)}</span></div>
        <div class="bs"><span>Total en Bs</span><span>${FK.bs(v.totalBs)}</span></div></div>
      <div class="pie">¡Gracias por su compra! · Documento generado con FacturaK</div></body></html>`;
  };

  const TIPO_CMP = { A: 1, B: 6, C: 11 };
  FK.doc.ticket58 = (v, e) => {
    const f = e.fiscal || {};
    const pv = String(f.puntoVenta || 1).padStart(4, '0');
    const tipo = f.tipoComprobante || 'C';
    const ivaPct = FK.num(f.ivaPct);
    // IVA incluido: cada ítem usa su propio impuesto si lo tiene; si no, el general.
    const conImp = (it) => it.impuestoPct != null && it.impuestoPct !== '';
    const factorDesc = v.subtotal > 0 ? v.total / v.subtotal : 1;
    const ivaMonto = FK.r2((v.items || []).reduce((s, it) => {
      const pct = conImp(it) ? FK.num(it.impuestoPct) : ivaPct;
      return s + (pct > 0 ? (Number(it.subtotal) || 0) * factorDesc * (1 - 1 / (1 + pct / 100)) : 0);
    }, 0));
    const ivaMixto = (v.items || []).some(it => conImp(it) && FK.num(it.impuestoPct) !== ivaPct);
    let qr = '';
    if (v.cae) {
      const cuit = parseInt(String(f.cuit || '').replace(/\D/g, ''), 10) || 0;
      const payload = {
        ver: 1, fecha: new Date(v.fecha).toISOString().slice(0, 10), cuit, ptoVta: parseInt(f.puntoVenta, 10) || 1,
        tipoCmp: TIPO_CMP[tipo] || 11, nroCmp: v.numero, importe: FK.r2(v.total), moneda: 'DOL', ctz: 1,
        tipoDocRec: 99, nroDocRec: 0, tipoCodAut: 'E', codAut: parseInt(String(v.cae).replace(/\D/g, ''), 10) || 0
      };
      const url = 'https://www.afip.gob.ar/fe/qr/?p=' + btoa(JSON.stringify(payload));
      try { qr = window.FKQR.toSVG(url, { px: 150, ecl: 'M' }); } catch (_) { qr = ''; }
    }
    const lineas = v.items.map(it => `<div>${FK.esc(it.nombre)}${it.detalle ? ' ' + FK.esc(it.detalle) : ''}</div>
      <div class="row"><span>${it.porPeso ? FK.kg(it.cantidad) : it.cantidad} x ${FK.usd(it.precio)}</span><span>${FK.usd(it.subtotal)}</span></div>`).join('');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}html,body{margin:0;padding:0}body{width:58mm;padding:2mm 3mm;font-family:"Consolas","Courier New",monospace;font-size:10.5px;color:#000;line-height:1.3}
      .c{text-align:center}.row{display:flex;justify-content:space-between;gap:4px;flex-wrap:wrap}.hr{border-top:1px dashed #000;margin:4px 0}
      .b{font-weight:bold}.big{font-size:13px;font-weight:bold}.qr{display:flex;justify-content:center;margin-top:4px}.qr svg{width:36mm;height:36mm}
      .totlinea{margin-top:2px}.totval{display:block;text-align:right;font-size:12px;font-weight:bold}
      .totlinea.big .totval{font-size:15px}
      @page{size:58mm auto;margin:0}</style></head><body>
      ${logo58(e)}
      <div class="c b" style="font-size:12px">${FK.esc(e.nombre)}</div>
      ${e.telefono ? `<div class="c">Tel: ${FK.esc(e.telefono)}</div>` : ''}
      ${f.cuit ? `<div class="c">CUIT: ${FK.esc(f.cuit)}</div>` : ''}
      ${f.ingresosBrutos ? `<div class="c">IIBB: ${FK.esc(f.ingresosBrutos)}</div>` : ''}
      ${f.inicioActividades ? `<div class="c">Inicio Act.: ${FK.esc(f.inicioActividades)}</div>` : ''}
      <div class="c">${FK.esc(f.condicionIva || '')}</div>
      <div class="hr"></div>
      <div class="c big">FACTURA ${FK.esc(tipo)}</div>
      <div class="c">N° ${pv}-${FK.nroFactura(v.numero)}</div>
      <div class="c">${FK.fechaHora(v.fecha)}</div>
      <div class="hr"></div>
      <div>Cliente: ${FK.esc(v.clienteNombre || 'Consumidor final')}</div>
      ${v.clienteCedula ? `<div>Doc: ${FK.esc(v.clienteCedula)}</div>` : ''}
      <div class="hr"></div>${lineas}<div class="hr"></div>
      ${v.descuento > 0 ? `<div class="totlinea"><span>Descuento</span><span class="totval">-${FK.usd(v.descuento)}</span></div>` : ''}
      <div class="totlinea big"><span>TOTAL</span><span class="totval">${FK.usd(v.total)}</span></div>
      <div class="totlinea"><span>Total Bs</span><span class="totval">${FK.bs(v.totalBs)}</span></div>
      ${ivaMonto > 0 && tipo !== 'C' ? `<div class="totlinea"><span>${ivaMixto ? 'IVA incl.' : 'IVA ' + ivaPct + '% incl.'}</span><span class="totval">${FK.usd(ivaMonto)}</span></div>` : ''}
      <div>Pago: ${FK.esc(FK.metodoNombre(v.metodoPago))}</div>
      <div class="hr"></div>
      ${v.cae ? `<div>CAE: ${FK.esc(v.cae)}</div>${v.caeVencimiento ? `<div>Vto. CAE: ${FK.esc(v.caeVencimiento)}</div>` : ''}<div class="qr">${qr}</div>`
        : '<div class="c">Comprobante sin CAE cargado</div>'}
      <div class="c" style="margin-top:4px">¡Gracias por su compra!</div></body></html>`;
  };

  FK.doc.comanda = ({ mesa, items, mesero, fecha, nota }) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;padding:0}body{width:58mm;padding:2mm 3mm;font-family:"Consolas","Courier New",monospace;font-size:12px;color:#000}
      .c{text-align:center}.hr{border-top:1px dashed #000;margin:4px 0}.it{font-size:14px;font-weight:bold;margin:3px 0}@page{size:58mm auto;margin:0}</style></head><body>
      <div class="c" style="font-size:15px;font-weight:bold">COMANDA</div>
      <div class="c" style="font-size:14px;font-weight:bold">${FK.esc(mesa)}</div>
      <div class="c">${FK.fechaHora(fecha)} · ${FK.esc(mesero)}</div><div class="hr"></div>
      ${items.map(i => `<div class="it">${i.cantidad} x ${FK.esc(i.nombre)}</div>`).join('')}
      ${nota ? `<div class="hr"></div><div>${FK.esc(nota)}</div>` : ''}<div class="hr"></div></body></html>`;

  // Bloque del logo, centrado y acotado a un tamaño razonable de ticket
  // (58mm de ancho no da para mucho margen) — compartido entre los dos
  // tickets térmicos.
  function logo58(e) {
    return e.logo ? `<div class="c" style="margin-bottom:3px"><img src="${e.logo}" style="max-width:34mm;max-height:16mm;object-fit:contain"></div>` : '';
  }

  // Ticket POS de 58mm para ventas normales (sin factura fiscal AFIP). Misma
  // maquetación monoespaciada que el ticket58 fiscal, pero sin CUIT/CAE/QR:
  // aplica a cualquier negocio, en cualquier país.
  FK.doc.ticket58Venta = (v, e) => {
    const lineas = v.items.map(it => `<div>${FK.esc(it.nombre)}${it.detalle ? ' ' + FK.esc(it.detalle) : ''}</div>
      <div class="row"><span>${it.porPeso ? FK.kg(it.cantidad) : it.cantidad} x ${FK.usd(it.precio)}${it.porPeso ? '/kg' : ''}</span><span>${FK.usd(it.subtotal)}</span></div>`).join('');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}html,body{margin:0;padding:0}body{width:58mm;padding:2mm 3mm;font-family:"Consolas","Courier New",monospace;font-size:10.5px;color:#000;line-height:1.35}
      .c{text-align:center}.row{display:flex;justify-content:space-between;gap:4px;flex-wrap:wrap}.hr{border-top:1px dashed #000;margin:4px 0}
      .b{font-weight:bold}.big{font-size:13px;font-weight:bold}
      .totlinea{margin-top:2px}.totval{display:block;text-align:right;font-size:12px;font-weight:bold}
      .totlinea.big .totval{font-size:15px}
      @page{size:58mm auto;margin:0}</style></head><body>
      ${logo58(e)}
      <div class="c b" style="font-size:12px">${FK.esc(e.nombre)}</div>
      ${e.rif ? `<div class="c">RIF: ${FK.esc(e.rif)}</div>` : ''}
      ${e.telefono ? `<div class="c">Tel: ${FK.esc(e.telefono)}</div>` : ''}
      <div class="hr"></div>
      <div class="c big">TICKET DE VENTA</div>
      <div class="c">N° ${FK.nroFactura(v.numero)}</div>
      <div class="c">${FK.fechaHora(v.fecha)}</div>
      <div class="hr"></div>
      <div>Cliente: ${FK.esc(v.clienteNombre || 'Consumidor final')}</div>
      ${v.clienteCedula ? `<div>Doc: ${FK.esc(v.clienteCedula)}</div>` : ''}
      <div class="hr"></div>${lineas}<div class="hr"></div>
      <div class="totlinea"><span>Subtotal</span><span class="totval">${FK.usd(v.subtotal)}</span></div>
      ${v.descuento > 0 ? `<div class="totlinea"><span>Descuento${v.promoCodigo ? ' (' + FK.esc(v.promoCodigo) + ')' : ''}</span><span class="totval">-${FK.usd(v.descuento)}</span></div>` : ''}
      <div class="totlinea big"><span>TOTAL</span><span class="totval">${FK.usd(v.total)}</span></div>
      <div class="totlinea"><span>Total Bs</span><span class="totval">${FK.bs(v.totalBs)}</span></div>
      <div class="hr"></div>
      <div>Pago: ${FK.esc(FK.metodoNombre(v.metodoPago))}</div>
      ${v.referencia ? `<div>${FK.esc(v.referencia)}</div>` : ''}
      <div>Atendido por: ${FK.esc(v.usuario)}</div>
      <div class="c" style="margin-top:5px">¡Gracias por su compra!</div>
      <div class="c" style="font-size:9px;color:#555;margin-top:2px">Generado con FacturaK</div>
      </body></html>`;
  };

  // Elige automáticamente el ticket 58mm correcto: el fiscal (AFIP, con
  // CAE/QR) si el negocio tiene activada la facturación fiscal, o el
  // genérico para cualquier otro negocio. Esto es lo que ahora imprime
  // siempre el botón "Imprimir" (el PDF completo de "Abrir/Descargar" no
  // cambia).
  FK.doc.ticketPOS = (v, e) => (e.fiscal && e.fiscal.activo) ? FK.doc.ticket58(v, e) : FK.doc.ticket58Venta(v, e);

  // ---------- Impresión ----------
  FK.imprimir = async (html, { destino = 'caja', ancho = null } = {}) => {
    if (API) {
      const cfg = FK.emp()?.impresoras || {};
      const deviceName = cfg.activa ? (cfg[destino] || '') : '';
      const silent = !!(cfg.activa && deviceName);
      const r = await API.imprimirHTML({ html, deviceName, silent, anchoMm: ancho });
      if (!r.ok && r.motivo && !/cancel/i.test(r.motivo)) FK.toast('No se pudo imprimir: ' + r.motivo, 'error');
      return r.ok;
    }
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    f.srcdoc = html;
    await new Promise(r => f.onload = r);
    f.contentWindow.focus(); f.contentWindow.print();
    window.focus();
    setTimeout(() => { f.remove(); window.focus(); }, 1500);
    return true;
  };

  FK.pdfFactura = async (v) => {
    const html = FK.doc.factura(v, FK.emp());
    if (API) {
      try { const ruta = await API.guardarPDF({ html, nombre: `Factura-${FK.nroFactura(v.numero)}`, abrir: true }); FK.toast('PDF guardado en Documentos\\FacturaK\\Facturas'); return ruta; }
      catch (e) { FK.toast('No se pudo crear el PDF', 'error'); return null; }
    }
    const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); }
    return null;
  };

  // ---------- WhatsApp ----------
  // Normaliza a formato internacional para el enlace wa.me. Este negocio
  // opera en Venezuela (código 58): un número local como "0412-1234567" se
  // guarda tal cual en la ficha del cliente, así que aquí le quitamos el 0
  // inicial y le anteponemos 58. Si ya viene con código de país, se respeta.
  FK.normalizarTelefonoWA = (tel) => {
    let d = String(tel || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('0')) d = '58' + d.slice(1);
    else if (!d.startsWith('58')) d = '58' + d;
    return d;
  };

  // Guarda el PDF de la factura (igual que "Abrir/Descargar", pero sin
  // abrirlo) y abre WhatsApp con el número del cliente y un mensaje
  // pre-armado. WhatsApp no permite adjuntar archivos automáticamente desde
  // un enlace wa.me (ninguna app de escritorio puede sin la API de negocios
  // de Meta) — por eso se deja el PDF ya guardado y listo, y se avisa dónde
  // quedó para adjuntarlo con un arrastre dentro de la misma ventana de chat
  // que se abre.
  FK.enviarFacturaWhatsapp = async (v, telefono) => {
    const tel = FK.normalizarTelefonoWA(telefono || v.clienteTelefono);
    if (!tel || tel.length < 11) { FK.toast('Ingresa un número de WhatsApp válido', 'error'); return false; }
    const e = FK.emp();
    const mensaje = FK.creditos.llenarPlantilla(e.mensajesWhatsApp.factura, {
      cliente: v.clienteNombre || 'cliente', factura: FK.nroFactura(v.numero), empresa: e.nombre,
      total: FK.usd(v.total), total_bs: FK.bs(v.totalBs)
    });
    const nombre = `Factura-${FK.nroFactura(v.numero)}`;
    let imagenRuta = '', avisoRuta = '';
    if (API && API.facturaImagen) {
      // Versión con imagen: la factura se dibuja como PNG, se guarda y queda
      // en el portapapeles para pegarla en el chat (WhatsApp no deja adjuntar
      // archivos desde un enlace).
      FK.toast('Preparando la imagen de la factura…');
      try {
        const r = await API.facturaImagen({ html: FK.doc.factura(v, e), nombre });
        if (r && r.ok) imagenRuta = r.ruta; else FK.toast('No se pudo generar la imagen: ' + ((r && r.error) || 'error desconocido'), 'error');
      } catch (_) { FK.toast('No se pudo generar la imagen de la factura', 'error'); }
    } else if (API) {
      try {
        const ruta = await API.guardarPDF({ html: FK.doc.factura(v, e), nombre, abrir: false });
        if (ruta) avisoRuta = ' El PDF ya se guardó — arrástralo a la conversación que se va a abrir.';
      } catch (_) { /* si falla el PDF, igual seguimos */ }
    }
    const urlWA = `whatsapp://send?phone=${tel}&text=${encodeURIComponent(mensaje)}`;
    if (API && API.plataforma === 'android') window.location.href = urlWA; else window.open(urlWA, '_blank');
    if (imagenRuta) {
      FK.ultimaImagenFactura = imagenRuta;
      // Automático por defecto: pega la imagen y envía mensaje + imagen sin intervención.
      const auto = !!API.pegarEnWhatsapp && !(e.mensajesWhatsApp && e.mensajesWhatsApp.manual);
      if (auto) {
        FK.toast('Enviando la factura por WhatsApp… no uses el teclado ni el mouse unos segundos');
        API.pegarEnWhatsapp({ enviar: true, ruta: imagenRuta, factor: Number((e.mensajesWhatsApp || {}).velocidad) || 1 }).then(ok => {
          if (ok) FK.toast('Envío automático ejecutado: revisa en WhatsApp que el mensaje y la imagen hayan salido');
          else FK.mostrarAvisoImagenWA(false); // no se pudo automatizar: pasos manuales
        }).catch(() => FK.mostrarAvisoImagenWA(false));
      } else FK.mostrarAvisoImagenWA(false);
    } else FK.toast('Se abrió WhatsApp de escritorio.' + avisoRuta);
    return true;
  };

  // Pasos para terminar el envío de la imagen (el mensaje ya va escrito).
  FK.mostrarAvisoImagenWA = (auto) => {
    document.getElementById('wa-img-auto').classList.toggle('hidden', !auto);
    FK.openModal('modal-wa-imagen');
  };


  // ---------- Correo ----------
  FK.correoConfigurado = () => { const c = FK.emp()?.correo; return !!(c && c.activo && c.host && c.usuario && c.password); };
  FK.enviarFacturaCorreo = async (v, { silencioso = false } = {}) => {
    const e = FK.emp();
    if (!v.clienteCorreo) { v.correo = 'sin-correo'; FK.store.save(); return v.correo; }
    if (!FK.correoConfigurado() || !API) {
      v.correo = 'no-configurado'; FK.store.save();
      if (!silencioso) FK.toast('Configura el correo saliente en Impresoras → Correo', 'error');
      return v.correo;
    }
    v.correo = 'enviando'; FK.store.save();
    const cuerpo = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#333"><p>Hola ${FK.esc(v.clienteNombre || '')},</p>
      <p>Adjuntamos tu factura <b>N° ${FK.nroFactura(v.numero)}</b> de <b>${FK.esc(e.nombre)}</b> por un total de <b>${FK.usd(v.total)}</b> (${FK.bs(v.totalBs)}).</p>
      <p>¡Gracias por tu compra!</p></div>`;
    const r = await API.enviarCorreo({
      smtp: { ...e.correo, nombreRemitente: e.nombre }, para: v.clienteCorreo,
      asunto: `Factura N° ${FK.nroFactura(v.numero)} - ${e.nombre}`, html: cuerpo,
      adjuntoHtml: FK.doc.factura(v, e), adjuntoNombre: `Factura-${FK.nroFactura(v.numero)}`
    });
    v.correo = r.ok ? 'enviado' : 'error';
    v.correoError = r.ok ? '' : r.error;
    FK.store.save();
    if (!silencioso || !r.ok) FK.toast(r.ok ? `Factura enviada a ${v.clienteCorreo}` : 'No se pudo enviar el correo: ' + r.error, r.ok ? 'ok' : 'error');
    if (FK.onVentasCambiadas) FK.onVentasCambiadas();
    return v.correo;
  };
})();
