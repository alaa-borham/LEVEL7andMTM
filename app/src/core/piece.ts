// Pattern pieces: a closed outline made of construction objects (lines and
// curves) picked in order, with seam allowance per edge, notches and grain line.

import { closestOnPolyline, crossings, dedupe, dist, offsetPolyline, pointAlong, polyLen, subPolyline, type Pt } from "./geometry";
import type { PointRef } from "./model";

export interface Piece {
  id: number;
  name: string;
  quantity: number;
  fabric: string;
  edges: number[]; // object ids, in order around the piece
  seam: string[]; // seam allowance (mm, formula) for each edge
  /** Unparallel allowance (as GRAFIS): the value at the edge's end; seam[k] is then the value at its
   * start (start / end as the edge object is drawn). Empty or missing = parallel. */
  seamEnd?: string[];
  notches: PointRef[];
  /** Notch shape per notch (same order): slit (default), T, V or castle (box). */
  notchTypes?: NotchType[];
  /** Notch length per notch (mm or a formula with X / Z); empty = the standard length. */
  notchLen?: string[];
  /** Fold line (as GRAFIS mirrored piece): the id of the edge the piece is mirrored about; no seam
   * allowance on it, and the piece is cut / exported unfolded (both halves). */
  fold?: number;
  /** Cut line corners (as GRAFIS): key "a,b" = the two edge ids (smaller first) meeting there. */
  cutCorners?: Record<string, { kind: "round" | "chamfer"; size: string }>;
  grain: string; // grain line angle in degrees (90 = vertical)
}

export type NotchType = "slit" | "t" | "v" | "castle";

export interface Notch {
  at: Pt; // on the cut line
  to: Pt; // inner end of the notch cut
  type: NotchType;
  /** The notch as polylines to draw and cut (a slit is just at → to). */
  shape: Pt[][];
}

export interface PieceGeo {
  id: number;
  sew: Pt[]; // sewing line (the construction outline), closed, counter-clockwise
  cut: Pt[]; // cutting line with seam allowance, closed
  cutEdges: Pt[][]; // cutting line split per edge (same order as edges)
  edges: Pt[][]; // sewing line split per edge (counter-clockwise order)
  order: number[]; // for each of those, the index in Piece.edges
  notches: Notch[];
  grain: [Pt, Pt];
  centre: Pt;
  /** Folded piece: the fold line, and the half drawn with its sewing line (sew / cut are then unfolded). */
  fold?: { line: [Pt, Pt]; halfSew: Pt[]; halfCut: Pt[] };
  /** Corners of the cut line between two edges: where they are and their key (see Piece.cutCorners). */
  cutCornerAt?: { pt: Pt; key: string }[];
  /** Seam allowance of each edge in outline order (the larger end of an unparallel one). */
  allow?: number[];
  error?: string;
}

const close = (p: Pt[]): Pt[] => (dist(p[0], p[p.length - 1]) < 1e-9 ? p : [...p, p[0]]);

export function signedArea(p: Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

function centroid(p: Pt[]): Pt {
  const xs = p.map((q) => q[0]);
  const ys = p.map((q) => q[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/**
 * Where two consecutive edges meet: the crossing nearest to their closest ends,
 * or the middle between those ends when they do not cross (touching curves).
 * Returns the arc positions on a and b.
 */
function junction(a: Pt[], b: Pt[]): { sa: number; sb: number; pt: Pt } {
  const La = polyLen(a);
  const Lb = polyLen(b);
  const ends: [number, number][] = [
    [0, 0],
    [0, Lb],
    [La, 0],
    [La, Lb],
  ];
  const endPt = (p: Pt[], s: number) => (s === 0 ? p[0] : p[p.length - 1]);
  const [ea, eb] = ends.reduce((best, e) => (dist(endPt(a, e[0]), endPt(b, e[1])) < dist(endPt(a, best[0]), endPt(b, best[1])) ? e : best));
  const near: Pt = [(endPt(a, ea)[0] + endPt(b, eb)[0]) / 2, (endPt(a, ea)[1] + endPt(b, eb)[1]) / 2];
  const gap = dist(endPt(a, ea), endPt(b, eb));
  if (gap > 1e-6) {
    const hits = crossings(a, b);
    if (hits.length) {
      const h = hits.reduce((x, y) => (dist(y.pt, near) < dist(x.pt, near) ? y : x));
      // accept a crossing that is not far away compared with the edges
      if (dist(h.pt, near) < Math.max(gap * 4, 0.25 * Math.min(La, Lb), 5)) {
        const hb = crossings(b, a).reduce((x, y) => (dist(y.pt, h.pt) < dist(x.pt, h.pt) ? y : x));
        return { sa: h.s, sb: hb.s, pt: h.pt };
      }
    }
  }
  return { sa: ea, sb: eb, pt: near };
}

/** Sewing outline from edges picked in order. Each edge is clipped at its two junctions. */
export function outline(edges: Pt[][], order?: number[]): { sew: Pt[]; parts: Pt[][]; order: number[] } {
  const idx = order ?? edges.map((_, i) => i);
  const n = edges.length;
  if (n < 2) throw new Error("القطعة تحتاج خطين على الأقل");
  const j = edges.map((e, i) => junction(e, edges[(i + 1) % n]));
  const parts = edges.map((e, i) => {
    const s0 = j[(i - 1 + n) % n].sb; // where the previous edge meets this one
    const s1 = j[i].sa; // where this edge meets the next one
    if (n === 2 && Math.abs(s0 - s1) < 1e-9) throw new Error("حدودها خطّان فقط لا يكوّنان شكلاً مغلقاً: القطعة تحتاج ثلاثة حدود على الأقل تلتقي أطرافها (إن لم تكن مقصودة فاحذفها من صفحة القطع)");
    const part = s0 <= s1 ? subPolyline(e, s0, s1) : subPolyline(e, s1, s0).reverse();
    // snap ends exactly onto the junction points so the outline closes
    part[0] = j[(i - 1 + n) % n].pt;
    part[part.length - 1] = j[i].pt;
    return part;
  });
  let sew: Pt[] = [];
  for (const p of parts) sew.push(...(sew.length ? p.slice(1) : p));
  if (dist(sew[0], sew[sew.length - 1]) < 1e-6) sew = sew.slice(0, -1);
  if (signedArea(sew) < 0) {
    // keep everything counter-clockwise: outward is then to the right
    return outline([...edges].reverse().map((e) => [...e].reverse()), [...idx].reverse());
  }
  return { sew, parts, order: idx };
}

/** Cutting line: every edge moved outward by its allowance, corners mitred. */
/** Corner treatment of the cut line at the end of a part (as GRAFIS): rounded (radius) or cut off (distance from the corner). */
export interface CutCorner {
  kind: "round" | "chamfer";
  size: number;
}

export function cutLine(parts: Pt[][], allowance: (number | [number, number])[], treat: (CutCorner | undefined)[] = []): { pts: Pt[]; edges: Pt[][]; corners: (Pt | null)[] } {
  const n = parts.length;
  const pair = (a: number | [number, number]): [number, number] => (typeof a === "number" ? [a, a] : a);
  // counter-clockwise outline: outward = right of travel = negative offset
  const off = parts.map((p, i) => {
    const [a0, a1] = pair(allowance[i]);
    const o = a0 === a1 ? (a0 > 0 ? offsetPolyline(p, -a0) : [...p]) : offsetVarying(p, -a0, -a1);
    return foldFree(p, o, Math.min(a0, a1));
  });
  const maxA = Math.max(...allowance.flatMap(pair), 1);
  const startAt = off.map(() => 0);
  const endAt = off.map((p) => polyLen(p));
  const corner: (Pt | null)[] = [];
  for (let i = 0; i < n; i++) {
    const a = off[i];
    const b = off[(i + 1) % n];
    const meet = parts[i][parts[i].length - 1];
    const hits = crossings(a, b);
    if (hits.length) {
      const h = hits.reduce((x, y) => (dist(y.pt, meet) < dist(x.pt, meet) ? y : x));
      if (dist(h.pt, meet) <= 6 * maxA + 1) {
        const hb = crossings(b, a).reduce((x, y) => (dist(y.pt, h.pt) < dist(x.pt, h.pt) ? y : x));
        endAt[i] = h.s;
        startAt[(i + 1) % n] = hb.s;
        corner.push(h.pt);
        continue;
      }
    }
    corner.push(null); // too sharp or parallel: bevel (straight join of the two ends)
  }
  const edges: Pt[][] = off.map((p, i) => subPolyline(p, startAt[i], endAt[i]));
  // rounded / cut-off corners: both edges are shortened and the gap is closed by an arc or a straight cut
  for (let i = 0; i < n; i++) {
    const t = treat[i], c = corner[i], j = (i + 1) % n;
    if (!t || !c || !(t.size > 0) || n < 2) continue;
    const A = edges[i], B = edges[j], La = polyLen(A), Lb = polyLen(B);
    if (La < 1e-6 || Lb < 1e-6) continue;
    const dA = unit2(A[A.length - 1], pointAlong(A, Math.min(1, La / 2), true)); // from the corner back along A
    const dB = unit2(B[0], pointAlong(B, Math.min(1, Lb / 2))); // from the corner on along B
    const cos = Math.max(-1, Math.min(1, dA[0] * dB[0] + dA[1] * dB[1]));
    const half = Math.acos(cos) / 2; // half the inside angle of the corner
    let k = t.kind === "round" ? t.size / Math.tan(half || 1e-9) : t.size; // tangent length / cut distance
    k = Math.min(k, 0.45 * La, 0.45 * Lb);
    if (!(k > 1e-3)) continue;
    const a = pointAlong(A, k, true), b = pointAlong(B, k);
    const arc: Pt[] = [];
    if (t.kind === "round")
      for (let q = 1; q < 12; q++) {
        const u = q / 12, w = 1 - u; // quadratic Bezier a → corner → b: tangent to both edges
        arc.push([w * w * a[0] + 2 * w * u * c[0] + u * u * b[0], w * w * a[1] + 2 * w * u * c[1] + u * u * b[1]]);
      }
    edges[i] = [...subPolyline(A, 0, La - k), ...arc];
    edges[j] = subPolyline(B, k, Lb);
  }
  const out: Pt[] = [];
  for (const seg of edges) out.push(...(out.length && dist(out[out.length - 1], seg[0]) < 1e-6 ? seg.slice(1) : seg));
  if (dist(out[0], out[out.length - 1]) < 1e-6) out.pop();
  return { pts: out, edges, corners: corner };
}

function unit2(from: Pt, to: Pt): Pt {
  const L = dist(from, to) || 1;
  return [(to[0] - from[0]) / L, (to[1] - from[1]) / L];
}

/**
 * Where the sewing line bends tighter than the allowance (a small hook at a
 * corner), its offset folds back on itself: those points lie nearer the sewing
 * line than the allowance. They are dropped so the cut line stays clean.
 */
export function foldFree(src: Pt[], off: Pt[], a: number): Pt[] {
  if (a <= 0 || off.length < 3) return off;
  off = unloop(off, 3 * a); // swallowtails first (the offset crossing itself), then what still lies too near
  const ok = off.map((q) => closestOnPolyline(src, q).d >= a * 0.97);
  let idx = off.map((_, i) => i).filter((i) => ok[i]);
  if (idx.length < 2) return off;
  // a few good points stranded before / after a folded stretch at an end are dropped too: the cut line
  // then starts where the offset runs clean, and the corner is found along that clean direction
  // (they would otherwise pull a straight jump across the fold, a kink below the corner)
  const L = polyLen(off), along = (i: number) => polyLen(off.slice(0, i + 1));
  for (let k = idx.length - 1; k > 0; k--)
    if (idx[k] - idx[k - 1] > 1 && along(idx[k]) <= Math.min(6 * a, L / 2)) {
      idx = idx.slice(k);
      break;
    }
  for (let k = 0; k + 1 < idx.length; k++)
    if (idx[k + 1] - idx[k] > 1 && L - along(idx[k]) <= Math.min(6 * a, L / 2)) {
      idx = idx.slice(0, k + 1);
      break;
    }
  const keep = idx.map((i) => off[i]);
  return cleanEnds(unloop(keep.length >= 2 ? keep : off, 3 * a), a);
}

/** Where a fold was cut away, the line can still turn back on itself near an end (a cusp, often only a
 * millimetre long): that would set a wrong direction for the corner. Everything before the last
 * turn-back within 3 × the allowance of the end is dropped (and the same at the other end). */
function cleanEnds(p0: Pt[], a: number): Pt[] {
  const trim = (p: Pt[]): Pt[] => {
    const q = dedupe(p, 1e-6);
    let cut = 0, s = 0;
    for (let i = 1; i + 1 < q.length; i++) {
      s += dist(q[i - 1], q[i]);
      if (s > 3 * a) break;
      const u: Pt = [q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]], v: Pt = [q[i + 1][0] - q[i][0], q[i + 1][1] - q[i][1]];
      if (u[0] * v[0] + u[1] * v[1] < -0.3 * Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1])) cut = i; // turns back (over ~107°)
    }
    return q.length - cut >= 2 ? q.slice(cut) : q;
  };
  return trim(trim(p0).reverse()).reverse();
}

/** Cuts out small loops (the line crossing itself a little further on). A loop within `endZone` of an
 * open end is the tail of a swallowtail: the stub before it (or after it) goes too. */
function unloop(p: Pt[], endZone = 0): Pt[] {
  let out = [...p];
  let head = 0; // arc length from the start to out[i]
  for (let i = 0; i + 3 < out.length; i++) {
    let reach = 0;
    for (let j = i + 2; j + 1 < out.length; j++) {
      reach += dist(out[j - 1], out[j]);
      if (reach > 200) break;
      const x = segCross(out[i], out[i + 1], out[j], out[j + 1]);
      if (x) {
        const tail = polyLen(out.slice(j + 1));
        if (head + dist(out[i], x) <= endZone) {
          out = [x, ...out.slice(j + 1)]; // swallowtail at the start
          i = -1;
          head = 0;
        } else if (tail + dist(x, out[j + 1]) <= endZone) out = [...out.slice(0, i + 1), x]; // at the end
        else out.splice(i + 1, j - i, x);
        break;
      }
    }
    if (i >= 0) head += dist(out[i], out[i + 1] ?? out[i]);
  }
  return out;
}

function segCross(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
  const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9 ? [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] : null;
}

/** Offset that changes evenly along the line from d0 at its start to d1 at its end. */
function offsetVarying(p0: Pt[], d0: number, d1: number): Pt[] {
  const p = dedupe(p0);
  const L = polyLen(p) || 1;
  let acc = 0;
  return p.map((q, i) => {
    if (i) acc += dist(p[i - 1], q);
    const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, d = d0 + ((d1 - d0) * acc) / L;
    return [q[0] - ((b[1] - a[1]) / len) * d, q[1] + ((b[0] - a[0]) / len) * d] as Pt;
  });
}

/** Outward unit normal of the sewing line near point x. */
function outwardAt(sew: Pt[], x: Pt): { pt: Pt; n: Pt } {
  const c = close(sew);
  const hit = closestOnPolyline(c, x);
  // find the segment containing hit.s
  let acc = 0;
  for (let i = 1; i < c.length; i++) {
    const L = dist(c[i - 1], c[i]);
    if (acc + L >= hit.s - 1e-9) {
      const t: Pt = [(c[i][0] - c[i - 1][0]) / (L || 1), (c[i][1] - c[i - 1][1]) / (L || 1)];
      return { pt: hit.pt, n: [t[1], -t[0]] }; // right of travel
    }
    acc += L;
  }
  return { pt: hit.pt, n: [0, 0] };
}

export interface PieceInput {
  piece: Piece;
  edges: Pt[][];
  allowance: number[];
  /** Unparallel: the allowance at the end of each edge (as the edge object runs); undefined = parallel. */
  allowanceEnd?: (number | undefined)[];
  notchPoints: Pt[];
  /** Length of each notch (undefined = standard: the allowance, at most 6 mm). */
  notchDepth?: (number | undefined)[];
  /** Direction into the piece along an inner line ending at the notch (null = square to the edge). */
  notchDir?: (Pt | null)[];
  /** Evaluated cut line corners, keyed as Piece.cutCorners. */
  cutCorners?: Record<string, CutCorner>;
  grainAngle: number;
}

export function buildPiece(inp: PieceInput): PieceGeo {
  const { sew, parts, order } = outline(inp.edges);
  // allowance follows the parts (outline() may have reversed the order)
  // each part: allowance at its start and end (an unparallel one turns with the part's direction)
  const foldK = inp.piece.fold !== undefined ? inp.piece.edges.indexOf(inp.piece.fold) : -1;
  const allowance = order.map((k, i): [number, number] => {
    if (k === foldK) return [0, 0]; // the fold: no seam allowance
    const a = inp.allowance[k], b = inp.allowanceEnd?.[k];
    if (b === undefined || b === a) return [a, a];
    const e = inp.edges[k], p = parts[i];
    const same = closestOnPolyline(e, p[0]).s <= closestOnPolyline(e, p[p.length - 1]).s;
    return same ? [a, b] : [b, a];
  });
  const ids = inp.piece.edges, n = order.length;
  const keyAt = (i: number) => {
    const a = ids[order[i]], b = ids[order[(i + 1) % n]];
    return a < b ? `${a},${b}` : `${b},${a}`;
  };
  const treat = order.map((_, i) => inp.cutCorners?.[keyAt(i)]);
  const cl = cutLine(parts, allowance, treat);
  const cut = cl.pts;
  const notches = inp.notchPoints.map((x, idx) => {
    const { pt, n: square } = outwardAt(sew, x);
    const k = nearestPart(parts, pt);
    const [a0, a1] = allowance[k];
    const a = a0 === a1 ? a0 : a0 + ((a1 - a0) * closestOnPolyline(parts[k], pt).s) / (polyLen(parts[k]) || 1);
    const set = inp.notchDepth?.[idx];
    const depth = set !== undefined && set > 0 ? set : a > 0 ? Math.min(a, 6) : 6;
    // along an inner line that ends here (its extension out to the cut line), else square to the edge
    const d = inp.notchDir?.[idx];
    const n: Pt = d && -(d[0] * square[0] + d[1] * square[1]) > 0.25 ? [-d[0], -d[1]] : square;
    let at: Pt = [pt[0] + n[0] * a, pt[1] + n[1] * a];
    if (a > 0 && n !== square) {
      const ray: Pt[] = [pt, [pt[0] + n[0] * (a * 6 + 10), pt[1] + n[1] * (a * 6 + 10)]];
      const hits = crossings(ray, [...cut, cut[0]], false);
      if (hits.length) at = hits.reduce((p, q) => (q.s < p.s ? q : p)).pt;
    }
    const to: Pt = [at[0] - n[0] * depth, at[1] - n[1] * depth];
    const type: NotchType = inp.piece.notchTypes?.[idx] ?? "slit";
    const t: Pt = [-n[1], n[0]], w = 2;
    const off = (p: Pt, k: number): Pt => [p[0] + t[0] * k, p[1] + t[1] * k];
    const shape: Pt[][] =
      type === "t" ? [[at, to], [off(to, -w), off(to, w)]]
      : type === "v" ? [[off(at, -w), to, off(at, w)]]
      : type === "castle" ? [[off(at, -w), off(to, -w), off(to, w), off(at, w)]]
      : [[at, to]];
    return { at, to, type, shape };
  });
  const centre = centroid(sew);
  const ang = (inp.grainAngle * Math.PI) / 180;
  // the grain line stays inside the piece: 70% of its size along the grain direction
  const along = sew.map((p) => (p[0] - centre[0]) * Math.cos(ang) + (p[1] - centre[1]) * Math.sin(ang));
  const half = 0.35 * (Math.max(...along) - Math.min(...along));
  const g: [Pt, Pt] = [
    [centre[0] - Math.cos(ang) * half, centre[1] - Math.sin(ang) * half],
    [centre[0] + Math.cos(ang) * half, centre[1] + Math.sin(ang) * half],
  ];
  const cutCornerAt = cl.corners.flatMap((pt, i) => (pt ? [{ pt, key: keyAt(i) }] : []));
  const geo: PieceGeo = { id: inp.piece.id, sew, cut, cutEdges: cl.edges, edges: parts, order, notches, grain: g, centre, cutCornerAt, allow: allowance.map(([a, b]) => Math.max(a, b)) };
  return foldK >= 0 ? unfold(geo, order.indexOf(foldK), inp.grainAngle) : geo;
}

/** The piece opened out about its fold edge (index fi in the outline order): the other half is the
 * mirror image; corners on the fold disappear (the cut line runs straight across). */
function unfold(g: PieceGeo, fi: number, grainAngle: number): PieceGeo {
  const n = g.edges.length, fe = g.edges[fi], A = fe[0], B = fe[fe.length - 1];
  const d: Pt = [B[0] - A[0], B[1] - A[1]], L2 = d[0] * d[0] + d[1] * d[1] || 1;
  const m = (p: Pt): Pt => {
    const t = ((p[0] - A[0]) * d[0] + (p[1] - A[1]) * d[1]) / L2, fx = A[0] + t * d[0], fy = A[1] + t * d[1];
    return [2 * fx - p[0], 2 * fy - p[1]];
  };
  const others = (list: Pt[][]) => Array.from({ length: n - 1 }, (_, k) => list[(fi + 1 + k) % n]);
  // one half: from the fold's end round to its start; the other: the same mirrored, run backwards
  const halfEdges = others(g.cutEdges), mirEdges = halfEdges.map((e) => e.map(m).reverse()).reverse();
  const join = (list: Pt[][]) => {
    const out: Pt[] = [];
    for (const e of list) out.push(...(out.length && dist(out[out.length - 1], e[0]) < 1e-6 ? e.slice(1) : e));
    if (out.length > 1 && dist(out[0], out[out.length - 1]) < 1e-6) out.pop();
    return out;
  };
  const sewHalf = others(g.edges);
  const sew = join([...sewHalf, ...sewHalf.map((e) => e.map(m).reverse()).reverse()]);
  const cut = join([...halfEdges, ...mirEdges]);
  const onFold = (p: Pt) => Math.abs((p[0] - A[0]) * d[1] - (p[1] - A[1]) * d[0]) / Math.sqrt(L2) < 1e-3;
  const notches = [...g.notches, ...g.notches.filter((x) => !onFold(x.at)).map((x) => ({ ...x, at: m(x.at), to: m(x.to), shape: x.shape.map((s) => s.map(m)) }))];
  const centre = centroid(sew);
  const ang = (grainAngle * Math.PI) / 180;
  const along = sew.map((p) => (p[0] - centre[0]) * Math.cos(ang) + (p[1] - centre[1]) * Math.sin(ang));
  const half = 0.35 * (Math.max(...along) - Math.min(...along));
  const grain: [Pt, Pt] = [
    [centre[0] - Math.cos(ang) * half, centre[1] - Math.sin(ang) * half],
    [centre[0] + Math.cos(ang) * half, centre[1] + Math.sin(ang) * half],
  ];
  return {
    ...g,
    sew,
    cut,
    cutEdges: [...halfEdges, ...mirEdges],
    notches,
    centre,
    grain,
    cutCornerAt: g.cutCornerAt?.filter((c) => !onFold(c.pt)),
    fold: { line: [A, B], halfSew: g.sew, halfCut: g.cut },
  };
}

function nearestPart(parts: Pt[][], x: Pt): number {
  let best = 0;
  let bd = Infinity;
  parts.forEach((p, k) => {
    const d = closestOnPolyline(p, x).d;
    if (d < bd) {
      bd = d;
      best = k;
    }
  });
  return best;
}
