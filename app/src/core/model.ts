// Parametric pattern model: measurements (X), formulas (Z) and construction steps.
// Every step stores expressions, not numbers, so changing a measurement rebuilds
// the whole pattern - the same principle as GRAFIS.

import { evaluate, FormulaError } from "./formula";
import {
  crossings,
  directionAt,
  dist,
  mirrorPt,
  pointAlong,
  polyLen,
  subPolyline,
  type Pt,
} from "./geometry";

export interface Measurement {
  id: number; // X<id>
  name: string;
  value: number;
}

export interface Variable {
  id: number; // Z<id>
  name: string;
  expr: string;
}

/** A point object, or an end of a line. */
export interface PointRef {
  obj: number;
  end?: "start" | "end";
}

export type Step =
  | { op: "point"; id: number; x: string; y: string }
  | { op: "pointOn"; id: number; on: number; dist: string; unit: "mm" | "%"; from: "start" | "end" }
  | { op: "intersect"; id: number; a: number; b: number; near: Pt }
  | { op: "pointMove"; id: number; from: PointRef; along: number; dist: string }
  | { op: "line"; id: number; p1: PointRef; p2: PointRef }
  | { op: "lineAngle"; id: number; start: PointRef; angle: string; length: string }
  | { op: "parallel"; id: number; of: number; dist: string; side: 1 | -1 }
  | { op: "setLength"; target: number; length: string }
  | { op: "trim"; target: number; end: "start" | "end"; to: number }
  | { op: "mirror"; axis: number; items: { src: number; dst?: number }[] };

export interface Model {
  version: 1;
  name: string;
  measurements: Measurement[];
  variables: Variable[];
  steps: Step[];
  nextId: number;
  names: Record<number, string>; // object display names (P1, L3, ...)
}

export interface GObj {
  id: number;
  kind: "point" | "line";
  pts: Pt[];
  name: string;
  step: number; // index of the step that last changed it
}

export interface EvalResult {
  objects: Map<number, GObj>;
  stepErrors: Map<number, string>;
  z: Map<number, number>;
  zErrors: Map<number, string>;
}

export function emptyModel(name = "باترون جديد"): Model {
  return { version: 1, name, measurements: [], variables: [], steps: [], nextId: 1, names: {} };
}

// ------------------------------------------------------------------ variables
export class Vars {
  readonly x = new Map<number, number>();
  readonly z = new Map<number, number>();
  readonly zErrors = new Map<number, string>();
  private zExpr = new Map<number, string>();
  private active = new Set<number>();

  constructor(model: Model) {
    for (const m of model.measurements) this.x.set(m.id, m.value);
    for (const v of model.variables) this.zExpr.set(v.id, v.expr);
    for (const id of this.zExpr.keys()) {
      try {
        this.zval(id);
      } catch (e) {
        if (!this.zErrors.has(id)) this.zErrors.set(id, (e as Error).message);
      }
    }
  }

  private lookup = (kind: "X" | "Z", n: number): number => {
    if (kind === "X") {
      const v = this.x.get(n);
      if (v === undefined) throw new FormulaError(`القياس X${n} غير موجود`);
      return v;
    }
    return this.zval(n);
  };

  zval(n: number): number {
    const cached = this.z.get(n);
    if (cached !== undefined) return cached;
    const err = this.zErrors.get(n);
    if (err) throw new FormulaError(`Z${n}: ${err}`);
    const src = this.zExpr.get(n);
    if (src === undefined) throw new FormulaError(`المتغير Z${n} غير موجود`);
    if (this.active.has(n)) throw new FormulaError(`Z${n} يعتمد على نفسه`);
    this.active.add(n);
    try {
      const v = evaluate(src, this.lookup);
      this.z.set(n, v);
      return v;
    } catch (e) {
      this.zErrors.set(n, (e as Error).message);
      throw e;
    } finally {
      this.active.delete(n);
    }
  }

  /** Value of an expression typed in a step ("Z6", "50", "X3/2+10"). */
  eval(src: string): number {
    return evaluate(src, this.lookup);
  }
}

// ------------------------------------------------------------------ evaluation
export function evaluateModel(model: Model): EvalResult {
  const vars = new Vars(model);
  const objects = new Map<number, GObj>();
  const stepErrors = new Map<number, string>();

  const need = (id: number): GObj => {
    const o = objects.get(id);
    if (!o) throw new Error(`العنصر ${model.names[id] ?? id} غير متوفر`);
    return o;
  };
  const needLine = (id: number): GObj => {
    const o = need(id);
    if (o.kind !== "line") throw new Error(`${o.name} ليس خطاً`);
    return o;
  };
  const pointOf = (r: PointRef): Pt => {
    const o = need(r.obj);
    if (o.kind === "point" || !r.end) return o.pts[0];
    return r.end === "end" ? o.pts[o.pts.length - 1] : o.pts[0];
  };
  const put = (id: number, kind: GObj["kind"], pts: Pt[], step: number) => {
    for (const p of pts) if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) throw new Error("نتيجة غير صالحة");
    objects.set(id, { id, kind, pts, name: model.names[id] ?? `#${id}`, step });
  };

  model.steps.forEach((s, i) => {
    try {
      switch (s.op) {
        case "point":
          put(s.id, "point", [[vars.eval(s.x), vars.eval(s.y)]], i);
          break;
        case "pointOn": {
          const pts = needLine(s.on).pts;
          let d = vars.eval(s.dist);
          if (s.unit === "%") d = (polyLen(pts) * d) / 100;
          put(s.id, "point", [pointAlong(pts, d, s.from === "end")], i);
          break;
        }
        case "intersect": {
          const hits = crossings(needLine(s.a).pts, needLine(s.b).pts);
          if (!hits.length) throw new Error("الخطان لا يتقاطعان");
          hits.sort((h, k) => dist(h.pt, s.near) - dist(k.pt, s.near));
          put(s.id, "point", [hits[0].pt], i);
          break;
        }
        case "pointMove": {
          const p = pointOf(s.from);
          const [ux, uy] = directionAt(needLine(s.along).pts, 0);
          const d = vars.eval(s.dist);
          put(s.id, "point", [[p[0] + ux * d, p[1] + uy * d]], i);
          break;
        }
        case "line":
          put(s.id, "line", [pointOf(s.p1), pointOf(s.p2)], i);
          break;
        case "lineAngle": {
          const a = pointOf(s.start);
          const ang = (vars.eval(s.angle) * Math.PI) / 180;
          const L = vars.eval(s.length);
          put(s.id, "line", [a, [a[0] + L * Math.cos(ang), a[1] + L * Math.sin(ang)]], i);
          break;
        }
        case "parallel": {
          const pts = needLine(s.of).pts;
          const a = pts[0];
          const b = pts[pts.length - 1];
          const L = dist(a, b) || 1;
          // left normal of the direction start -> end; side 1 = left, -1 = right
          const k = s.side * vars.eval(s.dist);
          const nx = (-(b[1] - a[1]) / L) * k;
          const ny = ((b[0] - a[0]) / L) * k;
          put(s.id, "line", pts.map((p) => [p[0] + nx, p[1] + ny] as Pt), i);
          break;
        }
        case "setLength": {
          const o = needLine(s.target);
          put(o.id, "line", [o.pts[0], pointAlong(o.pts, vars.eval(s.length))], i);
          break;
        }
        case "trim": {
          const o = needLine(s.target);
          const L = polyLen(o.pts);
          const cands = crossings(o.pts, need(s.to).pts).map((c) => c.s);
          if (!cands.length) throw new Error("الخط لا يلتقي بالحد");
          const pick = (target: number) => cands.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
          const pts = s.end === "end" ? subPolyline(o.pts, 0, pick(L)) : subPolyline(o.pts, pick(0), L);
          put(o.id, "line", pts, i);
          break;
        }
        case "mirror": {
          const ax = needLine(s.axis).pts;
          const origin = ax[0];
          const d: Pt = [ax[ax.length - 1][0] - origin[0], ax[ax.length - 1][1] - origin[1]];
          for (const it of s.items) {
            const o = need(it.src);
            put(it.dst ?? o.id, o.kind, o.pts.map((p) => mirrorPt(p, origin, d)), i);
          }
          break;
        }
      }
    } catch (e) {
      stepErrors.set(i, (e as Error).message);
    }
  });
  return { objects, stepErrors, z: vars.z, zErrors: vars.zErrors };
}

// ------------------------------------------------------------------ helpers
/** Ids an existing step creates (not the ones it only changes). */
export function createdIds(s: Step): number[] {
  switch (s.op) {
    case "setLength":
    case "trim":
      return [];
    case "mirror":
      return s.items.filter((it) => it.dst !== undefined).map((it) => it.dst as number);
    default:
      return [s.id];
  }
}

/** Ids a step reads. */
export function usedIds(s: Step): number[] {
  switch (s.op) {
    case "point":
      return [];
    case "pointOn":
      return [s.on];
    case "intersect":
      return [s.a, s.b];
    case "pointMove":
      return [s.from.obj, s.along];
    case "line":
      return [s.p1.obj, s.p2.obj];
    case "lineAngle":
      return [s.start.obj];
    case "parallel":
      return [s.of];
    case "setLength":
      return [s.target];
    case "trim":
      return [s.target, s.to];
    case "mirror":
      return [s.axis, ...s.items.map((it) => it.src)];
  }
}

export function newId(model: Model, kind: "point" | "line"): number {
  const id = model.nextId++;
  const prefix = kind === "point" ? "P" : "L";
  let n = 1;
  const taken = new Set(Object.values(model.names));
  while (taken.has(`${prefix}${n}`)) n++;
  model.names[id] = `${prefix}${n}`;
  return id;
}

/** Which end of a line is nearer to x. */
export function nearerEnd(o: GObj, x: Pt): "start" | "end" {
  return dist(o.pts[0], x) <= dist(o.pts[o.pts.length - 1], x) ? "start" : "end";
}

/** Side (1 left / -1 right of start->end) of point x relative to line o. */
export function sideOf(o: GObj, x: Pt): 1 | -1 {
  const a = o.pts[0];
  const b = o.pts[o.pts.length - 1];
  return (b[0] - a[0]) * (x[1] - a[1]) - (b[1] - a[1]) * (x[0] - a[0]) >= 0 ? 1 : -1;
}
