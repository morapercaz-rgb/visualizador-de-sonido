// Maneja los videos precargados: los guarda, permite pasar de uno a otro,
// y los dibuja en el canvas aplicándoles opacidad, modo de mezcla y varios
// efectos que se pueden combinar entre sí (espejo, pixelado, separación RGB,
// glitch, flash). Esta es la capa "VJ" del proyecto.
//
// Los efectos "geométricos" (espejo, pixelado, separación RGB) se aplican en
// cadena sobre canvases de trabajo reutilizados entre frames — así no hay que
// crear un canvas nuevo 60 veces por segundo. El resultado final se dibuja
// una sola vez sobre el canvas visible, con el filtro (blur/contraste/etc),
// la opacidad y el modo de mezcla aplicados ahí.

import { hexToRgb } from "./colorUtils.js?v=20261025151901";

export class VideoLayer {
  constructor() {
    this.videos = []; // biblioteca: [{ el, name, thumbnail }]
    this.current = -1; // -1 = nada activado todavía

    // se llama cada vez que la biblioteca cambia (se sube un video, se genera
    // una miniatura, se activa otro), para que la interfaz se redibuje
    this.onLibraryChange = null;

    // reloj propio de la capa de video: lo usan los efectos animados
    // (distorsión, cortes, rotación) para saber en qué momento están.
    this.time = 0;

    // estado del efecto de flash (destello): se prende de golpe con un salto
    // de graves y decae solo, frame a frame.
    this.bassSmooth = 0;
    this.k = 1; // cuántos "cuadros de 1/60 s" duró el último cuadro
    this.flashLevel = 0;

    // caché de la tabla de colores del duotono: se recalcula solo cuando
    // cambian los dos colores elegidos, no en cada frame.
    this._duoKey = null;
    this._lutR = null;
    this._lutG = null;
    this._lutB = null;

    this.frame = document.createElement("canvas"); // video crudo, cover-fit
    this.mirrorOut = document.createElement("canvas");
    this.warpOut = document.createElement("canvas");
    this.sliceOut = document.createElement("canvas");
    this.rotateOut = document.createElement("canvas");
    this.pixelSmall = document.createElement("canvas");
    this.pixelOut = document.createElement("canvas");
    this.duotoneOut = document.createElement("canvas");
    this.chR = document.createElement("canvas");
    this.chG = document.createElement("canvas");
    this.chB = document.createElement("canvas");
    this.rgbOut = document.createElement("canvas");
    // este canvas NO se limpia frame a frame: acumula el rastro de imágenes
    // anteriores, que se van desvaneciendo solas (por eso "trails" necesita
    // su propio buffer persistente en vez de un canvas de trabajo normal)
    this.trailBuffer = document.createElement("canvas");
  }

  // suma un video a la biblioteca. No se activa solo: queda ahí hasta que lo
  // arrastrás (o lo clickeás) para ponerlo en el centro.
  addFile(file) {
    const el = document.createElement("video");
    el.src = URL.createObjectURL(file);
    el.loop = true;
    el.muted = true; // el audio de estos videos no suena, solo se ve
    el.playsInline = true;
    el.play().catch(() => {});

    const entry = { el, name: file.name, thumbnail: null };
    this.videos.push(entry);
    el.addEventListener("loadeddata", () => this._captureThumbnail(entry), { once: true });
    this.onLibraryChange?.();
  }

  // activa el video de la biblioteca en la posición "index" (esto es lo que
  // hace "arrastrar hacia el centro": elegir cuál es el video visible).
  select(index) {
    if (index < 0 || index >= this.videos.length) return;
    this.current = index;
    this.onLibraryChange?.();
  }

  next() {
    if (!this.videos.length) return;
    this.current = this.current < 0 ? 0 : (this.current + 1) % this.videos.length;
    this.onLibraryChange?.();
  }

  prev() {
    if (!this.videos.length) return;
    this.current = this.current < 0 ? 0 : (this.current - 1 + this.videos.length) % this.videos.length;
    this.onLibraryChange?.();
  }

  get active() {
    return this.videos[this.current] ?? null;
  }

  // saca una foto chiquita del video para mostrarla como miniatura en la
  // biblioteca (se espera a "loadeddata" porque hasta ese momento el video
  // no tiene ningún frame decodificado todavía).
  _captureThumbnail(entry) {
    const el = entry.el;
    const tw = 64, th = 40;
    const c = document.createElement("canvas");
    c.width = tw;
    c.height = th;
    const cctx = c.getContext("2d");
    const scale = Math.max(tw / el.videoWidth, th / el.videoHeight);
    const dw = el.videoWidth * scale;
    const dh = el.videoHeight * scale;
    cctx.drawImage(el, (tw - dw) / 2, (th - dh) / 2, dw, dh);
    entry.thumbnail = c.toDataURL();
    this.onLibraryChange?.();
  }

  draw(ctx, w, h, params, audioData, dt = 0.016) {
    const v = this.active?.el;
    if (!v || v.readyState < 2) return; // todavía no hay frame para dibujar

    // tiempo real entre cuadros (ver visualEngine.draw): así los efectos se
    // mueven igual en una pantalla de 60 Hz que en una de 120 Hz
    this.time += dt;
    this.k = dt * 60;

    resize(this.frame, w, h);
    const fctx = this.frame.getContext("2d");
    // "cover": llena toda la pantalla sin deformar el video, recortando lo que sobre
    const scale = Math.max(w / v.videoWidth, h / v.videoHeight);
    const dw = v.videoWidth * scale;
    const dh = v.videoHeight * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    fctx.clearRect(0, 0, w, h);
    fctx.drawImage(v, dx, dy, dw, dh);

    let source = this.frame;
    if (params.fxMirror) source = this._mirror(source, w, h);
    if (params.fxWarp) source = this._warp(source, w, h, params.warpAmount, params.warpSpeed);
    if (params.fxSlices) source = this._slices(source, w, h, params.sliceCount, params.sliceAmount);
    if (params.fxRotate) source = this._rotate(source, w, h, params.rotateSpeed);
    if (params.fxPixelate) source = this._pixelate(source, w, h, params.pixelateSize);
    if (params.fxDuotone) source = this._duotone(source, w, h, params.duotoneDark, params.duotoneLight);
    if (params.fxRgbSplit) source = this._rgbSplit(source, w, h, params.rgbSplitAmount);
    if (params.fxTrails) source = this._trails(source, w, h, params.trailAmount);

    ctx.save();
    ctx.globalAlpha = params.videoOpacity;
    ctx.globalCompositeOperation = params.blendMode;
    ctx.filter = buildFilter(params);
    ctx.drawImage(source, 0, 0);
    ctx.restore();

    if (params.fxGlitch && params.glitchAmount > 0) {
      drawGlitch(ctx, w, h, params.glitchAmount, this.k);
    }

    if (params.fxFlash) {
      this._updateFlash(audioData.bass);
      if (this.flashLevel > 0.01) {
        ctx.save();
        ctx.globalAlpha = Math.min(this.flashLevel * params.flashIntensity, 1);
        ctx.fillStyle = params.flashColor;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }
  }

  // divide el canvas al medio y refleja la mitad izquierda sobre la derecha
  _mirror(source, w, h) {
    resize(this.mirrorOut, w, h);
    const c = this.mirrorOut.getContext("2d");
    c.clearRect(0, 0, w, h);
    c.drawImage(source, 0, 0, w / 2, h, 0, 0, w / 2, h);
    c.save();
    c.translate(w, 0);
    c.scale(-1, 1);
    c.drawImage(source, 0, 0, w / 2, h, 0, 0, w / 2, h);
    c.restore();
    return this.mirrorOut;
  }

  // distorsión / deformación: parte la imagen en franjas horizontales bien
  // finitas y desplaza cada una lateralmente según una onda (seno), distinta
  // en cada franja — el ojo lo lee como si la imagen ondulara, tipo agua o
  // una cinta VHS mal alineada.
  _warp(source, w, h, amount, speed) {
    resize(this.warpOut, w, h);
    const wctx = this.warpOut.getContext("2d");
    wctx.clearRect(0, 0, w, h);

    const bandH = 4;
    const bands = Math.ceil(h / bandH);
    for (let i = 0; i < bands; i++) {
      const y = i * bandH;
      const bh = Math.min(bandH, h - y);
      const offset = Math.sin(this.time * speed + y * 0.05) * amount * w * 0.08;
      wctx.drawImage(source, 0, y, w, bh, offset, y, w, bh);
    }
    return this.warpOut;
  }

  // cortes: divide la imagen en franjas verticales anchas y las corre cada
  // una a su ritmo — a diferencia del glitch (que es al azar y titila), acá
  // el desplazamiento es una onda suave, así se ve más "cortado a propósito"
  // que "roto".
  _slices(source, w, h, count, amount) {
    resize(this.sliceOut, w, h);
    const sctx = this.sliceOut.getContext("2d");
    sctx.clearRect(0, 0, w, h);

    const n = Math.max(1, Math.round(count));
    const stripW = w / n;
    for (let i = 0; i < n; i++) {
      const offset = Math.sin(this.time * 1.5 + i * 1.3) * amount * w * 0.15;
      const x = i * stripW;
      const sw = i === n - 1 ? w - x : stripW; // evita un hueco por redondeo en la última franja
      sctx.drawImage(source, x, 0, sw, h, x + offset, 0, sw, h);
    }
    return this.sliceOut;
  }

  // rotación continua sobre el centro. Se dibuja un poco más grande que el
  // canvas (factor 1.3) para que al girar no se vean las esquinas vacías.
  _rotate(source, w, h, speed) {
    resize(this.rotateOut, w, h);
    const rctx = this.rotateOut.getContext("2d");
    rctx.clearRect(0, 0, w, h);
    rctx.save();
    rctx.translate(w / 2, h / 2);
    rctx.rotate(this.time * speed);
    const scale = 1.3;
    rctx.drawImage(source, (-w * scale) / 2, (-h * scale) / 2, w * scale, h * scale);
    rctx.restore();
    return this.rotateOut;
  }

  // duotono: convierte a blanco y negro y después mapea cada nivel de gris a
  // un color entre "oscuro" y "claro" (tipo el efecto de las tapas de disco
  // de Spotify). Se precalcula una tabla de 256 valores (una por cada gris
  // posible) para no tener que calcular el color de cada píxel a mano.
  _duotone(source, w, h, darkHex, lightHex) {
    resize(this.duotoneOut, w, h);
    const dctx = this.duotoneOut.getContext("2d");
    dctx.clearRect(0, 0, w, h);
    dctx.filter = "grayscale(1)";
    dctx.drawImage(source, 0, 0);
    dctx.filter = "none";

    this._ensureDuotoneLut(darkHex, lightHex);

    const imgData = dctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const lutR = this._lutR, lutG = this._lutG, lutB = this._lutB;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i]; // ya está en gris: R, G y B son iguales
      data[i] = lutR[gray];
      data[i + 1] = lutG[gray];
      data[i + 2] = lutB[gray];
    }
    dctx.putImageData(imgData, 0, 0);
    return this.duotoneOut;
  }

  _ensureDuotoneLut(darkHex, lightHex) {
    const key = darkHex + lightHex;
    if (this._duoKey === key) return;
    this._duoKey = key;

    const dark = hexToRgb(darkHex);
    const light = hexToRgb(lightHex);
    this._lutR = new Uint8ClampedArray(256);
    this._lutG = new Uint8ClampedArray(256);
    this._lutB = new Uint8ClampedArray(256);
    for (let g = 0; g < 256; g++) {
      const t = g / 255;
      this._lutR[g] = dark.r + (light.r - dark.r) * t;
      this._lutG[g] = dark.g + (light.g - dark.g) * t;
      this._lutB[g] = dark.b + (light.b - dark.b) * t;
    }
  }

  // achica la imagen a pocos bloques y la vuelve a agrandar sin suavizado:
  // el clásico efecto "pixel art".
  _pixelate(source, w, h, blockSize) {
    const size = Math.max(2, blockSize);
    const smallW = Math.max(1, Math.floor(w / size));
    const smallH = Math.max(1, Math.floor(h / size));

    resize(this.pixelSmall, smallW, smallH);
    const sctx = this.pixelSmall.getContext("2d");
    sctx.imageSmoothingEnabled = false;
    sctx.clearRect(0, 0, smallW, smallH);
    sctx.drawImage(source, 0, 0, w, h, 0, 0, smallW, smallH);

    resize(this.pixelOut, w, h);
    const octx = this.pixelOut.getContext("2d");
    octx.imageSmoothingEnabled = false;
    octx.clearRect(0, 0, w, h);
    octx.drawImage(this.pixelSmall, 0, 0, smallW, smallH, 0, 0, w, h);
    return this.pixelOut;
  }

  // separación cromática: aísla cada canal de color (R, G, B) desplazado
  // levemente, y los vuelve a sumar. Aislar un canal es barato con canvas:
  // dibujar la imagen y "multiplicarla" por un color puro (ej rojo) deja
  // ese canal intacto y apaga los otros dos.
  _rgbSplit(source, w, h, amount) {
    resize(this.chR, w, h);
    resize(this.chG, w, h);
    resize(this.chB, w, h);
    resize(this.rgbOut, w, h);

    isolateChannel(this.chR, source, w, h, -amount, "rgb(255,0,0)");
    isolateChannel(this.chG, source, w, h, 0, "rgb(0,255,0)");
    isolateChannel(this.chB, source, w, h, amount, "rgb(0,0,255)");

    const octx = this.rgbOut.getContext("2d");
    octx.clearRect(0, 0, w, h);
    octx.globalCompositeOperation = "lighter";
    octx.drawImage(this.chR, 0, 0);
    octx.drawImage(this.chG, 0, 0);
    octx.drawImage(this.chB, 0, 0);
    octx.globalCompositeOperation = "source-over";
    return this.rgbOut;
  }

  // estela de movimiento: en vez de dibujar el frame nuevo solo, lo suma a un
  // buffer que arrastra de un frame a otro. "destination-out" con una alpha
  // chica borra el buffer viejo de a poquito (en vez de limpiarlo del todo),
  // así lo que había queda pero cada vez más transparente — la estela.
  // `amount` (0 a ~0.95) es qué tan lento se desvanece: 0 = sin estela.
  _trails(source, w, h, amount) {
    resize(this.trailBuffer, w, h);
    const tctx = this.trailBuffer.getContext("2d");
    const decay = Math.pow(Math.min(Math.max(amount, 0), 0.95), this.k);

    tctx.globalCompositeOperation = "destination-out";
    tctx.fillStyle = `rgba(0, 0, 0, ${1 - decay})`;
    tctx.fillRect(0, 0, w, h);

    tctx.globalCompositeOperation = "source-over";
    tctx.drawImage(source, 0, 0);

    return this.trailBuffer;
  }

  // detecta un salto brusco de graves (un "golpe" de batería, por ejemplo) y
  // dispara el flash; después lo deja decaer solo cada frame.
  _updateFlash(bass) {
    const jump = bass - this.bassSmooth;
    this.bassSmooth += (bass - this.bassSmooth) * (1 - Math.pow(0.8, this.k));
    if (jump > 0.12) this.flashLevel = 1;
    else this.flashLevel *= Math.pow(0.82, this.k);
  }
}

function isolateChannel(canvas, source, w, h, dx, colorRgb) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(source, dx, 0);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = colorRgb;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
}

function resize(canvas, w, h) {
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function buildFilter(params) {
  const parts = [];
  if (params.blur > 0) parts.push(`blur(${params.blur}px)`);
  if (params.hueRotate !== 0) parts.push(`hue-rotate(${params.hueRotate}deg)`);
  if (params.invert) parts.push("invert(1)");
  if (params.contrast !== 1) parts.push(`contrast(${params.contrast})`);
  if (params.saturate !== 1) parts.push(`saturate(${params.saturate})`);
  return parts.length ? parts.join(" ") : "none";
}

// corta franjas horizontales al azar y las desplaza lateralmente: el típico
// efecto "glitch" de señal cortada. amount (0-1) controla qué tan seguido
// y qué tan lejos se desplazan.
function drawGlitch(ctx, w, h, amount, k = 1) {
  const sliceH = 8;
  const slices = Math.floor(h / sliceH);
  for (let i = 0; i < slices; i++) {
    if (Math.random() < 0.05 * amount * k) {
      const y = i * sliceH;
      const shift = (Math.random() - 0.5) * 60 * amount;
      const imgData = ctx.getImageData(0, y, w, sliceH);
      ctx.putImageData(imgData, shift, y);
    }
  }
}
