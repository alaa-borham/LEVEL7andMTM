// 2D geometry on polylines (a line is a polyline with two points). Units: mm, y up.

export type Pt = [number, number];

export const dist = (a: Pt, b: Pt): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function polyLen(p: Pt[]): number {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += dist(p[i - 1], p[i]);
  return s;
}

/** Point at arc length d from the start (or end); extrapolates past either end. */
export function pointAlong(p: Pt[], d: number, fromEnd = false): Pt {
  if (p.length === 1) return p[0];
  const q = fromEnd ? [...p].reverse() : p;
  let a = q[0];
  let b = q[1];
  if (d > 0) {
    let acc = 0;
    for (let i = 1; i < q.length; i++) {
      a = q[i - 1];
      b = q[i];
      const L = dist(a, b);
      if (acc + L >= d || i === q.length - 1) break;
      acc += L;
    }
    d -= acc;
  }
  const L = dist(a, b) || 1;
  return [a[0] + ((b[0] - a[0]) * d) / L, a[1] + ((b[1] - a[1]) * d) / L];
}

/** Unit tangent at arc length d. */
export function directionAt(p: Pt[], d: number): Pt {
  let a = p[0];
  let b = p[1];
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    a = p[i - 1];
    b = p[i];
    const L = dist(a, b);
    if (acc + L >= d - 1e-9) break;
    acc += L;
  }
  const L = dist(a, b) || 1;
  return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
}

export function lineIntersection(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
  const d = (a2[0] - a1[0]) * (b2[1] - b1[1]) - (a2[1] - a1[1]) * (b2[0] - b1[0]);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((b1[0] - a1[0]) * (b2[1] - b1[1]) - (b1[1] - a1[1]) * (b2[0] - b1[0])) / d;
  return [a1[0] + t * (a2[0] - a1[0]), a1[1] + t * (a2[1] - a1[1])];
}

/** Param of x projected on segment a-b (0 at a, 1 at b). */
function segParam(x: Pt, a: Pt, b: Pt): number {
  const L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1;
  return ((x[0] - a[0]) * (b[0] - a[0]) + (x[1] - a[1]) * (b[1] - a[1])) / L2;
}

export interface Crossing {
  pt: Pt;
  s: number; // arc position on the first polyline (can be < 0 or > length: extension)
}

/**
 * Crossings of polyline p with polyline q. The first and last segments of both
 * are extended to infinity, as in GRAFIS when lines are cut or extended.
 */
export function crossings(p: Pt[], q: Pt[], extend = true): Crossing[] {
  const out: Crossing[] = [];
  const n = p.length - 1;
  const m = q.length - 1;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const a1 = p[i];
    const a2 = p[i + 1];
    const L = dist(a1, a2);
    if (L === 0) continue;
    for (let j = 0; j < m; j++) {
      const x = lineIntersection(a1, a2, q[j], q[j + 1]);
      if (!x) continue;
      const t = segParam(x, a1, a2);
      const u = segParam(x, q[j], q[j + 1]);
      const tOk = (t >= -1e-9 || (extend && i === 0)) && (t <= 1 + 1e-9 || (extend && i === n - 1));
      const uOk = (u >= -1e-9 || (extend && j === 0)) && (u <= 1 + 1e-9 || (extend && j === m - 1));
      if (tOk && uOk) out.push({ pt: x, s: acc + t * L });
    }
    // an end of q lying on this segment (q runs along p there)
    for (const e of [q[0], q[m]]) {
      const t = segParam(e, a1, a2);
      if ((t < -1e-9 && !(extend && i === 0)) || (t > 1 + 1e-9 && !(extend && i === n - 1))) continue;
      const proj: Pt = [a1[0] + t * (a2[0] - a1[0]), a1[1] + t * (a2[1] - a1[1])];
      if (dist(proj, e) < 1e-3) out.push({ pt: proj, s: acc + t * L });
    }
    acc += L;
  }
  return out;
}

/** Part of p between arc positions s0 < s1; positions outside p extend it. */
export function subPolyline(p: Pt[], s0: number, s1: number): Pt[] {
  const L = polyLen(p);
  const out: Pt[] = [pointAlong(p, s0)];
  let acc = 0;
  // interior vertices only: the end vertices lie on the extension lines anyway
  for (let i = 1; i < p.length - 1; i++) {
    acc += dist(p[i - 1], p[i]);
    if (acc > s0 + 1e-9 && acc < s1 - 1e-9) out.push(p[i]);
  }
  out.push(s1 <= L ? pointAlong(p, s1) : pointAlong(p, L - s1, true));
  return out;
}

export function mirrorPt(p: Pt, origin: Pt, d: Pt): Pt {
  const n = Math.hypot(d[0], d[1]) || 1;
  const dx = d[0] / n;
  const dy = d[1] / n;
  const vx = p[0] - origin[0];
  const vy = p[1] - origin[1];
  const t = vx * dx + vy * dy;
  const fx = origin[0] + t * dx;
  const fy = origin[1] + t * dy;
  return [2 * fx - p[0], 2 * fy - p[1]];
}

/** Distance from point x to polyline p, and the arc position of the closest point. */
export function closestOnPolyline(p: Pt[], x: Pt): { d: number; s: number; pt: Pt } {
  let best = { d: Infinity, s: 0, pt: p[0] };
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1];
    const b = p[i];
    const L = dist(a, b);
    const t = Math.max(0, Math.min(1, segParam(x, a, b)));
    const q: Pt = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    const d = dist(q, x);
    if (d < best.d) best = { d, s: acc + t * L, pt: q };
    acc += L;
  }
  return best;
}

const unit = (v: Pt): Pt => {
  const n = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / n, v[1] / n];
};

/**
 * Smooth curve through points (cubic Hermite, chord-length tangents).
 * startDir / endDir: optional unit directions at the ends; otherwise the end
 * tangent follows the neighbouring span. Returned as a dense polyline.
 */
/** startScale / endScale: strength of the tangent at the first / last point (1 = normal),
 * as the handle length in GRAFIS. */
export function smoothCurve(pts: Pt[], startDir?: Pt | null, endDir?: Pt | null, perSpan = 24, startScale = 1, endScale = 1): Pt[] {
  const n = pts.length;
  if (n < 2) return [...pts];
  const tan: Pt[] = pts.map((p, i) => {
    if (i > 0 && i < n - 1) {
      const a = unit([p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]]);
      const b = unit([pts[i + 1][0] - p[0], pts[i + 1][1] - p[1]]);
      return unit([a[0] + b[0], a[1] + b[1]]);
    }
    return [0, 0];
  });
  const chord = (i: number): Pt => unit([pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]]);
  // free ends: mirror the neighbouring tangent about the chord (quadratic end condition)
  const freeEnd = (c: Pt, t: Pt): Pt => (n === 2 ? c : unit([2 * c[0] * (c[0] * t[0] + c[1] * t[1]) - t[0], 2 * c[1] * (c[0] * t[0] + c[1] * t[1]) - t[1]]));
  tan[0] = startDir ? unit(startDir) : freeEnd(chord(0), n > 2 ? tan[1] : chord(0));
  tan[n - 1] = endDir ? unit(endDir) : freeEnd(chord(n - 2), n > 2 ? tan[n - 2] : chord(n - 2));
  if (n === 2 && startDir && !endDir) tan[1] = freeEnd(chord(0), tan[0]);
  if (n === 2 && endDir && !startDir) tan[0] = freeEnd(chord(0), tan[1]);

  const out: Pt[] = [pts[0]];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const m = dist(p0, p1);
    const s0 = i === 0 ? startScale : 1, s1 = i === n - 2 ? endScale : 1;
    const t0: Pt = [tan[i][0] * s0, tan[i][1] * s0];
    const t1: Pt = [tan[i + 1][0] * s1, tan[i + 1][1] * s1];
    for (let k = 1; k <= perSpan; k++) {
      const s = k / perSpan;
      const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
      const h10 = s ** 3 - 2 * s ** 2 + s;
      const h01 = -2 * s ** 3 + 3 * s ** 2;
      const h11 = s ** 3 - s ** 2;
      out.push([
        h00 * p0[0] + h10 * m * t0[0] + h01 * p1[0] + h11 * m * t1[0],
        h00 * p0[1] + h10 * m * t0[1] + h01 * p1[1] + h11 * m * t1[1],
      ]);
    }
  }
  return out;
}

/** Polyline moved sideways by d (positive = left of the direction of travel). */
export function offsetPolyline(p: Pt[], d: number): Pt[] {
  return p.map((q, i) => {
    const a = p[Math.max(0, i - 1)];
    const b = p[Math.min(p.length - 1, i + 1)];
    const t = unit([b[0] - a[0], b[1] - a[1]]);
    return [q[0] - t[1] * d, q[1] + t[0] * d] as Pt;
  });
}
