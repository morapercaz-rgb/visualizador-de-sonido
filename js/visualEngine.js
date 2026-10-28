// La parte "generativa": dibuja formas que reaccionan al audio. Hay varios
// modos que se eligen desde el panel de control (params.visualMode) — todos
// comparten los mismos parámetros de color y reactividad, así que cambiar de
// modo no rompe lo que ya tenías ajustado. Agregar un modo nuevo es sumar una
// función acá abajo y una línea en el switch de VisualEngine.draw().
//
// Modos "de círculos" (anillo, grilla, espiral) dibujan cada círculo con
// drawDot(), que lo puede hacer sólido, como aura (degradado radial que se
// funde con el fondo) o como aro hueco, según params.dotStyle.

import { hexToHsl, hexToRgb, lerpHue, paletteColorRgb, rgbToHsl, defaultMixColor } from "./colorUtils.js?v=20261028175444";

const TAU = Math.PI * 2;

// modos que giran alrededor de un centro: en estos se puede agarrar la pieza
// entera y moverla (ver centerOffset más abajo)
// (los ecos no están: se mueven con retraso copia por copia, ver drawEchoes)
const MOVABLE_MODES = new Set(["ring", "spikes", "spiral", "vortex"]);

export class VisualEngine {
  constructor() {
    this.time = 0;
    this.handles = [];
    this.k = 1; // cuántos "cuadros de 1/60 s" duró el último cuadro (ver draw)
    // (ver también videoLayer.js: la capa de video hace lo mismo con su propio dt)

    // estado del modo "auras": la lista de burbujas vivas en pantalla, y un
    // promedio suavizado de graves para poder detectar un salto (un golpe).
    this.auras = [];
    this.auraBassSmooth = 0;

    // --- interacción con el mouse ---
    // En cada frame cada modo "anuncia" qué cosas se pueden agarrar (los
    // núcleos del remolino, el centro de la pieza, los círculos libres) en
    // this.targets. main.js le avisa al motor dónde hace click el mouse y el
    // motor decide qué se agarró y lo mueve.
    this.targets = [];
    this.drag = null; // { t: blanco agarrado, gx, gy: dónde dentro del blanco se agarró }
    this.pointer = { x: 0, y: 0 };
    // Todo lo que se mueve tiene posición (x, y) y velocidad (vx, vy): al
    // arrastrar, la posición persigue al mouse con retraso (física suave); al
    // soltar, sigue deslizando con su impulso (ver _glide).
    this.centerOffset = { x: 0, y: 0, vx: 0, vy: 0 }; // cuánto se corrió la pieza entera
    this.coreOffsets = { a: newMover(), b: newMover() }; // cuánto se corrió cada núcleo
    this._off = { x: 0, y: 0 };

    // círculos libres: los suma el usuario, se arrastran, y dejan una estela
    // con degradado que se va borrando
    this.freeCircles = [];

    // luces del modo "aura de colores": cada una es un color que se puede
    // agarrar y mover dentro del aura; los colores se mezclan donde se juntan
    this.lights = [];

    // posición actual de cada copia de los ecos: cada una persigue a la
    // anterior con retraso (ver drawEchoes)
    this.echoChain = [];
    this.echoDir = null; // hacia dónde apunta la fila de ecos ahora (radianes)
    this.echoSpin = 0; // cuánto giró la cola por su cuenta (radianes), ver params.echoSpin
  }

  // dónde está el centro de la pieza ahora (con lo que el usuario la corrió).
  // Lo usa scene.js para que "girar sobre su propio eje" gire alrededor de ESTE punto.
  pieceCenter(w, h, params) {
    if (params.visualMode === "echoes") {
      // en los ecos el "centro" es la copia grande
      const b = echoHeadBase(w, h, params);
      return { x: b.x + this.centerOffset.x, y: b.y + this.centerOffset.y };
    }
    return MOVABLE_MODES.has(params.visualMode)
      ? { x: w / 2 + this.centerOffset.x, y: h / 2 + this.centerOffset.y }
      : { x: w / 2, y: h / 2 };
  }

  draw(ctx, w, h, audioData, params, dt = 0.016) {
    this._size = { w, h };
    if (this._pending) {
      this._applyState(this._pending, w, h);
      this._pending = null;
    }
    // el audio se analiza una sola vez por cuadro para todos los conjuntos;
    // acá se lo ajusta a la cantidad de picos/barras de ESTE conjunto
    audioData = withSpectrumBins(audioData, Math.round(params.spectrumBins));

    // dt = segundos reales desde el cuadro anterior; k = cuántos "cuadros de
    // 1/60 s" son (1 en una pantalla de 60 Hz, 0.5 en una de 120 Hz)
    this.k = dt * 60;
    this.time += dt;
    this.targets = [];
    this.handles = []; // manijas para dibujar en la capa de encima (ver _drawMix)
    FRAME = { audio: audioData, time: this.time };

    // la pieza entera persigue al mouse si la están arrastrando; si no, desliza
    const dc = this.drag?.t.kind === "center" ? this.drag : null;
    this._glide(
      this.centerOffset,
      dc ? { x: dc.startOffset.x + (this.pointer.x - dc.startPointer.x), y: dc.startOffset.y + (this.pointer.y - dc.startPointer.y) } : null,
      !!dc,
      params
    );

    const movable = MOVABLE_MODES.has(params.visualMode);
    this._off = movable ? this.centerOffset : { x: 0, y: 0 };

    ctx.save();
    ctx.globalCompositeOperation = params.shapeBlendMode;
    // "resplandor": un desenfoque parejo sobre todo lo generativo, para que
    // las formas se vean más como luz que como figuras con bordes duros.
    ctx.filter = params.glowAmount > 0 ? `blur(${params.glowAmount * (this.renderScale ?? 1)}px)` : "none"; // (al exportar a más resolución, el desenfoque crece igual)

    // la pieza (sin los círculos libres) se dibuja corrida por centerOffset
    ctx.save();
    ctx.translate(this._off.x, this._off.y);
    switch (params.visualMode) {
      case "grid":
        drawGrid(ctx, w, h, audioData, params, this.time);
        break;
      case "spikes":
        drawSpikes(ctx, w, h, audioData, params, this.time);
        this.addTarget("center", w / 2, h / 2, Math.max(50, Math.min(params.baseRadius, 180)));
        break;
      case "bars":
        drawBars(ctx, w, h, audioData, params);
        break;
      case "spiral":
        drawSpiral(ctx, w, h, audioData, params, this.time);
        this.addTarget("center", w / 2, h / 2, Math.max(50, Math.min(params.baseRadius, 180)));
        break;
      case "vortex":
        drawVortex(ctx, w, h, audioData, params, this.time, this);
        break;
      case "echoes": {
        const main = drawEchoes(ctx, w, h, audioData, params, this.time, this);
        if (main) this.addTarget("center", main.x, main.y, Math.max(40, main.R));
        break;
      }
      case "ambient":
        drawAmbient(ctx, w, h, audioData, params, this.time);
        break;
      case "auras":
        this._drawAuras(ctx, w, h, audioData, params);
        break;
      case "mix":
        this._drawMix(ctx, w, h, audioData, params);
        break;
      case "ring":
      default:
        drawRing(ctx, w, h, audioData, params, this.time);
        this.addTarget("center", w / 2, h / 2, Math.max(50, Math.min(params.baseRadius, 180)));
    }
    ctx.restore();

    // los círculos libres no se corren con la pieza: van por su cuenta. Su
    // cantidad la manda el slider (params.freeCount): se suman o se sacan
    // los que hagan falta.
    const wantFree = Math.round(params.freeCount);
    while (this.freeCircles.length < wantFree) this.addFreeCircle(w, h);
    if (this.freeCircles.length > wantFree) this.freeCircles.length = wantFree;
    this._drawFreeCircles(ctx, w, h, audioData, params);

    ctx.restore();
  }

  // ---------- cosas agarrables ----------

  // anuncia un blanco agarrable. x/y vienen en coordenadas de la pieza (antes
  // de correrla), así que acá se les suma el corrimiento para tenerlas en
  // coordenadas de pantalla, que es donde está el mouse.
  addTarget(kind, x, y, r, extra = {}) {
    const prio = kind === "free" || kind === "light" ? 0 : kind === "core" ? 1 : 2; // lo que está encima gana
    this.targets.push({ kind, x: x + this._off.x, y: y + this._off.y, r, prio, ...extra });
  }

  _hit(x, y) {
    let best = null;
    for (const t of this.targets) {
      const d = Math.hypot(x - t.x, y - t.y);
      if (d > t.r) continue;
      if (!best || t.prio < best.prio || (t.prio === best.prio && d < best.d)) best = { ...t, d };
    }
    return best;
  }

  hover(x, y) {
    return !!this._hit(x, y);
  }

  get isDragging() {
    return !!this.drag;
  }

  // el mouse se apretó en (x, y): devuelve true si agarró algo
  pointerDown(x, y) {
    this.pointer = { x, y };
    const t = this._hit(x, y);
    if (!t) return false;
    this.drag = {
      t,
      gx: x - t.x,
      gy: y - t.y, // dónde dentro del blanco se agarró
      startPointer: { x, y },
      startOffset: { x: this.centerOffset.x, y: this.centerOffset.y },
    };
    // si lo agarran mientras se está deslizando, se frena en seco
    if (t.kind === "free" || t.kind === "light") {
      t.ref.vx = 0;
      t.ref.vy = 0;
    } else if (t.kind === "center") {
      this.centerOffset.vx = 0;
      this.centerOffset.vy = 0;
    } else if (t.kind === "core") {
      this.coreOffsets[t.which].vx = 0;
      this.coreOffsets[t.which].vy = 0;
    }
    return true;
  }

  // el mouse solo avisa dónde está: lo que se agarró lo persigue en cada
  // cuadro (ver _glide), así el movimiento sale suave y no a los saltos
  pointerMove(x, y) {
    this.pointer = { x, y };
  }

  // Física de todo lo que se arrastra. "state" tiene x, y (posición) y vx, vy
  // (velocidad). Si lo están arrastrando (desired = hacia dónde ir), se acerca
  // a ese punto: physFollow 0 = pegado al mouse, cerca de 1 = lo persigue con
  // mucho retraso. Si lo soltaron, sigue con su velocidad y la va perdiendo
  // (physInertia 0 = frena en seco, cerca de 1 = se desliza mucho).
  //
  // Todo está pensado por "cuadro de 1/60 s" y se ajusta con this.k (cuántos
  // cuadros de 1/60 s pasaron realmente), así se mueve igual en una pantalla de
  // 60 Hz que en una de 120 Hz. La velocidad (vx, vy) está en píxeles por 1/60 s.
  _glide(state, desired, dragging, params) {
    const s = this.k;
    if (dragging && desired) {
      const keep = Math.pow(Math.min(0.97, Math.max(0, params.physFollow)), s);
      const nx = state.x + (desired.x - state.x) * (1 - keep);
      const ny = state.y + (desired.y - state.y) * (1 - keep);
      state.vx = (nx - state.x) / s;
      state.vy = (ny - state.y) / s;
      state.x = nx;
      state.y = ny;
    } else {
      const inertia = Math.pow(Math.min(0.995, Math.max(0, params.physInertia)), s);
      state.vx *= inertia;
      state.vy *= inertia;
      if (Math.abs(state.vx) < 0.02) state.vx = 0;
      if (Math.abs(state.vy) < 0.02) state.vy = 0;
      state.x += state.vx * s;
      state.y += state.vy * s;
    }
  }

  pointerUp() {
    this.drag = null;
  }

  // doble click: sobre un círculo libre lo borra; en cualquier otro lado
  // devuelve la pieza y los núcleos a su lugar original
  doubleClick(x, y) {
    const t = this._hit(x, y);
    if (t?.kind === "free") {
      this.freeCircles = this.freeCircles.filter((c) => c !== t.ref);
    } else {
      this.resetPiece();
    }
  }

  resetPiece() {
    this.centerOffset = { x: 0, y: 0, vx: 0, vy: 0 };
    this.coreOffsets = { a: newMover(), b: newMover() };
    this.lights = []; // las luces del aura de colores vuelven a arrancar juntas
    this.echoChain = []; // las copias de los ecos vuelven a ponerse en fila
    this.echoDir = null;
    this.echoSpin = 0;
  }

  // ---------- guardar y recuperar cómo quedó la pieza ----------
  // Además de los parámetros del panel, la pieza tiene "dónde quedó" lo que
  // moviste con el mouse (el centro, los núcleos, los círculos libres, las luces
  // del aura de colores, la fila de ecos). Esto lo resume para poder guardarlo y
  // volver a verlo igual. Todo queda quieto (sin velocidad) y se guarda el tamaño
  // del lienzo, para acomodarlo si después se abre en otro tamaño.
  exportState() {
    const still = (m) => ({ ...m, vx: 0, vy: 0 });
    const { w = 0, h = 0 } = this._size ?? {};
    return {
      w,
      h,
      centerOffset: still(this.centerOffset),
      coreOffsets: { a: still(this.coreOffsets.a), b: still(this.coreOffsets.b) },
      freeCircles: this.freeCircles.map((c) => ({ x: c.x, y: c.y, vx: 0, vy: 0, hueShift: c.hueShift, size: c.size })),
      lights: this.lights.map(still),
      echoChain: this.echoChain.map((c) => ({ x: c.x, y: c.y })),
      echoDir: this.echoDir,
      echoSpin: this.echoSpin,
    };
  }

  // lo deja para aplicarlo en el próximo cuadro (ahí se sabe el tamaño del lienzo)
  importState(st) {
    this._pending = st ?? null;
  }

  _applyState(st, w, h) {
    const sx = st.w ? w / st.w : 1;
    const sy = st.h ? h / st.h : 1;
    const num = (v) => (Number.isFinite(v) ? v : 0);
    const pos = (m) => ({ ...m, x: num(m.x) * sx, y: num(m.y) * sy, vx: 0, vy: 0 });
    if (st.centerOffset) this.centerOffset = pos(st.centerOffset);
    if (st.coreOffsets) this.coreOffsets = { a: pos(st.coreOffsets.a ?? newMover()), b: pos(st.coreOffsets.b ?? newMover()) };
    this.freeCircles = (st.freeCircles ?? []).map((c) => ({ ...pos(c), hueShift: c.hueShift ?? 0, size: c.size ?? 28, trail: [], lastPush: null }));
    this.lights = (st.lights ?? []).map(pos);
    this.echoChain = (st.echoChain ?? []).map((c) => ({ x: num(c.x) * sx, y: num(c.y) * sy }));
    this.echoDir = st.echoDir ?? null;
    this.echoSpin = st.echoSpin ?? 0;
  }

  // dónde tiene que estar el núcleo "a" o "b" (en coordenadas de la pieza).
  // Si se lo está arrastrando, persigue al mouse; si no, se desliza con lo que
  // le quede de impulso. base = dónde estaría sin corrimiento.
  coreOffsetFor(which, base, params) {
    const d = this.drag;
    const grabbed = d && d.t.kind === "core" && d.t.which === which;
    const desired = grabbed
      ? {
          x: this.pointer.x - d.gx - this._off.x - base.x,
          y: this.pointer.y - d.gy - this._off.y - base.y,
        }
      : null;
    this._glide(this.coreOffsets[which], desired, grabbed, params);
    return this.coreOffsets[which];
  }

  // ---------- círculos libres ----------

  addFreeCircle(w, h) {
    const n = this.freeCircles.length;
    this.freeCircles.push({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3,
      y: h / 2 + (Math.random() - 0.5) * h * 0.3,
      vx: 0,
      vy: 0,
      hueShift: n * 45,
      trail: [], // [{ x, y, born }]
      lastPush: null,
      size: 28,
    });
  }

  clearFreeCircles() {
    this.freeCircles = [];
  }

  // mientras se arrastra, va dejando puntos de estela cada pocos píxeles (con
  // un punto por cada evento del mouse quedarían saltos si se mueve rápido)
  _pushTrail(c) {
    if (!c.lastPush) {
      c.lastPush = { x: c.x, y: c.y };
      return;
    }
    const spacing = Math.max(3, c.size * 0.25);
    const last = c.lastPush;
    const dist = Math.hypot(c.x - last.x, c.y - last.y);
    if (dist < spacing) return;
    const steps = Math.floor(dist / spacing);
    for (let s = 1; s <= steps; s++) {
      const f = (s * spacing) / dist;
      c.trail.push({ x: last.x + (c.x - last.x) * f, y: last.y + (c.y - last.y) * f, born: this.time });
    }
    c.lastPush = { x: last.x + ((c.x - last.x) * (steps * spacing)) / dist, y: last.y + ((c.y - last.y) * (steps * spacing)) / dist };
    if (c.trail.length > 1500) c.trail.splice(0, c.trail.length - 1500);
  }

  // aura de colores: UN aura grande hecha de varias luces de distinto color
  // (mixCount, la cantidad que quieras, cada una con su selector de color en el panel). Cada
  // luz se puede agarrar y mover; donde se superponen, los colores se mezclan.
  // Las luces tienen física suave: persiguen al mouse con retraso, siguen
  // deslizando al soltarlas, y una leve atracción (mixPull) las va juntando
  // hacia el centro del grupo para que se sigan mezclando. Cada luz escucha una
  // franja distinta del espectro, así que cada color late a su manera.
  _drawMix(ctx, w, h, audioData, params) {
    const n = Math.max(1, Math.round(params.mixCount));
    while (this.lights.length < n) {
      const i = this.lights.length;
      const a = i * 2.4; // en espiral, para que arranquen cerca y se mezclen
      this.lights.push({
        x: w / 2 + Math.cos(a) * Math.min(50 * (1 + i * 0.18), Math.min(w, h) * 0.3),
        y: h / 2 + Math.sin(a) * Math.min(50 * (1 + i * 0.18), Math.min(w, h) * 0.3),
        vx: 0,
        vy: 0,
        seed: i * 1.7,
      });
    }
    if (this.lights.length > n) this.lights.length = n;

    let gx = 0, gy = 0; // centro del grupo de luces
    for (const l of this.lights) {
      gx += l.x / n;
      gy += l.y / n;
    }

    const spectrum = audioData.spectrum;
    const placed = [];

    ctx.save();
    ctx.globalCompositeOperation = params.mixBlend;
    for (let i = 0; i < n; i++) {
      const l = this.lights[i];
      const grabbed = this.drag?.t.ref === l;
      const speed = params.mixSpeed ?? 0;
      if (speed > 0 && !grabbed) {
        // recorrer la pantalla: cada luz avanza en línea recta a la velocidad
        // elegida y rebota al chocar con las paredes. Si la soltás después de
        // agarrarla, sigue para el lado en que la tiraste.
        if (l.hx === undefined) {
          const a = i * 2.4 + 1; // cada una sale para un lado distinto
          l.hx = Math.cos(a);
          l.hy = Math.sin(a);
        }
        if (l.held) {
          l.held = false;
          const sp = Math.hypot(l.vx, l.vy);
          if (sp > 0.5) {
            l.hx = l.vx / sp;
            l.hy = l.vy / sp;
          }
        }
        const dt = this.k / 60;
        const v = speed * (0.85 + 0.3 * ((i * 0.618) % 1)); // un poco distinta cada una
        l.x += l.hx * v * dt;
        l.y += l.hy * v * dt;
        l.vx = 0;
        l.vy = 0;
        // la pared está donde llega el cuerpo del aura, no el centro
        const size = params.mixSize * (params.mixSizeMul ?? 1) * (this.groupBlob ?? 1);
        const mx = Math.min(size * 0.5, w * 0.3); // (con auras enormes, que igual recorran la pantalla)
        const my = Math.min(size * 0.5, h * 0.3);
        if (l.x < mx) { l.x = mx; l.hx = Math.abs(l.hx); }
        else if (l.x > w - mx) { l.x = w - mx; l.hx = -Math.abs(l.hx); }
        if (l.y < my) { l.y = my; l.hy = Math.abs(l.hy); }
        else if (l.y > h - my) { l.y = h - my; l.hy = -Math.abs(l.hy); }
      } else {
        if (grabbed) l.held = true;
        this._glide(l, grabbed ? { x: this.pointer.x - this.drag.gx, y: this.pointer.y - this.drag.gy } : null, grabbed, params);
        if (!grabbed && n > 1) {
          l.vx += (gx - l.x) * params.mixPull * 0.01 * this.k;
          l.vy += (gy - l.y) * params.mixPull * 0.01 * this.k;
        }
      }
      l.x = Math.min(w, Math.max(0, l.x));
      l.y = Math.min(h, Math.max(0, l.y));

      const band = spectrum[Math.min(spectrum.length - 1, Math.floor((i / n) * spectrum.length * 0.7))] ?? 0;
      const R =
        params.mixSize *
        (params.mixSizeMul ?? 1) *
        (this.groupBlob ?? 1) * // (si está en el grupo: el tamaño de manchas que se eligió para todo el grupo)
        (0.8 + 0.4 * ((i * 0.618) % 1)) *
        (1 + audioData.bass * params.bassReactivity * 0.35 + band * params.overallReactivity * 0.6);
      // flotar: un vaivén lento y propio de cada luz, que no cambia dónde "está"
      const px = l.x + Math.sin(this.time * 0.5 + l.seed) * params.mixDrift * R * 0.18;
      const py = l.y + Math.cos(this.time * 0.4 + l.seed * 1.3) * params.mixDrift * R * 0.18;

      const rgb = hexToRgb(params["mixColor" + (i + 1)] ?? defaultMixColor(i)); // (más de 8 luces: los colores que no elegiste se generan)
      lightGradient(ctx, px, py, R, rgb, params.mixOpacity, params);
      placed.push({ l, px, py, R, rgb });
    }
    ctx.restore();

    // las "manijas": un puntito con aro en el centro de cada luz, para ver dónde
    // agarrarla. NO se dibujan acá: se anotan en this.handles y scene.js las
    // dibuja en una capa aparte encima del canvas, así se ven en pantalla pero
    // nunca entran en lo que se graba ni se exporta.
    for (const { l, px, py, R, rgb } of placed) {
      this.targets.push({ kind: "light", ref: l, x: px, y: py, r: Math.max(30, R * 0.22), prio: 0 });
      if (!params.mixHandles) continue;
      this.handles.push({
        x: px,
        y: py,
        grabbed: this.drag?.t.ref === l,
        color: `rgb(${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)})`,
      });
    }
  }

  // dibuja la estela (de más vieja a más nueva) y la cabeza de cada círculo.
  // La estela va de colorA (recién dejada) a colorB (a punto de borrarse),
  // y se achica y se hace transparente con la edad.
  _drawFreeCircles(ctx, w, h, audioData, params) {
    const life = Math.max(0.2, params.trailLife);
    const hueA = hexToHsl(params.colorA).h;
    const hueB = hexToHsl(params.colorB).h;

    for (const [ci, c] of this.freeCircles.entries()) {
      const col = freeColors(params, c, ci, this.time, hueA, hueB);
      const size = params.freeCircleSize * (1 + audioData.bass * params.bassReactivity * 0.5);
      c.size = size;

      // física: persigue al mouse si lo agarraron; si no, desliza, cae con la
      // gravedad y rebota contra los bordes de la pantalla
      const grabbed = this.drag?.t.ref === c;
      this._glide(c, grabbed ? { x: this.pointer.x - this.drag.gx, y: this.pointer.y - this.drag.gy } : null, grabbed, params);
      // la gravedad y los rebotes contra los bordes solo existen si se los pidió
      // (gravedad o inercia mayores que 0); si no, el círculo queda donde lo soltaste
      if (!grabbed && (params.physGravity > 0 || params.physInertia > 0)) {
        c.vy += params.physGravity * 0.35 * this.k;
        const bounce = params.physBounce;
        if (c.x < size) { c.x = size; c.vx = Math.abs(c.vx) * bounce; }
        if (c.x > w - size) { c.x = w - size; c.vx = -Math.abs(c.vx) * bounce; }
        if (c.y < size) { c.y = size; c.vy = Math.abs(c.vy) * bounce; }
        if (c.y > h - size) { c.y = h - size; c.vy = -Math.abs(c.vy) * bounce; if (Math.abs(c.vy) < 1.2) c.vy = 0; }
      }
      // la estela se va dejando según por dónde va el círculo (no el mouse),
      // así también sale al deslizar
      this._pushTrail(c);

      while (c.trail.length && this.time - c.trail[0].born > life) c.trail.shift();

      const style = styleOf(params, "freeStyle");
      const op = params.shapeOpacity * params.freeOpacity;

      for (const p of c.trail) {
        const a = (this.time - p.born) / life;
        const alpha = Math.pow(1 - a, 1.4) * op;
        const tt = Math.min(1, a);
        const r = size * (1 - a * 0.55) * 1.6;
        ctx.beginPath();
        if (style === "outline") {
          // estela de aros: cada punto de la estela es un aro que se achica y se apaga
          ctx.arc(p.x, p.y, r * 0.6, 0, TAU);
          ctx.lineWidth = params.outlineWidth;
          ctx.strokeStyle = col.trail(tt, alpha * 0.8);
          ctx.stroke();
          continue;
        }
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, col.trail(tt, alpha * 0.4));
        g.addColorStop(1, col.trail(tt, 0));
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.fillStyle = g;
        ctx.fill();
        if (style === "both") {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 0.6, 0, TAU);
          ctx.lineWidth = params.outlineWidth;
          ctx.strokeStyle = col.trail(tt, alpha * 0.8);
          ctx.stroke();
        }
      }

      // la cabeza: círculo con centro claro. Siempre lleva un aro finito para
      // que se vea que se puede agarrar (más marcado y del color del círculo
      // si el estilo es contorno o ambos).
      warpedPath(ctx, c.x, c.y, size, params, c.hueShift * 0.1, params.deformFree);
      if (style !== "outline") {
        paintFreeHead(ctx, c, size, col, params, op, this.time);
        warpedPath(ctx, c.x, c.y, size, params, c.hueShift * 0.1, params.deformFree); // (las texturas dibujan su propio trazo: se vuelve al círculo para el aro)
      }
      if (style === "fill") {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = `rgba(255,255,255,${grabbed ? 0.9 : 0.4})`;
      } else {
        ctx.lineWidth = Math.max(params.outlineWidth, 1.5);
        ctx.strokeStyle = grabbed ? "rgba(255,255,255,0.95)" : col.light(Math.max(op, 0.5));
      }
      ctx.stroke();

      this.targets.push({ kind: "free", ref: c, x: c.x, y: c.y, r: size * 1.25, prio: 0 });
    }
  }

  // gotas/auras: burbujas de luz que nacen solas con los golpes de graves
  // (el mismo truco de "detectar un salto" que usa el flash de video) y se
  // van agrandando y desvaneciendo de a poco, como ondas en el agua.
  _drawAuras(ctx, w, h, audioData, params) {
    const jump = audioData.bass - this.auraBassSmooth;
    this.auraBassSmooth += (audioData.bass - this.auraBassSmooth) * (1 - Math.pow(0.85, this.k));

    const maxAuras = Math.round(params.auraMax);
    if (jump > 0.12 && this.auras.length < maxAuras) {
      this.auras.push({
        x: w * (0.15 + Math.random() * 0.7),
        y: h * (0.15 + Math.random() * 0.7),
        r: 4,
        alpha: 1,
        hue: hueForIndex(this.auras.length, Math.max(1, maxAuras), audioData, params),
      });
    }
    // si bajaron el máximo con el slider, las que sobran se van de a una
    if (this.auras.length > maxAuras) this.auras.length = maxAuras;

    const growSpeed = (1 + audioData.overall * params.overallReactivity * 3) * (params.shapeSize / 8);

    for (let i = this.auras.length - 1; i >= 0; i--) {
      const a = this.auras[i];
      a.r += growSpeed * this.k;
      a.alpha -= 0.006 * this.k;
      if (a.alpha <= 0) {
        this.auras.splice(i, 1);
        continue;
      }

      const op = a.alpha * params.shapeOpacity * params.auraOpacity;
      const style = styleOf(params, "auraStyle");
      const seed = a.x * 0.013 + a.y * 0.017; // cada gota ondula distinto

      // relleno: halo difuso (se deforma como un todo)
      if (style !== "outline") softAura(ctx, a.x, a.y, a.r, a.hue, op, params, seed, params.deformAuras);

      // contorno: un aro que se expande, como una onda en el agua
      if (style === "outline" || style === "both") {
        warpedPath(ctx, a.x, a.y, a.r, params, seed, params.deformAuras);
        ctx.lineWidth = params.outlineWidth;
        ctx.strokeStyle = colorStr(a.hue, params, op);
        ctx.stroke();
      }
    }
  }
}

// junta los colores de la paleta que estén activados (hasta 6, ver
// controls.js). Si no hay ninguno prendido usa el color 1 igual, para no
// quedarse sin nada que dibujar.
function activePalette(params) {
  const slots = [
    [params.paletteEnabled1, params.paletteColor1],
    [params.paletteEnabled2, params.paletteColor2],
    [params.paletteEnabled3, params.paletteColor3],
    [params.paletteEnabled4, params.paletteColor4],
    [params.paletteEnabled5, params.paletteColor5],
    [params.paletteEnabled6, params.paletteColor6],
  ];
  const colors = slots.filter(([on]) => on).map(([, c]) => c);
  return colors.length ? colors : [params.paletteColor1];
}

// resuelve qué matiz (hue) le toca a la forma "i" de un total de "total",
// según el modo de color elegido en el panel:
// - "gradient": interpola entre colorA y colorB según la posición de la forma
// - "reactive": usa colorA pero el tono general se corre con los agudos
// - "frequency": recorre la paleta según el "centro de brillo" del audio
//   (grave → un extremo de la paleta, agudo → el otro)
// - "fixed": usa colorA fijo, con un arcoíris opcional (hueSpread) alrededor
function hueForIndex(i, total, audioData, params) {
  const hueA = hexToHsl(params.colorA).h;

  if (params.colorMode === "gradient") {
    const hueB = hexToHsl(params.colorB).h;
    const t = total > 1 ? i / (total - 1) : 0;
    return lerpHue(hueA, hueB, t);
  }

  if (params.colorMode === "frequency") {
    const rgb = paletteColorRgb(activePalette(params), audioData.centroid ?? 0);
    const base = rgbToHsl(rgb).h;
    return (base + i * ((360 / total) * params.hueSpread)) % 360;
  }

  const base = params.colorMode === "reactive"
    ? (hueA + audioData.treble * 180) % 360
    : hueA;

  return (base + i * ((360 / total) * params.hueSpread)) % 360;
}

// arma un color "hsla(...)" con la saturación y luminosidad del panel.
// lightAdd permite aclarar u oscurecer ese color puntual (sin tocar el slider).
function colorStr(hue, params, alpha, lightAdd = 0) {
  const h = ((hue % 360) + 360) % 360;
  const l = Math.min(100, Math.max(0, params.lightness + lightAdd));
  return `hsla(${h}, ${params.saturation}%, ${l}%, ${alpha})`;
}

function fillFor(hue, params) {
  return colorStr(hue, params, params.shapeOpacity);
}

// ---------- estilo de cada cosa: relleno / contorno / ambos ----------
//
// Cada tipo de elemento (círculos, aros del remolino, ecos, manchas, barras,
// gotas, círculos libres) tiene su propio estilo y su propia opacidad en el
// panel. params.allStyle, si no está en "cada uno", pisa todos los estilos a
// la vez (para pasar toda la pieza a contornos, por ejemplo).
//   "fill" = relleno · "outline" = solo contorno · "both" = los dos
//   (los círculos además pueden ser "aura": degradado radial difuso)

function styleOf(params, key) {
  return params.allStyle && params.allStyle !== "each" ? params.allStyle : params[key];
}

// rellena y/o traza el camino que ya esté armado en ctx, según el estilo
function paint(ctx, style, fillPaint, strokePaint, lineWidth) {
  if (style !== "outline") {
    ctx.fillStyle = fillPaint;
    ctx.fill();
  }
  if (style === "outline" || style === "both") {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = strokePaint;
    ctx.stroke();
  }
}

// devuelve el mismo audioData pero con el espectro repartido en "n" franjas
// (promediando las franjas originales que caen en cada una)
function withSpectrumBins(audioData, n) {
  const src = audioData.spectrum;
  if (!n || n === src.length) return audioData;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * src.length) / n);
    const b = Math.max(a + 1, Math.floor(((i + 1) * src.length) / n));
    let sum = 0;
    for (let j = a; j < b; j++) sum += src[j];
    out[i] = sum / (b - a);
  }
  return { ...audioData, spectrum: out };
}

// algo que se puede mover con física: posición y velocidad
function newMover() {
  return { x: 0, y: 0, vx: 0, vy: 0 };
}

// alcance del aura (params.auraReach): 1 = como siempre; más de 1 = el halo
// llega más lejos y su borde es más lleno, así dos auras cercanas se funden a
// mayor distancia. Devuelve el radio ya ajustado y cuánto "levantar" la caída.
function reachOf(params, R) {
  const reach = Math.max(0.1, params.auraReach ?? 1);
  return { R: R * reach, lift: reach > 1 ? 1 / (1 + 0.45 * (reach - 1)) : 1 };
}

// una luz de color del "aura de colores": un degradado radial con el color
// exacto elegido (sin pasar por los sliders de saturación/luminosidad), de
// caída bien suave así al superponerse con otras los colores se funden.
function lightGradient(ctx, px, py, R0, rgb, alpha, params) {
  const { R, lift } = reachOf(params, R0);
  const d = deformState(params, params.deformMix);
  const c = `${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)}`;
  ctx.save();
  ctx.translate(px, py);
  if (d) {
    ctx.rotate(d.ang);
    ctx.scale(d.sx, d.sy);
  }
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  for (const [stop, k] of [[0, 1], [0.25, 0.75], [0.5, 0.4], [0.75, 0.12], [1, 0]]) {
    g.addColorStop(stop, `rgba(${c},${alpha * Math.pow(k, lift)})`);
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ---------- deformación ----------
//
// Las cosas redondas (círculos, gotas, aros, copias, manchas, círculos libres)
// se pueden deformar desde la carpeta "Deformar" del panel:
//   estirar + ángulo → las vuelve elipses (el área se mantiene parecida)
//   ondulación → el borde se vuelve irregular, como una mancha orgánica
//   (y puede crecer con el volumen del audio)
// Cada tipo de cosa tiene su check para decidir si se deforma o no.

// el motor le avisa a estas funciones en qué cuadro está (audio y reloj)
let FRAME = { audio: null, time: 0 };

// resuelve la deformación actual, o null si no hay nada que deformar
function deformState(params, enabled) {
  if (!enabled) return null;
  const s = Math.max(0.2, params.deformStretch);
  const wob = Math.min(0.9, params.deformWobble + params.deformWobbleAudio * (FRAME.audio?.overall ?? 0) * params.overallReactivity);
  if (Math.abs(s - 1) < 0.01 && wob < 0.005) return null;
  // deformSpin: cada elemento gira sobre SU PROPIO eje (el estiramiento rota
  // con el tiempo). Solo se nota si el elemento no es perfectamente redondo.
  const ang = ((params.deformAngle + params.deformSpin * FRAME.time) * Math.PI) / 180;
  return { sx: Math.sqrt(s), sy: 1 / Math.sqrt(s), cos: Math.cos(ang), sin: Math.sin(ang), ang, wob, speed: params.deformSpeed };
}

// arma el camino de un círculo (deformado si corresponde) para después
// rellenarlo o trazarlo. "seed" hace que cada círculo ondule distinto.
function warpedPath(ctx, x, y, r, params, seed, enabled) {
  const d = deformState(params, enabled);
  ctx.beginPath();
  if (!d) {
    ctx.arc(x, y, r, 0, TAU);
    return;
  }
  const steps = 48;
  for (let s = 0; s <= steps; s++) {
    const a = (s / steps) * TAU;
    let k = 1;
    if (d.wob > 0) {
      for (let harm = 2; harm <= 5; harm++) {
        k += (d.wob / harm) * Math.sin(harm * a + seed * (1.3 + harm * 0.7) + FRAME.time * d.speed * (0.5 + harm * 0.3));
      }
    }
    const rr = r * Math.max(0.2, k);
    const lx = Math.cos(a) * rr * d.sx;
    const ly = Math.sin(a) * rr * d.sy;
    const px = x + lx * d.cos - ly * d.sin;
    const py = y + lx * d.sin + ly * d.cos;
    if (s === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// halo difuso (degradado radial que se funde con el fondo). Si hay deformación
// se estira/rota con una transformación; si además hay ondulación, se arma
// con varias luces chicas que se corren de a poco (así el borde sigue siendo
// blando en vez de quedar con un corte duro).
function softAura(ctx, x, y, R0, hue, alpha, params, seed, enabled) {
  const { R, lift } = reachOf(params, R0);
  const d = deformState(params, enabled);
  const grad = (rr, al) => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
    if (lift === 1) {
      g.addColorStop(0, colorStr(hue, params, al));
      g.addColorStop(1, colorStr(hue + params.edgeHueShift, params, 0));
    } else {
      for (let i = 0; i <= 6; i++) {
        const p = i / 6;
        g.addColorStop(p, colorStr(hue + params.edgeHueShift * p, params, al * Math.pow(1 - p, lift)));
      }
    }
    return g;
  };
  ctx.save();
  ctx.translate(x, y);
  if (d) {
    ctx.rotate(d.ang);
    ctx.scale(d.sx, d.sy);
  }
  if (!d || d.wob < 0.02) {
    ctx.fillStyle = grad(R, alpha);
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fill();
  } else {
    const n = 5;
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * TAU + seed * 2 + FRAME.time * d.speed * (0.6 + 0.2 * k);
      const off = R * 0.45 * d.wob * (0.6 + 0.4 * Math.sin(FRAME.time * d.speed * 1.3 + k * 2.1 + seed));
      const rr = R * (0.7 + 0.15 * Math.sin(k * 1.7 + seed));
      ctx.save();
      ctx.translate(Math.cos(ang) * off, Math.sin(ang) * off);
      ctx.fillStyle = grad(rr, alpha * 0.6);
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

// ---------- círculos libres: colores y texturas ----------

const FREE_TEXTURES = new Set(["smooth", "flat", "aura", "glass", "gradient", "stripes", "dots", "rings", "grain"]);

const cssRgba = (c, a) => `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${Math.max(0, Math.min(1, a))})`;
const mixRgb = (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });

// los colores de UN círculo libre según el modo elegido:
//   same    → como el resto (el matiz del color A / B del panel + un corrimiento por círculo)
//   own     → colores propios: A para la cabeza, B para el final de la estela
//   each    → un color distinto por círculo (de la lista de 6)
//   rainbow → arcoíris que va girando con el tiempo
// devuelve funciones que arman el color con la opacidad que se pida
function freeColors(params, c, index, time, hueA, hueB) {
  const mode = params.freeColorMode ?? "same";
  if (mode === "own" || mode === "each") {
    const head = hexToRgb(mode === "own" ? params.freeColorA : params["freeColor" + ((index % 6) + 1)] ?? "#ff6bd6");
    const tail = mode === "own" ? hexToRgb(params.freeColorB) : mix2(head);
    return {
      head: (a) => cssRgba(head, a),
      light: (a) => cssRgba(mixRgb(head, { r: 255, g: 255, b: 255 }, 0.55), a),
      sec: (a) => cssRgba(mode === "own" ? tail : mixRgb(head, { r: 0, g: 0, b: 0 }, 0.45), a),
      trail: (t, a) => cssRgba(mixRgb(head, tail, t), a),
    };
  }
  const baseHue = mode === "rainbow" ? time * 40 + index * 70 : hueA + c.hueShift;
  const otherHue = mode === "rainbow" ? baseHue + 150 : hueB + c.hueShift;
  return {
    head: (a) => colorStr(baseHue, params, a),
    light: (a) => colorStr(baseHue, params, a, 22),
    sec: (a) => colorStr(otherHue, params, a),
    trail: (t, a) => colorStr(mode === "rainbow" ? baseHue + t * 150 : lerpHue(hueA, hueB, t) + c.hueShift, params, a),
  };
}
// (para "un color por círculo", la estela se apaga hacia el mismo color más claro)
function mix2(rgb) {
  return mixRgb(rgb, { r: 255, g: 255, b: 255 }, 0.35);
}

// dibuja la CABEZA de un círculo libre con la textura elegida (ya sobre su trazo: círculo
// que puede estar deformado). Todo el patrón queda recortado adentro del círculo.
function paintFreeHead(ctx, c, size, col, params, op, time) {
  const tex = FREE_TEXTURES.has(params.freeTexture) ? params.freeTexture : "smooth";
  const sc = Math.max(0.2, params.freeTextureScale ?? 1);
  const st = Math.max(0, Math.min(1, params.freeTextureStrength ?? 0.7));
  const spin = c.hueShift * 0.05 + time * 0.4; // el patrón gira despacio, distinto en cada círculo
  const x = c.x, y = c.y;

  if (tex === "smooth") {
    const g = ctx.createRadialGradient(x, y, 0, x, y, size);
    g.addColorStop(0, col.light(op));
    g.addColorStop(1, col.head(op * 0.55));
    ctx.fillStyle = g;
    ctx.fill();
    return;
  }
  if (tex === "flat") {
    ctx.fillStyle = col.head(op);
    ctx.fill();
    return;
  }
  if (tex === "aura") {
    const g = ctx.createRadialGradient(x, y, 0, x, y, size);
    g.addColorStop(0, col.head(op));
    g.addColorStop(0.55, col.head(op * 0.6));
    g.addColorStop(1, col.head(0));
    ctx.fillStyle = g;
    ctx.fill();
    return;
  }
  if (tex === "gradient") {
    const dx = Math.cos(spin) * size, dy = Math.sin(spin) * size;
    const g = ctx.createLinearGradient(x - dx, y - dy, x + dx, y + dy);
    g.addColorStop(0, col.head(op));
    g.addColorStop(1, col.sec(op));
    ctx.fillStyle = g;
    ctx.fill();
    return;
  }
  if (tex === "glass") {
    const g = ctx.createRadialGradient(x - size * 0.35, y - size * 0.4, size * 0.05, x, y, size);
    g.addColorStop(0, `rgba(255,255,255,${op * (0.35 + 0.5 * st)})`);
    g.addColorStop(0.35, col.light(op * 0.9));
    g.addColorStop(0.85, col.head(op * 0.8));
    g.addColorStop(1, col.sec(op));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(x - size * 0.3, y - size * 0.42, size * 0.38, size * 0.2, -0.6, 0, TAU);
    ctx.fillStyle = `rgba(255,255,255,${op * 0.55 * st})`;
    ctx.fill();
    ctx.restore();
    return;
  }

  // los de patrón: base de color + el patrón en el segundo color, recortado al círculo
  ctx.fillStyle = col.head(op);
  ctx.fill();
  ctx.save();
  ctx.clip();
  const sa = op * (0.25 + 0.75 * st);
  if (tex === "stripes") {
    const gap = Math.max(3, size * 0.32 * sc);
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.strokeStyle = col.sec(sa);
    ctx.lineWidth = gap * 0.5;
    for (let d = -size * 1.5; d <= size * 1.5; d += gap) {
      ctx.beginPath();
      ctx.moveTo(d, -size * 1.5);
      ctx.lineTo(d, size * 1.5);
      ctx.stroke();
    }
  } else if (tex === "dots") {
    const gap = Math.max(4, size * 0.4 * sc);
    const r = gap * 0.28;
    ctx.translate(x, y);
    ctx.rotate(spin * 0.5);
    ctx.fillStyle = col.sec(sa);
    let row = 0;
    for (let yy = -size * 1.4; yy <= size * 1.4; yy += gap * 0.87, row++) {
      for (let xx = -size * 1.4 + (row % 2 ? gap / 2 : 0); xx <= size * 1.4; xx += gap) {
        ctx.beginPath();
        ctx.arc(xx, yy, r, 0, TAU);
        ctx.fill();
      }
    }
  } else if (tex === "rings") {
    const gap = Math.max(3, size * 0.3 * sc);
    ctx.strokeStyle = col.sec(sa);
    ctx.lineWidth = gap * 0.45;
    const phase = (time * 8) % gap;
    for (let rr = phase; rr < size * 1.5; rr += gap) {
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, TAU);
      ctx.stroke();
    }
  } else if (tex === "grain") {
    // granulado: puntitos al azar que cambian unas pocas veces por segundo (como cine)
    const frame = Math.floor(time * 12);
    let seed = (frame * 9301 + Math.round(c.hueShift) * 49297 + 233280) % 233280;
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const n = Math.round(90 * sc * sc * (size / 28));
    for (let i = 0; i < n; i++) {
      const ang = rand() * TAU, rad = Math.sqrt(rand()) * size;
      ctx.fillStyle = rand() < 0.5 ? col.sec(sa * (0.5 + rand() * 0.5)) : `rgba(255,255,255,${sa * 0.5 * rand()})`;
      ctx.fillRect(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad, 1.5 * sc, 1.5 * sc);
    }
  }
  ctx.restore();
}

// dibuja UN círculo según el estilo de params.dotStyle:
// - "fill": lleno (si hay "degradado de tono", va del centro al borde)
// - "outline": solo el aro, hueco por dentro
// - "both": lleno y con aro
// - "aura": degradado radial que se funde con el fondo, como una luz difusa
// "seed" distingue a un círculo de otro para que no ondulen todos igual.
function drawDot(ctx, x, y, r, hue, params, alpha = 1, seed = 0) {
  const radius = Math.max(r, 0);
  if (radius <= 0) return;
  const a = params.shapeOpacity * params.dotOpacity * alpha;
  const shift = params.edgeHueShift;
  const style = styleOf(params, "dotStyle");

  if (style === "aura") {
    softAura(ctx, x, y, radius * 2.5, hue, a * 0.6, params, seed, params.deformDots);
    return;
  }

  let fillPaint = colorStr(hue, params, a);
  if (shift > 0) {
    fillPaint = ctx.createRadialGradient(x, y, 0, x, y, radius);
    fillPaint.addColorStop(0, colorStr(hue, params, a));
    fillPaint.addColorStop(1, colorStr(hue + shift, params, a));
  }
  warpedPath(ctx, x, y, radius, params, seed, params.deformDots);
  paint(ctx, style, fillPaint, colorStr(hue, params, a), params.outlineWidth);
}

// modo original: círculos distribuidos en un anillo, que se infla con los
// graves y ondula con los medios.
function drawRing(ctx, w, h, audioData, params, time) {
  const cx = w / 2, cy = h / 2;
  const count = params.dotCount;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU + time * params.rotationSpeed;
    const radiusBase = params.baseRadius + audioData.bass * params.bassReactivity * 300;
    const wobble = Math.sin(time * 2 + i) * params.midReactivity * audioData.mid * 50;
    const r = radiusBase + wobble;

    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    const size = params.shapeSize * (1 + audioData.overall * params.overallReactivity);

    drawDot(ctx, x, y, size, hueForIndex(i, count, audioData, params), params, 1, i);
  }
}

// grilla de círculos que laten con una ola (seno por posición) modulada por
// los medios, más el pulso general de graves/overall.
function drawGrid(ctx, w, h, audioData, params, time) {
  const cols = Math.max(2, Math.round(Math.sqrt(params.dotCount * (w / h))));
  const rows = Math.max(2, Math.round(params.dotCount / cols));
  const cellW = w / cols;
  const cellH = h / rows;
  const total = cols * rows;
  let i = 0;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cx = cellW * (x + 0.5);
      const cy = cellH * (y + 0.5);
      const wave = Math.sin(time * 2 + x * 0.5 + y * 0.5) * 0.5 + 0.5;
      const size =
        params.shapeSize *
        (0.4 + wave * params.midReactivity * audioData.mid + audioData.overall * params.overallReactivity);

      drawDot(ctx, cx, cy, size, hueForIndex(i, total, audioData, params), params, 1, i);
      i++;
    }
  }
}

// picos radiales tipo ecualizador circular: una línea por franja de
// frecuencia, saliendo del centro hacia afuera.
function drawSpikes(ctx, w, h, audioData, params, time) {
  const cx = w / 2, cy = h / 2;
  const spectrum = audioData.spectrum;
  const n = spectrum.length;
  const innerR = params.baseRadius * 0.5;

  ctx.lineWidth = Math.max(params.shapeSize * 0.3, 1);

  for (let i = 0; i < n; i++) {
    const angle = (i / n) * TAU + time * params.rotationSpeed;
    const len = innerR * 0.3 + spectrum[i] * params.overallReactivity * 300;

    const x1 = cx + Math.cos(angle) * innerR;
    const y1 = cy + Math.sin(angle) * innerR;
    const x2 = cx + Math.cos(angle) * (innerR + len);
    const y2 = cy + Math.sin(angle) * (innerR + len);

    const hue = hueForIndex(i, n, audioData, params);
    ctx.strokeStyle = colorStr(hue, params, params.shapeOpacity * params.spikeOpacity);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

// ecualizador clásico: barras verticales desde abajo, una por franja de
// frecuencia del espectro.
function drawBars(ctx, w, h, audioData, params) {
  const spectrum = audioData.spectrum;
  const n = spectrum.length;
  const barW = w / n;
  // foco de la reacción: lo que más suena (los graves, que en el espectro están
  // a la izquierda) se pone en el foco, y los agudos se reparten hacia los dos
  // lados; además las barras lejanas al foco reaccionan menos.
  // barFocusAmount = 0: todo queda como siempre (graves a la izquierda, parejo).
  const amount = params.barFocusAmount ?? 0;
  const focus = params.barFocusX ?? 0.5;
  const spread = Math.max(0.02, params.barFocusWidth ?? 0.25);
  const far = Math.max(focus, 1 - focus, 0.001); // distancia al borde más lejano

  // dirección del degradado de color: "side" = de costado a costado (cada barra
  // tiene su color, como siempre); "up" / "down" = el color cambia con la altura
  // DENTRO de cada barra (de su base a su punta, o de su punta a su base): todas
  // las barras muestran el degradado completo, sean altas o bajas
  const dir = params.barGradient ?? "side";
  const vertical = dir === "up" || dir === "down";
  // qué tanto hay de cada color a lo alto de la barra:
  //   barBalance: a qué altura (0 = base, 1 = punta) se pasa del color de abajo al de arriba
  //   barSoftness: qué tan gradual es ese pasaje (1 = todo el largo, 0 = corte seco)
  const stops = []; // [posición 0..1 a lo largo del degradado, color]
  if (vertical) {
    const a = params.shapeOpacity * params.barOpacity;
    const bal = Math.min(1, Math.max(0, params.barBalance ?? 0.5));
    const soft = Math.min(1, Math.max(0, params.barSoftness ?? 1));
    const width = 0.02 + 0.98 * soft;
    // u = cuánto del "color de arriba" hay en la posición t (0 = todo el de abajo, 1 = todo el de arriba)
    const mix = (t) => {
      const u = Math.min(1, Math.max(0, (t - bal) / width + 0.5));
      return u + (u * u * (3 - 2 * u) - u) * (1 - soft); // con poca suavidad el cambio es más redondeado
    };
    const ts = new Set([0, 1]);
    for (let k = 1; k < 24; k++) ts.add(k / 24);
    ts.add(Math.min(1, Math.max(0, bal - width / 2)));
    ts.add(Math.min(1, Math.max(0, bal + width / 2)));
    for (const t of [...ts].sort((x, y) => x - y)) {
      stops.push([t, colorStr(hueForIndex(mix(t) * (n - 1), n, audioData, params), params, a)]);
    }
  }

  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / n;
    const idx = Math.min(n - 1, Math.round((Math.abs(x - focus) / far) * (n - 1)));
    const level = (1 - amount) * spectrum[i] + amount * spectrum[idx];
    const dist = (x - focus) / spread;
    const weight = 1 - amount + amount * Math.exp(-0.5 * dist * dist);
    const barH = level * h * 0.6 * params.overallReactivity * weight + params.shapeSize;
    let col;
    if (vertical) {
      // de la base (y = h) a la punta (y = h - barH), o al revés
      col = ctx.createLinearGradient(0, dir === "up" ? h : h - barH, 0, dir === "up" ? h - barH : h);
      for (const [t, c] of stops) col.addColorStop(t, c);
    } else {
      col = colorStr(hueForIndex(i, n, audioData, params), params, params.shapeOpacity * params.barOpacity);
    }
    ctx.beginPath();
    ctx.rect(i * barW, h - barH, barW * 0.8, barH);
    paint(ctx, styleOf(params, "barStyle"), col, col, params.outlineWidth);
  }
}

// partículas dispuestas en espiral: cada una a mayor radio y ángulo que la
// anterior, escalando con los graves.
function drawSpiral(ctx, w, h, audioData, params, time) {
  const cx = w / 2, cy = h / 2;
  const count = params.dotCount;

  for (let i = 0; i < count; i++) {
    const t = i / count;
    const angle = t * Math.PI * 8 + time * params.rotationSpeed;
    const radius = t * (params.baseRadius + audioData.bass * params.bassReactivity * 300);

    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    const size = params.shapeSize * (0.3 + t) * (1 + audioData.overall * params.overallReactivity);

    drawDot(ctx, x, y, size, hueForIndex(i, count, audioData, params), params, 1, i);
  }
}

// remolino de círculos: muchos aros finitos cuyo centro se va corriendo de a
// poco entre dos puntos, y cuyo tamaño crece y vuelve a achicarse. Superpuestos
// dibujan una figura tipo "ocho" con dos lóbulos, y en cada lóbulo queda un
// núcleo de luz. Los graves separan los dos extremos; los medios los hacen
// serpentear.
// vortexRings = cantidad de aros · baseRadius = separación · rotación = giro
// Los dos núcleos (A y B) son puntos propios: el usuario puede agarrar uno con
// el mouse y llevarlo a otro lado (engine.coreOffsetFor), y toda la figura
// se reacomoda siguiéndolo, porque el recorrido de los centros de los aros
// va de un núcleo al otro.
function drawVortex(ctx, w, h, audioData, params, time, engine) {
  const cx = w / 2, cy = h / 2;
  const count = Math.max(2, Math.round(params.vortexRings));
  const theta = time * params.rotationSpeed;
  const dist = params.baseRadius * 0.9 + audioData.bass * params.bassReactivity * 140;
  const ux = Math.cos(theta), uy = Math.sin(theta);
  const maxR = Math.min(w, h) * 0.32 * (1 + audioData.overall * params.overallReactivity * 0.5);

  // dónde estarían los núcleos sin tocarlos, y dónde están con lo que el
  // usuario los corrió
  const baseA = { x: cx + ux * dist * 0.5, y: cy + uy * dist * 0.5 };
  const baseB = { x: cx - ux * dist * 0.5, y: cy - uy * dist * 0.5 };
  const offA = engine.coreOffsetFor("a", baseA, params);
  const offB = engine.coreOffsetFor("b", baseB, params);
  const A = { x: baseA.x + offA.x, y: baseA.y + offA.y };
  const B = { x: baseB.x + offB.x, y: baseB.y + offB.y };

  // el recorrido de los centros pasa por A cuando t = 0.25 y por B cuando
  // t = 0.75 (y sigue en línea recta hacia afuera de cada lado)
  const sepX = B.x - A.x, sepY = B.y - A.y;
  const sep = Math.max(1, Math.hypot(sepX, sepY));
  const nx = -sepY / sep, ny = sepX / sep; // perpendicular al recorrido

  const ringStyle = styleOf(params, "vortexStyle");
  const ringAlpha = params.shapeOpacity * params.vortexOpacity;
  // con tantos aros superpuestos, el relleno se dibuja bien tenue para que no se queme a blanco
  const fillAlpha = ringAlpha * 0.06;

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const along = (t - 0.25) / 0.5;
    // curva en "S" fija (retuerce el recorrido de los centros, de ahí el ocho
    // torcido) más un serpenteo extra que suman los medios
    const swirl = Math.sin(t * TAU + time * 0.5) * (sep * 0.45 + audioData.mid * params.midReactivity * 30);
    const px = A.x + sepX * along + nx * swirl;
    const py = A.y + sepY * along + ny * swirl;
    const r = maxR * (0.15 + 0.85 * Math.sin(Math.PI * t));

    const hue = hueForIndex(i, count, audioData, params);
    warpedPath(ctx, px, py, r, params, i * 0.37, params.deformVortex);
    paint(
      ctx,
      ringStyle,
      colorStr(hue, params, fillAlpha),
      colorStr(hue, params, ringAlpha * 0.7),
      Math.max(0.5, params.outlineWidth * 0.5)
    );
  }

  // los núcleos de luz, uno en cada lóbulo (coreCount: 0, 1 o 2)
  const coreR = maxR * 0.55 * (0.4 + audioData.overall * params.overallReactivity);
  const coreList = [["a", 0.25, A], ["b", 0.75, B]].slice(0, Math.round(params.coreCount));
  for (const [which, side, p] of coreList) {
    const hue = hueForIndex(Math.round(side * (count - 1)), count, audioData, params);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, coreR);
    g.addColorStop(0, colorStr(hue, params, params.shapeOpacity * params.coreGlow, 40));
    g.addColorStop(1, colorStr(hue + params.edgeHueShift, params, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, coreR, 0, TAU);
    ctx.fill();

    engine.addTarget("core", p.x, p.y, Math.max(coreR * 0.7, 30), { which });
  }

  // agarrar la figura por cualquier otro lado la mueve entera
  engine.addTarget("center", (A.x + B.x) / 2, (A.y + B.y) / 2, maxR * 0.6);
}

// contorno de una mancha "blanda": un círculo cuyo radio ondula según varios
// armónicos (2 a 6 lóbulos). Cada armónico se carga con una franja distinta
// del espectro, así la forma cambia con cómo suena la música.
function blobPath(ctx, x, y, R, spectrum, time, wobble, phase) {
  const steps = 72;
  ctx.beginPath();
  for (let s = 0; s <= steps; s++) {
    const a = (s / steps) * TAU;
    let k = 1;
    for (let harm = 2; harm <= 6; harm++) {
      const band = spectrum[(harm * 7 + 3) % spectrum.length] ?? 0;
      const amp = (0.12 + band * 0.5) * wobble;
      k += (amp / harm) * Math.sin(harm * a + phase * harm + time * (0.6 + harm * 0.25));
    }
    const rr = R * Math.max(0.25, k);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (s === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// dónde está la copia grande de los ecos cuando nadie la movió: un poco al
// costado del centro de la pantalla (del lado contrario al ángulo fijo), para
// que la pieza entera quede más o menos centrada. No depende del audio ni de
// hacia dónde apunte la cola.
function echoHeadBase(w, h, params) {
  const a = (params.echoAngle * Math.PI) / 180;
  const d = Math.min(w, h) * 0.9 * 0.7 * 0.4;
  return { x: w / 2 - Math.cos(a) * d, y: h / 2 - Math.sin(a) * d };
}

// ecos de aura: una forma grande con degradado que se repite hacia un lado,
// cada copia más chica y más tenue, como la estela de una luz que se mueve.
// La forma puede ser mancha blanda, medio círculo o círculo (params.echoShape).
// echoCount = cuántas copias · echoAngle = hacia dónde se abren · baseRadius = tamaño
//
// Movimiento fluido: cada copia no se queda clavada en su lugar de la fila,
// sino que PERSIGUE a la copia de adelante con retraso (echoLag). Cuando mueven
// la copia principal, o cuando cambia la dirección o el largo de la fila, las
// demás llegan una después de otra, como una cola que se arrastra, en vez de
// moverse todas juntas y duras. Con echoLag en 0 vuelven a moverse rígidas.
function drawEchoes(ctx, w, h, audioData, params, time, engine) {
  // LA COPIA GRANDE ESTÁ ANCLADA: queda siempre en el mismo punto (más lo que
  // la hayas arrastrado), sin importar hacia dónde apunte la cola. Si gira la
  // cola, gira ALREDEDOR de la copia grande; la copia grande no se corre. Así
  // el punto que agarrás con el mouse es siempre el centro del movimiento.
  const base = echoHeadBase(w, h, params);
  const hx = base.x + engine.centerOffset.x;
  const hy = base.y + engine.centerOffset.y;
  const n = Math.max(2, Math.round(params.echoCount));
  const baseR = params.baseRadius * 0.5 + 20 + audioData.bass * params.bassReactivity * 90;

  // giro propio de la cola (°/seg): por defecto 0, o sea que no gira sola
  const spinStep = (params.echoSpin * Math.PI * 0.016 * engine.k) / 180;
  engine.echoSpin += spinStep;
  const baseAngle = (params.echoAngle * Math.PI) / 180 + engine.echoSpin;

  // Hacia dónde apunta la fila de ecos. Con "cola detrás del movimiento" la
  // cola se acomoda DETRÁS de la dirección en que movés la copia grande (como
  // la cola de un cometa) y se queda ahí cuando frenás; solo vuelve al ángulo
  // fijo si "volver al ángulo fijo" es mayor que 0. Sin esa opción, la fila
  // apunta siempre al ángulo fijo. Solo reacciona a movimientos claros (no a
  // temblores chicos del mouse) y gira de a poco, para que no se sacuda.
  if (!params.echoFollowMove || engine.echoDir === null) engine.echoDir = baseAngle;
  if (params.echoFollowMove) {
    const vx = engine.centerOffset.vx, vy = engine.centerOffset.vy;
    const moving = Math.hypot(vx, vy) > 1;
    const target = moving ? Math.atan2(-vy, -vx) : params.echoReturn > 0 ? baseAngle : null;
    if (target !== null) {
      let d = target - engine.echoDir;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      const rate = moving ? params.echoTurn : params.echoReturn * 0.1;
      engine.echoDir += d * (1 - Math.pow(1 - Math.min(0.95, rate), engine.k));
    }
    engine.echoDir += spinStep;
  }
  const angle = engine.echoDir;
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const reach = Math.min(w, h) * 0.9 * (0.7 + audioData.mid * params.midReactivity * 0.5);

  // dónde le tocaría a cada copia si todas se movieran juntas (la fila rígida,
  // saliendo de la copia grande hacia donde apunte la cola)
  const ideal = [];
  for (let k = 0; k < n; k++) {
    const dist = reach * Math.pow(k / n, 1.15);
    ideal.push({ x: hx + ux * dist, y: hy + uy * dist });
  }

  // la cadena: la principal va directo a su lugar; cada una de las otras
  // apunta a "donde está la anterior + la separación de la fila" y se acerca
  // de a poco (follow chico = mucho retraso)
  const chain = engine.echoChain;
  while (chain.length < n) chain.push({ x: ideal[chain.length].x, y: ideal[chain.length].y });
  chain.length = n;
  const follow = 1 - Math.pow(Math.min(0.95, Math.max(0, params.echoLag)), engine.k);
  chain[0].x = ideal[0].x;
  chain[0].y = ideal[0].y;
  for (let k = 1; k < n; k++) {
    const tx = chain[k - 1].x + (ideal[k].x - ideal[k - 1].x);
    const ty = chain[k - 1].y + (ideal[k].y - ideal[k - 1].y);
    chain[k].x += (tx - chain[k].x) * follow;
    chain[k].y += (ty - chain[k].y) * follow;
  }

  let main = null; // la copia principal (la grande): es la que se puede agarrar

  // se dibujan de la más lejana a la más cercana, para que la grande quede arriba
  for (let k = n - 1; k >= 0; k--) {
    const f = k / n; // 0 = la principal, cerca de 1 = la última
    const scale = Math.pow(1 - f, 0.85);
    const R = baseR * scale;
    if (R < 2) continue;

    const x = chain[k].x;
    const y = chain[k].y;
    if (k === 0) main = { x, y, R };
    const alpha = Math.pow(1 - f, 0.7);
    const hue = hueForIndex(k, n, audioData, params);

    // degradado interno: centro claro y de otro tono, borde del tono base
    const op = params.shapeOpacity * params.echoOpacity * alpha;
    const g = ctx.createRadialGradient(x - ux * R * 0.25, y - uy * R * 0.25, 0, x, y, R * 1.15);
    g.addColorStop(0, colorStr(hue + params.edgeHueShift, params, op, 15));
    g.addColorStop(0.65, colorStr(hue, params, op));
    g.addColorStop(1, colorStr(hue - params.edgeHueShift * 0.6, params, op * 0.85, -8));

    if (params.echoShape === "half") {
      ctx.beginPath();
      ctx.arc(x, y, R, angle - Math.PI / 2, angle + Math.PI / 2);
      ctx.closePath();
    } else if (params.echoShape === "circle") {
      warpedPath(ctx, x, y, R, params, k * 0.9, params.deformEchoes);
    } else {
      blobPath(ctx, x, y, R, audioData.spectrum, time, 1 - f * 0.8, k * 0.4);
    }
    paint(ctx, styleOf(params, "echoStyle"), g, colorStr(hue, params, op), params.outlineWidth);
  }
  return main;
}

// aura envolvente: manchas enormes y blandas repartidas a lo ancho de la
// pantalla, como una luz que lo cubre todo. De izquierda a derecha, cada una
// escucha una franja del espectro (graves a la izquierda, agudos a la
// derecha) y se infla cuando esa franja suena fuerte.
// blobCount = cantidad de manchas
function drawAmbient(ctx, w, h, audioData, params, time) {
  const n = Math.max(2, Math.round(params.blobCount));
  const spectrum = audioData.spectrum;

  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0.5;
    const band = spectrum[Math.min(spectrum.length - 1, Math.floor(t * spectrum.length * 0.7))] ?? 0;
    const v = Math.min(1, band * params.overallReactivity);

    const x = w * (0.08 + t * 0.84) + Math.sin(time * 0.4 + i * 1.7) * w * 0.04;
    const y = h * 0.5 + Math.sin(time * 0.3 + i * 2.1) * h * 0.12;
    const reach = Math.max(0.1, params.auraReach ?? 1);
    const rx = ((w / n) * (0.9 + v * 1.6) + params.baseRadius * 0.5) * reach;
    const ry = h * (0.22 + v * 0.3) * reach;

    const hue = hueForIndex(i, n, audioData, params);
    ctx.save();
    ctx.translate(x, y);
    // deformación: la mancha se estira y rota antes de aplastarse en elipse
    const dst = deformState(params, params.deformBlobs);
    if (dst) {
      ctx.rotate(dst.ang);
      ctx.scale(dst.sx, dst.sy);
    }
    ctx.scale(1, ry / rx);
    const op = params.shapeOpacity * params.blobOpacity;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, colorStr(hue, params, op * (0.22 + v * 0.3), 5));
    g.addColorStop(0.5, colorStr(hue + params.edgeHueShift * 0.5, params, op * 0.14));
    g.addColorStop(1, colorStr(hue + params.edgeHueShift, params, 0));
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, TAU);
    // el contorno de una mancha es el borde de su elipse; se dibuja más
    // marcado que el relleno (que es muy tenue) para que se note
    paint(ctx, styleOf(params, "blobStyle"), g, colorStr(hue, params, Math.min(1, op * (0.5 + v * 0.5))), params.outlineWidth);
    ctx.restore();
  }
}
