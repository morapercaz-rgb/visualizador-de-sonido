// Maneja los CONJUNTOS: varias piezas generativas independientes que se
// dibujan a la vez, una encima de otra. Cada conjunto tiene
//   - su propio objeto de parámetros (modo, cantidad, colores, estilo…)
//   - su propio VisualEngine (con su estado: círculos libres, luces del aura,
//     posición de la pieza, etc.)
// así que un conjunto puede ser un remolino, otro un aura de colores y otro un
// anillo, cada uno con su configuración, todos en pantalla al mismo tiempo.
//
// El orden de la lista es el orden de dibujo: el último queda arriba de todo.

import { VisualEngine } from "./visualEngine.js";
import { createDefaultParams } from "./controls.js";

export class Scene {
  constructor() {
    this.conjuntos = [];
    this.selectedId = null; // el que se está editando en el panel
    this._nextId = 1;
    this.active = null; // el conjunto cuyo elemento se está arrastrando con el mouse
    this.add();
  }

  get selected() {
    return this.conjuntos.find((c) => c.id === this.selectedId) ?? this.conjuntos[0];
  }

  // suma un conjunto nuevo (con valores iniciales) y lo deja seleccionado
  add() {
    const id = this._nextId++;
    const c = { id, name: `Conjunto ${id}`, visible: true, params: createDefaultParams(), engine: new VisualEngine() };
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
    c.engine.centerOffset = { x: src.engine.centerOffset.x + 60, y: src.engine.centerOffset.y + 40, vx: 0, vy: 0 };
    return c;
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

  // lo pasa al final de la lista, o sea: arriba de todos los demás
  bringToFront() {
    const c = this.selected;
    this.conjuntos = [...this.conjuntos.filter((x) => x !== c), c];
  }

  draw(ctx, w, h, audioData) {
    for (const c of this.conjuntos) {
      if (c.visible) c.engine.draw(ctx, w, h, audioData, c.params);
    }
  }

  // ---------- mouse ----------
  // Se recorre de arriba hacia abajo: gana el conjunto que está más arriba.

  pointerDown(x, y) {
    for (let i = this.conjuntos.length - 1; i >= 0; i--) {
      const c = this.conjuntos[i];
      if (c.visible && c.engine.pointerDown(x, y)) {
        this.active = c;
        return true;
      }
    }
    return false;
  }

  pointerMove(x, y) {
    this.active?.engine.pointerMove(x, y);
  }

  pointerUp() {
    this.active?.engine.pointerUp();
    this.active = null;
  }

  get isDragging() {
    return !!this.active;
  }

  hover(x, y) {
    return this.conjuntos.some((c) => c.visible && c.engine.hover(x, y));
  }

  // doble click: sobre algo agarrable, lo que haga ese conjunto (borrar un
  // círculo libre, o recentrar su pieza); sobre un lugar vacío, recentra todos
  doubleClick(x, y) {
    for (let i = this.conjuntos.length - 1; i >= 0; i--) {
      const c = this.conjuntos[i];
      if (c.visible && c.engine.hover(x, y)) {
        c.engine.doubleClick(x, y);
        c.params.freeCount = c.engine.freeCircles.length; // el slider baja con el círculo borrado
        return;
      }
    }
    for (const c of this.conjuntos) c.engine.resetPiece();
  }
}
