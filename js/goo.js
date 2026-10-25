// Efecto "goo" / melaza entre conjuntos.
//
// Cuando dos conjuntos se acercan:
//  - se ATRAEN: cada uno se corre hacia el otro, con inercia (como si fueran
//    pegajosos), y
//  - aparece un PUENTE de goo que los une, que va engrosando de a poco.
// Cuando se separan, el puente se estira y se afina (como melaza) hasta que se
// corta, y los conjuntos vuelven despacio a su lugar.
//
// Todo es gradual: nada aparece ni desaparece de golpe.

import { hexToRgb } from "./colorUtils.js?v=20261025172438";

export const GOO_DEFAULTS = {
  on: false,
  reach: 160, // hasta qué distancia (px, desde el borde) empiezan a atraerse
  pull: 0.8, // cuánto se acercan entre sí (0 = no se mueven, 1 = mucho)
  viscosity: 0.6, // 0 = se corta enseguida, 1 = melaza: se estira muchísimo antes de cortarse
  neck: 0.55, // grosor del puente (cuando están pegados)
  core: 0.6, // cuánto brilla el centro del puente (blanco)
  colorMode: "conjuntos", // "conjuntos" = el color de cada uno; "uno" = un solo color
  color: "#ffee33",
};

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, u) => a + (b - a) * u;

// el color "principal" de un conjunto: el primero de su paleta que esté prendido
function leadColor(params) {
  for (let i = 1; i <= 6; i++) if (params[`paletteEnabled${i}`]) return params[`paletteColor${i}`];
  return params.paletteColor1;
}

export class GooSystem {
  constructor() {
    this.off = new Map(); // id de conjunto → { x, y, vx, vy }: cuánto se corrió por la atracción
    this.pairs = new Map(); // "id-id" → { conn, l }: estado del puente entre dos conjuntos
  }

  reset() {
    this.off.clear();
    this.pairs.clear();
  }

  offsetOf(c) {
    return this.off.get(c.id) ?? ZERO;
  }

  // items: [{ c, n: {x, y}, r }] → el centro "natural" de cada conjunto (donde lo
  // puso el usuario, sin la atracción) y su radio de contacto.
  // Devuelve los puentes para dibujar.
  step(items, o, dt) {
    // 1) hacia dónde quiere ir cada conjunto por atracción
    const target = new Map(items.map((it) => [it.c.id, { x: 0, y: 0 }]));
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const dx = b.n.x - a.n.x, dy = b.n.y - a.n.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        const D0 = a.r + b.r; // distancia a la que se tocan
        const w = smooth(1 - clamp((d - D0) / Math.max(1, o.reach))); // 0 lejos, 1 tocándose
        const m = o.pull * w * Math.max(0, d - D0 * 0.92) * 0.5; // se acercan hasta casi tocarse, no se encajan
        const ta = target.get(a.c.id), tb = target.get(b.c.id);
        ta.x += (dx / d) * m;
        ta.y += (dy / d) * m;
        tb.x -= (dx / d) * m;
        tb.y -= (dy / d) * m;
      }
    }

    // 2) se mueven hacia ahí con un resorte amortiguado: viscosidad alta = más lento y "pesado"
    const omega = lerp(16, 3.5, clamp(o.viscosity));
    const steps = Math.max(1, Math.ceil(dt / 0.01));
    const h = dt / steps;
    const ids = new Set([...this.off.keys(), ...target.keys()]);
    for (const id of ids) {
      const s = this.off.get(id) ?? { x: 0, y: 0, vx: 0, vy: 0 };
      const t = target.get(id) ?? ZERO;
      for (let k = 0; k < steps; k++) {
        s.vx += (omega * omega * (t.x - s.x) - 2 * omega * s.vx) * h;
        s.vy += (omega * omega * (t.y - s.y) - 2 * omega * s.vy) * h;
        s.x += s.vx * h;
        s.y += s.vy * h;
      }
      if (!target.has(id) && Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.vx) + Math.abs(s.vy) < 0.05) this.off.delete(id);
      else this.off.set(id, s);
    }

    // 3) puentes: según la distancia real (ya con la atracción)
    const bridges = [];
    const alive = new Set();
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const oa = this.off.get(a.c.id) ?? ZERO, ob = this.off.get(b.c.id) ?? ZERO;
        const pa = { x: a.n.x + oa.x, y: a.n.y + oa.y }, pb = { x: b.n.x + ob.x, y: b.n.y + ob.y };
        const d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        const D0 = a.r + b.r;
        const formDist = D0 + o.reach * 0.55; // se forma al acercarse a esto…
        const breakDist = D0 + o.reach * (0.55 + 1.1 * clamp(o.viscosity)); // …y se corta recién bastante más lejos (histéresis)
        const key = `${a.c.id}-${b.c.id}`;
        const st = this.pairs.get(key) ?? { conn: false, l: 0 };
        if (d <= formDist) st.conn = true;
        else if (d >= breakDist) st.conn = false;
        st.l += ((st.conn ? 1 : 0) - st.l) * (1 - Math.exp(-dt * (st.conn ? 5 : 8))); // aparece y desaparece de a poco
        if (st.l < 0.005 && !st.conn) {
          this.pairs.delete(key);
          continue;
        }
        this.pairs.set(key, st);
        alive.add(key);
        const stretch = clamp((d - D0) / Math.max(1, breakDist - D0));
        const mode = o.colorMode === "uno";
        bridges.push({
          pa,
          pb,
          ra: a.r,
          rb: b.r,
          l: st.l,
          stretch,
          ca: hexToRgb(mode ? o.color : leadColor(a.c.params)),
          cb: hexToRgb(mode ? o.color : leadColor(b.c.params)),
        });
      }
    }
    for (const k of this.pairs.keys()) if (!alive.has(k)) this.pairs.delete(k);
    return bridges;
  }
}

const ZERO = { x: 0, y: 0 };

// ---------- dibujo del puente ----------

const rgba = (c, a, white = 0) =>
  `rgba(${Math.round(lerp(c.r, 255, white))},${Math.round(lerp(c.g, 255, white))},${Math.round(lerp(c.b, 255, white))},${a})`;

// Un puente en forma de reloj de arena: ancho donde se pega a cada conjunto y
// finito en el medio (más finito cuanto más estirado). Las puntas se
// redondean y se desvanecen hacia adentro de cada conjunto.
export function drawBridge(ctx, br, o, time) {
  const { pa, pb, ra, rb, l, stretch } = br;
  const dx = pb.x - pa.x, dy = pb.y - pa.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-3) return;
  const ux = dx / d, uy = dy / d, nx = -uy, ny = ux;

  // cuando ya se tocan (o se superponen) el puente es una unión corta: no tiene que tapar a los conjuntos
  const touching = clamp(1 - (d - 0.9 * (ra + rb)) / (0.5 * (ra + rb)), 0, 1);
  const thick = l * Math.pow(1 - stretch, 1.15) * (1 - 0.55 * touching); // 1 = pegados, 0 = a punto de cortarse
  if (thick < 0.004) return;

  const small = Math.min(ra, rb);
  const L = Math.max(6, d - 0.95 * (ra + rb)); // largo del tramo entre los dos bordes
  const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
  const ax = mx - ux * (L / 2), ay = my - uy * (L / 2); // dónde se pega a A
  const wob = 1 + 0.07 * stretch * Math.sin(time * 9 + d * 0.05); // tiembla un poco cuando está estirado
  const hm = Math.max(0.7, small * o.neck * thick * wob); // medio ancho en el medio
  const fa = ra * (0.3 + 0.45 * thick) * Math.min(1, 0.4 + l); // medio ancho pegado a A
  const fb = rb * (0.3 + 0.45 * thick) * Math.min(1, 0.4 + l);

  const P = (x, y, k = 1) => [ax + ux * x + nx * y * k, ay + uy * x + ny * y * k];
  const path = (k) => {
    ctx.beginPath();
    ctx.moveTo(...P(0, fa, k));
    ctx.bezierCurveTo(...P(L * 0.38, hm, k), ...P(L * 0.62, hm, k), ...P(L, fb, k));
    ctx.bezierCurveTo(...P(L + fb * 0.9, fb, k), ...P(L + fb * 0.9, -fb, k), ...P(L, -fb, k));
    ctx.bezierCurveTo(...P(L * 0.62, -hm, k), ...P(L * 0.38, -hm, k), ...P(0, -fa, k));
    ctx.bezierCurveTo(...P(-fa * 0.9, -fa, k), ...P(-fa * 0.9, fa, k), ...P(0, fa, k));
    ctx.closePath();
  };

  // degradé a lo largo: color de A → color de B, y las puntas se desvanecen
  const x0 = ax - ux * fa * 0.9, y0 = ay - uy * fa * 0.9;
  const x1 = ax + ux * (L + fb * 0.9), y1 = ay + uy * (L + fb * 0.9);
  const total = L + (fa + fb) * 0.9;
  const capA = clamp((fa * 0.9) / total, 0, 0.45), capB = clamp((fb * 0.9) / total, 0, 0.45);
  const grad = (white, alpha) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, rgba(br.ca, 0, white));
    g.addColorStop(capA + 0.001, rgba(br.ca, alpha, white));
    g.addColorStop(1 - capB - 0.001, rgba(br.cb, alpha, white));
    g.addColorStop(1, rgba(br.cb, 0, white));
    return g;
  };

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  // cuerpo con color + un halo suave
  ctx.shadowColor = rgba(br.ca, 0.55 * thick);
  ctx.shadowBlur = 14 * thick;
  path(1);
  ctx.fillStyle = grad(0, 0.95);
  ctx.fill();
  // centro claro, más fino (como en la referencia: blanco por dentro y color en el borde)
  if (o.core > 0.01) {
    ctx.shadowBlur = 0;
    path(0.62);
    ctx.fillStyle = grad(0.85, 0.9 * clamp(o.core));
    ctx.fill();
  }
  ctx.restore();
}
