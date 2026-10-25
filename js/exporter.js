// Exporta la animación como SECUENCIA DE PNG: una imagen por cuadro, sin
// compresión de video y con fondo transparente si se quiere. Es el formato
// que se usa para pasar el trabajo a After Effects (File > Import > File, se
// elige la primera imagen y se marca "PNG Sequence").
//
// A diferencia de grabar, esto NO es en vivo: se arma cada cuadro con un
// tiempo exacto (1/fps), así que sale perfecto aunque la compu tarde un
// minuto por cuadro, sin saltos ni cuadros perdidos. Para que el audio siga
// moviendo las formas, se analiza el audio cuadro por cuadro con un contexto
// de audio "offline" (que corre más rápido que el tiempo real, sin sonar).
//
// Lo que se exporta es lo que determinan la línea de tiempo (keyframes), el
// movimiento continuo y el audio. Lo que se mueve en vivo con el mouse no
// se graba (no hay forma de repetirlo cuadro a cuadro).

import { analyzeBytes, silentAudio } from "./audioEngine.js?v=20261025175500";
import { crc32, buildApng, buildGif } from "./animEncoders.js?v=20261025175500";

export { crc32 };

// ---------- ZIP mínimo (sin compresión) ----------
// Alcanza para empaquetar PNGs (que ya vienen comprimidos). Se usa cuando el
// navegador no puede escribir en una carpeta (Safari, Firefox).

export class ZipWriter {
  constructor() {
    this.parts = [];
    this.entries = [];
    this.offset = 0;
    this.bytes = 0;
  }

  add(name, data) {
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); // firma "local file header"
    h.setUint16(4, 20, true); // versión mínima
    h.setUint16(6, 0x0800, true); // nombres en UTF-8
    h.setUint16(8, 0, true); // método 0 = sin compresión
    h.setUint16(10, 0, true);
    h.setUint16(12, 0x21, true); // fecha: 1980-01-01
    h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true);
    h.setUint32(22, data.length, true);
    h.setUint16(26, nameBytes.length, true);
    h.setUint16(28, 0, true);
    this.parts.push(h.buffer, nameBytes, data);
    this.entries.push({ nameBytes, crc, size: data.length, offset: this.offset });
    this.offset += 30 + nameBytes.length + data.length;
    this.bytes += data.length;
  }

  finish() {
    const cdStart = this.offset;
    let cdSize = 0;
    for (const e of this.entries) {
      const h = new DataView(new ArrayBuffer(46));
      h.setUint32(0, 0x02014b50, true); // firma "central directory"
      h.setUint16(4, 20, true);
      h.setUint16(6, 20, true);
      h.setUint16(8, 0x0800, true);
      h.setUint16(10, 0, true);
      h.setUint16(12, 0, true);
      h.setUint16(14, 0x21, true);
      h.setUint32(16, e.crc, true);
      h.setUint32(20, e.size, true);
      h.setUint32(24, e.size, true);
      h.setUint16(28, e.nameBytes.length, true);
      h.setUint32(42, e.offset, true);
      this.parts.push(h.buffer, e.nameBytes);
      cdSize += 46 + e.nameBytes.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); // firma "end of central directory"
    end.setUint16(8, this.entries.length, true);
    end.setUint16(10, this.entries.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, cdStart, true);
    this.parts.push(end.buffer);
    return new Blob(this.parts, { type: "application/zip" });
  }
}

// ---------- análisis de audio cuadro por cuadro ----------

// Decodifica el archivo de audio y devuelve, para cada cuadro, lo mismo que
// devuelve analyze() en vivo (graves, medios, agudos, espectro…). Se usa un
// OfflineAudioContext: se "pausa" el audio justo en el instante de cada cuadro
// y se lee el analizador, sin necesidad de reproducirlo en tiempo real.
export async function analyzeAudioFrames(file, seconds, fps, bins = 128) {
  const frames = Math.round(seconds * fps);
  if (!file) return Array.from({ length: frames }, () => silentAudio(bins));

  const decoder = new (window.AudioContext || window.webkitAudioContext)();
  const buffer = await decoder.decodeAudioData(await file.arrayBuffer());
  decoder.close();

  const sr = buffer.sampleRate;
  const off = new OfflineAudioContext(1, Math.max(Math.ceil(seconds * sr), 256), sr);
  const src = off.createBufferSource();
  src.buffer = buffer;
  src.loop = true; // igual que en vivo: si el audio es más corto, se repite
  const analyser = off.createAnalyser();
  analyser.fftSize = 512;
  // el analizador suaviza una vez por lectura; en vivo se lee ~60 veces por
  // segundo, así que acá se ajusta para que el suavizado dure lo mismo a cualquier fps
  analyser.smoothingTimeConstant = Math.pow(0.8, 60 / fps);
  src.connect(analyser);
  analyser.connect(off.destination);

  const bytes = new Uint8Array(analyser.frequencyBinCount);
  const out = new Array(frames);
  for (let i = 0; i < frames; i++) {
    const t = Math.max(i / fps, 256 / sr); // el cuadro 0 se lee apenas arranca el audio
    off
      .suspend(t)
      .then(() => {
        analyser.getByteFrequencyData(bytes);
        out[i] = analyzeBytes(bytes, bins);
        return off.resume();
      })
      .catch(() => {});
  }
  src.start(0);
  await off.startRendering();
  for (let i = 0; i < frames; i++) out[i] ??= silentAudio(bins);
  return out;
}

// ---------- render cuadro a cuadro (lo comparten todos los formatos) ----------

function seek(video, t) {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = t;
    setTimeout(done, 1500); // por si el navegador nunca avisa
  });
}

const pad = (n, len = 5) => String(n).padStart(len, "0");
const stampNow = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

// Dibuja la animación cuadro por cuadro con tiempo exacto (1/fps) y le entrega
// cada cuadro a onFrame(canvas, i). Se ocupa de todo lo común: analizar el
// audio, arrancar desde el principio, sacar manijas y gizmo de la imagen,
// buscar el cuadro del video, y dejar todo como estaba al terminar.
// opciones: scene, videoLayer, globalParams, audioFile, width, height,
//           seconds, fps, transparent, includeVideo, onProgress, isCancelled
async function renderAnimation(o, onFrame) {
  const { scene, videoLayer, globalParams, width: W, height: H, seconds, fps, transparent } = o;
  const frames = Math.round(seconds * fps);
  const dt = 1 / fps;

  o.onProgress?.({ phase: "analizando el audio", i: 0, total: frames });
  const audioFrames = await analyzeAudioFrames(o.audioFile, seconds, fps);
  if (o.isCancelled?.()) throw new Error("cancelado");

  // se guarda el estado vivo para dejarlo como estaba
  const saved = {
    clock: scene.clock,
    timeline: { ...scene.timeline },
    gizmo: scene.settings.gizmo,
    morph: { ...scene.morph },
    seq: { ...scene.seq },
    conjuntos: scene.conjuntos.map((c) => ({ c, spin: c.spinAngle, lastT: c._lastT, handles: c.params.mixHandles })),
  };
  const video = o.includeVideo === false ? null : videoLayer.active?.el ?? null;
  const videoWasPlaying = video && !video.paused;

  // arranca desde el principio de la animación, sin manijas ni gizmo en la imagen
  scene.clock = 0;
  scene.timeline.time = 0;
  scene.timeline.playing = true;
  scene.settings.gizmo = false;
  // exportar la transformación: el avance va exacto de A (primer cuadro) a B (último)
  if (o.morph) Object.assign(scene.morph, { on: true, playing: false, repeat: "once", time: 0 });
  if (o.seq) Object.assign(scene.seq, { on: true, playing: false, repeat: "once", time: 0 });
  for (const { c } of saved.conjuntos) {
    c.spinAngle = 0;
    c._lastT = null;
    c.params.mixHandles = false;
  }
  if (video) video.pause();

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  try {
    for (let i = 0; i < frames; i++) {
      if (o.isCancelled?.()) throw new Error("cancelado");
      o.onProgress?.({ phase: "dibujando cuadros", i, total: frames });

      if (video && video.duration) await seek(video, (i / fps) % video.duration);

      if (o.morph) scene.morph.time = frames > 1 ? (i / (frames - 1)) * seconds : 0;
      if (o.seq) scene.seq.time = frames > 1 ? (i / (frames - 1)) * seconds : 0;
      ctx.clearRect(0, 0, W, H);
      if (!transparent) {
        ctx.fillStyle = globalParams.bgColor;
        ctx.fillRect(0, 0, W, H);
      }
      if (o.includeVideo !== false) videoLayer.draw(ctx, W, H, globalParams, audioFrames[i], dt);
      scene.draw(ctx, W, H, audioFrames[i], dt);

      await onFrame(canvas, i);
      if (i % 4 === 3) await new Promise((r) => setTimeout(r)); // deja respirar al navegador
    }
  } finally {
    // se deja todo como estaba
    scene.clock = saved.clock;
    Object.assign(scene.timeline, saved.timeline);
    Object.assign(scene.morph, saved.morph);
    Object.assign(scene.seq, saved.seq);
    scene.settings.gizmo = saved.gizmo;
    for (const s of saved.conjuntos) {
      s.c.spinAngle = s.spin;
      s.c._lastT = s.lastT;
      s.c.params.mixHandles = s.handles;
    }
    if (video && videoWasPlaying) video.play().catch(() => {});
  }
  return { frames };
}

// ---------- secuencia de PNG (una imagen por cuadro; para After) ----------
// opciones extra: dirHandle → carpeta donde escribir (File System Access API);
// si es null, se arma un ZIP y se descarga.
// Devuelve { frames, mode, name }.
export async function exportPngSequence(o) {
  const name = `${o.seq ? "linea-de-tiempo" : o.morph ? "transformacion" : "secuencia-png"}-${stampNow()}`;
  const { width: W, height: H, seconds, fps, transparent } = o;

  let sub = null;
  const zip = o.dirHandle ? null : new ZipWriter();
  if (o.dirHandle) sub = await o.dirHandle.getDirectoryHandle(name, { create: true });

  const readme =
    `Secuencia de PNG exportada del Visualizador de sonido${o.seq ? " (línea de tiempo de etapas: conjuntos que se transforman uno en otro, de la primera etapa a la última)" : o.morph ? " (un conjunto que se transforma en otro: el primer cuadro es el conjunto de origen y el último el de destino)" : ""}.\n\n` +
    `Tamaño: ${W} x ${H} px\nCuadros por segundo: ${fps}\nCuadros: ${Math.round(seconds * fps)}\nDuración: ${seconds} s\n` +
    `Fondo: ${transparent ? "transparente (solo los colores)" : "con color de fondo"}\n` +
    `Video de fondo: ${o.includeVideo === false ? "no incluido" : "incluido"}\n\n` +
    `Esto es una carpeta con UNA IMAGEN POR CUADRO: al reproducirlas en orden se ven en movimiento.\n\n` +
    `Para abrirla en After Effects:\n` +
    `  Archivo > Importar > Archivo... > elegí el primer PNG > marcá "PNG Sequence" > Importar.\n` +
    `  Interpretar material (Cmd+Alt+C) > Velocidad de cuadro: ${fps} cuadros/seg.\n` +
    `El audio no va en las imágenes: importá el archivo de audio original aparte.\n`;

  let frames = 0;
  await renderAnimation(o, async (canvas, i) => {
    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    const file = `${name}_${pad(i + 1)}.png`;
    if (sub) {
      const fh = await sub.getFileHandle(file, { create: true });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
    } else {
      zip.add(`${name}/${file}`, new Uint8Array(await blob.arrayBuffer()));
      if (zip.bytes > 1.5e9) throw new Error("__lleno__"); // se corta y se guarda lo hecho hasta acá
    }
    frames = i + 1;
  }).catch((e) => {
    if (e.message !== "__lleno__") throw e;
  });

  if (sub) {
    const fh = await sub.getFileHandle("LEEME.txt", { create: true });
    const w = await fh.createWritable();
    await w.write(readme);
    await w.close();
  } else {
    o.onProgress?.({ phase: "armando el ZIP", i: frames, total: frames });
    zip.add(`${name}/LEEME.txt`, new TextEncoder().encode(readme));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(zip.finish());
    a.download = `${name}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  }
  return { frames, mode: sub ? "carpeta" : "zip", name };
}

// ---------- animaciones de UN SOLO ARCHIVO (PNG animado y GIF) ----------
// No se descargan solas: devuelven { blob, ext, frames, width, height, name }
// para mostrar una vista previa y que el usuario decida guardarlas.
// opción extra: outWidth → ancho del archivo final (se achica desde el lienzo;
// un archivo animado de 1080p+ pesaría muchísimo).

function outputSize(o) {
  const outW = Math.max(16, Math.min(o.width, Math.round(o.outWidth || o.width)));
  return { outW, outH: Math.max(16, Math.round((o.height * outW) / o.width)) };
}

export async function exportApng(o) {
  const { outW, outH } = outputSize(o);
  const small = document.createElement("canvas");
  small.width = outW;
  small.height = outH;
  const sctx = small.getContext("2d");
  const pngs = [];
  let bytes = 0;

  await renderAnimation(o, async (canvas) => {
    sctx.clearRect(0, 0, outW, outH);
    sctx.drawImage(canvas, 0, 0, outW, outH);
    const blob = await new Promise((res) => small.toBlob(res, "image/png"));
    const data = new Uint8Array(await blob.arrayBuffer());
    bytes += data.length;
    if (bytes > 700e6) throw new Error("la animación es demasiado pesada: bajá la duración, los cuadros por segundo o el ancho");
    pngs.push(data);
  });

  o.onProgress?.({ phase: "armando el PNG animado", i: pngs.length, total: pngs.length });
  const blob = buildApng(pngs, o.fps);
  return { blob, ext: "png", frames: pngs.length, width: outW, height: outH, name: `animacion-${stampNow()}` };
}

export async function exportGif(o) {
  const { outW, outH } = outputSize(o);
  const small = document.createElement("canvas");
  small.width = outW;
  small.height = outH;
  const sctx = small.getContext("2d", { willReadFrequently: true });
  const frames = [];

  await renderAnimation(o, async (canvas) => {
    sctx.clearRect(0, 0, outW, outH);
    sctx.drawImage(canvas, 0, 0, outW, outH);
    frames.push(sctx.getImageData(0, 0, outW, outH));
  });

  o.onProgress?.({ phase: "armando el GIF", i: frames.length, total: frames.length });
  await new Promise((r) => setTimeout(r)); // para que se vea el aviso antes de que trabaje fuerte
  const blob = buildGif(frames, outW, outH, o.fps, !!o.transparent);
  return { blob, ext: "gif", frames: frames.length, width: outW, height: outH, name: `animacion-${stampNow()}` };
}

// ---------- convertir un archivo animado ya hecho (PNG animado, GIF, WebP) a secuencia de PNG ----------
// Un PNG animado o un GIF guardan todos sus cuadros adentro. Esto los saca uno
// por uno y los guarda como PNG sueltos (con su transparencia), que es lo que
// After Effects sí abre. Usa ImageDecoder del navegador (Chrome, Edge, Safari 17+).
// opciones: file, dirHandle (o null → ZIP), onProgress, isCancelled
// Devuelve { frames, fps, width, height, mode, name }.
export async function convertAnimationToSequence({ file, dirHandle = null, onProgress, isCancelled }) {
  if (typeof ImageDecoder === "undefined") throw new Error("este navegador no puede leer animaciones cuadro por cuadro: usá Chrome");

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const type = file.type || (ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/png");
  const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type });
  await decoder.tracks.ready;
  await decoder.completed;
  const total = decoder.tracks.selectedTrack.frameCount;
  if (total < 2) throw new Error("ese archivo tiene un solo cuadro: no es una animación");

  const name = `secuencia-de-${file.name.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_")}-${stampNow()}`;
  let sub = null;
  const zip = dirHandle ? null : new ZipWriter();
  if (dirHandle) sub = await dirHandle.getDirectoryHandle(name, { create: true });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  let durationUs = 0, width = 0, height = 0;

  for (let i = 0; i < total; i++) {
    if (isCancelled?.()) throw new Error("cancelado");
    onProgress?.({ phase: "sacando cuadros", i, total });
    const { image } = await decoder.decode({ frameIndex: i, completeFramesOnly: true });
    if (i === 0) {
      width = canvas.width = image.displayWidth;
      height = canvas.height = image.displayHeight;
    }
    durationUs += image.duration || 0;
    ctx.clearRect(0, 0, width, height); // transparente: así se conserva el alfa
    ctx.drawImage(image, 0, 0);
    image.close();

    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    const out = `${name}_${pad(i + 1)}.png`;
    if (sub) {
      const fh = await sub.getFileHandle(out, { create: true });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
    } else {
      zip.add(`${name}/${out}`, new Uint8Array(await blob.arrayBuffer()));
      if (zip.bytes > 1.5e9) throw new Error("demasiado grande para un ZIP en memoria: usá Chrome para guardar en una carpeta");
    }
    if (i % 4 === 3) await new Promise((r) => setTimeout(r));
  }

  // cuadros por segundo: lo que dura cada cuadro, en promedio
  const avgMs = durationUs / total / 1000;
  const fps = avgMs > 0 ? Math.max(1, Math.round(1000 / avgMs)) : 24;

  const readme =
    `Secuencia de PNG sacada de "${file.name}" con el Visualizador de sonido.\n\n` +
    `Tamaño: ${width} x ${height} px\nCuadros: ${total}\nCuadros por segundo: ${fps}\n` +
    `Se conserva la transparencia del archivo original.\n\n` +
    `Esto es una carpeta con UNA IMAGEN POR CUADRO: al reproducirlas en orden se ven en movimiento.\n\n` +
    `Para abrirla en After Effects:\n` +
    `  Archivo > Importar > Archivo... > elegí el primer PNG > marcá "PNG Sequence" > Importar.\n` +
    `  Interpretar material (Cmd+Alt+C) > Velocidad de cuadro: ${fps} cuadros/seg.\n`;
  if (sub) {
    const fh = await sub.getFileHandle("LEEME.txt", { create: true });
    const w = await fh.createWritable();
    await w.write(readme);
    await w.close();
  } else {
    onProgress?.({ phase: "armando el ZIP", i: total, total });
    zip.add(`${name}/LEEME.txt`, new TextEncoder().encode(readme));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(zip.finish());
    a.download = `${name}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  }
  return { frames: total, fps, width, height, mode: sub ? "carpeta" : "zip", name };
}
