// Exportador: un programa aparte, liviano, SOLO para exportar.
//
// Tiene lo justo:
//   1. tus conjuntos guardados (los 💾 del programa principal, que viven en este navegador)
//   2. cargar audios y que los conjuntos reaccionen a ellos
//   3. ajustar esa reacción (fuerza, suavizado, graves / medios / general)
//   4. exportar en secuencia de PNG
// No dibuja en vivo ni tiene el panel de controles, así que no se traba: cada cuadro se
// dibuja uno por uno (ver exporter.js), con los mismos archivos que el programa principal,
// por lo que el resultado es idéntico.

import { Scene } from "./scene.js?v=20261027143919";
import { AudioEngine } from "./audioEngine.js?v=20261027143919";
import { exportPngSequence, analyzeAudioFrames, adjustAudio } from "./exporter.js?v=20261027143919";
import { listPresets, loadShared, getPreset, importPresetsText } from "./presets.js?v=20261027143919";

const $ = (id) => document.getElementById(id);
const PREFS_KEY = "visualizador-de-sonido.exportador.v2";
const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
};

const canPickFile = typeof window.showSaveFilePicker === "function";
const canPickDir = typeof window.showDirectoryPicker === "function";
const prefs = read(PREFS_KEY) ?? {};
const friendly = (msg) => Object.assign(new Error(msg), { friendly: true });

let busy = false;
let cancelFlag = false;

// ---------- 1 · conjuntos guardados ----------

function renderConjuntos() {
  const list = listPresets();
  $("noPresets").hidden = list.length > 0;
  const box = $("conjList");
  box.replaceChildren();
  const saved = prefs.conj ?? {};
  for (const p of list) {
    const st = saved[p.name];
    const row = document.createElement("div");
    row.className = "crow";
    row.dataset.name = p.name;
    const name = document.createElement("span");
    name.textContent = (p.shared ? "🌐 " : "") + p.name;
    const inc = document.createElement("input");
    inc.type = "checkbox";
    inc.className = "inc";
    inc.checked = st ? !!st.inc : false;
    const re = document.createElement("input");
    re.type = "checkbox";
    re.className = "re";
    re.checked = st ? !!st.re : p.params.reactAudio !== false; // (como lo tenías guardado)
    const upd = () => {
      row.classList.toggle("off", !inc.checked);
      save();
      onSelectionChanged();
    };
    inc.addEventListener("change", upd);
    re.addEventListener("change", () => {
      save();
      onSelectionChanged();
    });
    row.classList.toggle("off", !inc.checked);
    row.append(name, inc, re);
    box.appendChild(row);
  }
  // si no había nada elegido, se marca el primero para que no haya que hacer nada
  if (list.length && !box.querySelector(".inc:checked")) {
    box.querySelector(".inc").checked = true;
    box.querySelector(".crow").classList.remove("off");
  }
}

$("allOn").addEventListener("click", () => {
  for (const r of document.querySelectorAll(".crow")) (r.querySelector(".inc").checked = true), r.classList.remove("off");
  save();
  onSelectionChanged();
});
$("allOff").addEventListener("click", () => {
  for (const r of document.querySelectorAll(".crow")) (r.querySelector(".inc").checked = false), r.classList.add("off");
  save();
  onSelectionChanged();
});
$("importFile").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const n = importPresetsText(await f.text());
  $("status").textContent = n < 0 ? "ese archivo no es de conjuntos" : `importé ${n} conjunto${n === 1 ? "" : "s"}`;
  renderConjuntos();
});

// ---------- 2 · audios ----------

const audios = []; // { id, name, file, duration, raw (análisis liviano para el gráfico) }
let activeId = null;
let audioSeq = 0;

const active = () => audios.find((a) => a.id === activeId) ?? null;

async function durationOf(file) {
  const ctx = new OfflineAudioContext(1, 1, 44100); // (no necesita permiso para sonar)
  const buf = await ctx.decodeAudioData(await file.arrayBuffer());
  return buf.duration;
}

$("audioIn").addEventListener("change", async (e) => {
  for (const file of e.target.files ?? []) {
    $("status").textContent = `leyendo ${file.name}…`;
    try {
      const a = { id: ++audioSeq, name: file.name, file, duration: await durationOf(file), raw: null };
      audios.push(a);
      activeId ??= a.id;
      if (activeId === a.id) await selectAudio(a.id);
    } catch {
      $("status").textContent = `no pude leer "${file.name}": ¿es un audio?`;
    }
  }
  e.target.value = "";
  renderAudios();
  $("status").textContent = "Listo para exportar.";
});

function renderAudios() {
  const box = $("audioList");
  box.replaceChildren();
  for (const a of audios) {
    const row = document.createElement("div");
    row.className = "arow";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "aud";
    radio.checked = a.id === activeId;
    radio.addEventListener("change", () => selectAudio(a.id));
    const name = document.createElement("span");
    name.textContent = a.name;
    const dur = document.createElement("small");
    dur.textContent = fmt(a.duration);
    const del = document.createElement("button");
    del.textContent = "quitar";
    del.addEventListener("click", () => {
      audios.splice(audios.indexOf(a), 1);
      if (activeId === a.id) activeId = audios[0]?.id ?? null;
      renderAudios();
      if (activeId) selectAudio(activeId);
      else onAudioChanged();
    });
    row.append(radio, name, dur, del);
    box.appendChild(row);
  }
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

async function selectAudio(id) {
  activeId = id;
  const a = active();
  renderAudios();
  if (!a) return onAudioChanged();
  $("offset").max = Math.max(0, a.duration - 0.5);
  if (+$("offset").value > a.duration) $("offset").value = 0;
  await audioEng.loadFile(a.file); // se deja listo para sonar en la vista en vivo (no suena hasta tocar ▶)
  audioEng.audioEl.loop = $("loop").checked;
  audioEng.audioEl.onended = setPlayLabel; // (sin loop, al terminar el botón vuelve a "reproducir")
  audioEng.audioEl.currentTime = +$("offset").value || 0;
  setPlayLabel();
  if (!a.raw) {
    $("waveHint").textContent = "analizando el audio…";
    try {
      a.raw = await analyzeAudioFrames(a.file, Math.min(a.duration, 900), 8);
    } catch {
      a.raw = [];
    }
  }
  onAudioChanged();
}

function onAudioChanged() {
  const a = active();
  if ($("useAudioLen").checked && a) $("secs").value = Math.max(0.5, Math.floor((a.duration - +$("offset").value) * 2) / 2);
  $("waveHint").innerHTML = a
    ? 'Se ve cómo suena: <span class="k kb">graves</span> <span class="k km">medios</span> <span class="k kt">agudos</span> (ya con la fuerza y el suavizado que elegiste). La zona clara es lo que se va a exportar.'
    : 'Cargá un audio para ver cómo suena: <span class="k kb">graves</span> <span class="k km">medios</span> <span class="k kt">agudos</span>.';
  drawWave();
rebuildLive(); // arranca la vista en vivo con lo que está tildado
requestAnimationFrame(liveLoop);
  save();
}

// gráfico: cuánto de graves / medios / agudos tiene el audio en el tiempo, con los ajustes puestos
function drawWave() {
  const c = $("wave"), x = c.getContext("2d");
  x.clearRect(0, 0, c.width, c.height);
  x.fillStyle = "#0f0f15";
  x.fillRect(0, 0, c.width, c.height);
  const a = active();
  if (!a?.raw?.length) {
    x.fillStyle = "#6a6a78";
    x.font = "14px sans-serif";
    x.fillText("(sin audio)", 14, c.height / 2);
    return;
  }
  const frames = adjustAudio(a.raw, +$("gain").value, +$("smooth").value, 8);
  const totalS = Math.min(a.duration, 900);
  const X = (s) => (s / totalS) * c.width;
  // la zona que se exporta
  const off = +$("offset").value || 0;
  const len = +$("secs").value || 0;
  x.fillStyle = "rgba(122,140,255,0.16)";
  x.fillRect(X(off), 0, Math.max(2, X(Math.min(len, totalS - off))), c.height);
  const line = (key, color) => {
    x.beginPath();
    frames.forEach((f, i) => {
      const px = X(i / 8), py = c.height - 6 - f[key] * (c.height - 14);
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    });
    x.strokeStyle = color;
    x.lineWidth = 1.5;
    x.stroke();
  };
  line("treble", "#5dc2ff");
  line("mid", "#5dff9a");
  line("bass", "#ff5d7a");
}

$("offset").addEventListener("input", () => {
  if (audioEng.audioEl) audioEng.audioEl.currentTime = +$("offset").value || 0; // el audio se ubica donde se va a empezar
  onAudioChanged();
});

// ---------- 3 · reacción ----------

const RANGES = { gain: 1, smooth: 0, kBass: 1, kMid: 1, kAll: 1 };
function initRanges() {
  for (const [id, def] of Object.entries(RANGES)) {
    const set = () => ($(id + "Out").textContent = id === "smooth" ? (+$(id).value).toFixed(2) : "×" + (+$(id).value).toFixed(2));
    $(id).value = prefs[id] ?? def;
    set();
    $(id).addEventListener("input", () => {
      set();
      if (id === "gain" || id === "smooth") drawWave();
rebuildLive(); // arranca la vista en vivo con lo que está tildado
requestAnimationFrame(liveLoop);
      save();
    });
  }
}
$("resetReact").addEventListener("click", () => {
  for (const [id, def] of Object.entries(RANGES)) {
    $(id).value = def;
    $(id).dispatchEvent(new Event("input"));
  }
});

// ---------- armar la escena ----------

function buildScene() {
  const rows = [...document.querySelectorAll(".crow")].filter((r) => r.querySelector(".inc").checked);
  if (!rows.length) throw friendly("tildá al menos un conjunto en \"Tus conjuntos guardados\"");
  const sc = new Scene();
  rows.forEach((r, i) => {
    const p = getPreset(r.dataset.name);
    if (!p) return;
    const c = i === 0 ? sc.replaceFromPreset(p) : sc.addFromPreset(p);
    c.params.reactAudio = r.querySelector(".re").checked;
    // los tres multiplicadores se aplican sobre lo que cada conjunto ya tenía guardado
    c._base = { b: c.params.bassReactivity, m: c.params.midReactivity, o: c.params.overallReactivity };
    applyReact(c);
  });
  return sc;
}

// ---------- 4 · en vivo: ver, mover y grabar los movimientos ----------

const audioEng = new AudioEngine();
let liveScene = null;
let rec = null; // grabación de movimientos en curso: { start, events, snap, W, H }
let lastRec = null; // la última grabación terminada (se exporta con "Exportar lo que moví")
let prevLive = null; // para el suavizado en vivo

const logicalSize = () => [Math.max(64, Math.round((+$("w").value || 1920) / 2) * 2), Math.max(64, Math.round((+$("h").value || 1080) / 2) * 2)];

// los multiplicadores de reacción se aplican sobre lo que cada conjunto traía guardado
function applyReact(c) {
  c.params.bassReactivity = c._base.b * +$("kBass").value;
  c.params.midReactivity = c._base.m * +$("kMid").value;
  c.params.overallReactivity = c._base.o * +$("kAll").value;
}

function rebuildLive(message) {
  try {
    liveScene = buildScene();
    for (const c of liveScene.conjuntos) c.params.mixHandles = $("handles").checked;
    $("liveInfo").textContent = message ?? "Listo: movés las auras con el mouse.";
  } catch (e) {
    liveScene = null;
    $("liveInfo").textContent = e.friendly ? `⚠ ${e.message}` : `error: ${e.message}`;
  }
}

// lo mismo que adjustAudio (exporter.js) pero cuadro a cuadro, para la vista en vivo
function liveAdjust(f, dt) {
  const g = +$("gain").value, sm = +$("smooth").value;
  const keep = sm > 0 ? Math.pow(Math.min(0.97, sm), 30 * dt) : 0;
  const cl = (v) => Math.max(0, Math.min(1, v));
  const cur = { ...f, bass: cl(f.bass * g), mid: cl(f.mid * g), treble: cl(f.treble * g), overall: cl(f.overall * g), spectrum: f.spectrum.map((v) => cl(v * g)) };
  if (prevLive && keep > 0) {
    for (const k of ["bass", "mid", "treble", "overall"]) cur[k] = prevLive[k] * keep + cur[k] * (1 - keep);
    cur.spectrum = cur.spectrum.map((v, i) => (prevLive.spectrum[i] ?? 0) * keep + v * (1 - keep));
  }
  prevLive = cur;
  return cur;
}

const liveCv = $("live"), liveCtx = liveCv.getContext("2d");
const ovCv = $("liveOv"), ovCtx = ovCv.getContext("2d");
let lastT = performance.now(), infoT = 0;

function liveLoop(now) {
  requestAnimationFrame(liveLoop);
  const dt = Math.min(0.05, Math.max(0.001, (now - lastT) / 1000));
  lastT = now;
  if (busy) return; // mientras exporta, la vista en vivo espera
  const [W, H] = logicalSize();
  const s = Math.min(1, 640 / W); // la vista en vivo es liviana: como mucho 640 px de ancho
  const PW = Math.max(2, Math.round(W * s)), PH = Math.max(2, Math.round(H * s));
  if (liveCv.width !== PW || liveCv.height !== PH) {
    liveCv.width = ovCv.width = PW;
    liveCv.height = ovCv.height = PH;
  }
  liveCtx.setTransform(1, 0, 0, 1, 0, 0);
  liveCtx.clearRect(0, 0, PW, PH);
  if (!$("transparent").checked) {
    liveCtx.fillStyle = $("bg").value;
    liveCtx.fillRect(0, 0, PW, PH);
  }
  ovCtx.setTransform(1, 0, 0, 1, 0, 0);
  ovCtx.clearRect(0, 0, PW, PH);
  if (!liveScene) return;
  ovCtx.setTransform(s, 0, 0, s, 0, 0);
  liveCtx.setTransform(s, 0, 0, s, 0, 0);
  liveScene.renderScale = s;
  liveScene.timeline.playing = true; // (los keyframes de los conjuntos también se ven, como saldrán)
  liveScene.draw(liveCtx, W, H, liveAdjust(audioEng.analyze(128), dt), dt, ovCtx);
  if (countdown) drawCountdown(ovCtx, W, H, now);
  if (now - infoT > 250) {
    infoT = now;
    if (countdown) $("liveInfo").textContent = "Preparate: acomodá las auras. Cuando termine la cuenta arranca el audio y se graba.";
    else if (rec) $("liveInfo").textContent = `● grabando ${fmt(Math.max(0, now - rec.start) / 1000)} · ${rec.events.length} movimientos anotados`;
    else if (audioEng.audioEl) $("liveInfo").textContent = `audio ${fmt(audioEng.audioEl.currentTime)} / ${fmt(audioEng.audioEl.duration || 0)}${audioEng.isPlaying ? "" : audioEng.audioEl.ended ? " (terminó)" : " (en pausa)"}`;
  }
}

// el mouse sobre la vista en vivo (mismo manejo que en el programa principal)
const toLogical = (e) => {
  const r = liveCv.getBoundingClientRect();
  const [W, H] = logicalSize();
  return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
};
const note = (k, p, a = false) => rec?.events.push({ t: (performance.now() - rec.start) / 1000, k, x: p.x, y: p.y, a });
liveCv.addEventListener("pointerdown", (e) => {
  if (!liveScene) return;
  const p = toLogical(e);
  if (liveScene.pointerDown(p.x, p.y, e.altKey)) {
    try {
      liveCv.setPointerCapture(e.pointerId);
    } catch {} // (si el puntero ya no está activo, no pasa nada)
    liveCv.style.cursor = "grabbing";
  }
  note("d", p, e.altKey);
});
liveCv.addEventListener("pointermove", (e) => {
  if (!liveScene) return;
  const p = toLogical(e);
  liveScene.pointerMove(p.x, p.y);
  if (!liveScene.isDragging) liveCv.style.cursor = liveScene.hover(p.x, p.y) ? "grab" : "default";
  if (rec) note("m", p);
});
const up = (e) => {
  if (!liveScene) return;
  liveScene.pointerUp();
  liveCv.style.cursor = "default";
  note("u", toLogical(e));
};
liveCv.addEventListener("pointerup", up);
liveCv.addEventListener("pointercancel", up);
liveCv.addEventListener("dblclick", (e) => {
  if (!liveScene) return;
  const p = toLogical(e);
  liveScene.doubleClick(p.x, p.y);
  note("x", p);
});

function setPlayLabel() {
  $("playBtn").textContent = audioEng.isPlaying ? "⏸ pausar audio" : "▶ reproducir audio";
}
$("playBtn").addEventListener("click", () => {
  if (!audioEng.audioEl) {
    $("liveInfo").textContent = "Primero cargá un audio (paso 2).";
    return;
  }
  if (!audioEng.isPlaying && audioEng.audioEl.ended) audioEng.audioEl.currentTime = +$("offset").value || 0; // (si había terminado, vuelve a empezar)
  audioEng.isPlaying ? audioEng.pause() : audioEng.play();
  setPlayLabel();
});
$("recenter").addEventListener("click", () => liveScene?.conjuntos.forEach((c) => c.engine.resetPiece()));
$("restart").addEventListener("click", () => rebuildLive("Empezó de nuevo, con los conjuntos como los guardaste."));
$("loop").addEventListener("change", () => {
  if (audioEng.audioEl) audioEng.audioEl.loop = $("loop").checked;
  save();
});
$("handles").addEventListener("change", () => liveScene?.conjuntos.forEach((c) => (c.params.mixHandles = $("handles").checked)));

// cuenta regresiva 3·2·1 antes de grabar: el audio arranca recién cuando termina
const COUNT_SECS = 3;
let countdown = null; // { t0, timer }

function drawCountdown(ctx, W, H, now) {
  const el = (now - countdown.t0) / 1000;
  const n = Math.max(1, COUNT_SECS - Math.floor(el));
  const f = el - Math.floor(el); // 0 → 1 dentro de cada segundo
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${0.25 * (1 - f)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = Math.min(1, 1.4 - f);
  ctx.font = `700 ${Math.round(H * 0.4 * (1 + 0.25 * (1 - f)))}px -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(2, H * 0.012);
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.fillStyle = "#fff";
  ctx.strokeText(n, W / 2, H / 2);
  ctx.fillText(n, W / 2, H / 2);
  ctx.restore();
}

function cancelCountdown(message) {
  if (!countdown) return;
  clearTimeout(countdown.timer);
  countdown = null;
  $("recMoves").textContent = "● grabar mis movimientos";
  $("recMoves").classList.remove("rec");
  if (message) $("liveInfo").textContent = message;
}

function beginRec() {
  countdown = null;
  if (!liveScene) return cancelCountdown();
  // si hay un audio cargado, suena mientras se graba (así los movimientos y el audio quedan sincronizados)
  if (active()) {
    if (audioEng.audioEl.ended) audioEng.audioEl.currentTime = +$("offset").value || 0;
    if (!audioEng.isPlaying) audioEng.play();
    setPlayLabel();
  }
  const [W, H] = logicalSize();
  rec = {
    start: performance.now(),
    events: [],
    W,
    H,
    snap: {
      clock: liveScene.clock,
      tl: liveScene.timeline.time,
      conj: liveScene.conjuntos.map((c) => ({ state: c.engine.exportState(), spin: c.spinAngle })),
      audioT: audioEng.audioEl?.currentTime ?? 0,
      audioId: active()?.id ?? null,
      loop: $("loop").checked,
    },
  };
  $("recMoves").textContent = "■ parar de grabar";
  $("recMoves").classList.add("rec");
}

$("recMoves").addEventListener("click", () => {
  if (busy) return;
  if (countdown) return cancelCountdown("Cancelaste la cuenta regresiva.");
  if (rec) {
    // parar: queda todo anotado
    rec.duration = (performance.now() - rec.start) / 1000;
    lastRec = rec;
    rec = null;
    $("recMoves").textContent = "● grabar mis movimientos";
    $("recMoves").classList.remove("rec");
    $("goMoves").disabled = false;
    $("goMoves").textContent = `▶ Exportar lo que moví (grabé ${lastRec.duration.toFixed(1)} s)`;
    $("liveInfo").textContent = `Grabé ${lastRec.duration.toFixed(1)} s con ${lastRec.events.length} movimientos. Ya podés exportarlo abajo (paso 5), o grabar de nuevo.`;
    return;
  }
  if (!liveScene) return rebuildLive();
  // el audio espera en pausa hasta que termine la cuenta (3 · 2 · 1); mientras tanto podés acomodar las auras
  if (audioEng.isPlaying) {
    audioEng.pause();
    setPlayLabel();
  }
  countdown = { t0: performance.now(), timer: setTimeout(beginRec, COUNT_SECS * 1000) };
  $("recMoves").textContent = "✕ cancelar la cuenta";
  $("recMoves").classList.add("rec");
  $("liveInfo").textContent = "Preparate: acomodá las auras. Cuando termine la cuenta arranca el audio y se graba.";
});

// la escena de la vista en vivo se vuelve a armar cuando cambian los conjuntos incluidos (se pierden las posiciones movidas)
function onSelectionChanged() {
  rebuildLive();
}
for (const id of ["kBass", "kMid", "kAll"]) $(id).addEventListener("input", () => liveScene?.conjuntos.forEach(applyReact));

// ---------- 5 · exportar ----------

function finalScale() {
  const W = +$("w").value, H = +$("h").value;
  let k = +$("scale").value;
  const fits = (n) => W * n <= 32000 && H * n <= 32000 && W * H * n * n <= 268_000_000;
  while (k > 1 && !fits(k)) k--;
  return k;
}
function updateFinalSize() {
  const W = +$("w").value, H = +$("h").value, want = +$("scale").value, k = finalScale();
  $("finalSize").textContent = `Salen imágenes de ${W * k} × ${H * k} px` + (k !== want ? ` (la resolución se bajó a ×${k}: más grande no aguanta el navegador)` : "");
}
function updateDestHint() {
  const d = $("dest").value;
  const opt = (v) => $("dest").querySelector(`option[value="${v}"]`);
  opt("zipfile").disabled = !canPickFile;
  opt("folder").disabled = !canPickDir;
  $("destHint").textContent =
    d === "zipfile"
      ? "Te pide dónde guardar el ZIP antes de empezar y lo escribe de a poco (lo mejor para muchos cuadros). Descomprimilo antes de abrirlo en After."
      : d === "zip"
        ? "Se arma en memoria y se descarga al final (con muchos cuadros o un tamaño grande puede quedarse sin memoria)."
        : "Elegí una carpeta nueva (Chrome no deja usar Escritorio, Descargas ni Documentos directamente).";
  if (!canPickFile && !canPickDir) $("destHint").textContent += " Este navegador solo puede descargar un ZIP.";
}
$("preset").addEventListener("change", () => {
  const m = /^(\d+)x(\d+)$/.exec($("preset").value);
  if (m) {
    $("w").value = m[1];
    $("h").value = m[2];
  }
  updateFinalSize();
  save();
});
for (const id of ["w", "h"]) {
  $(id).addEventListener("input", () => {
    $("preset").value = "custom";
    updateFinalSize();
  });
}
$("scale").addEventListener("change", updateFinalSize);
$("dest").addEventListener("change", updateDestHint);
$("transparent").addEventListener("change", () => ($("bgRow").hidden = $("transparent").checked));
$("useAudioLen").addEventListener("change", onAudioChanged);
$("secs").addEventListener("input", drawWave);
for (const id of ["w", "h", "scale", "fps", "secs", "dest", "transparent", "bg", "useAudioLen"]) $(id).addEventListener("change", save);

function save() {
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        conj: Object.fromEntries([...document.querySelectorAll(".crow")].map((r) => [r.dataset.name, { inc: r.querySelector(".inc").checked, re: r.querySelector(".re").checked }])),
        gain: +$("gain").value,
        smooth: +$("smooth").value,
        kBass: +$("kBass").value,
        kMid: +$("kMid").value,
        kAll: +$("kAll").value,
        preset: $("preset").value,
        w: +$("w").value,
        h: +$("h").value,
        scale: +$("scale").value,
        fps: +$("fps").value,
        secs: +$("secs").value,
        useAudioLen: $("useAudioLen").checked,
        loop: $("loop").checked,
        transparent: $("transparent").checked,
        bg: $("bg").value,
        dest: $("dest").value,
        offset: +$("offset").value,
      })
    );
  } catch {}
}

function setBusy(on) {
  busy = on;
  $("cancel").disabled = !on;
  for (const el of document.querySelectorAll("main select, main input, main button")) {
    if (el.id !== "cancel") el.disabled = on;
  }
  if (!on) {
    $("goMoves").disabled = !lastRec; // (solo se puede exportar lo que moví si ya grabé algo)
    updateDestHint();
  }
}

// dónde se guarda: se pide ANTES de empezar (el navegador solo deja abrir el selector justo después de un click)
async function pickTarget() {
  const d = $("dest").value;
  try {
    if (d === "zipfile" && canPickFile) {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: `secuencia-png-${new Date().toISOString().slice(0, 10)}.zip`,
        types: [{ description: "Archivo ZIP", accept: { "application/zip": [".zip"] } }],
      });
      return { fileHandle, dirHandle: null };
    }
    if (d === "folder" && canPickDir) return { dirHandle: await window.showDirectoryPicker({ mode: "readwrite" }), fileHandle: null };
  } catch (e) {
    if (e.name === "AbortError") return null; // cerró la ventana: no se hace nada
    $("status").textContent = `no se pudo usar ese destino (${e.message}): se descarga un ZIP`;
  }
  return { dirHandle: null, fileHandle: null };
}

const previewCtx = $("preview").getContext("2d");
function drawPreview(canvas, i) {
  if (i % 3 !== 0) return; // una miniatura cada tres cuadros alcanza
  const pc = $("preview");
  const h = Math.max(1, Math.round((pc.width * canvas.height) / canvas.width));
  if (pc.height !== h) pc.height = h;
  previewCtx.clearRect(0, 0, pc.width, pc.height);
  previewCtx.drawImage(canvas, 0, 0, pc.width, pc.height);
}

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on) wakeLock = await navigator.wakeLock?.request("screen"); // (que la compu no se duerma mientras exporta)
    else {
      await wakeLock?.release();
      wakeLock = null;
    }
  } catch {}
}
window.addEventListener("beforeunload", (e) => {
  if (busy) e.preventDefault(); // (si cerrás la pestaña mientras exporta, se pierde)
});

// withMoves = true: se exporta lo que se grabó en la vista en vivo (los movimientos del mouse y por dónde iba el audio)
async function run(withMoves = false) {
  if (busy) return;
  if (withMoves && !lastRec) return;
  const target = await pickTarget();
  if (!target) {
    $("status").textContent = "no elegiste dónde guardar, así que no se hizo nada";
    return;
  }
  audioEng.pause(); // (mientras exporta no suena ni se dibuja en vivo)
  setPlayLabel();
  setBusy(true);
  cancelFlag = false;
  $("bar").value = 0;
  await keepAwake(true);
  let t0 = 0;
  try {
    const W = Math.round(+$("w").value / 2) * 2, H = Math.round(+$("h").value / 2) * 2;
    const k = finalScale();
    const fps = +$("fps").value;
    const r0 = withMoves ? lastRec : null;
    const secs = r0 ? r0.duration : +$("secs").value;
    if (!(fps > 0) || !(secs > 0) || Math.round(secs * fps) < 1) throw friendly("revisá los cuadros por segundo y la duración: no daría ningún cuadro");
    if (!(W >= 64 && H >= 64)) throw friendly("el ancho y el alto tienen que ser de al menos 64 px");
    const scene = buildScene();
    // el audio de ese momento (si se grabó con uno) o el elegido ahora
    const a = r0 ? audios.find((x) => x.id === r0.snap.audioId) ?? null : active();
    let note = a ? ` · audio: ${a.name}` : " · sin audio: no hay reacción al sonido";
    if (k !== +$("scale").value) note += ` · resolución bajada a ×${k}`;
    if (r0) note += " · repitiendo lo que moviste";

    let replay = {};
    if (r0) {
      // las piezas arrancan donde estaban cuando empezó la grabación
      scene.conjuntos.forEach((c, i) => {
        const sn = r0.snap.conj[i];
        if (!sn) return;
        c.engine.importState(sn.state);
        c.spinAngle = sn.spin;
      });
      const ev = r0.events;
      let ei = 0;
      const fx = W / r0.W, fy = H / r0.H; // (por si cambió el tamaño entre grabar y exportar)
      replay = {
        clockStart: r0.snap.clock,
        timelineStart: r0.snap.tl,
        beforeFrame: async (i, t, ctx) => {
          // una pasada mínima para que cada pieza sepa dónde está antes del primer clic
          if (i === 0) {
            const tmp = document.createElement("canvas");
            tmp.width = tmp.height = 8;
            ctx.scene.draw(tmp.getContext("2d"), ctx.W, ctx.H, ctx.audio, 1e-4);
          }
          // se aplican los movimientos del mouse que ocurrieron hasta este momento
          while (ei < ev.length && ev[ei].t <= t) {
            const e = ev[ei++];
            if (e.k === "d") ctx.scene.pointerDown(e.x * fx, e.y * fy, e.a);
            else if (e.k === "m") ctx.scene.pointerMove(e.x * fx, e.y * fy);
            else if (e.k === "u") ctx.scene.pointerUp();
            else ctx.scene.doubleClick(e.x * fx, e.y * fy);
          }
        },
      };
    }

    const r = await exportPngSequence({
      scene,
      videoLayer: { active: null, draw() {} },
      globalParams: { bgColor: $("bg").value },
      ...replay,
      audioFile: a?.file ?? null,
      audioOffset: r0 ? r0.snap.audioT : +$("offset").value || 0,
      audioLoop: r0 ? r0.snap.loop : $("loop").checked,
      audioGain: +$("gain").value,
      audioSmooth: +$("smooth").value,
      width: W,
      height: H,
      transparent: $("transparent").checked,
      includeVideo: false,
      seconds: secs,
      fps,
      scale: k,
      dirHandle: target.dirHandle,
      fileHandle: target.fileHandle,
      onPreview: drawPreview,
      onProgress: ({ phase, i, total }) => {
        const now = performance.now();
        if (i === 0) t0 = now;
        $("bar").max = Math.max(1, total);
        $("bar").value = i;
        const eta = phase === "dibujando cuadros" && i > 2 ? ((now - t0) / i) * (total - i) : 0;
        const etaTxt = eta > 1500 ? ` · faltan ~${eta > 90000 ? Math.round(eta / 60000) + " min" : Math.round(eta / 1000) + " s"}` : "";
        $("status").textContent = `${phase} ${i}/${total}${etaTxt}${note}`;
      },
      isCancelled: () => cancelFlag,
    });
    const where = r.mode === "carpeta" ? "en la carpeta que elegiste" : r.mode === "archivo" ? "en el ZIP que elegiste" : "en un ZIP descargado";
    $("bar").value = $("bar").max;
    $("status").textContent = r.cancelled
      ? `cancelado: se guardaron los ${r.frames} cuadros que ya estaban hechos ${where}.`
      : r.full
        ? `listo hasta donde alcanzó la memoria: ${r.frames} PNG ${where}. Para más cuadros usá "un archivo ZIP que elijo".`
        : `✅ listo: ${r.frames} PNG de ${W * k} × ${H * k} px ${where}. Descomprimí el ZIP y, en After: Archivo > Importar > primer PNG > "PNG Sequence".`;
  } catch (e) {
    $("status").textContent = e.message === "cancelado" ? "exportación cancelada" : e.friendly ? `⚠ ${e.message}` : `error: ${e.message}`;
  } finally {
    await keepAwake(false);
    setBusy(false);
  }
}
$("go").addEventListener("click", () => run(false));
$("goMoves").addEventListener("click", () => run(true));
$("cancel").addEventListener("click", () => {
  cancelFlag = true;
  $("status").textContent = "cancelando… (se guarda lo que ya estaba hecho)";
});

// ---------- arranque ----------

await loadShared("conjuntos-compartidos.json");
renderConjuntos();
initRanges();
$("preset").value = prefs.preset ?? "1920x1080";
$("w").value = prefs.w ?? 1920;
$("h").value = prefs.h ?? 1080;
$("scale").value = String(prefs.scale ?? 1);
$("fps").value = String(prefs.fps ?? 30);
$("secs").value = prefs.secs ?? 10;
$("useAudioLen").checked = prefs.useAudioLen ?? true;
$("loop").checked = prefs.loop ?? false; // (por defecto el audio suena una sola vez)
$("transparent").checked = prefs.transparent ?? true;
$("bgRow").hidden = $("transparent").checked;
$("bg").value = prefs.bg ?? "#05050a";
$("dest").value = prefs.dest ?? (canPickFile ? "zipfile" : "zip");
if ($("dest").selectedOptions[0]?.disabled) $("dest").value = "zip";
$("offset").value = prefs.offset ?? 0;
updateFinalSize();
updateDestHint();
drawWave();
rebuildLive(); // arranca la vista en vivo con lo que está tildado
requestAnimationFrame(liveLoop);
