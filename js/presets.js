// Biblioteca de conjuntos guardados. Se guarda en el navegador (localStorage):
// queda ahí aunque cierres la pestaña o apagues la compu, y se pierde solo si
// borrás los datos del sitio. Está atada al sitio y al navegador: en
// localhost y en la página publicada hay bibliotecas separadas (para pasar
// conjuntos de una a otra o a una amiga están "exportar" e "importar").
//
// Se guarda la configuración del conjunto (modo, colores, cantidades, estilo,
// movimiento, transformación y keyframes), no lo que está pasando en ese
// momento (posiciones de las gotas, estelas, etc.).

const KEY = "visualizador-de-sonido.conjuntos.v1";

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

export function listPresets() {
  return read();
}

// guarda (o pisa, si ya había uno con ese nombre) el conjunto c
export function savePreset(name, c) {
  const clean = name.trim() || c.name;
  const list = read();
  const preset = { name: clean, params: structuredClone(c.params), keys: structuredClone(c.keys ?? []), savedAt: Date.now() };
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
  return read().find((p) => p.name === name) ?? null;
}

export function exportPresetsText() {
  return JSON.stringify({ app: "visualizador-de-sonido", tipo: "conjuntos", version: 1, conjuntos: read() }, null, 1);
}

// suma los conjuntos de un archivo exportado (los que tienen el mismo nombre se pisan).
// Devuelve cuántos entraron, o -1 si el archivo no era de conjuntos.
export function importPresetsText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return -1;
  }
  const incoming = Array.isArray(data) ? data : data?.conjuntos;
  if (!Array.isArray(incoming)) return -1;
  const list = read();
  let n = 0;
  for (const p of incoming) {
    if (!p || typeof p.name !== "string" || typeof p.params !== "object" || !p.params) continue;
    const item = { name: p.name, params: p.params, keys: Array.isArray(p.keys) ? p.keys : [], savedAt: Date.now() };
    const i = list.findIndex((x) => x.name === item.name);
    if (i >= 0) list[i] = item;
    else list.push(item);
    n++;
  }
  return write(list) ? n : -1;
}
