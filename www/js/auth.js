// FacturaK v2 — Acceso: bienvenida, perfil, login, recuperación, rubro y registro de empresa.
// Cada vista secundaria tiene botón "Atrás" (flecha) y el registro muestra su progreso por pasos.
(function () {
  'use strict';
  const FK = window.FK;
  const $ = FK.$;
  let paso = 'landing';
  let rolElegido = null;
  let funcionesElegidas = new Set(); // funciones especializadas marcadas en el registro
  let modulosElegidos = new Set(['pos', 'inventario', 'termica', 'whatsapp', 'reportes', 'usuarios']); // módulos principales (todos marcados al inicio)

  const PANELES = { landing: 'auth-landing', rol: 'login-rol-selector', login: 'form-login', reset: 'reset-panel', categoria: 'categoria-selector', registro: 'form-registro' };
  const DISPLAY = { rol: 'grid' };
  const TEXTOS = {
    landing: ['Bienvenido a FacturaK', '¿Qué deseas hacer hoy?'],
    rol: ['Iniciar sesión', 'Selecciona tu perfil de acceso.'],
    login: ['Iniciar sesión', 'Ingresa tus credenciales para continuar.'],
    reset: ['Recuperar acceso', 'Restablece la contraseña de un usuario de tu empresa.'],
    categoria: ['Crea tu empresa', 'Elige los módulos de FacturaK que quieres usar en tu negocio.'],
    registro: ['Datos de tu empresa', 'Completa la información y define el acceso del administrador.']
  };
  const ATRAS = { rol: ['landing', 'Inicio'], login: ['rol', 'Perfiles'], reset: ['login', 'Iniciar sesión'], categoria: ['landing', 'Inicio'], registro: ['categoria', 'Rubros'] };

  function msg(tipo, texto) {
    const err = $('auth-error'), ok = $('auth-success');
    FK.hide(err); FK.hide(ok);
    if (!texto) return;
    const el = tipo === 'error' ? err : ok;
    el.textContent = texto; FK.show(el);
  }

  function irA(p) {
    paso = p;
    Object.values(PANELES).forEach(id => { const el = $(id); el.classList.add('hidden'); el.classList.remove('flex', 'grid'); });
    msg();
    const [t, sub] = TEXTOS[p];
    $('auth-title').textContent = t;
    $('auth-subtitle').textContent = p === 'landing' && !FK.store.data.empresas.length
      ? 'Aún no hay empresas registradas en este equipo: crea la tuya para comenzar.' : sub;
    FK.show(PANELES[p], DISPLAY[p] || 'flex');
    // Barra superior con flecha de regreso y pasos del registro
    const top = $('auth-topbar');
    top.classList.toggle('hidden', p === 'landing'); top.classList.toggle('flex', p !== 'landing');
    if (ATRAS[p]) $('btn-volver-texto').textContent = ATRAS[p][1];
    const pasos = $('auth-pasos');
    pasos.classList.toggle('hidden', !['categoria', 'registro'].includes(p));
    document.querySelectorAll('#auth-pasos .paso').forEach(el => {
      const n = +el.dataset.paso, actual = p === 'categoria' ? 1 : 2;
      el.classList.toggle('activo', n === actual); el.classList.toggle('hecho', n < actual);
    });

    if (p === 'login') {
      $('login-rol-badge').textContent = FK.rolNombre(rolElegido);
      const cod = $('login-codigo-empresa');
      if (!cod.value) cod.value = FK.store.data.ultimoCodigo || '';
      FK.enfocar(cod.value ? 'login-usuario' : 'login-codigo-empresa');
    }
    if (p === 'reset') {
      $('reset-codigo-empresa').value = $('login-codigo-empresa').value;
      $('reset-usuario').value = $('login-usuario').value;
      FK.enfocar($('reset-codigo-empresa').value ? 'reset-usuario' : 'reset-codigo-empresa');
    }
    if (p === 'categoria') construirFunciones();
    if (p === 'registro') {
      $('reg-categoria-badge').textContent = modulosElegidos.size + ' módulo(s)' + (funcionesElegidas.size ? ' + ' + funcionesElegidas.size + ' función(es) especializada(s)' : '');
      FK.enfocar('reg-empresa');
    }
    $('auth-screen').scrollTop = 0;
  }

  // Selección libre de funciones al crear la empresa (en vez de un rubro
  // fijo): cada tarjeta es un checkbox independiente, se puede marcar
  // cualquier combinación, y queda guardado como e.funcionesOverride —
  // editable después desde Ajustes > Datos de la empresa.
  function tarjeta(item, attr, activo) {
    return `
      <button type="button" ${attr}="${item.clave}" class="rubro-tile ${activo ? 'selected' : ''}">
        <span class="rubro-check"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg></span>
        <div class="rubro-icono"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${item.icono}"/></svg></div>
        <div class="font-bold text-sm text-dark333 pr-6 leading-tight">${FK.esc(item.label)}</div>
        <div class="text-[11px] text-greym leading-snug">${FK.esc(item.detalle || '')}</div>
      </button>`;
  }

  function construirFunciones() {
    $('categoria-grid').innerHTML = `
      <div>
        <div class="text-xs font-bold text-dark333 mb-2">Módulos principales</div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${FK.MODULOS.map(m => tarjeta(m, 'data-mod', modulosElegidos.has(m.clave))).join('')}</div>
      </div>
      <div>
        <div class="text-xs font-bold text-dark333 mb-0.5">Funciones especializadas <span class="font-normal text-greym">(opcional)</span></div>
        <div class="text-[11px] text-greym mb-2">Actívalas solo si tu negocio las necesita.</div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${FK.FUNCIONES_TOGGLEABLES.map(f => tarjeta(f, 'data-fn', funcionesElegidas.has(f.clave))).join('')}</div>
      </div>`;
  }


  function mostrarAuth() {
    FK.hide('app-shell'); FK.hide('caja-screen');
    FK.show('auth-screen', 'flex');
    $('form-login').reset();
    $('login-codigo-empresa').value = FK.store.data.ultimoCodigo || '';
    irA('landing');
  }
  FK.auth = { mostrar: mostrarAuth };

  function fuerzaClave(v) {
    let n = 0;
    if (v.length >= 6) n++; if (v.length >= 10) n++;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v)) n++; if (/\d/.test(v)) n++; if (/[^A-Za-z0-9]/.test(v)) n++;
    return Math.min(4, n);
  }

  function enlazar() {
    $('btn-landing-login').onclick = () => irA('rol');
    $('btn-landing-registro').onclick = () => irA('categoria');
    $('btn-volver-landing').onclick = () => irA((ATRAS[paso] || ['landing'])[0]);
    document.querySelectorAll('.login-rol-card').forEach(b => b.onclick = () => { rolElegido = b.dataset.rol; irA('login'); });
    $('btn-cambiar-perfil-login').onclick = () => irA('rol');
    $('link-olvide-password').onclick = (e) => { e.preventDefault(); irA('reset'); };

    // Mostrar / ocultar contraseñas
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ojo]'); if (!b) return;
      const inp = $(b.dataset.ojo); inp.type = inp.type === 'password' ? 'text' : 'password'; inp.focus();
    });

    $('form-login').onsubmit = async (e) => {
      e.preventDefault();
      const codigo = $('login-codigo-empresa').value.trim().toUpperCase();
      const usuario = $('login-usuario').value.trim().toLowerCase();
      const pass = $('login-password').value;
      const emp = FK.store.data.empresas.find(x => x.codigo === codigo);
      if (!emp) return msg('error', 'No existe ninguna empresa con ese código.');
      const u = emp.usuarios.find(x => x.usuario.toLowerCase() === usuario);
      if (!u || (await FK.hash(pass, u.sal)) !== u.hash) return msg('error', 'Usuario o contraseña incorrectos.');
      if (!u.activo) return msg('error', 'Este perfil está deshabilitado. Contacta al administrador.');
      if (u.rol !== rolElegido) return msg('error', `Este usuario tiene el perfil "${FK.rolNombre(u.rol)}", no "${FK.rolNombre(rolElegido)}".`);
      FK.store.data.ultimoCodigo = codigo;
      FK.store.save();
      $('login-password').value = '';
      FK.app.entrar(emp, u);
    };

    $('btn-reset').onclick = async () => {
      const codigo = $('reset-codigo-empresa').value.trim().toUpperCase();
      const usuario = $('reset-usuario').value.trim().toLowerCase();
      const nueva = $('reset-nueva-password').value;
      const maestra = $('reset-password-maestra').value;
      if (!codigo || !usuario || !nueva || !maestra) return msg('error', 'Completa todos los campos para restablecer.');
      if (nueva.length < 3) return msg('error', 'La nueva contraseña debe tener al menos 3 caracteres.');
      const emp = FK.store.data.empresas.find(x => x.codigo === codigo);
      if (!emp) return msg('error', 'No existe ninguna empresa con ese código.');
      if ((await FK.hash(maestra, emp.salMaestra)) !== emp.hashMaestra) return msg('error', 'La contraseña maestra no es correcta.');
      const u = emp.usuarios.find(x => x.usuario.toLowerCase() === usuario);
      if (!u) return msg('error', 'Ese usuario no existe en la empresa.');
      u.sal = FK.nuevaSal(); u.hash = await FK.hash(nueva, u.sal);
      FK.store.saveNow();
      ['reset-nueva-password', 'reset-password-maestra'].forEach(id => $(id).value = '');
      $('login-codigo-empresa').value = codigo; $('login-usuario').value = u.usuario;
      irA(rolElegido ? 'login' : 'rol');
      msg('ok', `Contraseña de "${u.usuario}" restablecida. Ya puedes iniciar sesión.`);
    };

    $('categoria-grid').onclick = (e) => {
      const b = e.target.closest('[data-fn], [data-mod]'); if (!b) return;
      const conjunto = b.dataset.mod ? modulosElegidos : funcionesElegidas;
      const clave = b.dataset.mod || b.dataset.fn;
      if (conjunto.has(clave)) conjunto.delete(clave); else conjunto.add(clave);
      b.classList.toggle('selected', conjunto.has(clave));
    };
    $('btn-categoria-continuar').onclick = () => {
      if (!modulosElegidos.size) return FK.toast('Elige al menos un módulo principal', 'error');
      irA('registro');
    };
    $('btn-cambiar-categoria').onclick = () => irA('categoria');

    $('reg-logo').onchange = async () => {
      const prev = $('reg-logo-preview');
      try { const img = await FK.leerImagen($('reg-logo').files[0], 200); if (img) prev.innerHTML = `<img src="${img}" alt="">`; }
      catch (_) { msg('error', 'El logo no es una imagen válida.'); }
    };
    $('reg-password').oninput = () => {
      const n = fuerzaClave($('reg-password').value), barra = $('reg-fuerza');
      barra.style.width = ($('reg-password').value ? Math.max(1, n) * 25 : 0) + '%';
      barra.style.background = ['rgb(var(--c-peligro))', 'rgb(var(--c-peligro))', '#F59E0B', 'rgb(var(--c-secundario))', 'rgb(var(--c-secundario))'][n];
    };

    $('form-registro').onsubmit = async (e) => {
      e.preventDefault();
      const nombre = $('reg-empresa').value.trim();
      const usuario = $('reg-usuario').value.trim().toLowerCase();
      const pass = $('reg-password').value;
      const maestra = $('reg-password-maestra').value;
      if (!nombre || !usuario || !pass || !maestra) return msg('error', 'Completa los campos obligatorios (*).');
      if (!/^[a-z0-9._-]{3,}$/.test(usuario)) return msg('error', 'El usuario debe tener al menos 3 caracteres (letras, números, punto o guion).');
      if (pass.length < 4) return msg('error', 'La contraseña debe tener al menos 4 caracteres.');
      if (maestra.length < 6) return msg('error', 'La contraseña maestra debe tener al menos 6 caracteres.');
      if (maestra === pass) return msg('error', 'La contraseña maestra debe ser distinta a la del administrador.');
      let logo = null;
      try { logo = await FK.leerImagen($('reg-logo').files[0], 480); } catch (_) { return msg('error', 'El logo no es una imagen válida.'); }
      const data = FK.store.data;
      const salM = FK.nuevaSal();
      const emp = FK.normalizarEmpresa({
        id: FK.uid(), codigo: FK.generarCodigoEmpresa(data), nombre, rif: $('reg-rif').value.trim(),
        telefono: $('reg-telefono').value.trim(),
        // Ya no se elige un rubro fijo: la empresa arranca en "general" y
        // trae activadas, una por una, las funciones que se marcaron en el
        // paso anterior — editable después desde Ajustes.
        categoria: 'general',
        funcionesOverride: Object.fromEntries([...funcionesElegidas].map(k => [k, true])),
        modulos: Object.fromEntries(FK.MODULOS.map(m => [m.clave, modulosElegidos.has(m.clave)])),
        logo, salMaestra: salM, hashMaestra: await FK.hash(maestra, salM),
        creada: new Date().toISOString()
      });
      const admin = await FK.crearUsuario(usuario, pass, 'admin');
      emp.usuarios.push(admin);
      data.empresas.push(emp);
      data.ultimoCodigo = emp.codigo;
      FK.store.saveNow();
      $('form-registro').reset(); $('reg-fuerza').style.width = '0';
      $('reg-logo-preview').innerHTML = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>';
      document.querySelectorAll('#auth-pasos .paso').forEach(el => { el.classList.remove('activo'); el.classList.add('hecho'); });
      $('codigo-empresa-valor').textContent = emp.codigo;
      FK.openModal('modal-codigo-empresa');
      $('btn-copiar-codigo-empresa').onclick = async () => {
        const ok = await FK.copiar(emp.codigo);
        $('btn-copiar-codigo-empresa').textContent = ok ? '¡Copiado!' : 'Cópialo a mano';
        setTimeout(() => $('btn-copiar-codigo-empresa').textContent = 'Copiar código', 1800);
      };
      $('btn-continuar-codigo-empresa').onclick = () => {
        FK.closeModal('modal-codigo-empresa');
        funcionesElegidas = new Set();
        modulosElegidos = new Set(['pos', 'inventario', 'termica', 'whatsapp', 'reportes', 'usuarios']);
        FK.app.entrar(emp, admin);
      };
    };
  }

  async function iniciar() {
    const t0 = Date.now();
    await FK.store.load();
    if (FK.tema) FK.tema.aplicarActual();
    enlazar();
    FK.app.init();
    if (FK.store.recuperado) {
      const r = FK.store.recuperado;
      setTimeout(() => FK.toast(`Se recuperaron tus datos desde: ${r.origen} (${r.detalle}).`), 1800);
    }
    const espera = Math.max(0, 1100 - (Date.now() - t0));
    setTimeout(() => {
      mostrarAuth();
      const s = $('splash-screen');
      s.style.opacity = '0';
      setTimeout(() => s.remove(), 460);
    }, espera);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else setTimeout(iniciar, 0);
})();
