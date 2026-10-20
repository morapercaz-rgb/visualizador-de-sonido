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

  start(canvas, audioStream) {
    const stream = canvas.captureStream(60);
    if (audioStream) {
      for (const track of audioStream.getAudioTracks()) stream.addTrack(track);
    }

    // cada navegador soporta formatos distintos: se prueba en orden de preferencia
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    this.mimeType = candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";

    this.chunks = [];
    this.recorder = new MediaRecorder(stream, {
      ...(this.mimeType ? { mimeType: this.mimeType } : {}),
      videoBitsPerSecond: 8_000_000,
    });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => this._download();
    this.recorder.start(1000); // junta un pedazo por segundo, así no se pierde todo si algo falla
    this.startedAt = performance.now();
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
