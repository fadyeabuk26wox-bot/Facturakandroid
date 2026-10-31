// =====================================================================
// FacturaK v2 — Módulo de CRÉDITOS (reemplaza a "Préstamos")
// ---------------------------------------------------------------------
// • Administrador: configura los criterios (interés %, o fijo, inicial %,
//   frecuencias diaria/semanal/quincenal, días totales o hábiles, rango de
//   cuotas, moras y plantilla de WhatsApp).
// • Cajero/Vendedor: solo opera con esos criterios: registra clientes,
//   elige el producto a crédito, ve el estatus del cliente en tiempo real,
//   cobra abonos y envía alertas de cobro por WhatsApp.
// Cada crédito guarda una copia ("snapshot") de los criterios con que se
// otorgó: si el administrador los cambia después, los créditos ya
// otorgados NO se recalculan (contabilidad consistente).
// =====================================================================
(function () {
  'use strict';
  const FK = window.FK;
  const $ = FK.$;
  const esc = FK.esc;
  const r2 = FK.r2;
  const EPS = 0.004;

  // ---------------------------------------------------------------------
  // 1. Configuración por defecto y compatibilidad de datos
  // ---------------------------------------------------------------------
  const PLANTILLA_DEF =
`Hola {cliente} 👋, le saluda *{empresa}*.

Le recordamos su cuota *{cuota}* del crédito {credito} ({articulo}) por *{monto_cuota}* ({monto_cuota_bs}), con vencimiento el *{vence}*.
{situacion}

Saldo pendiente total: {saldo}.
¡Gracias por su puntualidad!`;

  const CONFIG_DEF = {
    interesTipo: 'porcentaje', interesValor: 10,
    inicialPct: 30,
    frecuencias: ['semanal', 'quincenal'], frecuenciaDefecto: 'semanal',
    conteoDias: 'calendario', sabadoHabil: false,
    cuotasMin: 2, cuotasMax: 12,
    moraTipo: 'porcentaje', moraValor: 5, moraModo: 'unica', diasGracia: 2,
    bloquearMorosos: true,
    whatsapp: { codigoPais: '58', diasAviso: 1, apertura: 'web', plantilla: PLANTILLA_DEF }
  };
  const FRECUENCIAS = { diaria: 'Diaria', semanal: 'Semanal', quincenal: 'Quincenal' };
  const FREC_PLURAL = { diaria: 'diarias', semanal: 'semanales', quincenal: 'quincenales' };
  const VARIABLES = {
    cliente: 'Nombre del cliente', empresa: 'Nombre de tu negocio', credito: 'N° de crédito', articulo: 'Producto(s)',
    cuota: 'Cuota pendiente (ej. 3 de 8)', monto_cuota: 'Monto de la cuota', monto_cuota_bs: 'Cuota en Bs', vence: 'Fecha de vencimiento',
    dias_atraso: 'Días de atraso', mora: 'Mora acumulada', total_al_dia: 'Monto para ponerse al día', saldo: 'Saldo total pendiente',
    cuotas_pendientes: 'Cuotas pendientes', situacion: 'Frase automática según el estado'
  };
  const ESTADOS = { al_dia: 'Al día', por_vencer: 'Por vencer', en_mora: 'En mora', pagado: 'Pagado', anulado: 'Anulado', sin_creditos: 'Sin créditos' };

  function clon(o) { return JSON.parse(JSON.stringify(o)); }
  function configCompleta(c) {
    c = c || {};
    const out = { ...clon(CONFIG_DEF), ...c };
    out.whatsapp = { ...clon(CONFIG_DEF.whatsapp), ...(c.whatsapp || {}) };
    if (!Array.isArray(out.frecuencias) || !out.frecuencias.length) out.frecuencias = [...CONFIG_DEF.frecuencias];
    if (!out.frecuencias.includes(out.frecuenciaDefecto)) out.frecuenciaDefecto = out.frecuencias[0];
    return out;
  }

  FK.normalizadores.push((e) => {
    if (!Array.isArray(e.creditos)) e.creditos = [];
    if (e.secuenciaCredito == null) e.secuenciaCredito = 0;
    e.creditoConfig = configCompleta(e.creditoConfig);
  });

  // Migración v1 → v2: los "Préstamos" se convierten en créditos, sin perder pagos.
  // Como los préstamos no tenían fechas, el saldo pendiente queda en una cuota
  // que vence a 30 días de la migración y sin mora (el administrador puede ajustarlo).
  FK.migraciones.push((e) => {
    if (e.prestamosMigrados || !Array.isArray(e.prestamos) || !e.prestamos.length) return false;
    const hoy = hoyStr();
    e.prestamos.forEach(p => {
      e.secuenciaCredito++;
      const financiado = r2(p.montoTotal - (p.pagoInicial || 0));
      const abonado = r2((p.pagos || []).reduce((s, x) => s + x.monto, 0));
      const cuotas = [];
      if (abonado > EPS) cuotas.push({ n: 1, vence: (p.fecha || new Date().toISOString()).slice(0, 10), monto: abonado, pagado: abonado, pagadaEn: hoy });
      if (financiado - abonado > EPS) cuotas.push({ n: cuotas.length + 1, vence: sumarDias(hoy, 30, false, false), monto: r2(financiado - abonado), pagado: 0, pagadaEn: null });
      e.creditos.push({
        id: FK.uid(), numero: e.secuenciaCredito, fecha: p.fecha || new Date().toISOString(), migrado: true,
        clienteId: p.clienteId, clienteNombre: p.clienteNombre, clienteTelefono: ((e.clientes || []).find(c => c.id === p.clienteId) || {}).telefono || '',
        items: [{ productoId: null, nombre: p.articulo, cantidad: 1, precio: p.montoTotal }], articulo: p.articulo,
        precioContado: p.montoTotal, inicial: p.pagoInicial || 0, financiado, interes: 0, total: financiado,
        frecuencia: 'semanal', numeroCuotas: cuotas.length, montoCuota: cuotas.length ? cuotas[cuotas.length - 1].monto : 0,
        criterios: { interesTipo: 'fijo', interesValor: 0, inicialPct: 0, conteoDias: 'calendario', sabadoHabil: false, moraTipo: 'fijo', moraValor: 0, moraModo: 'unica', diasGracia: 0 },
        cuotas, moraPagada: 0, estado: financiado - abonado > EPS ? 'activo' : 'pagado', usuario: p.usuario || '', notas: p.notas || '',
        pagos: [
          ...(p.pagoInicial > 0 ? [{ id: FK.uid(), tipo: 'inicial', fecha: p.fecha, monto: p.pagoInicial, metodo: '', usuario: p.usuario || '', aMora: 0, aCapital: 0 }] : []),
          ...(p.pagos || []).map(x => ({ id: x.id || FK.uid(), tipo: 'abono', fecha: x.fecha, monto: x.monto, metodo: x.metodo, usuario: x.usuario, aMora: 0, aCapital: x.monto }))
        ],
        alertas: []
      });
    });
    e.prestamosMigrados = true;
    const tieneModulo = ((window.FACTURAK_CATEGORIAS[e.categoria] || {}).funciones || []).includes('creditos');
    if (!tieneModulo) e.funcionesExtra = Array.from(new Set([...(e.funcionesExtra || []), 'creditos']));
    return true;
  });

  // ---------------------------------------------------------------------
  // 2. Fechas (días totales o hábiles)
  // ---------------------------------------------------------------------
  function hoyStr(d = new Date()) { const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
  function aFecha(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function fmt(s) { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; }
  const esHabil = (d, sab) => { const w = d.getDay(); return (w >= 1 && w <= 5) || (sab && w === 6); };
  function sumarDias(s, n, habiles, sab) {
    const d = aFecha(s);
    if (!habiles) { d.setDate(d.getDate() + n); return hoyStr(d); }
    let k = 0; while (k < n) { d.setDate(d.getDate() + 1); if (esHabil(d, sab)) k++; }
    return hoyStr(d);
  }
  // Días (totales o hábiles) transcurridos después de "desde" hasta "hasta" inclusive
  function diasEntre(desde, hasta, habiles, sab) {
    const a = aFecha(desde), b = aFecha(hasta);
    if (b <= a) return 0;
    if (!habiles) return Math.round((b - a) / 86400000);
    let n = 0; const d = new Date(a);
    while (d < b) { d.setDate(d.getDate() + 1); if (esHabil(d, sab)) n++; }
    return n;
  }
  const pasoDias = (frec, habiles, sab) => frec === 'diaria' ? 1 : frec === 'semanal' ? (habiles ? (sab ? 6 : 5) : 7) : (habiles ? (sab ? 12 : 10) : 15);

  // ---------------------------------------------------------------------
  // 3. Cálculo del plan y del estado de un crédito
  // ---------------------------------------------------------------------
  function simular(precio, cfg, frecuencia, n, inicio = hoyStr()) {
    precio = r2(precio);
    const inicial = r2(precio * cfg.inicialPct / 100);
    const financiado = r2(precio - inicial);
    const interes = financiado <= 0 ? 0 : cfg.interesTipo === 'porcentaje' ? r2(financiado * cfg.interesValor / 100) : r2(cfg.interesValor);
    const total = r2(financiado + interes);
    const habiles = cfg.conteoDias === 'habiles';
    const cuotaBase = n > 0 ? r2(total / n) : 0;
    const cuotas = [];
    let fecha = inicio;
    for (let i = 1; i <= n; i++) {
      fecha = sumarDias(fecha, pasoDias(frecuencia, habiles, cfg.sabadoHabil), habiles, cfg.sabadoHabil);
      const monto = i < n ? cuotaBase : r2(total - cuotaBase * (n - 1));
      cuotas.push({ n: i, vence: fecha, monto, pagado: 0, pagadaEn: null });
    }
    return { precio, inicial, financiado, interes, total, cuotaBase, cuotas };
  }

  function moraDeCuota(c, cr, ref) {
    const k = cr.criterios;
    if (!(k.moraValor > 0)) return { dias: 0, atraso: 0, mora: 0 };
    const hasta = c.pagadaEn || ref;
    const atraso = diasEntre(c.vence, hasta, k.conteoDias === 'habiles', k.sabadoHabil);
    const dias = Math.max(0, atraso - (k.diasGracia || 0));
    if (!dias) return { dias: 0, atraso, mora: 0 };
    const base = k.moraTipo === 'porcentaje' ? c.monto * k.moraValor / 100 : k.moraValor;
    return { dias, atraso, mora: r2(k.moraModo === 'diaria' ? base * dias : base) };
  }

  function evaluar(cr, ref = hoyStr()) {
    const cfg = FK.emp() ? FK.emp().creditoConfig : CONFIG_DEF;
    let moraTotal = 0, capital = 0, maxAtraso = 0;
    const detalle = cr.cuotas.map(c => {
      const restante = r2(c.monto - c.pagado);
      const m = moraDeCuota(c, cr, ref);
      moraTotal += m.mora;
      if (restante > EPS) { capital += restante; maxAtraso = Math.max(maxAtraso, m.atraso); }
      const vencida = restante > EPS && ref > c.vence;
      return { ...c, restante: Math.max(0, restante), vencida, diasMora: m.dias, atraso: m.atraso, mora: m.mora };
    });
    capital = r2(capital);
    const moraPendiente = Math.max(0, r2(moraTotal - (cr.moraPagada || 0)));
    const saldo = r2(capital + moraPendiente);
    const pendientes = detalle.filter(c => c.restante > EPS);
    const vencidas = pendientes.filter(c => c.vencida);
    const proxima = pendientes[0] || null;
    const conMora = pendientes.some(c => c.diasMora > 0);
    let estado;
    if (cr.estado === 'anulado') estado = 'anulado';
    else if (saldo <= EPS) estado = 'pagado';
    else if (conMora) estado = 'en_mora';
    else if (vencidas.length || (proxima && diasEntre(ref, proxima.vence, false, false) <= (cfg.whatsapp.diasAviso || 0))) estado = 'por_vencer';
    else estado = 'al_dia';
    const alDia = r2(vencidas.reduce((s, c) => s + c.restante, 0) + moraPendiente);
    const pagadoCapital = r2(cr.cuotas.reduce((s, c) => s + c.pagado, 0));
    return { detalle, capital, moraTotal: r2(moraTotal), moraPendiente, saldo, pendientes, vencidas, proxima, estado, alDia, maxAtraso, pagadoCapital,
      pagadoTotal: r2(cr.pagos.reduce((s, p) => s + p.monto, 0)) };
  }

  function estadoCliente(clienteId) {
    const lista = FK.emp().creditos.filter(c => c.clienteId === clienteId && c.estado !== 'anulado');
    const activos = lista.map(c => ({ c, ev: evaluar(c) })).filter(x => x.ev.estado !== 'pagado');
    const res = { estado: 'sin_creditos', activos: activos.length, pagados: lista.length - activos.length, saldo: 0, vencidas: 0, mora: 0, maxAtraso: 0 };
    activos.forEach(({ ev }) => { res.saldo += ev.saldo; res.vencidas += ev.vencidas.length; res.mora += ev.moraPendiente; res.maxAtraso = Math.max(res.maxAtraso, ev.maxAtraso); });
    res.saldo = r2(res.saldo); res.mora = r2(res.mora);
    if (activos.some(x => x.ev.estado === 'en_mora')) res.estado = 'en_mora';
    else if (activos.some(x => x.ev.estado === 'por_vencer')) res.estado = 'por_vencer';
    else if (activos.length) res.estado = 'al_dia';
    return res;
  }

  function aplicarPago(cr, monto, metodo, tipo = 'abono') {
    const ev = evaluar(cr);
    let resto = r2(monto);
    const aMora = Math.min(resto, ev.moraPendiente);
    cr.moraPagada = r2((cr.moraPagada || 0) + aMora);
    resto = r2(resto - aMora);
    let aCapital = 0;
    const hoy = hoyStr();
    for (const c of cr.cuotas) {
      if (resto <= EPS) break;
      const falta = r2(c.monto - c.pagado);
      if (falta <= EPS) continue;
      const p = Math.min(resto, falta);
      c.pagado = r2(c.pagado + p); aCapital = r2(aCapital + p); resto = r2(resto - p);
      if (c.monto - c.pagado <= EPS) c.pagadaEn = hoy;
    }
    const caja = FK.caja();
    const pago = { id: FK.uid(), tipo, fecha: new Date().toISOString(), monto: r2(monto), metodo, usuario: FK.sesion.usuario.usuario,
      aMora: r2(aMora), aCapital, cajaId: caja ? caja.id : null, tasa: FK.tasa() };
    cr.pagos.push(pago);
    if (evaluar(cr).saldo <= EPS) cr.estado = 'pagado';
    return pago;
  }

  // ---------------------------------------------------------------------
  // 4. WhatsApp (protocolo wa.me / whatsapp://)
  // ---------------------------------------------------------------------
  function normalizarTelefono(tel, codigoPais) {
    let d = String(tel || '').replace(/\D/g, '');
    const cp = String(codigoPais || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('00')) d = d.slice(2);
    else if (d.startsWith('0')) d = cp + d.slice(1);            // 0414-1234567 → 584141234567
    else if (cp && !d.startsWith(cp) && d.length <= 10) d = cp + d; // 4141234567 → 584141234567
    return d.length >= 10 && d.length <= 15 ? d : '';
  }

  function variablesDe(cr) {
    const e = FK.emp(), ev = evaluar(cr), tasa = FK.tasa();
    const c = ev.vencidas[0] || ev.proxima;
    const diasAtraso = ev.maxAtraso;
    let situacion;
    if (ev.estado === 'pagado') situacion = '🎉 Su crédito se encuentra totalmente pagado.';
    else if (ev.estado === 'en_mora') situacion = `⚠️ Presenta ${diasAtraso} día(s) de atraso y una mora acumulada de ${FK.usd(ev.moraPendiente)}. Para ponerse al día debe abonar ${FK.usd(ev.alDia)}.`;
    else if (ev.vencidas.length) situacion = `⏰ Su cuota venció hace ${diasAtraso} día(s). Aún está dentro del plazo de gracia: evite recargos pagando hoy ${FK.usd(ev.alDia)}.`;
    else if (c) { const d = diasEntre(hoyStr(), c.vence, false, false); situacion = d === 0 ? '📅 Su cuota vence *hoy*.' : d === 1 ? '📅 Su cuota vence *mañana*.' : `📅 Su cuota vence en ${d} días.`; }
    else situacion = '';
    return {
      cliente: cr.clienteNombre, empresa: e.nombre, credito: 'CR-' + String(cr.numero).padStart(6, '0'), articulo: cr.articulo,
      cuota: c ? `${c.n} de ${cr.cuotas.length}` : '-', monto_cuota: c ? FK.usd(c.restante) : FK.usd(0),
      monto_cuota_bs: c && tasa ? FK.bs(c.restante * tasa) : '-', vence: c ? fmt(c.vence) : '-',
      dias_atraso: String(diasAtraso), mora: FK.usd(ev.moraPendiente), total_al_dia: FK.usd(ev.alDia || (c ? c.restante : 0)),
      saldo: FK.usd(ev.saldo), cuotas_pendientes: String(ev.pendientes.length), situacion
    };
  }
  const llenarPlantilla = (plantilla, vars) => String(plantilla || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

  function urlWhatsApp(numero, texto) {
    const cfg = FK.emp().creditoConfig.whatsapp;
    const t = encodeURIComponent(texto);
    return cfg.apertura === 'app' ? `whatsapp://send?phone=${numero}&text=${t}` : `https://wa.me/${numero}?text=${t}`;
  }

  // ---------------------------------------------------------------------
  // 5. Tickets térmicos 58mm (mismo formato que la factura térmica)
  // ---------------------------------------------------------------------
  const CSS58 = `*{box-sizing:border-box}html,body{margin:0;padding:0}body{width:58mm;padding:2mm 3mm;font-family:"Consolas","Courier New",monospace;font-size:10.5px;color:#000;line-height:1.3}
    .c{text-align:center}.row{display:flex;justify-content:space-between;gap:4px}.hr{border-top:1px dashed #000;margin:4px 0}.b{font-weight:bold}.big{font-size:13px;font-weight:bold}@page{size:58mm auto;margin:0}`;
  const numCr = (cr) => 'CR-' + String(cr.numero).padStart(6, '0');

  FK.doc.creditoComprobante = (cr, e) => {
    const k = cr.criterios;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS58}</style></head><body>
      <div class="c b" style="font-size:12px">${esc(e.nombre)}</div>${e.rif ? `<div class="c">RIF: ${esc(e.rif)}</div>` : ''}
      <div class="hr"></div><div class="c big">CONTRATO DE CRÉDITO</div><div class="c">N° ${numCr(cr)}</div><div class="c">${FK.fechaHora(cr.fecha)}</div><div class="hr"></div>
      <div>Cliente: ${esc(cr.clienteNombre)}</div>${cr.clienteCedula ? `<div>Doc: ${esc(cr.clienteCedula)}</div>` : ''}<div>Tel: ${esc(cr.clienteTelefono || '-')}</div>
      <div class="hr"></div>${cr.items.map(i => `<div>${esc(i.nombre)}</div><div class="row"><span>${i.cantidad} x ${FK.usd(i.precio)}</span><span>${FK.usd(i.cantidad * i.precio)}</span></div>`).join('')}
      <div class="hr"></div>
      <div class="row"><span>Precio contado</span><span>${FK.usd(cr.precioContado)}</span></div>
      <div class="row"><span>Inicial ${k.inicialPct}%</span><span>${FK.usd(cr.inicial)}</span></div>
      <div class="row"><span>Financiado</span><span>${FK.usd(cr.financiado)}</span></div>
      <div class="row"><span>Interés ${k.interesTipo === 'porcentaje' ? k.interesValor + '%' : 'fijo'}</span><span>${FK.usd(cr.interes)}</span></div>
      <div class="row big"><span>TOTAL CRÉDITO</span><span>${FK.usd(cr.total)}</span></div>
      <div class="hr"></div><div class="b">${cr.numeroCuotas} cuota(s) ${FREC_PLURAL[cr.frecuencia] || ''}</div>
      <div>(${k.conteoDias === 'habiles' ? 'días hábiles' : 'días calendario'})</div>
      ${cr.cuotas.map(c => `<div class="row"><span>${String(c.n).padStart(2, '0')}. ${fmt(c.vence)}</span><span>${FK.usd(c.monto)}</span></div>`).join('')}
      <div class="hr"></div>
      ${k.moraValor > 0 ? `<div>Mora: ${k.moraTipo === 'porcentaje' ? k.moraValor + '% de la cuota' : FK.usd(k.moraValor)} ${k.moraModo === 'diaria' ? 'por día de atraso' : 'por cuota vencida'}${k.diasGracia ? `, tras ${k.diasGracia} día(s) de gracia` : ''}.</div><div class="hr"></div>` : ''}
      <div style="margin-top:14px" class="c">______________________</div><div class="c">Firma del cliente</div>
      <div class="c" style="margin-top:4px">Atendido por: ${esc(cr.usuario)}</div></body></html>`;
  };

  FK.doc.reciboAbono = (cr, pago, e) => {
    const ev = evaluar(cr);
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS58}</style></head><body>
      <div class="c b" style="font-size:12px">${esc(e.nombre)}</div>${e.rif ? `<div class="c">RIF: ${esc(e.rif)}</div>` : ''}
      <div class="hr"></div><div class="c big">${pago.tipo === 'inicial' ? 'PAGO INICIAL' : 'RECIBO DE ABONO'}</div>
      <div class="c">Crédito ${numCr(cr)}</div><div class="c">${FK.fechaHora(pago.fecha)}</div><div class="hr"></div>
      <div>Cliente: ${esc(cr.clienteNombre)}</div><div>Artículo: ${esc(cr.articulo)}</div><div class="hr"></div>
      <div class="row big"><span>MONTO</span><span>${FK.usd(pago.monto)}</span></div>
      ${pago.tasa ? `<div class="row"><span>En Bs</span><span>${FK.bs(pago.monto * pago.tasa)}</span></div>` : ''}
      ${pago.aMora > 0 ? `<div class="row"><span>A mora</span><span>${FK.usd(pago.aMora)}</span></div><div class="row"><span>A capital</span><span>${FK.usd(pago.aCapital)}</span></div>` : ''}
      <div>Pago: ${esc(FK.metodoNombre(pago.metodo))}</div><div class="hr"></div>
      <div class="row b"><span>Saldo pendiente</span><span>${FK.usd(ev.saldo)}</span></div>
      ${ev.proxima ? `<div>Próx. cuota: ${fmt(ev.proxima.vence)} · ${FK.usd(ev.proxima.restante)}</div>` : '<div class="c b">¡CRÉDITO PAGADO!</div>'}
      <div class="hr"></div><div class="c">Recibido por: ${esc(pago.usuario)}</div><div class="c">¡Gracias!</div></body></html>`;
  };

  // ---------------------------------------------------------------------
  // 6. API pública del módulo (usada por la caja y otras pantallas)
  // ---------------------------------------------------------------------
  FK.creditos = {
    CONFIG_DEF, PLANTILLA_DEF, simular, evaluar, estadoCliente, aplicarPago, normalizarTelefono, llenarPlantilla, variablesDe, urlWhatsApp,
    fechas: { hoyStr, sumarDias, diasEntre, fmt },
    cobrosDeCaja(cajaId) {
      let total = 0, n = 0;
      FK.emp().creditos.forEach(cr => cr.pagos.forEach(p => { if (p.cajaId === cajaId) { total += p.monto; n++; } }));
      return { total: r2(total), n };
    }
  };

  // =====================================================================
  // 7. INTERFAZ
  // =====================================================================
  let vista = 'nuevo';
  let filtroCartera = 'activos';
  let nuevo = { cliente: null, items: [], frecuencia: null, cuotas: null };
  let creditoActual = null;
  let colaCobranza = null; // cola de envío en secuencia

  const chip = (estado) => `<span class="estado-chip estado-${estado}">● ${ESTADOS[estado] || estado}</span>`;
  const puedeOperar = () => ['admin', 'vendedor', 'cajero'].includes(FK.rol());
  const alertadoHoy = (cr) => (cr.alertas || []).some(a => a.fecha.slice(0, 10) === hoyStr());

  function kpis() {
    const e = FK.emp();
    let cartera = 0, activos = 0, moraN = 0, moraMonto = 0, cobradoMes = 0;
    const mes = hoyStr().slice(0, 7);
    e.creditos.forEach(cr => {
      if (cr.estado === 'anulado') return;
      const ev = evaluar(cr);
      if (ev.estado !== 'pagado') { cartera += ev.saldo; activos++; }
      if (ev.estado === 'en_mora') { moraN++; moraMonto += ev.alDia; }
      cr.pagos.forEach(p => { if (p.fecha.slice(0, 7) === mes) cobradoMes += p.monto; });
    });
    const tile = (valor, etiqueta, color, sub = '') => `<div class="bg-white rounded-2xl shadow-sm p-4"><div class="text-[11px] uppercase font-semibold text-greym">${etiqueta}</div>
      <div class="text-2xl font-extrabold ${color} mt-1">${valor}</div>${sub ? `<div class="text-[11px] text-greym mt-0.5">${sub}</div>` : ''}</div>`;
    $('cr-kpis').innerHTML = tile(FK.usd(cartera), 'Cartera por cobrar', 'text-dark333', FK.tasa() ? FK.bs(cartera * FK.tasa()) : '')
      + tile(activos, 'Créditos activos', 'text-primary')
      + tile(moraN, 'Clientes en mora', moraN ? 'text-accent' : 'text-dark333', moraN ? FK.usd(moraMonto) + ' para ponerse al día' : 'Todo en orden')
      + tile(FK.usd(cobradoMes), 'Cobrado este mes', 'text-teal');
  }

  function pendientesCobranza() {
    return FK.emp().creditos.filter(c => c.estado !== 'anulado').map(cr => ({ cr, ev: evaluar(cr) }))
      .filter(x => x.ev.estado === 'en_mora' || x.ev.estado === 'por_vencer')
      .sort((a, b) => b.ev.maxAtraso - a.ev.maxAtraso || (a.ev.proxima?.vence || '').localeCompare(b.ev.proxima?.vence || ''));
  }

  FK.actualizarBadgeCreditos = () => {
    const nav = $('nav-creditos'); if (!nav) return;
    let b = nav.querySelector('.nav-badge');
    const n = FK.emp() && FK.tiene('creditos') && puedeOperar() ? pendientesCobranza().filter(x => !alertadoHoy(x.cr)).length : 0;
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'nav-badge'; nav.appendChild(b); }
    b.textContent = n > 99 ? '99+' : n;
    b.title = `${n} cobro(s) pendiente(s) de avisar hoy`;
  };

  function pintarSubtabs() {
    const n = pendientesCobranza().filter(x => !alertadoHoy(x.cr)).length;
    $('cr-subtabs').innerHTML = [
      ['nuevo', '＋ Nuevo crédito'], ['cartera', 'Cartera'], ['cobranza', `Cobranza${n ? ` <span class="ml-1 bg-accent text-white rounded-full px-1.5 text-[10px]">${n}</span>` : ''}`],
      ...(FK.esAdmin() ? [['config', '⚙ Criterios del crédito']] : [])
    ].map(([k, t]) => `<button data-vista="${k}" class="subtab-btn text-xs font-bold px-3.5 py-2 rounded-lg transition ${vista === k ? 'subtab-activo' : ''}">${t}</button>`).join('');
  }

  FK.render.creditos = () => {
    if (vista === 'config' && !FK.esAdmin()) vista = 'nuevo';
    kpis(); pintarSubtabs();
    ({ nuevo: vistaNuevo, cartera: vistaCartera, cobranza: vistaCobranza, config: vistaConfig })[vista]();
    FK.actualizarBadgeCreditos();
  };
  const refrescar = () => { if (FK.tabActual() === 'creditos') FK.render.creditos(); else FK.actualizarBadgeCreditos(); };

  // ----------------------- Vista: NUEVO CRÉDITO -----------------------
  function resumenCriterios(cfg) {
    const hab = cfg.conteoDias === 'habiles';
    return [
      ['Interés', cfg.interesTipo === 'porcentaje' ? `${cfg.interesValor}% sobre lo financiado` : `${FK.usd(cfg.interesValor)} fijo`],
      ['Inicial', `${cfg.inicialPct}% del precio`],
      ['Plazos', `${cfg.cuotasMin} a ${cfg.cuotasMax} cuotas · ${hab ? `días hábiles${cfg.sabadoHabil ? ' (lun–sáb)' : ' (lun–vie)'}` : 'días calendario'}`],
      ['Mora', cfg.moraValor > 0 ? `${cfg.moraTipo === 'porcentaje' ? cfg.moraValor + '% de la cuota' : FK.usd(cfg.moraValor)} ${cfg.moraModo === 'diaria' ? 'por día' : 'por cuota vencida'}${cfg.diasGracia ? ` · ${cfg.diasGracia} día(s) de gracia` : ''}` : 'Sin mora']
    ];
  }

  function vistaNuevo() {
    const cfg = FK.emp().creditoConfig;
    if (!nuevo.frecuencia || !cfg.frecuencias.includes(nuevo.frecuencia)) nuevo.frecuencia = cfg.frecuenciaDefecto;
    if (!nuevo.cuotas || nuevo.cuotas < cfg.cuotasMin || nuevo.cuotas > cfg.cuotasMax) nuevo.cuotas = Math.min(cfg.cuotasMax, Math.max(cfg.cuotasMin, 4));
    $('cr-vista').innerHTML = `<div class="grid grid-cols-1 xl:grid-cols-5 gap-5 animate-fadeIn">
      <div class="xl:col-span-3 flex flex-col gap-5">
        <div class="bg-white rounded-2xl shadow-sm p-5">
          <div class="flex items-center justify-between mb-3"><div class="text-sm font-bold text-dark333"><span class="text-teal">1 ·</span> Cliente</div>
            <button id="cr-cli-nuevo" class="text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition">＋ Registrar cliente</button></div>
          <div id="cr-cli-box"></div>
        </div>
        <div class="bg-white rounded-2xl shadow-sm p-5">
          <div class="text-sm font-bold text-dark333 mb-3"><span class="text-teal">2 ·</span> Producto(s) a crédito</div>
          <input id="cr-prod-q" type="text" class="input-field !mt-0" placeholder="Buscar producto por nombre o código..." autocomplete="off">
          <div id="cr-prod-res" class="flex flex-col gap-1.5 mt-2"></div>
          <div id="cr-items" class="flex flex-col gap-2 mt-3"></div>
        </div>
      </div>
      <div class="xl:col-span-2">
        <div class="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-4 sticky top-24">
          <div><div class="text-sm font-bold text-dark333"><span class="text-teal">3 ·</span> Plan de pago</div>
            <div class="mt-2 bg-gray-50 rounded-xl p-3 flex flex-col gap-1">
              <div class="text-[10px] uppercase font-bold text-greym flex items-center gap-1">🔒 Criterios definidos por el administrador</div>
              ${resumenCriterios(cfg).map(([a, b]) => `<div class="flex justify-between gap-3 text-[11px]"><span class="text-greym">${a}</span><span class="font-semibold text-dark333 text-right">${esc(b)}</span></div>`).join('')}
            </div></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="text-xs font-semibold text-greym">Frecuencia</label>
              <select id="cr-frec" class="input-field">${cfg.frecuencias.map(f => `<option value="${f}" ${f === nuevo.frecuencia ? 'selected' : ''}>${FRECUENCIAS[f]}</option>`).join('')}</select></div>
            <div><label class="text-xs font-semibold text-greym">N° de cuotas</label>
              <select id="cr-ncuotas" class="input-field">${Array.from({ length: cfg.cuotasMax - cfg.cuotasMin + 1 }, (_, i) => cfg.cuotasMin + i).map(n => `<option value="${n}" ${n === nuevo.cuotas ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          </div>
          <div id="cr-plan"></div>
        </div>
      </div></div>`;
    pintarCliente(); pintarItems(); pintarPlan();
  }

  function pintarCliente() {
    const box = $('cr-cli-box'); if (!box) return;
    const c = nuevo.cliente;
    if (!c) {
      box.innerHTML = `<input id="cr-cli-q" type="text" class="input-field !mt-0" placeholder="Buscar cliente por nombre o cédula..." autocomplete="off">
        <div id="cr-cli-res" class="flex flex-col gap-1.5 mt-2"></div>`;
      return;
    }
    const st = estadoCliente(c.id);
    const tel = normalizarTelefono(c.telefono, FK.emp().creditoConfig.whatsapp.codigoPais);
    const bloqueado = st.estado === 'en_mora' && FK.emp().creditoConfig.bloquearMorosos;
    box.innerHTML = `<div class="flex items-start gap-3">
        <div class="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-extrabold text-lg shrink-0">${esc(c.nombre.charAt(0).toUpperCase())}</div>
        <div class="flex-1 min-w-0"><div class="font-bold text-dark333">${esc(c.nombre)}</div>
          <div class="text-xs text-greym">${esc(c.cedula || 'Sin cédula')} · ${c.telefono ? '📱 ' + esc(c.telefono) : '<span class="text-accent font-semibold">sin teléfono</span>'}${c.telefono && !tel ? ' <span class="text-accent">(número no válido)</span>' : ''}</div></div>
        <button id="cr-cli-cambiar" class="btn-atras"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>Cambiar</button>
      </div>
      <div class="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div class="bg-gray-50 rounded-xl p-2.5"><div class="text-[10px] uppercase text-greym font-semibold">Estatus</div><div class="mt-1">${chip(st.estado)}</div></div>
        <div class="bg-gray-50 rounded-xl p-2.5"><div class="text-[10px] uppercase text-greym font-semibold">Créditos activos</div><div class="font-extrabold text-dark333">${st.activos}${st.pagados ? ` <span class="text-[11px] font-semibold text-greym">(+${st.pagados} pagados)</span>` : ''}</div></div>
        <div class="bg-gray-50 rounded-xl p-2.5"><div class="text-[10px] uppercase text-greym font-semibold">Saldo pendiente</div><div class="font-extrabold text-dark333">${FK.usd(st.saldo)}</div></div>
        <div class="bg-gray-50 rounded-xl p-2.5"><div class="text-[10px] uppercase text-greym font-semibold">Cuotas vencidas</div><div class="font-extrabold ${st.vencidas ? 'text-accent' : 'text-dark333'}">${st.vencidas}${st.maxAtraso ? ` <span class="text-[11px] font-semibold">(${st.maxAtraso} días)</span>` : ''}</div></div>
      </div>
      ${!c.telefono || !tel ? `<div class="mt-3 flex items-center justify-between gap-3 bg-amber-100 text-amber-700 rounded-xl px-3 py-2 text-xs font-semibold">El cliente necesita un teléfono válido para recibir alertas de cobro por WhatsApp.<button id="cr-cli-editar" class="underline shrink-0">Agregar teléfono</button></div>` : ''}
      ${bloqueado ? `<div class="mt-3 bg-accent/10 text-accent rounded-xl px-3 py-2 text-xs font-semibold">⛔ Cliente en mora: según los criterios del administrador no puede recibir un nuevo crédito hasta ponerse al día (${FK.usd(st.mora)} de mora).</div>` : ''}
      ${st.activos ? `<button id="cr-cli-ver" class="mt-2 text-xs font-semibold text-primary hover:underline">Ver sus créditos activos →</button>` : ''}`;
  }

  function pintarResultadosCliente() {
    const q = $('cr-cli-q'), res = $('cr-cli-res'); if (!q || !res) return;
    const lista = FK.buscarClientes(q.value);
    res.innerHTML = !q.value.trim() ? '' : lista.length ? lista.map(c => {
      const st = estadoCliente(c.id);
      return `<button data-cid="${c.id}" class="flex items-center justify-between gap-3 bg-gray-50 hover:bg-primary/5 rounded-xl px-3 py-2 text-left transition">
        <div><div class="text-sm font-semibold text-dark333">${esc(c.nombre)}</div><div class="text-[11px] text-greym">${esc(c.cedula || 'Sin cédula')}${c.telefono ? ' · ' + esc(c.telefono) : ''}</div></div>${chip(st.estado)}</button>`;
    }).join('') : `<div class="text-xs text-greym px-1">Sin resultados. <button id="cr-cli-nuevo2" class="text-primary font-semibold hover:underline">Registrar "${esc(q.value.trim())}"</button></div>`;
  }

  function pintarResultadosProducto() {
    const q = $('cr-prod-q'), res = $('cr-prod-res'); if (!q || !res) return;
    const n = FK.norm(q.value.trim());
    if (!n) { res.innerHTML = ''; return; }
    const lista = FK.emp().productos.filter(p => FK.vendible(p) && (FK.norm(p.nombre).includes(n) || FK.norm(p.codigo).includes(n))).slice(0, 6);
    res.innerHTML = lista.length ? lista.map(p => {
      const st = FK.stockDe(p), sin = FK.itemControlaStock(p) && st <= 0;
      return `<button data-pid="${p.id}" ${sin ? 'disabled' : ''} class="flex items-center justify-between gap-3 bg-gray-50 hover:bg-primary/5 rounded-xl px-3 py-2 text-left transition disabled:opacity-40">
        <div><div class="text-sm font-semibold text-dark333">${esc(p.nombre)}</div><div class="text-[11px] text-greym">${esc(p.codigo || 'Sin código')}${FK.itemControlaStock(p) ? ' · ' + (sin ? 'Agotado' : st + ' disp.') : ''}</div></div>
        <div class="text-sm font-extrabold text-teal">${FK.usd(p.precio)}</div></button>`;
    }).join('') : '<div class="text-xs text-greym px-1">Ningún producto coincide.</div>';
  }

  const totalItems = () => r2(nuevo.items.reduce((s, i) => s + i.cantidad * i.precio, 0));
  function pintarItems() {
    const box = $('cr-items'); if (!box) return;
    box.innerHTML = nuevo.items.length ? nuevo.items.map((i, idx) => `<div class="flex items-center gap-2 bg-gray-50 rounded-xl p-2.5 animate-fadeIn">
        <div class="flex-1 min-w-0"><div class="text-sm font-semibold text-dark333 truncate">${esc(i.nombre)}</div><div class="text-[11px] text-greym">${FK.usd(i.precio)} c/u</div></div>
        <div class="flex items-center gap-1"><button data-it="menos" data-idx="${idx}" class="w-6 h-6 rounded-lg bg-white border border-gray-200 font-bold leading-none">−</button>
        <span class="w-6 text-center text-sm font-semibold">${i.cantidad}</span><button data-it="mas" data-idx="${idx}" class="w-6 h-6 rounded-lg bg-white border border-gray-200 font-bold leading-none">+</button></div>
        <div class="text-sm font-bold w-20 text-right">${FK.usd(i.cantidad * i.precio)}</div>
        <button data-it="del" data-idx="${idx}" class="text-greym hover:text-accent text-lg leading-none px-1">&times;</button></div>`).join('')
      + `<div class="flex justify-between text-sm font-bold text-dark333 px-1 pt-1"><span>Precio de contado</span><span>${FK.usd(totalItems())}</span></div>`
      : '<div class="text-xs text-greym text-center py-5 bg-gray-50 rounded-xl">Busca y selecciona el producto que el cliente se lleva a crédito.</div>';
  }

  function pintarPlan() {
    const box = $('cr-plan'); if (!box) return;
    const cfg = FK.emp().creditoConfig, tasa = FK.tasa();
    const precio = totalItems();
    if (!precio) { box.innerHTML = '<div class="text-xs text-greym text-center py-6 bg-gray-50 rounded-xl">El plan se calcula al elegir el producto.</div>'; return; }
    const s = simular(precio, cfg, nuevo.frecuencia, nuevo.cuotas);
    const st = nuevo.cliente ? estadoCliente(nuevo.cliente.id) : null;
    const bloqueado = st && st.estado === 'en_mora' && cfg.bloquearMorosos;
    const fila = (a, b, cls = '') => `<div class="flex justify-between ${cls}"><span>${a}</span><span>${b}</span></div>`;
    box.innerHTML = `<div class="flex flex-col gap-1.5 text-sm text-greym">
        ${fila('Precio de contado', FK.usd(s.precio))}
        ${fila(`Inicial (${cfg.inicialPct}%)`, FK.usd(s.inicial))}
        ${fila('Monto a financiar', FK.usd(s.financiado))}
        ${fila(`Interés ${cfg.interesTipo === 'porcentaje' ? `(${cfg.interesValor}%)` : '(fijo)'}`, FK.usd(s.interes))}
        ${fila('Total a crédito', FK.usd(s.total), 'font-bold text-dark333 border-t border-gray-100 pt-1.5')}
      </div>
      <div class="bg-teal/10 rounded-xl p-3 text-center">
        <div class="text-[11px] uppercase font-bold text-teal">${s.cuotas.length} cuotas ${FREC_PLURAL[nuevo.frecuencia]}</div>
        <div class="text-2xl font-extrabold text-teal">${FK.usd(s.cuotaBase)}</div>
        ${tasa ? `<div class="text-xs font-semibold text-primary">${FK.bs(s.cuotaBase * tasa)}</div>` : ''}
        <div class="text-[11px] text-greym mt-1">Primera: ${fmt(s.cuotas[0].vence)} · Última: ${fmt(s.cuotas[s.cuotas.length - 1].vence)}</div>
      </div>
      <details class="bg-gray-50 rounded-xl px-3 py-2"><summary class="text-xs font-semibold text-primary cursor-pointer">Ver cronograma completo</summary>
        <div class="mt-2 flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">${s.cuotas.map(c => `<div class="flex justify-between text-[11px] text-greym"><span>Cuota ${c.n} · ${fmt(c.vence)}</span><span class="font-semibold text-dark333">${FK.usd(c.monto)}</span></div>`).join('')}</div></details>
      ${s.inicial > 0 ? `<div><label class="text-xs font-semibold text-greym">Método de pago de la inicial (${FK.usd(s.inicial)}) *</label>
        <select id="cr-metodo" class="input-field"><option value="">Selecciona...</option>${Object.entries(window.FACTURAK_METODOS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>` : ''}
      <label class="flex items-center gap-2 text-xs text-greym"><input type="checkbox" id="cr-imprimir" checked class="rounded accent-primary"> Imprimir contrato (ticket 58mm)</label>
      <button id="cr-registrar" ${!nuevo.cliente || bloqueado ? 'disabled' : ''} class="w-full bg-teal hover:bg-teal/90 text-white font-bold py-3 rounded-xl transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed">Registrar crédito</button>
      ${!nuevo.cliente ? '<p class="text-[11px] text-greym text-center -mt-2">Selecciona un cliente para continuar.</p>' : ''}`;
  }

  async function registrarCredito() {
    const e = FK.emp(), cfg = e.creditoConfig, c = nuevo.cliente;
    if (!c || !nuevo.items.length) return;
    if (!normalizarTelefono(c.telefono, cfg.whatsapp.codigoPais)) { FK.toast('Agrega un teléfono válido al cliente antes de otorgar el crédito', 'error'); return; }
    const st = estadoCliente(c.id);
    if (st.estado === 'en_mora' && cfg.bloquearMorosos) { FK.toast('Cliente en mora: no puede recibir un nuevo crédito', 'error'); return; }
    const s = simular(totalItems(), cfg, nuevo.frecuencia, nuevo.cuotas);
    const metodo = $('cr-metodo') ? $('cr-metodo').value : '';
    if (s.inicial > 0 && !metodo) { FK.toast('Selecciona el método de pago de la inicial', 'error'); $('cr-metodo').focus(); return; }
    for (const it of nuevo.items) {
      const p = e.productos.find(x => x.id === it.productoId);
      if (!p || (FK.itemControlaStock(p) && it.cantidad > FK.stockDe(p) + 1e-9)) { FK.toast(`Stock insuficiente de "${it.nombre}"`, 'error'); return; }
    }
    const ok = await FK.confirmar(`${c.nombre} se lleva ${nuevo.items.map(i => `${i.cantidad} x ${i.nombre}`).join(', ')}.\n` +
      `Inicial: ${FK.usd(s.inicial)} · ${s.cuotas.length} cuotas ${FREC_PLURAL[nuevo.frecuencia]} de ${FK.usd(s.cuotaBase)} · Total a crédito: ${FK.usd(s.total)}.`, { titulo: 'Confirmar crédito', ok: 'Registrar' });
    if (!ok) return;
    e.secuenciaCredito++;
    const cr = {
      id: FK.uid(), numero: e.secuenciaCredito, fecha: new Date().toISOString(),
      clienteId: c.id, clienteNombre: c.nombre, clienteCedula: c.cedula || '', clienteTelefono: c.telefono || '',
      items: nuevo.items.map(i => ({ productoId: i.productoId, nombre: i.nombre, cantidad: i.cantidad, precio: i.precio })),
      articulo: nuevo.items.map(i => (i.cantidad > 1 ? i.cantidad + ' x ' : '') + i.nombre).join(', '),
      precioContado: s.precio, inicial: s.inicial, financiado: s.financiado, interes: s.interes, total: s.total,
      frecuencia: nuevo.frecuencia, numeroCuotas: s.cuotas.length, montoCuota: s.cuotaBase,
      criterios: { interesTipo: cfg.interesTipo, interesValor: cfg.interesValor, inicialPct: cfg.inicialPct, conteoDias: cfg.conteoDias, sabadoHabil: cfg.sabadoHabil,
        moraTipo: cfg.moraTipo, moraValor: cfg.moraValor, moraModo: cfg.moraModo, diasGracia: cfg.diasGracia },
      cuotas: s.cuotas, moraPagada: 0, estado: 'activo', usuario: FK.sesion.usuario.usuario, pagos: [], alertas: []
    };
    FK.descontarStock(cr.items); // solo ítems que controlan stock
    if (s.inicial > 0) {
      const caja = FK.caja();
      cr.pagos.push({ id: FK.uid(), tipo: 'inicial', fecha: cr.fecha, monto: s.inicial, metodo, usuario: cr.usuario, aMora: 0, aCapital: 0, cajaId: caja ? caja.id : null, tasa: FK.tasa() });
    }
    e.creditos.push(cr);
    FK.store.saveNow();
    if ($('cr-imprimir') && $('cr-imprimir').checked) FK.imprimir(FK.doc.creditoComprobante(cr, e), { destino: 'caja', ancho: 58 });
    FK.toast(`Crédito ${numCr(cr)} registrado`);
    nuevo = { cliente: null, items: [], frecuencia: null, cuotas: null };
    refrescar();
    abrirDetalle(cr);
  }

  // ----------------------- Vista: CARTERA -----------------------
  function vistaCartera() {
    const filtros = [['activos', 'Activos'], ['en_mora', 'En mora'], ['por_vencer', 'Por vencer'], ['al_dia', 'Al día'], ['pagado', 'Pagados'], ['anulado', 'Anulados'], ['todos', 'Todos']];
    $('cr-vista').innerHTML = `<div class="animate-fadeIn">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <div class="seg flex-wrap">${filtros.map(([k, t]) => `<button data-filtro="${k}" class="${filtroCartera === k ? 'on' : ''}">${t}</button>`).join('')}</div>
        <input id="cr-cartera-q" type="text" class="input-field !mt-0 md:!w-80" placeholder="Buscar cliente, cédula o N° de crédito...">
      </div>
      <div class="bg-white rounded-2xl shadow-sm overflow-hidden"><table class="w-full text-sm">
        <thead class="bg-gray-50 text-greym uppercase text-xs"><tr><th class="text-left px-5 py-3">Crédito</th><th class="text-left px-5 py-3">Cliente</th><th class="text-left px-5 py-3">Artículo</th>
          <th class="text-right px-5 py-3">Total</th><th class="text-right px-5 py-3">Saldo</th><th class="text-left px-5 py-3">Próx. cuota</th><th class="text-center px-5 py-3">Estatus</th><th class="text-right px-5 py-3">Acciones</th></tr></thead>
        <tbody id="cr-cartera-body"></tbody></table></div></div>`;
    pintarCartera();
  }

  function pintarCartera() {
    const body = $('cr-cartera-body'); if (!body) return;
    const q = FK.norm(($('cr-cartera-q') || {}).value || '');
    const filas = [...FK.emp().creditos].reverse().map(cr => ({ cr, ev: evaluar(cr) })).filter(({ cr, ev }) => {
      const okF = filtroCartera === 'todos' || (filtroCartera === 'activos' ? !['pagado', 'anulado'].includes(ev.estado) : ev.estado === filtroCartera);
      const okQ = !q || FK.norm(cr.clienteNombre).includes(q) || FK.norm(cr.clienteCedula).includes(q) || FK.norm(numCr(cr)).includes(q) || FK.norm(cr.articulo).includes(q);
      return okF && okQ;
    });
    body.innerHTML = filas.length ? filas.map(({ cr, ev }) => `<tr class="border-t border-gray-100 hover:bg-gray-50/60 cursor-pointer" data-ver="${cr.id}">
        <td class="px-5 py-3 font-mono text-xs text-greym">${numCr(cr)}${cr.migrado ? '<div class="text-[10px] font-sans">migrado</div>' : ''}</td>
        <td class="px-5 py-3"><div class="font-semibold text-dark333">${esc(cr.clienteNombre)}</div><div class="text-[11px] text-greym">${esc(cr.clienteTelefono || '-')}</div></td>
        <td class="px-5 py-3 text-greym max-w-[220px] truncate">${esc(cr.articulo)}</td>
        <td class="px-5 py-3 text-right font-semibold">${FK.usd(cr.total)}</td>
        <td class="px-5 py-3 text-right font-bold ${ev.saldo > EPS ? 'text-dark333' : 'text-teal'}">${FK.usd(ev.saldo)}${ev.moraPendiente > 0 ? `<div class="text-[10px] text-accent font-semibold">incl. mora ${FK.usd(ev.moraPendiente)}</div>` : ''}</td>
        <td class="px-5 py-3 text-xs text-greym">${ev.proxima && cr.estado !== 'anulado' ? `${fmt(ev.proxima.vence)}<div class="font-semibold text-dark333">${FK.usd(ev.proxima.restante)}</div>` : '—'}</td>
        <td class="px-5 py-3 text-center">${chip(ev.estado)}</td>
        <td class="px-5 py-3 text-right whitespace-nowrap">${!['pagado', 'anulado'].includes(ev.estado) ? `<button data-wa="${cr.id}" class="btn-wa text-xs font-bold px-2.5 py-1.5 rounded-lg mr-1" title="Alerta de cobro por WhatsApp">WhatsApp</button>` : ''}<button data-ver="${cr.id}" class="text-xs font-semibold text-primary hover:underline">Ver</button></td>
      </tr>`).join('') : '<tr><td colspan="8" class="text-center text-greym py-10">No hay créditos en esta vista.</td></tr>';
  }

  // ----------------------- Vista: COBRANZA -----------------------
  function haceCuanto(iso) {
    const min = Math.round((Date.now() - new Date(iso)) / 60000);
    if (min < 1) return 'hace un momento'; if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60); if (h < 24) return `hace ${h} h`;
    return `hace ${Math.round(h / 24)} día(s)`;
  }
  function vistaCobranza() {
    const lista = pendientesCobranza();
    const porAvisar = lista.filter(x => !alertadoHoy(x.cr));
    $('cr-vista').innerHTML = `<div class="animate-fadeIn">
      <div class="bg-white rounded-2xl shadow-sm p-5 mb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div><div class="text-sm font-bold text-dark333">Cobranza del día</div>
          <p class="text-xs text-greym mt-1 max-w-xl">Clientes en mora o con cuotas por vencer en los próximos ${FK.emp().creditoConfig.whatsapp.diasAviso} día(s). Cada alerta usa la plantilla de WhatsApp definida por el administrador y queda registrada.</p></div>
        <button id="cr-cola" ${porAvisar.length ? '' : 'disabled'} class="btn-wa font-bold px-5 py-2.5 rounded-xl transition active:scale-95 disabled:opacity-40 shrink-0">📲 Enviar alertas en secuencia (${porAvisar.length})</button>
      </div>
      <div class="flex flex-col gap-2">${lista.length ? lista.map(({ cr, ev }) => {
        const ult = (cr.alertas || []).slice(-1)[0];
        return `<div class="bg-white rounded-2xl shadow-sm p-4 flex flex-col md:flex-row md:items-center gap-3">
          <div class="flex-1 min-w-0"><div class="flex items-center gap-2 flex-wrap"><span class="font-bold text-dark333">${esc(cr.clienteNombre)}</span>${chip(ev.estado)}<span class="text-[11px] font-mono text-greym">${numCr(cr)}</span></div>
            <div class="text-xs text-greym mt-1 truncate">${esc(cr.articulo)} · 📱 ${esc(cr.clienteTelefono || 'sin teléfono')}</div>
            <div class="text-xs mt-1 ${ev.estado === 'en_mora' ? 'text-accent font-semibold' : 'text-dark333'}">${ev.estado === 'en_mora' ? `${ev.maxAtraso} día(s) de atraso · mora ${FK.usd(ev.moraPendiente)} · para ponerse al día: ${FK.usd(ev.alDia)}` : ev.vencidas.length ? `Cuota vencida (en plazo de gracia) · ${FK.usd(ev.alDia)}` : `Próxima cuota ${fmt(ev.proxima.vence)} · ${FK.usd(ev.proxima.restante)}`}</div></div>
          <div class="text-[11px] text-greym md:text-right md:w-36">${ult ? `Último aviso ${haceCuanto(ult.fecha)}${alertadoHoy(cr) ? ' <span class="text-teal font-bold">✓</span>' : ''}` : 'Sin avisos'}</div>
          <div class="flex gap-2 shrink-0"><button data-ver="${cr.id}" class="bg-primary/10 text-primary text-xs font-bold px-3 py-2 rounded-lg hover:bg-primary/20 transition">Cobrar</button>
            <button data-wa="${cr.id}" class="btn-wa text-xs font-bold px-3 py-2 rounded-lg transition">WhatsApp</button></div></div>`;
      }).join('') : '<div class="bg-white rounded-2xl shadow-sm p-10 text-center text-sm text-greym">🎉 No hay cobros pendientes: todos los clientes están al día.</div>'}</div></div>`;
  }

  // ----------------------- Vista: CONFIGURACIÓN (solo Admin) -----------------------
  function vistaConfig() {
    const c = FK.emp().creditoConfig, w = c.whatsapp;
    const radio = (name, val, actual, txt) => `<label class="flex items-center gap-2 text-sm text-dark333 cursor-pointer"><input type="radio" name="${name}" value="${val}" ${actual === val ? 'checked' : ''} class="accent-teal"> ${txt}</label>`;
    $('cr-vista').innerHTML = `<form id="cr-config" class="grid grid-cols-1 xl:grid-cols-2 gap-5 animate-fadeIn">
      <div class="flex flex-col gap-5">
        <div class="bg-white rounded-2xl shadow-sm p-5">
          <div class="text-sm font-bold text-dark333 mb-3">💰 Interés e inicial</div>
          <div class="flex gap-5 mb-3">${radio('cfg-interes-tipo', 'porcentaje', c.interesTipo, 'Porcentaje (%)')}${radio('cfg-interes-tipo', 'fijo', c.interesTipo, 'Valor fijo ($)')}</div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="text-xs font-semibold text-greym">Interés <span id="cfg-interes-unidad">${c.interesTipo === 'porcentaje' ? '(% sobre lo financiado)' : '($ por crédito)'}</span></label><input id="cfg-interes" type="number" step="0.01" min="0" class="input-field" value="${c.interesValor}"></div>
            <div><label class="text-xs font-semibold text-greym">Inicial (% del precio)</label><input id="cfg-inicial" type="number" step="0.5" min="0" max="100" class="input-field" value="${c.inicialPct}"></div>
          </div>
        </div>
        <div class="bg-white rounded-2xl shadow-sm p-5">
          <div class="text-sm font-bold text-dark333 mb-3">📅 Frecuencia y plazos</div>
          <div class="text-xs font-semibold text-greym mb-1.5">Frecuencias permitidas al cajero</div>
          <div class="flex gap-5 mb-3">${Object.entries(FRECUENCIAS).map(([k, t]) => `<label class="flex items-center gap-2 text-sm text-dark333 cursor-pointer"><input type="checkbox" class="cfg-frec accent-teal rounded" value="${k}" ${c.frecuencias.includes(k) ? 'checked' : ''}> ${t}</label>`).join('')}</div>
          <div class="grid grid-cols-3 gap-3 mb-3">
            <div><label class="text-xs font-semibold text-greym">Predeterminada</label><select id="cfg-frec-def" class="input-field">${Object.entries(FRECUENCIAS).map(([k, t]) => `<option value="${k}" ${c.frecuenciaDefecto === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
            <div><label class="text-xs font-semibold text-greym">Cuotas mínimas</label><input id="cfg-cmin" type="number" min="1" class="input-field" value="${c.cuotasMin}"></div>
            <div><label class="text-xs font-semibold text-greym">Cuotas máximas</label><input id="cfg-cmax" type="number" min="1" max="120" class="input-field" value="${c.cuotasMax}"></div>
          </div>
          <div class="text-xs font-semibold text-greym mb-1.5">Conteo de días para vencimientos y moras</div>
          <div class="flex flex-col gap-1.5">${radio('cfg-conteo', 'calendario', c.conteoDias, 'Días totales (calendario, incluye fines de semana)')}${radio('cfg-conteo', 'habiles', c.conteoDias, 'Días hábiles (salta fines de semana)')}</div>
          <label class="flex items-center gap-2 text-xs text-greym mt-2 ml-6 cursor-pointer"><input type="checkbox" id="cfg-sabado" class="accent-teal rounded" ${c.sabadoHabil ? 'checked' : ''}> Contar el sábado como día hábil</label>
          <p class="text-[11px] text-greym mt-2">Cada cuota vence: diaria = 1 día · semanal = 7 días (5 hábiles) · quincenal = 15 días (10 hábiles).</p>
        </div>
        <div class="bg-white rounded-2xl shadow-sm p-5">
          <div class="text-sm font-bold text-dark333 mb-3">⚠️ Moras por falta de pago</div>
          <div class="flex gap-5 mb-3">${radio('cfg-mora-tipo', 'porcentaje', c.moraTipo, '% de la cuota')}${radio('cfg-mora-tipo', 'fijo', c.moraTipo, 'Monto fijo ($)')}</div>
          <div class="grid grid-cols-2 gap-3 mb-3">
            <div><label class="text-xs font-semibold text-greym">Valor de la mora (0 = sin mora)</label><input id="cfg-mora" type="number" step="0.01" min="0" class="input-field" value="${c.moraValor}"></div>
            <div><label class="text-xs font-semibold text-greym">Días de gracia</label><input id="cfg-gracia" type="number" min="0" class="input-field" value="${c.diasGracia}"></div>
          </div>
          <div class="flex flex-col gap-1.5">${radio('cfg-mora-modo', 'unica', c.moraModo, 'Se cobra una sola vez por cada cuota vencida')}${radio('cfg-mora-modo', 'diaria', c.moraModo, 'Se cobra por cada día de atraso')}</div>
          <label class="flex items-center gap-2 text-sm text-dark333 mt-3 cursor-pointer"><input type="checkbox" id="cfg-bloquear" class="accent-teal rounded" ${c.bloquearMorosos ? 'checked' : ''}> No otorgar nuevos créditos a clientes en mora</label>
        </div>
      </div>
      <div class="flex flex-col gap-5">
        <div class="bg-white rounded-2xl shadow-sm p-5">
          <div class="text-sm font-bold text-dark333 mb-3">📲 Alertas de cobro por WhatsApp</div>
          <div class="grid grid-cols-3 gap-3 mb-3">
            <div><label class="text-xs font-semibold text-greym">Código de país</label><input id="cfg-pais" type="text" class="input-field" value="${esc(w.codigoPais)}" placeholder="58"></div>
            <div><label class="text-xs font-semibold text-greym">Avisar con (días)</label><input id="cfg-aviso" type="number" min="0" max="15" class="input-field" value="${w.diasAviso}"></div>
            <div><label class="text-xs font-semibold text-greym">Abrir con</label><select id="cfg-apertura" class="input-field"><option value="web" ${w.apertura === 'web' ? 'selected' : ''}>wa.me (web o app)</option><option value="app" ${w.apertura === 'app' ? 'selected' : ''}>WhatsApp Desktop</option></select></div>
          </div>
          <label class="text-xs font-semibold text-greym">Plantilla del mensaje</label>
          <textarea id="cfg-plantilla" rows="9" class="input-field font-mono !text-xs">${esc(w.plantilla)}</textarea>
          <div class="flex flex-wrap gap-1.5 mt-2">${Object.entries(VARIABLES).map(([k, d]) => `<button type="button" data-var="${k}" class="var-chip" title="${esc(d)}">{${k}}</button>`).join('')}</div>
          <div class="flex items-center justify-between mt-3"><div class="text-xs font-semibold text-greym">Vista previa</div><button type="button" id="cfg-plantilla-def" class="text-xs text-primary font-semibold hover:underline">Restaurar plantilla original</button></div>
          <div class="wa-fondo mt-1.5"><div id="cfg-preview" class="wa-burbuja"></div></div>
          <p class="text-[11px] text-greym mt-2">*texto* = negrita en WhatsApp. El cajero no puede modificar la plantilla, solo enviarla.</p>
        </div>
        <button type="submit" class="bg-teal hover:bg-teal/90 text-white font-bold py-3 rounded-xl transition active:scale-[0.98]">Guardar criterios del crédito</button>
        <p class="text-[11px] text-greym text-center -mt-3">Los cambios aplican a los créditos nuevos. Los ya otorgados conservan las condiciones con que se firmaron.</p>
      </div></form>`;
    previewPlantilla();
  }

  function datosEjemplo() {
    const cr = FK.emp().creditos.find(x => x.estado !== 'anulado' && evaluar(x).estado !== 'pagado');
    if (cr) return variablesDe(cr);
    return { cliente: 'María Pérez', empresa: FK.emp().nombre, credito: 'CR-000001', articulo: 'Nevera 2 puertas', cuota: '3 de 8', monto_cuota: '$45.00',
      monto_cuota_bs: FK.tasa() ? FK.bs(45 * FK.tasa()) : 'Bs 1.800,00', vence: fmt(hoyStr()), dias_atraso: '0', mora: '$0.00', total_al_dia: '$45.00',
      saldo: '$270.00', cuotas_pendientes: '6', situacion: '📅 Su cuota vence *hoy*.' };
  }
  function previewPlantilla() {
    const p = $('cfg-preview'); if (!p) return;
    p.textContent = llenarPlantilla($('cfg-plantilla').value, datosEjemplo());
  }

  function guardarConfig(ev) {
    ev.preventDefault();
    const e = FK.emp();
    const val = (id) => FK.num($(id).value);
    const radioVal = (n) => (document.querySelector(`input[name="${n}"]:checked`) || {}).value;
    const frecs = [...document.querySelectorAll('.cfg-frec:checked')].map(x => x.value);
    const cmin = Math.max(1, Math.floor(val('cfg-cmin'))), cmax = Math.floor(val('cfg-cmax'));
    if (!frecs.length) return FK.toast('Elige al menos una frecuencia de pago', 'error');
    if (!(cmax >= cmin)) return FK.toast('Las cuotas máximas deben ser mayores o iguales a las mínimas', 'error');
    if (cmax > 120) return FK.toast('Máximo 120 cuotas', 'error');
    const inicial = val('cfg-inicial');
    if (inicial < 0 || inicial >= 100) return FK.toast('La inicial debe estar entre 0% y 99%', 'error');
    const plantilla = $('cfg-plantilla').value.trim();
    if (!plantilla) return FK.toast('La plantilla de WhatsApp no puede quedar vacía', 'error');
    e.creditoConfig = configCompleta({
      interesTipo: radioVal('cfg-interes-tipo'), interesValor: Math.max(0, val('cfg-interes')), inicialPct: inicial,
      frecuencias: frecs, frecuenciaDefecto: frecs.includes($('cfg-frec-def').value) ? $('cfg-frec-def').value : frecs[0],
      conteoDias: radioVal('cfg-conteo'), sabadoHabil: $('cfg-sabado').checked, cuotasMin: cmin, cuotasMax: cmax,
      moraTipo: radioVal('cfg-mora-tipo'), moraValor: Math.max(0, val('cfg-mora')), moraModo: radioVal('cfg-mora-modo'),
      diasGracia: Math.max(0, Math.floor(val('cfg-gracia'))), bloquearMorosos: $('cfg-bloquear').checked,
      whatsapp: { codigoPais: $('cfg-pais').value.replace(/\D/g, '') || '58', diasAviso: Math.max(0, Math.floor(val('cfg-aviso'))), apertura: $('cfg-apertura').value, plantilla }
    });
    FK.store.saveNow();
    FK.toast('Criterios del crédito guardados');
    refrescar();
  }

  // ----------------------- Detalle de crédito (modal) -----------------------
  function abrirDetalle(cr) {
    creditoActual = cr;
    pintarDetalle();
    FK.openModal('modal-credito');
  }

  function pintarDetalle() {
    const cr = creditoActual; if (!cr) return;
    const ev = evaluar(cr), k = cr.criterios, tasa = FK.tasa();
    const activo = !['pagado', 'anulado'].includes(ev.estado);
    const tile = (v, t, cls) => `<div class="bg-gray-50 rounded-xl p-3 text-center"><div class="text-base font-extrabold ${cls}">${v}</div><div class="text-[10px] text-greym uppercase font-semibold">${t}</div></div>`;
    const siguiente = ev.pendientes[0];
    $('mc-cuerpo').innerHTML = `
      <div class="flex items-start justify-between gap-3 mb-4">
        <div><div class="flex items-center gap-2 flex-wrap"><h3 class="text-lg font-bold text-dark333">Crédito ${numCr(cr)}</h3>${chip(ev.estado)}</div>
          <div class="text-xs text-greym mt-1">${esc(cr.clienteNombre)} · ${esc(cr.clienteCedula || 'sin cédula')} · 📱 ${esc(cr.clienteTelefono || '-')}</div>
          <div class="text-xs text-dark333 mt-0.5 font-semibold">${esc(cr.articulo)}</div></div>
        <button class="modal-close text-greym hover:text-accent text-xl leading-none">&times;</button>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        ${tile(FK.usd(cr.total), 'Total crédito', 'text-dark333')}${tile(FK.usd(ev.pagadoCapital), 'Pagado (cuotas)', 'text-teal')}
        ${tile(FK.usd(ev.saldo), 'Saldo pendiente', ev.saldo > EPS ? 'text-dark333' : 'text-teal')}${tile(FK.usd(ev.moraPendiente), 'Mora pendiente', ev.moraPendiente > 0 ? 'text-accent' : 'text-dark333')}
      </div>
      <div class="text-[11px] text-greym bg-gray-50 rounded-xl px-3 py-2 mb-4 leading-relaxed">
        Contado ${FK.usd(cr.precioContado)} · Inicial ${FK.usd(cr.inicial)} · Financiado ${FK.usd(cr.financiado)} · Interés ${k.interesTipo === 'porcentaje' ? k.interesValor + '%' : 'fijo'} (${FK.usd(cr.interes)}) ·
        ${cr.numeroCuotas} cuota(s) ${FREC_PLURAL[cr.frecuencia] || ''} en ${k.conteoDias === 'habiles' ? 'días hábiles' : 'días calendario'} ·
        Mora: ${k.moraValor > 0 ? `${k.moraTipo === 'porcentaje' ? k.moraValor + '%' : FK.usd(k.moraValor)} ${k.moraModo === 'diaria' ? 'por día' : 'por cuota'}, gracia ${k.diasGracia} día(s)` : 'no aplica'}
        ${cr.migrado ? '<br><b>Crédito migrado desde "Préstamos" (v1).</b>' : ''}</div>
      <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div class="lg:col-span-3">
          <div class="text-xs font-semibold text-greym uppercase mb-2">Cronograma</div>
          <div class="border border-gray-100 rounded-xl overflow-hidden max-h-72 overflow-y-auto"><table class="w-full text-xs">
            <thead class="bg-gray-50 text-greym uppercase text-[10px] sticky top-0"><tr><th class="text-left px-3 py-2">#</th><th class="text-left px-3 py-2">Vence</th><th class="text-right px-3 py-2">Cuota</th><th class="text-right px-3 py-2">Pagado</th><th class="text-center px-3 py-2">Estado</th></tr></thead>
            <tbody>${ev.detalle.map(c => {
              const est = c.restante <= EPS ? '<span class="text-teal font-bold">Pagada</span>' : c.diasMora > 0 ? `<span class="text-accent font-bold">Mora ${c.diasMora}d · ${FK.usd(c.mora)}</span>` : c.vencida ? '<span class="text-amber-700 font-bold">Vencida (gracia)</span>' : '<span class="text-greym">Pendiente</span>';
              return `<tr class="border-t border-gray-100"><td class="px-3 py-2 font-semibold">${c.n}</td><td class="px-3 py-2">${fmt(c.vence)}</td><td class="px-3 py-2 text-right">${FK.usd(c.monto)}</td><td class="px-3 py-2 text-right">${FK.usd(c.pagado)}</td><td class="px-3 py-2 text-center">${est}</td></tr>`;
            }).join('')}</tbody></table></div>
        </div>
        <div class="lg:col-span-2 flex flex-col gap-3">
          ${activo && puedeOperar() ? `<div class="bg-primary/5 rounded-xl p-3">
            <div class="text-xs font-semibold text-greym uppercase mb-2">Registrar abono</div>
            <div class="flex flex-wrap gap-1.5 mb-2">
              ${siguiente ? `<button type="button" data-rapido="${siguiente.restante}" class="text-[11px] font-bold bg-white border border-gray-200 rounded-lg px-2 py-1 hover:border-primary">Cuota ${siguiente.n}: ${FK.usd(siguiente.restante)}</button>` : ''}
              ${ev.alDia > 0 ? `<button type="button" data-rapido="${ev.alDia}" class="text-[11px] font-bold bg-white border border-gray-200 rounded-lg px-2 py-1 hover:border-primary">Al día: ${FK.usd(ev.alDia)}</button>` : ''}
              <button type="button" data-rapido="${ev.saldo}" class="text-[11px] font-bold bg-white border border-gray-200 rounded-lg px-2 py-1 hover:border-primary">Saldar: ${FK.usd(ev.saldo)}</button>
            </div>
            <form id="mc-abono" class="flex flex-col gap-2">
              <input id="mc-monto" type="number" step="0.01" min="0.01" required class="input-field !mt-0" placeholder="Monto $">
              <select id="mc-metodo" required class="input-field !mt-0"><option value="">Método de pago...</option>${Object.entries(window.FACTURAK_METODOS).map(([a, b]) => `<option value="${a}">${esc(b)}</option>`).join('')}</select>
              ${tasa ? '<div id="mc-bs" class="text-[11px] text-primary font-semibold"></div>' : ''}
              <label class="flex items-center gap-2 text-[11px] text-greym"><input type="checkbox" id="mc-imprimir" checked class="rounded accent-primary"> Imprimir recibo 58mm</label>
              <button type="submit" class="bg-teal hover:bg-teal/90 text-white font-bold py-2.5 rounded-xl transition active:scale-95">Registrar abono</button>
              <p class="text-[10px] text-greym">El pago cubre primero la mora y luego las cuotas más antiguas.</p>
            </form></div>` : ''}
          <div class="text-xs font-semibold text-greym uppercase">Pagos</div>
          <div class="flex flex-col gap-1.5 max-h-44 overflow-y-auto pr-1">${cr.pagos.length ? [...cr.pagos].reverse().map(p => `<div class="flex items-center justify-between bg-gray-50 rounded-lg px-2.5 py-1.5">
              <div><div class="text-xs font-semibold text-dark333">${p.tipo === 'inicial' ? 'Inicial' : 'Abono'} · ${FK.usd(p.monto)}</div><div class="text-[10px] text-greym">${FK.fechaHora(p.fecha)}${p.metodo ? ' · ' + esc(FK.metodoNombre(p.metodo)) : ''}${p.aMora > 0 ? ' · mora ' + FK.usd(p.aMora) : ''}</div></div>
              <button data-recibo="${p.id}" class="text-greym hover:text-primary text-sm" title="Reimprimir recibo">🖨️</button></div>`).join('') : '<div class="text-xs text-greym">Sin pagos todavía.</div>'}</div>
        </div>
      </div>
      <div class="flex flex-wrap gap-2 mt-5 pt-4 border-t border-gray-100">
        ${activo && puedeOperar() ? `<button id="mc-wa" class="btn-wa font-bold px-4 py-2.5 rounded-xl transition active:scale-95">📲 Alerta de cobro por WhatsApp</button>` : ''}
        <button id="mc-contrato" class="bg-primary/10 text-primary font-bold px-4 py-2.5 rounded-xl hover:bg-primary/20 transition">🖨️ Contrato 58mm</button>
        ${FK.esAdmin() && cr.estado === 'activo' ? '<button id="mc-anular" class="ml-auto text-accent text-xs font-bold hover:underline">Anular crédito</button>' : ''}
      </div>
      ${(cr.alertas || []).length ? `<div class="text-[11px] text-greym mt-3">Alertas enviadas: ${cr.alertas.length} · última ${haceCuanto(cr.alertas[cr.alertas.length - 1].fecha)} por ${esc(cr.alertas[cr.alertas.length - 1].usuario)}</div>` : ''}`;
  }

  async function registrarAbono(ev) {
    ev.preventDefault();
    const cr = creditoActual, e = FK.emp();
    const monto = r2(FK.num($('mc-monto').value)), metodo = $('mc-metodo').value;
    const saldo = evaluar(cr).saldo;
    if (!(monto > 0)) return FK.toast('Monto no válido', 'error');
    if (monto > saldo + 0.001) return FK.toast(`El abono supera el saldo pendiente (${FK.usd(saldo)})`, 'error');
    if (!metodo) return FK.toast('Selecciona el método de pago', 'error');
    const pago = aplicarPago(cr, monto, metodo);
    FK.store.saveNow();
    if ($('mc-imprimir') && $('mc-imprimir').checked) FK.imprimir(FK.doc.reciboAbono(cr, pago, e), { destino: 'caja', ancho: 58 });
    FK.toast(cr.estado === 'pagado' ? '¡Crédito pagado por completo!' : `Abono de ${FK.usd(monto)} registrado`);
    pintarDetalle(); refrescar();
  }

  async function anular() {
    const cr = creditoActual;
    if (!(await FK.confirmar(`¿Anular el crédito ${numCr(cr)}? Los productos vuelven al inventario. Los pagos registrados quedan en el historial.`, { titulo: 'Anular crédito', ok: 'Anular', peligro: true }))) return;
    const e = FK.emp();
    FK.descontarStock(cr.items, +1);
    cr.estado = 'anulado'; cr.anuladoPor = FK.sesion.usuario.usuario; cr.anuladoEn = new Date().toISOString();
    FK.store.saveNow(); FK.toast('Crédito anulado'); pintarDetalle(); refrescar();
  }

  // ----------------------- Envío por WhatsApp -----------------------
  let envioActual = null;
  function prepararWhatsApp(cr) {
    const e = FK.emp(), cfg = e.creditoConfig.whatsapp;
    const cliente = e.clientes.find(c => c.id === cr.clienteId);
    const telefono = (cliente && cliente.telefono) || cr.clienteTelefono;
    const numero = normalizarTelefono(telefono, cfg.codigoPais);
    const texto = llenarPlantilla(cfg.plantilla, variablesDe(cr));
    envioActual = { cr, numero, texto };
    $('mw-destino').innerHTML = numero ? `Para <b class="text-dark333">${esc(cr.clienteNombre)}</b> · +${numero}` : `<span class="text-accent font-semibold">${esc(cr.clienteNombre)} no tiene un teléfono válido registrado.</span>`;
    $('mw-texto').textContent = texto;
    $('mw-enviar').disabled = !numero;
    const cola = colaCobranza && colaCobranza.length;
    $('mw-progreso').textContent = colaCobranza ? `Envío en secuencia: ${colaCobranza.total - colaCobranza.length + 1} de ${colaCobranza.total}` : '';
    $('mw-siguiente').classList.toggle('hidden', !colaCobranza);
    $('mw-siguiente').textContent = cola > 1 ? 'Saltar →' : 'Terminar';
    FK.openModal('modal-wa-cobranza');
  }

  function enviarWhatsApp() {
    if (!envioActual || !envioActual.numero) return;
    const { cr, numero, texto } = envioActual;
    window.open(urlWhatsApp(numero, texto), '_blank');
    (cr.alertas = cr.alertas || []).push({ fecha: new Date().toISOString(), usuario: FK.sesion.usuario.usuario, telefono: numero, estado: evaluar(cr).estado });
    FK.store.saveNow();
    FK.toast(`Abriendo WhatsApp para ${cr.clienteNombre}…`);
    if (colaCobranza) siguienteEnCola(); else { FK.closeModal('modal-wa-cobranza'); if (creditoActual === cr) pintarDetalle(); refrescar(); }
  }

  function iniciarCola() {
    const lista = pendientesCobranza().filter(x => !alertadoHoy(x.cr)).map(x => x.cr);
    if (!lista.length) return;
    colaCobranza = lista; colaCobranza.total = lista.length;
    prepararWhatsApp(colaCobranza[0]);
  }
  function siguienteEnCola() {
    if (!colaCobranza) return;
    colaCobranza.shift();
    if (colaCobranza.length) prepararWhatsApp(colaCobranza[0]);
    else { colaCobranza = null; FK.closeModal('modal-wa-cobranza'); FK.toast('Cobranza del día completada'); refrescar(); }
  }

  // ----------------------- Modales (se crean una sola vez) -----------------------
  function crearModales() {
    const d = document.createElement('div');
    d.innerHTML = `
      <div id="modal-credito" class="modal-overlay hidden"><div class="modal-card animate-slideUp !max-w-4xl" id="mc-cuerpo"></div></div>
      <div id="modal-wa-cobranza" class="modal-overlay hidden"><div class="modal-card animate-slideUp !max-w-md">
        <div class="flex items-center justify-between mb-1"><h3 class="text-lg font-bold text-dark333 flex items-center gap-2"><span class="w-8 h-8 rounded-lg btn-wa flex items-center justify-center text-base">✆</span>Alerta de cobro</h3>
          <button class="modal-close text-greym hover:text-accent text-xl leading-none">&times;</button></div>
        <p id="mw-progreso" class="text-[11px] font-semibold text-teal mb-1"></p>
        <p id="mw-destino" class="text-xs text-greym mb-3"></p>
        <div class="wa-fondo"><div id="mw-texto" class="wa-burbuja"></div></div>
        <p class="text-[11px] text-greym mt-2">🔒 Mensaje generado con la plantilla del administrador. Se abrirá WhatsApp con el texto listo: solo pulsa <b>Enviar</b>.</p>
        <div class="flex gap-2 mt-4"><button id="mw-siguiente" class="hidden flex-1 bg-gray-100 hover:bg-gray-200 text-dark333 font-semibold py-2.5 rounded-xl transition">Saltar →</button>
          <button id="mw-enviar" class="flex-1 btn-wa font-bold py-2.5 rounded-xl transition active:scale-95 disabled:opacity-40">Abrir WhatsApp</button></div>
      </div></div>`;
    while (d.firstElementChild) document.body.insertBefore(d.firstElementChild, $('modal-confirm'));
  }

  // ----------------------- Eventos -----------------------
  function init() {
    crearModales();
    const tab = $('tab-creditos');
    tab.addEventListener('click', (ev) => {
      const t = ev.target;
      const sub = t.closest('[data-vista]'); if (sub) { vista = sub.dataset.vista; FK.render.creditos(); return; }
      const f = t.closest('[data-filtro]'); if (f) { filtroCartera = f.dataset.filtro; vistaCartera(); return; }
      const wa = t.closest('[data-wa]'); if (wa) { ev.stopPropagation(); prepararWhatsApp(FK.emp().creditos.find(c => c.id === wa.dataset.wa)); return; }
      const ver = t.closest('[data-ver]'); if (ver) { abrirDetalle(FK.emp().creditos.find(c => c.id === ver.dataset.ver)); return; }
      if (t.id === 'cr-cola') return iniciarCola();
      // Nuevo crédito
      const cid = t.closest('[data-cid]');
      if (cid) { nuevo.cliente = FK.emp().clientes.find(c => c.id === cid.dataset.cid); pintarCliente(); pintarPlan(); return; }
      if (t.id === 'cr-cli-nuevo' || t.id === 'cr-cli-nuevo2') {
        const q = ($('cr-cli-q') || {}).value || '';
        FK.abrirCliente(null, /^[VEJGP]?-?\d/i.test(q.trim()) ? { cedula: q.trim() } : { nombre: q.trim() }, (c) => { nuevo.cliente = c; if (FK.tabActual() === 'creditos' && vista === 'nuevo') { pintarCliente(); pintarPlan(); } });
        return;
      }
      if (t.closest('#cr-cli-cambiar')) { nuevo.cliente = null; pintarCliente(); pintarPlan(); setTimeout(() => $('cr-cli-q') && $('cr-cli-q').focus(), 30); return; }
      if (t.id === 'cr-cli-editar') { FK.abrirCliente(nuevo.cliente, {}, (c) => { nuevo.cliente = c; pintarCliente(); pintarPlan(); }); return; }
      if (t.id === 'cr-cli-ver') { vista = 'cartera'; filtroCartera = 'activos'; FK.render.creditos(); $('cr-cartera-q').value = nuevo.cliente.nombre; pintarCartera(); return; }
      const pid = t.closest('[data-pid]');
      if (pid) {
        const p = FK.emp().productos.find(x => x.id === pid.dataset.pid); if (!p) return;
        const it = nuevo.items.find(i => i.productoId === p.id);
        const ya = it ? it.cantidad : 0;
        if (FK.itemControlaStock(p) && ya + 1 > FK.stockDe(p)) return FK.toast(`Sin stock suficiente de "${p.nombre}"`, 'error');
        if (it) it.cantidad++; else nuevo.items.push({ productoId: p.id, nombre: p.nombre, precio: Number(p.precio) || 0, cantidad: 1 });
        $('cr-prod-q').value = ''; $('cr-prod-res').innerHTML = '';
        pintarItems(); pintarPlan(); return;
      }
      const itb = t.closest('[data-it]');
      if (itb) {
        const i = nuevo.items[+itb.dataset.idx]; if (!i) return;
        if (itb.dataset.it === 'mas') {
          const p = FK.emp().productos.find(x => x.id === i.productoId);
          if (p && FK.itemControlaStock(p) && i.cantidad + 1 > FK.stockDe(p)) return FK.toast('Sin stock suficiente', 'error');
          i.cantidad++;
        } else if (itb.dataset.it === 'menos') { i.cantidad--; if (i.cantidad <= 0) nuevo.items.splice(+itb.dataset.idx, 1); }
        else nuevo.items.splice(+itb.dataset.idx, 1);
        pintarItems(); pintarPlan(); return;
      }
      if (t.id === 'cr-registrar') return registrarCredito();
      // Configuración
      const v = t.closest('[data-var]');
      if (v) {
        const ta = $('cfg-plantilla'), ins = `{${v.dataset.var}}`;
        const a = ta.selectionStart ?? ta.value.length, b = ta.selectionEnd ?? a;
        ta.value = ta.value.slice(0, a) + ins + ta.value.slice(b);
        ta.focus(); ta.selectionStart = ta.selectionEnd = a + ins.length; previewPlantilla(); return;
      }
      if (t.id === 'cfg-plantilla-def') { $('cfg-plantilla').value = PLANTILLA_DEF; previewPlantilla(); }
    });
    tab.addEventListener('input', (ev) => {
      const id = ev.target.id;
      if (id === 'cr-cli-q') pintarResultadosCliente();
      else if (id === 'cr-prod-q') pintarResultadosProducto();
      else if (id === 'cr-cartera-q') pintarCartera();
      else if (id === 'cfg-plantilla') previewPlantilla();
    });
    tab.addEventListener('change', (ev) => {
      const id = ev.target.id;
      if (id === 'cr-frec') { nuevo.frecuencia = ev.target.value; pintarPlan(); }
      else if (id === 'cr-ncuotas') { nuevo.cuotas = +ev.target.value; pintarPlan(); }
      else if (ev.target.name === 'cfg-interes-tipo') $('cfg-interes-unidad').textContent = ev.target.value === 'porcentaje' ? '(% sobre lo financiado)' : '($ por crédito)';
    });
    tab.addEventListener('submit', (ev) => { if (ev.target.id === 'cr-config') guardarConfig(ev); });

    const mc = $('modal-credito');
    mc.addEventListener('submit', (ev) => { if (ev.target.id === 'mc-abono') registrarAbono(ev); });
    mc.addEventListener('input', (ev) => {
      if (ev.target.id === 'mc-monto' && $('mc-bs')) $('mc-bs').textContent = ev.target.value ? '≈ ' + FK.bs(FK.num(ev.target.value) * FK.tasa()) : '';
    });
    mc.addEventListener('click', (ev) => {
      const r = ev.target.closest('[data-rapido]');
      if (r) { $('mc-monto').value = (+r.dataset.rapido).toFixed(2); $('mc-monto').dispatchEvent(new Event('input', { bubbles: true })); $('mc-metodo').focus(); return; }
      const rec = ev.target.closest('[data-recibo]');
      if (rec) { const p = creditoActual.pagos.find(x => x.id === rec.dataset.recibo); if (p) FK.imprimir(FK.doc.reciboAbono(creditoActual, p, FK.emp()), { destino: 'caja', ancho: 58 }); return; }
      if (ev.target.id === 'mc-wa') prepararWhatsApp(creditoActual);
      if (ev.target.id === 'mc-contrato') FK.imprimir(FK.doc.creditoComprobante(creditoActual, FK.emp()), { destino: 'caja', ancho: 58 });
      if (ev.target.id === 'mc-anular') anular();
    });
    $('mw-enviar').onclick = enviarWhatsApp;
    $('mw-siguiente').onclick = siguienteEnCola;
    // Cerrar el modal de WhatsApp a mitad de una secuencia cancela la cola
    $('modal-wa-cobranza').addEventListener('click', (ev) => { if (ev.target.closest('.modal-close') || ev.target.id === 'modal-wa-cobranza') colaCobranza = null; });

    // El estado de mora cambia con el tiempo: se revisa cada 5 minutos
    setInterval(() => { if (FK.emp() && FK.tiene('creditos')) FK.actualizarBadgeCreditos(); }, 5 * 60000);
  }

  const initBase = FK.app.init;
  FK.app.init = () => { initBase(); init(); };
})();
