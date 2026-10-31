// FacturaK — Importación masiva de inventario: lógica pura (sin DOM).
// Se carga en la app (window.FKImportar) y también se puede cargar con
// require() en Node para probarla con archivos Excel reales.
(function (root) {
  'use strict';

  const CAMPOS = ['codigo', 'nombre', 'precio', 'costo', 'stock', 'categoria', 'imagen', 'tipo'];

  // Nombres de columna que se reconocen (ya normalizados: minúsculas, sin
  // acentos ni símbolos). Se prueba primero coincidencia exacta y luego
  // "contiene" para encabezados largos como "Nombre/Descripción del producto".
  const SINONIMOS = {
    codigo: ['codigo', 'sku', 'codigosku', 'cod', 'codigodebarras', 'codbarras', 'barcode', 'referencia'],
    nombre: ['nombre', 'descripcion', 'producto', 'nombredelproducto', 'nombredescripcion', 'nombredescripciondelproducto', 'articulo', 'item'],
    precio: ['precio', 'preciodeventa', 'precioventa', 'pvp', 'preciounitario'],
    costo: ['costo', 'preciodecosto', 'preciocosto', 'costounitario', 'costodeadquisicion'],
    stock: ['stock', 'cantidad', 'existencia', 'existencias', 'cantidadinicial', 'stockcantidadinicial', 'stockinicial', 'inventario'],
    categoria: ['categoria', 'rubro', 'familia', 'grupo'],
    imagen: ['urldeimagen', 'urlimagen', 'imagen', 'foto', 'urlfoto', 'image', 'imageurl', 'enlacedeimagen'],
    tipo: ['tipo', 'tipoitem', 'tipodeitem', 'tipodeproducto', 'clase'],
  };
  // Para el segundo pase (coincidencia parcial) "tipo" solo acepta nombres largos, para no confundir "Tipo de venta".
  const PARCIALES = { tipo: ['tipoitem', 'tipodeitem', 'tipodeproducto'] };
  // Orden del segundo pase (coincidencia parcial): lo más específico primero,
  // para que "Precio de costo" no se confunda con "Precio".
  const ORDEN_PARCIAL = ['imagen', 'costo', 'codigo', 'stock', 'categoria', 'tipo', 'nombre', 'precio'];

  function normalizarEncabezado(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  }

  // Devuelve { mapa: {campo: indiceColumna|-1}, reconocidos: n }
  function detectarColumnas(encabezados) {
    const norm = encabezados.map(normalizarEncabezado);
    const mapa = {}; const usadas = new Set();
    CAMPOS.forEach((c) => (mapa[c] = -1));
    CAMPOS.forEach((campo) => {
      const i = norm.findIndex((h, idx) => !usadas.has(idx) && h && SINONIMOS[campo].includes(h));
      if (i >= 0) { mapa[campo] = i; usadas.add(i); }
    });
    ORDEN_PARCIAL.forEach((campo) => {
      if (mapa[campo] >= 0) return;
      const i = norm.findIndex((h, idx) => !usadas.has(idx) && h && (PARCIALES[campo] || SINONIMOS[campo]).some((s) => s.length >= 4 && h.includes(s)));
      if (i >= 0) { mapa[campo] = i; usadas.add(i); }
    });
    return { mapa, reconocidos: CAMPOS.filter((c) => mapa[c] >= 0).length };
  }

  // Busca entre las primeras filas la que parece ser el encabezado.
  function detectarFilaEncabezado(filas) {
    let mejor = { indice: 0, reconocidos: -1 };
    for (let i = 0; i < Math.min(filas.length, 10); i++) {
      const r = detectarColumnas(filas[i].map((c) => String(c == null ? '' : c)));
      if (r.reconocidos > mejor.reconocidos) mejor = { indice: i, reconocidos: r.reconocidos };
    }
    return mejor.indice;
  }

  // Acepta 1234.56, "1.234,56", "1,234.56", "$ 12,5", "12". Una sola coma se
  // toma como decimal (convención venezolana); varias comas = miles.
  function parsearNumero(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    let s = String(v == null ? '' : v).trim().replace(/[^\d.,\-]/g, '');
    if (!s || s === '-' ) return NaN;
    const c = s.lastIndexOf(','), p = s.lastIndexOf('.');
    if (c > -1 && p > -1) s = c > p ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (c > -1) s = s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(',', '.');
    else if (p > -1 && s.split('.').length > 2) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return isFinite(n) ? n : NaN;
  }

  // "Plato", "Menú", "Servicio", "Producto"... -> valor interno; null si no se reconoce.
  function parsearTipo(v) {
    const t = normalizarEncabezado(v);
    if (/plato|menu|comida|receta/.test(t)) return 'PLATO';
    if (/serv|trabajo|manodeobra/.test(t)) return 'SERVICIO';
    if (/prod|articulo|insumo|mercancia/.test(t)) return 'PRODUCTO_NORMAL';
    return null;
  }

  const vacio = (v) => v == null || String(v).trim() === '';
  const texto = (v) => (typeof v === 'number' ? String(v) : String(v == null ? '' : v).trim());
  const esUrlHttp = (s) => /^https?:\/\/\S+$/i.test(s);
  const claveCodigo = (s) => String(s == null ? '' : s).trim().toLowerCase();

  /**
   * Convierte las filas de datos en productos validados.
   * opciones: { actualizarExistentes: bool }
   * existentes: Map<claveCodigo, producto> del inventario actual.
   * Cada resultado: { fila, estado: 'nuevo'|'actualizar'|'omitido'|'error', motivo, datos }
   */
  function filasAProductos(filas, mapa, opciones, existentes) {
    const out = []; const vistos = new Map();
    filas.forEach((fila, i) => {
      const n = fila.numero != null ? fila.numero : i + 1;
      const celdas = fila.celdas || fila;
      if (celdas.every(vacio)) return;
      const get = (campo) => (mapa[campo] >= 0 ? celdas[mapa[campo]] : undefined);
      const err = (motivo) => out.push({ fila: n, estado: 'error', motivo, datos: null });

      const nombre = texto(get('nombre'));
      if (!nombre) return err('Falta el nombre del producto');

      const precioRaw = get('precio');
      if (mapa.precio >= 0 && vacio(precioRaw)) return err('Falta el precio de venta');
      const precio = mapa.precio >= 0 ? parsearNumero(precioRaw) : undefined;
      if (mapa.precio >= 0 && (isNaN(precio) || precio < 0)) return err('Precio de venta no válido: "' + texto(precioRaw) + '"');

      let costo;
      if (mapa.costo >= 0 && !vacio(get('costo'))) {
        costo = parsearNumero(get('costo'));
        if (isNaN(costo) || costo < 0) return err('Costo no válido: "' + texto(get('costo')) + '"');
      } else if (mapa.costo >= 0) costo = 0;

      let stock;
      if (mapa.stock >= 0 && !vacio(get('stock'))) {
        stock = parsearNumero(get('stock'));
        if (isNaN(stock) || stock < 0) return err('Stock no válido: "' + texto(get('stock')) + '"');
        stock = Math.round(stock * 1000) / 1000;
      } else if (mapa.stock >= 0) stock = 0;

      let tipoItem = null;
      if (mapa.tipo >= 0 && !vacio(get('tipo'))) {
        tipoItem = parsearTipo(get('tipo'));
        if (!tipoItem) return err('Tipo no reconocido: "' + texto(get('tipo')) + '" (usa PLATO, PRODUCTO o SERVICIO)');
      }

      const codigo = texto(get('codigo'));
      const k = claveCodigo(codigo);
      if (k) {
        if (vistos.has(k)) return err('Código repetido en el archivo (ya aparece en la fila ' + vistos.get(k) + ')');
        vistos.set(k, n);
      }

      const categoria = texto(get('categoria'));
      let imagenUrl = texto(get('imagen'));
      let aviso = '';
      if (imagenUrl && !esUrlHttp(imagenUrl)) { aviso = 'URL de imagen no válida (se ignora)'; imagenUrl = ''; }

      const datos = { codigo, nombre, precio, costo, stock, categoria, imagenUrl, tipoItem };
      const existente = k && existentes ? existentes.get(k) : null;
      if (existente) {
        if (!opciones.actualizarExistentes) return out.push({ fila: n, estado: 'omitido', motivo: 'Ya existe un producto con ese código', datos, existente, aviso });
        return out.push({ fila: n, estado: 'actualizar', motivo: '', datos, existente, aviso });
      }
      if (mapa.precio < 0) return err('No hay una columna de precio de venta');
      out.push({ fila: n, estado: 'nuevo', motivo: '', datos, existente: null, aviso });
    });
    return out;
  }

  // Nombre de archivo de foto -> clave de código ("7501234.jpg" -> "7501234")
  function claveDeArchivo(nombreArchivo) {
    return claveCodigo(String(nombreArchivo || '').replace(/\.[^.]+$/, ''));
  }

  const api = { CAMPOS, parsearTipo, normalizarEncabezado, detectarColumnas, detectarFilaEncabezado, parsearNumero, filasAProductos, claveCodigo, claveDeArchivo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FKImportar = api;
})(typeof window !== 'undefined' ? window : globalThis);
