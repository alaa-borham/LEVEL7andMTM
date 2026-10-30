// Parametric pattern model: measurements (X), formulas (Z) and construction steps.
// Every step stores expressions, not numbers, so changing a measurement rebuilds
// the whole pattern - the same principle as GRAFIS.

import { evaluate, FormulaError } from "./formula";
import {
  crossings,
  directionAt,
  dist,
  mirrorPt,
  offsetPolyline,
  pointAlong,
  polyLen,
  smoothCurve,
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
  expr: string; // formula; unused when measure is set
  measure?: Measure;
}

/** Value taken from the drawing: distance between two points, or length of a line/curve. */
export type Measure = { type: "dist"; a: PointRef; b: PointRef } | { type: "length"; obj: number };

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
  | { op: "mirror"; axis: number; items: { src: number; dst?: number }[] }
  | { op: "curve"; id: number; through: PointRef[]; startAngle: string; endAngle: string };

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
/** A measured variable whose objects do not exist yet at this point of the construction. */
class NotReady extends FormulaError {}

export type MeasureFn = (m: Measure) => number | null;

export class Vars {
  readonly x = new Map<number, number>();
  readonly z = new Map<number, number>();
  readonly zErrors = new Map<number, string>();
  private defs = new Map<number, Variable>();
  private active = new Set<number>();

  /**
   * measure: takes a measurement in the drawing, or null while its objects are
   * missing. seed: values already known (e.g. from a full evaluation).
   */
  constructor(
    model: Model,
    private measure?: MeasureFn,
    seed?: Map<number, number>,
  ) {
    for (const m of model.measurements) this.x.set(m.id, m.value);
    for (const v of model.variables) this.defs.set(v.id, v);
    if (seed) for (const [k, v] of seed) this.z.set(k, v);
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
    const def = this.defs.get(n);
    if (def === undefined) throw new FormulaError(`المتغير Z${n} غير موجود`);
    if (def.measure) {
      const v = this.measure?.(def.measure) ?? null;
      if (v === null) throw new NotReady(`Z${n} يُقاس من الرسم، وعناصره غير مرسومة بعد`);
      this.z.set(n, v);
      return v;
    }
    if (this.active.has(n)) throw new FormulaError(`Z${n} يعتمد على نفسه`);
    this.active.add(n);
    try {
      const v = evaluate(def.expr, this.lookup);
      this.z.set(n, v);
      return v;
    } catch (e) {
      if (!(e instanceof NotReady)) this.zErrors.set(n, (e as Error).message);
      throw e;
    } finally {
      this.active.delete(n);
    }
  }

  /**
   * Take every measurement whose objects exist now. Like GRAFIS, a measured
   * value is fixed at the moment its objects are first available.
   */
  measureReady(): void {
    for (const [n, def] of this.defs) {
      if (!def.measure || this.z.has(n)) continue;
      const v = this.measure?.(def.measure) ?? null;
      if (v !== null) this.z.set(n, v);
    }
  }

  /** Evaluate everything left (for display) and record what failed. */
  finish(): void {
    for (const id of this.defs.keys()) {
      try {
        this.zval(id);
      } catch (e) {
        if (!this.zErrors.has(id)) this.zErrors.set(id, (e as Error).message);
      }
    }
  }

  /** Value of an expression typed in a step ("Z6", "50", "X3/2+10"). */
  eval(src: string): number {
    return evaluate(src, this.lookup);
  }
}

// ------------------------------------------------------------------ evaluation
export function evaluateModel(model: Model): EvalResult {
  const objects = new Map<number, GObj>();
  const stepErrors = new Map<number, string>();
  const refPoint = (r: PointRef): Pt | null => {
    const o = objects.get(r.obj);
    if (!o) return null;
    if (o.kind === "point" || !r.end) return o.pts[0];
    return r.end === "end" ? o.pts[o.pts.length - 1] : o.pts[0];
  };
  const vars = new Vars(model, (m) => {
    if (m.type === "length") {
      const o = objects.get(m.obj);
      return o && o.kind === "line" ? polyLen(o.pts) : null;
    }
    const a = refPoint(m.a);
    const b = refPoint(m.b);
    return a && b ? dist(a, b) : null;
  });
  vars.measureReady();

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
          // side 1 = left of the direction start -> end, -1 = right
          put(s.id, "line", offsetPolyline(needLine(s.of).pts, s.side * vars.eval(s.dist)), i);
          break;
        }
        case "setLength": {
          const o = needLine(s.target);
          put(o.id, "line", subPolyline(o.pts, 0, vars.eval(s.length)), i);
          break;
        }
        case "curve": {
          if (s.through.length < 2) throw new Error("المنحنى يحتاج نقطتين على الأقل");
          const dir = (a: string): Pt | null => {
            if (!a.trim()) return null;
            const r = (vars.eval(a) * Math.PI) / 180;
            return [Math.cos(r), Math.sin(r)];
          };
          put(s.id, "line", smoothCurve(s.through.map(pointOf), dir(s.startAngle), dir(s.endAngle)), i);
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
    vars.measureReady();
  });
  vars.finish();
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
    case "curve":
      return s.through.map((r) => r.obj);
  }
}

export function newId(model: Model, kind: "point" | "line" | "curve"): number {
  const id = model.nextId++;
  const prefix = kind === "point" ? "P" : kind === "curve" ? "C" : "L";
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
