// Pattern pieces: a closed outline made of construction objects (lines and
// curves) picked in order, with seam allowance per edge, notches and grain line.

import { closestOnPolyline, crossings, dist, offsetPolyline, polyLen, subPolyline, type Pt } from "./geometry";
import type { PointRef } from "./model";

export interface Piece {
  id: number;
  name: string;
  quantity: number;
  fabric: string;
  edges: number[]; // object ids, in order around the piece
  seam: string[]; // seam allowance (mm, formula) for each edge
  notches: PointRef[];
  grain: string; // grain line angle in degrees (90 = vertical)
}

export interface Notch {
  at: Pt; // on the cut line
  to: Pt; // inner end of the notch cut
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
    if (n === 2 && Math.abs(s0 - s1) < 1e-9) throw new Error("الحدود لا تكوّن شكلاً مغلقاً");
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
export function cutLine(parts: Pt[][], allowance: number[]): { pts: Pt[]; edges: Pt[][] } {
  const n = parts.length;
  // counter-clockwise outline: outward = right of travel = negative offset
  const off = parts.map((p, i) => (allowance[i] > 0 ? offsetPolyline(p, -allowance[i]) : [...p]));
  const maxA = Math.max(...allowance, 1);
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
  const out: Pt[] = [];
  const edges: Pt[][] = [];
  for (let i = 0; i < n; i++) {
    const seg = subPolyline(off[i], startAt[i], endAt[i]);
    edges.push(seg);
    out.push(...(out.length && dist(out[out.length - 1], seg[0]) < 1e-6 ? seg.slice(1) : seg));
  }
  if (dist(out[0], out[out.length - 1]) < 1e-6) out.pop();
  return { pts: out, edges };
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
  notchPoints: Pt[];
  grainAngle: number;
}

export function buildPiece(inp: PieceInput): PieceGeo {
  const { sew, parts, order } = outline(inp.edges);
  // allowance follows the parts (outline() may have reversed the order)
  const allowance = order.map((k) => inp.allowance[k]);
  const cl = allowance.some((a) => a > 0) ? cutLine(parts, allowance) : { pts: [...sew], edges: parts };
  const cut = cl.pts;
  const notches = inp.notchPoints.map((x) => {
    const { pt, n } = outwardAt(sew, x);
    const k = nearestPart(parts, pt);
    const a = allowance[k];
    const depth = a > 0 ? Math.min(a, 6) : 6;
    const at: Pt = [pt[0] + n[0] * a, pt[1] + n[1] * a];
    return { at, to: [at[0] - n[0] * depth, at[1] - n[1] * depth] as Pt };
  });
  const centre = centroid(sew);
  const ys = sew.map((p) => p[1]);
  const xs = sew.map((p) => p[0]);
  const ang = (inp.grainAngle * Math.PI) / 180;
  const half = 0.3 * Math.max(Math.max(...ys) - Math.min(...ys), Math.max(...xs) - Math.min(...xs));
  const g: [Pt, Pt] = [
    [centre[0] - Math.cos(ang) * half, centre[1] - Math.sin(ang) * half],
    [centre[0] + Math.cos(ang) * half, centre[1] + Math.sin(ang) * half],
  ];
  return { id: inp.piece.id, sew, cut, cutEdges: cl.edges, edges: parts, order, notches, grain: g, centre };
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
