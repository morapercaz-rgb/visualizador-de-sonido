// Maneja los CONJUNTOS: varias piezas generativas independientes que se
// dibujan a la vez, una encima de otra. Cada conjunto tiene
//   - su propio objeto de parámetros (modo, cantidad, colores, estilo…)
//   - su propio VisualEngine (con su estado: círculos libres, luces del aura,
//     posición de la pieza, etc.)
//   - su TRANSFORMACIÓN (posición, rotación, escala, pivote, opacidad), con
//     movimiento continuo (giro, vaivén, órbita, deriva, pulso) y keyframes
// así que un conjunto puede ser un remolino, otro un aura de colores y otro un
// anillo, cada uno con su configuración y su animación, todos a la vez.
//
// El orden de la lista es el orden de dibujo: el último queda arriba de todo.

import { VisualEngine } from "./visualEngine.js?v=20261025172438";
import { createDefaultParams } from "./controls.js?v=20261025172438";
import { getPreset } from "./presets.js?v=20261025172438";
import { mixParams, easeMorph, progressAt } from "./morph.js?v=20261025172438";
import { Capture, drawParticleMorph } from "./morphParticles.js?v=20261025172438";
import { GooSystem, GOO_DEFAULTS, drawBridge } from "./goo.js?v=20261025172438";

const TAU = Math.PI * 2;
const DT = 0.016; // ~1 cuadro a 60fps, igual que en los motores

// los parámetros que se pueden animar con keyframes
export const KEY_PARAMS = ["posX", "posY", "rotation", "scale", "tOpacity"];

// distancias (en píxeles de pantalla) de las manijas del gizmo
const ROT_HANDLE_DIST = 120;
const HANDLE_HIT = 14;

export class Scene {
  constructor() {
    this.conjuntos = [];
    this.selectedId = null; // el que se está editando en el panel
    this._nextId = 1;
    this.active = null; // el conjunto cuyo elemento se está arrastrando con el mouse

    this.clock = 0; // reloj global en segundos: lo usan todos los movimientos continuos

    // línea de tiempo de keyframes (una sola para todos los conjuntos)
    this.timeline = { time: 0, duration: 8, playing: false, loop: true, ease: "smooth" };

    // transformación de un conjunto en otro (ver morph.js). a y b son
    // "set:<id>" (un conjunto de la escena) o "lib:<nombre>" (uno guardado)
    this.morph = { on: false, a: "", b: "", seconds: 4, ease: "smooth", repeat: "once", only: true, stagger: 0.35, swirl: 0.18, time: 0, playing: false };
    // línea de tiempo de varias etapas: cada etapa es un conjunto (de la escena o
    // guardado) con su posición; entre una etapa y la siguiente se transforma
    //   stops: [{ src, hold, trans, pos: { x, y, scale, rot, op } }]
    //   hold = segundos que se queda; trans = segundos que tarda en pasar a la siguiente
    this.seq = { on: false, stops: [], sel: 0, time: 0, playing: false, repeat: "once", ease: "smooth", only: true };
    // efecto goo: atracción y puente de melaza entre conjuntos que se acercan (ver goo.js)
    this.goo = { ...GOO_DEFAULTS };
    this._gooSys = new GooSystem();
    this._caps = { a: new Capture(), b: new Capture() }; // donde se dibuja cada extremo de la transformación
    this._libCache = new Map(); // conjuntos guardados convertidos en conjuntos dibujables
    this._nextLibId = -1;

    this.settings = { gizmo: false }; // mostrar las manijas de transformación
    this.gdrag = null; // arrastre de una manija del gizmo
    this.onParamsChanged = null; // se llama cuando el gizmo cambia parámetros (para refrescar el panel)

    this.add();
  }

  get selected() {
    return this.conjuntos.find((c) => c.id === this.selectedId) ?? this.conjuntos[0];
  }

  // suma un conjunto nuevo (con valores iniciales) y lo deja seleccionado
  add() {
    const id = this._nextId++;
    const c = {
      id,
      name: `Conjunto ${id}`,
      visible: true,
      params: createDefaultParams(),
      engine: new VisualEngine(),
      keys: [], // keyframes: [{ t, v: { posX, posY, rotation, scale, tOpacity } }]
      spinAngle: 0, // giro continuo acumulado (grados)
      _lastT: null,
      xf: null, // transformación del último cuadro dibujado
    };
    this.conjuntos.push(c);
    this.selectedId = id;
    return c;
  }

  // copia el conjunto seleccionado con toda su configuración; la copia queda
  // un poco corrida para que se vea que hay dos
  duplicate() {
    const src = this.selected;
    const c = this.add();
    c.name = `${src.name} (copia)`;
    c.params = structuredClone(src.params);
    c.keys = structuredClone(src.keys);
    c.params.posX += 60;
    c.params.posY += 40;
    return c;
  }

  // suma un conjunto nuevo con la configuración guardada en un preset. Los
  // parámetros que el preset no tenga (porque se agregaron después) quedan en su valor inicial.
  addFromPreset(p) {
    const c = this.add();
    this._applyPreset(c, p);
    c.name = p.name;
    return c;
  }

  // reemplaza la configuración del conjunto seleccionado por la de un preset
  replaceFromPreset(p) {
    const c = this.selected;
    this._applyPreset(c, p);
    c.name = p.name;
    return c;
  }

  _applyPreset(c, p) {
    c.params = { ...createDefaultParams(), ...structuredClone(p.params) };
    c.keys = structuredClone(p.keys ?? []);
    c.engine = new VisualEngine(); // arranca limpio, sin restos del conjunto anterior
    c.engine.importState(p.state); // y con lo que habías movido, donde lo dejaste
    c.spinAngle = p.spin ?? 0;
    c._lastT = null;
  }

  // borra el seleccionado (siempre queda al menos uno)
  remove() {
    if (this.conjuntos.length <= 1) return false;
    this.conjuntos = this.conjuntos.filter((c) => c.id !== this.selectedId);
    this.selectedId = this.conjuntos[this.conjuntos.length - 1].id;
    return true;
  }

  select(id) {
    if (this.conjuntos.some((c) => c.id === id)) this.selectedId = id;
  }

  // lo pasa al final de la lista, o sea: arriba de los demás
  bringToFront() {
    const c = this.selected;
    this.conjuntos = [...this.conjuntos.filter((x) => x !== c), c];
  }

  // ---------- keyframes ----------

  // guarda un keyframe del conjunto seleccionado en el momento actual de la
  // línea de tiempo, con los valores que tengan ahora sus parámetros
  addKey() {
    const c = this.selected;
    const t = this.timeline.time;
    const v = {};
    for (const k of KEY_PARAMS) v[k] = c.params[k];
    c.keys = c.keys.filter((k) => Math.abs(k.t - t) > 0.05); // si ya había uno ahí, se reemplaza
    c.keys.push({ t, v });
    c.keys.sort((a, b) => a.t - b.t);
    c._lastT = t;
  }

  // borra el keyframe más cercano al momento actual
  removeKey() {
    const c = this.selected;
    if (!c.keys.length) return;
    const t = this.timeline.time;
    let best = 0;
    c.keys.forEach((k, i) => {
      if (Math.abs(k.t - t) < Math.abs(c.keys[best].t - t)) best = i;
    });
    c.keys.splice(best, 1);
  }

  clearKeys() {
    this.selected.keys = [];
  }

  // texto con los momentos de los keyframes del conjunto, para mostrar en el panel
  keysInfo(c) {
    return c.keys.length ? c.keys.map((k) => k.t.toFixed(1) + "s").join("  ·  ") : "(sin keyframes)";
  }

  // valores de los parámetros animados en el momento t (interpolando entre keyframes)
  _valuesAt(keys, t) {
    if (t <= keys[0].t) return keys[0].v;
    const last = keys[keys.length - 1];
    if (t >= last.t) return last.v;
    let i = 0;
    while (keys[i + 1].t <= t) i++;
    const a = keys[i], b = keys[i + 1];
    let u = (t - a.t) / (b.t - a.t);
    if (this.timeline.ease === "smooth") u = u * u * (3 - 2 * u); // arranca y frena suave
    const out = {};
    for (const k of KEY_PARAMS) out[k] = a.v[k] + (b.v[k] - a.v[k]) * u;
    return out;
  }

  // avanza la línea de tiempo y, si cambió el momento (porque está
  // reproduciendo o porque la movieron), pone en cada conjunto los valores
  // de sus keyframes. Si está en pausa y el momento no cambió, no se pisa
  // nada: así se pueden editar los valores libremente antes de guardar un keyframe.
  _tickTimeline(dt) {
    const tl = this.timeline;
    if (tl.playing) {
      tl.time += dt;
      if (tl.time > tl.duration) {
        if (tl.loop) tl.time %= tl.duration;
        else {
          tl.time = tl.duration;
          tl.playing = false;
        }
      }
    }
    if (tl.time > tl.duration) tl.time = tl.duration;
    for (const c of this.conjuntos) {
      if (c.keys.length && c._lastT !== tl.time) {
        Object.assign(c.params, this._valuesAt(c.keys, tl.time));
        c._lastT = tl.time;
      }
    }
  }

  // ---------- transformación ----------

  // calcula la transformación de un conjunto en este cuadro: lo que está
  // fijo en los parámetros (posición, rotación, escala, pivote) más el
  // movimiento continuo que se le suma encima (giro, vaivén, órbita, deriva, pulso)
  _transform(c, w, h, audio, dt) {
    const p = c.params;
    const t = this.clock;

    // órbita: recorre una elipse
    const oa = (p.orbitPhase * Math.PI) / 180 + TAU * p.orbitSpeed * t;
    const ox = Math.cos(oa) * p.orbitRX;
    const oy = Math.sin(oa) * p.orbitRY;

    // deriva: vagabundeo suave y sin patrón evidente
    const dx = p.driftAmount * (Math.sin(t * p.driftSpeed * 1.3 + c.id) * 0.6 + Math.sin(t * p.driftSpeed * 2.7 + c.id * 2.1) * 0.4);
    const dy = p.driftAmount * (Math.cos(t * p.driftSpeed * 1.1 + c.id * 1.7) * 0.6 + Math.sin(t * p.driftSpeed * 2.3 + c.id * 0.6) * 0.4);

    // giro continuo (se acumula) + vaivén
    c.spinAngle += (p.spinSpeed + p.spinAudio * (audio.bass ?? 0)) * dt;
    const swing = p.swingAmp * Math.sin(TAU * p.swingSpeed * t);

    // pulso de escala
    const pulse = 1 + p.pulseScale * Math.sin(TAU * p.pulseSpeed * t) + p.pulseAudio * (audio.bass ?? 0);

    // EJE DE GIRO (pivotMode): alrededor de qué punto rota y escala el conjunto
    //   "own"    → su propio centro (el de la pieza, con lo que la hayas movido):
    //              gira sobre sí mismo y la posición lo desplaza sin cambiar el eje
    //   "canvas" → el centro del lienzo: la posición queda "adentro" de la
    //              rotación, así que si el conjunto está corrido ORBITA alrededor del centro
    //   "manual" → el pivote que pusiste con pivote X / Y, sin seguir a la pieza
    // En los tres, pivote X / Y se suma al punto base.
    let bx = w / 2, by = h / 2;
    if (p.pivotMode === "own") {
      const pc = c.engine.pieceCenter(w, h, p);
      bx = pc.x;
      by = pc.y;
    }

    const go = this.goo.on ? this._gooSys.offsetOf(c) : { x: 0, y: 0 }; // cuánto lo atrae el otro conjunto
    return {
      mode: p.pivotMode,
      px: bx + p.pivotX, // el pivote: el punto alrededor del cual se rota y se escala
      py: by + p.pivotY,
      tx: p.posX + ox + dx + go.x,
      ty: p.posY + oy + dy + go.y,
      ang: ((p.rotation + c.spinAngle + swing) * Math.PI) / 180,
      s: Math.max(0.01, p.scale * pulse),
    };
  }

  // aplica la transformación al canvas. Se rota y se escala alrededor del
  // pivote; la diferencia entre modos es si el desplazamiento (tx, ty) se
  // aplica después de rotar (el dibujo se corre sin cambiar su eje) o antes
  // (el dibujo queda corrido y la rotación lo hace orbitar: modo "canvas").
  _apply(ctx, xf) {
    if (xf.mode === "canvas") {
      ctx.translate(xf.px, xf.py);
      ctx.rotate(xf.ang);
      ctx.scale(xf.s, xf.s);
      ctx.translate(-xf.px + xf.tx, -xf.py + xf.ty);
    } else {
      ctx.translate(xf.px + xf.tx, xf.py + xf.ty);
      ctx.rotate(xf.ang);
      ctx.scale(xf.s, xf.s);
      ctx.translate(-xf.px, -xf.py);
    }
  }

  // un punto del conjunto → su lugar en la pantalla (con la transformación aplicada)
  _map(f, q) {
    const cos = Math.cos(f.ang) * f.s, sin = Math.sin(f.ang) * f.s;
    if (f.mode === "canvas") {
      const dx = q.x - f.px + f.tx, dy = q.y - f.py + f.ty;
      return { x: f.px + dx * cos - dy * sin, y: f.py + dx * sin + dy * cos };
    }
    const dx = q.x - f.px, dy = q.y - f.py;
    return { x: f.px + f.tx + dx * cos - dy * sin, y: f.py + f.ty + dx * sin + dy * cos };
  }

  // un punto de la pantalla → coordenadas del conjunto (deshace su transformación),
  // para que el mouse caiga donde corresponde aunque el conjunto esté rotado/escalado
  _unmap(f, p) {
    const cos = Math.cos(-f.ang), sin = Math.sin(-f.ang);
    if (f.mode === "canvas") {
      const dx = p.x - f.px, dy = p.y - f.py;
      return { x: (dx * cos - dy * sin) / f.s + f.px - f.tx, y: (dx * sin + dy * cos) / f.s + f.py - f.ty };
    }
    const dx = p.x - (f.px + f.tx), dy = p.y - (f.py + f.ty);
    return { x: (dx * cos - dy * sin) / f.s + f.px, y: (dx * sin + dy * cos) / f.s + f.py };
  }

  _toLocal(c, x, y) {
    return c.xf ? this._unmap(c.xf, { x, y }) : { x, y };
  }

  // dt = segundos reales desde el cuadro anterior (por defecto 1/60 s). Todo el
  // movimiento y la línea de tiempo usan el tiempo real, así que la animación
  // dura lo mismo en una pantalla de 60 Hz que en una de 120 Hz.
  // overlay (opcional): el contexto de OTRA capa, encima del canvas, donde se
  // dibujan las manijas y el gizmo. Así se ven en pantalla pero nunca quedan en
  // lo que se graba. Sin overlay (por ejemplo al exportar) no se dibujan.
  draw(ctx, w, h, audioData, dt = DT, overlay = null) {
    this.clock += dt;
    this._tickTimeline(dt);

    const m = this.morph;
    const sq = this.seq;
    const sched = sq.on ? this.seqSchedule() : null;
    const seqOn = !!sched?.segs.length;
    const ends = m.on && !seqOn ? this.morphEnds() : null;
    if (ends && m.playing) {
      m.time += dt;
      if (m.repeat === "once" && m.time >= m.seconds) {
        m.time = m.seconds;
        m.playing = false;
      }
    }
    if (seqOn && sq.playing) {
      sq.time += dt;
      if (sq.repeat === "once" && sq.time >= sched.total) {
        sq.time = sched.total;
        sq.playing = false;
      }
    }
    const inSeq = seqOn ? new Set(sched.segs.map((v) => v.c)) : null;

    // goo: atracción y puentes entre los conjuntos que se ven normalmente. Los
    // puentes van DEBAJO de los conjuntos.
    if (this.goo.on) {
      const items = this.conjuntos
        .filter((c) => c.visible && c.params.gooOn && c.xf)
        .filter((c) => !(ends && (c === ends.a || c === ends.b || m.only)) && !(inSeq && (inSeq.has(c) || sq.only)))
        .map((c) => {
          const off = this._gooSys.offsetOf(c);
          const f = { ...c.xf, tx: c.xf.tx - off.x, ty: c.xf.ty - off.y }; // el lugar donde lo puso el usuario, sin la atracción
          return { c, n: this._map(f, c.engine.pieceCenter(w, h, c.params)), r: this._gooRadius(c, w, h) };
        });
      for (const br of this._gooSys.step(items, this.goo, dt)) drawBridge(ctx, br, this.goo, this.clock);
    } else if (this._gooSys.off.size || this._gooSys.pairs.size) {
      this._gooSys.reset();
    }

    for (const c of this.conjuntos) {
      if (ends && (c === ends.a || c === ends.b)) continue; // estos dos se dibujan como transformación
      if (ends && m.only) continue; // y con "solo estos dos" no se dibuja nada más
      if (inSeq && (inSeq.has(c) || sq.only)) continue; // lo mismo con la línea de tiempo
      if (!c.visible) continue;
      c.xf = this._transform(c, w, h, audioData, dt);
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, c.params.tOpacity));
      this._apply(ctx, c.xf);
      c.engine.draw(ctx, w, h, audioData, c.params, dt);
      ctx.restore();

      if (overlay) this._drawHandles(overlay, c);
    }

    if (ends) {
      this._drawMorph(ctx, w, h, audioData, dt, ends.a, ends.b, easeMorph(this.morphProgress(), m.ease));
      if (overlay) for (const c of [ends.a, ends.b]) if (this.conjuntos.includes(c)) this._drawHandles(overlay, c);
    }

    if (seqOn) this._drawSeq(ctx, w, h, audioData, dt, sched);

    if (overlay && this.settings.gizmo) this._drawGizmo(overlay);
  }

  // ---------- línea de tiempo de etapas ----------

  // cuándo empieza y termina cada etapa (solo las que tienen un conjunto que existe)
  seqSchedule() {
    const segs = [];
    let t = 0;
    const valid = [];
    this.seq.stops.forEach((s, i) => {
      const c = this._resolveEnd(s.src);
      if (c) valid.push({ i, s, c });
    });
    valid.forEach((v, k) => {
      const last = k === valid.length - 1;
      const hold = Math.max(0, v.s.hold);
      const trans = last ? 0 : Math.max(0.05, v.s.trans);
      segs.push({ ...v, start: t, holdEnd: t + hold, end: t + hold + trans });
      t += hold + trans;
    });
    return { segs, total: t };
  }

  // el momento de la línea de tiempo con la repetición aplicada
  _seqEffective(total) {
    const q = this.seq;
    if (total <= 0) return 0;
    if (q.repeat === "loop") return q.time % total;
    if (q.repeat === "pingpong") {
      const p = q.time % (2 * total);
      return p <= total ? p : 2 * total - p;
    }
    return Math.min(q.time, total);
  }

  // en qué etapa está (o entre cuáles dos) en el momento t
  seqStateAt(t, segs) {
    for (let k = 0; k < segs.length; k++) {
      const s = segs[k];
      if (t <= s.holdEnd || k === segs.length - 1) return { a: s, b: null, u: 0 };
      if (t <= s.end) return { a: s, b: segs[k + 1], u: (t - s.holdEnd) / (s.end - s.holdEnd) };
    }
    return null;
  }

  // parámetros de un conjunto con la posición que tiene en esa etapa
  _stopParams(v) {
    const p = v.s.pos;
    return { ...v.c.params, posX: p.x, posY: p.y, scale: p.scale, rotation: p.rot, tOpacity: p.op };
  }

  // etapa nueva a partir de un conjunto: arranca con la posición que ese conjunto ya tiene
  seqNewStop(src, hold = 1, trans = 2) {
    const c = this._resolveEnd(src);
    const p = c?.params ?? createDefaultParams();
    return { src, hold, trans, pos: { x: p.posX, y: p.posY, scale: p.scale, rot: p.rotation, op: p.tOpacity } };
  }

  seqTotal() {
    return this.seqSchedule().total;
  }

  // avance 0..1 de toda la línea de tiempo
  seqProgress() {
    const total = this.seqTotal();
    return total > 0 ? this._seqEffective(total) / total : 0;
  }

  seqPlay() {
    Object.assign(this.seq, { on: true, time: 0, playing: true });
  }

  // ir a un momento (en segundos) y dejarla pausada ahí
  seqSeek(t) {
    const q = this.seq;
    q.on = true;
    q.playing = false;
    q.time = Math.min(Math.max(0, t), this.seqTotal());
  }

  // ir a la mitad del tiempo en que la etapa i se queda quieta
  seqSeekStop(i) {
    const v = this.seqSchedule().segs.find((x) => x.i === i);
    if (v) this.seqSeek((v.start + v.holdEnd) / 2);
  }

  // dibuja un conjunto tal cual, con parámetros de movimiento prestados
  _drawDirect(ctx, c, params, w, h, audioData, dt) {
    const orig = c.params;
    c.params = params;
    c.xf = this._transform(c, w, h, audioData, dt);
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, params.tOpacity));
    this._apply(ctx, c.xf);
    c.engine.draw(ctx, w, h, audioData, params, dt);
    ctx.restore();
    c.params = orig;
  }

  _drawSeq(ctx, w, h, audioData, dt, sched) {
    const st = this.seqStateAt(this._seqEffective(sched.total), sched.segs);
    if (!st) return;
    const pa = this._stopParams(st.a);
    if (!st.b) return this._drawDirect(ctx, st.a.c, pa, w, h, audioData, dt);
    const u = easeMorph(st.u, this.seq.ease);
    const pb = this._stopParams(st.b);
    if (st.a.c === st.b.c) {
      // el mismo conjunto en otro lugar: solo se mueve
      this._drawDirect(ctx, st.a.c, mixParams(pa, pb, u, "a"), w, h, audioData, dt);
    } else {
      this._drawMorph(ctx, w, h, audioData, dt, st.a.c, st.b.c, u, pa, pb);
    }
  }

  // ---------- transformación de un conjunto en otro ----------

  // un extremo de la transformación → un conjunto que se pueda dibujar (o null)
  _resolveEnd(key) {
    if (key?.startsWith("set:")) return this.conjuntos.find((c) => c.id === +key.slice(4)) ?? null;
    if (key?.startsWith("lib:")) {
      const name = key.slice(4);
      const p = getPreset(name);
      if (!p) return null;
      let hit = this._libCache.get(name);
      if (!hit || hit.savedAt !== p.savedAt) {
        hit = {
          savedAt: p.savedAt,
          c: {
            id: this._nextLibId--,
            name: p.name,
            visible: true,
            params: { ...createDefaultParams(), ...structuredClone(p.params) },
            keys: [],
            engine: new VisualEngine(),
            spinAngle: p.spin ?? 0,
            _lastT: null,
            xf: null,
          },
        };
        hit.c.engine.importState(p.state);
        this._libCache.set(name, hit);
      }
      return hit.c;
    }
    return null;
  }

  // los dos conjuntos de la transformación, o null si falta alguno
  morphEnds() {
    const a = this._resolveEnd(this.morph.a);
    const b = this._resolveEnd(this.morph.b);
    return a && b ? { a, b } : null;
  }

  // avance de la transformación, de 0 (todo A) a 1 (todo B)
  morphProgress() {
    return progressAt(this.morph.time, this.morph.seconds, this.morph.repeat);
  }

  // arranca la transformación desde el principio
  morphPlay() {
    Object.assign(this.morph, { on: true, time: 0, playing: true });
  }

  // ir a un punto de la transformación (0 a 1) y dejarla ahí
  morphSeek(u) {
    const m = this.morph;
    m.on = true;
    m.playing = false;
    m.time = Math.min(1, Math.max(0, u)) * m.seconds;
  }

  // Cada extremo se dibuja de verdad en un lienzo aparte, anotando sus formas.
  // Al principio se ve A tal cual y al final B tal cual; en el medio, cada forma
  // de A viaja hasta una de B (ver morphParticles.js). La transformación (posición,
  // rotación, escala, opacidad, giro) va pasando de la de A a la de B.
  _drawMorph(ctx, w, h, audioData, dt, A, B, u, pa = A.params, pb = B.params) {
    const EDGE = 0.1; // cuánto dura el pasaje de "A tal cual" a "formas en viaje"
    const smooth = (x) => x * x * (3 - 2 * x);
    const capA = this._caps.a, capB = this._caps.b;
    capA.begin(w, h);
    capB.begin(w, h);
    A.engine.draw(capA.ctx, w, h, audioData, A.params, dt);
    B.engine.draw(capB.ctx, w, h, audioData, B.params, dt);

    // la transformación de A se calcula con los parámetros de movimiento ya mezclados
    const mixed = mixParams(pa, pb, u, u < 0.5 ? "a" : "b");
    const origA = A.params;
    A.params = mixed;
    A.xf = this._transform(A, w, h, audioData, dt);
    A.params = origA;
    B.xf = A.xf;

    const alpha = Math.min(1, Math.max(0, mixed.tOpacity));
    const sA = smooth(Math.min(1, u / EDGE));
    const sB = smooth(Math.min(1, (1 - u) / EDGE));
    const m = capA.margin;

    ctx.save();
    this._apply(ctx, A.xf);
    if (sA < 1) {
      ctx.globalAlpha = alpha * (1 - sA);
      ctx.drawImage(capA.canvas, -m, -m);
    }
    if (sB < 1) {
      ctx.globalAlpha = alpha * (1 - sB);
      ctx.drawImage(capB.canvas, -capB.margin, -capB.margin);
    }
    const mid = Math.min(sA, sB);
    if (mid > 0.001) {
      ctx.globalAlpha = alpha * mid;
      ctx.globalCompositeOperation = mixed.shapeBlendMode;
      ctx.filter = mixed.glowAmount > 0 ? `blur(${mixed.glowAmount}px)` : "none";
      drawParticleMorph(ctx, capA.particles, capB.particles, u, this.morph);
    }
    ctx.restore();
  }

  // radio aproximado de un conjunto, para saber cuándo "se tocan" (goo).
  // Si el conjunto tiene un radio propio (params.gooRadius), se usa ese.
  _gooRadius(c, w, h) {
    const p = c.params;
    let r;
    if (p.gooRadius > 0) r = p.gooRadius;
    else if (p.visualMode === "grid") r = Math.min(w, h) * 0.35;
    else if (p.visualMode === "bars") r = Math.min(w, h) * 0.4;
    else r = p.baseRadius + p.shapeSize;
    return Math.max(8, r * Math.max(0.05, p.scale));
  }

  // las manijas que un motor anotó (ver visualEngine._drawMix), llevadas a la
  // pantalla con la transformación del conjunto
  _drawHandles(octx, c) {
    for (const hd of c.engine.handles) {
      const p = this._map(c.xf, hd);
      octx.beginPath();
      octx.arc(p.x, p.y, (hd.grabbed ? 11 : 8) * Math.min(1.5, Math.max(0.7, c.xf.s)), 0, TAU);
      octx.fillStyle = hd.color;
      octx.fill();
      octx.lineWidth = 2;
      octx.strokeStyle = `rgba(255,255,255,${hd.grabbed ? 1 : 0.7})`;
      octx.stroke();
    }
  }

  // ---------- gizmo: manijas para mover / rotar / escalar el conjunto seleccionado ----------
  //   cruz central        → mover (con Alt: mover el pivote sin que se mueva el dibujo)
  //   círculo con línea   → rotar
  //   cuadradito          → escalar

  _gizmoPoints() {
    const c = this.selected;
    if (!c?.visible || !c.xf) return null;
    const f = c.xf;
    // la cruz del centro va sobre el punto de pivote del dibujo (donde cae en pantalla)
    const { x: cx, y: cy } = this._map(f, { x: f.px, y: f.py });
    const rd = f.ang - Math.PI / 2;
    const sd = Math.min(500, Math.max(45, 70 * f.s));
    return {
      c,
      center: { x: cx, y: cy },
      rotate: { x: cx + Math.cos(rd) * ROT_HANDLE_DIST, y: cy + Math.sin(rd) * ROT_HANDLE_DIST },
      scale: { x: cx + Math.cos(f.ang) * sd, y: cy + Math.sin(f.ang) * sd },
    };
  }

  _gizmoHit(x, y) {
    const g = this._gizmoPoints();
    if (!g) return null;
    const near = (p) => Math.hypot(x - p.x, y - p.y) <= HANDLE_HIT;
    if (near(g.rotate)) return "rotate";
    if (near(g.scale)) return "scale";
    if (near(g.center)) return "move";
    return null;
  }

  _drawGizmo(ctx) {
    const g = this._gizmoPoints();
    if (!g) return;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.fillStyle = "rgba(255,255,255,0.85)";

    // línea hacia cada manija
    ctx.beginPath();
    ctx.moveTo(g.center.x, g.center.y);
    ctx.lineTo(g.rotate.x, g.rotate.y);
    ctx.moveTo(g.center.x, g.center.y);
    ctx.lineTo(g.scale.x, g.scale.y);
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // centro: cruz + aro
    ctx.beginPath();
    ctx.arc(g.center.x, g.center.y, 9, 0, TAU);
    ctx.moveTo(g.center.x - 15, g.center.y);
    ctx.lineTo(g.center.x + 15, g.center.y);
    ctx.moveTo(g.center.x, g.center.y - 15);
    ctx.lineTo(g.center.x, g.center.y + 15);
    ctx.stroke();

    // rotar: círculo
    ctx.beginPath();
    ctx.arc(g.rotate.x, g.rotate.y, 8, 0, TAU);
    ctx.fillStyle = "rgba(20,20,30,0.7)";
    ctx.fill();
    ctx.stroke();

    // escalar: cuadradito
    ctx.beginPath();
    ctx.rect(g.scale.x - 7, g.scale.y - 7, 14, 14);
    ctx.fill();
    ctx.stroke();

    ctx.font = "11px -apple-system, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText(`${g.c.name} · mover ✛ · rotar ○ · escalar □ · Alt: mover pivote`, g.center.x + 18, g.center.y + 32);
    ctx.restore();
  }

  _gizmoDown(x, y, altKey) {
    const kind = this._gizmoHit(x, y);
    if (!kind) return false;
    const g = this._gizmoPoints();
    const p = g.c.params;
    this.gdrag = {
      kind: kind === "move" && altKey ? "pivot" : kind,
      c: g.c,
      last: { x, y },
      startScale: p.scale,
      // distancia inicial al centro de giro (en modo "canvas" es un punto fijo del lienzo)
      startDist: Math.max(
        10,
        g.c.xf.mode === "canvas"
          ? Math.hypot(x - g.c.xf.px, y - g.c.xf.py)
          : Math.hypot(x - g.center.x, y - g.center.y)
      ),
    };
    return true;
  }

  _gizmoMove(x, y) {
    const d = this.gdrag;
    const f = d.c.xf;
    if (!f) return;
    const p = d.c.params;
    const canvasMode = f.mode === "canvas";
    // el centro de giro en pantalla: en modo "canvas" es un punto fijo del
    // lienzo (el dibujo orbita a su alrededor); en los otros, el pivote del dibujo
    const { x: cx, y: cy } = canvasMode ? { x: f.px, y: f.py } : this._map(f, { x: f.px, y: f.py });

    if (d.kind === "move") {
      let mx = x - d.last.x, my = y - d.last.y;
      if (canvasMode) {
        // el desplazamiento está "adentro" de la rotación: hay que deshacerla
        const cos = Math.cos(-f.ang), sin = Math.sin(-f.ang);
        [mx, my] = [(mx * cos - my * sin) / f.s, (mx * sin + my * cos) / f.s];
      }
      p.posX += mx;
      p.posY += my;
    } else if (d.kind === "rotate") {
      const a1 = Math.atan2(d.last.y - cy, d.last.x - cx);
      const a2 = Math.atan2(y - cy, x - cx);
      let da = a2 - a1;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      p.rotation += (da * 180) / Math.PI;
    } else if (d.kind === "scale") {
      p.scale = Math.min(20, Math.max(0.05, d.startScale * (Math.hypot(x - cx, y - cy) / d.startDist)));
    } else if (d.kind === "pivot") {
      // mover el pivote SIN que el dibujo se mueva: el pivote nuevo es el punto
      // del dibujo que está bajo el mouse, y se compensa la posición para que
      // todo quede donde estaba
      const P2 = this._toLocal(d.c, x, y);
      let T2x, T2y;
      if (canvasMode) {
        // acá el desplazamiento está adentro de la rotación: t2 = t − P + P2 + (R·S)⁻¹ (P − P2)
        const icos = Math.cos(-f.ang) / f.s, isin = Math.sin(-f.ang) / f.s;
        const vx = f.px - P2.x, vy = f.py - P2.y;
        T2x = f.tx - f.px + P2.x + (vx * icos - vy * isin);
        T2y = f.ty - f.py + P2.y + (vx * isin + vy * icos);
      } else {
        const cos = Math.cos(f.ang) * f.s, sin = Math.sin(f.ang) * f.s;
        const rx = P2.x - f.px, ry = P2.y - f.py; // pivote nuevo menos pivote viejo
        T2x = f.px + f.tx - P2.x + (rx * cos - ry * sin);
        T2y = f.py + f.ty - P2.y + (rx * sin + ry * cos);
      }
      // el movimiento continuo (órbita, deriva) no es parte de la posición fija
      const extraX = f.tx - p.posX, extraY = f.ty - p.posY;
      const W = f.px - p.pivotX, H = f.py - p.pivotY; // el centro de la pantalla
      p.pivotX = P2.x - W;
      p.pivotY = P2.y - H;
      p.posX = T2x - extraX;
      p.posY = T2y - extraY;
    }
    d.last = { x, y };
    this.onParamsChanged?.();
  }

  // ---------- mouse ----------
  // Primero el gizmo (si está prendido); después se recorren los conjuntos de
  // arriba hacia abajo: gana el que está más arriba. A cada motor se le pasa
  // el mouse ya "deshecho" de la transformación de su conjunto.

  pointerDown(x, y, altKey = false) {
    if (this.settings.gizmo && this._gizmoDown(x, y, altKey)) return true;
    for (let i = this.conjuntos.length - 1; i >= 0; i--) {
      const c = this.conjuntos[i];
      if (!c.visible) continue;
      const p = this._toLocal(c, x, y);
      if (c.engine.pointerDown(p.x, p.y)) {
        this.active = c;
        return true;
      }
    }
    return false;
  }

  pointerMove(x, y) {
    if (this.gdrag) {
      this._gizmoMove(x, y);
      return;
    }
    if (this.active) {
      const p = this._toLocal(this.active, x, y);
      this.active.engine.pointerMove(p.x, p.y);
    }
  }

  pointerUp() {
    this.gdrag = null;
    this.active?.engine.pointerUp();
    this.active = null;
  }

  get isDragging() {
    return !!this.active || !!this.gdrag;
  }

  hover(x, y) {
    if (this.settings.gizmo && this._gizmoHit(x, y)) return true;
    return this.conjuntos.some((c) => {
      if (!c.visible) return false;
      const p = this._toLocal(c, x, y);
      return c.engine.hover(p.x, p.y);
    });
  }

  // doble click: sobre algo agarrable, lo que haga ese conjunto (borrar un
  // círculo libre, o recentrar su pieza); sobre un lugar vacío, recentra todos
  doubleClick(x, y) {
    for (let i = this.conjuntos.length - 1; i >= 0; i--) {
      const c = this.conjuntos[i];
      if (!c.visible) continue;
      const p = this._toLocal(c, x, y);
      if (c.engine.hover(p.x, p.y)) {
        c.engine.doubleClick(p.x, p.y);
        c.params.freeCount = c.engine.freeCircles.length; // el slider baja con el círculo borrado
        return;
      }
    }
    for (const c of this.conjuntos) c.engine.resetPiece();
  }
}
