// FacturaK — pantalla "Red y dispositivos": servidor local (PC central), vinculación por QR / código,
// túnel a Internet, lista de dispositivos y modo cliente. Habla con red.js (cliente) y con window.api.red (servidor).
(function () {
  'use strict';
  const FK = window.FK;
  const R = FK.red;
  const API = window.api;
  const $ = FK.$;
  const esc = FK.esc;
  const esAndroid = !!(API && API.plataforma === 'android');
  const puedeServir = !!(API && API.red) && !esAndroid;
  let est = null;           // estado del servidor (anfitrión)
  let reloj = null;

  const contenedor = () => document.getElementById('tab-red');
  const fechaCorta = (iso) => { try { return iso ? FK.fechaHora(iso) : '—'; } catch (_) { return '—'; } };
  const copiar = async (t) => { try { if (API && API.copiar) await API.copiar(t); else await navigator.clipboard.writeText(t); FK.toast('Copiado'); } catch (_) { FK.toast('No se pudo copiar', 'error'); } };

  // ------------------------------------------------------------------ indicador en el encabezado
  function crearPill() {
    const t = $('page-title'); if (!t || $('red-pill')) return;
    const p = document.createElement('button');
    p.id = 'red-pill'; p.type = 'button'; p.className = 'hidden';
    p.style.cssText = 'margin-left:10px;font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;border:0;cursor:pointer;vertical-align:middle;min-height:0';
    p.onclick = () => FK.irTab && FK.irTab('red');
    t.insertAdjacentElement('afterend', p);
  }
  function pintarPill() {
    const p = $('red-pill'); if (!p) return;
    if (!R.activo()) { p.classList.add('hidden'); return; }
    const s = R.estado;
    let txt, bg, fg;
    if (!s.autorizado) { txt = '⛔ Desvinculado'; bg = '#FEE2E2'; fg = '#B91C1C'; }
    else if (R.host) { txt = '🖥️ Servidor' + (est && est.dispositivos ? ` · ${est.dispositivos.filter((d) => !d.revocado).length} disp.` : ''); bg = '#DCFCE7'; fg = '#166534'; }
    else if (s.conectado) { txt = s.sucio ? '🟢 Sincronizando…' : '🟢 En línea'; bg = '#DCFCE7'; fg = '#166534'; }
    else { txt = '🟠 Sin conexión' + (s.sucio ? ' · cambios en cola' : ''); bg = '#FEF3C7'; fg = '#92400E'; }
    p.textContent = txt; p.style.background = bg; p.style.color = fg; p.classList.remove('hidden');
  }

  // ------------------------------------------------------------------ vistas
  function badge(txt, ok) { return `<span style="display:inline-block;font-size:11px;font-weight:700;padding:2px 10px;border-radius:999px;background:${ok ? '#DCFCE7' : '#F3F4F6'};color:${ok ? '#166534' : '#4B5563'}">${txt}</span>`; }
  const card = (t, cuerpo, extra = '') => `<div class="bg-white rounded-2xl shadow-sm p-5 mb-4" ${extra}><h3 class="text-sm font-bold text-dark333 mb-3">${t}</h3>${cuerpo}</div>`;
  const btn = (id, txt, tipo = 'p') => `<button type="button" id="${id}" class="${tipo === 'p' ? 'bg-primary text-white' : tipo === 'd' ? 'bg-accent/10 text-accent' : 'bg-gray-100 text-dark333'} font-semibold px-4 py-2.5 rounded-xl text-sm transition active:scale-95">${txt}</button>`;

  function vistaServidor() {
    const on = est && est.encendido;
    let h = '';
    h += card('🖥️ Servidor local — esta PC es la central', `
      <p class="text-xs text-greym leading-relaxed mb-3">Convierte esta computadora en la <b>PC central</b>: guarda todos los datos y permite que otras PCs, tablets y celulares Android facturen y consulten inventario en tiempo real, en la misma red Wi-Fi o por Internet.</p>
      <div class="flex items-center gap-3 flex-wrap mb-3">${badge(on ? '● Encendido' : '○ Apagado', on)}
        ${on ? btn('red-apagar', 'Apagar servidor', 'd') : btn('red-encender', 'Encender servidor')}
        <span id="red-msg" class="text-xs text-greym"></span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">
        <div><label class="text-xs font-semibold text-greym">Nombre de la PC central</label><input id="red-nombre" class="input-field" maxlength="40" value="${esc((est && est.nombre) || '')}"></div>
        <div><label class="text-xs font-semibold text-greym">Puerto</label><input id="red-puerto" type="number" min="1024" max="65535" class="input-field" value="${(est && est.puerto) || 8080}"></div>
      </div>
      <label class="flex items-start gap-2 text-xs text-dark333 mt-3 cursor-pointer"><input type="checkbox" id="red-auto" class="rounded accent-teal mt-0.5" ${est && est.autoInicio ? 'checked' : ''}><span>Encender el servidor automáticamente al abrir FacturaK</span></label>
      <label class="flex items-start gap-2 text-xs text-dark333 mt-2 cursor-pointer"><input type="checkbox" id="red-web" class="rounded accent-teal mt-0.5" ${est && est.accesoWeb ? 'checked' : ''}><span>Permitir abrir FacturaK desde el navegador de otro equipo (<span class="font-mono">http://IP:puerto/app/</span>)</span></label>
      <div class="mt-3">${btn('red-guardar-cfg', 'Guardar ajustes', 's')}</div>`);
    if (!on) return h;

    const urlsHtml = (est.urls || []).map((u) => `<div class="flex items-center justify-between gap-2 py-1.5 border-b border-gray-100 text-sm"><span class="font-mono">${esc(u.url)}</span><span class="flex items-center gap-2">${badge(esc(u.tipo), u.tipo === 'LAN')}<button type="button" data-copiar="${esc(u.url)}" class="text-xs text-primary font-semibold">Copiar</button></span></div>`).join('') || '<p class="text-xs text-accent">No se detectó ninguna red. Conecta esta PC a un Wi-Fi o cable.</p>';
    let qrSvg = ''; try { qrSvg = window.FKQR.toSVG(est.qr, { px: 210, ecl: 'M' }); } catch (_) { qrSvg = '<p class="text-xs text-accent">No se pudo dibujar el QR</p>'; }
    h += card('📱 Vincular un dispositivo', `
      <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center">
        <div style="background:#fff;padding:8px;border:1px solid #E5E7EB;border-radius:12px;line-height:0">${qrSvg}</div>
        <div style="flex:1;min-width:220px">
          <div class="text-xs text-greym mb-1">Código de vinculación (un solo uso, vence en <b id="red-cuenta">—</b>)</div>
          <div id="red-codigo" class="font-mono font-bold text-dark333" style="font-size:34px;letter-spacing:6px">${est.codigo ? esc(est.codigo.valor) : '------'}</div>
          <div class="mt-2">${btn('red-codigo-nuevo', 'Generar código nuevo', 's')}</div>
          <ol class="text-xs text-greym leading-relaxed mt-3" style="list-style:decimal;padding-left:18px">
            <li>En el celular o la otra PC abre FacturaK y toca <b>“Conectar a una PC central”</b> (pantalla de inicio).</li>
            <li>Escanea este QR, o escribe la dirección y el código.</li>
            <li>Entra con tu usuario de siempre: los usuarios y roles son los de esta PC.</li>
          </ol>
        </div>
      </div>
      <div class="mt-4 text-xs font-semibold text-greym">Direcciones de esta PC en la red local</div>${urlsHtml}`);

    const t = est.tunel || {};
    const tunelEstado = t.estado === 'activo' ? badge('● Activo', true) : t.estado === 'iniciando' ? badge('Iniciando… (la 1.ª vez puede tardar)', false) : t.estado === 'error' ? `<span style="font-size:11px;font-weight:700;color:#B91C1C">Error</span>` : badge('Apagado', false);
    h += card('🌐 Acceso desde cualquier red (Internet)', `
      <p class="text-xs text-greym leading-relaxed mb-3">Si el celular está con datos móviles o fuera del local, un <b>túnel seguro HTTPS</b> expone el servidor sin abrir puertos en el router. Cuando el dispositivo está en la red local se conecta por Wi-Fi automáticamente; si no, usa el túnel.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">
        <div><label class="text-xs font-semibold text-greym">Túnel</label>
          <select id="red-tunel" class="input-field">
            <option value="ninguno" ${t.tipo === 'ninguno' ? 'selected' : ''}>Ninguno (solo red local)</option>
            <option value="cloudflare" ${t.tipo === 'cloudflare' ? 'selected' : ''}>Cloudflare — gratis, sin cuenta (recomendado)</option>
            <option value="localtunnel" ${t.tipo === 'localtunnel' ? 'selected' : ''}>LocalTunnel — gratis, sin cuenta</option>
            <option value="ngrok" ${t.tipo === 'ngrok' ? 'selected' : ''}>ngrok — requiere cuenta y ngrok.exe (dirección fija gratis)</option>
            <option value="fija" ${t.tipo === 'fija' ? 'selected' : ''}>Dirección fija propia (Tailscale, Cloudflare con dominio, DDNS…)</option>
          </select></div>
        <div id="red-ngrok-dom-wrap" class="${t.tipo === 'ngrok' ? '' : 'hidden'}"><label class="text-xs font-semibold text-greym">Dominio fijo de ngrok (opcional)</label><input id="red-ngrok-dominio" type="text" class="input-field" value="${esc(t.ngrokDominio || '')}" placeholder="mi-negocio.ngrok-free.app"></div>
        <div id="red-fija-wrap" class="${t.tipo === 'fija' ? '' : 'hidden'}"><label class="text-xs font-semibold text-greym">Dirección fija</label><input id="red-fija-url" type="text" class="input-field" value="${esc(t.urlFija || '')}" placeholder="https://caja.midominio.com"></div>
        <div id="red-ngrok-wrap" class="${t.tipo === 'ngrok' ? '' : 'hidden'}"><label class="text-xs font-semibold text-greym">Authtoken de ngrok ${t.tieneToken ? '(guardado)' : ''}</label><input id="red-ngrok-token" type="password" class="input-field" placeholder="${t.tieneToken ? '••••••••' : 'pégalo aquí'}"></div>
      </div>
      <div class="flex items-center gap-3 flex-wrap mt-3">${tunelEstado}${t.estado === 'error' || t.estado === 'activo' ? btn('red-tunel-reintentar', 'Reiniciar túnel', 's') : ''}</div>
      ${t.url ? `<div class="flex items-center justify-between gap-2 mt-2 text-sm"><span class="font-mono" style="word-break:break-all">${esc(t.url)}</span><button type="button" data-copiar="${esc(t.url)}" class="text-xs text-primary font-semibold">Copiar</button></div><p class="text-[11px] text-greym mt-1">Esta dirección ya va dentro del QR. Los túneles gratuitos cambian de dirección cada vez que se encienden: vuelve a escanear el QR si cambia.</p>` : ''}
      ${t.error ? `<p class="text-xs text-accent mt-2">${esc(t.error)}</p>` : ''}
      <p class="text-[11px] text-greym leading-relaxed mt-3"><b>Dirección que no cambia:</b> la URL de Cloudflare/LocalTunnel cambia cada vez que se reinicia el túnel (los equipos ya vinculados la aprenden solos mientras estén conectados). Para una URL permanente usa ngrok con dominio fijo o “Dirección fija”. <b>Tailscale:</b> si instalas Tailscale en esta PC y en el celular, su dirección (100.x.x.x) aparece arriba como “Tailscale” y funciona desde cualquier red sin túnel.</p>`);

    const devs = (est.dispositivos || []);
    h += card('🔐 Dispositivos vinculados', devs.length ? `<div>${devs.map((d) => `
      <div class="flex items-center justify-between gap-3 py-2 border-b border-gray-100">
        <div><div class="text-sm font-semibold text-dark333">${esc(d.nombre)} ${d.revocado ? badge('Revocado', false) : ''}</div>
          <div class="text-[11px] text-greym">${esc(d.plataforma || '')} · vinculado ${fechaCorta(d.creado)} · visto ${fechaCorta(d.ultimoVisto)}${d.ip ? ' · ' + esc(d.ip) : ''}</div></div>
        <div>${d.revocado ? `<button type="button" data-olvidar="${d.id}" class="text-xs text-greym font-semibold">Quitar de la lista</button>` : `<button type="button" data-revocar="${d.id}" class="text-xs text-accent font-bold">Desvincular</button>`}</div>
      </div>`).join('')}</div>` : '<p class="text-xs text-greym">Aún no hay dispositivos vinculados.</p>');
    return h;
  }

  function vistaCliente() {
    const s = R.estado, c = R.cfg;
    return card('🔗 Conectado a una PC central', `
      <div class="text-sm text-dark333 mb-1"><b>${esc(c.nombre || 'PC Central')}</b></div>
      <div class="flex items-center gap-2 flex-wrap mb-3">${s.autorizado ? (s.conectado ? badge('● En línea', true) : badge('○ Sin conexión', false)) : '<span style="font-size:11px;font-weight:700;color:#B91C1C">⛔ Dispositivo desvinculado por la PC central</span>'}
        ${s.sucio ? badge('Cambios en cola', false) : badge('Todo sincronizado', true)}</div>
      <div class="text-xs text-greym leading-relaxed mb-3">
        Conexión: <span class="font-mono">${esc(s.url || '—')}</span><br>
        Última sincronización: ${fechaCorta(s.ultima)}<br>
        ${s.error ? `<span class="text-accent">${esc(s.error)}</span><br>` : ''}
        Sin conexión puedes seguir vendiendo: los cambios quedan guardados en este equipo y se envían solos al volver la conexión.</div>
      <div class="flex gap-2 flex-wrap">${btn('red-sync-ahora', 'Sincronizar ahora')}${btn('red-desvincular', 'Desvincular de la PC central', 'd')}</div>`);
  }

  function vistaLocal() {
    return card('Este equipo funciona solo', `
      <p class="text-xs text-greym leading-relaxed mb-3">Aquí los datos viven solo en este equipo. Puedes vincularlo a otra PC central${puedeServir ? ' o convertirlo en la central' : ''}.</p>
      <div class="flex gap-2 flex-wrap">${btn('red-abrir-vincular', '🔗 Conectar a una PC central', 's')}</div>`);
  }

  async function pintar() {
    const c = contenedor(); if (!c) return;
    if (puedeServir && !R.cfg.token) { try { est = await API.red.estado(); } catch (_) { est = null; } }
    let h = `<div class="max-w-2xl mx-auto">`;
    if (R.modo === 'cliente') h += vistaCliente();
    else {
      if (puedeServir) h += vistaServidor(); else h += vistaLocal();
      if (puedeServir && !(est && est.encendido)) h += vistaLocal();
    }
    h += `<p class="text-[11px] text-greym leading-relaxed px-1">🔒 La conexión dentro del local viaja sin cifrar (HTTP); úsala solo en tu red de confianza. Por Internet el túnel usa HTTPS. Cada dispositivo vinculado recibe una clave propia que puedes revocar.</p></div>`;
    c.innerHTML = h;
    enlazar();
    pintarPill(); cuenta();
  }
  FK.render.red = pintar;

  function cuenta() {
    clearInterval(reloj);
    const f = () => {
      const e = $('red-cuenta'); if (!e || !est || !est.codigo) { clearInterval(reloj); return; }
      const ms = est.codigo.vence - Date.now();
      if (ms <= 0) { clearInterval(reloj); if (FK.tabActual() === 'red') pintar(); return; }
      e.textContent = `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
    };
    f(); reloj = setInterval(f, 1000);
  }

  function enlazar() {
    const c = contenedor();
    const on = (id, f) => { const e = $(id); if (e) e.onclick = f; };
    c.querySelectorAll('[data-copiar]').forEach((b) => { b.onclick = () => copiar(b.dataset.copiar); });
    c.querySelectorAll('[data-revocar]').forEach((b) => { b.onclick = async () => { if (await FK.confirmar('El dispositivo perderá el acceso de inmediato y tendrá que vincularse otra vez.', { titulo: 'Desvincular dispositivo', ok: 'Desvincular', peligro: true })) { est = await API.red.revocar(b.dataset.revocar); pintar(); } }; });
    c.querySelectorAll('[data-olvidar]').forEach((b) => { b.onclick = async () => { est = await API.red.olvidar(b.dataset.olvidar); pintar(); }; });
    on('red-encender', async () => {
      const m = $('red-msg'); m.textContent = 'Encendiendo…';
      const r = await R.activarHost();
      if (!r.ok) { m.textContent = ''; return FK.toast(r.error || 'No se pudo encender el servidor', 'error'); }
      FK.toast('Servidor encendido'); pintar();
    });
    on('red-apagar', async () => {
      if (!(await FK.confirmar('Los dispositivos vinculados dejarán de sincronizar hasta que lo vuelvas a encender (los celulares siguen funcionando sin conexión y se ponen al día después).', { titulo: 'Apagar servidor', ok: 'Apagar' }))) return;
      await R.desactivarHost(); FK.toast('Servidor apagado'); pintar();
    });
    on('red-guardar-cfg', async () => {
      const r = await API.red.configurar({ nombre: $('red-nombre').value, puerto: Number($('red-puerto').value), autoInicio: $('red-auto').checked, accesoWeb: $('red-web').checked });
      if (!r.ok) return FK.toast(r.error || 'No se pudo guardar', 'error');
      est = r.estado; FK.toast('Ajustes guardados'); pintar();
    });
    on('red-codigo-nuevo', async () => { est = await API.red.codigoNuevo(); pintar(); });
    const sel = $('red-tunel');
    if (sel) sel.onchange = async () => {
      $('red-ngrok-wrap').classList.toggle('hidden', sel.value !== 'ngrok');
      $('red-ngrok-dom-wrap').classList.toggle('hidden', sel.value !== 'ngrok');
      $('red-fija-wrap').classList.toggle('hidden', sel.value !== 'fija');
      if (sel.value === 'fija' && !(est.tunel && est.tunel.urlFija)) return;   // espera la dirección
      if (sel.value === 'ngrok' && !(est.tunel && est.tunel.tieneToken) && !$('red-ngrok-token').value) return;   // espera el token
      const tok = $('red-ngrok-token') && $('red-ngrok-token').value;
      const r = await API.red.configurar({ tunel: { tipo: sel.value, ...(tok ? { ngrokToken: tok } : {}) } });
      est = r.estado || est; pintar();
    };
    const tk = $('red-ngrok-token');
    if (tk) tk.onchange = async () => { const r = await API.red.configurar({ tunel: { tipo: 'ngrok', ngrokToken: tk.value } }); est = r.estado || est; pintar(); };
    const dom = $('red-ngrok-dominio');
    if (dom) dom.onchange = async () => { const r = await API.red.configurar({ tunel: { tipo: 'ngrok', ngrokDominio: dom.value } }); est = r.estado || est; pintar(); };
    const fj = $('red-fija-url');
    if (fj) fj.onchange = async () => { const r = await API.red.configurar({ tunel: { tipo: 'fija', urlFija: fj.value } }); est = r.estado || est; pintar(); };
    on('red-tunel-reintentar', async () => { est = await API.red.reintentarTunel(); pintar(); });
    on('red-sync-ahora', async () => { await R.sincronizarAhora(); pintar(); });
    on('red-desvincular', async () => {
      if (!(await FK.confirmar('Este equipo dejará de sincronizar con la PC central y volverá a su modo local. Los cambios que no se hayan enviado se perderán.', { titulo: 'Desvincular', ok: 'Desvincular', peligro: true }))) return;
      await R.desvincular(); location.reload();
    });
    on('red-abrir-vincular', abrirVincular);
  }

  // ------------------------------------------------------------------ ventana "Conectar a una PC central"
  function crearModalVincular() {
    if ($('modal-red-vincular')) return;
    const d = document.createElement('div');
    d.innerHTML = `
    <div id="modal-red-vincular" class="modal-overlay hidden" style="z-index:200"><div class="modal-card animate-slideUp !max-w-md">
      <div class="flex items-center justify-between mb-2"><h3 class="text-lg font-bold text-dark333">🔗 Conectar a una PC central</h3>
        <button class="modal-close text-greym hover:text-accent text-xl leading-none">&times;</button></div>
      <p class="text-xs text-greym leading-relaxed mb-3">En la PC central abre <b>Red y dispositivos</b> y enciende el servidor. Luego escanea su QR o escribe sus datos.</p>
      <button type="button" id="rv-escanear" class="hidden w-full bg-primary text-white font-semibold py-3 rounded-xl mb-3">📷 Escanear código QR</button>
      <div class="text-[11px] text-greym text-center mb-2" id="rv-o">— o escríbelo a mano —</div>
      <div class="flex flex-col gap-2">
        <div><label class="text-xs font-semibold text-greym">Dirección de la PC central</label><input id="rv-url" class="input-field" placeholder="192.168.1.50:8080  ·  o la dirección https del túnel" autocapitalize="off" autocorrect="off"></div>
        <div><label class="text-xs font-semibold text-greym">Código de 6 dígitos</label><input id="rv-codigo" class="input-field font-mono" inputmode="numeric" maxlength="6" placeholder="123456" style="letter-spacing:4px"></div>
        <div><label class="text-xs font-semibold text-greym">Nombre de este dispositivo</label><input id="rv-nombre" class="input-field" maxlength="40" placeholder="Celular de Ana"></div>
      </div>
      <p id="rv-msg" class="text-xs text-accent mt-2" style="min-height:16px"></p>
      <p class="text-[11px] text-greym leading-relaxed mt-1">Al vincular se descargan los datos de la PC central. Los datos que ya tenga este equipo no se borran: vuelven si lo desvinculas.</p>
      <div class="flex gap-2 mt-3"><button type="button" class="modal-close flex-1 bg-gray-100 text-dark333 font-semibold py-2.5 rounded-xl">Cancelar</button>
        <button type="button" id="rv-ok" class="flex-1 bg-teal text-white font-bold py-2.5 rounded-xl">Vincular</button></div>
    </div></div>`;
    document.body.appendChild(d.firstElementChild);
    $('rv-nombre').value = esAndroid ? 'Celular Android' : (navigator.userAgent.includes('Windows') ? 'PC secundaria' : 'Dispositivo');
    const msg = (t) => { $('rv-msg').textContent = t || ''; };
    let datosQR = null;
    const hayCamara = !!(API && API.escanearCodigo);
    if (hayCamara) $('rv-escanear').classList.remove('hidden');
    $('rv-escanear').onclick = async () => {
      msg('');
      try {
        const txt = await API.escanearCodigo();
        if (!txt) return;
        datosQR = R.interpretarQR(txt);
        $('rv-url').value = [...(datosQR.urls || []), datosQR.tunel].filter(Boolean).join(' , ');
        $('rv-codigo').value = datosQR.codigo;
        if (datosQR.nombre) msg('');
        $('rv-ok').click();                          // el QR trae todo: se vincula directamente
      } catch (e) { msg(e.message); }
    };
    $('rv-ok').onclick = async () => {
      msg('');
      const codigo = $('rv-codigo').value.trim();
      if (!/^\d{6}$/.test(codigo)) return msg('El código tiene 6 dígitos.');
      let urls = [], tunel = '';
      if (datosQR && datosQR.codigo === codigo) { urls = datosQR.urls || []; tunel = datosQR.tunel || ''; }
      else { const partes = $('rv-url').value.split(/[,\s]+/).filter(Boolean); urls = partes.filter((x) => !/^https:\/\//i.test(x)); tunel = partes.find((x) => /^https:\/\//i.test(x)) || ''; }
      const b = $('rv-ok'); b.disabled = true; b.textContent = 'Conectando…';
      try {
        await R.vincular({ urls, tunel, codigo, nombre: $('rv-nombre').value.trim() || 'Dispositivo', servidorId: datosQR && datosQR.id });
        FK.toast('Vinculado ✅ Descargando datos…');
        setTimeout(() => location.reload(), 600);
      } catch (e) { msg(e.message); b.disabled = false; b.textContent = 'Vincular'; }
    };
  }
  function abrirVincular() {
    crearModalVincular();
    $('rv-msg').textContent = ''; $('rv-codigo').value = '';
    FK.openModal('modal-red-vincular');
  }
  FK.red.abrirVincular = abrirVincular;

  // ------------------------------------------------------------------ botón en la pantalla de inicio + avisos
  function crearFlotante() {
    if ($('red-flotante')) return;
    const b = document.createElement('button');
    b.id = 'red-flotante'; b.type = 'button'; b.className = 'hidden';
    b.textContent = '🔗 Conectar a una PC central';
    b.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom));z-index:95;background:rgba(255,255,255,.95);color:#004E98;font-weight:700;font-size:13px;padding:10px 18px;border-radius:999px;border:1px solid #D1D5DB;box-shadow:0 4px 14px rgba(0,0,0,.18);cursor:pointer;white-space:nowrap';
    b.onclick = abrirVincular;
    document.body.appendChild(b);
    const aviso = document.createElement('div');
    aviso.id = 'red-aviso'; aviso.className = 'hidden';
    aviso.style.cssText = 'position:fixed;left:12px;right:12px;top:calc(10px + env(safe-area-inset-top));z-index:96;background:#FEF3C7;color:#92400E;border:1px solid #F59E0B;border-radius:14px;padding:12px 14px;font-size:13px;box-shadow:0 4px 14px rgba(0,0,0,.18)';
    document.body.appendChild(aviso);
  }
  function actualizarFlotante() {
    const auth = $('auth-screen'), b = $('red-flotante'), a = $('red-aviso');
    if (!b) return;
    const enAuth = auth && !auth.classList.contains('hidden');
    b.classList.toggle('hidden', !(enAuth && R.modo !== 'cliente' && !R.host));
    if (FK.store && FK.store.errorRed) {
      a.innerHTML = `<b>No se pudieron bajar los datos de la PC central.</b><br>${esc(FK.store.errorRed)}<div style="margin-top:8px;display:flex;gap:8px"><button type="button" id="red-av-reintentar" style="background:#004E98;color:#fff;border:0;border-radius:10px;padding:7px 14px;font-weight:700">Reintentar</button><button type="button" id="red-av-desv" style="background:#fff;border:1px solid #D1D5DB;border-radius:10px;padding:7px 14px;font-weight:700">Desvincular</button></div>`;
      a.classList.remove('hidden');
      $('red-av-reintentar').onclick = () => location.reload();
      $('red-av-desv').onclick = async () => { await R.desvincular(); location.reload(); };
    } else if (R.modo === 'cliente' && !R.estado.autorizado) {
      a.innerHTML = `<b>Este dispositivo fue desvinculado por la PC central.</b><div style="margin-top:8px"><button type="button" id="red-av-desv2" style="background:#004E98;color:#fff;border:0;border-radius:10px;padding:7px 14px;font-weight:700">Volver a vincular</button></div>`;
      a.classList.remove('hidden');
      $('red-av-desv2').onclick = async () => { await R.desvincular(); location.reload(); };
    } else a.classList.add('hidden');
  }

  // ------------------------------------------------------------------ eventos
  if (puedeServir) {
    API.red.onEstado((e) => { est = e; pintarPill(); if (FK.tabActual && FK.tabActual() === 'red') pintar(); });
  }
  R.alCambiarEstado(() => { pintarPill(); actualizarFlotante(); if (FK.tabActual && FK.tabActual() === 'red' && R.modo === 'cliente') pintar(); });

  function iniciar() {
    crearPill(); crearFlotante(); crearModalVincular();
    pintarPill(); actualizarFlotante();
    const auth = $('auth-screen');
    if (auth) new MutationObserver(actualizarFlotante).observe(auth, { attributes: true, attributeFilter: ['class'] });
    setInterval(() => { pintarPill(); actualizarFlotante(); }, 2000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(iniciar, 50)); else setTimeout(iniciar, 50);
})();
