// Gráfico de barras ligero sobre <canvas> (sin dependencias externas).
(function (global) {
  'use strict';
  function niceMax(v) {
    if (v <= 0) return 1;
    const exp = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / exp;
    const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return nf * exp;
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }

  function barChart(canvas, cfg) {
    const labels = cfg.labels || [];
    const values = (cfg.values || []).map(v => Number(v) || 0);
    const colors = cfg.colors || null;
    const tv = (n, def) => { const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v ? `rgb(${v.split(' ').join(',')})` : def; };
    const color = cfg.color || tv('--c-secundario', '#00B89F');
    const cTexto = tv('--c-muted', '#6B7280'), cLinea = tv('--c-borde', '#EEF0F3'), cValor = tv('--c-texto', '#333333');
    const fmt = cfg.format || (v => String(Math.round(v)));
    const fmtAxis = cfg.formatAxis || fmt;
    const parent = canvas.parentElement;
    const cssW = Math.max(200, parent.clientWidth);
    const cssH = Math.max(100, parent.clientHeight);
    const dpr = global.devicePixelRatio || 1;
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.font = '11px "Segoe UI", system-ui, sans-serif';

    const max = niceMax(Math.max(0, ...values));
    const ticks = 4;
    let padL = 0;
    for (let i = 0; i <= ticks; i++) padL = Math.max(padL, ctx.measureText(fmtAxis(max * i / ticks)).width);
    padL += 12;
    const padR = 8, padT = 18, padB = 26;
    const w = cssW - padL - padR, h = cssH - padT - padB;

    // Líneas guía
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= ticks; i++) {
      const y = padT + h - (h * i / ticks);
      ctx.strokeStyle = cLinea;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, Math.round(y) + .5); ctx.lineTo(padL + w, Math.round(y) + .5); ctx.stroke();
      ctx.fillStyle = cTexto;
      ctx.fillText(fmtAxis(max * i / ticks), padL - 6, y);
    }

    const n = values.length || 1;
    const slot = w / n;
    const bw = Math.max(4, Math.min(48, slot * 0.62));
    const every = Math.ceil(n / Math.max(1, Math.floor(w / 48)));
    ctx.textAlign = 'center';
    values.forEach((v, i) => {
      const x = padL + slot * i + (slot - bw) / 2;
      const bh = max ? (v / max) * h : 0;
      const y = padT + h - bh;
      ctx.fillStyle = colors ? colors[i % colors.length] : color;
      if (bh > 0) { roundRect(ctx, x, y, bw, bh, 4); ctx.fill(); }
      if (v > 0 && (n <= 14 || bw >= 22)) {
        ctx.fillStyle = cValor; ctx.textBaseline = 'bottom';
        ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(fmt(v), x + bw / 2, y - 3);
        ctx.font = '11px "Segoe UI", system-ui, sans-serif';
      }
      if (i % every === 0) {
        ctx.fillStyle = cTexto; ctx.textBaseline = 'top';
        ctx.fillText(String(labels[i] ?? ''), x + bw / 2, padT + h + 7);
      }
    });
  }

  global.FKChart = { barChart };
})(window);
