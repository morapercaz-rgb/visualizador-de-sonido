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
import { listPresets } from "./presets.js?v=20261025201513";

export function createDefaultParams() {
  return {
    // reactividad: cuánto "pesa" cada banda de frecuencia sobre el dibujo
    bassReactivity: 1.0,
    midReactivity: 1.0,
    overallReactivity: 1.0,

    // formas generativas
    visualMode: "ring",
    baseRadius: 100,
    shapeSize: 8,
    rotationSpeed: 0.2,
    colorMode: "reactive",
    colorA: "#33aaff",
    colorB: "#ff3399",
    hueSpread: 1,

    // qué tan lejos llega el halo de las auras (1 = normal): con más alcance, dos auras se funden a más distancia
    auraReach: 1,

    // si este conjunto reacciona al sonido (apagado: se ve como con silencio)
    reactAudio: true,

    // paleta para el modo "según frecuencia": hasta 6 colores, cada uno con
    // su check para prenderlo o apagarlo. El sonido se mueve solo entre los
    // que estén activos.
    paletteEnabled1: true,
    paletteColor1: "#33aaff",
    paletteEnabled2: true,
    paletteColor2: "#ff3399",
    paletteEnabled3: true,
    paletteColor3: "#ffee33",
    paletteEnabled4: false,
    paletteColor4: "#33ff88",
    paletteEnabled5: false,
    paletteColor5: "#ff9933",
    paletteEnabled6: false,
    paletteColor6: "#aa33ff",
    saturation: 80,
    lightness: 55,
    shapeOpacity: 0.8,
    shapeBlendMode: "lighter",
    glowAmount: 0,

    edgeHueShift: 0, // cuánto cambia el tono del centro al borde (degradado)
    echoAngle: 0, // ecos: hacia dónde se abren (grados)
    echoShape: "blob", // blob | half | circle

    // --- transformación del conjunto entero ---
    posX: 0, // desplazamiento fijo (px)
    posY: 0,
    rotation: 0, // ángulo fijo (grados)
    scale: 1,
    pivotX: 0, // pivote: el punto alrededor del cual rota y escala (px desde el centro de la pantalla)
    pivotY: 0,
    pivotMode: "own", // eje de giro: own (su propio centro) | canvas (centro del lienzo, orbita) | manual
    tOpacity: 1, // opacidad de todo el conjunto

    // --- movimiento continuo (se suma a lo de arriba) ---
    spinSpeed: 0, // giro: grados por segundo (negativo = al revés)
    spinAudio: 0, // giro extra con los graves (grados por segundo)
    swingAmp: 0, // vaivén de rotación: cuántos grados para cada lado
    swingSpeed: 0.5, // vaivenes por segundo
    orbitRX: 0, // órbita: radio horizontal (px)
    orbitRY: 0, // radio vertical (px)
    orbitSpeed: 0.1, // vueltas por segundo (negativo = al revés)
    orbitPhase: 0, // en qué punto de la órbita arranca (grados)
    driftAmount: 0, // deriva: cuánto vaga (px)
    driftSpeed: 0.5,
    pulseScale: 0, // pulso de tamaño (± proporción)
    pulseSpeed: 0.5, // pulsos por segundo
    pulseAudio: 0, // cuánto crece con los graves

    // --- física al agarrar y mover (mouse) ---
    // Por defecto todo está en 0: lo que agarrás queda PEGADO al mouse y frena en
    // seco al soltarlo. Subir estos valores agrega suavidad e inercia (opcional).
    physFollow: 0, // 0 = pegado al mouse · cerca de 1 = lo persigue con mucho retraso
    physInertia: 0, // 0 = frena en seco al soltar · cerca de 1 = se desliza mucho
    physGravity: 0, // caída hacia abajo (círculos libres)
    physBounce: 0.6, // rebote contra los bordes de la pantalla

    // --- aura de colores (modo "aura de colores") ---
    mixCount: 5, // cuántas luces de color tiene el aura
    mixSize: 220,
    mixOpacity: 0.9,
    mixBlend: "source-over", // cómo se mezclan los colores: source-over | screen | lighter
    mixPull: 0, // atracción hacia el centro del grupo (0 = cada luz se queda donde la soltás)
    mixDrift: 0.4, // flotar solas
    mixSpeed: 120, // velocidad (px/seg) con la que recorren la pantalla y rebotan en las paredes (0 = quietas)
    mixHandles: true, // mostrar las manijas para agarrar cada luz
    deformMix: true,
    mixColor1: "#ff3b6b",
    mixColor2: "#ffb02e",
    mixColor3: "#3de0ff",
    mixColor4: "#8a5bff",
    mixColor5: "#3dff9a",
    mixColor6: "#ff6bd6",
    mixColor7: "#fff06b",
    mixColor8: "#5b8bff",

    // --- deformación de las cosas redondas ---
    deformStretch: 1, // 1 = redondo; más de 1 = alargado; menos de 1 = achatado
    deformAngle: 0, // hacia dónde apunta el estiramiento (grados)
    deformWobble: 0, // ondulación irregular del borde
    deformWobbleAudio: 0, // cuánto suma el volumen del audio a esa ondulación
    deformSpeed: 1, // velocidad de la ondulación
    deformSpin: 0, // cada elemento gira sobre su propio eje (°/seg); se nota si no es redondo
    deformDots: true, // a qué cosas se aplica
    deformAuras: true,
    deformVortex: true,
    deformEchoes: true,
    deformBlobs: true,
    deformFree: true,

    // --- cada tipo de cosa: cantidad, estilo (fill | outline | both) y opacidad ---
    // allStyle pisa todos los estilos a la vez ("each" = que cada uno use el suyo)
    allStyle: "each",
    outlineWidth: 2, // grosor de todos los contornos

    dotCount: 40, // círculos de anillo / grilla / espiral
    dotStyle: "fill", // fill | outline | both | aura
    dotOpacity: 1,

    vortexRings: 60, // aros del remolino
    vortexStyle: "outline",
    vortexOpacity: 1,
    coreCount: 2, // núcleos de luz del remolino (0, 1 o 2)
    coreGlow: 0.6, // opacidad de los núcleos

    echoCount: 8, // copias de los ecos
    echoLag: 0.6, // retraso de cada copia respecto a la anterior (0 = rígidas, cerca de 1 = muy fluidas)
    echoFollowMove: true, // la cola se acomoda detrás de la dirección del movimiento
    echoReturn: 0, // 0 = la cola se queda donde la dejó; más = vuelve al ángulo fijo
    echoTurn: 0.06, // qué tan rápido gira la cola para acomodarse (bajo = gira de a poco)
    echoSpin: 0, // giro propio de la cola (°/seg); 0 = no gira sola
    echoStyle: "fill",
    echoOpacity: 1,

    blobCount: 6, // manchas del aura envolvente
    blobStyle: "fill",
    blobOpacity: 1,

    spectrumBins: 48, // cantidad de picos y de barras
    spikeOpacity: 1,
    barStyle: "fill",
    barOpacity: 1,
    barGradient: "side", // dirección del degradado de las barras: side | up | down
    barBalance: 0.5, // a qué altura de la barra (0 = base, 1 = punta) se pasa de un color al otro
    barSoftness: 1, // qué tan gradual es ese pasaje (1 = todo el largo de la barra, 0 = corte seco)
    barFocusAmount: 0.85, // 0 = como siempre (graves a la izquierda, parejo); 1 = todo concentrado en el foco
    barFocusX: 0.5, // dónde está el foco (0 = izquierda, 1 = derecha)
    barFocusWidth: 0.35, // qué tan ancho es el foco

    auraMax: 40, // máximo de gotas/auras a la vez
    auraStyle: "fill",
    auraOpacity: 1,

    // círculos libres (se agarran con el mouse y dejan estela)
    freeCount: 0,
    freeStyle: "fill",
    freeOpacity: 1,
    freeCircleSize: 28,
    trailLife: 3, // segundos que tarda en borrarse la estela

    // capa de video
    videoOpacity: 0.6,
    blendMode: "screen",
    blur: 0,
    hueRotate: 0,
    invert: false,
    contrast: 1,
    saturate: 1,

    // efectos de video (se pueden combinar varios a la vez)
    fxMirror: false,
    fxWarp: false,
    warpAmount: 0.4,
    warpSpeed: 1.5,
    fxSlices: false,
    sliceCount: 8,
    sliceAmount: 0.5,
    fxRotate: false,
    rotateSpeed: 0.3,
    fxPixelate: false,
    pixelateSize: 12,
    fxDuotone: false,
    duotoneDark: "#1a1a2e",
    duotoneLight: "#ff6b35",
    fxRgbSplit: false,
    rgbSplitAmount: 8,
    fxTrails: false,
    trailAmount: 0.85,
    fxGlitch: false,
    glitchAmount: 0.4,
    fxFlash: false,
    flashIntensity: 0.8,
    flashColor: "#ffffff",

    // fondo
    bgColor: "#05050a",

    // lienzo (el tamaño de lo que se ve y se graba)
    canvasPreset: "window", // window | 1920x1080 | 1280x720 | 3840x2160 | 1080x1920 | 1080x1080 | 1080x1350 | custom
    canvasW: 1920,
    canvasH: 1080,

    // grabación
    recFormat: "mp4", // mp4 (lo lee After Effects) | webm9 | webm8
    recFps: 30,
    recBitrate: 12, // megabits por segundo

    // dónde se guardan las secuencias de PNG: "zip" (se descarga solo, sin permisos) o "folder" (una carpeta que elegís; solo Chrome)
    pngSaveTo: "zip",

    // exportar animación de un solo archivo (PNG animado o GIF)
    animSeconds: 10,
    animFps: 20,
    animWidth: 640, // ancho del archivo (se achica desde el lienzo, si no pesaría muchísimo)
    gifTransparent: false, // el GIF tiene transparencia de todo o nada: se ve mejor con fondo

    // exportar secuencia de PNG (cuadro a cuadro, sin perder calidad)
    pngSeconds: 10,
    pngFps: 30,
    pngTransparent: true, // fondo transparente (sin color de fondo)
    pngIncludeVideo: false, // con fondo transparente: ¿incluir también el video cargado?
  };
}

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
    let key = `${c.visible ? "" : "(oculto) "}${c.params.reactAudio === false ? "🔇 " : ""}${c.name}`;
    if (key in options) key += ` #${c.id}`; // dos conjuntos con el mismo nombre
    options[key] = c.id;
  }
  setsF.addInput(picker, "selected", { options, label: "editando" }).on("change", (ev) => actions.selectSet?.(ev.value));
  setsF.addInput(conjunto, "name", { label: "nombre" }).on("change", () => actions.rebuild?.());
  setsF.addInput(conjunto, "visible", { label: "visible" }).on("change", () => actions.rebuild?.());
  setsF.addInput(params, "reactAudio", { label: "reacciona al sonido" }).on("change", () => actions.rebuild?.());
  setsF.addButton({ title: "+ conjunto nuevo" }).on("click", () => actions.addSet?.());
  setsF.addButton({ title: "duplicar este conjunto" }).on("click", () => actions.duplicateSet?.());
  setsF.addButton({ title: "traer al frente" }).on("click", () => actions.bringToFront?.());
  setsF.addButton({ title: "eliminar este conjunto" }).on("click", () => actions.removeSet?.());

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
  mf.addInput(m, "b", { options: endOpts, label: "hasta (B)" });
  mf.addInput(m, "seconds", { min: 0.5, max: 60, step: 0.5, label: "duración (s)" });
  mf.addInput(m, "ease", { options: { "suave (arranca y frena)": "smooth", "constante": "linear" }, label: "curva" });
  mf.addInput(m, "repeat", { options: { "una vez": "once", "repetir": "loop", "ida y vuelta": "pingpong" }, label: "al terminar" });
  mf.addInput(m, "stagger", { min: 0, max: 0.9, step: 0.05, label: "escalonado (0 = todo junto)" });
  mf.addInput(m, "swirl", { min: -0.6, max: 0.6, step: 0.02, label: "curva del camino (0 = recto)" });
  mf.addInput(m, "only", { label: "solo estos dos" });
  mf.addButton({ title: "▶ ver la transformación" }).on("click", () => actions.morphPlay?.());
  mf.addButton({ title: "⏯ pausa / seguir" }).on("click", () => actions.morphToggle?.());
  mf.addButton({ title: "■ salir de la transformación" }).on("click", () => actions.morphStop?.());
  const morphView = { get avance() { return scene.morphProgress(); } };
  mf.addMonitor(morphView, "avance", { label: "avance", interval: 100, format: (v) => `${Math.round(v * 100)} %` });
  const seek = { v: 0 };
  mf.addInput(seek, "v", { min: 0, max: 1, label: "ir a (0 = A, 1 = B)" }).on("change", (ev) => actions.morphSeek?.(ev.value));
  mf.addButton({ title: "⬇ exportar la transformación (secuencia de PNG)" }).on("click", () => actions.exportMorph?.());
  mf.addMonitor({ txt: "usa cuadros/seg y fondo de 'Exportar animación'" }, "txt", { label: "nota" });

  // ---- línea de tiempo de varias etapas: conjuntos y posiciones que se van transformando ----
  const qf = pane.addFolder({ title: "Línea de tiempo (varias etapas)" });
  const q = scene.seq;
  const labelOf = (src) => Object.keys(endOpts).find((k) => endOpts[k] === src)?.replace(/ · (en la escena|guardado|de todos)$/, "") ?? "⚠ falta";
  qf.addMonitor({ txt: "cada etapa = un conjunto en una posición; entre etapas se transforma. Agregá etapas y mirá la barra de abajo." }, "txt", { label: "cómo" });
  const addv = { src: validKeys[0] ?? "" };
  qf.addInput(addv, "src", { options: endOpts, label: "conjunto" });
  qf.addButton({ title: "+ agregar etapa al final" }).on("click", () => actions.seqAdd?.(addv.src));
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
    qf.addButton({ title: "tomar la posición que tiene el conjunto" }).on("click", () => actions.seqTake?.());
    qf.addButton({ title: "duplicar esta etapa" }).on("click", () => actions.seqDup?.());
    qf.addButton({ title: "▲ subir  (pasa antes)" }).on("click", () => actions.seqMove?.(-1));
    qf.addButton({ title: "▼ bajar  (pasa después)" }).on("click", () => actions.seqMove?.(1));
    qf.addButton({ title: "✕ quitar esta etapa" }).on("click", () => actions.seqDel?.());
  }
  qf.addInput(q, "repeat", { options: { "una vez": "once", "repetir": "loop", "ida y vuelta": "pingpong" }, label: "al terminar" });
  qf.addInput(q, "ease", { options: { "suave (arranca y frena)": "smooth", "constante": "linear" }, label: "curva" });
  qf.addInput(m, "stagger", { min: 0, max: 0.9, step: 0.05, label: "escalonado" });
  qf.addInput(m, "swirl", { min: -0.6, max: 0.6, step: 0.02, label: "curva del camino" });
  qf.addInput(q, "only", { label: "solo estas etapas" });
  qf.addButton({ title: "▶ reproducir la línea de tiempo" }).on("click", () => actions.seqPlay?.());
  qf.addButton({ title: "⏯ pausa / seguir" }).on("click", () => actions.seqToggle?.());
  qf.addButton({ title: "■ salir de la línea de tiempo" }).on("click", () => actions.seqStop?.());
  qf.addButton({ title: "⬇ exportar la línea de tiempo (secuencia de PNG)" }).on("click", () => actions.exportSeq?.());

  // ---- transformar, mover y animar el conjunto seleccionado ----
  const xfF = pane.addFolder({ title: "Transformar y mover" });
  xfF.addInput(scene.settings, "gizmo", { label: "manijas en pantalla" });
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
  mixF.addInput(params, "mixCount", { min: 1, max: 8, step: 1, label: "cantidad de colores" });
  for (let i = 1; i <= 8; i++) mixF.addInput(params, "mixColor" + i, { label: "color " + i });
  mixF.addInput(params, "mixSize", { min: 60, max: 600, label: "tamaño" });
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
  canvasF.addInput(gp, "canvasW", { min: 64, max: 7680, step: 2, label: "ancho (px)" }).on("change", () => {
    gp.canvasPreset = "custom";
    actions.applyCanvas?.();
    setTimeout(() => actions.refreshPanel?.(), 30);
  });
  canvasF.addInput(gp, "canvasH", { min: 64, max: 4320, step: 2, label: "alto (px)" }).on("change", () => {
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
  recF.addInput(gp, "recFps", { options: { "24 cuadros/seg (cine)": 24, "30 cuadros/seg": 30, "60 cuadros/seg": 60 }, label: "cuadros/seg" });
  recF.addInput(gp, "recBitrate", { min: 2, max: 80, step: 1, label: "calidad (Mbps, solo video)" });
  recF.addInput(gp, "pngSaveTo", {
    options: { "un ZIP (se descarga solo)": "zip", "una carpeta que elijo (solo Chrome)": "folder" },
    label: "PNG: guardar en",
  });

  // ---- exportar la animación ----
  // Hay dos tipos: un SOLO ARCHIVO que se mueve (PNG animado o GIF), o una
  // SECUENCIA (carpeta con una imagen por cuadro, para After Effects).
  const exportF = pane.addFolder({ title: "Exportar animación (PNG animado, GIF, secuencia)" });

  const animF = exportF.addFolder({ title: "Un solo archivo que se mueve (PNG animado / GIF)" });
  animF.addInput(gp, "animSeconds", { min: 1, max: 120, step: 0.5, label: "duración (s)" }).on("change", () => actions.syncAnimDuration?.());
  animF.addInput(gp, "animFps", { options: { "12 cuadros/seg": 12, "15 cuadros/seg": 15, "20 cuadros/seg": 20, "24 cuadros/seg": 24, "30 cuadros/seg": 30 }, label: "cuadros/seg" });
  animF.addInput(gp, "animWidth", { min: 160, max: 1920, step: 10, label: "ancho del archivo (px)" });
  animF.addInput(gp, "pngTransparent", { label: "fondo transparente (PNG animado y secuencia)" });
  animF.addInput(gp, "gifTransparent", { label: "GIF: fondo transparente" });
  animF.addInput(gp, "pngIncludeVideo", { label: "incluir el video cargado" });
  animF.addButton({ title: "▶ exportar PNG animado" }).on("click", () => actions.exportApng?.());
  animF.addButton({ title: "▶ exportar GIF" }).on("click", () => actions.exportGif?.());

  exportF.addButton({ title: "⇄ convertir un PNG animado / GIF ya hecho a secuencia…" }).on("click", () => actions.pickConvert?.());

  const pngF = exportF.addFolder({ title: "Secuencia de PNG (carpeta de imágenes, para After)" });
  pngF.addInput(gp, "pngSaveTo", {
    options: { "un ZIP (se descarga solo)": "zip", "una carpeta que elijo (solo Chrome)": "folder" },
    label: "guardar en",
  });
  pngF.addInput(gp, "pngSeconds", { min: 1, max: 120, step: 1, label: "duración (s)" });
  pngF.addInput(gp, "pngFps", { options: { "24 cuadros/seg": 24, "30 cuadros/seg": 30, "60 cuadros/seg": 60 }, label: "cuadros/seg" });
  pngF.addButton({ title: "▶ exportar secuencia de PNG" }).on("click", () => actions.exportPng?.());

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
