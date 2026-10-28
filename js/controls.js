// Arma el panel de sliders en vivo (Tweakpane). Tocar un slider acá cambia
// el dibujo al instante: no hace falta guardar ni recargar nada.
//
// Hay dos clases de parámetros:
// - los de cada CONJUNTO (modo, cantidad, colores, estilo, deformación…): cada
//   conjunto tiene su propio objeto, y el panel edita el que esté seleccionado
// - los GLOBALES (capa de video, efectos de video, fondo): uno solo para todo
// createDefaultParams() devuelve un objeto completo con los valores iniciales;
// los conjuntos usan la parte generativa y los globales la de video y fondo.

import { Pane } from "https://esm.sh/tweakpane@3.1.10";
import { listPresets } from "./presets.js?v=20261028162620";
import { defaultMixColor } from "./colorUtils.js?v=20261028162620";

let mixRebuildTimer = 0;

import { createDefaultParams } from "./params.js?v=20261028162620";
export { createDefaultParams }; // (sigue exportándose desde acá para no tocar los demás archivos)

// Arma el panel para el conjunto seleccionado.
//   conjunto     → el conjunto que se edita ({ name, visible, params, … })
//   conjuntos    → la lista de todos (para el selector)
//   globalParams → parámetros de video y fondo
//   actions      → qué hacer con los botones (los conecta main.js)
//   openState    → qué carpetas estaban abiertas (para no perderlo al rearmar)
export function createControls({ scene, conjunto, conjuntos, globalParams, actions = {}, openState = null }) {
  const params = conjunto.params;
  const gp = globalParams;

  const pane = new Pane({ title: "Controles" });

  // ---- conjuntos: varias piezas independientes a la vez ----
  const setsF = pane.addFolder({ title: "Conjuntos" });
  const picker = { selected: conjunto.id };
  const options = {};
  for (const c of conjuntos) {
    let key = `${c.locked ? "🔒 " : ""}${c.visible ? "" : "(oculto) "}${c.params.reactAudio === false ? "🔇 " : ""}${c.name}`;
    if (key in options) key += ` #${c.id}`; // dos conjuntos con el mismo nombre
    options[key] = c.id;
  }
  setsF.addInput(picker, "selected", { options, label: "editando" }).on("change", (ev) => actions.selectSet?.(ev.value));
  setsF.addInput(conjunto, "name", { label: "nombre" }).on("change", () => actions.rebuild?.());
  const visIn = setsF.addInput(conjunto, "visible", { label: "visible" }).on("change", () => actions.rebuild?.());
  // bloquear: el tilde queda en la misma fila que "visible" (al lado)
  const lockIn = setsF.addInput(conjunto, "locked", { label: "bloqueado" }).on("change", () => actions.rebuild?.());
  {
    const host = visIn.element.querySelector(".tp-lblv_v");
    const check = lockIn.element.querySelector(".tp-lblv_v")?.firstElementChild;
    if (host && check) {
      const tag = document.createElement("span");
      tag.textContent = "🔒 bloquear";
      tag.title = "Bloqueado: no se mueve con el mouse, no se edita desde el panel y no se puede borrar ni reemplazar";
      tag.style.cssText = "font-size:11px;opacity:.85;white-space:nowrap;margin-left:2px";
      host.style.cssText += ";display:flex;align-items:center;gap:8px";
      host.append(check, tag);
      lockIn.element.style.display = "none"; // (la fila vacía de "bloqueado" se esconde; el tilde ya está al lado de "visible")
    }
  }
  setsF.addInput(params, "reactAudio", { label: "reacciona al sonido" }).on("change", () => actions.rebuild?.());
  setsF.addButton({ title: "+ conjunto nuevo" }).on("click", () => actions.addSet?.());
  setsF.addButton({ title: "duplicar este conjunto" }).on("click", () => actions.duplicateSet?.());
  setsF.addButton({ title: "traer al frente" }).on("click", () => actions.bringToFront?.());
  setsF.addButton({ title: "eliminar este conjunto" }).on("click", () => actions.removeSet?.());

  // ---- agrandar varios conjuntos a la vez ----
  const grpF = pane.addFolder({ title: "Agrandar varios conjuntos a la vez" });
  const inGroupCount = conjuntos.filter((c) => c.params.inGroup).length;
  grpF.addMonitor({ txt: `${inGroupCount} en el grupo · atajos: + y − = zoom · ] y [ = manchas` }, "txt", { label: "grupo" });
  grpF.addInput(params, "inGroup", { label: "este conjunto entra en el grupo" }).on("change", () => actions.rebuild?.());
  grpF.addButton({ title: "tildar todos los de aura de colores" }).on("click", () => {
    for (const c of conjuntos) if (c.params.visualMode === "mix") c.params.inGroup = true;
    actions.rebuild?.();
  });
  grpF.addButton({ title: "destildar todos" }).on("click", () => {
    for (const c of conjuntos) c.params.inGroup = false;
    actions.rebuild?.();
  });
  grpF.addInput(scene, "groupBlobScale", { min: 0.1, max: 40, step: 0.05, label: "tamaño de cada mancha (aura de colores)" });
  grpF.addInput(scene, "groupScale", { min: 0.1, max: 8, step: 0.01, label: "zoom (agranda todo el conjunto)" });
  grpF.addButton({ title: "volver a tamaño normal (×1)" }).on("click", () => {
    scene.groupScale = 1;
    scene.groupBlobScale = 1;
    actions.refreshPanel?.();
  });

  // ---- rendimiento: si la compu se traba ----
  const perfF = pane.addFolder({ title: "Rendimiento (si la compu se traba)" });
  perfF.addMonitor({ txt: "Bajá la vista previa: se ve más pixelada solo mientras trabajás; al grabar y exportar se usa todo el tamaño" }, "txt", { label: "tip" });
  perfF
    .addInput(gp, "previewScale", {
      options: { "automática (se adapta sola)": "auto", "completa (100 %)": 1, "liviana (75 %)": 0.75, "media (50 %)": 0.5, "baja (35 %)": 0.35, "muy baja (25 %)": 0.25 },
      label: "vista previa",
    })
    .on("change", () => {
      actions.applyCanvas?.();
      setTimeout(() => actions.refreshPanel?.(), 30);
    });
  perfF.addInput(gp, "showFps", { label: "mostrar cuadros por segundo" });
  perfF.addButton({ title: "🔍 diagnosticar qué es lo que más pesa" }).on("click", () => actions.diagnose?.());

  // ---- biblioteca: conjuntos guardados que quedan para la próxima vez ----
  const libF = pane.addFolder({ title: "Mis conjuntos guardados" });
  const saved = listPresets();
  const lib = { name: conjunto.name, pick: saved[0]?.name ?? "" };
  libF.addInput(lib, "name", { label: "guardar como" });
  libF.addButton({ title: "💾 guardar este conjunto" }).on("click", () => actions.savePreset?.(lib.name));
  if (saved.length) {
    const opts = {};
    for (const p of saved) opts[`${p.shared ? "🌐 " : ""}${p.name}`] = p.name;
    libF.addInput(lib, "pick", { options: opts, label: "guardados" });
    libF.addButton({ title: "+ agregar a la escena" }).on("click", () => actions.addPreset?.(lib.pick));
    libF.addButton({ title: "reemplazar el que estoy editando" }).on("click", () => actions.replacePreset?.(lib.pick));
    libF.addButton({ title: "borrar de mis guardados" }).on("click", () => actions.deletePreset?.(lib.pick));
  } else {
    libF.addMonitor({ txt: "todavía no guardaste ninguno" }, "txt", { label: "guardados" });
  }
  if (saved.length) libF.addButton({ title: "🔗 copiar link de este conjunto" }).on("click", () => actions.sharePreset?.(lib.pick));
  if (saved.some((p) => !p.shared)) libF.addButton({ title: "🔗 copiar link con todos los míos" }).on("click", () => actions.shareAll?.());
  libF.addButton({ title: "⬇ exportar a un archivo" }).on("click", () => actions.exportPresets?.());
  libF.addButton({ title: "⬆ importar de un archivo" }).on("click", () => actions.importPresets?.());

  // ---- transformación: un conjunto que se convierte en otro ----
  const mf = pane.addFolder({ title: "Transformación (de un conjunto a otro)" });
  const m = scene.morph;
  const endOpts = {};
  for (const c of conjuntos) endOpts[`${c.name} · en la escena`] = `set:${c.id}`;
  for (const p of saved) endOpts[`${p.shared ? "🌐" : "💾"} ${p.name} · ${p.shared ? "de todos" : "guardado"}`] = `lib:${p.name}`;
  const validKeys = Object.values(endOpts);
  if (!validKeys.includes(m.a)) m.a = validKeys[0] ?? "";
  if (!validKeys.includes(m.b)) m.b = validKeys[1] ?? validKeys[0] ?? "";
  mf.addInput(m, "a", { options: endOpts, label: "desde (A)" });
  mf.addInput(m, "b", { options: endOpts, label: "pasa a (B)" });
  // un 3.er paso opcional (A → B → C) y un segundo par que se transforma al mismo tiempo (opcional)
  const endOpts2 = { "— ninguno —": "", ...endOpts };
  for (const k of ["c", "a2", "b2", "c2"]) if (m[k] && !validKeys.includes(m[k])) m[k] = "";
  mf.addInput(m, "c", { options: endOpts2, label: "y termina en (C) (opcional)" });
  mf.addInput(m, "a2", { options: endOpts2, label: "2.º par: desde (A2)" });
  mf.addInput(m, "b2", { options: endOpts2, label: "2.º par: pasa a (B2)" });
  mf.addInput(m, "c2", { options: endOpts2, label: "2.º par: termina en (C2)" });
  mf.addInput(m, "seconds", { min: 0.5, max: 60, step: 0.5, label: "duración (s)" });
  mf.addInput(m, "ease", { options: { "suave (arranca y frena)": "smooth", "constante": "linear" }, label: "curva" });
  mf.addInput(m, "repeat", { options: { "una vez": "once", "repetir": "loop", "ida y vuelta": "pingpong" }, label: "al terminar" });
  mf.addInput(m, "travel", { min: 0, max: 1, step: 0.05, label: "viaje de las formas (0 = fundido exacto: no cambia tamaño ni brillo; más = las formas viajan, pero baja un poco el brillo)" });
  mf.addInput(m, "stagger", { min: 0, max: 0.9, step: 0.05, label: "escalonado (0 = todo junto)" });
  mf.addInput(m, "swirl", { min: -0.6, max: 0.6, step: 0.02, label: "curva del camino (0 = recto)" });
  mf.addInput(m, "scatter", { min: 0, max: 3, step: 0.05, label: "dispersión (se esparcen y se juntan)" });
  mf.addInput(m, "scatterDir", { options: { "horizontal (a los costados)": "horizontal", "para todos lados": "all" }, label: "hacia dónde se dispersan" });
  mf.addInput(m, "only", { label: "solo estos (esconde el resto)" });
  mf.addButton({ title: "▶ ver la transformación" }).on("click", () => actions.morphPlay?.());
  mf.addButton({ title: "⏯ pausa / seguir" }).on("click", () => actions.morphToggle?.());
  mf.addButton({ title: "■ salir de la transformación" }).on("click", () => actions.morphStop?.());
  const morphView = { get avance() { return scene.morphProgress(); } };
  mf.addMonitor(morphView, "avance", { label: "avance", interval: 100, format: (v) => `${Math.round(v * 100)} %` });
  const seek = { v: 0 };
  mf.addInput(seek, "v", { min: 0, max: 1, label: "ir a (0 = A, 1 = el final)" }).on("change", (ev) => actions.morphSeek?.(ev.value));
  mf.addButton({ title: "⬇ exportar la transformación (secuencia de PNG)" }).on("click", () => actions.exportMorph?.());
  mf.addMonitor({ txt: "usa cuadros/seg y fondo de 'Exportar animación'" }, "txt", { label: "nota" });

  // ---- línea de tiempo de varias etapas: conjuntos y posiciones que se van transformando ----
  const qf = pane.addFolder({ title: "Línea de tiempo (varias etapas)" });
  const q = scene.seq;
  const labelOf = (src) => Object.keys(endOpts).find((k) => endOpts[k] === src)?.replace(/ · (en la escena|guardado|de todos)$/, "") ?? "⚠ falta";
  qf.addMonitor({ txt: "cada etapa = un conjunto en una posición; entre etapas se transforma. Agregá etapas y mirá la barra de abajo." }, "txt", { label: "cómo" });
  const addv = { src: validKeys[0] ?? "", src2: "" };
  qf.addInput(addv, "src", { options: endOpts, label: "conjunto" });
  qf.addInput(addv, "src2", { options: endOpts2, label: "2.º conjunto a la vez (opcional)" });
  qf.addButton({ title: "+ agregar etapa al final" }).on("click", () => actions.seqAdd?.(addv.src, addv.src2));
  if (q.stops.length) {
    q.sel = Math.min(Math.max(0, q.sel), q.stops.length - 1);
    const stopOpts = {};
    q.stops.forEach((s, i) => (stopOpts[`${i + 1} · ${labelOf(s.src)}`] = i));
    qf.addInput(q, "sel", { options: stopOpts, label: "etapa" }).on("change", (ev) => actions.seqSelect?.(ev.value));
    const stop = q.stops[q.sel];
    const srcOpts = { ...endOpts };
    if (!validKeys.includes(stop.src)) srcOpts["⚠ falta (elegí otro)"] = stop.src;
    qf.addInput(stop, "src", { options: srcOpts, label: "  conjunto" }).on("change", () => actions.seqChanged?.(true));
    qf.addInput(stop, "hold", { min: 0, max: 30, step: 0.1, label: "  se queda (s)" }).on("change", () => actions.seqChanged?.());
    if (q.sel < q.stops.length - 1) qf.addInput(stop, "trans", { min: 0.1, max: 30, step: 0.1, label: "  tarda en pasar (s)" }).on("change", () => actions.seqChanged?.());
    qf.addInput(stop.pos, "x", { min: -1500, max: 1500, step: 1, label: "  posición X" });
    qf.addInput(stop.pos, "y", { min: -1000, max: 1000, step: 1, label: "  posición Y" });
    qf.addInput(stop.pos, "scale", { min: 0.05, max: 5, label: "  escala" });
    qf.addInput(stop.pos, "rot", { min: -720, max: 720, step: 0.5, label: "  rotación (°)" });
    qf.addInput(stop.pos, "op", { min: 0, max: 1, label: "  opacidad" });
    stop.src2 ??= "";
    const src2Opts = { ...endOpts2 };
    if (stop.src2 && !validKeys.includes(stop.src2)) src2Opts["⚠ falta (elegí otro)"] = stop.src2;
    qf.addInput(stop, "src2", { options: src2Opts, label: "  2.º conjunto (a la vez)" }).on("change", () => actions.seqChanged?.(true));
    if (stop.src2 && stop.pos2) {
      qf.addInput(stop.pos2, "x", { min: -1500, max: 1500, step: 1, label: "  2.º posición X" });
      qf.addInput(stop.pos2, "y", { min: -1000, max: 1000, step: 1, label: "  2.º posición Y" });
      qf.addInput(stop.pos2, "scale", { min: 0.05, max: 5, label: "  2.º escala" });
      qf.addInput(stop.pos2, "rot", { min: -720, max: 720, step: 0.5, label: "  2.º rotación (°)" });
      qf.addInput(stop.pos2, "op", { min: 0, max: 1, label: "  2.º opacidad" });
    }
    qf.addButton({ title: "tomar la posición que tiene el conjunto" }).on("click", () => actions.seqTake?.());
    qf.addButton({ title: "duplicar esta etapa" }).on("click", () => actions.seqDup?.());
    qf.addButton({ title: "▲ subir  (pasa antes)" }).on("click", () => actions.seqMove?.(-1));
    qf.addButton({ title: "▼ bajar  (pasa después)" }).on("click", () => actions.seqMove?.(1));
    qf.addButton({ title: "✕ quitar esta etapa" }).on("click", () => actions.seqDel?.());
  }
  qf.addInput(q, "repeat", { options: { "una vez": "once", "repetir": "loop", "ida y vuelta": "pingpong" }, label: "al terminar" });
  qf.addInput(q, "ease", { options: { "suave (arranca y frena)": "smooth", "constante": "linear" }, label: "curva" });
  qf.addInput(m, "travel", { min: 0, max: 1, step: 0.05, label: "viaje de las formas (0 = fundido)" });
  qf.addInput(m, "stagger", { min: 0, max: 0.9, step: 0.05, label: "escalonado" });
  qf.addInput(m, "swirl", { min: -0.6, max: 0.6, step: 0.02, label: "curva del camino" });
  qf.addInput(m, "scatter", { min: 0, max: 3, step: 0.05, label: "dispersión" });
  qf.addInput(m, "scatterDir", { options: { "horizontal (a los costados)": "horizontal", "para todos lados": "all" }, label: "hacia dónde se dispersan" });
  qf.addInput(q, "only", { label: "solo estas etapas" });
  qf.addButton({ title: "▶ reproducir la línea de tiempo" }).on("click", () => actions.seqPlay?.());
  qf.addButton({ title: "⏯ pausa / seguir" }).on("click", () => actions.seqToggle?.());
  qf.addButton({ title: "■ salir de la línea de tiempo" }).on("click", () => actions.seqStop?.());
  qf.addButton({ title: "⬇ exportar la línea de tiempo (secuencia de PNG)" }).on("click", () => actions.exportSeq?.());

  // ---- transformar, mover y animar el conjunto seleccionado ----
  const xfF = pane.addFolder({ title: "Transformar y mover" });
  xfF.addInput(scene.settings, "gizmo", { label: "manijas en pantalla" });
  xfF.addInput(scene.settings, "wrap", { label: "pantalla infinita (lo que sale por un lado entra por el otro)" });
  xfF.addInput(params, "posX", { min: -1500, max: 1500, step: 1, label: "posición X" });
  xfF.addInput(params, "posY", { min: -1000, max: 1000, step: 1, label: "posición Y" });
  xfF.addInput(params, "rotation", { min: -720, max: 720, step: 0.5, label: "rotación (°)" });
  xfF.addInput(params, "scale", { min: 0.05, max: 5, label: "escala" });
  xfF.addInput(params, "tOpacity", { min: 0, max: 1, label: "opacidad del conjunto" });
  xfF.addInput(params, "pivotMode", {
    options: {
      "su propio eje (centro de la pieza)": "own",
      "centro del lienzo (orbita)": "canvas",
      "pivote manual": "manual",
    },
    label: "gira sobre",
  });
  xfF.addInput(params, "pivotX", { min: -1000, max: 1000, step: 1, label: "pivote X" });
  xfF.addInput(params, "pivotY", { min: -700, max: 700, step: 1, label: "pivote Y" });
  xfF.addButton({ title: "volver a 0 (posición, rotación, escala, pivote)" }).on("click", () => {
    Object.assign(params, { posX: 0, posY: 0, rotation: 0, scale: 1, pivotX: 0, pivotY: 0, tOpacity: 1 });
    actions.rebuild?.();
  });

  const moveF = pane.addFolder({ title: "Movimiento continuo" });
  moveF.addInput(params, "spinSpeed", { min: -360, max: 360, label: "giro (°/seg)" });
  moveF.addInput(params, "spinAudio", { min: -360, max: 360, label: "giro con graves (°/seg)" });
  moveF.addInput(params, "swingAmp", { min: 0, max: 180, label: "vaivén: amplitud (°)" });
  moveF.addInput(params, "swingSpeed", { min: 0, max: 4, label: "vaivén: velocidad" });
  moveF.addInput(params, "orbitRX", { min: 0, max: 800, label: "órbita: radio X" });
  moveF.addInput(params, "orbitRY", { min: 0, max: 800, label: "órbita: radio Y" });
  moveF.addInput(params, "orbitSpeed", { min: -2, max: 2, label: "órbita: vueltas/seg" });
  moveF.addInput(params, "orbitPhase", { min: 0, max: 360, label: "órbita: arranque (°)" });
  moveF.addInput(params, "driftAmount", { min: 0, max: 400, label: "deriva: cuánto" });
  moveF.addInput(params, "driftSpeed", { min: 0, max: 3, label: "deriva: velocidad" });
  moveF.addInput(params, "pulseScale", { min: 0, max: 1, label: "pulso de tamaño" });
  moveF.addInput(params, "pulseSpeed", { min: 0, max: 4, label: "pulso: velocidad" });
  moveF.addInput(params, "pulseAudio", { min: 0, max: 2, label: "crece con graves" });

  // línea de tiempo: una sola para todos los conjuntos. Cada conjunto guarda sus
  // propios keyframes (posición, rotación, escala, opacidad); al reproducir o mover
  // el tiempo, los valores se interpolan entre keyframes.
  const tl = scene.timeline;
  const tlF = pane.addFolder({ title: "Animación (keyframes)" });
  tlF.addInput(tl, "playing", { label: "▶ reproducir" });
  // El tiempo actual se MUESTRA con un indicador de solo lectura, y se MUEVE con
  // un slider aparte ("ir a"). No se ata un slider al tiempo "vivo" porque
  // Tweakpane, al redibujarlo mientras la animación corre, escribe de vuelta
  // su valor y le suma tiempo de más (hacía que la animación fuera ~20% rápida).
  tlF.addMonitor(tl, "time", { label: "tiempo actual (s)", interval: 80 });
  const scrub = { t: tl.time };
  tlF.addInput(scrub, "t", { min: 0, max: tl.duration, step: 0.01, label: "ir a (s)" }).on("change", (ev) => {
    tl.time = ev.value;
    // al mover el tiempo los valores animados cambian solos: se refrescan los demás sliders
    setTimeout(() => actions.refreshPanel?.(), 30);
  });
  tlF.addButton({ title: "⏮ volver al inicio" }).on("click", () => {
    tl.time = 0;
    scrub.t = 0;
    setTimeout(() => actions.refreshPanel?.(), 30);
  });
  tlF.addInput(tl, "duration", { min: 1, max: 120, step: 0.5, label: "duración (s)" }).on("change", () => actions.rebuild?.());
  tlF.addInput(tl, "loop", { label: "repetir" });
  tlF.addInput(tl, "ease", { options: { "suave (arranca y frena)": "smooth", lineal: "linear" }, label: "interpolación" });
  tlF.addButton({ title: `+ keyframe de "${conjunto.name}" ahora` }).on("click", () => actions.addKey?.());
  tlF.addButton({ title: "− borrar el keyframe más cercano" }).on("click", () => actions.removeKey?.());
  tlF.addButton({ title: "limpiar todos sus keyframes" }).on("click", () => actions.clearKeys?.());
  tlF.addMonitor({ keys: scene.keysInfo(conjunto) }, "keys", { label: "keyframes" });

  const audioF = pane.addFolder({ title: "Reactividad audio" });
  audioF.addInput(params, "bassReactivity", { min: 0, max: 3, label: "graves" });
  audioF.addInput(params, "midReactivity", { min: 0, max: 3, label: "medios" });
  audioF.addInput(params, "overallReactivity", { min: 0, max: 3, label: "general" });

  const shapesF = pane.addFolder({ title: "Formas generativas" });
  const shapesModeInput = shapesF.addInput(params, "visualMode", {
    options: {
      anillo: "ring",
      grilla: "grid",
      "picos radiales": "spikes",
      barras: "bars",
      espiral: "spiral",
      "auras / gotas": "auras",
      "remolino de círculos": "vortex",
      "ecos de aura": "echoes",
      "aura envolvente": "ambient",
      "aura de colores (mezcla)": "mix",
    },
    label: "modo",
  });
  shapesF.addInput(params, "baseRadius", { min: 0, max: 400, label: "radio base" });
  shapesF.addInput(params, "auraReach", { min: 0.5, max: 4, step: 0.05, label: "alcance del aura (más = se funden de más lejos)" });
  shapesF.addInput(params, "shapeSize", { min: 1, max: 60, label: "tamaño" });
  shapesF.addInput(params, "rotationSpeed", { min: -2, max: 2, label: "rotación" });
  shapesF.addInput(params, "colorMode", {
    options: { reactivo: "reactive", fijo: "fixed", degradado: "gradient", "según frecuencia": "frequency" },
    label: "modo color",
  });
  shapesF.addInput(params, "colorA", { label: "color A" });
  shapesF.addInput(params, "colorB", { label: "color B (degradado)" });
  shapesF.addInput(params, "hueSpread", { min: 0, max: 3, label: "dispersión arcoíris" });
  shapesF.addInput(params, "saturation", { min: 0, max: 100, label: "saturación" });
  shapesF.addInput(params, "lightness", { min: 0, max: 100, label: "luminosidad" });
  shapesF.addInput(params, "shapeOpacity", { min: 0, max: 1, label: "opacidad general" });
  shapesF.addInput(params, "shapeBlendMode", {
    options: { normal: "source-over", suma: "lighter", pantalla: "screen", multiplicar: "multiply" },
    label: "mezcla",
  });
  shapesF.addInput(params, "glowAmount", { min: 0, max: 40, label: "resplandor (blur)" });

  // barras: en qué parte reaccionan más al sonido
  const barsF = pane.addFolder({ title: "Barras: reacción y degradado" });
  barsF.addMonitor({ txt: 'Con el modo "barras": lo más fuerte del sonido queda en el foco (por defecto, el centro). Movelo acá o con click / arrastre sobre el lienzo' }, "txt", { label: "cómo" });
  const focusOn = () => {
    // al mover el foco por primera vez se activa solo (si no, no se notaría nada)
    if (!params.barFocusAmount) params.barFocusAmount = 0.85;
    actions.refreshPanel?.();
  };
  barsF.addInput(params, "barGradient", {
    options: { "de costado a costado": "side", "de abajo a arriba": "up", "de arriba a abajo": "down" },
    label: "dirección del degradado",
  });
  barsF.addInput(params, "barBalance", { min: 0, max: 1, label: "  dónde cambia el color (base ↔ punta)" });
  barsF.addInput(params, "barSoftness", { min: 0, max: 1, label: "  qué tan suave es el cambio" });
  barsF.addInput(params, "barFocusX", { min: 0, max: 1, label: "dónde (izq ↔ der)" }).on("change", focusOn);
  barsF.addInput(params, "barFocusWidth", { min: 0.03, max: 1, label: "qué tan ancho" }).on("change", focusOn);
  barsF.addInput(params, "barFocusAmount", { min: 0, max: 1, label: "cuánto (0 = como antes)" });
  // al elegir el modo barras, esta carpeta se abre sola
  shapesModeInput.on("change", (ev) => {
    if (ev.value === "bars") barsF.expanded = true;
  });

  // degradado de tono y forma de los ecos
  const styleF = pane.addFolder({ title: "Degradados y forma" });
  styleF.addInput(params, "edgeHueShift", { min: 0, max: 180, label: "degradado de tono" });
  styleF.addInput(params, "echoAngle", { min: 0, max: 360, label: "dirección (ecos)" });
  styleF.addInput(params, "echoShape", {
    options: { "mancha blanda": "blob", "medio círculo": "half", círculo: "circle" },
    label: "forma (ecos)",
  });

  // ---- deformar ----
  const deformF = pane.addFolder({ title: "Deformar (auras, círculos, manchas…)" });
  deformF.addInput(params, "deformStretch", { min: 0.3, max: 3, label: "estirar" });
  deformF.addInput(params, "deformAngle", { min: 0, max: 180, label: "ángulo" });
  deformF.addInput(params, "deformWobble", { min: 0, max: 0.9, label: "ondulación" });
  deformF.addInput(params, "deformWobbleAudio", { min: 0, max: 1, label: "ondulación x audio" });
  deformF.addInput(params, "deformSpeed", { min: 0, max: 4, label: "velocidad" });
  deformF.addInput(params, "deformSpin", { min: -360, max: 360, label: "giro propio (°/seg)" });
  deformF.addInput(params, "deformDots", { label: "aplicar: círculos" });
  deformF.addInput(params, "deformAuras", { label: "aplicar: gotas / auras" });
  deformF.addInput(params, "deformVortex", { label: "aplicar: aros remolino" });
  deformF.addInput(params, "deformEchoes", { label: "aplicar: copias (círculo)" });
  deformF.addInput(params, "deformBlobs", { label: "aplicar: manchas" });
  deformF.addInput(params, "deformFree", { label: "aplicar: círculos libres" });

  // ---- cada cosa: cantidad, relleno/contorno y opacidad ----
  const STYLE = { relleno: "fill", contorno: "outline", "relleno + contorno": "both" };
  const DOT_STYLE = { ...STYLE, "aura (degradado)": "aura" };

  const eachF = pane.addFolder({ title: "Cada cosa: cantidad, relleno y opacidad" });
  eachF.addInput(params, "allStyle", {
    options: { "cada uno el suyo": "each", "todo relleno": "fill", "todo contorno": "outline", "todo relleno + contorno": "both" },
    label: "estilo de TODO",
  });
  eachF.addInput(params, "outlineWidth", { min: 0.5, max: 12, label: "grosor contorno" });

  const dotsF = eachF.addFolder({ title: "Círculos (anillo / grilla / espiral)" });
  dotsF.addInput(params, "dotCount", { min: 1, max: 300, step: 1, label: "cantidad" });
  dotsF.addInput(params, "dotStyle", { options: DOT_STYLE, label: "estilo" });
  dotsF.addInput(params, "dotOpacity", { min: 0, max: 1, label: "opacidad" });

  const vortexF = eachF.addFolder({ title: "Aros del remolino" });
  vortexF.addInput(params, "vortexRings", { min: 2, max: 200, step: 1, label: "cantidad" });
  vortexF.addInput(params, "vortexStyle", { options: STYLE, label: "estilo" });
  vortexF.addInput(params, "vortexOpacity", { min: 0, max: 1, label: "opacidad" });

  const coresF = eachF.addFolder({ title: "Núcleos de luz (remolino)" });
  coresF.addInput(params, "coreCount", { min: 0, max: 2, step: 1, label: "cantidad" });
  coresF.addInput(params, "coreGlow", { min: 0, max: 1, label: "opacidad" });

  const echoesF = eachF.addFolder({ title: "Copias (ecos de aura)" });
  echoesF.addInput(params, "echoCount", { min: 2, max: 30, step: 1, label: "cantidad" });
  echoesF.addInput(params, "echoLag", { min: 0, max: 0.95, label: "retraso entre copias" });
  echoesF.addInput(params, "echoFollowMove", { label: "cola detrás del movimiento" });
  echoesF.addInput(params, "echoTurn", { min: 0.02, max: 0.5, label: "qué tan rápido gira la cola" });
  echoesF.addInput(params, "echoReturn", { min: 0, max: 1, label: "volver al ángulo fijo" });
  echoesF.addInput(params, "echoSpin", { min: -360, max: 360, label: "giro de la cola (°/seg)" });
  echoesF.addInput(params, "echoStyle", { options: STYLE, label: "estilo" });
  echoesF.addInput(params, "echoOpacity", { min: 0, max: 1, label: "opacidad" });

  const blobsF = eachF.addFolder({ title: "Manchas (aura envolvente)" });
  blobsF.addInput(params, "blobCount", { min: 2, max: 16, step: 1, label: "cantidad" });
  blobsF.addInput(params, "blobStyle", { options: STYLE, label: "estilo" });
  blobsF.addInput(params, "blobOpacity", { min: 0, max: 1, label: "opacidad" });

  const spikesF = eachF.addFolder({ title: "Picos y barras" });
  spikesF.addInput(params, "spectrumBins", { min: 8, max: 128, step: 1, label: "cantidad" });
  spikesF.addInput(params, "spikeOpacity", { min: 0, max: 1, label: "opacidad picos" });
  spikesF.addInput(params, "barStyle", { options: STYLE, label: "estilo barras" });
  spikesF.addInput(params, "barOpacity", { min: 0, max: 1, label: "opacidad barras" });

  const aurasF = eachF.addFolder({ title: "Gotas / auras" });
  aurasF.addInput(params, "auraMax", { min: 1, max: 100, step: 1, label: "máx. a la vez" });
  aurasF.addInput(params, "auraStyle", { options: STYLE, label: "estilo" });
  aurasF.addInput(params, "auraOpacity", { min: 0, max: 1, label: "opacidad" });

  // ---- aura de colores ----
  const mixF = pane.addFolder({ title: "Aura de colores (mezcla)" });
  // cantidad de luces: la que quieras (hasta 100); cada una con su selector de color.
  // Al subir la cantidad, los colores nuevos se generan solos (se pueden cambiar).
  mixF.addInput(params, "mixCount", { min: 1, max: 100, step: 1, label: "cantidad de colores" }).on("change", () => {
    const n = Math.max(1, Math.round(params.mixCount));
    for (let i = 1; i <= n; i++) if (!params["mixColor" + i]) params["mixColor" + i] = defaultMixColor(i - 1);
    // se rearma el panel para mostrar un selector por cada color (un instante después
    // de que dejes de mover el slider, para no cortarte el arrastre)
    clearTimeout(mixRebuildTimer);
    mixRebuildTimer = setTimeout(() => actions.rebuild?.(), 500);
  });
  const nMix = Math.max(1, Math.round(params.mixCount));
  for (let i = 1; i <= nMix; i++) {
    if (!params["mixColor" + i]) params["mixColor" + i] = defaultMixColor(i - 1);
    mixF.addInput(params, "mixColor" + i, { label: "color " + i });
  }
  mixF.addInput(params, "mixSize", { min: 60, max: 3000, label: "tamaño" });
  mixF.addInput(params, "mixSizeMul", { min: 1, max: 40, step: 0.1, label: "agrandar (×, para hacerla enorme)" });
  mixF.addInput(params, "mixOpacity", { min: 0, max: 1, label: "opacidad" });
  mixF.addInput(params, "mixBlend", {
    options: { "mezclar (normal)": "source-over", "pantalla (más claro)": "screen", "luz (suma, se quema a blanco)": "lighter" },
    label: "cómo se mezclan",
  });
  mixF.addInput(params, "mixPull", { min: 0, max: 1, label: "atracción al centro" });
  mixF.addInput(params, "mixDrift", { min: 0, max: 1, label: "flotar" });
  mixF.addInput(params, "mixSpeed", { min: 0, max: 800, step: 5, label: "velocidad (rebotan en las paredes)" });
  mixF.addInput(params, "mixHandles", { label: "mostrar manijas" });
  mixF.addInput(params, "deformMix", { label: "aplicar deformación" });

  // ---- cosas para agarrar con el mouse ----
  const grabF = pane.addFolder({ title: "Agarrar y mover (mouse)" });
  grabF.addInput(params, "physFollow", { min: 0, max: 0.95, label: "suavidad al arrastrar" });
  grabF.addInput(params, "physInertia", { min: 0, max: 0.99, label: "inercia al soltar" });
  grabF.addInput(params, "physGravity", { min: 0, max: 3, label: "gravedad (círc. libres)" });
  grabF.addInput(params, "physBounce", { min: 0, max: 1, label: "rebote" });
  grabF.addInput(params, "freeCount", { min: 0, max: 12, step: 1, label: "círculos libres" });
  grabF.addInput(params, "freeStyle", { options: STYLE, label: "estilo" });
  grabF.addInput(params, "freeOpacity", { min: 0, max: 1, label: "opacidad" });
  grabF.addInput(params, "freeCircleSize", { min: 8, max: 120, label: "tamaño" });
  grabF.addInput(params, "trailLife", { min: 0.5, max: 12, label: "duración estela (s)" });
  grabF.addButton({ title: "recentrar pieza y núcleos" }).on("click", () => actions.resetPiece?.());

  // ---- círculos libres: colores y texturas, para jugar con ellos ----
  const freeF = pane.addFolder({ title: "Círculos libres: colores y texturas" });
  freeF.addInput(params, "freeCount", { min: 0, max: 12, step: 1, label: "cantidad de círculos" });
  freeF.addInput(params, "freeCircleSize", { min: 8, max: 300, label: "tamaño" });
  freeF.addInput(params, "freeColorMode", {
    options: {
      "como el resto (colores A / B del panel)": "same",
      "colores propios (cabeza y estela)": "own",
      "uno distinto por círculo": "each",
      "arcoíris que gira": "rainbow",
    },
    label: "colores",
  }).on("change", () => actions.rebuild?.());
  if (params.freeColorMode === "own") {
    freeF.addInput(params, "freeColorA", { label: "  color de la cabeza" });
    freeF.addInput(params, "freeColorB", { label: "  color del final de la estela" });
  } else if (params.freeColorMode === "each") {
    for (let i = 1; i <= 6; i++) freeF.addInput(params, "freeColor" + i, { label: `  círculo ${i}` });
  }
  freeF.addInput(params, "freeTexture", {
    options: {
      "suave (como siempre)": "smooth",
      "liso": "flat",
      "aura (se difumina)": "aura",
      "cristal (con brillo)": "glass",
      "degradado": "gradient",
      "rayas": "stripes",
      "puntitos": "dots",
      "anillos": "rings",
      "granulado": "grain",
    },
    label: "textura",
  });
  freeF.addInput(params, "freeTextureScale", { min: 0.3, max: 3, step: 0.05, label: "  tamaño del dibujo" });
  freeF.addInput(params, "freeTextureStrength", { min: 0, max: 1, label: "  cuánto se nota" });
  freeF.addInput(params, "freeStyle", { options: STYLE, label: "estilo (relleno / contorno)" });
  freeF.addInput(params, "freeOpacity", { min: 0, max: 1, label: "opacidad" });
  freeF.addInput(params, "trailLife", { min: 0.5, max: 12, label: "duración estela (s)" });

  // paleta del modo "según frecuencia": cada fila es un check (prendido o
  // apagado) más su selector de color. Podés dejar 2 activos o los 6.
  const paletteF = pane.addFolder({ title: 'Paleta ("según frecuencia")' });
  paletteF.addInput(params, "paletteEnabled1", { label: "color 1" });
  paletteF.addInput(params, "paletteColor1", { label: " " });
  paletteF.addInput(params, "paletteEnabled2", { label: "color 2" });
  paletteF.addInput(params, "paletteColor2", { label: " " });
  paletteF.addInput(params, "paletteEnabled3", { label: "color 3" });
  paletteF.addInput(params, "paletteColor3", { label: " " });
  paletteF.addInput(params, "paletteEnabled4", { label: "color 4" });
  paletteF.addInput(params, "paletteColor4", { label: " " });
  paletteF.addInput(params, "paletteEnabled5", { label: "color 5" });
  paletteF.addInput(params, "paletteColor5", { label: " " });
  paletteF.addInput(params, "paletteEnabled6", { label: "color 6" });
  paletteF.addInput(params, "paletteColor6", { label: " " });

  const videoF = pane.addFolder({ title: "Capa de video" });
  videoF.addInput(gp, "videoOpacity", { min: 0, max: 1, label: "opacidad" });
  videoF.addInput(gp, "blendMode", {
    options: {
      normal: "source-over",
      pantalla: "screen",
      multiplicar: "multiply",
      diferencia: "difference",
      superponer: "overlay",
    },
    label: "mezcla",
  });
  videoF.addInput(gp, "blur", { min: 0, max: 30, label: "desenfoque" });
  videoF.addInput(gp, "hueRotate", { min: 0, max: 360, label: "rotar tono" });
  videoF.addInput(gp, "invert", { label: "invertir" });
  videoF.addInput(gp, "contrast", { min: 0, max: 3, label: "contraste" });
  videoF.addInput(gp, "saturate", { min: 0, max: 3, label: "saturación" });

  // cada efecto de acá abajo se puede prender/apagar por separado y se
  // combinan entre sí (ej: mirror + glitch + flash, todos juntos)
  const fxF = pane.addFolder({ title: "Efectos de video" });

  fxF.addInput(gp, "fxMirror", { label: "espejo" });

  fxF.addInput(gp, "fxWarp", { label: "distorsión / onda" });
  fxF.addInput(gp, "warpAmount", { min: 0, max: 1, label: "intensidad" });
  fxF.addInput(gp, "warpSpeed", { min: 0, max: 5, label: "velocidad" });

  fxF.addInput(gp, "fxSlices", { label: "cortes" });
  fxF.addInput(gp, "sliceCount", { min: 2, max: 40, step: 1, label: "cantidad" });
  fxF.addInput(gp, "sliceAmount", { min: 0, max: 1, label: "desplazamiento" });

  fxF.addInput(gp, "fxRotate", { label: "rotación" });
  fxF.addInput(gp, "rotateSpeed", { min: -2, max: 2, label: "velocidad" });

  fxF.addInput(gp, "fxPixelate", { label: "pixelado" });
  fxF.addInput(gp, "pixelateSize", { min: 2, max: 60, step: 1, label: "tamaño píxel" });

  fxF.addInput(gp, "fxDuotone", { label: "duotono" });
  fxF.addInput(gp, "duotoneDark", { label: "color oscuro" });
  fxF.addInput(gp, "duotoneLight", { label: "color claro" });

  fxF.addInput(gp, "fxRgbSplit", { label: "separación RGB" });
  fxF.addInput(gp, "rgbSplitAmount", { min: 0, max: 40, label: "cantidad" });

  fxF.addInput(gp, "fxTrails", { label: "estela / trails" });
  fxF.addInput(gp, "trailAmount", { min: 0, max: 0.95, label: "persistencia" });

  fxF.addInput(gp, "fxGlitch", { label: "glitch" });
  fxF.addInput(gp, "glitchAmount", { min: 0, max: 1, label: "intensidad glitch" });

  fxF.addInput(gp, "fxFlash", { label: "flash (con el beat)" });
  fxF.addInput(gp, "flashIntensity", { min: 0, max: 1, label: "intensidad flash" });
  fxF.addInput(gp, "flashColor", { label: "color flash" });

  const bgF = pane.addFolder({ title: "Fondo" });
  bgF.addInput(gp, "bgColor", { label: "color" });

  // ---- lienzo: el tamaño de lo que se ve y se graba ----
  // Es como la "composición" de After: un tamaño fijo, que se muestra achicado
  // para que entre en la ventana. Todo (grabación, exportación, posiciones en
  // píxeles) está en ESE tamaño. "ventana" lo adapta al tamaño de la ventana.
  const canvasF = pane.addFolder({ title: "Lienzo (tamaño de lo que se graba)" });
  canvasF
    .addInput(gp, "canvasPreset", {
      options: {
        "ventana (se adapta)": "window",
        "Full HD 1920 × 1080 (16:9)": "1920x1080",
        "HD 1280 × 720 (16:9)": "1280x720",
        "4K 3840 × 2160 (16:9, pesado)": "3840x2160",
        "8K 7680 × 4320 (16:9, muy pesado)": "7680x4320",
        "vertical 1080 × 1920 (9:16, reels)": "1080x1920",
        "cuadrado 1080 × 1080 (1:1)": "1080x1080",
        "vertical 1080 × 1350 (4:5)": "1080x1350",
        "personalizado (usa ancho y alto)": "custom",
      },
      label: "tamaño",
    })
    .on("change", (ev) => {
      // al elegir un preset se copian sus medidas a ancho/alto, para poder retocarlas
      const m = /^(\d+)x(\d+)$/.exec(ev.value);
      if (m) {
        gp.canvasW = +m[1];
        gp.canvasH = +m[2];
      }
      actions.applyCanvas?.();
      setTimeout(() => actions.refreshPanel?.(), 30);
    });
  canvasF.addInput(gp, "canvasW", { min: 64, max: 32000, step: 2, label: "ancho (px)" }).on("change", () => {
    gp.canvasPreset = "custom";
    actions.applyCanvas?.();
    setTimeout(() => actions.refreshPanel?.(), 30);
  });
  canvasF.addInput(gp, "canvasH", { min: 64, max: 16000, step: 2, label: "alto (px)" }).on("change", () => {
    gp.canvasPreset = "custom";
    actions.applyCanvas?.();
    setTimeout(() => actions.refreshPanel?.(), 30);
  });
  canvasF.addButton({ title: "⇄ girar (intercambiar ancho y alto)" }).on("click", () => {
    [gp.canvasW, gp.canvasH] = [gp.canvasH, gp.canvasW];
    gp.canvasPreset = "custom";
    actions.applyCanvas?.();
    setTimeout(() => actions.refreshPanel?.(), 30);
  });

  // ---- grabación en vivo (video) ----
  const recF = pane.addFolder({ title: "Grabación: formato y calidad" });
  recF.addInput(gp, "recFormat", {
    options: {
      "MP4 H.264 (After Effects, Premiere, redes)": "mp4",
      "WebM VP9 (liviano, solo navegador)": "webm9",
      "WebM VP8 (compatible)": "webm8",
      "Secuencia de PNG, sin fondo (en vivo)": "png",
    },
    label: "formato",
  });
  recF.addInput(gp, "recScale", {
    options: { "completa (100 %)": 1, "75 %": 0.75, "mitad (50 %)": 0.5, "35 %": 0.35 },
    label: "resolución al grabar en vivo",
  });
  recF.addInput(gp, "recFps", { options: { "24 cuadros/seg (cine)": 24, "30 cuadros/seg": 30, "60 cuadros/seg": 60 }, label: "cuadros/seg" });
  recF.addInput(gp, "recBitrate", { min: 2, max: 200, step: 1, label: "calidad (Mbps, solo video)" });
  recF.addInput(gp, "pngSaveTo", {
    options: { "un ZIP que se descarga solo (arranca al instante)": "zip", "un archivo ZIP que elijo antes (para MUCHOS cuadros; solo Chrome)": "zipfile", "una carpeta que elijo (solo Chrome)": "folder" },
    label: "PNG: guardar en",
  });

  // ---- exportar la animación ----
  // Hay dos tipos: un SOLO ARCHIVO que se mueve (PNG animado o GIF), o una
  // SECUENCIA (carpeta con una imagen por cuadro, para After Effects).
  const exportF = pane.addFolder({ title: "Exportar animación (PNG animado, GIF, secuencia)" });

  const animF = exportF.addFolder({ title: "Un solo archivo que se mueve (PNG animado / GIF)" });
  animF.addInput(gp, "animSeconds", { min: 1, max: 120, step: 0.5, label: "duración (s)" }).on("change", () => actions.syncAnimDuration?.());
  animF.addInput(gp, "animFps", { options: { "12 cuadros/seg": 12, "15 cuadros/seg": 15, "20 cuadros/seg": 20, "24 cuadros/seg": 24, "30 cuadros/seg": 30 }, label: "cuadros/seg" });
  animF.addInput(gp, "animWidth", { min: 160, max: 4096, step: 10, label: "ancho del archivo (px)" });
  animF.addInput(gp, "pngTransparent", { label: "fondo transparente (PNG animado y secuencia)" });
  animF.addInput(gp, "gifTransparent", { label: "GIF: fondo transparente" });
  animF.addInput(gp, "pngIncludeVideo", { label: "incluir el video cargado" });
  animF.addButton({ title: "▶ exportar PNG animado" }).on("click", () => actions.exportApng?.());
  animF.addButton({ title: "▶ exportar GIF" }).on("click", () => actions.exportGif?.());

  exportF.addButton({ title: "⇄ convertir un PNG animado / GIF ya hecho a secuencia…" }).on("click", () => actions.pickConvert?.());

  const pngF = exportF.addFolder({ title: "Secuencia de PNG (carpeta de imágenes, para After)" });
  pngF.addInput(gp, "pngSaveTo", {
    options: { "un ZIP que se descarga solo (arranca al instante)": "zip", "un archivo ZIP que elijo antes (para MUCHOS cuadros; solo Chrome)": "zipfile", "una carpeta que elijo (solo Chrome)": "folder" },
    label: "guardar en",
  });
  pngF.addInput(gp, "pngScale", {
    options: { "×1 (tamaño del lienzo)": 1, "×2 (el doble de resolución)": 2, "×3 (el triple)": 3, "×4 (cuatro veces, muy pesado)": 4 },
    label: "calidad (resolución)",
  });
  pngF.addInput(gp, "pngSeconds", { min: 1, max: 120, step: 1, label: "duración (s)" });
  pngF.addInput(gp, "pngFps", { options: { "24 cuadros/seg": 24, "30 cuadros/seg": 30, "60 cuadros/seg": 60 }, label: "cuadros/seg" });
  pngF.addButton({ title: "▶ exportar secuencia de PNG" }).on("click", () => actions.exportPng?.());

  // Conjunto bloqueado: las carpetas que lo editan quedan apagadas (se pueden abrir y mirar,
  // pero no tocar). Para editarlo hay que sacar el 🔒.
  if (conjunto.locked) {
    const editing = ["Transformar y mover", "Movimiento continuo", "Animación (keyframes)", "Reactividad audio", "Formas generativas", "Barras:", "Degradados y forma", "Deformar", "Cada cosa", "Aura de colores", "Agarrar y mover", "Paleta", "Agrandar varios"];
    for (const child of pane.children) {
      if (!("expanded" in child) || !editing.some((t) => child.title.startsWith(t))) continue;
      const body = child.element.querySelector(".tp-fldv_c");
      if (body) body.style.cssText += ";pointer-events:none;opacity:.45";
    }
    for (const b of setsF.children) if (b.title === "eliminar este conjunto") b.disabled = true;
  }

  // Carpetas abiertas/cerradas. Al arrancar: todo cerrado menos "Conjuntos" y
  // "Formas generativas" (con tantas carpetas abiertas el panel es larguísimo).
  // Cuando el panel se rearma (por ejemplo al elegir otro conjunto) se respeta
  // lo que el usuario tenía abierto: openState guarda "ruta de títulos → abierta".
  const apply = (container, path) => {
    for (const child of container.children) {
      if (!("expanded" in child)) continue; // los sliders no son carpetas
      const key = path + "/" + child.title;
      child.expanded = openState ? !!openState[key] : path === "" && (["Conjuntos", "Formas generativas"].includes(child.title) || (params.visualMode === "bars" && child.title.startsWith("Barras:")));
      apply(child, key);
    }
  };
  apply(pane, "");

  return { pane };
}

// qué carpetas están abiertas ahora (para pasárselo a createControls al rearmar)
export function getOpenState(pane) {
  const state = {};
  const walk = (container, path) => {
    for (const child of container.children) {
      if (!("expanded" in child)) continue;
      const key = path + "/" + child.title;
      state[key] = child.expanded;
      walk(child, key);
    }
  };
  walk(pane, "");
  return state;
}
