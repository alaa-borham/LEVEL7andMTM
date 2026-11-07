// Test run and grading (as GRAFIS): build a part, or every part, in the base size (test run) or in
// every active size (grade), and list what fails. Nothing in the design is changed.
import { dist, pointAlong, polyLen, type Pt } from "./geometry";
import { createdIds, evaluateModel, sizeActive, sizeName, withSize, type EvalResult, type Model } from "./model";
import type { Piece } from "./piece";

export interface CheckRow {
  part: string; // "002 basic thobe"
  size: string;
  errors: string[]; // empty = built without errors
  /** For each error, where it is (to show it on the drawing): a step index, a Z id or a piece id. */
  refs: ({ step: number } | { z: number } | { piece: number })[];
  /** Not errors: places where the seam allowance cannot come out clean (narrow corner, curve end
   * bending tighter than the allowance), with where they are. */
  warnings: string[];
  warnRefs: ({ at: Pt; step?: number })[];
  k: number; // part index
  sizeIndex: number; // -1 = base
}

export interface CheckResult {
  rows: CheckRow[];
  parts: number;
  sizes: number;
  failed: number; // rows with errors
  warned: number; // rows with warnings
}

/**
 * Where a piece's seam allowance cannot come out clean (as a pattern maker would be told): two edges
 * meeting at a very narrow angle, or a curve end that bends more sharply than the allowance within its
 * last stretch (a small hook into the corner). The drawing is not changed.
 */
export function pieceWarnings(r: EvalResult, pieces: Piece[], steps: Model["steps"], names: Record<number, string>): { warnings: string[]; refs: { at: Pt; step?: number }[]; where: Pt[] } {
  const warnings: string[] = [], refs: { at: Pt; step?: number }[] = [], where: Pt[] = [];
  const name = (id: number) => names[id] ?? `#${id}`;
  const stepOf = (id: number) => steps.findIndex((st) => createdIds(st).includes(id));
  const unit = (a: Pt, b: Pt): Pt => {
    const L = dist(a, b) || 1;
    return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  };
  const deg = (u: Pt, v: Pt) => (Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]))) * 180) / Math.PI;
  for (const pc of pieces) {
    const g = r.pieces.get(pc.id);
    if (!g || !g.allow) continue;
    const n = g.edges.length, idOf = (i: number) => pc.edges[g.order[i]];
    for (let i = 0; i < n; i++) {
      const A = g.edges[i], B = g.edges[(i + 1) % n], a = Math.max(g.allow[i], g.allow[(i + 1) % n]);
      if (!(a > 0) || A.length < 2 || B.length < 2) continue;
      const LA = polyLen(A), LB = polyLen(B), dA = Math.min(3, LA / 4), dB = Math.min(3, LB / 4);
      const inA = unit(pointAlong(A, dA, true), A[A.length - 1]), outB = unit(B[0], pointAlong(B, dB));
      const inner = deg([-inA[0], -inA[1]], outB);
      if (inner < 20) {
        warnings.push(`القطعة «${pc.name}»: الزاوية بين ${name(idOf(i))} و${name(idOf((i + 1) % n))} ضيقة جداً (${Math.round(inner)}°)، فلا يمكن أن تكون الحاشية نظيفة عندها. غيّر زاوية طرف الكرف أو اتجاه الخط.`);
        refs.push({ at: A[A.length - 1] });
        where.push(A[A.length - 1]);
      }
    }
    for (let i = 0; i < n; i++) {
      const E = g.edges[i], a = g.allow[i], L = polyLen(E), id = idOf(i);
      if (!(a > 0) || E.length < 4 || L < 3 * a) continue;
      for (const end of [false, true]) {
        // the turn over the last half allowance: more than ~24° there is a bend of radius under about
        // the allowance itself, which the seam allowance cannot follow parallel
        const at = (s: number) => (end ? pointAlong(E, s, true) : pointAlong(E, s));
        const h = a / 2, before = unit(at(h + 1), at(h)), last = unit(at(Math.min(0.5, a / 8)), at(0));
        const turn = deg(before, last);
        // only a bend towards the cut side folds the allowance (the outline runs counter-clockwise: the
        // cut side is on the right of travel; at the start the stretch is walked backwards)
        const cross = before[0] * last[1] - before[1] * last[0], towardCut = end ? cross < 0 : cross > 0;
        if (turn > 24 && towardCut) {
          warnings.push(`القطعة «${pc.name}»: طرف ${name(id)} ينحني ${Math.round(turn)}° في آخر ${Math.round(h)} مم، أحدّ من مسافة الخياطة (${Math.round(a)} مم)، فتظهر الحاشية غير نظيفة عند الزاوية. ارفع شدة طرف الكرف أو اجعل زاويته على الخط المجاور (مثلاً 90°).`);
          const si = stepOf(id);
          // the place itself (the bending end); the step too when it makes this curve alone (an inherit or
          // mirror step can bring several elements: its middle may be an empty spot)
          refs.push(si >= 0 && createdIds(steps[si]).length === 1 ? { at: at(0), step: si } : { at: at(0) });
          where.push(at(0));
        }
      }
    }
  }
  return { warnings, refs, where };
}

export function checkParts(model: Model, o: { all: boolean; grade: boolean }): CheckResult {
  const act = model.activePart ?? 0;
  const list = model.parts?.length ? model.parts.map((p, k) => ({ p, k })) : [{ p: { no: 1, name: model.name, steps: model.steps, names: model.names, pieces: model.pieces }, k: 0 }];
  const parts = o.all ? list : list.filter(({ k }) => k === act);
  const sizes = o.grade ? [-1, ...(model.sizes ?? []).map((_s, i) => i)].filter((i) => sizeActive(model, i)) : [-1];
  const rows: CheckRow[] = [];
  for (const { p, k } of parts) {
    const live = k === act;
    const steps = live ? model.steps : p.steps, names = live ? model.names : p.names, pieces = (live ? model.pieces : p.pieces) ?? [];
    const label = `${String(p.no).padStart(3, "0")} ${p.name ?? ""}`.trim();
    for (const i of sizes) {
      const r = evaluateModel(withSize({ ...model, steps, names, pieces, activePart: model.parts?.length ? k : model.activePart }, i));
      // a Z is reported where it is used: a Z measured from another part's drawing is not an error in
      // a part that does not use it
      const zs = [...r.zErrors].filter(([id]) => usesZ(steps, pieces, id));
      const errors = [
        ...[...r.stepErrors].map(([si, msg]) => `خطوة ${si + 1}: ${msg}`),
        ...zs.map(([id, msg]) => `Z${id}: ${msg}`),
        ...[...r.pieceErrors].map(([id, msg]) => `القطعة «${pieces.find((pc) => pc.id === id)?.name ?? id}»: ${msg}`),
      ];
      const refs = [...[...r.stepErrors.keys()].map((step) => ({ step })), ...zs.map(([z]) => ({ z })), ...[...r.pieceErrors.keys()].map((piece) => ({ piece }))];
      const w = i === sizes[0] ? pieceWarnings(r, pieces, steps, names) : { warnings: [], refs: [], where: [] };
      rows.push({ part: label, size: sizeName(model, i), errors, refs, warnings: w.warnings, warnRefs: w.refs, k, sizeIndex: i });
    }
  }
  return { rows, parts: parts.length, sizes: sizes.length, failed: rows.filter((r) => r.errors.length).length, warned: rows.filter((r) => r.warnings.length).length };
}

/** Whether any value of these steps or pieces names Z<id> (Z7, z07 …). */
function usesZ(steps: unknown[], pieces: unknown[], id: number): boolean {
  const re = new RegExp(`(^|[^A-Za-z0-9_])Z0*${id}(?![0-9])`, "i");
  const walk = (v: unknown): boolean =>
    typeof v === "string" ? re.test(v) : Array.isArray(v) ? v.some(walk) : v !== null && typeof v === "object" ? Object.values(v as object).some(walk) : false;
  return walk(steps) || walk(pieces);
}
