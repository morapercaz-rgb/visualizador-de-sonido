// Orquesta todo: conecta los inputs de archivo con los motores de audio/video,
// arma el panel de control, y corre el loop de dibujo (requestAnimationFrame),
// que es lo que hace que esto se vea "vivo" a 60 cuadros por segundo.

import { AudioEngine } from "./audioEngine.js?v=20261025210357";
import { VideoLayer } from "./videoLayer.js?v=20261025210357";
import { Scene } from "./scene.js?v=20261025210357";
import { createControls, createDefaultParams, getOpenState } from "./controls.js?v=20261025210357";
import { ScreenRecorder, PngSequenceRecorder } from "./recorder.js?v=20261025210357";
import { LEGACY_PARAMS, listPresets, savePreset, deletePreset, getPreset, exportPresetsText, importPresetsText, importPresets, loadShared, encodePresets, decodePresets } from "./presets.js?v=20261025210357";
import { exportPngSequence, exportApng, exportGif, convertAnimationToSequence } from "./exporter.js?v=20261025210357";

const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");
// capa de encima: manijas y gizmo. Nunca forma parte de lo que se graba o exporta.
const overlay = document.getElementById("overlay");
const octx = overlay?.getContext("2d") ?? null;

const recorder = new ScreenRecorder();
const pngRec = new PngSequenceRecorder(); // graba en vivo una secuencia de PNG (formato "png" de Grabar)
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
// la configuración de la transformación (qué dos conjuntos, cuánto dura…) también queda guardada
const MORPH_KEY = "visualizador-de-sonido.transformacion.v1";
try {
  const { a, b, seconds, ease, repeat, only, stagger, swirl, scatter } = JSON.parse(localStorage.getItem(MORPH_KEY) ?? "{}");
  Object.assign(scene.morph, { a: a ?? "", b: b ?? "", seconds: seconds ?? 4, ease: ease ?? "smooth", repeat: repeat ?? "once", only: only ?? true, stagger: stagger ?? 0.35, swirl: swirl ?? 0.18, scatter: scatter ?? 0.6 });
} catch {}
const SEQ_KEY = "visualizador-de-sonido.linea-de-tiempo.v1";
try {
  const d = JSON.parse(localStorage.getItem(SEQ_KEY) ?? "{}");
  if (Array.isArray(d.stops)) {
    scene.seq.stops = d.stops
      .filter((x) => x && typeof x.src === "string" && x.pos)
      .map((x) => ({ src: x.src, hold: +x.hold || 0, trans: +x.trans || 1, pos: { x: +x.pos.x || 0, y: +x.pos.y || 0, scale: +x.pos.scale || 1, rot: +x.pos.rot || 0, op: x.pos.op ?? 1 } }));
  }
  Object.assign(scene.seq, { sel: d.sel ?? 0, repeat: d.repeat ?? "once", ease: d.ease ?? "smooth", only: d.only ?? true });
} catch {}
function saveSeqSettings() {
  try {
    const { stops, sel, repeat, ease, only } = scene.seq;
    localStorage.setItem(SEQ_KEY, JSON.stringify({ stops, sel, repeat, ease, only }));
  } catch {}
}
function saveMorphSettings() {
  saveSeqSettings();
  try {
    const { a, b, seconds, ease, repeat, only, stagger, swirl, scatter } = scene.morph;
    localStorage.setItem(MORPH_KEY, JSON.stringify({ a, b, seconds, ease, repeat, only, stagger, swirl, scatter }));
  } catch {}
}

// ---------- pasar conjuntos a otra persona ----------
const PUBLIC_URL = "https://morapercaz-rgb.github.io/visualizador-de-sonido/";

// un link que lleva los conjuntos adentro. Solo se guarda lo que difiere de los
// valores iniciales (así el link queda mucho más corto).
async function shareLink(list) {
  const base = createDefaultParams();
  const slim = list.map((p) => ({
    name: p.name,
    params: Object.fromEntries(Object.entries(p.params).filter(([k, v]) => v !== base[k] || k in LEGACY_PARAMS)), // (los parámetros "nuevos" van siempre: si no, al otro lado se tomarían como de un conjunto viejo)
    keys: p.keys,
    state: p.state,
    spin: p.spin,
  }));
  const code = await encodePresets(slim);
  const root = location.hostname.endsWith("github.io") ? location.origin + location.pathname : PUBLIC_URL;
  const url = `${root}#conjuntos=${code}`;
  let copied = false;
  try {
    await navigator.clipboard.writeText(url);
    copied = true;
  } catch {}
  if (!copied) window.prompt("Copiá este link (⌘+C) y mandáselo:", url);
  const n = list.length;
  recInfo.textContent =
    `${copied ? "copié" : "armé"} el link con ${n} conjunto${n === 1 ? "" : "s"} (${Math.round(url.length / 1024 * 10) / 10} KB): quien lo abra los recibe en "Mis conjuntos guardados"` +
    (url.length > 8000 ? " · es largo: si tu chat lo corta, usá exportar / importar" : "");
}

// si se abrió un link con conjuntos adentro (#conjuntos=…), se guardan en este navegador
async function importFromHash() {
  const m = location.hash.match(/^#conjuntos=(.+)$/);
  if (!m) return;
  const list = await decodePresets(m[1]);
  history.replaceState(null, "", location.pathname + location.search); // se saca el link largo de la barra
  const n = list ? importPresets(list) : -1;
  recInfo.textContent = n < 0 ? "el link con conjuntos no se pudo leer (¿se cortó al copiarlo?)" : `recibí ${n} conjunto${n === 1 ? "" : "s"} por link: están en "Mis conjuntos guardados" y quedan en este navegador`;
  buildPanel();
}

let pane = null;
let actionsRef = {}; // las acciones del panel, para usarlas también desde la barra de la línea de tiempo
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
    actions: (actionsRef = {
      resetPiece: () => scene.selected.engine.resetPiece(),
      rebuild: () => setTimeout(buildPanel, 0),
      refreshPanel: () => pane.refresh(),
      syncAnimDuration: () => syncAnimDurSelect(),
      pickConvert: () => document.getElementById("convInput")?.click(),
      applyCanvas: () => applyCanvasSize(),
      exportPng: () => startExport("seq"),
      morphPlay: () => {
        if (!scene.morphEnds()) { recInfo.textContent = "elegí dos conjuntos (desde y hasta) para ver la transformación"; return; }
        scene.seq.on = false;
        scene.morphPlay();
        recInfo.textContent = "viendo la transformación: ■ salir la apaga y vuelven los conjuntos separados";
      },
      morphToggle: () => { if (scene.morphEnds()) Object.assign(scene.morph, { on: true, playing: !scene.morph.playing }); },
      morphStop: () => { Object.assign(scene.morph, { on: false, playing: false, time: 0 }); recInfo.textContent = "salí de la transformación"; },
      morphSeek: (u) => { if (scene.morphEnds()) scene.morphSeek(u); },
      exportMorph: () => {
        if (!scene.morphEnds()) { recInfo.textContent = "elegí dos conjuntos (desde y hasta) para exportar la transformación"; return; }
        startExport("seq", { morph: true });
      },
      seqAdd: (src) => {
        if (!src) { recInfo.textContent = "elegí un conjunto para agregar como etapa"; return; }
        const q = scene.seq;
        const prev = q.stops[q.stops.length - 1];
        const st = scene.seqNewStop(src);
        if (prev) st.pos = { ...prev.pos, x: prev.pos.x + 120 }; // la etapa nueva sale al costado de la anterior, para que se note
        q.stops.push(st);
        q.sel = q.stops.length - 1;
        afterSeqChange(true);
        scene.seqSeekStop(q.sel);
      },
      seqSelect: (i) => { scene.seq.sel = i; scene.seqSeekStop(i); setTimeout(buildPanel, 0); saveSeqSettings(); },
      seqChanged: (rebuild) => { afterSeqChange(!!rebuild); },
      seqTake: () => {
        const q = scene.seq, st = q.stops[q.sel];
        const c = st && scene._resolveEnd(st.src);
        if (!c) return;
        const p = c.params;
        st.pos = { x: p.posX, y: p.posY, scale: p.scale, rot: p.rotation, op: p.tOpacity };
        afterSeqChange(true);
        recInfo.textContent = "tomé la posición que tiene ahora el conjunto";
      },
      seqDup: () => {
        const q = scene.seq, st = q.stops[q.sel];
        if (!st) return;
        q.stops.splice(q.sel + 1, 0, structuredClone(st));
        q.sel++;
        afterSeqChange(true);
        scene.seqSeekStop(q.sel);
      },
      seqMove: (d) => {
        const q = scene.seq, j = q.sel + d;
        if (j < 0 || j >= q.stops.length) return;
        [q.stops[q.sel], q.stops[j]] = [q.stops[j], q.stops[q.sel]];
        q.sel = j;
        afterSeqChange(true);
        scene.seqSeekStop(j);
      },
      seqDel: () => {
        const q = scene.seq;
        if (!q.stops.length) return;
        q.stops.splice(q.sel, 1);
        q.sel = Math.max(0, Math.min(q.sel, q.stops.length - 1));
        afterSeqChange(true);
      },
      seqPlay: () => {
        if (!scene.seqSchedule().segs.length) { recInfo.textContent = "agregá al menos una etapa para reproducir la línea de tiempo"; return; }
        scene.morph.on = false;
        scene.seqPlay();
      },
      seqToggle: () => {
        const q = scene.seq;
        if (!scene.seqSchedule().segs.length) return;
        scene.morph.on = false;
        if (!q.on || (!q.playing && q.time >= scene.seqTotal())) scene.seqPlay();
        else Object.assign(q, { on: true, playing: !q.playing });
      },
      seqStop: () => { Object.assign(scene.seq, { on: false, playing: false, time: 0 }); recInfo.textContent = "salí de la línea de tiempo"; },
      exportSeq: () => {
        if (!scene.seqSchedule().segs.length) { recInfo.textContent = "agregá al menos una etapa para exportar la línea de tiempo"; return; }
        startExport("seq", { seq: true });
      },
      exportApng: () => startExport("apng", { forceTransparent: false }),
      exportGif: () => startExport("gif"),
      selectSet: (id) => { scene.select(id); setTimeout(buildPanel, 0); },
      addSet: () => { scene.add(); setTimeout(buildPanel, 0); },
      duplicateSet: () => { scene.duplicate(); setTimeout(buildPanel, 0); },
      removeSet: () => { scene.remove(); setTimeout(buildPanel, 0); },
      bringToFront: () => { scene.bringToFront(); setTimeout(buildPanel, 0); },
      savePreset: (name) => {
        const r = savePreset(name, scene.selected);
        navigator.storage?.persist?.().catch(() => {}); // pide que el navegador no los borre solo
        recInfo.textContent = r.ok
          ? `${r.replaced ? "actualicé" : "guardé"} "${r.name}" en tus conjuntos guardados: va a estar ahí la próxima vez que entres`
          : "no pude guardar: el navegador no deja guardar datos (¿ventana privada?). Probá con \"exportar a un archivo\"";
        setTimeout(buildPanel, 0);
      },
      addPreset: (name) => {
        const p = getPreset(name);
        if (!p) return;
        scene.addFromPreset(p);
        recInfo.textContent = `sumé "${p.name}" a la escena`;
        setTimeout(buildPanel, 0);
      },
      replacePreset: (name) => {
        const p = getPreset(name);
        if (!p) return;
        scene.replaceFromPreset(p);
        recInfo.textContent = `el conjunto que editabas ahora es "${p.name}"`;
        setTimeout(buildPanel, 0);
      },
      sharePreset: (name) => {
        const p = getPreset(name);
        if (p) shareLink([p]);
      },
      shareAll: () => {
        const mine = listPresets().filter((p) => !p.shared);
        if (mine.length) shareLink(mine);
      },
      deletePreset: (name) => {
        if (getPreset(name)?.shared && !listPresets().some((p) => p.name === name && !p.shared)) {
          recInfo.textContent = `"${name}" es de la lista de todos (viene con la página): no se puede borrar desde acá`;
          return;
        }
        if (!name || !confirm(`¿Borrar "${name}" de tus conjuntos guardados? (los que ya tenés en la escena no se tocan)`)) return;
        deletePreset(name);
        recInfo.textContent = `borré "${name}" de tus guardados`;
        setTimeout(buildPanel, 0);
      },
      exportPresets: () => {
        if (!listPresets().length) { recInfo.textContent = "no hay conjuntos guardados para exportar"; return; }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([exportPresetsText()], { type: "application/json" }));
        a.download = "mis-conjuntos.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
        recInfo.textContent = "descargué mis-conjuntos.json (se puede importar en otro navegador o pasárselo a una amiga)";
      },
      importPresets: () => document.getElementById("presetInput")?.click(),
      addKey: () => { scene.addKey(); setTimeout(buildPanel, 0); },
      removeKey: () => { scene.removeKey(); setTimeout(buildPanel, 0); },
      clearKeys: () => { scene.clearKeys(); setTimeout(buildPanel, 0); },
    }),
  }));
  pane.on("change", saveMorphSettings);
  const root = document.querySelector(".tp-dfwv");
  if (root) root.scrollTop = scrollTop;
}
buildPanel();
importFromHash();
loadShared("conjuntos-compartidos.json").then((n) => n && buildPanel()); // la lista que viene con la página

// importar conjuntos de un archivo exportado
document.getElementById("presetInput")?.addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  e.target.value = "";
  if (!f) return;
  const n = importPresetsText(await f.text());
  recInfo.textContent = n < 0 ? "ese archivo no es de conjuntos (o no se pudo guardar)" : `importé ${n} conjunto${n === 1 ? "" : "s"}: están en "Mis conjuntos guardados"`;
  buildPanel();
});

// ---------- tamaño del lienzo ----------
// El canvas tiene un tamaño fijo (el de la "composición": es lo que se graba y
// se exporta) y se MUESTRA achicado para que entre en la ventana. Con el
// preset "ventana" el tamaño sigue al de la ventana, como antes.
let pendingResize = false;
function applyCanvasSize() {
  if (recorder.isRecording || pngRec.active || exporting) {
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
  if (overlay) {
    if (overlay.width !== W || overlay.height !== H) {
      overlay.width = W;
      overlay.height = H;
    }
    overlay.style.width = canvas.style.width;
    overlay.style.height = canvas.style.height;
  }
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

const recPngBtn = document.getElementById("recPngBtn");
const FOLDER_TIP =
  "elegí o creá una carpeta NUEVA (Chrome no deja usar Escritorio, Descargas ni Documentos directamente), o cambiá \"guardar en\" a ZIP en el panel";

// Pide la carpeta donde guardar las secuencias de PNG. Devuelve:
//   { dirHandle, note } → listo (dirHandle null = se usa ZIP)
//   null               → el usuario canceló: no se hace nada (y se le dice por qué)
// Tiene que llamarse JUSTO después de un click: el navegador solo deja abrir
// el selector de carpetas en ese momento.
async function askSaveTarget() {
  if (globalParams.pngSaveTo !== "folder") return { dirHandle: null, note: "" };
  if (!window.showDirectoryPicker) {
    return { dirHandle: null, note: " · este navegador no puede guardar en carpetas: va a un ZIP" };
  }
  try {
    return { dirHandle: await window.showDirectoryPicker({ mode: "readwrite" }), note: "" };
  } catch (e) {
    if (e.name === "AbortError") {
      recInfo.textContent = `no elegiste carpeta, así que no se hizo nada: ${FOLDER_TIP}`;
      return null;
    }
    return { dirHandle: null, note: ` · no se pudo usar esa carpeta (${e.message}): va a un ZIP` };
  }
}

// ---- grabar PNG en vivo ----
async function startPngRecording() {
  if (pngRec.active || recorder.isRecording || exporting) return;
  const target = await askSaveTarget();
  if (!target) return;
  const opts = {
    canvas,
    fps: globalParams.recFps,
    transparent: globalParams.pngTransparent,
    includeVideo: !globalParams.pngTransparent || globalParams.pngIncludeVideo,
  };
  let note = target.note;
  try {
    await pngRec.start({ ...opts, dirHandle: target.dirHandle });
  } catch (e) {
    // la carpeta no se pudo usar (permiso, nombre…): se prueba con ZIP
    try {
      await pngRec.start({ ...opts, dirHandle: null });
      note = ` · no se pudo escribir en esa carpeta (${e.message}): va a un ZIP`;
    } catch (e2) {
      recInfo.textContent = `error: ${e2.message}`;
      return;
    }
  }
  pngFullHandled = false;
  // con fondo transparente se ve un damero detrás del lienzo
  canvas.classList.toggle("transparent", globalParams.pngTransparent);
  recBtn.classList.add("recording");
  recBtn.textContent = "■ Detener";
  if (recPngBtn) {
    recPngBtn.classList.add("recording");
    recPngBtn.textContent = "■ Detener PNG";
  }
  recTimer = setInterval(() => {
    const s = Math.floor((performance.now() - pngRec.t0) / 1000);
    recInfo.textContent = `grabando PNG ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} · ${pngRec.frames} cuadros · ${canvas.width}×${canvas.height}${note}`;
  }, 250);
}

async function stopPngRecording() {
  clearInterval(recTimer);
  recBtn.textContent = "guardando…";
  if (recPngBtn) recPngBtn.textContent = "guardando…";
  try {
    const r = await pngRec.stop();
    recInfo.textContent =
      `listo: ${r.frames} PNG ${r.mode === "carpeta" ? "en la carpeta que elegiste" : "en un ZIP descargado (descomprimilo antes de abrirlo en After)"}` +
      (r.repeated ? ` · ${r.repeated} cuadros repetidos porque la compu no llegó (probá un lienzo más chico)` : "");
  } catch (e) {
    recInfo.textContent = `error: ${e.message}`;
  }
  recBtn.classList.remove("recording");
  recBtn.textContent = "● Grabar";
  if (recPngBtn) {
    recPngBtn.classList.remove("recording");
    recPngBtn.textContent = "● Grabar PNG";
  }
  canvas.classList.remove("transparent");
  if (pendingResize) {
    pendingResize = false;
    applyCanvasSize();
  }
}
let pngFullHandled = false;

// el botón de al lado de "Grabar": graba PNG directo, sin tocar el panel
recPngBtn?.addEventListener("click", () => {
  if (pngRec.active) stopPngRecording();
  else if (recorder.isRecording || exporting) recInfo.textContent = "ya hay otra grabación o exportación en curso";
  else startPngRecording();
});

recBtn.addEventListener("click", async () => {
  if (exporting) {
    exportCancel = true;
    return;
  }
  if (pngRec.active) return stopPngRecording();
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
  // si en el panel el formato elegido es "Secuencia de PNG", este botón graba PNG
  if (globalParams.recFormat === "png") return startPngRecording();

  // ---- video ----
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

// ---------- exportar la animación ----------
// Tres formatos (ver exporter.js):
//   "apng" → PNG animado: un solo archivo que se mueve, con transparencia
//   "gif"  → GIF animado: se mueve en cualquier lado
//   "seq"  → secuencia de PNG: una carpeta con una imagen por cuadro (para After)
// Los dos primeros no se descargan solos: antes se muestra una vista previa
// moviéndose, y se guarda con el botón "Guardar".
const gifBtn = document.getElementById("gifBtn");

// selector de duración (junto a los botones): es la misma "duración" del panel
// ("Exportar animación"), solo que a mano para no tener que buscarla
const animDur = document.getElementById("animDur");
function syncAnimDurSelect() {
  if (!animDur) return;
  const secs = globalParams.animSeconds;
  const presets = [4, 8, 10, 15, 20, 30, 45, 60];
  if (!animDur.options.length) {
    for (const v of presets) animDur.add(new Option(`${v} s`, String(v)));
  }
  // si en el panel pusieron un valor que no está en la lista, se agrega
  if (![...animDur.options].some((o) => +o.value === secs)) {
    const o = new Option(`${secs} s`, String(secs));
    const at = [...animDur.options].findIndex((x) => +x.value > secs);
    animDur.add(o, at < 0 ? null : animDur.options[at]);
  }
  animDur.value = String(secs);
}
animDur?.addEventListener("change", () => {
  globalParams.animSeconds = +animDur.value;
  pane.refresh();
});
syncAnimDurSelect();
const animPreview = document.getElementById("animPreview");
const animImg = document.getElementById("animImg");
const animInfo = document.getElementById("animInfo");
let previewUrl = null;
let previewResult = null;

function closePreview() {
  if (animPreview) animPreview.hidden = true;
  animImg?.removeAttribute("src");
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  previewResult = null;
}
document.getElementById("animClose")?.addEventListener("click", closePreview);
animPreview?.addEventListener("click", (e) => {
  if (e.target === animPreview) closePreview(); // click afuera de la tarjeta
});
document.getElementById("animSave")?.addEventListener("click", () => {
  if (!previewResult) return;
  const a = document.createElement("a");
  a.href = previewUrl;
  a.download = `${previewResult.name}.${previewResult.ext}`;
  a.click();
});

function showPreview(result, note) {
  closePreview();
  previewResult = result;
  previewUrl = URL.createObjectURL(result.blob);
  if (!animPreview) {
    // sin la tarjeta de vista previa (HTML viejo en caché): se descarga directo
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = `${result.name}.${result.ext}`;
    a.click();
    return;
  }
  animImg.src = previewUrl;
  const kb = Math.round(result.blob.size / 1024);
  const size = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
  animInfo.textContent =
    `${result.ext === "gif" ? "GIF" : "PNG animado"} · ${result.width}×${result.height} px · ${result.frames} cuadros · ${size}${note}. ` +
    (result.ext === "png" ? "Para verlo moverse abrilo en un navegador (Chrome, Safari…): el visor de imágenes de la Mac lo muestra quieto." : "");
  animPreview.hidden = false;
}

pngBtn?.addEventListener("click", () => (exporting ? (exportCancel = true) : startExport("apng", { forceTransparent: true })));
gifBtn?.addEventListener("click", () => (exporting ? (exportCancel = true) : startExport("gif")));

// ---------- convertir un PNG animado / GIF ya hecho a secuencia de PNG ----------
const convInput = document.getElementById("convInput");
convInput?.addEventListener("change", async () => {
  const file = convInput.files[0];
  convInput.value = ""; // permite elegir el mismo archivo otra vez
  if (!file || exporting || recorder.isRecording || pngRec.active) return;

  const target = await askSaveTarget();
  if (!target) return;
  const dirHandle = target.dirHandle;

  exporting = true;
  exportCancel = false;
  recBtn.classList.add("recording");
  recBtn.textContent = "■ Cancelar";
  try {
    const r = await convertAnimationToSequence({
      file,
      dirHandle,
      onProgress: ({ phase, i, total }) => (recInfo.textContent = `${phase} ${i}/${total}`),
      isCancelled: () => exportCancel,
    });
    recInfo.textContent = `listo: ${r.frames} PNG (${r.width}×${r.height}, ${r.fps} cuadros/seg) ${r.mode === "carpeta" ? "en la carpeta que elegiste" : "en un ZIP descargado: descomprimilo antes de abrirlo en After"}`;
  } catch (e) {
    recInfo.textContent = e.message === "cancelado" ? "conversión cancelada" : `error: ${e.message}`;
  } finally {
    exporting = false;
    recBtn.classList.remove("recording");
    recBtn.textContent = "● Grabar";
  }
});

async function startExport(kind, { forceTransparent = false, morph = false, seq = false } = {}) {
  if (exporting || recorder.isRecording) return;

  // Para la secuencia, la carpeta (si se eligió guardar en carpeta) se pide ANTES
  // de cualquier otra cosa: el navegador solo deja abrir el selector justo
  // después de un click.
  let dirHandle = null;
  if (kind === "seq") {
    const target = await askSaveTarget();
    if (!target) return;
    dirHandle = target.dirHandle;
  }

  // El PNG animado "sin fondo" siempre es transparente. Con fondo transparente
  // el video cargado solo entra si se lo pide; con fondo de color sí entra.
  const transparent = kind === "gif" ? globalParams.gifTransparent : forceTransparent || globalParams.pngTransparent;
  const includeVideo = !transparent || globalParams.pngIncludeVideo;

  exporting = true;
  exportCancel = false;
  recBtn.classList.add("recording");
  recBtn.textContent = "■ Cancelar exportación";
  if (pngBtn) pngBtn.textContent = "■ Cancelar";
  if (gifBtn) gifBtn.textContent = "■ Cancelar";
  try {
    const audioFile = audio.tracks[audio.currentIndex]?.file ?? null;
    // Sin audio activo las formas no reaccionan al sonido: solo se mueve lo que
    // esté animado (keyframes, giro, órbita…). Se avisa para que no sorprenda.
    const note = audioFile ? "" : " · sin audio activo: no hay reacción al sonido";
    const common = {
      scene,
      videoLayer,
      globalParams,
      audioFile,
      width: canvas.width,
      height: canvas.height,
      transparent,
      includeVideo,
      onProgress: ({ phase, i, total }) => (recInfo.textContent = `${phase} ${i}/${total}${note}`),
      isCancelled: () => exportCancel,
    };

    if (kind === "seq") {
      const r = await exportPngSequence({ ...common, seconds: seq ? scene.seqTotal() : morph ? scene.morph.seconds : globalParams.pngSeconds, fps: globalParams.pngFps, dirHandle, morph, seq });
      recInfo.textContent = `listo: ${r.frames} PNG ${r.mode === "carpeta" ? "en la carpeta que elegiste" : "en un ZIP descargado"}${note}`;
    } else {
      const run = kind === "gif" ? exportGif : exportApng;
      const r = await run({ ...common, seconds: globalParams.animSeconds, fps: globalParams.animFps, outWidth: globalParams.animWidth });
      recInfo.textContent = `listo: ${kind === "gif" ? "GIF" : "PNG animado"} de ${r.frames} cuadros${note}`;
      showPreview(r, note);
    }
  } catch (e) {
    recInfo.textContent = e.message === "cancelado" ? "exportación cancelada" : `error: ${e.message}`;
  } finally {
    exporting = false;
    recBtn.classList.remove("recording");
    recBtn.textContent = "● Grabar";
    if (pngBtn) pngBtn.textContent = "⬇ PNG animado";
    if (gifBtn) gifBtn.textContent = "⬇ GIF";
    if (pendingResize) {
      pendingResize = false;
      applyCanvasSize();
    }
  }
}

nextVideoBtn.addEventListener("click", () => videoLayer.next());
prevVideoBtn.addEventListener("click", () => videoLayer.prev());

// una marca abajo del lienzo que muestra dónde está el foco de las barras (solo
// en pantalla: está en la capa de encima, nunca entra en lo que se graba)
function drawBarFocusMarker() {
  const c = scene.selected;
  if (!octx || !c?.visible || c.params.visualMode !== "bars" || !(c.params.barFocusAmount > 0) || !c.xf) return;
  const w = canvas.width, h = canvas.height;
  const fx = c.params.barFocusX * w;
  const half = c.params.barFocusWidth * w;
  const a = scene._map(c.xf, { x: Math.max(0, fx - half), y: h });
  const b = scene._map(c.xf, { x: Math.min(w, fx + half), y: h });
  const m = scene._map(c.xf, { x: fx, y: h });
  octx.save();
  octx.strokeStyle = "rgba(255,255,255,0.55)";
  octx.lineWidth = 3;
  octx.beginPath();
  octx.moveTo(a.x, a.y - 4);
  octx.lineTo(b.x, b.y - 4);
  octx.stroke();
  octx.fillStyle = "#fff";
  octx.beginPath();
  octx.moveTo(m.x, m.y - 6);
  octx.lineTo(m.x - 8, m.y - 22);
  octx.lineTo(m.x + 8, m.y - 22);
  octx.closePath();
  octx.fill();
  octx.restore();
}

// ---------- barra de la línea de tiempo ----------
const seqBar = document.getElementById("seqBar");
const seqTrack = document.getElementById("seqTrack");
const seqBlocks = document.getElementById("seqBlocks");
const seqHead = document.getElementById("seqHead");
const seqTimeEl = document.getElementById("seqTime");
const seqPlayBtn = document.getElementById("seqPlay");

const stopHue = (i) => (i * 57 + 210) % 360;

// Arma los bloques: uno por cada "se queda" y uno por cada pasaje a la siguiente
// etapa, con ancho proporcional a su duración.
function renderSeqBar() {
  if (!seqBar) return;
  const { segs, total } = scene.seqSchedule();
  seqBar.hidden = !segs.length;
  seqBlocks.replaceChildren();
  if (!segs.length || total <= 0) return;
  segs.forEach((v, k) => {
    const next = segs[k + 1];
    const add = (dur, bg, label, sel, onClick) => {
      if (dur <= 0) return;
      const d = document.createElement("div");
      d.className = "blk" + (sel ? " sel" : "");
      d.style.width = `${(dur / total) * 100}%`;
      d.style.background = bg;
      d.textContent = label;
      d.dataset.click = onClick ? "1" : "";
      if (onClick) d.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
      seqBlocks.appendChild(d);
    };
    const sel = v.i === scene.seq.sel;
    add(v.holdEnd - v.start, `hsl(${stopHue(v.i)} 55% 38%)`, `${v.i + 1} · ${v.c.name}`, sel, () => actionsRef.seqSelect(v.i));
    if (next) add(v.end - v.holdEnd, `linear-gradient(90deg, hsl(${stopHue(v.i)} 55% 38%), hsl(${stopHue(next.i)} 55% 38%))`, "⟶", false, null);
  });
}

// la cabeza de reproducción y el reloj, en cada cuadro
function updateSeqBar() {
  if (!seqBar || seqBar.hidden) return;
  const total = scene.seqTotal();
  const q = scene.seq;
  const t = total > 0 ? scene._seqEffective(total) : 0;
  seqHead.style.left = `calc(${total > 0 ? (t / total) * 100 : 0}% - 1px)`;
  seqTimeEl.textContent = `${t.toFixed(1)} / ${total.toFixed(1)} s`;
  seqPlayBtn.textContent = q.on && q.playing ? "⏸" : "▶";
}

// al cambiar etapas: se guarda, se rearma la barra y (si hace falta) el panel
function afterSeqChange(rebuild) {
  saveSeqSettings();
  renderSeqBar();
  if (rebuild) setTimeout(buildPanel, 0);
}

function seekFromEvent(e) {
  const r = seqTrack.getBoundingClientRect();
  const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  scene.morph.on = false;
  scene.seqSeek(f * scene.seqTotal());
}
let seqScrub = false;
seqTrack?.addEventListener("pointerdown", (e) => {
  seqScrub = true;
  try { seqTrack.setPointerCapture(e.pointerId); } catch {} // (si el puntero ya no está activo, no pasa nada)
  seekFromEvent(e);
});
seqTrack?.addEventListener("pointermove", (e) => seqScrub && seekFromEvent(e));
seqTrack?.addEventListener("pointerup", () => (seqScrub = false));
seqTrack?.addEventListener("pointercancel", () => (seqScrub = false));
seqPlayBtn?.addEventListener("click", () => actionsRef.seqToggle());
renderSeqBar();

// Con la línea de tiempo pausada sobre una etapa, arrastrar sobre el lienzo
// mueve ESA etapa (su posición X / Y).
let seqDrag = null;
function seqDragTarget() {
  const q = scene.seq;
  if (!q.on || q.playing) return null;
  const st = q.stops[q.sel];
  if (!st) return null;
  const v = scene.seqSchedule().segs.find((x) => x.i === q.sel);
  if (!v) return null;
  const t = scene._seqEffective(scene.seqTotal());
  return t >= v.start - 1e-6 && t <= v.holdEnd + 1e-6 ? st : null; // solo si la barra está sobre la parte "quieta" de la etapa elegida
}

// mouse sobre el canvas: agarrar y mover los núcleos, la pieza o los círculos
// libres (qué se puede agarrar lo decide el motor visual). Doble click sobre
// un círculo libre lo borra; en otro lado, recentra la pieza.
canvas.style.touchAction = "none";
// En el modo barras no hay nada para agarrar: click / arrastrar sobre el lienzo
// pone el foco de reacción (dónde las barras reaccionan más al sonido).
let barDrag = false;
function setBarFocus(p) {
  const c = scene.selected;
  const q = scene._toLocal(c, p.x, p.y);
  c.params.barFocusX = Math.min(1, Math.max(0, q.x / canvas.width));
  if (!c.params.barFocusAmount) c.params.barFocusAmount = 0.85;
  paramsDirty = true;
}
canvas.addEventListener("pointerdown", (e) => {
  const p = toCanvas(e);
  const target = seqDragTarget();
  if (target) {
    seqDrag = { st: target, x0: p.x, y0: p.y, px: target.pos.x, py: target.pos.y };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
    return;
  }
  if (scene.pointerDown(p.x, p.y, e.altKey)) {
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  } else if (scene.selected.params.visualMode === "bars" && scene.selected.visible) {
    barDrag = true;
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    setBarFocus(p);
  }
});
canvas.addEventListener("pointermove", (e) => {
  const p = toCanvas(e);
  if (barDrag) {
    setBarFocus(p);
    return;
  }
  if (seqDrag) {
    seqDrag.st.pos.x = Math.round(seqDrag.px + p.x - seqDrag.x0);
    seqDrag.st.pos.y = Math.round(seqDrag.py + p.y - seqDrag.y0);
    return;
  }
  scene.pointerMove(p.x, p.y);
  if (!scene.isDragging) canvas.style.cursor = scene.hover(p.x, p.y) ? "grab" : "default";
});
function endDrag(e) {
  const p = toCanvas(e);
  if (barDrag) {
    barDrag = false;
    pane.refresh();
    return;
  }
  if (seqDrag) {
    seqDrag = null;
    canvas.style.cursor = "default";
    saveSeqSettings();
    pane.refresh();
    return;
  }
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
  // Mientras se graba PNG con fondo transparente, el lienzo no se pinta de color
  // (queda transparente, con el damero de CSS detrás) y el video cargado solo
  // se dibuja si se pidió incluirlo.
  const transparentLive = pngRec.active && pngRec.transparent;
  if (transparentLive) {
    ctx.clearRect(0, 0, w, h);
  } else {
    ctx.fillStyle = globalParams.bgColor;
    ctx.fillRect(0, 0, w, h);
  }
  octx?.clearRect(0, 0, w, h);

  // el audio se analiza una sola vez (con la máxima cantidad de franjas); cada
  // conjunto lo ajusta después a su propia cantidad de picos/barras
  const audioData = audio.analyze(128);

  if (!pngRec.active || pngRec.includeVideo) videoLayer.draw(ctx, w, h, globalParams, audioData, dt);
  scene.draw(ctx, w, h, audioData, dt, octx);
  drawBarFocusMarker();
  updateSeqBar();
  pngRec.tick(now); // si se está grabando PNG, toma la foto de este cuadro cuando toca
  if (pngRec.active && pngRec.full && !pngFullHandled) {
    pngFullHandled = true;
    stopPngRecording().then(() => (recInfo.textContent += " · se llenó la memoria: se guardó lo grabado hasta ahí (probá un lienzo más chico, o guardar en una carpeta)"));
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
