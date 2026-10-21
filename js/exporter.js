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

import { analyzeBytes, silentAudio } from "./audioEngine.js?v=20261021155157";

// ---------- ZIP mínimo (sin compresión) ----------
// Alcanza para empaquetar PNGs (que ya vienen comprimidos). Se usa cuando el
// navegador no puede escribir en una carpeta (Safari, Firefox).

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

// ---------- exportación ----------

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

// opciones:
//   scene, videoLayer, globalParams, audioFile (File o null)
//   width, height, seconds, fps, transparent
//   includeVideo → dibujar también el video de fondo cargado (false = solo lo generativo)
//   dirHandle  → carpeta donde escribir (File System Access API); si es null, se arma un ZIP
//   onProgress({ phase, i, total }), isCancelled()
// Devuelve { frames, mode, name }.
export async function exportPngSequence(o) {
  const { scene, videoLayer, globalParams, width: W, height: H, seconds, fps, transparent } = o;
  const frames = Math.round(seconds * fps);
  const dt = 1 / fps;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const name = `secuencia-png-${stamp}`;

  o.onProgress?.({ phase: "analizando el audio", i: 0, total: frames });
  const audioFrames = await analyzeAudioFrames(o.audioFile, seconds, fps);
  if (o.isCancelled?.()) throw new Error("cancelado");

  // se guarda el estado vivo para dejarlo como estaba
  const saved = {
    clock: scene.clock,
    timeline: { ...scene.timeline },
    gizmo: scene.settings.gizmo,
    conjuntos: scene.conjuntos.map((c) => ({ c, spin: c.spinAngle, lastT: c._lastT, handles: c.params.mixHandles })),
  };
  const video = o.includeVideo === false ? null : videoLayer.active?.el ?? null;
  const videoWasPlaying = video && !video.paused;

  // arranca desde el principio de la animación, sin manijas ni gizmo en la imagen
  scene.clock = 0;
  scene.timeline.time = 0;
  scene.timeline.playing = true;
  scene.settings.gizmo = false;
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

  let sub = null;
  const zip = o.dirHandle ? null : new ZipWriter();
  if (o.dirHandle) sub = await o.dirHandle.getDirectoryHandle(name, { create: true });

  const readme =
    `Secuencia de PNG exportada del Visualizador de sonido.\n\n` +
    `Tamaño: ${W} x ${H} px\nCuadros por segundo: ${fps}\nCuadros: ${frames}\nDuración: ${seconds} s\n` +
    `Fondo: ${transparent ? "transparente (solo los colores)" : "con color de fondo"}\n` +
    `Video de fondo: ${o.includeVideo === false ? "no incluido" : "incluido"}\n\n` +
    `Para abrirla en After Effects:\n` +
    `  Archivo > Importar > Archivo... > elegí el primer PNG > marcá "PNG Sequence" > Importar.\n` +
    `  Interpretar material (Cmd+Alt+C) > Velocidad de cuadro: ${fps} cuadros/seg.\n` +
    `El audio no va en las imágenes: importá el archivo de audio original aparte.\n`;

  try {
    for (let i = 0; i < frames; i++) {
      if (o.isCancelled?.()) throw new Error("cancelado");
      o.onProgress?.({ phase: "dibujando cuadros", i, total: frames });

      if (video && video.duration) await seek(video, (i / fps) % video.duration);

      ctx.clearRect(0, 0, W, H);
      if (!transparent) {
        ctx.fillStyle = globalParams.bgColor;
        ctx.fillRect(0, 0, W, H);
      }
      if (o.includeVideo !== false) videoLayer.draw(ctx, W, H, globalParams, audioFrames[i], dt);
      scene.draw(ctx, W, H, audioFrames[i], dt);

      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      const file = `${name}_${pad(i + 1)}.png`;
      if (sub) {
        const fh = await sub.getFileHandle(file, { create: true });
        const w = await fh.createWritable();
        await w.write(blob);
        await w.close();
      } else {
        zip.add(`${name}/${file}`, new Uint8Array(await blob.arrayBuffer()));
        if (zip.bytes > 1.5e9) throw new Error("demasiado grande para un ZIP en memoria: bajá el tamaño o la duración, o usá Chrome para guardar en una carpeta");
      }
      if (i % 4 === 3) await new Promise((r) => setTimeout(r)); // deja respirar al navegador
    }

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
  } finally {
    // se deja todo como estaba
    scene.clock = saved.clock;
    Object.assign(scene.timeline, saved.timeline);
    scene.settings.gizmo = saved.gizmo;
    for (const s of saved.conjuntos) {
      s.c.spinAngle = s.spin;
      s.c._lastT = s.lastT;
      s.c.params.mixHandles = s.handles;
    }
    if (video && videoWasPlaying) video.play().catch(() => {});
  }

  return { frames, mode: sub ? "carpeta" : "zip", name };
}
