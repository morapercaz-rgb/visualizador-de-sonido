// Graba lo que se ve en el canvas (más el audio, si hay uno sonando) y lo
// descarga como archivo de video al detener.
//
// Se graba el CANVAS y no la pantalla: por eso el mouse, el panel de sliders
// y la estantería de archivos nunca aparecen en el video — solo la imagen
// final. Podés mover todo lo que quieras mientras grabás.

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
