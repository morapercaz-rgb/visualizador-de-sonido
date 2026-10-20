// Se encarga de "escuchar" el audio: lo carga, lo reproduce y en cada frame
// devuelve tres números (graves / medios / agudos) entre 0 y 1. Esos números
// son la materia prima que después usan visualEngine.js y videoLayer.js.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.dataArray = null;
    this.source = null;
    this.audioEl = null;

    this.tracks = []; // biblioteca: [{ file, name }], no suenan hasta que se activan
    this.currentIndex = -1;

    // se llama cada vez que la biblioteca cambia (se sube un archivo, se
    // activa otro), para que la interfaz sepa que tiene que redibujarse
    this.onLibraryChange = null;
  }

  // suma un archivo a la biblioteca. Todavía no se reproduce: solo queda
  // "en el estante" hasta que alguien lo activa (con activate()).
  addTrack(file) {
    this.tracks.push({ file, name: file.name });
    this.onLibraryChange?.();
  }

  // pone a sonar la pista de la biblioteca en la posición "index".
  async activate(index) {
    const track = this.tracks[index];
    if (!track) return;
    this.currentIndex = index;
    await this.loadFile(track.file);
    this.play();
    this.onLibraryChange?.();
  }

  async loadFile(file) {
    // el AudioContext necesita crearse después de una interacción del usuario
    // (por eso lo hacemos recién acá, no al cargar la página)
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      // salida paralela solo para grabar: lleva el mismo audio que suena,
      // pero como un "stream" que el grabador puede meter dentro del video
      this.recDest = this.ctx.createMediaStreamDestination();
      this.analyser.connect(this.recDest);
    }

    if (this.audioEl) {
      this.audioEl.pause();
      URL.revokeObjectURL(this.audioEl.src);
    }

    this.audioEl = new Audio();
    this.audioEl.src = URL.createObjectURL(file);
    this.audioEl.loop = true;

    if (this.source) this.source.disconnect();
    this.source = this.ctx.createMediaElementSource(this.audioEl);
    this.source.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    return this.audioEl;
  }

  play() {
    this.ctx?.resume();
    // si el archivo está corrupto o el navegador no lo puede decodificar,
    // play() rechaza la promesa — la atajamos para que no quede como un
    // error suelto en la consola (el usuario ya ve que no suena, alcanza)
    this.audioEl?.play().catch(() => {});
  }

  pause() {
    this.audioEl?.pause();
  }

  // el audio como stream para grabar (null si todavía no se activó ninguna pista)
  get recordingStream() {
    return this.recDest ? this.recDest.stream : null;
  }

  get isPlaying() {
    return !!this.audioEl && !this.audioEl.paused;
  }

  // analiza el frame actual de audio y devuelve varias cosas:
  // - graves/medios/agudos promediados (0-1 cada uno), para reactividad general
  // - "centroid": el "centro de brillo" del sonido en este instante (0 = todo
  //   grave, 1 = todo agudo) — se usa para mover el color a lo largo de una
  //   paleta según cómo suena la música en cada momento.
  // - "spectrum": el espectro completo repartido en `spectrumBins` casilleros,
  //   útil para modos visuales tipo ecualizador (barras, picos radiales) que
  //   necesitan un valor por franja de frecuencia en vez de un solo promedio.
  analyze(spectrumBins = 32) {
    if (!this.analyser) {
      return { bass: 0, mid: 0, treble: 0, overall: 0, centroid: 0, spectrum: new Array(spectrumBins).fill(0) };
    }

    this.analyser.getByteFrequencyData(this.dataArray);
    const n = this.dataArray.length;
    const bassEnd = Math.floor(n * 0.1);
    const midEnd = Math.floor(n * 0.4);

    let bass = 0, mid = 0, treble = 0;
    let weightedSum = 0, totalEnergy = 0;
    for (let i = 0; i < n; i++) {
      const v = this.dataArray[i];
      if (i < bassEnd) bass += v;
      else if (i < midEnd) mid += v;
      else treble += v;
      weightedSum += i * v;
      totalEnergy += v;
    }

    bass /= bassEnd * 255;
    mid /= (midEnd - bassEnd) * 255;
    treble /= (n - midEnd) * 255;
    const centroid = totalEnergy > 0 ? weightedSum / totalEnergy / (n - 1) : 0;

    const bucketSize = Math.max(1, Math.floor(n / spectrumBins));
    const spectrum = new Array(spectrumBins).fill(0);
    for (let b = 0; b < spectrumBins; b++) {
      const start = b * bucketSize;
      const end = Math.min(start + bucketSize, n);
      let sum = 0;
      for (let i = start; i < end; i++) sum += this.dataArray[i];
      spectrum[b] = sum / ((end - start) * 255 || 1);
    }

    return { bass, mid, treble, overall: (bass + mid + treble) / 3, centroid, spectrum };
  }
}
