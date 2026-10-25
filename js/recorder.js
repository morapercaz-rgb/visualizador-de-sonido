// Graba lo que se ve en el canvas (más el audio, si hay uno sonando) y lo
// descarga como archivo de video al detener.
//
// Se graba el CANVAS y no la pantalla: por eso el mouse, el panel de sliders
// y la estantería de archivos nunca aparecen en el video — solo la imagen
// final. Podés mover todo lo que quieras mientras grabás.

import { ZipWriter } from "./exporter.js?v=20261025181139";

export class ScreenRecorder {
  constructor() {
    this.recorder = null;
    this.chunks = [];
    this.startedAt = 0;
    this.mimeType = "";
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
    const order = format === "mp4" ? [mp4, vp9, vp8] : format === "webm8" ? [vp8, vp9, mp4] : [vp9, vp8, mp4];
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
export class PngSequenceRecorder {
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
  async start({ canvas, fps, dirHandle = null, transparent = true, includeVideo = false }) {
    this.canvas = canvas;
    this.fps = fps;
    this.transparent = transparent;
    this.includeVideo = includeVideo;
    this.name = `grabacion-png-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
    this.sub = dirHandle ? await dirHandle.getDirectoryHandle(this.name, { create: true }) : null;
    this.zip = this.sub ? null : new ZipWriter();
    this.slots = 0; // cuántos cuadros ya tienen número (incluye los repetidos)
    this.repeated = 0; // cuántos se rellenaron repitiendo el anterior
    this.inflight = 0;
    this.chain = Promise.resolve();
    this.error = null;
    this.full = false;
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
    this.canvas.toBlob((blob) => {
      this.chain = this.chain
        .then(() => this._save(blob, first, count))
        .catch((e) => (this.error = e))
        .finally(() => this.inflight--);
    }, "image/png");
  }

  async _save(blob, first, count) {
    if (!blob) return;
    const pad = (n) => String(n).padStart(5, "0");
    for (let k = 0; k < count; k++) {
      const file = `${this.name}_${pad(first + k)}.png`;
      if (this.sub) {
        const fh = await this.sub.getFileHandle(file, { create: true });
        const w = await fh.createWritable();
        await w.write(blob);
        await w.close();
      } else {
        this.zip.add(`${this.name}/${file}`, new Uint8Array(await blob.arrayBuffer()));
        if (this.zip.bytes > PngSequenceRecorder.maxBytes) this.full = true; // se corta acá, sin perder lo grabado
      }
    }
  }

  // detiene, espera a que se guarde todo lo pendiente y devuelve un resumen
  async stop() {
    this.active = false;
    while (this.inflight > 0) await new Promise((r) => setTimeout(r, 25));
    await this.chain;
    if (this.error) throw this.error;

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
    } else {
      this.zip.add(`${this.name}/LEEME.txt`, new TextEncoder().encode(readme));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(this.zip.finish());
      a.download = `${this.name}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
    }
    return { frames: this.slots, repeated: this.repeated, mode: this.sub ? "carpeta" : "zip", name: this.name };
  }
}
