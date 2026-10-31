// =====================================================================
// FacturaK v2 — Motor de temas + Editor de apariencia
// ---------------------------------------------------------------------
// Un "tema" es un objeto JSON:
//   { preset, modelo: 'circulo'|'cuadrado'|'triangulo',
//     colores: { primario, secundario, peligro, fondo, superficie, texto },  // #hex
//     transparencia: 0..60 (% de transparencia de tarjetas),
//     vidrio: bool (desenfoque tipo glassmorphism),
//     acabado: 'solido'|'mate' }
// Se guarda por usuario (usuario.tema) con respaldo en el tema de la
// empresa (empresa.tema). aplicar() solo escribe variables CSS y clases
// en <body>; nunca toca el HTML funcional.
// =====================================================================
(function () {
  'use strict';
  const FK = window.FK;
  const $ = FK.$;
  const esc = FK.esc;

  // ---------- Paletas predefinidas ----------
  const PRESETS = {
    clasico:   { nombre: 'Clásico',    colores: { primario: '#004E98', secundario: '#00B89F', peligro: '#E63946', fondo: '#F4F6F9', superficie: '#FFFFFF', texto: '#333333' } },
    medianoche:{ nombre: 'Medianoche', colores: { primario: '#3B82F6', secundario: '#22D3A6', peligro: '#F87171', fondo: '#0F172A', superficie: '#1E293B', texto: '#E2E8F0' } },
    esmeralda: { nombre: 'Esmeralda',  colores: { primario: '#065F46', secundario: '#D97706', peligro: '#DC2626', fondo: '#F0F5F2', superficie: '#FFFFFF', texto: '#1F2937' } },
    atardecer: { nombre: 'Atardecer',  colores: { primario: '#C2410C', secundario: '#0E7490', peligro: '#BE123C', fondo: '#FFF7ED', superficie: '#FFFFFF', texto: '#292524' } },
    grafito:   { nombre: 'Grafito',    colores: { primario: '#111827', secundario: '#059669', peligro: '#DC2626', fondo: '#E5E7EB', superficie: '#F9FAFB', texto: '#111827' } },
    lavanda:   { nombre: 'Lavanda',    colores: { primario: '#5B21B6', secundario: '#0D9488', peligro: '#E11D48', fondo: '#F5F3FF', superficie: '#FFFFFF', texto: '#1E1B4B' } }
  };
  const MODELOS = {
    circulo:   { nombre: 'Círculo',   sub: 'Orbital', desc: 'Curvas amplias, botones píldora y órbitas suaves de fondo.' },
    cuadrado:  { nombre: 'Cuadrado',  sub: 'Bloque',  desc: 'Ángulos rectos, contornos marcados y retícula técnica.' },
    triangulo: { nombre: 'Triángulo', sub: 'Prisma',  desc: 'Esquinas en bisel diagonal y fondo facetado.' }
  };
  const ETIQUETAS = { primario: 'Primario', secundario: 'Acento', peligro: 'Alertas', fondo: 'Fondo', superficie: 'Tarjetas', texto: 'Texto' };
  const DEFAULT = { preset: 'clasico', modelo: 'circulo', colores: { ...PRESETS.clasico.colores }, transparencia: 0, vidrio: false, acabado: 'solido' };

  // ---------- Utilidades de color ----------
  const hexARgb = (h) => { h = String(h || '#000').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgbAHex = (r) => '#' + r.map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
  const mezclar = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const lum = (r) => { const c = r.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  // Texto sobre colores de marca: blanco salvo que el color sea demasiado claro para leerlo
  const sobre = (r) => contraste(r, [255, 255, 255]) >= 2.3 ? [255, 255, 255] : [17, 24, 39];
  function rgbAHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b); let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) { const d = max - min; s = l > .5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
    return [h, s, l];
  }
  function hslARgb([h, s, l]) {
    if (!s) return [l * 255, l * 255, l * 255];
    const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }
  const matizar = (rgb, satF, lumD) => { const [h, s, l] = rgbAHsl(rgb); return hslARgb([h, Math.max(0, Math.min(1, s * satF)), Math.max(0, Math.min(1, l + lumD))]); };
  const trio = (r) => r.map(v => Math.round(v)).join(' ');

  function normalizar(t) {
    t = t && typeof t === 'object' ? t : {};
    return {
      preset: t.preset || 'personalizado',
      modelo: MODELOS[t.modelo] ? t.modelo : DEFAULT.modelo,
      colores: { ...DEFAULT.colores, ...(t.colores || {}) },
      transparencia: Math.max(0, Math.min(60, Number(t.transparencia) || 0)),
      vidrio: !!t.vidrio,
      acabado: t.acabado === 'mate' ? 'mate' : 'solido'
    };
  }

  // Calcula todas las variables CSS derivadas a partir de los 6 colores base
  function derivar(t) {
    const c = {}; for (const k in t.colores) c[k] = hexARgb(t.colores[k]);
    if (t.acabado === 'mate') {
      ['primario', 'secundario', 'peligro'].forEach(k => { c[k] = matizar(c[k], 0.62, 0.03); });
      c.fondo = matizar(c.fondo, 0.5, 0);
    }
    const oscuro = lum(c.superficie) < 0.35;
    return {
      oscuro,
      vars: {
        '--c-primary': trio(c.primario), '--c-secundario': trio(c.secundario), '--c-peligro': trio(c.peligro),
        '--c-texto': trio(c.texto), '--c-muted': trio(mezclar(c.texto, c.superficie, 0.42)),
        '--c-fondo': trio(c.fondo), '--c-superficie': trio(c.superficie),
        '--c-input': trio(oscuro ? mezclar(c.superficie, c.fondo, 0.5) : c.superficie),
        '--c-sutil': trio(mezclar(c.superficie, c.texto, 0.035)), '--c-sutil2': trio(mezclar(c.superficie, c.texto, 0.07)),
        '--c-sutil3': trio(mezclar(c.superficie, c.texto, 0.13)), '--c-borde': trio(mezclar(c.superficie, c.texto, 0.12)),
        '--c-sobre-primario': trio(sobre(c.primario)), '--c-sobre-secundario': trio(sobre(c.secundario)), '--c-sobre-peligro': trio(sobre(c.peligro)),
        '--alpha-superficie': String(1 - t.transparencia / 100)
      },
      avisos: [
        contraste(c.texto, c.superficie) < 4.5 ? 'El texto tiene poco contraste con las tarjetas: puede costar leerlo.' : '',
        contraste(c.primario, c.fondo) < 1.6 ? 'El color primario se confunde con el fondo.' : ''
      ].filter(Boolean)
    };
  }

  let actual = normalizar(DEFAULT);
  function aplicar(t) {
    t = normalizar(t);
    actual = t;
    const d = derivar(t);
    const root = document.documentElement;
    for (const k in d.vars) root.style.setProperty(k, d.vars[k]);
    root.style.colorScheme = d.oscuro ? 'dark' : 'light';
    const b = document.body;
    b.classList.remove('geo-circulo', 'geo-cuadrado', 'geo-triangulo', 'acabado-solido', 'acabado-mate', 'vidrio');
    b.classList.add('geo-' + t.modelo, 'acabado-' + t.acabado);
    if (t.vidrio) b.classList.add('vidrio');
    return d;
  }

  // Prioridad: tema del usuario > tema de la empresa > último tema usado en este equipo > Clásico
  function resolver() {
    const u = FK.sesion && FK.sesion.usuario, e = FK.emp && FK.emp();
    return normalizar((u && u.tema) || (e && e.tema) || (FK.store.data && FK.store.data.temaUltimo) || DEFAULT);
  }
  function aplicarActual() {
    const t = resolver();
    aplicar(t);
    if (FK.store.data && JSON.stringify(FK.store.data.temaUltimo) !== JSON.stringify(t)) { FK.store.data.temaUltimo = t; FK.store.save(); }
  }
  const css = (k) => { const v = getComputedStyle(document.documentElement).getPropertyValue(k === 'primario' ? '--c-primary' : '--c-' + k).trim(); return v ? `rgb(${v.split(' ').join(',')})` : '#999'; };

  FK.tema = { PRESETS, MODELOS, DEFAULT, normalizar, aplicar, resolver, aplicarActual, css, actual: () => actual };

  // =====================================================================
  // Editor de apariencia (pestaña "Apariencia")
  // =====================================================================
  let borrador = null;
  let sinGuardar = false;

  const ICONO_MODELO = {
    circulo: '<svg viewBox="0 0 64 64" class="w-12 h-12"><circle cx="32" cy="32" r="24" fill="rgb(var(--c-primary))" opacity=".9"/><circle cx="46" cy="18" r="9" fill="rgb(var(--c-secundario))"/></svg>',
    cuadrado: '<svg viewBox="0 0 64 64" class="w-12 h-12"><rect x="9" y="9" width="40" height="40" fill="rgb(var(--c-primary))" opacity=".9"/><rect x="36" y="36" width="20" height="20" fill="rgb(var(--c-secundario))"/></svg>',
    triangulo: '<svg viewBox="0 0 64 64" class="w-12 h-12"><polygon points="32,6 58,54 6,54" fill="rgb(var(--c-primary))" opacity=".9"/><polygon points="46,30 60,56 32,56" fill="rgb(var(--c-secundario))"/></svg>'
  };

  function vistaPrevia() {
    return `<div class="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-4">
      <div class="flex items-center justify-between"><div class="text-sm font-bold text-dark333">Vista previa</div><span class="estado-chip estado-al_dia">● Al día</span></div>
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-gray-50 rounded-xl p-3 text-center"><div class="text-lg font-extrabold text-teal">$1.250</div><div class="text-[10px] uppercase text-greym">Ventas</div></div>
        <div class="bg-gray-50 rounded-xl p-3 text-center"><div class="text-lg font-extrabold text-dark333">38</div><div class="text-[10px] uppercase text-greym">Facturas</div></div>
        <div class="bg-gray-50 rounded-xl p-3 text-center"><div class="text-lg font-extrabold text-accent">3</div><div class="text-[10px] uppercase text-greym">En mora</div></div>
      </div>
      <input class="input-field" placeholder="Campo de texto de ejemplo">
      <div class="flex flex-wrap gap-2">
        <button class="bg-primary text-white font-semibold px-4 py-2 rounded-xl">Primario</button>
        <button class="bg-teal text-white font-semibold px-4 py-2 rounded-xl">Acento</button>
        <button class="bg-accent text-white font-semibold px-4 py-2 rounded-xl">Alerta</button>
        <button class="bg-primary/10 text-primary font-semibold px-4 py-2 rounded-xl">Secundario</button>
      </div>
      <div class="flex items-center gap-3 bg-gray-50 rounded-xl p-2.5">
        <div class="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-extrabold">K</div>
        <div class="flex-1"><div class="text-sm font-semibold text-dark333">Harina de maíz 1kg</div><div class="text-[11px] text-greym">Código 7500000000011</div></div>
        <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-greym">120 und</span>
      </div>
      <div id="tema-avisos" class="flex flex-col gap-1"></div>
    </div>`;
  }

  function pintarEditor() {
    const t = borrador;
    const cont = $('tab-apariencia');
    const admin = FK.esAdmin();
    cont.innerHTML = `
      <div class="bg-primary/5 border border-primary/15 rounded-2xl p-4 mb-5 text-xs text-greym leading-relaxed flex items-start gap-3">
        <span class="text-lg leading-none">🎨</span>
        <div>Personaliza FacturaK a tu gusto. Los cambios se ven al instante y solo cambian la <b>apariencia</b>: botones, menús y datos siguen funcionando igual.
        Tu tema es personal (se guarda con tu usuario)${admin ? '; como Administrador también puedes fijarlo como tema predeterminado de la empresa' : ''}.</div>
      </div>
      <div class="grid grid-cols-1 xl:grid-cols-5 gap-5">
        <div class="xl:col-span-3 flex flex-col gap-5">
          <div class="bg-white rounded-2xl shadow-sm p-5">
            <div class="text-sm font-bold text-dark333 mb-1">Modelo de interfaz</div>
            <p class="text-xs text-greym mb-4">La forma base de tarjetas, botones, campos y fondo.</p>
            <div class="grid grid-cols-3 gap-3">
              ${Object.entries(MODELOS).map(([k, m]) => `<button data-modelo="${k}" class="modelo-card ${t.modelo === k ? 'selected' : ''}">
                ${ICONO_MODELO[k]}<div class="text-sm font-bold text-dark333">${m.nombre} <span class="text-greym font-semibold">· ${m.sub}</span></div>
                <div class="text-[11px] text-greym text-center leading-snug">${m.desc}</div></button>`).join('')}
            </div>
          </div>
          <div class="bg-white rounded-2xl shadow-sm p-5">
            <div class="text-sm font-bold text-dark333 mb-1">Paleta de colores</div>
            <p class="text-xs text-greym mb-3">Parte de una paleta y ajusta cualquier color.</p>
            <div class="flex flex-wrap gap-2 mb-4">
              ${Object.entries(PRESETS).map(([k, p]) => `<button data-preset="${k}" class="preset-chip ${t.preset === k ? 'selected' : ''}">
                <span class="sw">${['primario', 'secundario', 'fondo', 'superficie'].map(c => `<span style="background:${p.colores[c]}"></span>`).join('')}</span>${p.nombre}</button>`).join('')}
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
              ${Object.keys(ETIQUETAS).map(k => `<label class="flex items-center gap-3 bg-gray-50 rounded-xl p-2.5 cursor-pointer">
                <input type="color" class="color-pick" data-color="${k}" value="${esc(t.colores[k])}">
                <div><div class="text-xs font-bold text-dark333">${ETIQUETAS[k]}</div><div class="text-[11px] text-greym font-mono uppercase" data-hex="${k}">${esc(t.colores[k])}</div></div></label>`).join('')}
            </div>
          </div>
          <div class="bg-white rounded-2xl shadow-sm p-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <div class="text-sm font-bold text-dark333 mb-1">Transparencia de tarjetas</div>
              <p class="text-xs text-greym mb-3">0% = opacas. Combínalo con el efecto vidrio.</p>
              <div class="flex items-center gap-3"><input type="range" min="0" max="60" step="5" id="tema-transp" class="fk-range" value="${t.transparencia}"><span id="tema-transp-val" class="text-sm font-bold text-dark333 w-10 text-right">${t.transparencia}%</span></div>
              <label class="flex items-center gap-2 text-xs text-greym mt-3 cursor-pointer"><input type="checkbox" id="tema-vidrio" class="rounded accent-teal" ${t.vidrio ? 'checked' : ''}> Efecto vidrio (desenfoque del fondo)</label>
            </div>
            <div>
              <div class="text-sm font-bold text-dark333 mb-1">Acabado</div>
              <p class="text-xs text-greym mb-3">Sólido: colores plenos con relieve. Mate: tonos suaves, sin brillo y con grano.</p>
              <div class="seg"><button data-acabado="solido" class="${t.acabado === 'solido' ? 'on' : ''}">Sólido</button><button data-acabado="mate" class="${t.acabado === 'mate' ? 'on' : ''}">Mate</button></div>
            </div>
          </div>
        </div>
        <div class="xl:col-span-2 flex flex-col gap-5">
          ${vistaPrevia()}
          <div class="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-2">
            <button id="tema-guardar" class="bg-teal hover:bg-teal/90 text-white font-bold py-2.5 rounded-xl transition active:scale-95">Guardar mi tema</button>
            ${admin ? '<button id="tema-empresa" class="bg-primary/10 text-primary font-semibold py-2.5 rounded-xl hover:bg-primary/20 transition">Usar como tema de toda la empresa</button>' : ''}
            <button id="tema-restablecer" class="text-sm text-greym hover:text-accent font-semibold py-1.5">Restablecer ${FK.emp().tema ? 'al tema de la empresa' : 'al tema Clásico'}</button>
            <p id="tema-estado" class="text-[11px] text-greym text-center"></p>
          </div>
        </div>
      </div>`;
    actualizarEstado();
  }

  function actualizarEstado() {
    const d = derivar(borrador);
    const av = $('tema-avisos');
    if (av) av.innerHTML = d.avisos.map(a => `<div class="text-[11px] font-semibold text-amber-700 bg-amber-100 rounded-lg px-2.5 py-1.5">⚠️ ${esc(a)}</div>`).join('');
    const est = $('tema-estado');
    if (est) est.textContent = sinGuardar ? 'Cambios sin guardar: si sales de esta pestaña se descartan.' : 'Tema guardado.';
  }

  function cambiar(fn, repintar = false) {
    fn(borrador);
    sinGuardar = true;
    aplicar(borrador);
    if (repintar) pintarEditor(); else actualizarEstado();
  }

  function enlazarEditor() {
    const cont = $('tab-apariencia');
    cont.addEventListener('click', (e) => {
      const m = e.target.closest('[data-modelo]'), p = e.target.closest('[data-preset]'), a = e.target.closest('[data-acabado]');
      if (m) return cambiar(t => { t.modelo = m.dataset.modelo; }, true);
      if (p) return cambiar(t => { t.preset = p.dataset.preset; t.colores = { ...PRESETS[p.dataset.preset].colores }; }, true);
      if (a) return cambiar(t => { t.acabado = a.dataset.acabado; }, true);
      if (e.target.id === 'tema-guardar') {
        FK.sesion.usuario.tema = normalizar(borrador); sinGuardar = false;
        FK.store.data.temaUltimo = FK.sesion.usuario.tema; FK.store.saveNow(); actualizarEstado(); FK.toast('Tema guardado');
      }
      if (e.target.id === 'tema-empresa') {
        FK.emp().tema = normalizar(borrador); FK.sesion.usuario.tema = normalizar(borrador); sinGuardar = false;
        FK.store.saveNow(); actualizarEstado(); FK.toast('Tema aplicado como predeterminado de la empresa');
      }
      if (e.target.id === 'tema-restablecer') {
        delete FK.sesion.usuario.tema; FK.store.saveNow(); sinGuardar = false;
        borrador = resolver(); aplicar(borrador); pintarEditor(); FK.toast('Tema restablecido');
      }
    });
    cont.addEventListener('input', (e) => {
      if (e.target.dataset.color) {
        const k = e.target.dataset.color, v = e.target.value;
        cambiar(t => { t.colores[k] = v; t.preset = 'personalizado'; });
        const h = cont.querySelector(`[data-hex="${k}"]`); if (h) h.textContent = v;
        cont.querySelectorAll('.preset-chip.selected').forEach(x => x.classList.remove('selected'));
      }
      if (e.target.id === 'tema-transp') { cambiar(t => { t.transparencia = +e.target.value; }); $('tema-transp-val').textContent = e.target.value + '%'; }
    });
    cont.addEventListener('change', (e) => { if (e.target.id === 'tema-vidrio') cambiar(t => { t.vidrio = e.target.checked; }); });
  }

  FK.render.apariencia = () => {
    if (!sinGuardar || !borrador) borrador = resolver();
    pintarEditor();
  };
  // Al salir de la pestaña sin guardar se vuelve al tema guardado
  FK.tema.alSalirDeApariencia = () => { if (sinGuardar) { sinGuardar = false; borrador = null; aplicarActual(); } };

  document.addEventListener('DOMContentLoaded', () => { if ($('tab-apariencia')) enlazarEditor(); });
})();
