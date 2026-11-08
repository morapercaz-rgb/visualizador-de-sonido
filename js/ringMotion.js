// Movimientos del anillo (modo "anillo"). Además de girar, el anillo puede:
//   · cambiar de lugar entre sus círculos (las enfrentadas se cruzan, los vecinos
//     se intercambian, todos se reacomodan al azar…),
//   · deformarse (ola, respiración alternada, elipse, contra-giro),
//   · o viajar entero a otro lugar de la pantalla.
// Es todo cálculo de posiciones: visualEngine.drawRing() le pregunta a esta
// función dónde va cada círculo y lo dibuja ahí.
//
// Los cambios "de lugar" van por pasos: cada params.ringMotionPeriod segundos
// hay un paso; durante la fracción params.ringMotionMove del paso la pieza se
// mueve (con arranque y frenada suaves) y el resto del tiempo queda quieta.

const TAU = Math.PI * 2;

// [texto del panel, valor]
export const RING_MOTIONS = [
  ["ninguno (solo gira)", "none"],
  ["enfrentadas: se cruzan por el centro", "swapCenter"],
  ["enfrentadas: se cruzan por el borde", "swapArc"],
  ["vecinos: se intercambian (uno por afuera, otro por adentro)", "neighbors"],
  ["todos cambian de lugar al azar", "shuffle"],
  ["ola que recorre el anillo", "wave"],
  ["respiración alternada (unos entran, otros salen)", "breathe"],
  ["contra-giro (pares para un lado, impares para el otro)", "counter"],
  ["elipse que respira y gira", "ellipse"],
  ["el anillo viaja de lado a lado", "travelSide"],
  ["el anillo viaja en ocho", "travelEight"],
  ["el anillo salta a otros lugares", "travelJump"],
];

// los que mueven el anillo ENTERO (no cada círculo)
export const RING_TRAVEL = new Set(["travelSide", "travelEight", "travelJump"]);

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
// arranque y frenada suaves
const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

// ---------- permutaciones al azar (siempre las mismas para el mismo paso) ----------

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const permCache = new Map();
// en qué lugar queda cada círculo después del paso k (el paso 0 es el orden original)
function permAt(n, k) {
  if (k <= 0) return null; // identidad
  const key = n + ":" + k;
  let p = permCache.get(key);
  if (p) return p;
  const rand = rng(k * 7919 + n * 104729);
  p = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  if (permCache.size > 200) permCache.clear();
  permCache.set(key, p);
  return p;
}

// ---------- de cuánto se corre el anillo entero ----------

export function ringTravel(time, params, w, h) {
  const mode = params.ringMotion;
  if (!RING_TRAVEL.has(mode)) return null;
  const P = Math.max(0.3, params.ringMotionPeriod ?? 3);
  const amount = clamp01((params.ringMotionAmount ?? 0.6) / 1.5) * 1.5; // hasta 1,5: se pasa un poco del margen
  const t = time / P;
  const th = t * TAU;
  if (mode === "travelSide") return { x: Math.sin(th) * w * 0.3 * amount, y: 0 };
  if (mode === "travelEight") {
    const A = Math.min(w, h * 1.6) * 0.3 * amount;
    return { x: Math.sin(th) * A, y: Math.sin(th * 2) * A * 0.55 };
  }
  // saltos: pasa por una lista de lugares, de a uno por paso
  const spots = [[0, 0], [-1, -0.6], [1, 0.6], [-1, 0.6], [1, -0.6]];
  const k = Math.floor(t);
  const u = t - k;
  const move = Math.min(1, Math.max(0.1, params.ringMotionMove ?? 0.5));
  const p = ease(clamp01(u / move));
  const a = spots[k % spots.length];
  const b = spots[(k + 1) % spots.length];
  return { x: lerp(a[0], b[0], p) * w * 0.3 * amount, y: lerp(a[1], b[1], p) * h * 0.3 * amount };
}

// ---------- dónde va cada círculo ----------
//
// env = { rot, radiusAt(s), cx, cy, size }:
//   rot       cuánto giró el anillo (radianes), de rotationSpeed
//   radiusAt  radio del lugar s (ya con graves y ondulación)
//   cx, cy    centro del anillo
//   size      tamaño de cada círculo (para que los que se cruzan no se pisen)
// Devuelve { x, y, guide }: la posición y, si hay recorrido para mostrar, el
// camino que está haciendo ese círculo.

export function ringPiece(i, n, time, params, env) {
  const mode = params.ringMotion;
  const slotAngle = (s) => (s / n) * TAU + env.rot;
  const slotPos = (s) => {
    const a = slotAngle(s);
    const r = env.radiusAt(s);
    return [env.cx + Math.cos(a) * r, env.cy + Math.sin(a) * r];
  };
  const plain = () => {
    const [x, y] = slotPos(i);
    return { x, y, guide: null };
  };
  if (!mode || mode === "none" || RING_TRAVEL.has(mode) || n < 1) return plain();

  const P = Math.max(0.3, params.ringMotionPeriod ?? 3);
  const amount = Math.max(0, params.ringMotionAmount ?? 0.6);
  const move = Math.min(1, Math.max(0.1, params.ringMotionMove ?? 0.5));
  const stagger = clamp01(params.ringMotionStagger ?? 0.6);
  const t = time / P;
  const k = Math.floor(t);
  const u = t - k;

  // avance (0 a 1) de la pieza j de m dentro del paso: si hay escalonado, no
  // arrancan todas juntas sino una detrás de otra
  const progress = (j, m) => {
    const room = (1 - move) * stagger;
    const start = m > 1 ? (j / (m - 1)) * room : 0;
    return clamp01((u - start) / move);
  };

  const dir = i % 2 === 0 ? 1 : -1;

  switch (mode) {
    case "swapCenter":
    case "swapArc": {
      // la pieza i y la de enfrente se cambian de lugar; en el paso siguiente vuelven
      const half = Math.floor(n / 2);
      let partner = -1;
      let pair = 0;
      if (i < half) { partner = i + half; pair = i; }
      else if (i < 2 * half) { partner = i - half; pair = i - half; }
      if (partner < 0) return plain(); // con cantidad impar, una queda sin pareja
      const from = k % 2 === 0 ? i : partner;
      const to = k % 2 === 0 ? partner : i;
      const p = ease(progress(pair, half));
      const [x0, y0] = slotPos(from);
      const [x1, y1] = slotPos(to);
      if (mode === "swapCenter") {
        return { x: lerp(x0, x1, p), y: lerp(y0, y1, p), guide: { kind: "line", x0, y0, x1, y1, p } };
      }
      // por el borde: cada pareja gira media vuelta; una pareja para un lado y la siguiente para el otro
      const a0 = slotAngle(from);
      let delta = ((((slotAngle(to) - a0) % TAU) + TAU) % TAU);
      const d = pair % 2 === 0 ? 1 : -1;
      if (d < 0) delta -= TAU;
      const r = lerp(env.radiusAt(from), env.radiusAt(to), p);
      const a = a0 + delta * p;
      return {
        x: env.cx + Math.cos(a) * r,
        y: env.cy + Math.sin(a) * r,
        guide: { kind: "arc", cx: env.cx, cy: env.cy, r: env.radiusAt(from), a0, a1: a0 + delta, p },
      };
    }

    case "neighbors": {
      // pares avanzan un lugar para un lado y los impares para el otro; al cruzarse
      // uno pasa por afuera y el otro por adentro
      const p = clamp01(u / move);
      const pe = ease(p);
      const a = slotAngle(i) + dir * (k + pe) * (TAU / n);
      const r = env.radiusAt(i) + dir * Math.sin(Math.PI * p) * env.size * (1.2 + 2.4 * amount);
      return { x: env.cx + Math.cos(a) * r, y: env.cy + Math.sin(a) * r, guide: null };
    }

    case "shuffle": {
      const from = permAt(n, k)?.[i] ?? i;
      const to = permAt(n, k + 1)[i];
      const p = ease(progress(i, n));
      const [x0, y0] = slotPos(from);
      const [x1, y1] = slotPos(to);
      return { x: lerp(x0, x1, p), y: lerp(y0, y1, p), guide: from === to ? null : { kind: "line", x0, y0, x1, y1, p } };
    }

    case "wave": {
      const amp = Math.max(40, params.baseRadius) * 0.5 * amount;
      const a = slotAngle(i);
      const r = env.radiusAt(i) + amp * Math.sin((i / n) * TAU * 3 - t * TAU);
      return { x: env.cx + Math.cos(a) * r, y: env.cy + Math.sin(a) * r, guide: null };
    }

    case "breathe": {
      const a = slotAngle(i);
      const r = env.radiusAt(i) * (1 + dir * 0.6 * Math.min(amount, 1.4) * Math.sin(t * TAU));
      return { x: env.cx + Math.cos(a) * r, y: env.cy + Math.sin(a) * r, guide: null };
    }

    case "counter": {
      // dos anillos que giran al revés uno del otro, a radios apenas distintos
      const a = slotAngle(i) + dir * t * TAU;
      const r = env.radiusAt(i) * (1 + dir * 0.25 * Math.min(amount, 1.2));
      return { x: env.cx + Math.cos(a) * r, y: env.cy + Math.sin(a) * r, guide: null };
    }

    case "ellipse": {
      const s = Math.min(amount, 1.4) * 0.6;
      const ph = t * TAU;
      const a = slotAngle(i);
      const r = env.radiusAt(i);
      const lx = Math.cos(a) * r * (1 + s * Math.cos(ph));
      const ly = Math.sin(a) * r * (1 - s * Math.cos(ph));
      const rot = ph * 0.5;
      const c = Math.cos(rot);
      const sn = Math.sin(rot);
      return { x: env.cx + lx * c - ly * sn, y: env.cy + lx * sn + ly * c, guide: null };
    }
  }
  return plain();
}

// dibuja el camino que está haciendo cada círculo (finito y tenue), para que se
// vea hacia dónde va. Se llama antes de dibujar los círculos.
export function drawRingGuide(ctx, guide, color) {
  if (!guide || guide.p <= 0 || guide.p >= 1) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  if (guide.kind === "line") {
    ctx.moveTo(guide.x0, guide.y0);
    ctx.lineTo(guide.x1, guide.y1);
  } else {
    ctx.arc(guide.cx, guide.cy, guide.r, guide.a0, guide.a1, guide.a1 < guide.a0);
  }
  ctx.stroke();
  ctx.restore();
}
