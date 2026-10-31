// FacturaK — Importación masiva de inventario desde Excel / CSV.
// La lógica de validación vive en importar-core.js (probada aparte); aquí
// está solo la pantalla: elegir archivo, revisar columnas, fotos e importar.
(function () {
  'use strict';
  const FK = window.FK;
  const $ = FK.$;
  const esc = FK.esc;
  const I = window.FKImportar;

  const ETIQUETAS = { codigo: 'Código / SKU', nombre: 'Nombre', precio: 'Precio de venta', costo: 'Costo', stock: 'Stock', categoria: 'Categoría', imagen: 'URL de imagen', tipo: 'Tipo de ítem' };
  const MAX_FILAS = 5000;
  const MAX_FILAS_VISTA = 200;

  let st = null; // estado del asistente
  const nuevoEstado = () => ({ nombreArchivo: '', filas: [], offsetFila: 1, encabezados: [], mapa: {}, resultados: [], fotos: new Map(), ocupado: false });

  function paso(nombre) {
    ['archivo', 'revision', 'resultado'].forEach((p) => $('imp-paso-' + p).classList.toggle('hidden', p !== nombre));
  }

  function abrir() {
    st = nuevoEstado();
    $('imp-archivo').value = ''; $('imp-fotos').value = '';
    $('imp-fotos-resumen').textContent = '';
    $('imp-progreso').classList.add('hidden');
    $('imp-confirmar').disabled = false;
    paso('archivo');
    FK.openModal('modal-importar');
  }

  // ---------- Leer el archivo ----------
  async function leerArchivo(file) {
    if (!file) return;
    if (typeof XLSX === 'undefined') return FK.toast('No se cargó el lector de Excel', 'error');
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      let wb;
      if (ext === 'csv') {
        // Los CSV de Excel en español suelen venir en ANSI (Windows-1252), no UTF-8.
        const bytes = new Uint8Array(await file.arrayBuffer());
        let texto;
        try { texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
        catch (_) { texto = new TextDecoder('windows-1252').decode(bytes); }
        // raw:true = no convertir "4,5" en 45: la coma decimal la interpreta importar-core.
        wb = XLSX.read(texto, { type: 'string', raw: true });
      } else {
        wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      }
      let filas = [], offset = 1;
      for (const nombre of wb.SheetNames) {
        const ws = wb.Sheets[nombre];
        if (!ws || !ws['!ref']) continue;
        const f = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: true });
        if (f.length >= 2) { filas = f; offset = XLSX.utils.decode_range(ws['!ref']).s.r + 1; break; }
      }
      if (filas.length < 2) return FK.toast('El archivo no tiene datos (necesita encabezados y al menos una fila)', 'error');
      if (filas.length > MAX_FILAS + 20) return FK.toast(`El archivo tiene demasiadas filas (máximo ${MAX_FILAS}). Divídelo en partes.`, 'error');

      const idxEnc = I.detectarFilaEncabezado(filas);
      st.nombreArchivo = file.name;
      st.filas = filas.slice(idxEnc + 1).map((celdas, i) => ({ numero: offset + idxEnc + 1 + i, celdas }));
      st.encabezados = filas[idxEnc].map((c, i) => String(c == null || c === '' ? 'Columna ' + (i + 1) : c).trim());
      st.mapa = I.detectarColumnas(filas[idxEnc].map(String)).mapa;
      $('imp-nombre-archivo').textContent = '📄 ' + file.name + ' — ' + st.filas.length + ' filas';
      pintarMapa();
      recalcular();
      paso('revision');
    } catch (err) {
      console.error(err);
      FK.toast('No se pudo leer el archivo: ' + (err.message || err), 'error');
    }
  }

  function pintarMapa() {
    $('imp-mapa').innerHTML = I.CAMPOS.map((campo) => `
      <label class="text-[11px] text-greym">${ETIQUETAS[campo]}
        <select data-campo="${campo}" class="input-field !py-1 !text-xs mt-0.5">
          <option value="-1">— no usar —</option>
          ${st.encabezados.map((h, i) => `<option value="${i}" ${st.mapa[campo] === i ? 'selected' : ''}>${esc(h)}</option>`).join('')}
        </select>
      </label>`).join('');
  }

  // ---------- Revisar / validar ----------
  function existentes() {
    const m = new Map();
    FK.emp().productos.forEach((p) => { const k = I.claveCodigo(p.codigo); if (k) m.set(k, p); });
    return m;
  }

  function recalcular() {
    const ex = existentes();
    const actualizar = $('imp-actualizar').checked;
    st.resultados = st.mapa.nombre >= 0 ? I.filasAProductos(st.filas, st.mapa, { actualizarExistentes: actualizar }, ex) : [];

    // Fotos: se aplican a los productos que se van a importar y, si se
    // permite actualizar, también a productos ya existentes con ese código.
    const claves = new Set(st.resultados.filter((r) => r.estado === 'nuevo' || r.estado === 'actualizar').map((r) => I.claveCodigo(r.datos.codigo)).filter(Boolean));
    let enArchivo = 0, enExistentes = 0, sinMatch = 0;
    st.fotos.forEach((_f, k) => { if (claves.has(k)) enArchivo++; else if (actualizar && ex.has(k)) enExistentes++; else sinMatch++; });
    $('imp-fotos-resumen').textContent = st.fotos.size
      ? `${st.fotos.size} foto(s) cargadas: ${enArchivo} coinciden con el archivo, ${enExistentes} con productos que ya existen, ${sinMatch} sin coincidencia (se ignoran).`
      : '';

    const cuenta = (e) => st.resultados.filter((r) => r.estado === e).length;
    const nuevos = cuenta('nuevo'), act = cuenta('actualizar'), omit = cuenta('omitido'), errs = cuenta('error');
    const chip = (n, txt, cls) => `<span class="px-2.5 py-1 rounded-full ${cls}">${n} ${txt}</span>`;
    $('imp-resumen').innerHTML = st.mapa.nombre < 0
      ? '<span class="px-2.5 py-1 rounded-full bg-accent/15 text-accent">No se encontró la columna del nombre: elígela arriba.</span>'
      : chip(nuevos, 'nuevos', 'bg-teal/15 text-teal') + chip(act, 'a actualizar', 'bg-primary/15 text-primary') +
        chip(omit, 'omitidos', 'bg-gray-100 text-greym') + chip(errs, 'con error', 'bg-accent/15 text-accent');

    const clase = { nuevo: 'text-teal', actualizar: 'text-primary', omitido: 'text-greym', error: 'text-accent' };
    const texto = { nuevo: 'Nuevo', actualizar: 'Actualizar', omitido: 'Omitido', error: 'Error' };
    $('imp-tabla').innerHTML = st.resultados.slice(0, MAX_FILAS_VISTA).map((r) => {
      const d = r.datos || {};
      const foto = d.codigo && st.fotos.has(I.claveCodigo(d.codigo)) ? '📷 archivo' : d.imagenUrl ? '🌐 enlace' : '—';
      return `<tr class="border-t border-gray-50"><td class="p-2 text-greym">${r.fila}</td>
        <td class="p-2 font-semibold ${clase[r.estado]}" title="${esc(r.motivo || r.aviso || '')}">${texto[r.estado]}${r.motivo ? ' · <span class="font-normal">' + esc(r.motivo) + '</span>' : ''}</td>
        <td class="p-2">${esc(d.codigo || '')}</td><td class="p-2">${esc(d.nombre || '')}</td>
        <td class="p-2 text-right">${d.precio != null ? d.precio : ''}</td><td class="p-2 text-right">${d.costo != null ? d.costo : ''}</td>
        <td class="p-2 text-right">${d.stock != null ? d.stock : ''}</td><td class="p-2">${foto}</td></tr>`;
    }).join('') + (st.resultados.length > MAX_FILAS_VISTA ? `<tr><td colspan="8" class="p-2 text-center text-greym">Mostrando ${MAX_FILAS_VISTA} de ${st.resultados.length} filas…</td></tr>` : '');

    const aImportar = nuevos + act;
    $('imp-confirmar').textContent = aImportar ? `Importar ${aImportar} producto(s)` : 'Nada para importar';
    $('imp-confirmar').disabled = st.ocupado || (aImportar === 0 && !(actualizar && enExistentes > 0));
  }

  // ---------- Fotos ----------
  function agregarFotos(lista) {
    [...lista].filter((f) => f.type.startsWith('image/')).forEach((f) => {
      const k = I.claveDeArchivo(f.name);
      if (k) st.fotos.set(k, f);
    });
    if (st.filas.length) recalcular();
  }

  async function imagenDesdeUrl(url) {
    const r = await window.api.descargarImagen(url);
    if (!r || !r.ok) throw new Error((r && r.error) || 'No se pudo descargar');
    const bin = atob(r.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return FK.leerImagen(new File([bytes], 'imagen', { type: r.mime }), 400);
  }

  async function pool(tareas, n, fn) {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, tareas.length) }, async () => {
      while (i < tareas.length) { const t = tareas[i++]; await fn(t); }
    }));
  }

  // ---------- Importar ----------
  async function importar() {
    if (st.ocupado) return;
    st.ocupado = true; $('imp-confirmar').disabled = true;
    const e = FK.emp(), ahora = new Date().toISOString();
    const tipoDefecto = $('imp-tipo').value; // se usa si el archivo no trae columna "Tipo" (o la fila va vacía)
    const actualizar = $('imp-actualizar').checked;
    const mapa = st.mapa;
    const fallos = [];                    // { texto }
    const tareasImagen = [];              // { producto, foto?, url?, etiqueta }
    let creados = 0, actualizados = 0;
    const usadas = new Set();

    for (const r of st.resultados) {
      if (r.estado !== 'nuevo' && r.estado !== 'actualizar') continue;
      const d = r.datos; let p;
      if (r.estado === 'nuevo') {
        const t = d.tipoItem || tipoDefecto;
        p = {
          id: FK.uid(), creado: ahora, variantes: [], imagen: null, tipoItem: t, codigo: d.codigo, nombre: d.nombre, descripcion: '',
          precio: FK.r2(d.precio || 0), costo: FK.r2(d.costo || 0), mayor: 0, stockMinimo: 0, stock: t === 'SERVICIO' ? 0 : (d.stock || 0),
          categoria: d.categoria || '', categoriaProducto: 'plato', tipoVenta: 'unidad', impuestoPct: null,
          controlaStock: t === 'PRODUCTO_NORMAL' && !FK.tiene('sinStock'), ventaPOS: true, precioVariable: false, agotado: false, receta: [],
        };
        e.productos.push(p); creados++;
      } else {
        p = r.existente; p.nombre = d.nombre;
        if (mapa.precio >= 0) p.precio = FK.r2(d.precio);
        if (mapa.costo >= 0) p.costo = FK.r2(d.costo);
        if (mapa.tipo >= 0 && d.tipoItem) p.tipoItem = d.tipoItem;
        if (mapa.stock >= 0 && !(p.variantes && p.variantes.length) && FK.itemControlaStock(p)) p.stock = d.stock;
        if (mapa.categoria >= 0 && d.categoria) p.categoria = d.categoria;
        actualizados++;
      }
      const k = I.claveCodigo(d.codigo);
      const foto = k ? st.fotos.get(k) : null;
      if (foto) { usadas.add(k); tareasImagen.push({ producto: p, foto, etiqueta: d.nombre }); }
      else if (d.imagenUrl) tareasImagen.push({ producto: p, url: d.imagenUrl, etiqueta: d.nombre });
    }
    // Fotos sueltas para productos que ya existían y no vienen en el archivo
    if (actualizar) {
      const ex = existentes();
      st.fotos.forEach((foto, k) => { if (!usadas.has(k) && ex.has(k)) tareasImagen.push({ producto: ex.get(k), foto, etiqueta: ex.get(k).nombre }); });
    }
    FK.invalidarIndice();
    FK.store.saveNow(); // los productos ya quedan guardados aunque la descarga de fotos tarde

    let fotosOk = 0, hechas = 0;
    if (tareasImagen.length) {
      $('imp-progreso').classList.remove('hidden');
      const actualizarBarra = () => {
        $('imp-barra').style.width = Math.round((hechas / tareasImagen.length) * 100) + '%';
        $('imp-progreso-texto').textContent = `Procesando fotos ${hechas} / ${tareasImagen.length}…`;
      };
      actualizarBarra();
      await pool(tareasImagen, 4, async (t) => {
        try {
          t.producto.imagen = t.foto ? await FK.leerImagen(t.foto, 400) : await imagenDesdeUrl(t.url);
          fotosOk++;
        } catch (err) {
          fallos.push(`Foto de «${t.etiqueta}»: ${err.message || err}`);
        }
        hechas++; actualizarBarra();
      });
    }
    FK.store.saveNow();
    if (FK.render.inventario) FK.render.inventario();

    const omitidos = st.resultados.filter((r) => r.estado === 'omitido').length;
    const errores = st.resultados.filter((r) => r.estado === 'error');
    $('imp-resultado-resumen').innerHTML = `✅ <b>${creados}</b> producto(s) creados, <b>${actualizados}</b> actualizados` +
      (tareasImagen.length ? `, <b>${fotosOk}</b> de ${tareasImagen.length} foto(s) cargadas` : '') +
      (omitidos ? `, ${omitidos} omitidos (ya existían)` : '') + (errores.length ? `, <span class="text-accent font-semibold">${errores.length} filas con error</span>` : '') + '.';
    $('imp-resultado-detalle').innerHTML = [
      ...errores.map((r) => `<div>Fila ${r.fila}: ${esc(r.motivo)}</div>`),
      ...fallos.map((t) => `<div>${esc(t)}</div>`),
    ].join('') || '<div>Sin incidencias.</div>';
    st.ocupado = false;
    paso('resultado');
    FK.toast(`Importación lista: ${creados} nuevos, ${actualizados} actualizados`);
  }

  // ---------- Plantilla de ejemplo ----------
  function descargarPlantilla() {
    const aoa = [
      ['Código/SKU', 'Nombre/Descripción del producto', 'Precio de Venta', 'Costo', 'Stock / Cantidad Inicial', 'Categoría', 'URL de Imagen (opcional)', 'Tipo (PRODUCTO / PLATO / SERVICIO)'],
      ['A001', 'Harina de maíz 1kg', 1.5, 1.1, 40, 'Alimentos', 'https://tusitio.com/fotos/harina.jpg', 'PRODUCTO'],
      ['', 'Hamburguesa clásica', 6.5, 3.2, '', 'Menú', '', 'PLATO'],
      ['', 'Corte de cabello', 5, '', '', 'Barbería', '', 'SERVICIO'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 14 }, { wch: 34 }, { wch: 16 }, { wch: 10 }, { wch: 24 }, { wch: 14 }, { wch: 40 }, { wch: 34 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const url = URL.createObjectURL(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a'); a.href = url; a.download = 'Plantilla-inventario-FacturaK.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ---------- Conexión de eventos ----------
  function zona(zonaId, inputId, alSoltar) {
    const z = $(zonaId), inp = $(inputId);
    z.addEventListener('click', (ev) => { if (ev.target !== inp) inp.click(); });
    ['dragenter', 'dragover'].forEach((t) => z.addEventListener(t, (ev) => { ev.preventDefault(); z.classList.add('border-primary'); }));
    ['dragleave', 'drop'].forEach((t) => z.addEventListener(t, (ev) => { ev.preventDefault(); z.classList.remove('border-primary'); }));
    z.addEventListener('drop', (ev) => alSoltar(ev.dataTransfer.files));
    inp.addEventListener('change', () => { alSoltar(inp.files); });
  }

  function init() {
    zona('imp-drop-archivo', 'imp-archivo', (fs) => leerArchivo(fs[0]));
    zona('imp-drop-fotos', 'imp-fotos', (fs) => agregarFotos(fs));
    $('imp-plantilla').onclick = descargarPlantilla;
    $('imp-cambiar').onclick = () => { st = nuevoEstado(); $('imp-archivo').value = ''; $('imp-fotos').value = ''; paso('archivo'); };
    $('imp-actualizar').addEventListener('change', recalcular);
    $('imp-mapa').addEventListener('change', (ev) => {
      const s = ev.target.closest('select[data-campo]'); if (!s) return;
      st.mapa[s.dataset.campo] = parseInt(s.value, 10);
      recalcular();
    });
    $('imp-confirmar').onclick = importar;
    $('btn-importar-excel').onclick = abrir;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
