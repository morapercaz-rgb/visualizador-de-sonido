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
    this.k = 1;
    this.margin = 0; // espacio de sobra alrededor, para que no se corte lo que se salga del lienzo
    this.particles = [];
    this._install();
  }

  // prepara un cuadro nuevo: lienzo limpio, sin formas anotadas
  begin(w, h, k = 1) {
    // k = cuántas veces más resolución que el tamaño lógico (al exportar a más calidad)
    this.k = k;
    const m = Math.round(Math.min(w, h) * 0.25);
    const cw = Math.round((w + m * 2) * k), ch = Math.round((h + m * 2) * k);
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    this.margin = m;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.setTransform(k, 0, 0, k, m * k, m * k); // así lo que el motor dibuja en (0,0) cae dentro del margen
    this.particles = [];
  }

  _install() {
    const ctx = this.ctx;
    const P = Object.getPrototypeOf(ctx);
    const self = this;
    const grads = new WeakMap(); // degradado → sus paradas de color
    let path = newPath();

    function newPath() {
      return { pts: [], arcs: [], p: null, poly: false }; // poly: la forma tiene lados rectos (un rectángulo, un polígono)
    }
    function pt(x, y) {
      const m = ctx.getTransform();
      return { x: (m.a * x + m.c * y + m.e) / self.k - self.margin, y: (m.b * x + m.d * y + m.f) / self.k - self.margin };
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
      path.poly = true;
      path.pts.push(pt(x, y));
      P.lineTo.call(ctx, x, y);
    };
    ctx.rect = (x, y, w, h) => {
      path.poly = true;
      path.pts.push(pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h));
      P.rect.call(ctx, x, y, w, h);
    };
    ctx.arc = (x, y, r, a0, a1, ccw) => {
      const m = ctx.getTransform();
      const c = pt(x, y);
      path.arcs.push({ x: c.x, y: c.y, r: (r * Math.sqrt(Math.abs(m.a * m.d - m.b * m.c))) / self.k });
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
      const inner = mul(parseColor(s[0][1])), outer = mul(parseColor(s[s.length - 1][1]));
      // cómo cae la opacidad hacia el borde (el exponente de 1 - radio): se mide a mitad de radio, así se respeta la caída real del aura
      let curve = 1.5;
      if (inner[3] > 0.01 && s.length >= 2) {
        let a50 = null;
        for (let i = 0; i + 1 < s.length; i++) {
          if (s[i][0] <= 0.5 && s[i + 1][0] >= 0.5) {
            const q = s[i + 1][0] > s[i][0] ? (0.5 - s[i][0]) / (s[i + 1][0] - s[i][0]) : 0;
            a50 = lerp(mul(parseColor(s[i][1]))[3], mul(parseColor(s[i + 1][1]))[3], q);
          }
        }
        if (a50 !== null && a50 > 0.002) curve = Math.min(3, Math.max(0.4, Math.log(a50 / inner[3]) / Math.log(0.5)));
      }
      return { inner, outer, curve };
    };

    // resume el camino que se está pintando en una forma: centro y radio
    const particleFor = () => {
      if (path.p) return path.p;
      const pts = [...path.pts];
      let x, y, r;
      let circle = path.arcs.length > 0 && !path.poly; // (redonda de verdad, no un rectángulo o polígono aproximado con un círculo)
      if (path.arcs.length === 1 && !pts.length) {
        ({ x, y, r } = path.arcs[0]);
      } else {
        for (const a of path.arcs) pts.push({ x: a.x, y: a.y });
        if (!pts.length) return null;
        x = pts.reduce((s, q) => s + q.x, 0) / pts.length;
        y = pts.reduce((s, q) => s + q.y, 0) / pts.length;
        r = pts.reduce((s, q) => s + Math.hypot(q.x - x, q.y - y), 0) / pts.length;
        if (path.arcs.length) r += path.arcs.reduce((s, a) => s + a.r, 0) / path.arcs.length;
        // una mancha dibujada con muchos puntos (un círculo deformado) también es redonda: sus puntos están todos a un radio parecido
        if (!circle && !path.arcs.length && pts.length >= 8) {
          const rs = pts.map((q) => Math.hypot(q.x - x, q.y - y));
          const mean = rs.reduce((t, v) => t + v, 0) / rs.length;
          const sd = Math.sqrt(rs.reduce((t, v) => t + (v - mean) ** 2, 0) / rs.length);
          circle = mean > 0 && sd / mean < 0.25;
        }
      }
      path.p = { x, y, r: Math.max(0.5, r), fi: NONE, fo: NONE, st: NONE, lw: 1, circle, curve: 1.5 };
      self.particles.push(path.p);
      return path.p;
    };

    ctx.fill = (...a) => {
      const p = particleFor();
      if (p) ({ inner: p.fi, outer: p.fo, curve: p.curve = 1.5 } = paintColors(ctx.fillStyle));
      P.fill.apply(ctx, a);
    };
    ctx.stroke = (...a) => {
      const p = particleFor();
      if (p) {
        p.st = paintColors(ctx.strokeStyle).inner;
        p.lw = (ctx.lineWidth * Math.sqrt(Math.abs(ctx.getTransform().a * ctx.getTransform().d))) / self.k;
      }
      P.stroke.apply(ctx, a);
    };
    ctx.fillRect = (x, y, w, h) => {
      path = newPath();
      path.poly = true;
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
    .map((p) => {
      const d = Math.hypot(p.x - cx, p.y - cy);
      // las formas concéntricas (aros del remolino, ecos…) tienen todas el mismo centro, así que el "ángulo" no dice nada:
      // se ordenan de la más chica a la más grande, y cada aro de A viaja al aro de B de su mismo lugar (si no, se cruzan y todo colapsa)
      const central = d < Math.max(1, p.r * 0.05);
      return { p, k: central ? -10 + p.r * 1e-4 : Math.atan2(p.y - cy, p.x - cx) + d * 1e-7 };
    })
    .sort((a, b) => a.k - b.k)
    .map((o) => o.p);
}

// número "al azar" pero siempre el mismo para el mismo k (así no parpadea entre cuadros)
const rnd = (k, salt) => {
  const x = Math.sin(k * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// qué tan "lisa" es una forma: 1 = relleno parejo hasta el borde (un círculo lleno), 0 = se apaga hacia el borde (un aura)
// (solo para círculos de verdad: una barra o un pico, que el morph aproxima con un círculo, sigue con borde suave)
const flatness = (q) => (!q.circle ? 0 : q.fi[3] > 0.01 ? Math.min(1, Math.max(0, q.fo[3] / q.fi[3])) : 1);

// superficie rellena que cubren unas formas (para no pasarse de luz)
// (el relleno cuenta por su superficie y el contorno por su largo por su grosor)
const fillArea = (list) =>
  list.reduce((s, p) => s + ((p.fi[3] + p.fo[3]) / 2) * Math.PI * p.r * p.r + p.st[3] * 2 * Math.PI * p.r * Math.max(1, p.lw), 0);

// Dibuja las formas de A transformándose en las de B.
//   u        → avance de 0 (todo A) a 1 (todo B), ya con la curva aplicada
//   stagger  → 0 = todas a la vez, 1 = una tras otra dando la vuelta
//   swirl    → cuánto se curva el camino (0 = recto)
//   scatter  → cuánto se dispersan por el camino: salen para todos lados y se
//              vuelven a juntar en su lugar de B (0 = van directo)
//   size     → tamaño de referencia del lienzo (para medir cuánto se dispersan)
export function drawParticleMorph(ctx, listA, listB, u, { stagger = 0.35, swirl = 0.18, scatter = 0.6, size = 400 } = {}) {
  const A = sortAround(thin(listA));
  const B = sortAround(thin(listB));
  const n = A.length, m = B.length;
  if (!n && !m) return;
  const K = Math.max(n, m);

  // cuántas veces se usa cada forma (si una de A se reparte en varias de B, o al revés)
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
  const ghost = (p) => ({ x: p.x, y: p.y, r: 0, fi: clear(p.fi), fo: clear(p.fo), st: clear(p.st), lw: p.lw, circle: p.circle, curve: p.curve }); // para lo que no tiene pareja: crece o se achica en su lugar

  // centro de todo, para saber hacia dónde es "afuera" cuando se dispersan
  const all = [...A, ...B];
  const cx = all.reduce((t, q) => t + q.x, 0) / all.length;
  const cy = all.reduce((t, q) => t + q.y, 0) / all.length;

  // tamaño total de cada conjunto (qué tan lejos del centro llega su borde): la
  // transformación no se puede pasar de ahí, así el conjunto no se agranda de
  // más y vuelve a achicarse: su tamaño va de A a B sin pasarse
  // (una forma suave, de las que se apagan hacia el borde, se ve hasta un 70 % de su radio)
  const seen = (r, fi, fo) => r * (fo[3] < fi[3] * 0.5 ? 0.7 : 1);
  const reach = (list) => list.reduce((mx, q) => Math.max(mx, Math.hypot(q.x - cx, q.y - cy) + seen(q.r, q.fi, q.fo)), 0);
  const extA = reach(A), extB = reach(B);

  // Si A y B son nubes de formas en lugares distintos (por ejemplo, gotas de aura al azar), al ir cada forma en línea
  // recta hacia la suya, la nube de a mitad de camino queda más JUNTA que las dos (el promedio de dos nubes sueltas se
  // encoge). Se calcula dónde irían sin dispersión y se las abre lo justo para que el tamaño de la nube vaya de A a B.
  const base = [];
  for (let k = 0; k < K; k++) {
    const [ia, ib] = pairs[k];
    const a = ia >= 0 ? A[ia] : ghost(B[ib]);
    const b = ib >= 0 ? B[ib] : ghost(A[ia]);
    const d = K > 1 ? k / (K - 1) : 0;
    const raw = Math.min(1, Math.max(0, (u - d * stagger) / (1 - stagger)));
    const p = raw * raw * (3 - 2 * raw);
    const bulge = swirl * Math.sin(Math.PI * p);
    base.push({ x: lerp(a.x, b.x, p) - (b.y - a.y) * bulge, y: lerp(a.y, b.y, p) + (b.x - a.x) * bulge });
  }
  const spread = (pts) => Math.sqrt(pts.reduce((t, q) => t + (q.x - cx) ** 2 + (q.y - cy) ** 2, 0) / Math.max(1, pts.length));
  const sMid = spread(base);
  const grow = sMid > 1 ? Math.min(2, Math.max(1, lerp(spread(A), spread(B), u) / sMid)) : 1; // (solo abre: nunca encoge de más)

  // 1) dónde y cómo está cada forma en este instante
  const items = [];
  let mixArea = 0;
  for (let k = 0; k < K; k++) {
    const [ia, ib] = pairs[k];
    const a = ia >= 0 ? A[ia] : ghost(B[ib]);
    const b = ib >= 0 ? B[ib] : ghost(A[ia]);
    const ka = ia >= 0 ? useA[ia] : 1, kb = ib >= 0 ? useB[ib] : 1;

    // cada una sale un poquito después que la anterior (stagger)
    const d = K > 1 ? k / (K - 1) : 0;
    const raw = Math.min(1, Math.max(0, (u - d * stagger) / (1 - stagger)));
    const p = raw * raw * (3 - 2 * raw);

    // (el camino ya viene curvado —sale por un costado y llega por el otro— y abierto para no encogerse: ver arriba)
    let x = cx + (base[k].x - cx) * grow;
    let y = cy + (base[k].y - cy) * grow;

    // dispersión: un desvío que crece hasta la mitad del camino y vuelve a cero al llegar
    if (scatter > 0) {
      const mx = (a.x + b.x) / 2 - cx, my = (a.y + b.y) / 2 - cy;
      const ml = Math.hypot(mx, my) || 1;
      const ang = rnd(k, 1) * TAU;
      let ox = (mx / ml) * 0.6 + Math.cos(ang);
      let oy = (my / ml) * 0.6 + Math.sin(ang);
      const ol = Math.hypot(ox, oy) || 1;
      const amount = scatter * size * 0.3 * (0.35 + 0.65 * rnd(k, 2)) * Math.pow(Math.sin(Math.PI * p), 1.2);
      x += (ox / ol) * amount;
      y += (oy / ol) * amount;
    }

    // si una forma se reparte en varias (o varias se juntan en una), cada copia es
    // más chica: entre todas cubren lo mismo que la original (superficie repartida)
    const ra = a.r / Math.sqrt(ka), rb = b.r / Math.sqrt(kb);
    const r = lerp(ra, rb, p);
    if (r <= 0.05) continue;
    let fi = lerpColor(a.fi, b.fi, p);
    let fo = lerpColor(a.fo, b.fo, p);
    const st = lerpColor(a.st, b.st, p);

    // sin pasarse del tamaño: si con el desvío la forma saldría del tamaño que
    // tiene el conjunto en este momento, se la trae hacia adentro
    const lim = lerp(extA, extB, u);
    const ddx = x - cx, ddy = y - cy, dd = Math.hypot(ddx, ddy);
    if (dd + seen(r, fi, fo) > lim && dd > 0) {
      const nd = Math.max(0, lim - seen(r, fi, fo));
      x = cx + (ddx / dd) * nd;
      y = cy + (ddy / dd) * nd;
    }

    // nunca solo el contorno: si a mitad de camino una forma tiene aro pero casi
    // nada de relleno, se le da cuerpo con el color de su aro (en el principio y
    // el final del camino no cambia nada: ahí se ve A o B tal cual)
    const body = Math.sin(Math.PI * p);
    const baseA = Math.max(fi[3], fo[3]);
    // (solo si alguno de los dos extremos tiene relleno: si A y B son puro contorno, como los aros del remolino,
    // se quedan en contorno; si no, los aros finos se volverían discos enormes y todo se apagaría)
    const hasFill = Math.max(a.fi[3], a.fo[3], b.fi[3], b.fo[3]) > 0.01;
    if (hasFill && body > 0.02 && st[3] > baseA) {
      const want = st[3] * 0.6 * body;
      if (want > baseA) {
        const col = baseA > 0.01 ? fi : st;
        fi = [col[0], col[1], col[2], want];
        fo = [col[0], col[1], col[2], want * 0.6];
      }
    }
    mixArea += ((fi[3] + fo[3]) / 2) * Math.PI * r * r + st[3] * 2 * Math.PI * r * Math.max(1, lerp(a.lw, b.lw, p));
    items.push({ x, y, r, fi, fo, st, lw: lerp(a.lw, b.lw, p), flat: lerp(flatness(a), flatness(b), p), circle: !!(a.circle || b.circle), curve: lerp(a.curve ?? 1.5, b.curve ?? 1.5, p) });
  }

  // 2) límite de luz: lo relleno no puede cubrir mucho más que lo que cubren A o
  // B por separado (si no, al juntarse muchas formas se quema a blanco). Es un
  // ajuste parejo para todas, así nada se apaga ni desaparece de golpe.
  const allowed = 1.3 * Math.max(fillArea(A), fillArea(B), 0.04 * size * size);
  const g = mixArea > allowed ? allowed / mixArea : 1;

  // límite local: donde se amontonan muchas formas la luz se suma y se quema a
  // blanco; en cada zona se baja un poco para que no pase de lo que se ve en A o B
  const cell = Math.max(20, size / 8);
  const dens = new Map();
  const keyOf = (it) => Math.floor(it.x / cell) + "," + Math.floor(it.y / cell);
  const covOf = (it) => ((it.fi[3] + it.fo[3]) / 2) * Math.min(1, (Math.PI * it.r * it.r) / (cell * cell));
  const densOf = (list) => {
    const d = new Map();
    for (const it of list) d.set(keyOf(it), (d.get(keyOf(it)) ?? 0) + covOf(it));
    return d;
  };
  const densA = densOf(A), densB = densOf(B); // (lo que ya tenían A y B por separado: eso nunca se baja)
  for (const it of items) {
    const k = keyOf(it);
    dens.set(k, (dens.get(k) ?? 0) + covOf(it));
  }

  // 3) se dibujan
  ctx.lineCap = "round";
  for (const it of items) {
    const { x, y, r } = it;
    const key = keyOf(it);
    // (en las formas redondas no se baja de la densidad que ya tenían A o B; las barras y picos se aproximan con círculos, así que siguen con el límite de siempre)
    const allow = it.circle ? Math.max(0.8, densA.get(key) ?? 0, densB.get(key) ?? 0) : 0.8;
    const local = Math.min(1, allow / Math.max(0.001, dens.get(key)));
    const gg = g * local;
    const fi = [it.fi[0], it.fi[1], it.fi[2], it.fi[3] * gg];
    const fo = [it.fo[0], it.fo[1], it.fo[2], it.fo[3] * gg];
    const st = [it.st[0], it.st[1], it.st[2], it.st[3] * gg]; // el contorno se ajusta igual que el relleno: nunca queda solo
    if (fi[3] > 0.003 || fo[3] > 0.003) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      // siempre con degradado: del color del centro a un borde suave, con la caída de
      // un aura de verdad (fuerte en el centro, se apaga rápido hacia el borde). Si la
      // forma era plana (un círculo lleno), el borde se suaviza: en ningún momento queda un color liso
      const edge = Math.min(fo[3], fi[3] * 0.35);
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      for (const rho of [0, 0.25, 0.5, 0.75, 1]) {
        const soft = fi[3] * Math.pow(1 - rho, it.curve) + edge * Math.pow(rho, it.curve);
        const a = lerp(soft, fi[3], it.flat); // (si en A y en B la forma es lisa, se queda lisa: no se achica ni se tiñe de borroso)
        gr.addColorStop(rho, css([lerp(fi[0], fo[0], rho), lerp(fi[1], fo[1], rho), lerp(fi[2], fo[2], rho), a]));
      }
      ctx.fillStyle = gr;
      ctx.fill();
    }
    if (st[3] > 0.003) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.lineWidth = Math.max(0.5, it.lw);
      ctx.strokeStyle = css(st);
      ctx.stroke();
    }
  }
}
