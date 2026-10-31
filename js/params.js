// Valores iniciales de TODOS los parámetros (los de cada conjunto y los globales).
// Vive en su propio archivo para que la página del exportador pueda usarlo
// sin cargar el panel de controles.

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

    // si este conjunto entra en el grupo que se agranda junto (carpeta "Agrandar varios conjuntos a la vez")
    inGroup: false,

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
    mixSizeMul: 1, // multiplicador del tamaño del aura: para hacerla mucho más grande (1 = normal)
    mixOpacity: 0.9,
    mixBlend: "source-over", // cómo se mezclan los colores: source-over | screen | lighter
    mixPull: 0, // atracción hacia el centro del grupo (0 = cada luz se queda donde la soltás)
    mixDrift: 0.4, // flotar solas
    mixSpeed: 120, // velocidad (px/seg) con la que recorren la pantalla y rebotan en las paredes (0 = quietas)
    mixSoftWalls: true, // flotar sin chocar: giran de a poco antes de llegar a los costados, en vez de rebotar
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
    // colores y texturas de los círculos libres
    freeColorMode: "same", // same (como el resto) | own (colores propios) | each (uno distinto por círculo) | rainbow
    freeColorA: "#ff6bd6", // color propio de la cabeza
    freeColorB: "#33aaff", // color propio del final de la estela
    freeColor1: "#ff3b6b",
    freeColor2: "#ffb02e",
    freeColor3: "#3de0ff",
    freeColor4: "#8a5bff",
    freeColor5: "#3dff9a",
    freeColor6: "#ff6bd6",
    freeTexture: "smooth", // smooth | flat | aura | glass | gradient | stripes | dots | rings | grain
    freeTextureScale: 1, // tamaño del dibujo de la textura
    freeTextureStrength: 0.7, // cuánto se nota la textura
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
    previewScale: "auto", // vista previa: "auto" (se adapta sola) o qué fracción de los píxeles se dibuja en pantalla mientras trabajás (1 = completa)
    showFps: false, // mostrar el contador de cuadros por segundo

    // grabación
    recFormat: "png", // png (sin fondo, una imagen por cuadro) | mp4 (lo lee After Effects) | webm9 | webm8
    recFps: 30,
    recScale: 1, // resolución al grabar en vivo: 1 = completa; menos = más liviano para la compu (las imágenes salen más chicas)
    recBitrate: 12, // megabits por segundo

    // dónde se guardan las secuencias de PNG: "zip" (se descarga solo, sin permisos) o "folder" (una carpeta que elegís; solo Chrome)
    pngSaveTo: "zip", // zip = se descarga solo al terminar (grabar arranca al instante) | zipfile = un archivo que elegís antes de empezar | folder = una carpeta

    // exportar animación de un solo archivo (PNG animado o GIF)
    animSeconds: 10,
    animFps: 20,
    animWidth: 640, // ancho del archivo (se achica desde el lienzo, si no pesaría muchísimo)
    gifTransparent: false, // el GIF tiene transparencia de todo o nada: se ve mejor con fondo

    // exportar secuencia de PNG (cuadro a cuadro, sin perder calidad)
    pngSeconds: 10,
    pngScale: 1, // resolución de la secuencia de PNG: 1 = el tamaño del lienzo; 2, 3 o 4 = más píxeles (más calidad)
    pngFps: 30,
    pngTransparent: true, // fondo transparente (sin color de fondo)
    pngAutoMorph: false, // al grabar PNG, arrancar sola la transformación de un conjunto a otro (ida y vuelta) y cortar al terminar; apagado: se graba lo que ves
    pngDrawFull: false, // grabar PNG en vivo con un lienzo enorme: false = se dibuja a la mitad y se agranda al guardar (4 veces más rápido, mismo tamaño de archivo); true = se dibuja a tamaño completo (más lento)
    pngIncludeVideo: false, // con fondo transparente: ¿incluir también el video cargado?
  };
}
