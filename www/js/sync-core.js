// FacturaK — núcleo de sincronización (puro, sin red ni disco). Se usa igual en el
// proceso principal (servidor en la PC central) y en la pantalla (todos los clientes).
//
// Modelo: cada dispositivo guarda una copia ACTUAL de los datos y una BASE (el último
// estado sincronizado). Lo pendiente es diff(base, actual) = un "parche". El servidor
// aplica parches en orden (applyPatch) y los reenvía a los demás dispositivos.
//
// Reglas de fusión (por qué dos dispositivos pueden vender a la vez sin pisarse):
//  - Colecciones de objetos con `id` (productos, ventas, clientes, usuarios, cajas...):
//    altas y bajas por id; las modificaciones viajan CAMPO por campo (dos dispositivos
//    que editan campos distintos del mismo ítem no se pisan; si editan el mismo, gana el último).
//  - Stock de productos y de variantes: viaja como DIFERENCIA (+3 / -2), no como valor.
//    Así dos ventas simultáneas del mismo producto se descuentan las dos.
//  - Contadores (secuenciaFactura, secuenciaCredito...): se queda el MAYOR.
//  - Una venta nueva cuyo N° de factura ya existe se renumera (el servidor lo informa).
//  - Si un dispositivo borra algo que otro editó, la edición se descarta sin error.
(function (root) {
  'use strict';

  const esObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  const clon = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const esContador = (k) => /^secuencia/i.test(k);
  const numero = (x) => (typeof x === 'number' && isFinite(x) ? x : 0);

  function esColeccion(a, b) {
    const ok = (arr) => Array.isArray(arr) && arr.every((e) => esObj(e) && e.id != null);
    const hayArr = Array.isArray(a) || Array.isArray(b);
    if (!hayArr) return false;
    if (a !== undefined && !Array.isArray(a)) return false;
    if (b !== undefined && !Array.isArray(b)) return false;
    return ok(a || []) && ok(b || []) && ((a || []).length + (b || []).length > 0);
  }

  const cacheStr = new WeakMap();
  function str(o) {
    if (o && typeof o === 'object') {
      let s = cacheStr.get(o);
      if (s === undefined) { s = JSON.stringify(o); cacheStr.set(o, s); }
      return s;
    }
    return JSON.stringify(o);
  }
  const strFresco = (o) => JSON.stringify(o); // para objetos que cambian en el sitio (la copia ACTUAL)
  // ¿el valor de la BASE (cacheado) es igual al de la copia ACTUAL (que cambia en el sitio)?
  const igual = (bv, cv) => (bv && typeof bv === 'object' ? str(bv) : JSON.stringify(bv)) === strFresco(cv);
  const invalidar = (o) => { if (o && typeof o === 'object') cacheStr.delete(o); };

  // ---------------------------------------------------------------- diff
  function difEntidad(b, c, esProducto) {
    const ch = {}, rm = [];
    const claves = new Set([...Object.keys(b), ...Object.keys(c)]);
    let dStock = null, vd = null;
    for (const k of claves) {
      if (esProducto && (k === 'stock' || k === 'variantes')) continue;
      if (!(k in c)) { rm.push(k); continue; }
      if (!(k in b) || !igual(b[k], c[k])) ch[k] = c[k];
    }
    if (esProducto) {
      const sb = numero(b.stock), sc = numero(c.stock);
      const tieneVar = (Array.isArray(c.variantes) && c.variantes.length) || (Array.isArray(b.variantes) && b.variantes.length);
      if (!tieneVar && ('stock' in c || 'stock' in b) && sb !== sc) dStock = sc - sb;
      if (!tieneVar && !('stock' in c) && 'stock' in b) rm.push('stock');
      if (tieneVar || b.variantes !== undefined || c.variantes !== undefined) {
        const vb = Array.isArray(b.variantes) ? b.variantes : [];
        const vc = Array.isArray(c.variantes) ? c.variantes : [];
        const sinStock = (v) => { const o = { ...v }; delete o.stock; return JSON.stringify(o); };
        const mb = new Map(vb.map((v) => [v.id, v]));
        let estructura = vb.length !== vc.length;
        vd = {};
        for (const v of vc) {
          const o = mb.get(v.id);
          if (!o || sinStock(o) !== sinStock(v)) estructura = true;
          if (o) { const d = numero(v.stock) - numero(o.stock); if (d) vd[v.id] = d; }
        }
        if (estructura) ch.variantes = clon(vc);
        else if (!Object.keys(vd).length) vd = null;
        if (estructura) {
          // variantes nuevas llevan su stock absoluto en ch.variantes; las existentes, la diferencia en vd
          for (const v of vc) if (!mb.has(v.id)) delete vd[v.id];
          if (!Object.keys(vd).length) vd = null;
        }
        if (!estructura && vc.length === 0 && 'variantes' in b && !('variantes' in c)) rm.push('variantes');
      }
    }
    const out = {};
    if (Object.keys(ch).length) out.ch = ch;
    if (rm.length) out.rm = rm;
    if (dStock) out.ds = dStock;
    if (vd) out.vd = vd;
    return Object.keys(out).length ? out : null;
  }

  function difColeccion(nombre, baseArr, curArr) {
    const mb = new Map((baseArr || []).map((e) => [e.id, e]));
    const mc = new Map((curArr || []).map((e) => [e.id, e]));
    const up = [], del = [], mod = {};
    for (const [id, c] of mc) {
      const b = mb.get(id);
      if (!b) { up.push(clon(c)); continue; }
      if (igual(b, c)) continue;
      const d = difEntidad(b, c, nombre === 'productos');
      if (d) mod[id] = d;
    }
    for (const id of mb.keys()) if (!mc.has(id)) del.push(id);
    const out = {};
    if (up.length) out.up = up;
    if (del.length) out.del = del;
    if (Object.keys(mod).length) out.mod = mod;
    return Object.keys(out).length ? out : null;
  }

  function difEmpresa(b, c) {
    const out = {};
    const set = {}, rm = [], max = {}, col = {};
    const claves = new Set([...Object.keys(b), ...Object.keys(c)]);
    for (const k of claves) {
      if (esColeccion(b[k], c[k])) { const d = difColeccion(k, b[k], c[k]); if (d) col[k] = d; continue; }
      if (!(k in c)) { rm.push(k); continue; }
      if (esContador(k) && typeof c[k] === 'number') { if (numero(c[k]) > numero(b[k])) max[k] = c[k]; continue; }
      if (!((k in b) && igual(b[k], c[k]))) set[k] = clon(c[k]);
    }
    if (Object.keys(set).length) out.set = set;
    if (rm.length) out.rm = rm;
    if (Object.keys(max).length) out.max = max;
    if (Object.keys(col).length) out.col = col;
    return Object.keys(out).length ? out : null;
  }

  // Parche = cambios de `cur` respecto a `base`. null si no hay nada.
  function diff(base, cur) {
    base = base || { empresas: [] };
    const out = {};
    const mb = new Map((base.empresas || []).map((e) => [e.id, e]));
    const mc = new Map((cur.empresas || []).map((e) => [e.id, e]));
    const add = [], del = [], mod = {};
    for (const [id, c] of mc) {
      const b = mb.get(id);
      if (!b) { add.push(clon(c)); continue; }
      const d = difEmpresa(b, c);
      if (d) mod[id] = d;
    }
    for (const id of mb.keys()) if (!mc.has(id)) del.push(id);
    if (add.length) out.add = add;
    if (del.length) out.del = del;
    if (Object.keys(mod).length) out.mod = mod;
    const top = {};
    for (const k of Object.keys(cur)) {
      if (k === 'empresas') continue;
      if (JSON.stringify(base[k]) !== JSON.stringify(cur[k])) top[k] = clon(cur[k]);
    }
    if (Object.keys(top).length) out.top = top;
    return Object.keys(out).length ? out : null;
  }

  // ---------------------------------------------------------------- apply
  function aplicarEntidad(e, d, srvAbs) {
    if (d.ch) for (const k of Object.keys(d.ch)) e[k] = clon(d.ch[k]);
    if (d.rm) for (const k of d.rm) delete e[k];
    if (srvAbs) {
      // variantes: las que ya existían suman su diferencia; las nuevas traen su valor
      if (d.ch && Array.isArray(d.ch.variantes)) {
        const viejas = srvAbs.variantes || new Map();
        for (const v of e.variantes) {
          if (viejas.has(v.id)) v.stock = numero(viejas.get(v.id)) + numero(d.vd && d.vd[v.id]);
        }
      } else if (d.vd && Array.isArray(e.variantes)) {
        for (const v of e.variantes) if (d.vd[v.id]) v.stock = Math.round((numero(v.stock) + d.vd[v.id]) * 1000) / 1000;
      }
      if (d.ds) e.stock = Math.round((numero(e.stock) + d.ds) * 1000) / 1000;
      if (Array.isArray(e.variantes) && e.variantes.length && (d.vd || (d.ch && d.ch.variantes))) {
        e.stock = Math.round(e.variantes.reduce((s, v) => s + numero(v.stock), 0) * 1000) / 1000;
      }
    }
  }

  function aplicarColeccion(nombre, arr, p, ctx) {
    const idx = new Map(arr.map((e, i) => [e.id, i]));
    for (const e of p.up || []) {
      if (idx.has(e.id)) {
        // ya existía (reintento o alta simultánea): se reemplaza el contenido, se conserva el objeto
        const o = arr[idx.get(e.id)]; invalidar(o); for (const k of Object.keys(o)) delete o[k]; Object.assign(o, clon(e));
      } else { arr.push(clon(e)); idx.set(e.id, arr.length - 1); }
    }
    for (const id of Object.keys(p.mod || {})) {
      const i = idx.get(id); if (i == null) continue;      // lo borraron en otro lado: se descarta
      const e = arr[i]; invalidar(e);
      const viejas = nombre === 'productos' && Array.isArray(e.variantes) ? new Map(e.variantes.map((v) => [v.id, v.stock])) : null;
      aplicarEntidad(e, p.mod[id], nombre === 'productos' ? { variantes: viejas } : null);
      ctx.tocados.push({ col: nombre, id });
    }
    if (p.del && p.del.length) {
      const bor = new Set(p.del);
      for (let i = arr.length - 1; i >= 0; i--) if (bor.has(arr[i].id)) arr.splice(i, 1);
    }
  }

  // Aplica `parche` sobre `datos` EN EL SITIO. Con opts.renumerar (solo el servidor) las ventas nuevas
  // con N° repetido se renumeran y el parche queda corregido (para reenviarlo a los demás).
  // Devuelve { ajustes } = cambios que el emisor debe copiar a su propia copia (renumeraciones).
  function applyPatch(datos, parche, opts) {
    opts = opts || {};
    const ajustes = [];
    if (!parche) return { ajustes };
    datos.empresas = datos.empresas || [];
    const eIdx = () => new Map(datos.empresas.map((e, i) => [e.id, i]));
    for (const e of parche.add || []) {
      const m = eIdx();
      if (m.has(e.id)) datos.empresas[m.get(e.id)] = clon(e); else datos.empresas.push(clon(e));
    }
    for (const id of Object.keys(parche.mod || {})) {
      const i = eIdx().get(id); if (i == null) continue;
      const emp = datos.empresas[i]; const p = parche.mod[id]; invalidar(emp);
      const ctx = { tocados: [] };
      for (const k of Object.keys(p.set || {})) emp[k] = clon(p.set[k]);
      for (const k of p.rm || []) delete emp[k];
      for (const k of Object.keys(p.max || {})) emp[k] = Math.max(numero(emp[k]), numero(p.max[k]));
      for (const nombre of Object.keys(p.col || {})) {
        if (!Array.isArray(emp[nombre])) emp[nombre] = [];
        if (opts.renumerar && nombre === 'ventas') renumerarVentas(emp, p, ajustes, id);
        aplicarColeccion(nombre, emp[nombre], p.col[nombre], ctx);
      }
    }
    for (const id of parche.del || []) {
      const i = eIdx().get(id); if (i != null) datos.empresas.splice(i, 1);
    }
    for (const k of Object.keys(parche.top || {})) datos[k] = clon(parche.top[k]);
    return { ajustes };
  }

  function renumerarVentas(emp, pEmp, ajustes, empId) {
    const pv = pEmp.col.ventas;
    const usados = new Set((emp.ventas || []).map((v) => v.numero));
    let max = Math.max(numero(emp.secuenciaFactura), ...[...usados].map(numero), 0);
    const ya = new Set((emp.ventas || []).map((v) => v.id));
    for (const v of pv.up || []) {
      if (ya.has(v.id)) continue;                       // reintento: no se renumera de nuevo
      if (v.numero != null && usados.has(v.numero)) {
        const nuevo = max + 1;
        ajustes.push({ emp: empId, col: 'ventas', id: v.id, numero: nuevo, antes: v.numero });
        v.numero = nuevo;
      }
      if (v.numero != null) { usados.add(v.numero); if (numero(v.numero) > max) max = numero(v.numero); }
    }
    emp.secuenciaFactura = Math.max(numero(emp.secuenciaFactura), max);
    // el parche que se reenvía a los demás debe llevar el contador final
    (pEmp.max = pEmp.max || {}).secuenciaFactura = emp.secuenciaFactura;
  }

  // Copia a `datos` los ajustes que decidió el servidor sobre cosas que ESTE dispositivo ya había creado.
  function aplicarAjustes(datos, ajustes) {
    for (const a of ajustes || []) {
      const emp = (datos.empresas || []).find((e) => e.id === a.emp); if (!emp) continue;
      const v = (emp[a.col] || []).find((x) => x.id === a.id); if (v) { v.numero = a.numero; invalidar(v); }
      emp.secuenciaFactura = Math.max(numero(emp.secuenciaFactura), a.numero);
    }
  }

  const api = { diff, applyPatch, aplicarAjustes, clon };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FKSyncCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
