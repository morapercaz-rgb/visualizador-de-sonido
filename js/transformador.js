// Transformador: un programa aparte, liviano, para ver y exportar una TRANSFORMACIÓN de conjuntos guardados.
//
//   - de un conjunto a otro y a un tercero (A → B → C), y hasta dos juegos a la vez (A2 → B2 → C2)
//   - sin audio: no hay reacción al sonido
//   - el tiempo se regula: cuánto tarda en pasar de un paso al siguiente y cuánto se queda quieto en cada paso
//   - "pantalla infinita": lo que sale por un borde entra por el opuesto
//   - vista chica y fluida; la exportación (secuencia de PNG) se dibuja cuadro por cuadro en el tamaño que se elija
// Usa los mismos archivos de dibujo que el programa principal (scene.js, exporter.js), así que el resultado es idéntico.

import { Scene } from "./scene.js?v=20261028163610";
import { silentAudio } from "./audioEngine.js?v=20261028163610";
import { exportPngSequence } from "./exporter.js?v=20261028163610";
import { progressAt } from "./morph.js?v=20261028163610";
import { listPresets, loadShared, getPreset, importPresetsText } from "./presets.js?v=20261028163610";

const $ = (id) => document.getElementById(id);
const PREFS_KEY = "visualizador-de-sonido.transformador.v1";
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
const SILENT = silentAudio(128);

let busy = false;
let cancelFlag = false;

// ---------- 1 · qué se transforma ----------

const SELECTS = ["sa", "sb", "sc", "sa2", "sb2", "sc2"];
const OPTIONAL = new Set(["sc", "sa2", "sb2", "sc2"]);

function fillSelects() {
  const list = listPresets();
  $("noPresets").hidden = list.length > 0;
  for (const id of SELECTS) {
    const sel = $(id);
    const keep = sel.value || prefs.sel?.[id] || "";
    sel.replaceChildren();
    if (OPTIONAL.has(id)) sel.add(new Option("— ninguno —", ""));
    for (const p of list) sel.add(new Option(`${p.shared ? "🌐" : "💾"} ${p.name}`, p.name));
    const want = list.some((p) => p.name === keep) ? keep : OPTIONAL.has(id) ? "" : null;
    if (want !== null) sel.value = want;
    else sel.selectedIndex = Math.min(SELECTS.indexOf(id), Math.max(0, list.length - 1)); // por defecto: A, B y C distintos si hay
  }
  const fixed = prefs.fixed ?? [];
  const box = $("fixList");
  box.replaceChildren();
  for (const p of list) {
    const row = document.createElement("label");
    row.className = "inl";
    row.style.display = "flex";
    row.style.margin = "4px 0";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.name = p.name;
    cb.checked = fixed.includes(p.name);
    cb.addEventListener("change", () => {
      save();
      rebuild();
    });
    row.append(cb, document.createTextNode((p.shared ? "🌐 " : "💾 ") + p.name));
    box.appendChild(row);
  }
}

$("importFile").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const n = importPresetsText(await f.text());
  $("status").textContent = n < 0 ? "ese archivo no es de conjuntos" : `importé ${n} conjunto${n === 1 ? "" : "s"}`;
  fillSelects();
  rebuild();
});

// ---------- 2 · el tiempo ----------

// Cuántos pasos tiene la transformación: 3 si algún juego llega a C, si no 2
const stepCount = () => ($("sc").value || ($("sa2").value && $("sb2").value && $("sc2").value) ? 3 : 2);

const num = (id) => +$(id).value;
function timing() {
  const n = stepCount();
  const hold = num("hold"), trans = num("trans");
  return { n, hold, trans, total: n * hold + (n - 1) * trans };
}

// Avance 0..1 de la transformación en el segundo t: se queda quieto en cada paso y pasa de uno al siguiente
// (en el tramo de paso, el avance va parejo; la curva suave se aplica adentro de cada tramo, ver scene.js)
function progAt(t) {
  const { n, hold, trans, total } = timing();
  if (t <= 0) return 0;
  if (t >= total) return 1;
  let t0 = 0;
  for (let k = 0; k < n; k++) {
    if (t < t0 + hold) return k / (n - 1);
    t0 += hold;
    if (k < n - 1) {
      if (t < t0 + trans) return (k + (t - t0) / trans) / (n - 1);
      t0 += trans;
    }
  }
  return 1;
}

function updateTiming() {
  const { n, total } = timing();
  for (const id of ["trans", "hold", "travel", "stagger", "swirl", "scatter"]) $(id + "Out").textContent = (+$(id).value).toFixed(id === "trans" || id === "hold" ? 1 : 2);
  $("totalInfo").textContent = `${n} pasos · dura ${total.toFixed(1)} s en total`;
  $("scrub").max = Math.max(0.1, total);
}

// ---------- la escena (la misma para la vista y para exportar) ----------

// Lo que moviste con el mouse (por conjunto de cada juego), para que la vista y la exportación lo repitan
let moves = prefs.moves ?? {};

function buildScene() {
  if (!$("sa").value || !$("sb").value) throw friendly("elegí al menos el conjunto de partida (A) y el que sigue (B)");
  if (!getPreset($("sa").value) || !getPreset($("sb").value)) throw friendly("falta alguno de los conjuntos (¿lo borraste?)");
  const sc = new Scene();
  let first = true;
  const make = (p, mk) => {
    const c = first ? sc.replaceFromPreset(p) : sc.addFromPreset(p); // (el primero ocupa el conjunto que la escena trae de entrada)
    first = false;
    c._mk = mk;
    c._p0 = pickTf(c.params); // cómo venía guardado (para saber si lo cambiaste)
    const m = moves[mk];
    if (m) {
      if (m.s) c.engine.importState(m.s); // lo que movés con el mouse
      else if (m.centerOffset) c.engine.importState(m); // (formato anterior)
      if (m.p) {
        Object.assign(c.params, m.p); // rotación, escala y posición que pusiste
        if (m.p.rotation !== c._p0.rotation) c.spinAngle = 0; // (la rotación que elegiste es exacta: el giro guardado no se le suma)
      }
    }
    return c;
  };
  // los fijos van primero (abajo de todo)
  const fixed = [...document.querySelectorAll("#fixList input:checked")].map((cb) => getPreset(cb.dataset.name)).filter(Boolean);
  for (const p of fixed) make(p, `fijo|${p.name}`);
  // cada paso es un conjunto de la escena (así se puede agarrar con el mouse); si el mismo conjunto es el paso 1 y el 3 de un juego, es el mismo
  const mine = new Map();
  const slot = (set, id) => {
    const name = $(id).value;
    const p = name && getPreset(name);
    if (!p) return "";
    const mk = `${set}|${name}`;
    if (!mine.has(mk)) mine.set(mk, make(p, mk));
    return `set:${mine.get(mk).id}`;
  };
  const labels = new Map(); // conjunto → "A", "B / C"…
  const slotName = (set, id, label) => {
    const key = slot(set, id);
    if (key) {
      const cj = sc.conjuntos.find((x) => `set:${x.id}` === key);
      labels.set(cj, [...(labels.get(cj) ?? []), label]);
    }
    return key;
  };
  let a = slotName(1, "sa", "A"), b = slotName(1, "sb", "B"), c = slotName(1, "sc", "C");
  let a2 = slotName(2, "sa2", "A2"), b2 = slotName(2, "sb2", "B2"), c2 = slotName(2, "sc2", "C2");
  sc._slots = [...labels].map(([cj, ls]) => ({ c: cj, label: `${ls.join(" / ")} · ${cj.name}` }));
  for (const p of fixed) {
    const cj = sc.conjuntos.find((x) => x._mk === `fijo|${p.name}`);
    if (cj) sc._slots.push({ c: cj, label: `fijo · ${cj.name}` });
  }
  // si un juego tiene tres pasos y el otro dos, el de dos se queda en su último paso
  if (c || c2) {
    if (a && b && !c) c = b;
    if (a2 && b2 && !c2) c2 = b2;
  }
  Object.assign(sc.morph, { a, b, c, a2, b2, c2, on: true, playing: false, repeat: "once", seconds: 1, time: 0, only: fixed.length === 0 });
  applyLive(sc);
  for (const cj of sc.conjuntos) {
    cj.params.reactAudio = false; // sin audio
    cj.params.mixHandles = $("handles").checked;
  }
  return sc;
}

// después de mover algo: se anota dónde quedó cada conjunto
function keepMoves() {
  if (!scene) return;
  for (const c of scene.conjuntos) {
    if (!c._mk) continue;
    const now = pickTf(c.params);
    const changed = TF_KEYS.some((k) => now[k] !== c._p0[k]);
    moves[c._mk] = changed ? { s: c.engine.exportState(), p: now } : { s: c.engine.exportState() };
  }
  save();
}

// rotación, escala y posición de un conjunto (lo que se acomoda con los controles o las manijas)
const TF_KEYS = ["posX", "posY", "rotation", "scale", "pivotX", "pivotY", "pivotMode"];
const pickTf = (p) => Object.fromEntries(TF_KEYS.map((k) => [k, p[k]]));

// ---- acomodar un conjunto ----
const FIT = [["fitRot", "rotation"], ["fitScale", "scale"], ["fitX", "posX"], ["fitY", "posY"]];
const fitCj = () => scene?._slots?.find((s) => s.c.id === fitId)?.c ?? scene?._slots?.[0]?.c ?? null;
let fitId = null;

function fillFit() {
  const sel = $("fitSel");
  sel.replaceChildren();
  for (const s of scene?._slots ?? []) sel.add(new Option(s.label, String(s.c.id)));
  if (scene?._slots?.length) {
    const keep = scene._slots.find((s) => s.c.id === fitId) ?? scene._slots[0];
    fitId = keep.c.id;
    sel.value = String(fitId);
    scene.selectedId = fitId; // (las manijas del mouse son del conjunto elegido)
  }
  const [W, H] = logicalSize();
  $("fitX").min = -Math.max(W, 2000);
  $("fitX").max = Math.max(W, 2000);
  $("fitY").min = -Math.max(H, 1000);
  $("fitY").max = Math.max(H, 1000);
  syncFit();
}
function syncFit() {
  const c = fitCj();
  for (const [id, k] of FIT) {
    const v = c ? c.params[k] : 0;
    $(id).value = v;
    $(id + "N").value = Math.round(v * 100) / 100;
  }
}
function fitChanged(id, k, v) {
  const c = fitCj();
  if (!c || !Number.isFinite(v)) return;
  c.params[k] = k === "scale" ? Math.max(0.05, v) : v;
  if (k === "rotation") c.spinAngle = 0; // (la rotación que ponés es la de verdad)
  syncFit();
  keepMoves();
}
for (const [id, k] of FIT) {
  $(id).addEventListener("input", () => fitChanged(id, k, +$(id).value));
  $(id + "N").addEventListener("change", () => fitChanged(id, k, +$(id + "N").value));
}
$("fitSel").addEventListener("change", () => {
  fitId = +$("fitSel").value;
  if (scene) scene.selectedId = fitId;
  syncFit();
});
$("gizmoOn").addEventListener("change", () => {
  if (scene) scene.settings.gizmo = $("gizmoOn").checked;
  save();
});

// lo que se puede cambiar sin volver a armar la escena
function applyLive(sc) {
  Object.assign(sc.morph, { ease: $("ease").value, travel: num("travel"), stagger: num("stagger"), swirl: num("swirl"), scatter: num("scatter"), scatterDir: $("scatterDir").value, still: $("still").checked });
  sc.settings.wrap = $("wrap").checked;
  sc.settings.gizmo = $("gizmoOn").checked; // (las manijas de girar y agrandar: solo en la vista, nunca en lo exportado)
}

// ---------- 3 · vista ----------

let scene = null;
let T = 0; // segundo de la transformación que se está viendo
let playing = true;
let lastLap = 0;
let dragging = false;

function rebuild(message) {
  try {
    scene = buildScene();
    fillFit();
    $("liveInfo").textContent = message ?? "";
  } catch (e) {
    scene = null;
    $("liveInfo").textContent = e.friendly ? `⚠ ${e.message}` : `error: ${e.message}`;
  }
  updateTiming();
}

const logicalSize = () => [Math.max(64, Math.round((num("w") || 1920) / 2) * 2), Math.max(64, Math.round((num("h") || 1080) / 2) * 2)];
const liveCv = $("live"), liveCtx = liveCv.getContext("2d");
const ovCv = $("liveOv"), ovCtx = ovCv.getContext("2d");
let lastT = performance.now(), infoT = 0;

function setPlayLabel() {
  $("playBtn").textContent = playing ? "⏸ pausa" : "▶ reproducir";
}

function liveLoop(now) {
  requestAnimationFrame(liveLoop);
  const dt = Math.min(0.05, Math.max(0.001, (now - lastT) / 1000));
  lastT = now;
  if (busy) return; // mientras exporta, la vista espera
  const [W, H] = logicalSize();
  const s = Math.min(1, +$("vsize").value / W); // la vista es liviana: como mucho 480 / 720 / 1080 px de ancho
  const PW = Math.max(2, Math.round(W * s)), PH = Math.max(2, Math.round(H * s));
  if (liveCv.width !== PW || liveCv.height !== PH) {
    liveCv.width = ovCv.width = PW;
    liveCv.height = ovCv.height = PH;
  }
  liveCtx.setTransform(1, 0, 0, 1, 0, 0);
  liveCtx.clearRect(0, 0, PW, PH);
  ovCtx.setTransform(1, 0, 0, 1, 0, 0);
  ovCtx.clearRect(0, 0, PW, PH);
  if (!$("transparent").checked) {
    liveCtx.fillStyle = $("bg").value;
    liveCtx.fillRect(0, 0, PW, PH);
  }
  if (!scene) return;

  const { total } = timing();
  const rep = $("repeat").value;
  if (playing && !dragging) {
    T += dt;
    if (rep === "once" && T >= total) {
      T = total;
      playing = false;
      setPlayLabel();
    }
  }
  // con la repetición aplicada; cada vuelta vuelve a armar la escena, así cada pasada arranca igual que lo exportado
  const lap = total > 0 ? Math.floor(T / (rep === "pingpong" ? 2 * total : total)) : 0;
  if (lap !== lastLap) {
    lastLap = lap;
    if ((rep === "loop" || rep === "pingpong") && !scene.isDragging) rebuild();
  }
  const eff = rep === "once" ? Math.min(T, total) : progressAt(T, total, rep) * total;
  scene.morph.time = progAt(eff);

  liveCtx.setTransform(s, 0, 0, s, 0, 0);
  ovCtx.setTransform(s, 0, 0, s, 0, 0);
  scene.renderScale = s;
  scene.draw(liveCtx, W, H, SILENT, dt, ovCtx); // (las manijas van en la capa de encima: nunca salen en lo exportado)

  if (!dragging) $("scrub").value = eff;
  if (now - infoT > 200) {
    infoT = now;
    $("scrubOut").textContent = `${eff.toFixed(1)} / ${total.toFixed(1)} s`;
  }
}

$("playBtn").addEventListener("click", () => {
  if (!playing && T >= timing().total && $("repeat").value === "once") {
    T = 0;
    rebuild();
  }
  playing = !playing;
  setPlayLabel();
});
$("restart").addEventListener("click", () => {
  T = 0;
  lastLap = 0;
  playing = true;
  setPlayLabel();
  rebuild();
});
// el mouse sobre la vista (el mismo manejo que en el programa principal)
const toLogical = (e) => {
  const r = liveCv.getBoundingClientRect();
  const [W, H] = logicalSize();
  return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
};
liveCv.addEventListener("pointerdown", (e) => {
  if (!scene || busy) return;
  const p = toLogical(e);
  if (scene.pointerDown(p.x, p.y, e.altKey)) {
    try {
      liveCv.setPointerCapture(e.pointerId);
    } catch {}
    liveCv.style.cursor = "grabbing";
    playing = false; // al agarrar algo se pausa, para poder acomodarlo tranquilo
    setPlayLabel();
  }
});
liveCv.addEventListener("pointermove", (e) => {
  if (!scene || busy) return;
  const p = toLogical(e);
  scene.pointerMove(p.x, p.y);
  if (scene.gdrag) syncFit(); // (si estás girando con la manija, los números siguen)
  if (!scene.isDragging) liveCv.style.cursor = scene.hover(p.x, p.y) ? "grab" : "default";
});
const dropIt = () => {
  if (!scene) return;
  const was = scene.isDragging;
  scene.pointerUp();
  liveCv.style.cursor = "default";
  if (was) {
    keepMoves();
    syncFit();
  }
};
liveCv.addEventListener("pointerup", dropIt);
liveCv.addEventListener("pointercancel", dropIt);
liveCv.addEventListener("dblclick", (e) => {
  if (!scene || busy) return;
  const p = toLogical(e);
  scene.doubleClick(p.x, p.y);
  keepMoves();
});
$("resetMoves").addEventListener("click", () => {
  moves = {};
  save();
  rebuild("volvió todo a como lo guardaste");
});
$("handles").addEventListener("change", () => {
  if (scene) for (const c of scene.conjuntos) c.params.mixHandles = $("handles").checked;
  save();
});

$("scrub").addEventListener("pointerdown", () => (dragging = true));
window.addEventListener("pointerup", () => (dragging = false));
$("scrub").addEventListener("input", () => {
  T = +$("scrub").value;
  playing = false;
  setPlayLabel();
});

// ---------- 4 · exportar ----------

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
      ? "Te pide dónde guardar el ZIP antes de empezar y lo escribe de a poco (lo mejor para muchos cuadros o tamaños grandes). Descomprimilo antes de abrirlo en After."
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

// los que cambian qué se arma, y los que se aplican en vivo
for (const id of SELECTS) $(id).addEventListener("change", () => (save(), rebuild()));
for (const id of ["trans", "hold"]) $(id).addEventListener("input", () => (updateTiming(), save()));
for (const id of ["ease", "travel", "stagger", "swirl", "scatter", "scatterDir", "still", "wrap"]) {
  $(id).addEventListener("input", () => {
    if (scene) applyLive(scene);
    updateTiming();
    save();
  });
}
for (const id of ["w", "h", "scale", "fps", "transparent", "bg", "dest", "repeat", "vsize"]) $(id).addEventListener("change", save);

function save() {
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        sel: Object.fromEntries(SELECTS.map((id) => [id, $(id).value])),
        fixed: [...document.querySelectorAll("#fixList input:checked")].map((cb) => cb.dataset.name),
        moves,
        handles: $("handles").checked,
        gizmoOn: $("gizmoOn").checked,
        trans: num("trans"),
        hold: num("hold"),
        ease: $("ease").value,
        travel: num("travel"),
        stagger: num("stagger"),
        swirl: num("swirl"),
        scatter: num("scatter"),
        scatterDir: $("scatterDir").value,
        still: $("still").checked,
        wrap: $("wrap").checked,
        repeat: $("repeat").value,
        vsize: $("vsize").value,
        preset: $("preset").value,
        w: num("w"),
        h: num("h"),
        scale: num("scale"),
        fps: num("fps"),
        transparent: $("transparent").checked,
        bg: $("bg").value,
        dest: $("dest").value,
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
  if (!on) updateDestHint();
}

// dónde se guarda: se pide ANTES de empezar (el navegador solo deja abrir el selector justo después de un click)
async function pickTarget() {
  const d = $("dest").value;
  try {
    if (d === "zipfile" && canPickFile) {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: `transformacion-${new Date().toISOString().slice(0, 10)}.zip`,
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

async function run() {
  if (busy) return;
  const target = await pickTarget();
  if (!target) {
    $("status").textContent = "no elegiste dónde guardar, así que no se hizo nada";
    return;
  }
  setBusy(true);
  cancelFlag = false;
  $("bar").value = 0;
  await keepAwake(true);
  let t0 = 0;
  try {
    const W = Math.round(+$("w").value / 2) * 2, H = Math.round(+$("h").value / 2) * 2;
    const k = finalScale();
    const fps = +$("fps").value;
    const { total } = timing();
    if (!(fps > 0) || !(total > 0) || Math.round(total * fps) < 2) throw friendly("revisá el tiempo y los cuadros por segundo: no daría suficientes cuadros");
    if (!(W >= 64 && H >= 64)) throw friendly("el ancho y el alto tienen que ser de al menos 64 px");
    const sc = buildScene(); // una escena nueva: arranca limpia, igual que la vista cuando vuelve a empezar
    const note = k !== +$("scale").value ? ` · resolución bajada a ×${k}` : "";

    const r = await exportPngSequence({
      scene: sc,
      videoLayer: { active: null, draw() {} },
      globalParams: { bgColor: $("bg").value },
      morph: true,
      morphTime: (i, frames) => progAt(frames > 1 ? (i / (frames - 1)) * total : 0),
      keepSpin: true,
      audioFile: null,
      width: W,
      height: H,
      transparent: $("transparent").checked,
      includeVideo: false,
      seconds: total,
      fps,
      scale: k,
      dirHandle: target.dirHandle,
      fileHandle: target.fileHandle,
      onPreview: drawPreview,
      onProgress: ({ phase, i, total: n }) => {
        const now = performance.now();
        if (i === 0) t0 = now;
        $("bar").max = Math.max(1, n);
        $("bar").value = i;
        const eta = phase === "dibujando cuadros" && i > 2 ? ((now - t0) / i) * (n - i) : 0;
        const etaTxt = eta > 1500 ? ` · faltan ~${eta > 90000 ? Math.round(eta / 60000) + " min" : Math.round(eta / 1000) + " s"}` : "";
        $("status").textContent = `${phase} ${i}/${n}${etaTxt}${note}`;
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
$("go").addEventListener("click", run);
$("cancel").addEventListener("click", () => {
  cancelFlag = true;
  $("status").textContent = "cancelando… (se guarda lo que ya estaba hecho)";
});

// ---------- arranque ----------

await loadShared("conjuntos-compartidos.json");
fillSelects();
$("trans").value = prefs.trans ?? 3;
$("hold").value = prefs.hold ?? 1;
$("ease").value = prefs.ease ?? "smooth";
$("travel").value = prefs.travel ?? 0;
$("stagger").value = prefs.stagger ?? 0.35;
$("swirl").value = prefs.swirl ?? 0.18;
$("scatter").value = prefs.scatter ?? 0.6;
$("scatterDir").value = prefs.scatterDir ?? "horizontal";
$("still").checked = prefs.still ?? true;
$("wrap").checked = prefs.wrap ?? false;
$("handles").checked = prefs.handles ?? true;
$("gizmoOn").checked = prefs.gizmoOn ?? true;
$("repeat").value = prefs.repeat ?? "loop";
$("vsize").value = prefs.vsize ?? "720";
$("preset").value = prefs.preset ?? "1920x1080";
$("w").value = prefs.w ?? 1920;
$("h").value = prefs.h ?? 1080;
$("scale").value = String(prefs.scale ?? 1);
$("fps").value = String(prefs.fps ?? 30);
$("transparent").checked = prefs.transparent ?? false;
$("bgRow").hidden = $("transparent").checked;
$("bg").value = prefs.bg ?? "#05050a";
$("dest").value = prefs.dest ?? (canPickFile ? "zipfile" : "zip");
if ($("dest").selectedOptions[0]?.disabled) $("dest").value = "zip";
updateFinalSize();
updateDestHint();
updateTiming();
setPlayLabel();
rebuild();
requestAnimationFrame(liveLoop);
