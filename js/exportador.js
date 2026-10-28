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

import { Scene } from "./scene.js?v=20261028173051";
import { AudioEngine } from "./audioEngine.js?v=20261028173051";
import { exportPngSequence, analyzeAudioFrames, adjustAudio, renderAnimation } from "./exporter.js?v=20261028173051";
import { listPresets, loadShared, getPreset, importPresetsText } from "./presets.js?v=20261028173051";

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
  // el orden de las capas: el que dejaste; sin orden guardado, las auras de colores (mezcla) van al fondo,
  // porque ocupan toda la imagen y taparían lo que se dibuje antes
  const order = prefs.order ?? [];
  const rank = (p) => (order.includes(p.name) ? order.indexOf(p.name) : order.length);
  const list = listPresets()
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || (b.p.params.visualMode === "mix") - (a.p.params.visualMode === "mix") || a.i - b.i)
    .map((x) => x.p);
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
    inc.checked = prefs.incAll ? (st ? !!st.inc : true) : true; // (por defecto entran todos; después queda lo que tildaste)
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
    const mv = document.createElement("span");
    mv.className = "mv";
    for (const [txt, dir, tip] of [["▲", -1, "subir (queda más al fondo)"], ["▼", 1, "bajar (queda más arriba)"]]) {
      const b = document.createElement("button");
      b.textContent = txt;
      b.title = tip;
      b.addEventListener("click", () => {
        const other = dir < 0 ? row.previousElementSibling : row.nextElementSibling;
        if (!other) return;
        if (dir < 0) box.insertBefore(row, other);
        else box.insertBefore(other, row);
        save();
        onSelectionChanged();
      });
      mv.appendChild(b);
    }
    row.append(name, inc, re, mv);
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
    c._focus = { x: c.params.barFocusX, w: c.params.barFocusWidth, a: c.params.barFocusAmount };
    applyReact(c);
  });
  return sc;
}

// ---------- 4 · en vivo: ver, mover y grabar los movimientos ----------

const audioEng = new AudioEngine();
let liveScene = null;
let rec = null; // grabación de movimientos en curso: { start, events, snap, W, H }
const REC_KEY = "visualizador-de-sonido.exportador.grabacion.v1";
let lastRec = read(REC_KEY); // la última grabación terminada (se exporta con "Exportar lo que moví"); queda guardada aunque refresques
if (!(lastRec?.events && lastRec.snap && lastRec.duration > 0)) lastRec = null;
function saveRec() {
  try {
    localStorage.setItem(REC_KEY, JSON.stringify(lastRec));
    return true;
  } catch {
    return false; // (si es muy larga y no entra, queda solo mientras la página esté abierta)
  }
}
let prevLive = null; // para el suavizado en vivo

const logicalSize = () => [Math.max(64, Math.round((+$("w").value || 1920) / 2) * 2), Math.max(64, Math.round((+$("h").value || 1080) / 2) * 2)];

// los multiplicadores de reacción se aplican sobre lo que cada conjunto traía guardado
function applyReact(c) {
  c.params.bassReactivity = c._base.b * +$("kBass").value;
  c.params.midReactivity = c._base.m * +$("kMid").value;
  c.params.overallReactivity = c._base.o * +$("kAll").value;
  applyFocus(c);
}

// el centro de reacción de las barras: el que elegiste acá (si está tildado) o el que traía el conjunto guardado
const readFocus = () => ({ on: $("fcOn").checked, x: +$("fcX").value, w: +$("fcW").value, a: +$("fcA").value });
function applyFocus(c, f = readFocus()) {
  if (c.params.visualMode !== "bars" || !c._focus) return;
  const v = f.on ? f : c._focus;
  c.params.barFocusX = v.x;
  c.params.barFocusWidth = v.w;
  c.params.barFocusAmount = v.a;
}
const showFocus = () => {
  $("fcXOut").textContent = (+$("fcX").value).toFixed(2);
  $("fcWOut").textContent = (+$("fcW").value).toFixed(2);
  $("fcAOut").textContent = (+$("fcA").value).toFixed(2);
};
// lo cambiado a mano queda anotado en la grabación (para repetirlo al exportar)
function focusChanged() {
  showFocus();
  liveScene?.conjuntos.forEach((c) => applyFocus(c));
  if (rec) rec.events.push({ t: (performance.now() - rec.start) / 1000, k: "f", f: readFocus() });
  save();
}
for (const id of ["fcOn", "fcX", "fcW", "fcA"]) $(id).addEventListener("input", focusChanged);
$("fcOn").addEventListener("change", focusChanged);

let visWarn = ""; // aviso de conjuntos que no se ven en la imagen final
// Revisa si cada conjunto realmente se ve en la imagen final: dibuja la imagen con y sin él, y si no cambia
// nada es que está tapado por otro (por ejemplo un aura de colores que cubre todo) o que no dibuja nada.
function hiddenConjuntos() {
  try {
    const [W, H] = logicalSize();
    const s = Math.min(1, 320 / W);
    const PW = Math.max(8, Math.round(W * s)), PH = Math.max(8, Math.round(H * s));
    const au = { bass: 0.5, mid: 0.5, treble: 0.4, overall: 0.5, centroid: 0.4, spectrum: new Array(128).fill(0.5) };
    const frame = (hide) => {
      const sc = buildScene();
      sc.conjuntos.forEach((c, i) => {
        const lv = liveScene?.conjuntos[i];
        if (lv && liveScene.conjuntos.length === sc.conjuntos.length) {
          c.engine.importState(lv.engine.exportState());
          c.spinAngle = lv.spinAngle;
        }
        c.params.mixHandles = false;
        if (i === hide) c.visible = false;
      });
      const cv = document.createElement("canvas");
      cv.width = PW;
      cv.height = PH;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      sc.renderScale = s;
      sc.timeline.playing = true;
      for (let k = 0; k < 24; k++) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, PW, PH);
        if (!$("transparent").checked) {
          ctx.fillStyle = $("bg").value;
          ctx.fillRect(0, 0, PW, PH);
        }
        ctx.setTransform(s, 0, 0, s, 0, 0);
        sc.draw(ctx, W, H, au, 1 / 30);
      }
      return { px: ctx.getImageData(0, 0, PW, PH).data, names: sc.conjuntos.map((c) => c.name) };
    };
    const all = frame(-1);
    if (all.names.length < 2) return [];
    const bad = [];
    all.names.forEach((name, i) => {
      const without = frame(i).px;
      let changed = 0;
      for (let k = 0; k < without.length; k += 4) {
        // como se vería sobre negro (el color por la opacidad): lo que cambia a simple vista
        const a1 = without[k + 3] / 255, a2 = all.px[k + 3] / 255;
        const d = Math.abs(without[k] * a1 - all.px[k] * a2) + Math.abs(without[k + 1] * a1 - all.px[k + 1] * a2) + Math.abs(without[k + 2] * a1 - all.px[k + 2] * a2);
        if (d > 30) changed++;
      }
      if (changed / (without.length / 4) < 0.01) bad.push(name); // (si sacarlo cambia menos del 1% de la imagen, no se ve)
    });
    return bad;
  } catch (e) {
    console.warn("no se pudo revisar qué conjuntos se ven:", e);
    return [];
  }
}

function rebuildLive(message) {
  try {
    liveScene = buildScene();
    for (const c of liveScene.conjuntos) c.params.mixHandles = $("handles").checked;
    const names = liveScene.conjuntos.map((c) => c.name);
    const hidden = hiddenConjuntos();
    visWarn = hidden.length ? ` ⚠ En la imagen NO se ve: ${hidden.join(", ")} (lo tapa otro conjunto o no dibuja nada). Probá subirlo o bajarlo con ▲ ▼ en el paso 1.` : "";
    $("liveInfo").textContent = (message ?? "Listo: movés las auras con el mouse.") +
      (names.length > 1 ? ` Se dibujan ${names.length}, de atrás para adelante: ${names.join(" → ")}.` : ` Se dibuja: ${names[0]}.`) +
      visWarn;
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
  if (rec && now - rec.lastS >= 33) {
    rec.lastS = now;
    rec.samples.push(sampleScene((now - rec.start) / 1000));
  }
  if ($("handles").checked) for (const c of liveScene.conjuntos) drawFocusMarker(ovCtx, c, W, H);
  if (countdown) drawCountdown(ovCtx, W, H, now);
  if (now - infoT > 250) {
    infoT = now;
    if (countdown) $("liveInfo").textContent = "Preparate: acomodá las auras. Cuando termine la cuenta arranca el audio y se graba.";
    else if (rec) $("liveInfo").textContent = `● grabando ${fmt(Math.max(0, now - rec.start) / 1000)} · ${rec.events.length} movimientos anotados`;
    else if (audioEng.audioEl) $("liveInfo").textContent = `audio ${fmt(audioEng.audioEl.currentTime)} / ${fmt(audioEng.audioEl.duration || 0)}${audioEng.isPlaying ? "" : audioEng.audioEl.ended ? " (terminó)" : " (en pausa)"}${visWarn}`;
  }
}

// una marca abajo que muestra dónde está el centro de reacción de las barras (solo en pantalla, nunca en lo exportado)
function drawFocusMarker(ctx, c, w, h) {
  if (!c.visible || c.params.visualMode !== "bars" || !(c.params.barFocusAmount > 0) || !c.xf) return;
  const fx = c.params.barFocusX * w, half = c.params.barFocusWidth * w;
  const a = liveScene._map(c.xf, { x: Math.max(0, fx - half), y: h });
  const b = liveScene._map(c.xf, { x: Math.min(w, fx + half), y: h });
  const m = liveScene._map(c.xf, { x: fx, y: h });
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y - 4);
  ctx.lineTo(b.x, b.y - 4);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(m.x, m.y - 6);
  ctx.lineTo(m.x - 8, m.y - 22);
  ctx.lineTo(m.x + 8, m.y - 22);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// click / arrastre sobre el lienzo cuando no se agarra nada: pone el centro de reacción de las barras
let focusDrag = false;
function dragFocus(p) {
  const c = liveScene?.conjuntos.find((x) => x.visible && x.params.visualMode === "bars");
  if (!c) return false;
  const q = liveScene._toLocal(c, p.x, p.y);
  const W = logicalSize()[0];
  $("fcX").value = Math.min(1, Math.max(0, q.x / W));
  if (!$("fcOn").checked) {
    $("fcOn").checked = true; // al mover el centro por primera vez se activa solo (si no, no se notaría)
    if (!(+$("fcA").value > 0)) $("fcA").value = 0.85;
  }
  focusChanged();
  return true;
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
  } else if (dragFocus(p)) {
    focusDrag = true;
    try {
      liveCv.setPointerCapture(e.pointerId);
    } catch {}
  }
  note("d", p, e.altKey);
});
liveCv.addEventListener("pointermove", (e) => {
  if (!liveScene) return;
  const p = toLogical(e);
  liveScene.pointerMove(p.x, p.y);
  if (focusDrag) dragFocus(p);
  if (!liveScene.isDragging) liveCv.style.cursor = liveScene.hover(p.x, p.y) ? "grab" : "default";
  if (rec) note("m", p);
});
const up = (e) => {
  if (!liveScene) return;
  liveScene.pointerUp();
  focusDrag = false;
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
$("restart").addEventListener("click", () => {
  if (audioEng.audioEl) audioEng.audioEl.currentTime = +$("offset").value || 0; // el audio vuelve al segundo que elegiste
  rebuildLive("Empezó de nuevo, con los conjuntos como los guardaste y el audio desde el segundo elegido.");
});
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
    audioEng.audioEl.currentTime = +$("offset").value || 0; // siempre arranca desde el segundo que elegiste en el paso 2
    if (!audioEng.isPlaying) audioEng.play();
    setPlayLabel();
  }
  const [W, H] = logicalSize();
  rec = {
    start: performance.now(),
    events: [],
    samples: [], // dónde está cada pieza, luz y círculo en cada instante (así el export no depende de que un clic "pegue")
    lastS: -1e9,
    W,
    H,
    snap: {
      clock: liveScene.clock,
      tl: liveScene.timeline.time,
      conj: liveScene.conjuntos.map((c) => ({ name: c.name, state: c.engine.exportState(), spin: c.spinAngle })),
      audioT: audioEng.audioEl?.currentTime ?? 0,
      audioId: active()?.id ?? null,
      audioName: active()?.name ?? null,
      loop: $("loop").checked,
      fc: readFocus(),
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
    const kept = saveRec();
    rec = null;
    $("recMoves").textContent = "● grabar mis movimientos";
    $("recMoves").classList.remove("rec");
    $("goMoves").disabled = false;
    $("goMoves").textContent = `▶ Exportar lo que moví (grabé ${lastRec.duration.toFixed(1)} s)`;
    $("liveInfo").textContent = `Grabé ${lastRec.duration.toFixed(1)} s con ${lastRec.events.length} movimientos. Ya podés exportarlo abajo (paso 5), o grabar de nuevo.${kept ? " Queda guardada: si refrescás la página no se pierde." : " (Es muy larga para guardarse: exportala antes de cerrar o refrescar la página.)"}`;
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
        incAll: true,
        order: [...document.querySelectorAll(".crow")].map((r) => r.dataset.name),
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
        fcOn: $("fcOn").checked,
        fcX: +$("fcX").value,
        fcW: +$("fcW").value,
        fcA: +$("fcA").value,
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

// Una "foto" de dónde está todo lo que se mueve con el mouse (en coordenadas del tamaño lógico).
function sampleScene(t) {
  const r1 = (n) => Math.round(n * 10) / 10;
  const mv = (m) => [r1(m.x), r1(m.y)];
  return {
    t: Math.round(t * 1000) / 1000,
    c: liveScene.conjuntos.map((c) => {
      const e = c.engine;
      return { n: c.name, o: [...mv(e.centerOffset), ...mv(e.coreOffsets.a), ...mv(e.coreOffsets.b)], l: e.lights.map((l) => [r1(l.x), r1(l.y)]), f: e.freeCircles.map((f) => [r1(f.x), r1(f.y), f.hueShift ?? 0, f.size ?? 28]) };
    }),
  };
}

// Pone cada pieza, luz y círculo donde estaban en el instante t de la grabación (entre dos fotos, a medio camino).
function applySamples(scene, samples, t, fx, fy, cursor) {
  while (cursor.i + 1 < samples.length && samples[cursor.i + 1].t <= t) cursor.i++;
  const a = samples[cursor.i], b = samples[cursor.i + 1];
  const u = b && b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
  const mix = (p, q) => (q === undefined ? p : p + (q - p) * u);
  for (const c of scene.conjuntos) {
    const ca = a.c.find((x) => x.n === c.name);
    if (!ca) continue;
    const cb = b?.c.find((x) => x.n === c.name);
    const e = c.engine;
    const set = (m, x, y) => {
      m.x = x * fx;
      m.y = y * fy;
      m.vx = 0;
      m.vy = 0;
    };
    const o = ca.o.map((v, k) => mix(v, cb?.o[k]));
    set(e.centerOffset, o[0], o[1]);
    set(e.coreOffsets.a, o[2], o[3]);
    set(e.coreOffsets.b, o[4], o[5]);
    ca.l.forEach((l, k) => {
      if (!e.lights[k]) return;
      const lb = cb?.l.length === ca.l.length ? cb.l[k] : null;
      set(e.lights[k], mix(l[0], lb?.[0]), mix(l[1], lb?.[1]));
    });
    while (e.freeCircles.length > ca.f.length) e.freeCircles.pop();
    ca.f.forEach((f, k) => {
      if (!e.freeCircles[k]) e.freeCircles[k] = { x: 0, y: 0, vx: 0, vy: 0, hueShift: f[2], size: f[3], trail: [], lastPush: null };
      const fb = cb?.f.length === ca.f.length ? cb.f[k] : null;
      set(e.freeCircles[k], mix(f[0], fb?.[0]), mix(f[1], fb?.[1]));
    });
    c.params.freeCount = ca.f.length;
  }
}

// Arma la escena tal cual se exporta: o desde la grabación (cada conjunto con el estado que tenía al grabar, emparejado
// por NOMBRE y en el mismo orden de capas) o desde lo que se ve ahora en el paso 4. Devuelve también cómo repetir el mouse.
function prepareScene(r0, W, H) {
  const scene = buildScene();
  let note = "";
  let replay = {};
  if (!r0) {
    if (liveScene) {
      scene.conjuntos.forEach((c) => {
        const lv = liveScene.conjuntos.find((x) => x.name === c.name);
        if (!lv) return;
        c.engine.importState(lv.engine.exportState());
        c.spinAngle = lv.spinAngle;
      });
      note += " · con las auras donde las dejaste en el paso 4";
    }
    return { scene, replay, note };
  }
  // las piezas arrancan donde estaban cuando empezó la grabación
  const snaps = r0.snap.conj ?? [];
  if (snaps.length && snaps.every((s) => s.name)) {
    const names = snaps.map((s) => s.name);
    const same = names.length === scene.conjuntos.length && names.every((n) => scene.conjuntos.some((c) => c.name === n));
    if (same) scene.conjuntos.sort((x, y) => names.indexOf(x.name) - names.indexOf(y.name)); // (mismo orden de capas que al grabar)
    else note += ` · ⚠ grabaste con otros conjuntos (${names.join(", ")}): los que no estaban salen con su posición guardada`;
    for (const c of scene.conjuntos) {
      const sn = snaps.find((s) => s.name === c.name);
      if (!sn) continue;
      c.engine.importState(sn.state);
      c.spinAngle = sn.spin;
    }
  } else note += " · ⚠ esa grabación es de una versión anterior: las auras salen con su posición guardada (volvé a grabar y queda perfecta)";
  note += " · repitiendo lo que moviste";
  const ev = r0.events;
  const samples = r0.samples?.length ? r0.samples : null; // (las grabaciones nuevas traen las posiciones; las viejas solo los clics)
  const cursor = { i: 0 };
  let ei = 0;
  const fx = W / r0.W, fy = H / r0.H; // (por si cambió el tamaño entre grabar y exportar)
  const fc0 = r0.snap.fc ?? readFocus();
  scene.conjuntos.forEach((c) => applyFocus(c, fc0)); // el centro de las barras arranca como estaba al grabar
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
      // se aplican los movimientos que ocurrieron hasta este momento
      while (ei < ev.length && ev[ei].t <= t) {
        const e = ev[ei++];
        if (e.k === "f") ctx.scene.conjuntos.forEach((c) => applyFocus(c, e.f));
        else if (samples) continue; // (con posiciones grabadas no hace falta repetir los clics)
        else if (e.k === "d") ctx.scene.pointerDown(e.x * fx, e.y * fy, e.a);
        else if (e.k === "m") ctx.scene.pointerMove(e.x * fx, e.y * fy);
        else if (e.k === "u") ctx.scene.pointerUp();
        else ctx.scene.doubleClick(e.x * fx, e.y * fy);
      }
      if (samples) applySamples(ctx.scene, samples, t, fx, fy, cursor);
    },
  };
  return { scene, replay, note };
}

// 🔍 Revisa qué va a salir DE VERDAD: dibuja la exportación (con tu audio y, si la hay, tu grabación) en chico, con y sin
// cada conjunto, y cuenta en cuántos cuadros se nota. Así se ve conjunto por conjunto si aparece, sin esperar al ZIP.
async function checkExport() {
  if (busy) return;
  setBusy(true);
  cancelFlag = false;
  const out = [];
  try {
    const W = Math.round(+$("w").value / 2) * 2, H = Math.round(+$("h").value / 2) * 2;
    const SW = 192, SH = Math.max(8, Math.round((H * SW) / W));
    const small = document.createElement("canvas");
    small.width = SW;
    small.height = SH;
    const sctx = small.getContext("2d", { willReadFrequently: true });
    const FPS = 8;
    const paths = [{ label: "«Exportar tal cual lo veo ahora»", r0: null }];
    if (lastRec) paths.push({ label: "«Exportar lo que moví»", r0: lastRec });
    for (const { label, r0 } of paths) {
      const a = r0 ? audios.find((x) => x.id === r0.snap.audioId) ?? audios.find((x) => x.name === r0.snap.audioName) ?? null : active();
      const secs = Math.min(8, r0 ? r0.duration : +$("secs").value || 8);
      const offset = r0 ? r0.snap.audioT : +$("offset").value || 0;
      const loop = r0 ? r0.snap.loop : $("loop").checked;
      $("status").textContent = `revisando ${label}: analizando el audio…`;
      const audioFrames = adjustAudio(await analyzeAudioFrames(a?.file ?? null, secs, FPS, 128, offset, loop), +$("gain").value, +$("smooth").value, FPS);
      let names = [];
      const render = async (hide, step) => {
        const { scene, replay } = prepareScene(r0, W, H);
        names = scene.conjuntos.map((c) => c.name);
        if (hide >= 0) scene.conjuntos[hide].visible = false;
        const frames = [];
        const trace = [];
        const nF = Math.round(secs * FPS);
        const where = () => scene.conjuntos.map((c) => {
          const f = (n) => (Number.isFinite(n) ? Math.round(n) : "?");
          const pc = c.engine.pieceCenter(W, H, c.params);
          return `${c.name}: pos ${f(c.xf?.tx)},${f(c.xf?.ty)} · esc ${(c.xf?.s ?? 0).toFixed(2)} · centro ${f(pc.x)},${f(pc.y)} · opac ${(+c.params.tOpacity).toFixed(2)}`;
        });
        await renderAnimation(
          { scene, videoLayer: { active: null, draw() {} }, globalParams: { bgColor: $("bg").value }, ...replay, keepSpin: true, audioFrames, audioFile: null, width: W, height: H, transparent: $("transparent").checked, includeVideo: false, seconds: secs, fps: FPS, scale: 1, isCancelled: () => cancelFlag },
          async (canvas) => {
            sctx.clearRect(0, 0, SW, SH);
            sctx.drawImage(canvas, 0, 0, SW, SH);
            frames.push(sctx.getImageData(0, 0, SW, SH).data);
            if (hide < 0 && (frames.length === 1 || frames.length === nF)) trace.push(where());
          },
        );
        $("status").textContent = `revisando ${label}: ${step}`;
        return { frames, scene, trace };
      };
      const all = await render(-1, "imagen completa");
      const n = names.length;
      out.push(`${label} · ${a ? "audio: " + a.name : "sin audio"} · ${secs.toFixed(1)} s`);
      if (r0) {
        const kinds = {};
        for (const e of r0.events) kinds[e.k] = (kinds[e.k] ?? 0) + 1;
        out.push(`  (grabación: ${r0.W}×${r0.H}, ${r0.duration.toFixed(1)} s, reloj ${(+r0.snap.clock).toFixed(1)}, línea de tiempo ${(+r0.snap.tl).toFixed(1)}, eventos ${JSON.stringify(kinds)}, ${r0.samples?.length ? r0.samples.length + " posiciones grabadas" : "SIN posiciones grabadas (repite clics)"}, ${(r0.snap.conj ?? []).every((x) => x.name) ? "con nombres: " + r0.snap.conj.map((x) => x.name).join(" → ") : "formato viejo, " + (r0.snap.conj?.length ?? 0) + " conjunto(s)"})`);
      }
      for (let j = 0; j < n; j++) {
        const without = await render(j, `sin «${names[j]}» (${j + 1}/${n})`);
        let seen = 0, seenDark = 0, best = 0;
        without.frames.forEach((px, f) => {
          let c30 = 0, c3 = 0;
          for (let k = 0; k < px.length; k += 4) {
            const a1 = px[k + 3] / 255, a2 = all.frames[f][k + 3] / 255;
            const d = Math.abs(px[k] * a1 - all.frames[f][k] * a2) + Math.abs(px[k + 1] * a1 - all.frames[f][k + 1] * a2) + Math.abs(px[k + 2] * a1 - all.frames[f][k + 2] * a2);
            if (d > 30) c30++;
            if (d > 3) c3++;
          }
          const px30 = c30 / (px.length / 4), px3 = c3 / (px.length / 4);
          if (px30 >= 0.001) seen++;
          else if (px3 >= 0.001) seenDark++;
          best = Math.max(best, px30);
        });
        const total = without.frames.length;
        const p = all.scene.conjuntos[j].params;
        const info = `[${p.visualMode} · opacidad ${(+p.tOpacity).toFixed(2)} · escala ${(+p.scale).toFixed(2)}${p.reactAudio === false ? " · sin reacción" : ""}]`;
        const verdict = seen === 0 && seenDark > 0 ? `⚠ se ve casi negro/transparente (muy oscuro)` : seen === 0 ? `⚠ NO se ve en ningún cuadro` : seen < total * 0.5 ? `⚠ se ve solo en ${seen} de ${total} cuadros` : `✔ se ve en ${seen} de ${total} cuadros (hasta ${(best * 100).toFixed(0)} % de la imagen)`;
        out.push(`  ${names[j]}: ${verdict} ${info}`);
      }
      out.push("  dónde queda cada uno (cuadro 1 → último):");
      all.trace[0]?.forEach((t0, j) => out.push(`    ${t0}  →  ${all.trace.at(-1)[j].split(": ")[1]}`));
    }
    out.push("(Si dice ⚠: probá subirlo o bajarlo con ▲ ▼ en el paso 1, o revisalo en el programa principal.)");
    $("status").textContent = "Revisión lista, mirá el recuadro de abajo.";
  } catch (e) {
    out.push(e.message === "cancelado" ? "revisión cancelada" : `no se pudo revisar: ${e.message}`);
    $("status").textContent = out.at(-1);
  } finally {
    $("report").textContent = out.join("\n");
    $("report").hidden = false;
    console.log(out.join("\n"));
    setBusy(false);
  }
}
$("check").addEventListener("click", checkExport);

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
    // el audio de ese momento (si se grabó con uno) o el elegido ahora
    const a = r0 ? audios.find((x) => x.id === r0.snap.audioId) ?? audios.find((x) => x.name === r0.snap.audioName) ?? null : active();
    if (r0 && r0.snap.audioName && !a) throw friendly(`esa grabación se hizo con el audio "${r0.snap.audioName}": cargalo de nuevo en el paso 2 y exportá otra vez`);
    let note = a ? ` · audio: ${a.name}` : " · sin audio: no hay reacción al sonido";
    if (k !== +$("scale").value) note += ` · resolución bajada a ×${k}`;
    const { scene, replay, note: sceneNote } = prepareScene(r0, W, H);
    note += sceneNote;

    const r = await exportPngSequence({
      scene,
      videoLayer: { active: null, draw() {} },
      globalParams: { bgColor: $("bg").value },
      ...replay,
      keepSpin: true,
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
$("fcOn").checked = prefs.fcOn ?? false;
$("fcX").value = prefs.fcX ?? 0.5;
$("fcW").value = prefs.fcW ?? 0.35;
$("fcA").value = prefs.fcA ?? 0.85;
showFocus();
if (lastRec) {
  $("goMoves").disabled = false;
  $("goMoves").textContent = `▶ Exportar lo que moví (grabé ${lastRec.duration.toFixed(1)} s, guardada)`;
}
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
