// Biblioteca de conjuntos guardados. Se guarda en el navegador (localStorage):
// queda ahí aunque cierres la pestaña o apagues la compu, y se pierde solo si
// borrás los datos del sitio. Está atada al sitio y al navegador: en
// localhost y en la página publicada hay bibliotecas separadas (para pasar
// conjuntos de una a otra o a una amiga están "exportar" e "importar").
//
// Se guarda la configuración del conjunto (modo, colores, cantidades, estilo,
// movimiento, transformación y keyframes) y dónde quedó lo que moviste con el
// mouse (núcleos, círculos libres, luces del aura de colores, ecos). No se
// guarda lo que pasa solo en ese momento (gotas que van apareciendo, estelas).

// Además de los que guardás vos, hay una lista COMPARTIDA que viene con la
// página (conjuntos-compartidos.json): la ven todas las personas que abran el
// link, desde cualquier compu. Esos no se pueden borrar desde la página.
//
// Para pasarle conjuntos a alguien sin tocar la página: un link que los lleva
// adentro (ver encodePresets / decodePresets).

const KEY = "visualizador-de-sonido.conjuntos.v1";

let shared = []; // los de la página (solo lectura)

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((p) => p && typeof p.name === "string" && p.params) : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false; // navegación privada, datos bloqueados, sin lugar…
  }
}

// los tuyos primero; los compartidos después (si tenés uno con el mismo nombre, gana el tuyo)
export function listPresets() {
  const mine = read();
  const names = new Set(mine.map((p) => p.name));
  return [...mine, ...shared.filter((p) => !names.has(p.name)).map((p) => ({ ...p, shared: true }))];
}

// carga la lista compartida que viene con la página
export async function loadShared(url) {
  try {
    const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return 0;
    const data = await res.json();
    shared = (Array.isArray(data) ? data : data?.conjuntos ?? []).map(clean).filter(Boolean);
    return shared.length;
  } catch {
    return 0;
  }
}

// Deja un conjunto "limpio": solo números, textos y sí/no en los parámetros, con
// tamaños razonables. Se usa con todo lo que viene de afuera (archivo, link, lista compartida).
function clean(p) {
  if (!p || typeof p.name !== "string" || !p.params || typeof p.params !== "object") return null;
  const params = {};
  for (const [k, v] of Object.entries(p.params)) {
    if (!/^[A-Za-z0-9_]{1,60}$/.test(k) || k === "constructor" || k === "prototype") continue;
    if (typeof v === "number" ? Number.isFinite(v) : typeof v === "string" ? v.length <= 80 : typeof v === "boolean") params[k] = v;
  }
  const num = (v) => (Number.isFinite(v) ? v : 0);
  const pts = (list, max, keep) =>
    (Array.isArray(list) ? list : []).slice(0, max).map((c) => Object.fromEntries(keep.map((k) => [k, num(c?.[k])])));
  let state = null;
  const st = p.state;
  if (st && typeof st === "object") {
    const mover = (m) => ({ x: num(m?.x), y: num(m?.y), vx: 0, vy: 0 });
    state = {
      w: num(st.w),
      h: num(st.h),
      centerOffset: mover(st.centerOffset),
      coreOffsets: { a: mover(st.coreOffsets?.a), b: mover(st.coreOffsets?.b) },
      freeCircles: pts(st.freeCircles, 60, ["x", "y", "vx", "vy", "hueShift", "size"]),
      lights: (Array.isArray(st.lights) ? st.lights : []).slice(0, 8).map((l) => ({
        ...Object.fromEntries(Object.entries(l ?? {}).filter(([k, v]) => /^[A-Za-z0-9_]{1,30}$/.test(k) && Number.isFinite(v))),
        vx: 0,
        vy: 0,
      })),
      echoChain: pts(st.echoChain, 120, ["x", "y"]),
      echoDir: Number.isFinite(st.echoDir) ? st.echoDir : null,
      echoSpin: num(st.echoSpin),
    };
  }
  const keys = (Array.isArray(p.keys) ? p.keys : [])
    .slice(0, 200)
    .filter((k) => k && Number.isFinite(k.t) && k.v && typeof k.v === "object")
    .map((k) => ({ t: k.t, v: Object.fromEntries(Object.entries(k.v).filter(([, v]) => Number.isFinite(v))) }));
  return { name: p.name.slice(0, 80), params, keys, state, spin: num(p.spin), savedAt: Date.now() };
}

// guarda (o pisa, si ya había uno con ese nombre) el conjunto c
export function savePreset(name, c) {
  const clean = name.trim() || c.name;
  const list = read();
  const preset = {
    name: clean,
    params: structuredClone(c.params),
    keys: structuredClone(c.keys ?? []),
    state: c.engine?.exportState?.() ?? null, // dónde quedó lo que moviste con el mouse
    spin: c.spinAngle ?? 0, // cuánto giró por su cuenta
    savedAt: Date.now(),
  };
  const i = list.findIndex((p) => p.name === clean);
  const replaced = i >= 0;
  if (replaced) list[i] = preset;
  else list.push(preset);
  return { ok: write(list), replaced, name: clean };
}

export function deletePreset(name) {
  return write(read().filter((p) => p.name !== name));
}

export function getPreset(name) {
  return listPresets().find((p) => p.name === name) ?? null;
}

export function exportPresetsText() {
  return JSON.stringify({ app: "visualizador-de-sonido", tipo: "conjuntos", version: 1, conjuntos: read() }, null, 1);
}

// suma los conjuntos de una lista (de un archivo o de un link): los que tienen
// el mismo nombre se pisan. Devuelve cuántos entraron, o -1 si no eran conjuntos.
export function importPresets(incoming) {
  if (!Array.isArray(incoming)) return -1;
  const list = read();
  let n = 0;
  for (const raw of incoming) {
    const item = clean(raw);
    if (!item) continue;
    const i = list.findIndex((x) => x.name === item.name);
    if (i >= 0) list[i] = item;
    else list.push(item);
    n++;
  }
  return write(list) ? n : -1;
}

export function importPresetsText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return -1;
  }
  return importPresets(Array.isArray(data) ? data : data?.conjuntos);
}

// ---------- links que llevan conjuntos adentro ----------
// Los conjuntos se pasan a JSON, se comprimen y se escriben en el link (después
// del #). Quien abre el link los recibe; no hace falta ningún servidor.

const toB64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64 = (t) => Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function pipe(bytes, stream) {
  const w = stream.writable.getWriter();
  w.write(bytes);
  w.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

export async function encodePresets(list) {
  const json = JSON.stringify(list, (_, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v));
  return toB64(await pipe(new TextEncoder().encode(json), new CompressionStream("gzip")));
}

export async function decodePresets(text) {
  try {
    const json = new TextDecoder().decode(await pipe(fromB64(text), new DecompressionStream("gzip")));
    const data = JSON.parse(json);
    return Array.isArray(data) ? data : data?.conjuntos ?? null;
  } catch {
    return null;
  }
}
