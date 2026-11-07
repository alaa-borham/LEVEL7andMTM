// Parametric pattern model: measurements (X), formulas (Z) and construction steps.
// Every step stores expressions, not numbers, so changing a measurement rebuilds
// the whole pattern - the same principle as GRAFIS.

import { evaluate, FormulaError } from "./formula";
import { buildPiece, type Piece, type PieceGeo } from "./piece";
import {
  crossings,
  closestOnPolyline,
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
  code?: string; // name of this measurement in the MTM system (for imports)
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
  /** A point at a fixed offset (dx, dy) from another point; stays linked to it. */
  | { op: "pointOffset"; id: number; from: PointRef; dx: string; dy: string }
  /** Dimension (annotation only, creates no geometry): aligned / horizontal / vertical
   * distance between a and b, length of obj, or angle a-b-c; offset places the line. */
  | { op: "dim"; kind: "aligned" | "h" | "v" | "length" | "angle" | "sum"; a?: PointRef; b?: PointRef; c?: PointRef; obj?: number; objs?: number[]; offset: string; text?: string; flip?: string;
      /** Shown value: text size (px), unit (mm / cm / in; default = the drawing's), multiplied (×2, ×4 …). */
      size?: string; unit?: "mm" | "cm" | "in"; mult?: string }
  | { op: "line"; id: number; p1: PointRef; p2: PointRef }
  | { op: "lineAngle"; id: number; start: PointRef; angle: string; length: string }
  | { op: "parallel"; id: number; of: number; dist: string; side: 1 | -1 }
  /** Parallels of several lines / curves at one distance; each on the side it was clicked. */
  | { op: "parallels"; ids: number[]; of: number[]; sides: (1 | -1)[]; dist: string }
  | { op: "setLength"; target: number; length: string }
  | { op: "trim"; target: number; end: "start" | "end"; to: number }
  /** Mirror about a line (axis), the line through two points (axisPts), or the line
   * through a point at an angle (axisAt + axisAngle). dst set = copy, else move. */
  | { op: "mirror"; axis?: number; axisPts?: [PointRef, PointRef]; axisAt?: PointRef; axisAngle?: string; items: { src: number; dst?: number }[] }
  /** Marks (annotation only): stitch lines along a line / curve on one side at a distance,
   * a grain line between two points, or a symbol (button, drill hole, cross) at a point. */
  | { op: "mark"; kind: "lock" | "double" | "zigzag" | "deco" | "gather" | "grain" | "button" | "drill" | "cross"; obj?: number; side?: 1 | -1; a?: PointRef; b?: PointRef; size: string;
      /** Grain line (as GRAFIS): from a, in this direction (°), size = its length; without b. */
      angle?: string }
  /** Fixed geometry (imported, e.g. from a GRAFIS part): a point or a line / curve. */
  | { op: "fixed"; id: number; kind: "point" | "line"; pts: [number, number][] }
  /** A text on the drawing at a point; {X1} / {Z3} in it show the current values. */
  | { op: "text"; at: PointRef; text: string; size: string; angle: string }
  /** Objects inherited from an earlier part (linked: they follow the source part). */
  | { op: "inherit"; part: number; items: { src: number; dst: number }[] }
  /** Scale about a centre by factor %; with angle: only along that direction (stretch). */
  | { op: "scale"; center: PointRef; factor: string; angle?: string; items: { src: number; dst?: number }[] }
  | {
      op: "curve"; id: number; through: PointRef[]; startAngle: string; endAngle: string; startTension?: string; endTension?: string;
      /** 0.9.189: direction (°) set at an inner point, same order as through ("" or missing = free) */
      pointAngles?: string[];
      /** The end's angle is measured from this line, where the curve meets it (e.g. 90 = square to the line). */
      startRel?: number; endRel?: number;
    }
  /** Corner of two lines, each taken at the end nearer the corner: "sharp" extends or trims
   * both to their intersection; "round" adds a tangent arc of radius `size`; "chamfer" cuts
   * the corner with a straight line `size` from the intersection on each line. */
  | { op: "corner"; kind: "sharp" | "round" | "chamfer"; id?: number; a: number; endA: "start" | "end"; b: number; endB: "start" | "end"; size: string };

export type LineDash = "solid" | "dashed" | "dotted" | "long" | "shortlong" | "dashdot";
/** Screen dash patterns (px) of the line types. */
export const LINE_DASHES: Record<LineDash, string> = { solid: "", dashed: "8 5", dotted: "1.5 4", long: "16 6", shortlong: "16 4 4 4", dashdot: "10 4 1.5 4" };

export interface Model {
  version: 1;
  name: string;
  measurements: Measurement[];
  variables: Variable[];
  steps: Step[];
  pieces?: Piece[];
  size?: string; // name of the base size (the values in measurements)
  sizes?: Size[]; // further sizes or customers
  grading?: Record<number, number>; // grading step per X id, used to fill the size table
  activeSize?: number; // index in sizes, or -1 / undefined for the base size
  baseOff?: boolean; // the base size is switched off (not in the marker / all-size exports)
  /** The library table this design's X table was copied from (edits stay in the file). */
  mlibFrom?: { id: string; name: string };
  nextId: number;
  names: Record<number, string>; // object display names (P1, L3, ...)
  unit?: "mm" | "in"; // how dimensions show their values (geometry is always mm)
  /** Parts of the design (as GRAFIS). The active part's construction lives in steps /
   * names / nextId / pieces; parts[activePart] holds it again whenever it is synced. */
  parts?: Part[];
  activePart?: number;
  /** How a line looks on the drawing (as GRAFIS line types and colours), per "part no:object id". */
  lineStyles?: Record<string, { dash?: LineDash; color?: string }>;
  /** Background pictures to trace over (pixel images): placed in mm, bottom-left at x, y. */
  images?: { id: number; name: string; data: string; x: number; y: number; w: number; h: number; opacity: number; visible: boolean; screen?: boolean }[]; // screen: fixed as the whole-screen background
  /** Product info (as GRAFIS): texts, and images as data URLs (logo, sketches, fabric). */
  product?: Record<string, string>;
}

/** A size (or a customer for made-to-measure): values that replace the base measurements. */
export interface Part {
  no: number;
  name: string;
  steps: Step[];
  names: Record<number, string>;
  nextId: number;
  pieces?: Piece[];
  production?: boolean; // production part (cut) or draft part (construction only)
  fabric?: string;
  amount?: number; // pieces per garment, normal
  mirrored?: number; // pieces per garment, mirrored
  category?: string;
  edited?: string; // last edit, ISO time
  visible?: boolean; // shown faded behind the active part
}

export interface Size {
  name: string;
  kind?: "size" | "customer"; // customers (made to measure) are not graded
  step: number; // grading steps from the base size (-2, -1, 1, 2 ...)
  values: Record<number, number>; // X id -> value; missing = base value
  /** Switched off: left out of the marker and the exports of all sizes until switched on again. */
  off?: boolean;
}

/** Whether size i (-1 = base) is active (goes to the marker and the all-size exports). */
export function sizeActive(m: Model, i: number): boolean {
  return i < 0 ? !m.baseOff : !m.sizes?.[i]?.off;
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
  pieces: Map<number, PieceGeo>;
  pieceErrors: Map<number, string>;
  z: Map<number, number>;
  zErrors: Map<number, string>;
}

/** The model with the measurements of size i (-1 = base). */
export function withSize(model: Model, i = model.activeSize ?? -1): Model {
  const sz = model.sizes?.[i];
  if (!sz) return model;
  return { ...model, measurements: model.measurements.map((m) => ({ ...m, value: sz.values[m.id] ?? m.value })) };
}

export function sizeName(model: Model, i: number): string {
  return i < 0 ? model.size || "الأساسي" : model.sizes?.[i]?.name ?? "";
}

/** Fill every size column from the grading steps: base + step × grading. */
export function fillGrading(model: Model): void {
  for (const sz of model.sizes ?? []) {
    if (sz.kind === "customer") continue;
    for (const m of model.measurements) {
      const g = model.grading?.[m.id];
      if (g) sz.values[m.id] = Math.round((m.value + sz.step * g) * 100) / 100;
    }
  }
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
/** Evaluate another part of the same design (for inheritance): same X / Z and sizes. */
function evaluatePart(model: Model, partNo: number, depth: number): EvalResult | null {
  const k = model.parts?.findIndex((p) => p.no === partNo) ?? -1;
  const p = k >= 0 ? model.parts![k] : undefined;
  if (!p || depth > 20) return null;
  return evaluateModel({ ...model, steps: p.steps, names: p.names, nextId: p.nextId, pieces: [], activePart: k }, depth + 1);
}

export function evaluateModel(model: Model, depth = 0): EvalResult {
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
        case "dim": {
          for (const r of [s.a, s.b, s.c]) if (r) pointOf(r);
          if (s.obj !== undefined) needLine(s.obj);
          for (const o of s.objs ?? []) needLine(o);
          vars.eval(s.offset || "0");
          break;
        }
        case "pointOffset": {
          const p = pointOf(s.from);
          put(s.id, "point", [[p[0] + vars.eval(s.dx), p[1] + vars.eval(s.dy)]], i);
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
        case "fixed":
          if (!s.pts.length || (s.kind === "line" && s.pts.length < 2)) throw new Error("عنصر مستورد بلا نقاط");
          put(s.id, s.kind, s.pts.map(([x, y]) => [x, y] as Pt), i);
          break;
        case "text":
          pointOf(s.at);
          vars.eval(s.size || "5");
          vars.eval(s.angle || "0");
          break;
        case "mark": {
          if (s.obj !== undefined) needLine(s.obj);
          for (const r of [s.a, s.b]) if (r) pointOf(r);
          vars.eval(s.size || "0");
          if (s.angle !== undefined) vars.eval(s.angle);
          break;
        }
        case "inherit": {
          const me = model.parts?.[model.activePart ?? 0]?.no ?? Infinity;
          if (!(s.part < me)) throw new Error("الوراثة من بارت سابق فقط");
          const src = evaluatePart(model, s.part, depth);
          if (!src) throw new Error(`البارت ${s.part} غير موجود`);
          for (const it of s.items) {
            const o = src.objects.get(it.src);
            if (!o) throw new Error(`العنصر ${it.src} غير موجود في البارت ${s.part}`);
            put(it.dst, o.kind, o.pts.map((q) => [q[0], q[1]] as Pt), i);
          }
          break;
        }
        case "scale": {
          const C = pointOf(s.center), k = vars.eval(s.factor) / 100;
          if (!(k > 0)) throw new Error("نسبة التكبير يجب أن تكون أكبر من صفر");
          const dir = s.angle !== undefined && s.angle.trim() !== "" ? ((a) => [Math.cos(a), Math.sin(a)] as Pt)((vars.eval(s.angle) * Math.PI) / 180) : null;
          const tf = (p: Pt): Pt => {
            const v: Pt = [p[0] - C[0], p[1] - C[1]];
            if (!dir) return [C[0] + v[0] * k, C[1] + v[1] * k];
            const t = (v[0] * dir[0] + v[1] * dir[1]) * (k - 1); // stretch only along the direction
            return [p[0] + dir[0] * t, p[1] + dir[1] * t];
          };
          for (const it of s.items) {
            const o = need(it.src);
            put(it.dst ?? o.id, o.kind, o.pts.map(tf), i);
          }
          break;
        }
        case "parallels": {
          const d = vars.eval(s.dist);
          s.of.forEach((src, k) => put(s.ids[k], "line", offsetPolyline(needLine(src).pts, (s.sides[k] ?? 1) * d), i));
          break;
        }
        case "setLength": {
          const o = needLine(s.target);
          put(o.id, "line", subPolyline(o.pts, 0, vars.eval(s.length)), i);
          break;
        }
        case "curve": {
          if (s.through.length < 2) throw new Error("المنحنى يحتاج نقطتين على الأقل");
          const pts = s.through.map(pointOf);
          const dir = (a: string, rel: number | undefined, at: Pt): Pt | null => {
            if (!a.trim()) return null;
            let r = (vars.eval(a) * Math.PI) / 180;
            if (rel !== undefined) {
              // relative to the line where the curve end meets it
              const L = needLine(rel), d = directionAt(L.pts, closestOnPolyline(L.pts, at).s);
              r += Math.atan2(d[1], d[0]);
            }
            return [Math.cos(r), Math.sin(r)];
          };
          const ten = (t?: string) => {
            if (!t || !t.trim()) return 1;
            const v = vars.eval(t) / 100;
            if (!(v > 0 && v <= 10)) throw new Error("شدة طرف المنحنى بين 1% و 1000%");
            return v;
          };
          const inner = pts.map((at, k) => (k > 0 && k < pts.length - 1 && s.pointAngles?.[k]?.trim() ? dir(s.pointAngles[k], undefined, at) : null));
          put(s.id, "line", smoothCurve(pts, dir(s.startAngle, s.startRel, pts[0]), dir(s.endAngle, s.endRel, pts[pts.length - 1]), 24, ten(s.startTension), ten(s.endTension), inner), i);
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
        case "corner": {
          if (s.a === s.b) throw new Error("الزاوية تحتاج خطين مختلفين");
          let A = needLine(s.a), B = needLine(s.b);
          const seg = (o: GObj, end: "start" | "end") => {
            const n = o.pts.length;
            const P = end === "end" ? o.pts[n - 1] : o.pts[0], Q = end === "end" ? o.pts[n - 2] : o.pts[1];
            const L = Math.hypot(P[0] - Q[0], P[1] - Q[1]);
            if (!(L > 1e-9)) throw new Error(`طرف ${o.name} قصير جداً`);
            return { Q, d: [(P[0] - Q[0]) / L, (P[1] - Q[1]) / L] as Pt };
          };
          let sa = seg(A, s.endA), sb = seg(B, s.endB);
          let den = sa.d[0] * sb.d[1] - sa.d[1] * sb.d[0];
          let X: Pt = [NaN, NaN];
          const meet = () => {
            const t = ((sb.Q[0] - sa.Q[0]) * sb.d[1] - (sb.Q[1] - sa.Q[1]) * sb.d[0]) / den;
            X = [sa.Q[0] + t * sa.d[0], sa.Q[1] + t * sa.d[1]];
          };
          const reach = (sg: typeof sa) => (X[0] - sg.Q[0]) * sg.d[0] + (X[1] - sg.Q[1]) * sg.d[1];
          if (Math.abs(den) >= 1e-9) meet();
          if (!(Math.abs(den) >= 1e-9 && reach(sa) > 1e-6 && reach(sb) > 1e-6)) {
            // the corner is not ahead of both ends: one line (or both) runs past the other. Take the meeting
            // point of the two lines (their ends extended, as GRAFIS) nearest the chosen ends, and cut back or
            // extend each one to it on its chosen side
            const endPt = (o: GObj, e: "start" | "end") => (e === "end" ? o.pts[o.pts.length - 1] : o.pts[0]);
            const La = polyLen(A.pts), Lb = polyLen(B.pts);
            const keeps = (L: number, e: "start" | "end", at: number) => (e === "end" ? at > 1e-6 : at < L - 1e-6); // the far end stays
            const cands = crossings(A.pts, B.pts).filter((c) => keeps(La, s.endA, c.s));
            let best: { pt: Pt; sa: number; sb: number; d: number } | null = null;
            for (const c of cands) {
              const cb = crossings(B.pts, A.pts).reduce((x, y) => (dist(y.pt, c.pt) < dist(x.pt, c.pt) ? y : x));
              if (dist(cb.pt, c.pt) > 1e-6 || !keeps(Lb, s.endB, cb.s)) continue;
              const d = dist(c.pt, endPt(A, s.endA)) + dist(c.pt, endPt(B, s.endB));
              if (!best || d < best.d) best = { pt: c.pt, sa: c.s, sb: cb.s, d };
            }
            if (!best) throw new Error(Math.abs(den) < 1e-9 ? "الخطان متوازيان، لا توجد زاوية" : "الخطان لا يلتقيان من الطرفين المختارين؛ انقر كل خط قرب طرفه الذي عند الزاوية");
            const to = (o: GObj, e: "start" | "end", at: number, L: number, P: Pt): GObj => ({
              ...o,
              pts: e === "end" ? (at >= L ? [...o.pts, P] : [...subPolyline(o.pts, 0, at).slice(0, -1), P]) : at <= 0 ? [P, ...o.pts] : [P, ...subPolyline(o.pts, at, L).slice(1)],
            });
            A = to(A, s.endA, best.sa, La, best.pt);
            B = to(B, s.endB, best.sb, Lb, best.pt);
            sa = seg(A, s.endA);
            sb = seg(B, s.endB);
            den = sa.d[0] * sb.d[1] - sa.d[1] * sb.d[0];
            X = best.pt;
          }
          const setEnd = (o: GObj, end: "start" | "end", p: Pt) => {
            const pts = o.pts.slice();
            pts[end === "end" ? pts.length - 1 : 0] = p;
            put(o.id, "line", pts, i);
          };
          const ua: Pt = [-sa.d[0], -sa.d[1]], ub: Pt = [-sb.d[0], -sb.d[1]]; // from the corner into each line
          if (s.kind === "sharp") {
            setEnd(A, s.endA, X);
            setEnd(B, s.endB, X);
            break;
          }
          const size = vars.eval(s.size);
          if (!(size > 0)) throw new Error("المقدار يجب أن يكون أكبر من صفر");
          const theta = Math.acos(Math.max(-1, Math.min(1, ua[0] * ub[0] + ua[1] * ub[1])));
          if (theta > Math.PI - 1e-6) throw new Error("الخطان على استقامة واحدة");
          const back = s.kind === "round" ? size / Math.tan(theta / 2) : size;
          if (back >= reach(sa) || back >= reach(sb)) throw new Error(s.kind === "round" ? "نصف القطر أكبر من طول الخطين" : "مسافة القطع أكبر من طول الخطين");
          const Ta: Pt = [X[0] + ua[0] * back, X[1] + ua[1] * back], Tb: Pt = [X[0] + ub[0] * back, X[1] + ub[1] * back];
          setEnd(A, s.endA, Ta);
          setEnd(B, s.endB, Tb);
          if (s.id === undefined) throw new Error("خطوة زاوية بلا عنصر ناتج");
          if (s.kind === "chamfer") {
            put(s.id, "line", [Ta, Tb], i);
          } else {
            const bis: Pt = [ua[0] + ub[0], ua[1] + ub[1]], bl = Math.hypot(bis[0], bis[1]);
            const h = size / Math.sin(theta / 2);
            const C: Pt = [X[0] + (bis[0] / bl) * h, X[1] + (bis[1] / bl) * h];
            const a0 = Math.atan2(Ta[1] - C[1], Ta[0] - C[0]);
            let sweep = Math.atan2(Tb[1] - C[1], Tb[0] - C[0]) - a0;
            while (sweep > Math.PI) sweep -= 2 * Math.PI;
            while (sweep < -Math.PI) sweep += 2 * Math.PI;
            const n = Math.max(6, Math.ceil(Math.abs(sweep) / (Math.PI / 36)));
            const arc: Pt[] = [];
            for (let k = 0; k <= n; k++) arc.push([C[0] + size * Math.cos(a0 + (sweep * k) / n), C[1] + size * Math.sin(a0 + (sweep * k) / n)]);
            arc[0] = Ta;
            arc[n] = Tb;
            put(s.id, "line", arc, i);
          }
          break;
        }
        case "mirror": {
          let origin: Pt, d: Pt;
          if (s.axisPts) {
            origin = pointOf(s.axisPts[0]);
            const b = pointOf(s.axisPts[1]);
            d = [b[0] - origin[0], b[1] - origin[1]];
            if (Math.hypot(d[0], d[1]) < 1e-9) throw new Error("نقطتا محور الانعكاس متطابقتان");
          } else if (s.axisAt) {
            origin = pointOf(s.axisAt);
            const r = (vars.eval(s.axisAngle ?? "90") * Math.PI) / 180;
            d = [Math.cos(r), Math.sin(r)];
          } else {
            const ax = needLine(s.axis as number).pts;
            origin = ax[0];
            d = [ax[ax.length - 1][0] - origin[0], ax[ax.length - 1][1] - origin[1]];
          }
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

  /** A notch where an inner line meets the edge runs on along that line (as GRAFIS): the unit
   * direction from the notch point into the line, or null when no inner line ends there. */
  const notchLineDir = (r: PointRef, edges: number[]): Pt | null => {
    const at = refPoint(r);
    if (!at) return null;
    const into = (o: { pts: Pt[] }, end: boolean): Pt | null => {
      const n = o.pts.length, a = end ? o.pts[n - 1] : o.pts[0];
      // a point a little way into the line (curves: past the first tiny segments)
      let b = a;
      for (let i = 1; i < n && dist(a, b) < 2; i++) b = end ? o.pts[n - 1 - i] : o.pts[i];
      const L = dist(a, b);
      return L > 1e-6 ? [(b[0] - a[0]) / L, (b[1] - a[1]) / L] : null;
    };
    const own = objects.get(r.obj);
    if (own?.kind === "line" && r.end && !edges.includes(r.obj)) return into(own, r.end === "end");
    for (const o of objects.values()) {
      if (o.kind !== "line" || edges.includes(o.id) || o.pts.length < 2) continue;
      if (dist(o.pts[0], at) < 0.01) return into(o, false);
      if (dist(o.pts[o.pts.length - 1], at) < 0.01) return into(o, true);
    }
    return null;
  };
  const pieces = new Map<number, PieceGeo>();
  const pieceErrors = new Map<number, string>();
  for (const pc of model.pieces ?? []) {
    try {
      pieces.set(
        pc.id,
        buildPiece({
          piece: pc,
          edges: pc.edges.map((id) => needLine(id).pts),
          allowance: pc.edges.map((_, k) => vars.eval(pc.seam[k] ?? "0")),
          allowanceEnd: pc.edges.map((_, k) => (pc.seamEnd?.[k]?.trim() ? vars.eval(pc.seamEnd[k]) : undefined)),
          notchPoints: pc.notches.map((r) => {
            const p = refPoint(r);
            if (!p) throw new Error(`نقطة النوتش ${model.names[r.obj] ?? r.obj} غير موجودة`);
            return p;
          }),
          notchDepth: pc.notches.map((_, k) => (pc.notchLen?.[k]?.trim() ? vars.eval(pc.notchLen[k]) : undefined)),
          notchDir: pc.notches.map((r) => notchLineDir(r, pc.edges)),
          cutCorners: Object.fromEntries(Object.entries(pc.cutCorners ?? {}).map(([k, c]) => [k, { kind: c.kind, size: c.kind === "square" ? 0 : vars.eval(c.size || "0"), on: c.on }])),
          grainAngle: vars.eval(pc.grain || "90"),
        }),
      );
    } catch (e) {
      pieceErrors.set(pc.id, (e as Error).message);
    }
  }
  return { objects, stepErrors, z: vars.z, zErrors: vars.zErrors, pieces, pieceErrors };
}

// ------------------------------------------------------------------ helpers
/** Ids an existing step creates (not the ones it only changes). */
export function createdIds(s: Step): number[] {
  switch (s.op) {
    case "setLength":
    case "trim":
    case "dim":
    case "mark":
    case "text":
      return [];
    case "corner":
      return s.id === undefined ? [] : [s.id];
    case "parallels":
      return s.ids;
    case "inherit":
      return s.items.map((it) => it.dst);
    case "mirror":
    case "scale":
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
    case "pointOffset":
      return [s.from.obj];
    case "dim":
      return [s.a, s.b, s.c].filter((r): r is PointRef => !!r).map((r) => r.obj).concat(s.obj !== undefined ? [s.obj] : [], s.objs ?? []);
    case "line":
      return [s.p1.obj, s.p2.obj];
    case "lineAngle":
      return [s.start.obj];
    case "parallel":
      return [s.of];
    case "parallels":
      return s.of;
    case "inherit":
      return [];
    case "text":
      return [s.at.obj];
    case "fixed":
      return [];
    case "mark":
      return [...(s.obj !== undefined ? [s.obj] : []), ...[s.a, s.b].filter((r): r is PointRef => !!r).map((r) => r.obj)];
    case "setLength":
      return [s.target];
    case "trim":
      return [s.target, s.to];
    case "mirror":
      return [...(s.axis !== undefined ? [s.axis] : []), ...(s.axisPts ?? []).map((r) => r.obj), ...(s.axisAt ? [s.axisAt.obj] : []), ...s.items.map((it) => it.src)];
    case "scale":
      return [s.center.obj, ...s.items.map((it) => it.src)];
    case "curve":
      return [...s.through.map((r) => r.obj), ...[s.startRel, s.endRel].filter((v): v is number => v !== undefined)];
    case "corner":
      return [s.a, s.b];
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
