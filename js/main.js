// Orquesta todo: conecta los inputs de archivo con los motores de audio/video,
// arma el panel de control, y corre el loop de dibujo (requestAnimationFrame),
// que es lo que hace que esto se vea "vivo" a 60 cuadros por segundo.

import { AudioEngine } from "./audioEngine.js";
import { VideoLayer } from "./videoLayer.js";
import { Scene } from "./scene.js";
import { createControls, createDefaultParams, getOpenState } from "./controls.js";
import { ScreenRecorder } from "./recorder.js";

const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

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
  pane = createControls({
    conjunto: scene.selected,
    conjuntos: scene.conjuntos,
    globalParams,
    openState,
    // (se rearma "enseguida" y no al instante, porque estos callbacks corren
    // adentro de un evento del propio panel que se está por reemplazar)
    actions: {
      resetPiece: () => scene.selected.engine.resetPiece(),
      rebuild: () => setTimeout(buildPanel, 0),
      selectSet: (id) => { scene.select(id); setTimeout(buildPanel, 0); },
      addSet: () => { scene.add(); setTimeout(buildPanel, 0); },
      duplicateSet: () => { scene.duplicate(); setTimeout(buildPanel, 0); },
      removeSet: () => { scene.remove(); setTimeout(buildPanel, 0); },
      bringToFront: () => { scene.bringToFront(); setTimeout(buildPanel, 0); },
    },
  });
  const root = document.querySelector(".tp-dfwv");
  if (root) root.scrollTop = scrollTop;
}
buildPanel();

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
const recorder = new ScreenRecorder();
const recBtn = document.getElementById("recBtn");
const recInfo = document.getElementById("recInfo");
let recTimer = null;

recBtn.addEventListener("click", () => {
  if (recorder.isRecording) {
    recorder.stop();
    clearInterval(recTimer);
    recBtn.classList.remove("recording");
    recBtn.textContent = "● Grabar";
    recInfo.textContent = "listo: se descargó el video";
    return;
  }
  recorder.start(canvas, audio.recordingStream);
  recBtn.classList.add("recording");
  recBtn.textContent = "■ Detener";
  recTimer = setInterval(() => {
    const s = Math.floor(recorder.elapsed);
    recInfo.textContent = `grabando ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }, 250);
});

nextVideoBtn.addEventListener("click", () => videoLayer.next());
prevVideoBtn.addEventListener("click", () => videoLayer.prev());

// mouse sobre el canvas: agarrar y mover los núcleos, la pieza o los círculos
// libres (qué se puede agarrar lo decide el motor visual). Doble click sobre
// un círculo libre lo borra; en otro lado, recentra la pieza.
canvas.style.touchAction = "none";
canvas.addEventListener("pointerdown", (e) => {
  if (scene.pointerDown(e.clientX, e.clientY)) {
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  }
});
canvas.addEventListener("pointermove", (e) => {
  scene.pointerMove(e.clientX, e.clientY);
  if (!scene.isDragging) canvas.style.cursor = scene.hover(e.clientX, e.clientY) ? "grab" : "default";
});
function endDrag(e) {
  scene.pointerUp();
  canvas.style.cursor = scene.hover(e.clientX, e.clientY) ? "grab" : "default";
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("dblclick", (e) => {
  scene.doubleClick(e.clientX, e.clientY);
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

function loop() {
  const w = canvas.width;
  const h = canvas.height;

  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.fillStyle = globalParams.bgColor;
  ctx.fillRect(0, 0, w, h);

  // el audio se analiza una sola vez (con la máxima cantidad de franjas); cada
  // conjunto lo ajusta después a su propia cantidad de picos/barras
  const audioData = audio.analyze(128);

  videoLayer.draw(ctx, w, h, globalParams, audioData);
  scene.draw(ctx, w, h, audioData);

  requestAnimationFrame(loop);
}
loop();
