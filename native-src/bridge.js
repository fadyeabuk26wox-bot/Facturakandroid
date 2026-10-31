// FacturaK — Puente nativo para Android (Capacitor).
//
// Implementa el MISMO objeto window.api que expone preload.js en la versión
// de escritorio (Electron), método por método, para que core.js / app.js /
// modulos.js / creditos.js / tema.js / nube-ui.js funcionen SIN NINGÚN
// CAMBIO en ambas plataformas. Esta es la única pieza exclusiva de Android
// (junto con la bolsa de bytes ESC/POS más abajo, en el mismo archivo).
//
// Limitaciones reales de hardware que quedan documentadas aquí porque no se
// pueden resolver sin cambiar de plugin o de impresora:
//
// 1) El plugin de Bluetooth Serial (@ascentio-it/capacitor-bluetooth-serial)
//    manda el texto codificado en UTF-8 byte a byte. Un acento (á, ñ, ¿...)
//    ocupa 2 bytes en UTF-8, y la enorme mayoría de impresoras térmicas de
//    58mm solo entienden una tabla de 1 byte (CP437/CP850/1252). Por eso el
//    texto que se manda a la impresora sale SIN acentos (ver
//    quitarAcentos()) — la pantalla y el PDF siguen mostrando los acentos
//    normalmente, solo el ticket impreso los pierde.
// 2) Por el mismo motivo (los bytes de una imagen, 0-255, no viajan
//    intactos codificados en UTF-8), el logo del negocio y el QR fiscal NO
//    se imprimen por Bluetooth en Android — sí siguen apareciendo en el PDF
//    y en el ticket impreso en escritorio. Si más adelante cambian a una
//    impresora con Bluetooth LE y un plugin que mande bytes binarios reales
//    (por ejemplo @capacitor-community/bluetooth-le con writeWithoutResponse
//    a un característica GATT), esta limitación desaparece.
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { App as CapApp } from '@capacitor/app';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { BluetoothSerial } from '@ascentio-it/capacitor-bluetooth-serial';
import { Preferences } from '@capacitor/preferences';

const ARCHIVO_DB = 'facturak-datos.json';

// ---------- Texto seguro para la impresora (ver limitación 1 arriba) ----------
const MAPA_ACENTOS = { á:'a', é:'e', í:'i', ó:'o', ú:'u', Á:'A', É:'E', Í:'I', Ó:'O', Ú:'U', ñ:'n', Ñ:'N', ü:'u', Ü:'U', '¿':'', '¡':'' };
function quitarAcentos(texto) {
  return String(texto || '').replace(/[áéíóúÁÉÍÓÚñÑüÜ¿¡]/g, (c) => MAPA_ACENTOS[c] ?? c);
}

// ---------- HTML -> comandos ESC/POS ----------
// Recorre el HTML del ticket (el MISMO html que ya generan FK.doc.ticket58 /
// ticket58Venta / comanda / los recibos de crédito) dentro de un iframe
// oculto, y traduce cada línea a texto plano + comandos ESC/POS de
// alineación y negrita, leyendo los estilos ya definidos en el propio
// <style> de la plantilla (text-align, font-weight, font-size, display) en
// vez de adivinar por nombre de clase. Así funciona con cualquier plantilla
// de 58mm que exista hoy o que se agregue en el futuro, sin tocar este
// archivo.
const ESC = 0x1B, GS = 0x1D, LF = 0x0A;
const ANCHO_CARACTERES = 32; // fuente normal de una impresora de 58mm (~32 col)

async function htmlAEscPos(html) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:220px;height:10px;border:0';
  document.body.appendChild(iframe);
  iframe.srcdoc = html;
  await new Promise((res) => { iframe.onload = res; setTimeout(res, 800); });
  const doc = iframe.contentDocument;

  const bytes = [];
  const push = (...b) => bytes.push(...b);
  const pushTexto = (t) => { for (const ch of quitarAcentos(t)) bytes.push(ch.charCodeAt(0) & 0xFF); };

  function estiloDe(el) {
    const cs = doc.defaultView.getComputedStyle(el);
    return {
      align: cs.textAlign === 'center' ? 1 : cs.textAlign === 'right' ? 2 : 0,
      negrita: parseInt(cs.fontWeight, 10) >= 700,
      grande: parseFloat(cs.fontSize) >= 13,
      bloque: cs.display === 'block',
    };
  }
  function aplicar(est) {
    push(ESC, 0x61, est.align);
    push(ESC, 0x45, est.negrita ? 1 : 0);
    push(GS, 0x21, est.grande ? 0x11 : 0x00);
  }
  function reset() { push(ESC, 0x61, 0); push(ESC, 0x45, 0); push(GS, 0x21, 0x00); }

  function recorrer(nodo) {
    for (const el of nodo.children) {
      if (el.tagName === 'IMG' || el.tagName === 'svg' || el.classList.contains('qr')) continue; // ver limitación 2
      if (el.classList.contains('hr')) { pushTexto('-'.repeat(ANCHO_CARACTERES)); push(LF); continue; }

      const spans = [...el.children].filter((c) => c.tagName === 'SPAN');
      if (spans.length === 2) {
        const izq = spans[0].textContent.replace(/\s+/g, ' ').trim();
        const der = spans[1].textContent.replace(/\s+/g, ' ').trim();
        const estDer = estiloDe(spans[1]);
        if (estDer.bloque) {
          // Etiqueta y monto en dos líneas (igual que en el HTML): el monto
          // nunca se corta sin importar cuántos dígitos tenga.
          aplicar(estiloDe(spans[0])); pushTexto(izq); push(LF);
          aplicar(estDer); pushTexto(der); push(LF);
        } else {
          const relleno = Math.max(1, ANCHO_CARACTERES - izq.length - der.length);
          aplicar(estiloDe(spans[0])); pushTexto(izq);
          pushTexto(' '.repeat(relleno));
          aplicar(estDer); pushTexto(der); push(LF);
        }
        reset();
        continue;
      }

      const texto = el.textContent.replace(/\s+/g, ' ').trim();
      if (texto) { aplicar(estiloDe(el)); pushTexto(texto); push(LF); reset(); }
      else recorrer(el);
    }
  }

  push(ESC, 0x40); // init
  recorrer(doc.body);
  push(LF, LF, LF);
  push(GS, 0x56, 1); // corte parcial
  iframe.remove();

  // El plugin de Bluetooth Serial manda un string (lo re-codifica a UTF-8 él
  // solo), así que cada byte 0-127 que armamos aquí debe llegar como UN
  // carácter — por eso pushTexto ya limpia los acentos antes, y todos los
  // bytes de comandos ESC/POS que usamos son <128.
  return bytes.map((b) => String.fromCharCode(b)).join('');
}

// ---------- Impresión por Bluetooth ----------
async function imprimirHTML({ html, deviceName }) {
  if (!deviceName) return { ok: false, motivo: 'No hay una impresora Bluetooth configurada (ver pestaña Impresoras).' };
  try {
    const permisos = await BluetoothSerial.checkBluetoothPermissions();
    if (!permisos) return { ok: false, motivo: 'Faltan permisos de Bluetooth.' };
    const estado = await BluetoothSerial.isEnabled();
    if (!estado.enabled) await BluetoothSerial.enable();
    await BluetoothSerial.connect({ address: deviceName });
    const payload = await htmlAEscPos(html);
    await BluetoothSerial.write({ address: deviceName, value: payload });
    await BluetoothSerial.disconnect({ address: deviceName });
    return { ok: true, motivo: '' };
  } catch (err) {
    return { ok: false, motivo: (err && err.message) || 'No se pudo imprimir por Bluetooth.' };
  }
}

async function listarImpresoras() {
  try {
    const permisos = await BluetoothSerial.checkBluetoothPermissions();
    if (!permisos) return [];
    const { devices } = await BluetoothSerial.getPairedDevices();
    // Mismo formato { name, displayName, isDefault } que espera modulos.js
    // (name = valor que se guarda y se usa luego para conectar = la
    // dirección MAC; displayName = lo que ve el usuario en el <select>).
    return devices.map((d) => ({ name: d.address, displayName: d.name || d.address, isDefault: false }));
  } catch (_) { return []; }
}

// ---------- Almacenamiento (reemplaza el JSON en disco de Electron) ----------
async function dbLoad() {
  try {
    const r = await Filesystem.readFile({ path: ARCHIVO_DB, directory: Directory.Data, encoding: Encoding.UTF8 });
    return r.data;
  } catch (_) { return null; } // no existe todavía (primera vez que se abre la app)
}
async function dbSave(json) {
  await Filesystem.writeFile({ path: ARCHIVO_DB, directory: Directory.Data, encoding: Encoding.UTF8, data: json });
}

// ---------- PDF ----------
// Android no tiene un motor propio de HTML-a-PDF sin agregar una librería
// pesada; en su lugar se abre el diálogo de impresión nativo de Android
// (window.print() dentro de un iframe oculto con el HTML de la factura),
// que ya incluye "Guardar como PDF" como destino — el usuario elige dónde
// guardarlo. No se puede reportar automáticamente una ruta de vuelta.
async function guardarPDF({ html }) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:0;height:0;border:0';
  document.body.appendChild(iframe);
  iframe.srcdoc = html;
  await new Promise((res) => { iframe.onload = res; });
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
  setTimeout(() => iframe.remove(), 4000);
  return null; // sin ruta: ver nota arriba
}

// ---------- Cámara ----------
async function tomarFoto() {
  const foto = await Camera.getPhoto({ resultType: CameraResultType.DataUrl, source: CameraSource.Camera, quality: 70, width: 640 });
  return foto.dataUrl;
}

// ---------- Escáner de códigos (QR / barras) ----------
async function escanearCodigo() {
  const permiso = await BarcodeScanner.requestPermissions();
  if (permiso.camera !== 'granted' && permiso.camera !== 'limited') { return null; }
  const { barcodes } = await BarcodeScanner.scan();
  const primero = barcodes && barcodes[0];
  return primero ? (primero.rawValue || primero.displayValue || '') : null;
}

// ---------- Exportar / importar respaldo ----------
async function exportarDatos(json) {
  const nombre = `FacturaK-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
  await Filesystem.writeFile({ path: nombre, directory: Directory.Documents, encoding: Encoding.UTF8, data: json });
  return nombre;
}
async function importarDatos() {
  // No hay selector nativo de archivos incluido en esta primera versión
  // (requeriría el plugin @capawesome/capacitor-file-picker). Se documenta
  // como pendiente en el README en vez de simularlo.
  return null;
}

// ---------- Guarda antes de que Android pause/cierre la app ----------
// No existe "beforeunload" confiable en Android; en su lugar se escucha el
// ciclo de vida real de la app.
let ultimoJSON = null;
CapApp.addListener('pause', () => { if (ultimoJSON) dbSave(ultimoJSON); });
CapApp.addListener('backButton', ({ canGoBack }) => { if (!canGoBack) CapApp.exitApp(); });

// ---------- Sincronización con la nube (idéntica en espíritu al nube.js del
// .exe: nunca guarda la service_role key aquí, solo habla con la misma API
// web ya construida, con un token de sesión) ----------
function crearNube() {
  const CLAVE = 'facturak-nube-config';
  let config = { baseUrl: '', token: '', empresaCodigo: '', empresaNombre: '', usuario: '', rol: '' };
  let productos = [];
  let temporizador = null;
  let cbProductos = () => {};
  let cbEstado = () => {};

  async function cargarConfig() {
    const r = await Preferences.get({ key: CLAVE });
    if (r.value) { try { config = JSON.parse(r.value); } catch (_) {} }
  }
  async function guardarConfig() { await Preferences.set({ key: CLAVE, value: JSON.stringify(config) }); }
  function conectado() { return !!(config.baseUrl && config.token); }
  function estadoPublico() { return { conectado: conectado(), ...config, pendientes: 0 }; }

  async function llamar(ruta, opciones = {}) {
    const base = config.baseUrl.replace(/\/+$/, '');
    const res = await fetch(base + ruta, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', ...(config.token ? { Authorization: 'Bearer ' + config.token } : {}), ...(opciones.headers || {}) },
    });
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error((cuerpo && cuerpo.error) || 'Error del servidor (' + res.status + ')');
    return cuerpo;
  }

  async function login({ baseUrl, codigoEmpresa, usuario, password }) {
    const base = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!base) return { ok: false, error: 'Ingresa la URL de tu FacturaK web.' };
    try {
      const res = await fetch(base + '/api/desktop/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigoEmpresa, usuario, password }) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) return { ok: false, error: (data && data.error) || 'No se pudo iniciar sesión.' };
      config = { baseUrl: base, token: data.token, empresaCodigo: data.empresaCodigo, empresaNombre: data.empresaNombre, usuario, rol: data.rol };
      await guardarConfig();
      iniciarSondeo();
      return { ok: true, empresaNombre: data.empresaNombre, rol: data.rol };
    } catch (e) { return { ok: false, error: 'No se pudo conectar con ' + base + '.' }; }
  }
  async function logout() { detenerSondeo(); config = { baseUrl: config.baseUrl, token: '', empresaCodigo: '', empresaNombre: '', usuario: '', rol: '' }; await guardarConfig(); return estadoPublico(); }
  async function refrescarProductos() {
    if (!conectado()) return;
    try { const data = await llamar('/api/desktop/productos'); productos = data.productos || []; cbEstado({ ...estadoPublico(), enLinea: true }); cbProductos(productos); }
    catch (e) { cbEstado({ ...estadoPublico(), enLinea: false, error: String(e.message || e) }); }
  }
  async function ajustarStock({ productoId, delta, tipo, nota }) {
    if (!conectado()) return { ok: false, error: 'No has iniciado sesión en la nube.' };
    try { await llamar('/api/desktop/ajustar-stock', { method: 'POST', body: JSON.stringify({ productoId, delta, tipo, nota: nota || null }) }); refrescarProductos(); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e.message || e) }; }
  }
  function iniciarSondeo() { if (temporizador) return; temporizador = setInterval(refrescarProductos, 4000); refrescarProductos(); }
  function detenerSondeo() { if (temporizador) { clearInterval(temporizador); temporizador = null; } }

  cargarConfig().then(() => { if (conectado()) iniciarSondeo(); });

  return {
    estado: async () => estadoPublico(),
    login, logout, ajustarStock,
    productosListar: async () => productos,
    productosRefrescar: () => refrescarProductos(),
    onProductos: (cb) => { cbProductos = cb; },
    onEstado: (cb) => { cbEstado = cb; },
  };
}

// Guarda un archivo generado por la pantalla (p. ej. el Excel del inventario) en Documentos.
async function guardarArchivoComo({ nombre, base64 }) {
  try {
    const seguro = String(nombre || 'archivo').replace(/[^\w\-. ]+/g, '_');
    const r = await Filesystem.writeFile({ path: 'FacturaK/' + seguro, directory: Directory.Documents, data: String(base64), recursive: true });
    return { ok: true, ruta: r.uri || ('Documentos/FacturaK/' + seguro) };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

window.api = {
  esEscritorio: true,
  dbEstadoCarga: async () => ({ recuperado: false, origen: 'principal' }),
  guardarArchivoComo,
  mostrarArchivo: async () => true,
  plataforma: 'android',
  dbLoad,
  dbSave: (json) => { ultimoJSON = json; return dbSave(json); },
  dbSaveSync: (json) => { ultimoJSON = json; return dbSave(json); },
  listarImpresoras,
  imprimirHTML,
  guardarPDF,
  enviarCorreo: async () => ({ ok: false, motivo: 'El envío de correo desde Android no está incluido en esta primera versión.' }),
  copiar: async (texto) => { try { await navigator.clipboard.writeText(texto); return true; } catch (_) { return false; } },
  abrirCarpetaDatos: async () => {},
  abrirCarpetaFacturas: async () => {},
  exportarDatos,
  importarDatos,
  tomarFoto,
  escanearCodigo,
  nube: crearNube(),
};
