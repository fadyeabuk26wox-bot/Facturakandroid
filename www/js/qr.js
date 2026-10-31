// Generador de códigos QR (modo byte, corrección L/M), sin dependencias.
// Basado en el algoritmo estándar ISO/IEC 18004 (estructura inspirada en qrcodegen de Nayuki, MIT).
(function (global) {
  'use strict';
  const ECC_PER_BLOCK = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28]
  };
  const NUM_BLOCKS = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49]
  };
  const FORMAT_BITS = { L: 1, M: 0 };

  function rawModules(ver) {
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const na = Math.floor(ver / 7) + 2;
      r -= (25 * na - 10) * na - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  function dataCodewords(ver, ecl) {
    return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver];
  }
  function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }
  function rsDivisor(degree) {
    const res = new Array(degree).fill(0);
    res[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < res.length; j++) {
        res[j] = gfMul(res[j], root);
        if (j + 1 < res.length) res[j] ^= res[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return res;
  }
  function rsRemainder(data, divisor) {
    const res = new Array(divisor.length).fill(0);
    for (const b of data) {
      const factor = b ^ res.shift();
      res.push(0);
      divisor.forEach((coef, i) => { res[i] ^= gfMul(coef, factor); });
    }
    return res;
  }
  function utf8Bytes(str) {
    return Array.from(new TextEncoder().encode(str));
  }

  function encode(text, eclPref, forceMask) {
    const ecl = eclPref === 'L' ? 'L' : 'M';
    const bytes = utf8Bytes(text);
    let ver = 1;
    for (; ver <= 40; ver++) {
      const ccBits = ver <= 9 ? 8 : 16;
      const needed = 4 + ccBits + bytes.length * 8;
      if (needed <= dataCodewords(ver, ecl) * 8) break;
    }
    if (ver > 40) throw new Error('Texto demasiado largo para QR');

    // --- Flujo de bits ---
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(0x4, 4);
    push(bytes.length, ver <= 9 ? 8 : 16);
    bytes.forEach(b => push(b, 8));
    const capacity = dataCodewords(ver, ecl) * 8;
    push(0, Math.min(4, capacity - bits.length));
    push(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < capacity; pad ^= 0xEC ^ 0x11) push(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      data.push(b);
    }

    // --- Corrección de errores + intercalado ---
    const numBlocks = NUM_BLOCKS[ecl][ver];
    const eccLen = ECC_PER_BLOCK[ecl][ver];
    const rawCw = Math.floor(rawModules(ver) / 8);
    const numShort = numBlocks - rawCw % numBlocks;
    const shortLen = Math.floor(rawCw / numBlocks);
    const div = rsDivisor(eccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, div);
      if (i < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const finalCw = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((blk, j) => {
        if (i !== shortLen - eccLen || j >= numShort) finalCw.push(blk[i]);
      });
    }

    // --- Matriz ---
    const size = ver * 4 + 17;
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const fun = Array.from({ length: size }, () => new Array(size).fill(false));
    const setF = (x, y, dark) => { mod[y][x] = dark; fun[y][x] = true; };

    for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);

    const alignPos = (() => {
      if (ver === 1) return [];
      const na = Math.floor(ver / 7) + 2;
      const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2;
      const r = [6];
      for (let pos = size - 7; r.length < na; pos -= step) r.splice(1, 0, pos);
      return r;
    })();
    const na = alignPos.length;
    for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        setF(alignPos[i] + dx, alignPos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }

    const drawFormat = (mask) => {
      const d = (FORMAT_BITS[ecl] << 3) | mask;
      let rem = d;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((d << 10) | rem) ^ 0x5412;
      const bit = (i) => ((b >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) setF(8, i, bit(i));
      setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8));
      for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(i));
      setF(8, size - 8, true);
    };
    drawFormat(0);

    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const b = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const dark = ((b >>> i) & 1) !== 0;
        const a = size - 11 + i % 3, c = Math.floor(i / 3);
        setF(a, c, dark); setF(c, a, dark);
      }
    }

    // Colocar datos
    let bi = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!fun[y][x] && bi < finalCw.length * 8) {
            mod[y][x] = ((finalCw[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0;
            bi++;
          }
        }
      }
    }

    const maskFn = [
      (x, y) => (x + y) % 2 === 0,
      (x, y) => y % 2 === 0,
      (x) => x % 3 === 0,
      (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      (x, y) => x * y % 2 + x * y % 3 === 0,
      (x, y) => (x * y % 2 + x * y % 3) % 2 === 0,
      (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0
    ];
    const applyMask = (m) => {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
        if (!fun[y][x] && maskFn[m](x, y)) mod[y][x] = !mod[y][x];
    };
    const penalty = () => {
      let p = 0, dark = 0;
      for (let y = 0; y < size; y++) {
        let runX = 1, runY = 1;
        for (let x = 0; x < size; x++) {
          if (mod[y][x]) dark++;
          if (x > 0) {
            if (mod[y][x] === mod[y][x - 1]) { runX++; if (runX === 5) p += 3; else if (runX > 5) p++; } else runX = 1;
            if (mod[x][y] === mod[x - 1][y]) { runY++; if (runY === 5) p += 3; else if (runY > 5) p++; } else runY = 1;
          }
          if (x > 0 && y > 0) {
            const c = mod[y][x];
            if (c === mod[y - 1][x] && c === mod[y][x - 1] && c === mod[y - 1][x - 1]) p += 3;
          }
        }
      }
      // Regla 3: patrones parecidos a los localizadores (1:1:3:1:1 con margen claro)
      const pat = [1, 0, 1, 1, 1, 0, 1];
      const esPat = (get, i) => {
        for (let k = 0; k < 7; k++) if (get(i + k) !== !!pat[k]) return false;
        const claro = (a, b) => { for (let k = a; k < b; k++) { if (k < 0 || k >= size) continue; if (get(k)) return false; } return true; };
        return claro(i - 4, i) || claro(i + 7, i + 11);
      };
      for (let a = 0; a < size; a++) {
        for (let i = 0; i + 7 <= size; i++) {
          if (esPat((k) => mod[a][k], i)) p += 40;
          if (esPat((k) => mod[k][a], i)) p += 40;
        }
      }
      const total = size * size;
      p += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
      return p;
    };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(m); drawFormat(m);
      const p = penalty();
      if (p < bestP) { bestP = p; best = m; }
      applyMask(m);
    }
    if (forceMask != null) best = forceMask;
    applyMask(best); drawFormat(best);
    return { size, modules: mod, version: ver };
  }

  function toSVG(text, opts) {
    opts = opts || {};
    const q = encode(text, opts.ecl || 'M');
    const border = opts.border == null ? 2 : opts.border;
    const dim = q.size + border * 2;
    let path = '';
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++)
      if (q.modules[y][x]) path += `M${x + border},${y + border}h1v1h-1z`;
    const px = opts.px || 160;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  }

  global.FKQR = { encode, toSVG };
  if (typeof module !== 'undefined') module.exports = global.FKQR;
})(typeof window !== 'undefined' ? window : globalThis);
