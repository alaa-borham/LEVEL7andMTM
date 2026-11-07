// Graded DXF-AAMA: the sample (base) size with grade rule numbers on its
// points, plus the grade rule table (.rul) holding, for every rule, the x/y
// offset of each size from the sample size (sample = 0,0).
//
// Points of different sizes are matched per edge and by relative position
// along the edge, so they correspond even when sizes differ in shape.

import { dist, pointAlong, polyLen, type Pt } from "./geometry";
import { evaluateModel, sizeActive, sizeName, withSize, type Model } from "./model";
import type { PieceGeo } from "./piece";

const AAMA_LAYER = { boundary: 1, turn: 2, curve: 3, notch: 4, grain: 7, sew: 14 } as const;

export interface GradedResult {
  dxf: string;
  rul: string;
  sizes: string[]; // in table order
  sample: string;
  rules: number;
  errors: string[];
}

/** Size names as single ASCII tokens, as the SIZE LIST line needs. */
function sizeTokens(raw: string[], baseIndex: number): string[] {
  const seen = new Set<string>();
  return raw.map((s, i) => {
    let t = s
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // Arabic-Indic digits
      .replace(/\s+/g, "_")
      .replace(/[^\x21-\x7E]/g, "")
      .replace(/^_+|_+$/g, "");
    if (!t) t = i === baseIndex ? "BASE" : `S${i + 1}`;
    while (seen.has(t)) t += `_${i + 1}`;
    seen.add(t);
    return t;
  });
}

/** Relative positions (0..1) of grade points along one edge of the sample size. */
function fractions(edge: Pt[]): number[] {
  if (edge.length <= 2) return [0, 1];
  const n = Math.max(6, Math.min(40, Math.round(polyLen(edge) / 15)));
  return Array.from({ length: n + 1 }, (_, i) => i / n);
}

const at = (edge: Pt[], f: number): Pt => pointAlong(edge, polyLen(edge) * f);
const num = (v: number) => (Math.abs(v) < 0.0005 ? 0 : v).toFixed(3); // no "-0.000"

export function toGradedAama(model: Model, date = new Date()): GradedResult {
  const errors: string[] = [];
  // sizes in grading order (by step); the base size has step 0
  // customers (made to measure) are not part of a grade rule table
  const idx = [-1, ...(model.sizes ?? []).flatMap((s, i) => (s.kind === "customer" ? [] : [i]))].filter((i) => sizeActive(model, i)); // switched-off sizes stay out
  const stepOf = (i: number) => (i < 0 ? 0 : (model.sizes as NonNullable<Model["sizes"]>)[i].step);
  idx.sort((a, b) => stepOf(a) - stepOf(b) || a - b);
  if (!idx.length) return { dxf: "", rul: "", sizes: [], sample: "", rules: 0, errors: ["لا يوجد مقاس مفعّل في جدول المقاسات"] };
  // the sample size the rules are measured from: the base size, or when it is switched off in the size
  // table, the active size nearest to it in the grading order
  const sampleAt = idx.includes(-1) ? idx.indexOf(-1) : idx.reduce((b, i, k) => (Math.abs(stepOf(i)) < Math.abs(stepOf(idx[b])) ? k : b), 0);
  const names = sizeTokens(
    idx.map((i) => sizeName(model, i)),
    sampleAt,
  );
  const sample = names[sampleAt];
  const results = idx.map((i) => evaluateModel(withSize(model, i)));
  const baseRes = results[sampleAt];

  // rules: deltas per size, deduplicated
  const ruleKey = new Map<string, number>();
  const rules: Pt[][] = [];
  const ruleFor = (deltas: Pt[]): number => {
    const key = deltas.map((d) => `${num(d[0])},${num(d[1])}`).join(" ");
    let n = ruleKey.get(key);
    if (n === undefined) {
      rules.push(deltas);
      n = rules.length;
      ruleKey.set(key, n);
    }
    return n;
  };

  const out: string[] = [];
  const g = (code: number, v: string | number) => out.push(String(code), typeof v === "number" ? v.toFixed(3) : v);
  const text = (layer: number, p: Pt, s: string, h = 3) => {
    g(0, "TEXT");
    g(8, String(layer));
    g(10, p[0]);
    g(20, p[1]);
    g(30, 0);
    g(40, h);
    g(1, s.replace(/[^\x00-\x7F]/g, (c) => `\\U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`));
  };
  const point = (layer: number, p: Pt) => {
    g(0, "POINT");
    g(8, String(layer));
    g(10, p[0]);
    g(20, p[1]);
    g(30, 0);
  };
  const poly = (layer: number, pts: Pt[]) => {
    g(0, "POLYLINE");
    g(8, String(layer));
    g(66, "1");
    g(70, "0");
    g(10, 0);
    g(20, 0);
    g(30, 0);
    for (const p of [...pts, pts[0]]) {
      g(0, "VERTEX");
      g(8, String(layer));
      g(10, p[0]);
      g(20, p[1]);
      g(30, 0);
    }
    g(0, "SEQEND");
    g(8, String(layer));
  };

  g(0, "SECTION");
  g(2, "HEADER");
  g(9, "$ACADVER");
  g(1, "AC1009");
  g(9, "$INSUNITS");
  g(70, "4");
  g(0, "ENDSEC");
  g(0, "SECTION");
  g(2, "BLOCKS");

  const blocks: string[] = [];
  let offsetX = 0;
  (model.pieces ?? []).forEach((piece, pi) => {
    const geos = results.map((r) => r.pieces.get(piece.id));
    const missing = geos.findIndex((x) => !x);
    if (missing >= 0) {
      errors.push(`${piece.name} (${names[missing]}): ${results[missing].pieceErrors.get(piece.id) ?? "خطأ"}`);
      return;
    }
    const base = baseRes.pieces.get(piece.id) as PieceGeo;
    const all = geos as PieceGeo[];
    if (all.some((x) => x.cutEdges.length !== base.cutEdges.length)) {
      errors.push(`${piece.name}: عدد حدود القطعة يختلف بين المقاسات`);
      return;
    }
    // shift so every size of the piece sits right of the previous piece, above y = 0
    const allPts = all.flatMap((x) => x.cut);
    const dx = offsetX - Math.min(...allPts.map((p) => p[0]));
    const dy = -Math.min(...allPts.map((p) => p[1]));
    offsetX += Math.max(...allPts.map((p) => p[0])) - Math.min(...allPts.map((p) => p[0])) + 50;
    const T = (p: Pt): Pt => [p[0] + dx, p[1] + dy];

    // grade points: per edge, at the same relative positions in every size
    const boundary: Pt[] = [];
    const marks: { p: Pt; turn: boolean; rule: number }[] = [];
    base.cutEdges.forEach((edge, k) => {
      const fr = fractions(edge);
      fr.forEach((f, j) => {
        const p = at(edge, f);
        if (boundary.length && dist(boundary[boundary.length - 1], p) < 0.01) return;
        const deltas = all.map((x) => {
          const q = at(x.cutEdges[k], f);
          return [q[0] - p[0], q[1] - p[1]] as Pt;
        });
        boundary.push(p);
        marks.push({ p, turn: j === 0 || j === fr.length - 1, rule: ruleFor(deltas) });
      });
    });
    if (boundary.length > 2 && dist(boundary[0], boundary[boundary.length - 1]) < 0.01) {
      boundary.pop();
      marks.pop();
    }

    const name = `P${pi + 1}_${piece.name.replace(/[^A-Za-z0-9_-]/g, "") || "PIECE"}`.slice(0, 31);
    blocks.push(name);
    g(0, "BLOCK");
    g(8, "0");
    g(2, name);
    g(70, "0");
    g(10, 0);
    g(20, 0);
    g(30, 0);
    g(3, name);
    poly(AAMA_LAYER.boundary, boundary.map(T));
    for (const m of marks) {
      point(m.turn ? AAMA_LAYER.turn : AAMA_LAYER.curve, T(m.p));
      text(AAMA_LAYER.boundary, T(m.p), `# ${m.rule}`);
    }
    poly(AAMA_LAYER.sew, base.sew.map(T));
    for (const n of base.notches) {
      const [a, b] = [T(n.at), T(n.to)];
      g(0, "LINE");
      g(8, String(AAMA_LAYER.notch));
      g(10, a[0]);
      g(20, a[1]);
      g(30, 0);
      g(11, b[0]);
      g(21, b[1]);
      g(31, 0);
    }
    const [ga, gb] = base.grain.map(T);
    g(0, "LINE");
    g(8, String(AAMA_LAYER.grain));
    g(10, ga[0]);
    g(20, ga[1]);
    g(30, 0);
    g(11, gb[0]);
    g(21, gb[1]);
    g(31, 0);
    const c = T(base.centre);
    [`Piece Name: ${piece.name}`, `Quantity: ${piece.quantity}`, `Material: ${piece.fabric}`, `Size: ${sample}`].forEach((s, k) =>
      text(AAMA_LAYER.boundary, [c[0], c[1] - k * 12], s, 8),
    );
    g(0, "ENDBLK");
  });
  g(0, "ENDSEC");

  const tableName = (model.name.replace(/[^A-Za-z0-9_-]/g, "") || "LEVEL7").slice(0, 31);
  g(0, "SECTION");
  g(2, "ENTITIES");
  [
    "ANSI/AAMA VERSION: 1.0.0",
    `PRODUCT: ${model.name}`,
    "UNITS: METRIC",
    `GRADE RULE TABLE: ${tableName}`,
    `NUMBER OF SIZES: ${names.length}`,
    `SIZE LIST: ${names.join(" ")}`,
    `SAMPLE SIZE: ${sample}`,
    `CREATION DATE: ${date.toISOString().slice(0, 10)}`,
    "AUTHOR: LEVEL7 CAD",
  ].forEach((s, k) => text(1, [0, -20 - k * 12], s, 8));
  for (const b of blocks) {
    g(0, "INSERT");
    g(8, "1");
    g(2, b);
    g(10, 0);
    g(20, 0);
    g(30, 0);
  }
  g(0, "ENDSEC");
  g(0, "EOF");

  const rul: string[] = [
    "ANSI/AAMA VERSION: 1.0.0",
    "UNITS: METRIC",
    `GRADE RULE TABLE: ${tableName}`,
    `NUMBER OF SIZES: ${names.length}`,
    `SIZE LIST: ${names.join(" ")}`,
    `SAMPLE SIZE: ${sample}`,
  ];
  rules.forEach((deltas, k) => {
    rul.push(`RULE: DELTA ${k + 1}`);
    rul.push(" " + deltas.map((d) => `${num(d[0])},${num(d[1])}`).join(" "));
  });
  rul.push("END");

  return { dxf: out.join("\r\n") + "\r\n", rul: rul.join("\r\n") + "\r\n", sizes: names, sample, rules: rules.length, errors };
}
