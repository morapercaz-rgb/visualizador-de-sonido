// Orquesta todo: conecta los inputs de archivo con los motores de audio/video,
// arma el panel de control, y corre el loop de dibujo (requestAnimationFrame),
// que es lo que hace que esto se vea "vivo" a 60 cuadros por segundo.

import { AudioEngine } from "./audioEngine.js?v=20261021155157";
import { VideoLayer } from "./videoLayer.js?v=20261021155157";
import { Scene } from "./scene.js?v=20261021155157";
import { createControls, createDefaultParams, getOpenState } from "./controls.js?v=20261021155157";
import { ScreenRecorder } from "./recorder.js?v=20261021155157";
import { exportPngSequence } from "./exporter.js?v=20261021155157";

const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");

const recorder = new ScreenRecorder();
let exporting = false; // mientras se exporta la secuencia de PNG, el dibujo en vivo se pausa

const audio = new AudioEngine();
const videoLayer = new VideoLayer();
// los conjuntos (cada uno con su motor y sus parámetros) y los parámetros
// globales (capa de video, efectos de video, fondo)
const scene = new Scene();
const globalParams = createDefaultParams();

// El panel edita el conjunto seleccionado. Cuando cambia la selección, se suma
// o se borra un conjunto, se rearma entero — conservando qué carpetas estaban
// abiertas y la posición del scroll.
let pane = null;
function buildPanel() {
  let openState = null;
  let scrollTop = 0;
  if (pane) {
    openState = getOpenState(pane);
    scrollTop = document.querySelector(".tp-dfwv")?.scrollTop ?? 0;
    pane.dispose();
  }
  ({ pane } = createControls({
    scene,
    conjunto: scene.selected,
    conjuntos: scene.conjuntos,
    globalParams,
    openState,
    // (se rearma "enseguida" y no al instante, porque estos callbacks corren
    // adentro de un evento del propio panel que se está por reemplazar)
    actions: {
      resetPiece: () => scene.selected.engine.resetPiece(),
      rebuild: () => setTimeout(buildPanel, 0),
      refreshPanel: () => pane.refresh(),
      applyCanvas: () => applyCanvasSize(),
      exportPng: () => startPngExport(),
      selectSet: (id) => { scene.select(id); setTimeout(buildPanel, 0); },
      addSet: () => { scene.add(); setTimeout(buildPanel, 0); },
      duplicateSet: () => { scene.duplicate(); setTimeout(buildPanel, 0); },
      removeSet: () => { scene.remove(); setTimeout(buildPanel, 0); },
      bringToFront: () => { scene.bringToFront(); setTimeout(buildPanel, 0); },
      addKey: () => { scene.addKey(); setTimeout(buildPanel, 0); },
      removeKey: () => { scene.removeKey(); setTimeout(buildPanel, 0); },
      clearKeys: () => { scene.clearKeys(); setTimeout(buildPanel, 0); },
    },
  }));
  const root = document.querySelector(".tp-dfwv");
  if (root) root.scrollTop = scrollTop;
}
buildPanel();

// ---------- tamaño del lienzo ----------
// El canvas tiene un tamaño fijo (el de la "composición": es lo que se graba y
// se exporta) y se MUESTRA achicado para que entre en la ventana. Con el
// preset "ventana" el tamaño sigue al de la ventana, como antes.
let pendingResize = false;
function applyCanvasSize() {
  if (recorder.isRecording || exporting) {
    pendingResize = true; // se aplica apenas termine, para no romper el video
    recInfo.textContent = "el nuevo tamaño se aplica cuando termine de grabar";
    return;
  }
  const g = globalParams;
  let W = window.innerWidth, H = window.innerHeight;
  if (g.canvasPreset !== "window") {
    W = Math.min(7680, Math.max(64, Math.round(g.canvasW)));
    H = Math.min(4320, Math.max(64, Math.round(g.canvasH)));
  }
  W -= W % 2; // el video H.264 necesita medidas pares
  H -= H % 2;
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const fit = g.canvasPreset === "window" ? 1 : Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width = `${W * fit}px`;
  canvas.style.height = `${H * fit}px`;
  canvas.classList.toggle("artboard", g.canvasPreset !== "window");
}
window.addEventListener("resize", applyCanvasSize);
applyCanvasSize();

// el mouse viene en píxeles de la ventana; el dibujo está en píxeles del lienzo
function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * canvas.width) / r.width, y: ((e.clientY - r.top) * canvas.height) / r.height };
}

const audioInput = document.getElementById("audioInput");
const videoInput = document.getElementById("videoInput");
const playBtn = document.getElementById("playBtn");
const nextVideoBtn = document.getElementById("nextVideo");
const prevVideoBtn = document.getElementById("prevVideo");
const statusEl = document.getElementById("status");
const audioListEl = document.getElementById("audioList");
const videoListEl = document.getElementById("videoList");

function updateStatus() {
  const audioTrack = audio.tracks[audio.currentIndex];
  const videoEntry = videoLayer.active;
  const audioLabel = audioTrack ? audioTrack.name : "sin audio activo";
  const videoLabel = videoEntry ? videoEntry.name : "sin video activo";
  statusEl.textContent = `${audioLabel} · ${videoLabel}`;
  if (audio.audioEl) playBtn.textContent = audio.isPlaying ? "Pausar" : "Reproducir";
}

// activa (pone "en el centro") el ítem de biblioteca elegido, sea por
// click o por soltarlo arrastrado sobre el canvas
function activateMedia(type, index) {
  if (type === "audio") audio.activate(index);
  else videoLayer.select(index);
}

// dibuja las miniaturas de una biblioteca (audio o video) dentro de su
// contenedor. Se llama entera cada vez que algo cambia — son pocos
// elementos, así que redibujar todo de cero es más simple que ir
// actualizando de a un chip.
function renderMediaList(container, items, type) {
  container.innerHTML = "";
  for (const item of items) {
    const chip = document.createElement("div");
    chip.className = "mediaChip" + (item.active ? " active" : "");
    chip.draggable = true;
    chip.title = item.label;

    if (item.thumbnail) {
      chip.style.backgroundImage = `url(${item.thumbnail})`;
    } else {
      chip.textContent = type === "audio" ? "🎵" : "🎬";
    }

    const label = document.createElement("span");
    label.className = "chipLabel";
    label.textContent = item.label;
    chip.appendChild(label);

    chip.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", JSON.stringify({ type, index: item.index }));
      e.dataTransfer.effectAllowed = "copy";
    });
    chip.addEventListener("click", () => activateMedia(type, item.index));

    container.appendChild(chip);
  }
}

function renderLibrary() {
  renderMediaList(
    audioListEl,
    audio.tracks.map((t, i) => ({ label: t.name, thumbnail: null, index: i, active: i === audio.currentIndex })),
    "audio"
  );
  renderMediaList(
    videoListEl,
    videoLayer.videos.map((v, i) => ({ label: v.name, thumbnail: v.thumbnail, index: i, active: i === videoLayer.current })),
    "video"
  );
  updateStatus();
}

audio.onLibraryChange = renderLibrary;
videoLayer.onLibraryChange = renderLibrary;

audioInput.addEventListener("change", (e) => {
  for (const file of e.target.files) audio.addTrack(file);
  audioInput.value = ""; // permite volver a elegir el mismo archivo más adelante
});

videoInput.addEventListener("change", (e) => {
  for (const file of e.target.files) videoLayer.addFile(file);
  videoInput.value = "";
});

playBtn.addEventListener("click", () => {
  if (!audio.audioEl) return;
  if (audio.isPlaying) {
    audio.pause();
    playBtn.textContent = "Reproducir";
  } else {
    audio.play();
    playBtn.textContent = "Pausar";
  }
});

// grabación: graba el canvas (sin mouse ni paneles) y al detener descarga el video
const recBtn = document.getElementById("recBtn");
const recInfo = document.getElementById("recInfo");
// (opcional: si el navegador guardó un HTML viejo sin este botón, la página tiene que seguir andando)
const pngBtn = document.getElementById("pngBtn");
let recTimer = null;
let exportCancel = false;

recBtn.addEventListener("click", () => {
  if (exporting) {
    exportCancel = true;
    return;
  }
  if (recorder.isRecording) {
    recorder.stop();
    clearInterval(recTimer);
    recBtn.classList.remove("recording");
    recBtn.textContent = "● Grabar";
    recInfo.textContent = "listo: se descargó el video";
    if (pendingResize) {
      pendingResize = false;
      applyCanvasSize();
    }
    return;
  }
  const wanted = globalParams.recFormat;
  const used = recorder.start(canvas, audio.recordingStream, {
    format: wanted,
    fps: globalParams.recFps,
    bitrate: globalParams.recBitrate,
  });
  recBtn.classList.add("recording");
  recBtn.textContent = "■ Detener";
  const note = used !== wanted ? ` (este navegador no puede ${wanted}: usa ${used})` : "";
  recTimer = setInterval(() => {
    const s = Math.floor(recorder.elapsed);
    recInfo.textContent = `grabando ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} · ${canvas.width}×${canvas.height}${note}`;
  }, 250);
});

// botón "PNG sin fondo": exporta la secuencia con fondo transparente (o cancela si ya está exportando)
pngBtn?.addEventListener("click", () => {
  if (exporting) exportCancel = true;
  else startPngExport({ forceTransparent: true });
});

// exportar secuencia de PNG (cuadro a cuadro, ver exporter.js)
async function startPngExport({ forceTransparent = false } = {}) {
  if (exporting || recorder.isRecording) return;

  // La carpeta se pide ANTES de cualquier otra cosa: el navegador solo deja
  // abrir el selector justo después de un click. Sin esa función (Safari,
  // Firefox) se arma un ZIP.
  let dirHandle = null;
  if (window.showDirectoryPicker) {
    try {
      dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch (e) {
      if (e.name === "AbortError") return; // cerró el selector: no se exporta nada
    }
  }

  // "PNG sin fondo" siempre es transparente. Con fondo transparente el video
  // cargado solo entra si se lo pide; con fondo de color (no transparente) sí entra.
  const transparent = forceTransparent || globalParams.pngTransparent;
  const includeVideo = !transparent || globalParams.pngIncludeVideo;

  exporting = true;
  exportCancel = false;
  recBtn.classList.add("recording");
  recBtn.textContent = "■ Cancelar exportación";
  if (pngBtn) pngBtn.textContent = "■ Cancelar";
  try {
    const audioFile = audio.tracks[audio.currentIndex]?.file ?? null;
    // Sin audio activo las formas no reaccionan al sonido: solo se mueve lo que
    // esté animado (keyframes, giro, órbita…). Se avisa para que no sorprenda.
    const note = audioFile ? "" : " · sin audio activo: no hay reacción al sonido";
    const r = await exportPngSequence({
      scene,
      videoLayer,
      globalParams,
      audioFile,
      width: canvas.width,
      height: canvas.height,
      seconds: globalParams.pngSeconds,
      fps: globalParams.pngFps,
      transparent,
      includeVideo,
      dirHandle,
      onProgress: ({ phase, i, total }) => (recInfo.textContent = `${phase} ${i}/${total}${note}`),
      isCancelled: () => exportCancel,
    });
    recInfo.textContent = `listo: ${r.frames} PNG ${r.mode === "carpeta" ? "en la carpeta que elegiste" : "en un ZIP descargado"}${note}`;
  } catch (e) {
    recInfo.textContent = e.message === "cancelado" ? "exportación cancelada" : `error: ${e.message}`;
  } finally {
    exporting = false;
    recBtn.classList.remove("recording");
    recBtn.textContent = "● Grabar";
    if (pngBtn) pngBtn.textContent = "⬇ PNG sin fondo";
    if (pendingResize) {
      pendingResize = false;
      applyCanvasSize();
    }
  }
}

nextVideoBtn.addEventListener("click", () => videoLayer.next());
prevVideoBtn.addEventListener("click", () => videoLayer.prev());

// mouse sobre el canvas: agarrar y mover los núcleos, la pieza o los círculos
// libres (qué se puede agarrar lo decide el motor visual). Doble click sobre
// un círculo libre lo borra; en otro lado, recentra la pieza.
canvas.style.touchAction = "none";
canvas.addEventListener("pointerdown", (e) => {
  const p = toCanvas(e);
  if (scene.pointerDown(p.x, p.y, e.altKey)) {
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  }
});
canvas.addEventListener("pointermove", (e) => {
  const p = toCanvas(e);
  scene.pointerMove(p.x, p.y);
  if (!scene.isDragging) canvas.style.cursor = scene.hover(p.x, p.y) ? "grab" : "default";
});
function endDrag(e) {
  const p = toCanvas(e);
  scene.pointerUp();
  canvas.style.cursor = scene.hover(p.x, p.y) ? "grab" : "default";
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("dblclick", (e) => {
  const p = toCanvas(e);
  scene.doubleClick(p.x, p.y);
  // si se borró un círculo libre, el slider "círculos libres" de ese conjunto
  // tiene que bajar con él: se refresca el panel
  pane.refresh();
});

// arrastrar una miniatura y soltarla sobre el canvas la activa
canvas.addEventListener("dragover", (e) => {
  e.preventDefault();
  canvas.classList.add("dropping");
});
canvas.addEventListener("dragleave", () => canvas.classList.remove("dropping"));
canvas.addEventListener("drop", (e) => {
  e.preventDefault();
  canvas.classList.remove("dropping");
  const raw = e.dataTransfer.getData("text/plain");
  if (!raw) return;
  try {
    const { type, index } = JSON.parse(raw);
    activateMedia(type, index);
  } catch {
    // arrastraron otra cosa que no era una miniatura nuestra: se ignora
  }
});

// Los sliders del panel solo se redibujan cuando se los refresca. Se hace unas
// 10 veces por segundo (no en cada cuadro) cuando los valores cambian solos:
// al reproducir la animación, o cuando las manijas de la pantalla los mueven.
let frameCount = 0;
let paramsDirty = false;
scene.onParamsChanged = () => {
  paramsDirty = true;
};

let lastTime = performance.now();

function loop(now = performance.now()) {
  const w = canvas.width;
  const h = canvas.height;

  // segundos reales desde el cuadro anterior. Se limita a 50 ms: si la
  // pestaña estuvo en segundo plano y vuelve, no se salta de golpe un rato largo.
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;

  if (exporting) {
    // la exportación usa la escena para dibujar sus propios cuadros: el dibujo en vivo espera
    requestAnimationFrame(loop);
    return;
  }

  frameCount++;
  if (frameCount % 6 === 0 && (paramsDirty || scene.timeline.playing)) {
    pane.refresh();
    paramsDirty = false;
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.fillStyle = globalParams.bgColor;
  ctx.fillRect(0, 0, w, h);

  // el audio se analiza una sola vez (con la máxima cantidad de franjas); cada
  // conjunto lo ajusta después a su propia cantidad de picos/barras
  const audioData = audio.analyze(128);

  videoLayer.draw(ctx, w, h, globalParams, audioData, dt);
  scene.draw(ctx, w, h, audioData, dt);

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
