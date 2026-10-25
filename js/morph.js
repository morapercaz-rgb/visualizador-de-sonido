// Transformación de un conjunto en otro (morph).
//
// Se eligen dos conjuntos, A y B (de la escena o de los guardados), y una
// duración. Durante ese tiempo, todo lo que sea un número (cantidad, tamaño,
// posición, rotación, escala, opacidad, deformación…) y todo color pasa
// gradualmente de lo de A a lo de B. Lo que no se puede "mezclar" (el modo de
// dibujo, relleno o contorno, tildes) cambia a la mitad del camino.
// Si A y B tienen distinto modo (por ejemplo anillo → remolino), se dibujan los
// dos a la vez y uno se desvanece mientras aparece el otro.

const HEX = /^#[0-9a-f]{6}$/i;

const lerp = (a, b, u) => a + (b - a) * u;

function lerpHex(a, b, u) {
  const ca = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const cb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + ca.map((v, i) => Math.round(lerp(v, cb[i], u)).toString(16).padStart(2, "0")).join("");
}

// u = 0 → exactamente A, u = 1 → exactamente B.
// Lo que no se puede mezclar se toma de A o de B según `discrete` ("a" o "b").
export function mixParams(a, b, u, discrete) {
  const out = {};
  for (const k of Object.keys(a)) {
    const va = a[k];
    const vb = b[k] ?? va;
    if (typeof va === "number" && typeof vb === "number") out[k] = lerp(va, vb, u);
    else if (typeof va === "string" && typeof vb === "string" && HEX.test(va) && HEX.test(vb)) out[k] = lerpHex(va, vb, u);
    else out[k] = discrete === "b" ? vb : va;
  }
  return out;
}

export function easeMorph(u, kind) {
  const x = Math.min(1, Math.max(0, u));
  return kind === "linear" ? x : x * x * (3 - 2 * x);
}

// tiempo transcurrido → avance de 0 a 1 según cómo se repite
//   once     → va de A a B y se queda en B
//   loop     → va de A a B y vuelve a empezar en A
//   pingpong → va de A a B y vuelve de B a A
export function progressAt(time, seconds, repeat) {
  const s = Math.max(0.01, seconds);
  if (repeat === "loop") return (time % s) / s;
  if (repeat === "pingpong") {
    const p = (time % (2 * s)) / s;
    return p <= 1 ? p : 2 - p;
  }
  return Math.min(1, time / s);
}
