// Codificadores de animaciones de UN SOLO ARCHIVO: PNG animado (APNG) y GIF.
// Son funciones puras: reciben los cuadros ya dibujados y devuelven un Blob.
//
// - APNG: un .png que se mueve. Conserva la transparencia completa y todos los
//   colores. Se ve animado en navegadores (Chrome, Safari, Firefox); el visor
//   de imágenes de la Mac y After Effects lo muestran quieto.
// - GIF: se mueve en cualquier lado (Mac, WhatsApp, redes), pero tiene como
//   máximo 256 colores y la transparencia es de todo o nada.

// CRC-32: la suma de control que usan PNG y ZIP para detectar errores
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ================= APNG =================

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// un PNG → lista de chunks { type, data }
function readChunks(png) {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks = [];
  let p = 8;
  while (p < png.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(png[p + 4], png[p + 5], png[p + 6], png[p + 7]);
    chunks.push({ type, data: png.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
  }
  return chunks;
}

// arma un chunk PNG: largo + tipo + datos + CRC
function makeChunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

// pngs: un Uint8Array por cuadro (cada uno, un PNG completo del mismo tamaño).
// fps: cuadros por segundo. Devuelve un Blob "image/png" animado.
export function buildApng(pngs, fps) {
  if (!pngs.length) throw new Error("no hay cuadros");
  const first = readChunks(pngs[0]);
  const ihdr = first.find((c) => c.type === "IHDR").data;
  const w = new DataView(ihdr.buffer, ihdr.byteOffset).getUint32(0);
  const h = new DataView(ihdr.buffer, ihdr.byteOffset).getUint32(4);

  const parts = [new Uint8Array(PNG_SIGNATURE), makeChunk("IHDR", ihdr)];

  const actl = new DataView(new ArrayBuffer(8));
  actl.setUint32(0, pngs.length); // cantidad de cuadros
  actl.setUint32(4, 0); // 0 = se repite para siempre
  parts.push(makeChunk("acTL", new Uint8Array(actl.buffer)));

  let seq = 0; // numeración compartida por fcTL y fdAT
  pngs.forEach((png, i) => {
    const chunks = i === 0 ? first : readChunks(png);
    const hdr = chunks.find((c) => c.type === "IHDR").data;
    if (hdr.length !== ihdr.length || hdr.some((b, k) => b !== ihdr[k])) {
      throw new Error("los cuadros no tienen el mismo formato de imagen");
    }
    const idat = new Uint8Array(chunks.filter((c) => c.type === "IDAT").reduce((n, c) => n + c.data.length, 0));
    let o = 0;
    for (const c of chunks) if (c.type === "IDAT") (idat.set(c.data, o), (o += c.data.length));

    // fcTL: cómo se dibuja este cuadro (ocupa toda la imagen, dura 1/fps, reemplaza al anterior)
    const f = new DataView(new ArrayBuffer(26));
    f.setUint32(0, seq++);
    f.setUint32(4, w);
    f.setUint32(8, h);
    f.setUint32(12, 0); // x
    f.setUint32(16, 0); // y
    f.setUint16(20, 1); // duración: 1 ...
    f.setUint16(22, Math.max(1, Math.round(fps))); // ... dividido por fps (segundos)
    f.setUint8(24, 0); // dispose: no hace nada
    f.setUint8(25, 0); // blend: reemplaza (así los píxeles transparentes borran lo anterior)
    parts.push(makeChunk("fcTL", new Uint8Array(f.buffer)));

    if (i === 0) {
      parts.push(makeChunk("IDAT", idat)); // el primer cuadro es también la imagen "normal"
    } else {
      const fd = new Uint8Array(4 + idat.length);
      new DataView(fd.buffer).setUint32(0, seq++);
      fd.set(idat, 4);
      parts.push(makeChunk("fdAT", fd));
    }
  });

  parts.push(makeChunk("IEND", new Uint8Array(0)));
  return new Blob(parts, { type: "image/png" });
}

// ================= GIF =================

// Paleta de hasta maxColors colores que represente bien a los píxeles
// (algoritmo "median cut": se parte repetidamente la caja de colores más
// grande por la mitad del canal con más variación).
function medianCut(samples, maxColors) {
  // samples: Uint8Array con r,g,b,r,g,b…
  const n = samples.length / 3;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  let boxes = [{ lo: 0, hi: n }];

  const range = (b) => {
    let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
    for (let i = b.lo; i < b.hi; i++) {
      const k = idx[i] * 3;
      const r = samples[k], g = samples[k + 1], bl = samples[k + 2];
      if (r < rMin) rMin = r; if (r > rMax) rMax = r;
      if (g < gMin) gMin = g; if (g > gMax) gMax = g;
      if (bl < bMin) bMin = bl; if (bl > bMax) bMax = bl;
    }
    const dr = rMax - rMin, dg = gMax - gMin, db = bMax - bMin;
    const ch = dr >= dg && dr >= db ? 0 : dg >= db ? 1 : 2;
    return { ch, size: Math.max(dr, dg, db) };
  };

  while (boxes.length < maxColors) {
    // la caja con más variación y más de un píxel
    let best = -1, bestSize = 0, bestCh = 0;
    boxes.forEach((b, i) => {
      if (b.hi - b.lo < 2) return;
      const r = range(b);
      if (r.size * Math.sqrt(b.hi - b.lo) > bestSize) { bestSize = r.size * Math.sqrt(b.hi - b.lo); best = i; bestCh = r.ch; }
    });
    if (best < 0) break;
    const b = boxes[best];
    const part = Array.from(idx.subarray(b.lo, b.hi)).sort((x, y) => samples[x * 3 + bestCh] - samples[y * 3 + bestCh]);
    idx.set(part, b.lo);
    const mid = (b.lo + b.hi) >> 1;
    boxes.splice(best, 1, { lo: b.lo, hi: mid }, { lo: mid, hi: b.hi });
  }

  return boxes.map((b) => {
    let r = 0, g = 0, bl = 0;
    for (let i = b.lo; i < b.hi; i++) { const k = idx[i] * 3; r += samples[k]; g += samples[k + 1]; bl += samples[k + 2]; }
    const c = b.hi - b.lo || 1;
    return [Math.round(r / c), Math.round(g / c), Math.round(bl / c)];
  });
}

// matriz de 4×4 para el "dithering" (puntitos que simulan más colores y
// evitan las bandas en los degradados)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// Compresión LZW de los índices de color, como pide el formato GIF.
function lzw(indices, minCode) {
  const clear = 1 << minCode, eoi = clear + 1;
  const out = [];
  let acc = 0, bits = 0;
  const emit = (code, size) => {
    acc |= code << bits;
    bits += size;
    while (bits >= 8) { out.push(acc & 255); acc >>>= 8; bits -= 8; }
  };

  let size = minCode + 1, next = eoi + 1;
  const dict = new Map();
  emit(clear, size);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix, size);
    if (next < 4096) {
      dict.set(key, next++);
      if (next - 1 === (1 << size) && size < 12) size++;
    } else {
      emit(clear, size); // diccionario lleno: se reinicia
      dict.clear();
      size = minCode + 1;
      next = eoi + 1;
    }
    prefix = k;
  }
  emit(prefix, size);
  emit(eoi, size);
  if (bits > 0) out.push(acc & 255);
  return out;
}

// frames: lista de ImageData (RGBA) del mismo tamaño. transparent: los píxeles
// con poca opacidad pasan a ser transparentes (todo o nada); si no, se espera
// que ya vengan sobre un fondo opaco. Devuelve un Blob "image/gif".
export function buildGif(frames, width, height, fps, transparent) {
  const nColors = transparent ? 255 : 256;
  const tIndex = 255; // en modo transparente, el último color de la paleta es "transparente"

  // paleta: se arma con una muestra de píxeles de todos los cuadros
  const samples = [];
  const step = Math.max(1, Math.floor((frames.length * width * height) / 60000));
  let c = 0;
  for (const f of frames) {
    const d = f.data;
    for (let i = 0; i < d.length; i += 4) {
      if (c++ % step) continue;
      if (transparent && d[i + 3] < 128) continue;
      samples.push(d[i], d[i + 1], d[i + 2]);
    }
  }
  if (!samples.length) samples.push(0, 0, 0);
  const palette = medianCut(Uint8Array.from(samples), nColors);
  while (palette.length < 256) palette.push([0, 0, 0]);

  // color → índice de la paleta (con memoria, para no buscar de nuevo lo mismo)
  const cache = new Map();
  const nearest = (r, g, b) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let i = cache.get(key);
    if (i === undefined) {
      const rr = (r & 0xf8) | 4, gg = (g & 0xf8) | 4, bb = (b & 0xf8) | 4;
      let best = 0, bd = Infinity;
      for (let p = 0; p < nColors; p++) {
        const dr = palette[p][0] - rr, dg = palette[p][1] - gg, db = palette[p][2] - bb;
        const d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; best = p; }
      }
      i = best;
      cache.set(key, i);
    }
    return i;
  };

  const bytes = [];
  const w16 = (v) => bytes.push(v & 255, (v >> 8) & 255);
  for (const ch of "GIF89a") bytes.push(ch.charCodeAt(0));
  w16(width); w16(height);
  bytes.push(0xf7, 0, 0); // paleta global de 256 colores
  for (const [r, g, b] of palette) bytes.push(r, g, b);
  // extensión "se repite para siempre"
  bytes.push(0x21, 0xff, 0x0b);
  for (const ch of "NETSCAPE2.0") bytes.push(ch.charCodeAt(0));
  bytes.push(0x03, 0x01, 0, 0, 0);

  const delay = Math.max(2, Math.round(100 / fps)); // en centésimas de segundo (mínimo que respetan los visores: 2)
  for (const f of frames) {
    // control del cuadro: duración, y si usa color transparente
    bytes.push(0x21, 0xf9, 0x04, transparent ? (2 << 2) | 1 : 1 << 2);
    w16(delay);
    bytes.push(transparent ? tIndex : 0, 0);
    // descriptor de imagen: ocupa todo
    bytes.push(0x2c);
    w16(0); w16(0); w16(width); w16(height);
    bytes.push(0);

    const d = f.data;
    const idx = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (transparent && d[i + 3] < 128) { idx[y * width + x] = tIndex; continue; }
        const o = (BAYER[((y & 3) << 2) | (x & 3)] - 7.5) * 1.1;
        const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
        idx[y * width + x] = nearest(clamp(d[i] + o), clamp(d[i + 1] + o), clamp(d[i + 2] + o));
      }
    }
    bytes.push(8); // tamaño mínimo del código LZW
    const data = lzw(idx, 8);
    for (let p = 0; p < data.length; p += 255) {
      const n = Math.min(255, data.length - p);
      bytes.push(n);
      for (let k = 0; k < n; k++) bytes.push(data[p + k]);
    }
    bytes.push(0);
  }
  bytes.push(0x3b);
  return new Blob([Uint8Array.from(bytes)], { type: "image/gif" });
}
