// Transformación "gradual": en vez de mezclar dos dibujos, cada círculo /
// mancha / aro del conjunto A viaja hasta un lugar del conjunto B y se va
// acomodando, cambiando de tamaño y de color por el camino.
//
// Para poder hacerlo con cualquier modo, no se toca el motor visual: se lo deja
// dibujar normalmente en un lienzo aparte y, mientras dibuja, se anotan todas
// las formas que pinta (un círculo, una mancha deformada, un aro… cada una se
// resume en centro, radio, color y borde). Después se emparejan las formas de A
// con las de B y se dibujan "a mitad de camino".

const TAU = Math.PI * 2;
const MAX_PARTICLES = 700;

// ---------- colores ----------

const colorCtx = document.createElement("canvas").getContext("2d");
const colorCache = new Map();

// cualquier color de CSS → [r, g, b, a]
function parseColor(str) {
  let hit = colorCache.get(str);
  if (hit) return hit;
  colorCtx.fillStyle = "#000";
  colorCtx.fillStyle = str;
  const v = colorCtx.fillStyle; // el navegador lo devuelve como "#rrggbb" o "rgba(r, g, b, a)"
  if (v.startsWith("#")) hit = [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), 1];
  else {
    const n = v.match(/[\d.]+/g).map(Number);
    hit = [n[0], n[1], n[2], n[3] ?? 1];
  }
  if (colorCache.size > 3000) colorCache.clear();
  colorCache.set(str, hit);
  return hit;
}

const NONE = [0, 0, 0, 0];

// ---------- anotar lo que dibuja el motor ----------

// Un lienzo donde el motor dibuja de verdad (para poder mostrarlo tal cual al
// principio y al final de la transformación) y que anota cada forma que pinta.
export class Capture {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.margin = 0; // espacio de sobra alrededor, para que no se corte lo que se salga del lienzo
    this.particles = [];
    this._install();
  }

  // prepara un cuadro nuevo: lienzo limpio, sin formas anotadas
  begin(w, h) {
    const m = Math.round(Math.min(w, h) * 0.25);
    const cw = w + m * 2, ch = h + m * 2;
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    this.margin = m;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.setTransform(1, 0, 0, 1, m, m); // así lo que el motor dibuja en (0,0) cae dentro del margen
    this.particles = [];
  }

  _install() {
    const ctx = this.ctx;
    const P = Object.getPrototypeOf(ctx);
    const self = this;
    const grads = new WeakMap(); // degradado → sus paradas de color
    let path = newPath();

    function newPath() {
      return { pts: [], arcs: [], p: null };
    }
    function pt(x, y) {
      const m = ctx.getTransform();
      return { x: m.a * x + m.c * y + m.e - self.margin, y: m.b * x + m.d * y + m.f - self.margin };
    }

    ctx.beginPath = () => {
      path = newPath();
      P.beginPath.call(ctx);
    };
    ctx.moveTo = (x, y) => {
      path.pts.push(pt(x, y));
      P.moveTo.call(ctx, x, y);
    };
    ctx.lineTo = (x, y) => {
      path.pts.push(pt(x, y));
      P.lineTo.call(ctx, x, y);
    };
    ctx.rect = (x, y, w, h) => {
      path.pts.push(pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h));
      P.rect.call(ctx, x, y, w, h);
    };
    ctx.arc = (x, y, r, a0, a1, ccw) => {
      const m = ctx.getTransform();
      const c = pt(x, y);
      path.arcs.push({ x: c.x, y: c.y, r: r * Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) });
      P.arc.call(ctx, x, y, r, a0, a1, ccw);
    };
    ctx.createRadialGradient = (...a) => {
      const g = P.createRadialGradient.apply(ctx, a);
      const stops = [];
      const add = g.addColorStop.bind(g);
      g.addColorStop = (o, c) => {
        stops.push([o, c]);
        add(o, c);
      };
      grads.set(g, stops);
      return g;
    };

    // el color de relleno o de borde que está puesto ahora → [r,g,b,a] (multiplicado por la opacidad global)
    const paintColors = (style) => {
      const ga = ctx.globalAlpha;
      const mul = (c) => [c[0], c[1], c[2], c[3] * ga];
      if (typeof style === "string") {
        const c = mul(parseColor(style));
        return { inner: c, outer: c };
      }
      const stops = grads.get(style);
      if (!stops?.length) return { inner: NONE, outer: NONE };
      const s = [...stops].sort((a, b) => a[0] - b[0]);
      return { inner: mul(parseColor(s[0][1])), outer: mul(parseColor(s[s.length - 1][1])) };
    };

    // resume el camino que se está pintando en una forma: centro y radio
    const particleFor = () => {
      if (path.p) return path.p;
      const pts = [...path.pts];
      let x, y, r;
      if (path.arcs.length === 1 && !pts.length) {
        ({ x, y, r } = path.arcs[0]);
      } else {
        for (const a of path.arcs) pts.push({ x: a.x, y: a.y });
        if (!pts.length) return null;
        x = pts.reduce((s, q) => s + q.x, 0) / pts.length;
        y = pts.reduce((s, q) => s + q.y, 0) / pts.length;
        r = pts.reduce((s, q) => s + Math.hypot(q.x - x, q.y - y), 0) / pts.length;
        if (path.arcs.length) r += path.arcs.reduce((s, a) => s + a.r, 0) / path.arcs.length;
      }
      path.p = { x, y, r: Math.max(0.5, r), fi: NONE, fo: NONE, st: NONE, lw: 1 };
      self.particles.push(path.p);
      return path.p;
    };

    ctx.fill = (...a) => {
      const p = particleFor();
      if (p) ({ inner: p.fi, outer: p.fo } = paintColors(ctx.fillStyle));
      P.fill.apply(ctx, a);
    };
    ctx.stroke = (...a) => {
      const p = particleFor();
      if (p) {
        p.st = paintColors(ctx.strokeStyle).inner;
        p.lw = ctx.lineWidth * Math.sqrt(Math.abs(ctx.getTransform().a * ctx.getTransform().d));
      }
      P.stroke.apply(ctx, a);
    };
    ctx.fillRect = (x, y, w, h) => {
      path = newPath();
      path.pts.push(pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h));
      const p = particleFor();
      if (p) ({ inner: p.fi, outer: p.fo } = paintColors(ctx.fillStyle));
      P.fillRect.call(ctx, x, y, w, h);
    };
  }
}

// ---------- emparejar y dibujar a mitad de camino ----------

const lerp = (a, b, u) => a + (b - a) * u;
// si uno de los dos colores es invisible, se toma el tono del otro (así no pasa por negro)
function lerpColor(a, b, u) {
  const ca = a[3] > 0.001 ? a : [b[0], b[1], b[2], a[3]];
  const cb = b[3] > 0.001 ? b : [a[0], a[1], a[2], b[3]];
  return [lerp(ca[0], cb[0], u), lerp(ca[1], cb[1], u), lerp(ca[2], cb[2], u), lerp(ca[3], cb[3], u)];
}
const css = (c) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${Math.max(0, Math.min(1, c[3]))})`;

// deja como mucho MAX_PARTICLES formas, repartidas parejo
function thin(list) {
  if (list.length <= MAX_PARTICLES) return list;
  const step = list.length / MAX_PARTICLES;
  return Array.from({ length: MAX_PARTICLES }, (_, i) => list[Math.floor(i * step)]);
}

// ordena las formas dando la vuelta alrededor de su centro: así las de A y
// las de B quedan en un orden parecido y cada una viaja a la que le toca
function sortAround(list) {
  if (!list.length) return list;
  const cx = list.reduce((s, p) => s + p.x, 0) / list.length;
  const cy = list.reduce((s, p) => s + p.y, 0) / list.length;
  return list
    .map((p) => ({ p, k: Math.atan2(p.y - cy, p.x - cx) + Math.hypot(p.x - cx, p.y - cy) * 1e-7 }))
    .sort((a, b) => a.k - b.k)
    .map((o) => o.p);
}

// Dibuja las formas de A transformándose en las de B.
//   u        → avance de 0 (todo A) a 1 (todo B), ya con la curva aplicada
//   stagger  → 0 = todas a la vez, 1 = una tras otra dando la vuelta
//   swirl    → cuánto se curva el camino (0 = recto)
export function drawParticleMorph(ctx, listA, listB, u, { stagger = 0.35, swirl = 0.18 } = {}) {
  const A = sortAround(thin(listA));
  const B = sortAround(thin(listB));
  const n = A.length, m = B.length;
  if (!n && !m) return;
  const K = Math.max(n, m);

  // si una forma de A tiene que repartirse en varias de B (o al revés), cada
  // copia lleva solo una parte de su opacidad: juntas se ven como la original
  const useA = new Array(n).fill(0), useB = new Array(m).fill(0);
  const pairs = [];
  for (let k = 0; k < K; k++) {
    const ia = n ? Math.min(n - 1, Math.floor((k * n) / K)) : -1;
    const ib = m ? Math.min(m - 1, Math.floor((k * m) / K)) : -1;
    if (ia >= 0) useA[ia]++;
    if (ib >= 0) useB[ib]++;
    pairs.push([ia, ib]);
  }

  const clear = (c) => [c[0], c[1], c[2], 0];
  const ghost = (p) => ({ x: p.x, y: p.y, r: 0, fi: clear(p.fi), fo: clear(p.fo), st: clear(p.st), lw: p.lw }); // para lo que no tiene pareja: crece o se achica en su lugar
  const scaleA = (c, k) => [c[0], c[1], c[2], c[3] / k];

  ctx.lineCap = "round";
  for (let k = 0; k < K; k++) {
    const [ia, ib] = pairs[k];
    let a = ia >= 0 ? A[ia] : ghost(B[ib]);
    let b = ib >= 0 ? B[ib] : ghost(A[ia]);
    const ka = ia >= 0 ? useA[ia] : 1, kb = ib >= 0 ? useB[ib] : 1;

    // cada una sale un poquito después que la anterior (stagger)
    const d = K > 1 ? k / (K - 1) : 0;
    const raw = Math.min(1, Math.max(0, (u - d * stagger) / (1 - stagger)));
    const p = raw * raw * (3 - 2 * raw);

    const dx = b.x - a.x, dy = b.y - a.y;
    const bulge = swirl * Math.sin(Math.PI * p); // el camino se curva: sale por un costado y llega por el otro
    const x = lerp(a.x, b.x, p) - dy * bulge;
    const y = lerp(a.y, b.y, p) + dx * bulge;
    const r = lerp(a.r, b.r, p);
    if (r <= 0.05) continue;

    // si una forma rellena crece mucho, el relleno se aclara en la misma medida
    // (no se acumula luz de más): la cantidad de color total se mantiene
    const rref = a.r > 0.05 && b.r > 0.05 ? Math.min(a.r, b.r) : Math.max(a.r, b.r);
    const keep = Math.min(1, (rref * rref) / (r * r));
    const fi = lerpColor(scaleA(a.fi, ka), scaleA(b.fi, kb), p);
    const fo = lerpColor(scaleA(a.fo, ka), scaleA(b.fo, kb), p);
    fi[3] *= keep;
    fo[3] *= keep;
    const st = lerpColor(scaleA(a.st, ka), scaleA(b.st, kb), p);

    if (fi[3] > 0.003 || fo[3] > 0.003) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      if (Math.abs(fi[3] - fo[3]) + Math.abs(fi[0] - fo[0]) + Math.abs(fi[1] - fo[1]) + Math.abs(fi[2] - fo[2]) > 2) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, css(fi));
        g.addColorStop(1, css(fo));
        ctx.fillStyle = g;
      } else ctx.fillStyle = css(fi);
      ctx.fill();
    }
    if (st[3] > 0.003) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.lineWidth = Math.max(0.5, lerp(a.lw, b.lw, p));
      ctx.strokeStyle = css(st);
      ctx.stroke();
    }
  }
}
