// FacturaK — motor de red multi-dispositivo (renderer).
//
// Un dispositivo puede estar en uno de tres estados:
//   · LOCAL     : funciona solo, como siempre (archivo local).
//   · ANFITRIÓN : es la PC central; su servidor local está encendido y esta pantalla sincroniza con él por IPC.
//   · CLIENTE   : está vinculado a una PC central (PC secundaria, navegador o APK Android) y sincroniza por HTTP/WebSocket.
//
// Cada dispositivo vinculado guarda: su copia ACTUAL de los datos (la que usa toda la app), una BASE (el último
// estado sincronizado) y el parche que está enviando. Lo pendiente = diff(base, actual). Sin conexión se sigue
// vendiendo normalmente: los cambios quedan en cola y se envían solos al volver la conexión.
(function () {
  'use strict';
  const FK = window.FK;
  const S = window.FKSyncCore;
  const API = window.api;
  const CFG_KEY = 'facturak-red-cfg';
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  // ---------- almacenamiento local del cliente (IndexedDB: soporta decenas de MB, localStorage no) ----------
  const memoria = new Map();
  const kv = (() => {
    let dbp = null;
    const abrir = () => dbp || (dbp = new Promise((res, rej) => {
      try {
        const r = indexedDB.open('facturak-red', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    }));
    const tx = async (modo, f) => { const db = await abrir(); return new Promise((res, rej) => { const t = db.transaction('kv', modo); const rq = f(t.objectStore('kv')); t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error); }); };
    return {
      async get(k) { try { return await tx('readonly', (s) => s.get(k)); } catch (_) { return memoria.get(k); } },
      async set(k, v) { memoria.set(k, v); try { await tx('readwrite', (s) => s.put(v, k)); } catch (_) {} },
      async del(k) { memoria.delete(k); try { await tx('readwrite', (s) => s.delete(k)); } catch (_) {} },
    };
  })();

  // ---------- configuración de vinculación ----------
  function leerCfg() { try { return JSON.parse(localStorage.getItem(CFG_KEY) || 'null') || {}; } catch (_) { return {}; } }
  function guardarCfg(c) { try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (_) {} }

  const R = FK.red = {
    cfg: leerCfg(),
    modo: 'local',            // 'local' | 'cliente'
    host: false,              // true si es la PC central con el servidor encendido
    estado: { conectado: false, sucio: false, error: '', url: '', rev: 0, ultima: null, autorizado: true, sincronizando: false },
    _oyentes: new Set(),
  };
  R.activo = () => R.modo === 'cliente' || R.host;
  R.alCambiarEstado = (f) => { R._oyentes.add(f); return () => R._oyentes.delete(f); };
  const notificar = () => R._oyentes.forEach((f) => { try { f(R.estado); } catch (_) {} });

  let T = null;                       // transporte actual
  let base = null, rev = 0, epoca = '', enviando = null;
  let corriendo = false, repetir = false, timer = null, poll = null, socket = null, espera = 3000;
  const cur = () => FK.store.data;

  // ---------- transporte IPC (PC central) ----------
  const Tipc = {
    snapshot: () => API.red.snapshot(),
    sync: (pid, patch) => API.red.sync(pid, patch),
    cambios: (d, e) => API.red.cambios(d, e),
  };

  // ---------- transporte HTTP (clientes) ----------
  const CAB = { 'Bypass-Tunnel-Reminder': '1', 'ngrok-skip-browser-warning': '1' };
  let urlActual = '';
  async function ping(url, ms) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url + '/api/ping', { headers: CAB, signal: ctl.signal });
      const j = await r.json();
      if (j.app !== 'FacturaK' || (R.cfg.servidorId && j.id !== R.cfg.servidorId)) throw new Error('otro servidor');
      // el servidor informa sus direcciones vigentes: así el teléfono las aprende solo (la IP de la PC o la URL del túnel cambian)
      let cambio = false;
      if (j.tunel && j.tunel !== R.cfg.tunel) { R.cfg.tunel = j.tunel; cambio = true; }
      if (Array.isArray(j.urls) && j.urls.length) {
        const nuevas = j.urls.filter((x) => /^http:\/\//.test(x));
        if (nuevas.length && JSON.stringify(nuevas) !== JSON.stringify(R.cfg.urls || [])) { R.cfg.urls = nuevas; cambio = true; }
      }
      if (cambio) guardarCfg(R.cfg);
      return url;
    } finally { clearTimeout(t); }
  }
  const primero = (lista, ms) => lista.length ? Promise.any(lista.map((u) => ping(u, ms))).catch(() => null) : Promise.resolve(null);
  // Detección automática LAN vs túnel: primero las direcciones de la red local (rápidas); si ninguna responde, el túnel.
  async function resolverURL() {
    if (urlActual) { try { return await ping(urlActual, 2500); } catch (_) { urlActual = ''; } }
    let u = await primero(R.cfg.urls || [], 2500);
    if (!u && R.cfg.tunel) u = await primero([R.cfg.tunel], 9000);
    if (!u) { const e = new Error('No se encontró la PC central (ni en la red local ni por Internet).'); e.red = true; throw e; }
    urlActual = u; R.estado.url = u; return u;
  }
  async function http(ruta, opts = {}, ms = 30000) {
    const url = urlActual || await resolverURL();
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    let r;
    try {
      r = await fetch(url + ruta, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + R.cfg.token, ...CAB }, signal: ctl.signal });
    } catch (e) { urlActual = ''; const x = new Error('Sin conexión con la PC central'); x.red = true; throw x; }
    finally { clearTimeout(t); }
    if (r.status === 401) { R.estado.autorizado = false; const x = new Error('Este dispositivo ya no está autorizado. Vuélvelo a vincular.'); x.noAutorizado = true; throw x; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
    return j;
  }
  const Thttp = {
    snapshot: () => http('/api/snapshot', {}, 180000),
    sync: (pid, patch) => http('/api/sync', { method: 'POST', body: JSON.stringify({ pid, patch }) }, 120000),
    cambios: (d, e) => http(`/api/cambios?desde=${encodeURIComponent(d)}&epoca=${encodeURIComponent(e)}`),
  };

  // ---------- persistencia de la cola (clientes) ----------
  let metaPend = false;
  async function guardarMeta(conBase) {
    if (R.modo !== 'cliente') return;
    await kv.set('meta', { rev, epoca, enviando });
    if (conBase) await kv.set('base', JSON.stringify(base));
  }
  async function guardarCopia(json) { if (R.modo === 'cliente') await kv.set('cur', json != null ? json : JSON.stringify(cur())); }

  // ---------- puesta en marcha ----------
  R.preparar = async () => {
    R.cfg = leerCfg();
    R.modo = R.cfg.token ? 'cliente' : 'local';
    R.host = false; T = null;
    if (R.modo === 'cliente') { T = Thttp; return; }
    if (API && API.red) {
      try { const e = await API.red.estado(); if (e && e.encendido) { R.host = true; T = Tipc; } } catch (_) {}
    }
  };

  // Entrega a FK.store el JSON inicial de los datos (o null si no hay)
  R.cargar = async () => {
    if (R.modo === 'cliente') {
      const c = await kv.get('cur'), b = await kv.get('base'), m = await kv.get('meta');
      if (c && b && m) { base = JSON.parse(b); rev = m.rev || 0; epoca = m.epoca || ''; enviando = m.enviando || null; return c; }
      const snap = await Thttp.snapshot();            // primera vez: se bajan los datos de la PC central
      base = S.clon(snap.datos); rev = snap.rev; epoca = snap.epoca; enviando = null;
      const json = JSON.stringify(snap.datos);
      await kv.set('cur', json); await kv.set('base', JSON.stringify(base)); await guardarMeta();
      R.estado.conectado = true; return json;
    }
    if (R.host) {
      const snap = await Tipc.snapshot();
      base = S.clon(snap.datos); rev = snap.rev; epoca = snap.epoca; enviando = null;
      return JSON.stringify(snap.datos);
    }
    return null;
  };

  R.iniciar = () => {
    if (!R.activo() || R._iniciado) return;
    R._iniciado = true;
    if (R.host) { if (!R._hostOyente) { R._hostOyente = true; API.red.onCambio(() => programar(50)); } }
    else conectarSocket();
    clearInterval(poll); poll = setInterval(() => programar(0), R.host ? 20000 : 15000);
    if (!R._onlineOyente) { R._onlineOyente = true; window.addEventListener('online', () => { espera = 3000; programar(100); }); }
    programar(200);
  };

  function conectarSocket() {
    if (typeof io === 'undefined' || R.modo !== 'cliente') return;
    (async () => {
      try {
        const url = urlActual || await resolverURL();
        if (socket) { try { socket.close(); } catch (_) {} }
        socket = io(url, { auth: { token: R.cfg.token }, extraHeaders: CAB, transports: ['websocket', 'polling'], reconnection: true, reconnectionDelayMax: 15000 });
        socket.on('cambio', () => programar(50));
        socket.on('connect', () => programar(50));
        socket.on('connect_error', (e) => { if (/no autorizado/i.test(String(e && e.message))) { R.estado.autorizado = false; notificar(); } });
      } catch (_) { setTimeout(conectarSocket, 8000); }
    })();
  }

  // ---------- ciclo de sincronización (uno a la vez) ----------
  function programar(ms) {
    if (!R.activo() || !R.estado.autorizado) return;
    clearTimeout(timer); timer = setTimeout(ciclo, ms == null ? 300 : ms);
  }
  R.sincronizarAhora = () => { espera = 3000; return ciclo(); };

  async function ciclo() {
    if (!R.activo() || !R.estado.autorizado) return;
    if (corriendo) { repetir = true; return; }
    corriendo = true; R.estado.sincronizando = true; notificar();
    try {
      do {
        repetir = false;
        await uno();
        R.estado.conectado = true; R.estado.error = ''; espera = 3000;
      } while (repetir);
      if (R.estado.sucio) { /* quedó algo editado durante el ciclo */ }
      R.estado.ultima = new Date().toISOString();
    } catch (e) {
      R.estado.conectado = false; R.estado.error = String((e && e.message) || e);
      if (!e.noAutorizado) { clearTimeout(timer); timer = setTimeout(ciclo, espera); espera = Math.min(espera * 2, 60000); }
      if (socket === null && R.modo === 'cliente') conectarSocket();
    } finally { corriendo = false; R.estado.sincronizando = false; notificar(); }
  }

  async function uno() {
    // 1) enviar lo pendiente
    if (!enviando) {
      const patch = S.diff(base, cur());
      R.estado.sucio = !!patch;
      if (patch) { enviando = { pid: uid(), patch, enviado: false }; await guardarMeta(false); }
    }
    if (enviando && !enviando.enviado) {
      const r = await T.sync(enviando.pid, enviando.patch);
      if (r && r.error) throw new Error(r.error);
      enviando.enviado = true; await guardarMeta(false);
    }
    // 2) traer lo que hicieron los demás
    const r = await T.cambios(rev, epoca);
    if (r && r.error) throw new Error(r.error);
    if (r.completo) { await resincronizar(); repetir = true; return; }
    let remoto = false, propio = false;
    for (const p of r.parches || []) {
      if (enviando && enviando.pid && p.pid === enviando.pid) {
        S.applyPatch(base, p.patch); S.aplicarAjustes(cur(), p.ajustes);
        if (p.ajustes && p.ajustes.length) propio = true;
        enviando = null;
      } else { S.applyPatch(base, p.patch); S.applyPatch(cur(), p.patch); remoto = true; }
    }
    rev = r.rev; epoca = r.epoca; R.estado.rev = rev;
    if ((r.parches || []).length) { await guardarMeta(true); await guardarCopia(); }
    else await guardarMeta(false);
    if (remoto || propio) refrescar();
    // ¿quedó algo nuevo mientras sincronizábamos?
    R.estado.sucio = !!S.diff(base, cur());
    if (R.estado.sucio) repetir = true;
  }

  // La PC central reinició o este dispositivo quedó muy atrasado: se toma una foto completa y se re-aplica lo propio.
  async function resincronizar() {
    const snap = await T.snapshot();
    let pend;
    if (enviando && (snap.pids || []).includes(enviando.pid)) {
      const b2 = S.clon(base); S.applyPatch(b2, enviando.patch);     // el servidor ya aplicó el envío en curso
      pend = S.diff(b2, cur());
    } else pend = S.diff(base, cur());                               // todo lo no confirmado se reenvía
    enviando = null;
    const nuevo = S.clon(snap.datos);
    const dato = cur();
    for (const k of Object.keys(dato)) delete dato[k];
    Object.assign(dato, nuevo);
    base = S.clon(snap.datos);
    if (pend) S.applyPatch(dato, pend);
    rev = snap.rev; epoca = snap.epoca; R.estado.rev = rev;
    await guardarMeta(true); await guardarCopia();
    refrescar(true);
  }

  // ---------- refrescar la pantalla tras cambios remotos ----------
  let refTimer = null;
  function refrescar(reapuntar) {
    if (reapuntar && FK.sesion && FK.sesion.empresa) {
      const e = cur().empresas.find((x) => x.id === FK.sesion.empresa.id);
      if (e) { FK.sesion.empresa = e; const u = (e.usuarios || []).find((x) => FK.sesion.usuario && x.id === FK.sesion.usuario.id); if (u) FK.sesion.usuario = u; }
    }
    clearTimeout(refTimer);
    refTimer = setTimeout(function pintar() {
      try {
        if (FK.invalidarIndice) FK.invalidarIndice();
        const ocupado = document.querySelector('.modal-overlay:not(.hidden)') || (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName));
        if (ocupado) { refTimer = setTimeout(pintar, 2500); return; }       // no interrumpir a quien está escribiendo
        if (FK.render && FK.tabActual && FK.render[FK.tabActual()]) FK.render[FK.tabActual()]();
        if (FK.red.alRefrescar) FK.red.alRefrescar();
      } catch (e) { console.error('refrescar', e); }
    }, 350);
  }

  // ---------- llamadas desde FK.store ----------
  R.guardar = (json) => {
    R.estado.sucio = true;
    guardarCopia(json);
    programar(250);
    notificar();
  };
  R.guardarSync = () => {
    // Al cerrar: la PC central envía su último parche de forma síncrona; los clientes ya guardaron su copia local.
    try {
      if (R.host && API.red && API.red.syncSync && !enviando) {
        const patch = S.diff(base, cur());
        if (patch) API.red.syncSync(uid(), patch);
      }
    } catch (_) {}
  };

  // ---------- encender / apagar el servidor desde la pantalla (sin reiniciar la app) ----------
  R.activarHost = async () => {
    if (!API || !API.red) return { ok: false, error: 'Esta versión no incluye el servidor local.' };
    if (R.modo === 'cliente') return { ok: false, error: 'Este equipo está vinculado a otra PC central. Desvincúlalo primero.' };
    try { clearTimeout(FK.store._t); await API.dbSave(JSON.stringify(cur())); } catch (_) {}   // el servidor arranca con lo último
    const r = await API.red.encender();
    if (!r.ok) return r;
    R.host = true; T = Tipc;
    const snap = await Tipc.snapshot();
    base = S.clon(snap.datos); rev = snap.rev; epoca = snap.epoca; enviando = null; R.estado.autorizado = true;
    R._iniciado = false; R.iniciar();
    programar(200);
    return r;
  };
  R.desactivarHost = async () => {
    try { await ciclo(); } catch (_) {}                // última puesta al día: no perder lo de los celulares
    await API.red.apagar();
    R.host = false; T = null; R._iniciado = false; clearInterval(poll); clearTimeout(timer);
    FK.store.saveNow();                                // desde ahora vuelve a escribir el archivo local
    notificar();
  };

  // ---------- vinculación (clientes) ----------
  const limpiarURL = (u) => { u = String(u || '').trim().replace(/\/+$/, ''); if (!u) return ''; if (!/^https?:\/\//i.test(u)) u = 'http://' + u; return u; };
  // `datos` = contenido del QR { id, nombre, codigo, urls[], tunel } o { urls:[...], codigo } escrito a mano
  R.vincular = async ({ urls, tunel, codigo, nombre, servidorId }) => {
    const lista = [...(urls || []), ...(tunel ? [tunel] : [])].map(limpiarURL).filter(Boolean);
    if (!lista.length) throw new Error('Falta la dirección de la PC central.');
    const dispositivo = nombre || (API && API.plataforma === 'android' ? 'Celular Android' : 'Dispositivo');
    let ultimoError = 'No se pudo contactar a la PC central.';
    for (const u of lista) {
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), u.startsWith('https') ? 12000 : 5000);
        const r = await fetch(u + '/api/vincular', { method: 'POST', headers: { 'Content-Type': 'application/json', ...CAB }, body: JSON.stringify({ codigo: String(codigo).trim(), nombre: dispositivo, plataforma: (API && API.plataforma) || (navigator.userAgent.includes('Windows') ? 'windows' : 'web') }), signal: ctl.signal });
        clearTimeout(t);
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { ultimoError = j.error || ('Error ' + r.status); if (r.status === 401 || r.status === 429) throw Object.assign(new Error(ultimoError), { fatal: true }); continue; }
        const cfg = { token: j.token, dispositivoId: j.dispositivoId, servidorId: (j.servidor && j.servidor.id) || servidorId || '', nombre: (j.servidor && j.servidor.nombre) || 'PC Central', urls: lista.filter((x) => !/^https:\/\//.test(x)), tunel: lista.find((x) => /^https:\/\//.test(x)) || '' };
        guardarCfg(cfg); R.cfg = cfg;
        await kv.del('cur'); await kv.del('base'); await kv.del('meta');
        return cfg;
      } catch (e) { if (e.fatal) throw e; ultimoError = e.name === 'AbortError' ? 'La PC central no respondió (¿misma red Wi-Fi? ¿firewall?).' : ultimoError; }
    }
    throw new Error(ultimoError);
  };
  R.desvincular = async () => {
    try { if (socket) socket.close(); } catch (_) {}
    try { localStorage.removeItem(CFG_KEY); } catch (_) {}
    await kv.del('cur'); await kv.del('base'); await kv.del('meta');
    R.cfg = {}; R.modo = 'local';
  };
  R.interpretarQR = (texto) => {
    let d; try { d = JSON.parse(texto); } catch (_) { throw new Error('Ese código QR no es de FacturaK.'); }
    if (!d || d.app !== 'facturak' || !d.codigo) throw new Error('Ese código QR no es de FacturaK.');
    return d;
  };
})();
