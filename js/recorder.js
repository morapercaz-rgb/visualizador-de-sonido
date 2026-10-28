// Graba lo que se ve en el canvas (más el audio, si hay uno sonando) y lo
// descarga como archivo de video al detener.
//
// Se graba el CANVAS y no la pantalla: por eso el mouse, el panel de sliders
// y la estantería de archivos nunca aparecen en el video — solo la imagen
// final. Podés mover todo lo que quieras mientras grabás.

import { ZipWriter, ZipStream } from "./exporter.js?v=20261028164334";

export class ScreenRecorder {
  constructor() {
    this.recorder = null;
    this.chunks = [];
    this.startedAt = 0;
    this.mimeType = "";
    this.sizeFallback = false; // true si se pidió MP4 pero la imagen es demasiado grande para H.264
  }

  get isRecording() {
    return this.recorder?.state === "recording";
  }

  // segundos desde que arrancó la grabación
  get elapsed() {
    return this.isRecording ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  // options:
  //   format  "mp4" (H.264: lo leen After Effects y Premiere) | "webm9" (VP9) | "webm8" (VP8)
  //   fps     cuántos cuadros por segundo se graban
  //   bitrate calidad en megabits por segundo
  // Si el navegador no soporta el formato pedido, se usa el que sí.
  // Devuelve el formato que realmente se usó (para avisarle al usuario).
  start(canvas, audioStream, { format = "mp4", fps = 30, bitrate = 12 } = {}) {
    const stream = canvas.captureStream(fps);
    if (audioStream) {
      for (const track of audioStream.getAudioTracks()) stream.addTrack(track);
    }

    const mp4 = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4"];
    const vp9 = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp9", "video/webm"];
    const vp8 = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp8", "video/webm"];
    // el video MP4 (H.264) no admite imágenes muy grandes (más de unos 9 millones de
    // píxeles, o un lado de más de 8192): en ese caso se graba WebM, que sí las admite
    this.sizeFallback = format === "mp4" && (canvas.width * canvas.height > 9_437_184 || canvas.width > 8192 || canvas.height > 8192);
    const order = this.sizeFallback ? [vp9, vp8, mp4] : format === "mp4" ? [mp4, vp9, vp8] : format === "webm8" ? [vp8, vp9, mp4] : [vp9, vp8, mp4];
    this.mimeType = order.flat().find((t) => MediaRecorder.isTypeSupported(t)) ?? "";

    this.chunks = [];
    this.recorder = new MediaRecorder(stream, {
      ...(this.mimeType ? { mimeType: this.mimeType } : {}),
      videoBitsPerSecond: Math.round(bitrate * 1_000_000),
    });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => this._download();
    this.recorder.start(1000); // junta un pedazo por segundo, así no se pierde todo si algo falla
    this.startedAt = performance.now();
    return this.mimeType.includes("mp4") ? "mp4" : this.mimeType.includes("vp8") ? "webm8" : "webm9";
  }

  stop() {
    if (this.isRecording) this.recorder.stop();
  }

  _download() {
    const type = this.mimeType || "video/webm";
    const blob = new Blob(this.chunks, { type });
    const ext = type.includes("mp4") ? "mp4" : "webm";
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `visualizador-${stamp}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    this.chunks = [];
  }
}


// Graba en vivo una SECUENCIA DE PNG: mientras vos movés las cosas, cada
// 1/fps de segundo se guarda una foto del canvas. Sirve para sacar lo que
// hacés en tiempo real (mouse, audio sonando) cuadro por cuadro y con
// transparencia, para After Effects.
//
// - main.js llama a tick(ahora) en cada cuadro de pantalla, justo después de dibujar.
// - Las fotos se codifican en segundo plano (toBlob es asíncrono). Si la compu
//   no llega (lienzo grande), no se frena la pantalla: el cuadro que falta se
//   rellena repitiendo el último, así la duración total queda bien.
// - Se guardan en una carpeta (Chrome) o se arma un ZIP al detener.
// Codifica PNG FUERA de la página (en Web Workers): se toma una "foto" rápida del canvas
// (createImageBitmap) y el trabajo pesado de armar el PNG lo hace otro hilo. Así grabar
// no frena el dibujo. Si el navegador no puede, se usa canvas.toBlob como siempre.
const ENCODER_SRC = `
self.onmessage = async (e) => {
  const { id, bitmap } = e.data;
  try {
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    c.getContext("2d").drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await c.convertToBlob({ type: "image/png" });
    self.postMessage({ id, blob });
  } catch (err) {
    self.postMessage({ id, blob: null });
  }
};`;

class PngEncoder {
  constructor(workers = 2) {
    this.workers = [];
    this.waiting = new Map();
    this.next = 0;
    this.seq = 0;
    this.url = null;
    const ok = typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap === "function" && PngSequenceRecorder.useWorker;
    if (!ok) return;
    try {
      this.url = URL.createObjectURL(new Blob([ENCODER_SRC], { type: "text/javascript" }));
      for (let i = 0; i < workers; i++) {
        const w = new Worker(this.url);
        w.onmessage = (e) => {
          const cb = this.waiting.get(e.data.id);
          this.waiting.delete(e.data.id);
          cb?.(e.data.blob ?? null);
        };
        w.onerror = () => {
          this.broken = true;
        };
        this.workers.push(w);
      }
    } catch {
      this.workers = [];
    }
  }

  // devuelve una promesa con el Blob PNG del canvas tal como está AHORA
  encode(canvas) {
    if (!this.workers.length || this.broken) {
      return new Promise((res) => canvas.toBlob(res, "image/png"));
    }
    return createImageBitmap(canvas).then(
      (bitmap) =>
        new Promise((res) => {
          const id = ++this.seq;
          this.waiting.set(id, res);
          this.workers[this.next++ % this.workers.length].postMessage({ id, bitmap }, [bitmap]);
        }),
      () => new Promise((res) => canvas.toBlob(res, "image/png"))
    );
  }

  dispose() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    if (this.url) URL.revokeObjectURL(this.url);
  }
}

export class PngSequenceRecorder {
  static useWorker = true; // (false = codificar en la página, como antes)

  // tope de memoria para el modo ZIP (en bytes). Al llegar, deja de tomar cuadros
  // y avisa (full = true) para que se guarde lo grabado hasta ahí.
  static maxBytes = 1.5e9;

  constructor() {
    this.active = false;
    this.full = false;
  }

  get frames() {
    return this.slots;
  }

  // opciones: canvas, fps, dirHandle (o null para ZIP), transparent, includeVideo
  async start({ canvas, fps, dirHandle = null, fileHandle = null, transparent = true, includeVideo = false }) {
    this.canvas = canvas;
    this.fps = fps;
    this.transparent = transparent;
    this.includeVideo = includeVideo;
    this.name = `grabacion-png-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
    this.sub = dirHandle ? await dirHandle.getDirectoryHandle(this.name, { create: true }) : null;
    // carpeta, archivo ZIP que se escribe de a poco, o ZIP en memoria
    this.zip = this.sub ? null : fileHandle ? new ZipStream(await fileHandle.createWritable()) : new ZipWriter();
    this.slots = 0; // cuántos cuadros ya tienen número (incluye los repetidos)
    this.saved = 0; // cuántos cuadros se guardaron de verdad
    this.nullBlobs = 0; // cuántas veces el navegador no pudo armar la imagen
    this.broken = null; // si algo impide seguir grabando: el motivo, en palabras
    this.repeated = 0; // cuántos se rellenaron repitiendo el anterior
    this.inflight = 0;
    this.chain = Promise.resolve();
    this.error = null;
    this.full = false;
    this.encoder = new PngEncoder();
    this.t0 = performance.now();
    this.active = true;
  }

  tick(now) {
    if (!this.active || this.error || this.full) return;
    const due = Math.floor(((now - this.t0) / 1000) * this.fps) + 1; // cuántos cuadros tendrían que existir ya
    if (due <= this.slots || this.inflight >= 6) return; // todavía no toca, o la compu está atrasada: se junta con el próximo

    const first = this.slots + 1;
    const count = Math.min(due - this.slots, 90);
    this.slots += count;
    if (count > 1) this.repeated += count - 1;
    this.inflight++;
    // toBlob toma la foto del canvas JUSTO ahora y codifica después
    this.encoder.encode(this.canvas).then((blob) => {
      if (!blob) {
        // el navegador no pudo codificar este PNG (suele pasar con lienzos enormes o poca memoria)
        this.nullBlobs++;
        if (this.saved === 0 && this.nullBlobs >= 3) {
          this.broken = "el navegador no puede guardar imágenes de este tamaño (o se quedó sin memoria): bajá el tamaño del lienzo o usá \"Secuencia de PNG\" en Exportar, que arma los cuadros uno por uno";
        }
        this.inflight--;
        return;
      }
      this.chain = this.chain
        .then(() => this._save(blob, first, count))
        .catch((e) => (this.error = e))
        .finally(() => this.inflight--);
    });
  }

  async _save(blob, first, count) {
    if (!blob) return;
    this.saved += count;
    const pad = (n) => String(n).padStart(5, "0");
    for (let k = 0; k < count; k++) {
      const file = `${this.name}_${pad(first + k)}.png`;
      if (this.sub) {
        const fh = await this.sub.getFileHandle(file, { create: true });
        const w = await fh.createWritable();
        await w.write(blob);
        await w.close();
      } else {
        await this.zip.add(`${this.name}/${file}`, new Uint8Array(await blob.arrayBuffer()));
        if (this.zip instanceof ZipWriter && this.zip.bytes > PngSequenceRecorder.maxBytes) this.full = true; // (solo el ZIP en memoria tiene tope) se corta acá, sin perder lo grabado
      }
    }
  }

  // detiene, espera a que se guarde todo lo pendiente y devuelve un resumen
  async stop() {
    this.active = false;
    while (this.inflight > 0) await new Promise((r) => setTimeout(r, 25));
    await this.chain;
    this.encoder?.dispose();
    if (this.error) throw this.error;
    // si no se guardó ni un cuadro, no se entrega un ZIP vacío: se explica por qué
    if (this.saved === 0) {
      const e = new Error(
        this.broken ??
          (document.hidden || this.slots === 0
            ? "no se guardó ningún cuadro: la grabación necesita que esta pestaña esté visible (si cambiás de ventana o de pestaña, el navegador frena el dibujo). Probá de nuevo sin salir de la pestaña, y esperá un par de segundos antes de detener"
            : "no se guardó ningún cuadro: el navegador no pudo armar las imágenes. Probá con un lienzo más chico o con \"Secuencia de PNG\" en Exportar")
      );
      e.friendly = true;
      throw e;
    }

    const readme =
      `Secuencia de PNG grabada en vivo del Visualizador de sonido.\n\n` +
      `Tamaño: ${this.canvas.width} x ${this.canvas.height} px\nCuadros por segundo: ${this.fps}\nCuadros: ${this.slots}\n` +
      `Fondo: ${this.transparent ? "transparente (solo los colores)" : "con color de fondo"}\n\n` +
      `Esto es una carpeta con UNA IMAGEN POR CUADRO: al reproducirlas en orden se ven en movimiento.\n\n` +
      `Para abrirla en After Effects:\n` +
      `  Archivo > Importar > Archivo... > elegí el primer PNG > marcá "PNG Sequence" > Importar.\n` +
      `  Interpretar material (Cmd+Alt+C) > Velocidad de cuadro: ${this.fps} cuadros/seg.\n`;

    if (this.sub) {
      const fh = await this.sub.getFileHandle("LEEME.txt", { create: true });
      const w = await fh.createWritable();
      await w.write(readme);
      await w.close();
    } else if (this.zip instanceof ZipStream) {
      await this.zip.add(`${this.name}/LEEME.txt`, new TextEncoder().encode(readme));
      await this.zip.finish();
    } else {
      this.zip.add(`${this.name}/LEEME.txt`, new TextEncoder().encode(readme));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(this.zip.finish());
      a.download = `${this.name}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
    }
    return { frames: this.slots, repeated: this.repeated, mode: this.sub ? "carpeta" : this.zip instanceof ZipStream ? "archivo" : "zip", name: this.name };
  }
}
