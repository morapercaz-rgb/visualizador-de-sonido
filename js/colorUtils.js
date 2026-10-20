// Utilidades de color: convierten el color hex que el usuario elige en el
// panel (ej. "#33aaff") al modelo HSL, que es el que usa visualEngine.js para
// poder seguir controlando saturación/luminosidad por separado y para poder
// interpolar el matiz (hue) entre dos colores en el modo "degradado".

export function hexToHsl(hex) {
  return rgbToHsl(hexToRgb(hex));
}

export function rgbToHsl({ r, g, b }) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  let h = 0, s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rn: h = ((gn - bn) / d) % 6; break;
      case gn: h = (bn - rn) / d + 2; break;
      default: h = (rn - gn) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s: s * 100, l: l * 100 };
}

export function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

// interpola el matiz entre dos colores tomando el camino más corto en el
// círculo cromático (así un degradado de rojo a violeta no da toda la vuelta
// pasando por verde).
export function lerpHue(h1, h2, t) {
  let diff = h2 - h1;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return (h1 + diff * t + 360) % 360;
}

// recorre una paleta de varios colores (no solo 2) y devuelve el color que
// le toca a la posición "t" (0 a 1) — como un degradado con más de dos
// puntas. Se usa para el modo "según frecuencia": t es "qué tan agudo" está
// sonando el audio en este momento, y la paleta son los colores que el
// usuario eligió.
export function paletteColorRgb(colors, t) {
  if (colors.length === 0) return { r: 255, g: 255, b: 255 };
  if (colors.length === 1) return hexToRgb(colors[0]);

  const clamped = Math.min(Math.max(t, 0), 1);
  const scaled = clamped * (colors.length - 1);
  const i = Math.min(Math.floor(scaled), colors.length - 2);
  const localT = scaled - i;

  const a = hexToRgb(colors[i]);
  const b = hexToRgb(colors[i + 1]);
  return {
    r: a.r + (b.r - a.r) * localT,
    g: a.g + (b.g - a.g) * localT,
    b: a.b + (b.b - a.b) * localT,
  };
}
