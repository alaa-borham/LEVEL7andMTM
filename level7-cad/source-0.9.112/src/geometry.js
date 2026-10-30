/*
 * LEVEL7 CAD geometry. Coordinates and distances are millimetres, y is down.
 * These are independently written starting blocks, not reproductions of any
 * commercial drafting system. A fitted garment requires a toile and adjustment.
 */

const EPS = 1e-8;
const MAX_COORD = 1_000_000;
const MAX_POINTS = 10_000;
const MAX_TOTAL_POINTS = 100_000;
const GENERATORS = new Set(['skirt-front', 'skirt-back', 'bodice-front', 'bodice-back', 'trouser-front', 'trouser-back']);
const MEASUREMENT_LIMITS = {
  waist: [100, 4000], hip: [100, 4500], bust: [100, 4500], neck: [100, 1500],
  backLength: [80, 1500], shoulder: [20, 600], armholeDepth: [40, 800],
  skirtLength: [100, 2500], trouserLength: [200, 2500], inseam: [80, 2000], ease: [0, 800],
};
let idCounter = 0;

export function uid(prefix = 'id') {
  const clean = String(prefix).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'id';
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${(++idCounter).toString(36)}`;
  return `${clean}_${random}`;
}

export function defaultMeasurements() {
  return { waist: 760, hip: 1000, bust: 920, neck: 370, backLength: 400, shoulder: 125,
    armholeDepth: 210, skirtLength: 600, trouserLength: 1000, inseam: 760, ease: 40 };
}

export function newProject(name = 'مشروع باترون جديد') {
  return { schemaVersion: 1, name, units: 'mm', measurements: defaultMeasurements(),
    sizeStep: 40, sizes: [-2, -1, 0, 1, 2], pieces: [] };
}

function finite(value, label, limit = MAX_COORD) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limit) {
    throw new Error(`${label} must be a finite number within ±${limit}.`);
  }
  return value;
}

function xy(point, label = 'Point') {
  if (!point || typeof point !== 'object' || Array.isArray(point)) throw new Error(`${label} is invalid.`);
  finite(point.x, `${label}.x`); finite(point.y, `${label}.y`);
  return point;
}

function copyPoint(p) {
  return { ...p, ...(p.in ? { in: { ...p.in } } : {}), ...(p.out ? { out: { ...p.out } } : {}),
    ...(p.grade ? { grade: { ...p.grade } } : {}) };
}

function clonePiece(piece) {
  return { ...piece, offset: { ...(piece.offset ?? { x: 0, y: 0 }) }, points: piece.points.map(copyPoint),
    notches: (piece.notches ?? []).map(n => ({ ...n })),
    ...(piece.grain ? { grain: { a: { ...piece.grain.a }, b: { ...piece.grain.b } } } : {}),
    ...(piece.internalLines ? { internalLines: piece.internalLines.map(l => ({ ...l, points: l.points.map(copyPoint) })) } : {}),
    ...(piece.generator ? { generator: { ...piece.generator } } : {}) };
}

export function makePiece(name, points, closed = false) {
  if (!Array.isArray(points) || points.length > MAX_POINTS) throw new Error('Invalid number of points.');
  return { id: uid('piece'), name: String(name || 'قطعة جديدة'),
    points: points.map(p => ({ ...copyPoint(xy(p)), id: p.id || uid('pt') })), closed: Boolean(closed),
    offset: { x: 0, y: 0 }, seamAllowance: 10, quantity: 1, onFold: false, notches: [], internalLines: [] };
}

const isCurve = (a, b) => Boolean(a.out || b.in);
const lerp = (a, b, t) => a + (b - a) * t;
const length = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const cross = (a, b) => a.x * b.y - a.y * b.x;
const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const same = (a, b, tolerance = EPS) => length(a, b) <= tolerance;

function cubicAt(a, c1, c2, b, t) {
  const u = 1 - t;
  return { x: u ** 3 * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * b.x,
    y: u ** 3 * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * b.y };
}

function* edges(piece) {
  const pts = piece.points ?? [];
  const count = piece.closed ? pts.length : Math.max(pts.length - 1, 0);
  for (let i = 0; i < count; i++) yield [pts[i], pts[(i + 1) % pts.length]];
}

/** Local outline points. Closed outlines do not repeat the first point. */
export function sampleOutline(piece, stepsPerCurve = 16) {
  if (!Number.isInteger(stepsPerCurve) || stepsPerCurve < 2 || stepsPerCurve > 256) {
    throw new Error('Curve sampling must be an integer from 2 to 256.');
  }
  if (!piece.points?.length) return [];
  const result = [{ x: piece.points[0].x, y: piece.points[0].y }];
  for (const [a, b] of edges(piece)) {
    if (isCurve(a, b)) {
      for (let i = 1; i <= stepsPerCurve; i++) result.push(cubicAt(a, a.out ?? a, b.in ?? b, b, i / stepsPerCurve));
    } else result.push({ x: b.x, y: b.y });
  }
  if (piece.closed && result.length > 1 && same(result[0], result.at(-1))) result.pop();
  return result;
}

function numberText(n) {
  finite(n, 'SVG coordinate');
  return String(Number(n.toFixed(6)));
}
const coordText = p => `${numberText(p.x)} ${numberText(p.y)}`;

export function outlinePath(piece) {
  if (!piece.points?.length) return '';
  let path = `M ${coordText(piece.points[0])}`;
  for (const [a, b] of edges(piece)) {
    path += isCurve(a, b) ? ` C ${coordText(a.out ?? a)} ${coordText(b.in ?? b)} ${coordText(b)}` : ` L ${coordText(b)}`;
  }
  return path + (piece.closed ? ' Z' : '');
}

function extrema(p0, p1, p2, p3) {
  const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3), b = 6 * (p0 - 2 * p1 + p2), c = 3 * (p1 - p0);
  if (Math.abs(a) < EPS) return Math.abs(b) < EPS ? [] : [-c / b].filter(t => t > 0 && t < 1);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  const q = -.5 * (b + (b < 0 ? -root : root));
  const roots = Math.abs(q) < EPS ? [-b / (2 * a)] : [q / a, c / q];
  return roots.filter(t => t > 0 && t < 1);
}

const emptyBounds = () => ({ minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 });
function boundsOf(points) {
  if (!points.length) return emptyBounds();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Exact cubic extrema; bounds are local and exclude seam allowance and guides. */
export function pieceBounds(piece) {
  const candidates = (piece.points ?? []).map(p => ({ x: p.x, y: p.y }));
  for (const [a, b] of edges(piece)) {
    if (!isCurve(a, b)) continue;
    const c1 = a.out ?? a, c2 = b.in ?? b;
    const ts = [...extrema(a.x, c1.x, c2.x, b.x), ...extrema(a.y, c1.y, c2.y, b.y)];
    for (const t of ts) candidates.push(cubicAt(a, c1, c2, b, t));
  }
  return boundsOf(candidates);
}

/** World bounds, including each piece's independent layout offset. */
export function projectBounds(pieces) {
  const candidates = [];
  for (const p of pieces) {
    if (!p.points?.length) continue;
    const b = pieceBounds(p), o = p.offset ?? { x: 0, y: 0 };
    candidates.push({ x: b.minX + o.x, y: b.minY + o.y }, { x: b.maxX + o.x, y: b.maxY + o.y });
  }
  return boundsOf(candidates);
}

function signedArea(points) {
  if (points.length < 3) return 0;
  const origin = points[0]; let sum = 0;
  for (let i = 0; i < points.length; i++) sum += cross(subtract(points[i], origin), subtract(points[(i + 1) % points.length], origin));
  return sum / 2;
}

function polynomial(p0, p1, p2, p3) { return [p0, 3 * (p1 - p0), 3 * (p0 - 2 * p1 + p2), -p0 + 3 * p1 - 3 * p2 + p3]; }

/** Closed area in mm², integrating cubic Bézier segments analytically. */
export function areaOfPiece(piece) {
  if (!piece.closed || piece.points.length < 3) return 0;
  let integral = 0; const origin = piece.points[0];
  for (const [start, end] of edges(piece)) {
    const a = subtract(start, origin), b = subtract(end, origin);
    if (!isCurve(start, end)) { integral += cross(a, b); continue; }
    const c1 = subtract(start.out ?? start, origin), c2 = subtract(end.in ?? end, origin);
    const xs = polynomial(a.x, c1.x, c2.x, b.x), ys = polynomial(a.y, c1.y, c2.y, b.y);
    for (let i = 0; i <= 3; i++) for (let j = 1; j <= 3; j++) integral += (xs[i] * j * ys[j] - ys[i] * j * xs[j]) / (i + j);
  }
  return Math.abs(integral / 2);
}

function cubicLength(a, c1, c2, b, tolerance = .005, depth = 0) {
  const chord = length(a, b), polygon = length(a, c1) + length(c1, c2) + length(c2, b);
  if (depth >= 16 || polygon - chord <= tolerance) return (chord + polygon) / 2;
  const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  const p01 = mid(a, c1), p12 = mid(c1, c2), p23 = mid(c2, b), p012 = mid(p01, p12), p123 = mid(p12, p23), centre = mid(p012, p123);
  return cubicLength(a, p01, p012, centre, tolerance / 2, depth + 1) + cubicLength(centre, p123, p23, b, tolerance / 2, depth + 1);
}

/** Perimeter/open path length in mm, with adaptive numerical curve integration. */
export function perimeterOfPiece(piece) {
  let sum = 0;
  for (const [a, b] of edges(piece)) sum += isCurve(a, b) ? cubicLength(a, a.out ?? a, b.in ?? b, b) : length(a, b);
  return sum;
}

function cleanPolygon(points) {
  if (!Array.isArray(points) || points.length > MAX_POINTS * 256) throw new Error('Invalid polygon size.');
  const clean = [];
  for (const point of points) {
    xy(point, 'Polygon point');
    if (!clean.length || !same(point, clean.at(-1))) clean.push({ x: point.x, y: point.y });
  }
  if (clean.length > 1 && same(clean[0], clean.at(-1))) clean.pop();
  return clean;
}

function onSegment(p, a, b) {
  const ab = subtract(b, a), ap = subtract(p, a);
  return Math.abs(cross(ab, ap)) <= EPS * Math.max(1, length(a, b)) &&
    p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS &&
    p.y >= Math.min(a.y, b.y) - EPS && p.y <= Math.max(a.y, b.y) + EPS;
}

function insidePolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (onSegment(point, a, b)) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/* Keep the outer loop if a simple miter offset produces a small crossing loop.
 * This is a basic single-outline offset, not a general polygon Boolean engine.
 */
function removeCrossingLoops(polygon, orientation) {
  let result = polygon;
  for (let pass = 0; pass < 24 && result.length <= 4096; pass++) {
    let changed = false;
    outer: for (let i = 0; i < result.length; i++) {
      const a = result[i], b = result[(i + 1) % result.length], r = subtract(b, a);
      for (let j = i + 2; j < result.length; j++) {
        if (i === 0 && j === result.length - 1) continue;
        const c = result[j], d = result[(j + 1) % result.length], s = subtract(d, c), denominator = cross(r, s);
        if (Math.abs(denominator) < EPS) continue;
        const ca = subtract(c, a), t = cross(ca, s) / denominator, u = cross(ca, r) / denominator;
        if (t <= EPS || t >= 1 - EPS || u <= EPS || u >= 1 - EPS) continue;
        const hit = { x: a.x + t * r.x, y: a.y + t * r.y };
        const loops = [[hit, ...result.slice(i + 1, j + 1)], [hit, ...result.slice(j + 1), ...result.slice(0, i + 1)]];
        const valid = loops.filter(loop => signedArea(loop) * orientation > EPS);
        if (!valid.length) return [];
        result = valid.sort((p, q) => Math.abs(signedArea(q)) - Math.abs(signedArea(p)))[0];
        changed = true; break outer;
      }
    }
    if (!changed) break;
  }
  return cleanPolygon(result);
}

/**
 * Closed polygon offset. Positive distance is outward for either winding.
 * Duplicate/zero edges are removed; acute joins use bevels above a 4× miter.
 * Collapsed inward offsets return []; if an inward shape splits, only the
 * largest retained loop can be returned by this single-outline API.
 */
export function offsetPolygon(points, distance) {
  finite(distance, 'Offset distance', 10_000);
  const polygon = cleanPolygon(points);
  if (polygon.length < 3) return [];
  const originalArea = signedArea(polygon);
  if (Math.abs(originalArea) < EPS) return [];
  if (Math.abs(distance) < EPS) return polygon;
  const orientation = Math.sign(originalArea), dirs = [], normals = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], len = length(a, b);
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    dirs.push(dir); normals.push({ x: orientation * dir.y, y: -orientation * dir.x });
  }
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const previous = (i + polygon.length - 1) % polygon.length, p = polygon[i], d1 = dirs[previous], d2 = dirs[i];
    const a = { x: p.x + normals[previous].x * distance, y: p.y + normals[previous].y * distance };
    const b = { x: p.x + normals[i].x * distance, y: p.y + normals[i].y * distance };
    const denominator = cross(d1, d2);
    if (Math.abs(denominator) < EPS) {
      if (d1.x * d2.x + d1.y * d2.y > 0) result.push(b);
      else result.push(a, b);
      continue;
    }
    const t = cross(subtract(b, a), d2) / denominator;
    const hit = { x: a.x + t * d1.x, y: a.y + t * d1.y };
    if (Number.isFinite(hit.x) && Number.isFinite(hit.y) && length(hit, p) <= 4 * Math.abs(distance) + EPS) result.push(hit);
    else result.push(a, b);
  }
  let clean = cleanPolygon(result);
  if (clean.length < 3 || signedArea(clean) * orientation <= EPS) return [];
  clean = removeCrossingLoops(clean, orientation);
  if (distance < 0 && clean.some((p, i) => !insidePolygon(p, polygon) || !insidePolygon({ x: (p.x + clean[(i + 1) % clean.length].x) / 2, y: (p.y + clean[(i + 1) % clean.length].y) / 2 }, polygon))) return [];
  return clean;
}

export function seamOutline(piece) {
  if (!piece.closed || piece.points.length < 3 || !piece.seamAllowance) return [];
  if (piece.seamAllowance < 0) throw new Error('Seam allowance must not be negative.');
  return offsetPolygon(sampleOutline(piece, 24), piece.seamAllowance);
}

/** Bake an affine edit around the local outline centre; layout offset stays fixed.
 * Generated shapes become manual after an affine edit so regeneration cannot
 * erase that edit. Their point grading vectors are transformed with the shape.
 */
export function transformPiece(piece, options = {}) {
  const { translateX = 0, translateY = 0, rotation = 0, scaleX = 1, scaleY = 1, mirrorX = false, mirrorY = false } = options;
  for (const [key, value] of Object.entries({ translateX, translateY, rotation, scaleX, scaleY })) finite(value, key);
  if (Math.abs(scaleX) < EPS || Math.abs(scaleY) < EPS || Math.abs(scaleX) > 1000 || Math.abs(scaleY) > 1000) throw new Error('Scale must be nonzero and within ±1000.');
  const bounds = pieceBounds(piece), cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
  const angle = rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle), sx = scaleX * (mirrorX ? -1 : 1), sy = scaleY * (mirrorY ? -1 : 1);
  const vector = p => ({ x: cos * p.x * sx - sin * p.y * sy, y: sin * p.x * sx + cos * p.y * sy });
  const transform = p => { const v = vector({ x: p.x - cx, y: p.y - cy }); return xy({ x: v.x + cx + translateX, y: v.y + cy + translateY }, 'Transformed point'); };
  const map = p => ({ ...p, ...transform(p), ...(p.in ? { in: transform(p.in) } : {}), ...(p.out ? { out: transform(p.out) } : {}),
    ...(p.grade ? { grade: (() => { const v = vector({ x: p.grade.dx, y: p.grade.dy }); return { dx: v.x, dy: v.y }; })() } : {}) });
  const result = clonePiece(piece);
  result.points = piece.points.map(map);
  if (piece.grain) result.grain = { a: transform(piece.grain.a), b: transform(piece.grain.b) };
  if (piece.internalLines) result.internalLines = piece.internalLines.map(l => ({ ...l, points: l.points.map(map) }));
  delete result.generator;
  return result;
}

function validateMeasurements(measurements) {
  if (!measurements || typeof measurements !== 'object' || Array.isArray(measurements)) throw new Error('Measurements are required.');
  for (const [name, [minimum, maximum]] of Object.entries(MEASUREMENT_LIMITS)) {
    finite(measurements[name], `Measurement ${name}`, maximum);
    if (measurements[name] < minimum) throw new Error(`Measurement ${name} must be between ${minimum} and ${maximum} mm.`);
  }
}

function sizedMeasurements(measurements, step, sizeStep) {
  const d = step * sizeStep;
  return { ...measurements, waist: measurements.waist + d, hip: measurements.hip + d, bust: measurements.bust + d,
    neck: measurements.neck + d * .15, shoulder: measurements.shoulder + d * .05,
    backLength: measurements.backLength + d * .1, armholeDepth: measurements.armholeDepth + d * .1 };
}

function line(points, label) { return { points, ...(label ? { label } : {}) }; }
function point(x, y, options = {}) { return { x, y, ...options }; }
function draftPiece(name, points, type) {
  return { ...makePiece(name, points, true), generator: { type } };
}

/* Skirt: hip circumference + ease divided into four quarters. Each quarter
 * waist includes its dart intake; removing the dart restores waist + half ease.
 * Hip depth is half back length, limited to 40% of skirt length and 220 mm.
 */
function skirtPieces(m) {
  const width = (m.hip + m.ease) / 4, finishedWaist = (m.waist + m.ease / 2) / 4;
  const hipY = Math.min(220, m.backLength / 2, m.skirtLength * .4), hemY = m.skirtLength, flare = 10;
  return [false, true].map(back => {
    const dart = back ? 30 : 20, waist = finishedWaist + dart, centreY = back ? 0 : 10, sideY = back ? 6 : 0;
    const points = [point(0, centreY, { out: { x: waist / 3, y: centreY } }),
      point(waist, sideY, { in: { x: waist * 2 / 3, y: sideY }, out: { x: lerp(waist, width, .5), y: hipY * .32 } }),
      point(width, hipY, { in: { x: width, y: hipY * .72 } }), point(width + flare, hemY), point(0, hemY)];
    const piece = draftPiece(back ? 'ظهر التنورة — مسودة' : 'أمام التنورة — مسودة', points, back ? 'skirt-back' : 'skirt-front');
    const dartX = waist * .53, waistAt = x => lerp(centreY, sideY, 3 * (x / waist) ** 2 - 2 * (x / waist) ** 3);
    piece.internalLines = [line([point(dartX - dart / 2, waistAt(dartX - dart / 2)), point(dartX, Math.min(hipY * .78, back ? 145 : 115)), point(dartX + dart / 2, waistAt(dartX + dart / 2))], 'بنسة'), line([point(0, hipY), point(width, hipY)], 'خط الورك')];
    piece.grain = { a: point(width * .28, hipY + 25), b: point(width * .28, Math.max(hipY + 40, hemY - 50)) };
    piece.onFold = !back; piece.quantity = back ? 2 : 1; piece.notches = [{ edge: 1, t: .95, depth: 3 }];
    return piece;
  });
}

/* Bodice: quarter bust + ease, measured shoulder length and armhole depth.
 * Neck width = neck / 6 + 5; front neck depth = neck / 6 + 20. These simple
 * blocks include waist darts, without a fitted bust cup or side bust dart.
 */
function bodicePieces(m) {
  const width = (m.bust + m.ease) / 4, neckWidth = m.neck / 6 + 5;
  if (m.backLength <= m.armholeDepth + 40) throw new Error('Back length must exceed armhole depth by at least 40 mm for a bodice.');
  if (neckWidth >= width * .8 || m.shoulder > width * .9) throw new Error('Neck, shoulder and bust measurements are inconsistent for a bodice.');
  return [false, true].map(back => {
    const neckDepth = back ? 20 : m.neck / 6 + 20, shoulderDrop = Math.min(back ? 30 : 40, m.shoulder * .35);
    if (neckDepth >= m.armholeDepth - 15) throw new Error('Front neck depth must remain above the armhole.');
    const shoulderX = neckWidth + Math.sqrt(m.shoulder ** 2 - shoulderDrop ** 2), dart = back ? 20 : 25;
    const waist = (m.waist + m.ease / 2) / 4 + dart, waistY = m.backLength;
    const points = [point(0, neckDepth, { out: { x: neckWidth * .58, y: neckDepth } }),
      point(neckWidth, 0, { in: { x: neckWidth, y: neckDepth * .45 } }),
      point(shoulderX, shoulderDrop, { out: { x: shoulderX + (back ? 6 : -20), y: m.armholeDepth * .6 } }),
      point(width, m.armholeDepth, { in: { x: width - (back ? 25 : 40), y: m.armholeDepth - (back ? 10 : 0) } }),
      point(waist, waistY), point(0, waistY)];
    const piece = draftPiece(back ? 'ظهر الصدر — مسودة' : 'أمام الصدر — مسودة', points, back ? 'bodice-back' : 'bodice-front');
    const dartX = waist * .5, tipY = m.armholeDepth + (waistY - m.armholeDepth) * (back ? .28 : .2);
    piece.internalLines = [line([point(dartX - dart / 2, waistY), point(dartX, tipY), point(dartX + dart / 2, waistY)], 'بنسة الخصر'), line([point(0, m.armholeDepth), point(width, m.armholeDepth)], 'خط الصدر')];
    piece.grain = { a: point(width * .23, neckDepth + 35), b: point(width * .23, waistY - 35) };
    piece.onFold = !back; piece.quantity = back ? 2 : 1; piece.notches = [{ edge: 2, t: back ? .64 : .72, depth: 3 }];
    return piece;
  });
}

/* Trousers: crotch depth = outside length - inseam; quarter hip + ease.
 * Crotch extensions = hip / 20 (front), hip / 10 (back). Knee and hem widths
 * are inferred from hip; the result is a tapered starting block, not a fit rule.
 */
function trouserPieces(m) {
  const width = (m.hip + m.ease) / 4, crotchY = m.trouserLength - m.inseam;
  if (crotchY < 70 || crotchY > 600 || crotchY > m.trouserLength * .6) throw new Error('Trouser length minus inseam must give a crotch depth of 70–600 mm and leave room for the leg.');
  const hipY = Math.min(m.backLength / 2, crotchY * .72), kneeY = crotchY + m.inseam / 2;
  return [false, true].map(back => {
    const dart = back ? 30 : 20, waist = (m.waist + m.ease / 2) / 4 + dart;
    const centreX = width + (back ? 15 : 0), centreY = back ? -25 : 10, sideX = centreX - waist;
    const extension = m.hip / (back ? 10 : 20), tipX = width + extension;
    const legX = width / 2 + (back ? 8 : 0), kneeHalf = (m.hip + m.ease) / 12 + (back ? 10 : 0), hemHalf = (m.hip + m.ease) / 14 + (back ? 8 : 0);
    const points = [point(sideX, 0, { out: { x: sideX + waist / 3, y: centreY / 3 }, in: { x: sideX - 5, y: hipY * .25 } }),
      point(centreX, centreY, { in: { x: sideX + waist * 2 / 3, y: centreY * 2 / 3 } }),
      point(width, hipY, { out: { x: width, y: crotchY - 12 } }),
      point(tipX, crotchY + (back ? 8 : 0), { in: { x: width + extension * .35, y: crotchY }, out: { x: tipX - extension * .45, y: crotchY + 65 } }),
      point(legX + kneeHalf, kneeY, { in: { x: legX + kneeHalf + 12, y: kneeY - 85 } }),
      point(legX + hemHalf, m.trouserLength), point(legX - hemHalf, m.trouserLength),
      point(legX - kneeHalf, kneeY, { out: { x: Math.min(0, legX - kneeHalf), y: hipY + (kneeY - hipY) * .46 } }),
      point(0, hipY, { in: { x: 0, y: hipY + (kneeY - hipY) * .2 }, out: { x: 0, y: hipY * .5 } })];
    const piece = draftPiece(back ? 'ظهر البنطال — مسودة' : 'أمام البنطال — مسودة', points, back ? 'trouser-back' : 'trouser-front');
    const dartX = sideX + waist * .55, waistAt = x => (x - sideX) / waist * centreY;
    piece.internalLines = [line([point(dartX - dart / 2, waistAt(dartX - dart / 2)), point(dartX, Math.min(crotchY * .58, back ? 145 : 110)), point(dartX + dart / 2, waistAt(dartX + dart / 2))], 'بنسة الخصر'),
      line([point(0, hipY), point(width, hipY)], 'خط الورك'), line([point(legX - kneeHalf, kneeY), point(legX + kneeHalf, kneeY)], 'خط الركبة')];
    piece.grain = { a: point(legX, hipY + 30), b: point(legX, m.trouserLength - 50) };
    piece.quantity = 2; piece.notches = [{ edge: 3, t: .65, depth: 3 }, { edge: 7, t: .35, depth: 3 }];
    return piece;
  });
}

function rawBlock(type, m) {
  if (type === 'skirt') return skirtPieces(m);
  if (type === 'bodice') return bodicePieces(m);
  if (type === 'trousers') return trouserPieces(m);
  throw new Error(`Unknown starting block: ${type}.`);
}

export function generateBlock(type, measurements = defaultMeasurements()) {
  validateMeasurements(measurements);
  const base = rawBlock(type, measurements), next = rawBlock(type, sizedMeasurements(measurements, 1, 40));
  base.forEach((piece, index) => {
    piece.points = piece.points.map((p, i) => ({ ...p, grade: { dx: next[index].points[i].x - p.x, dy: next[index].points[i].y - p.y } }));
    piece.offset = { x: index * (pieceBounds(piece).width + 85), y: 0 };
  });
  return base;
}

function familyOf(type) { return type.startsWith('trouser-') ? 'trousers' : type.split('-')[0]; }

function mergeGenerated(oldPiece, fresh, sizeStep) {
  const next = { ...clonePiece(oldPiece), ...fresh, id: oldPiece.id, name: oldPiece.name,
    offset: { ...(oldPiece.offset ?? { x: 0, y: 0 }) }, seamAllowance: oldPiece.seamAllowance,
    quantity: oldPiece.quantity, onFold: oldPiece.onFold,
    notches: (oldPiece.notches ?? []).map(n => ({ ...n })), generator: { ...oldPiece.generator } };
  next.points = fresh.points.map((p, i) => ({ ...copyPoint(p), id: oldPiece.points[i]?.id ?? p.id,
    grade: { dx: p.grade.dx * sizeStep / 40, dy: p.grade.dy * sizeStep / 40 } }));
  return next;
}

export function gradePiece(piece, step, project) {
  finite(step, 'Size step', 50); finite(project.sizeStep, 'Size increment', 500);
  if (!Number.isInteger(step)) throw new Error('Size step must be an integer.');
  if (project.sizeStep <= 0) throw new Error('Size increment must be positive.');
  if (step === 0) return clonePiece(piece);
  if (piece.generator?.type) {
    const m = sizedMeasurements(project.measurements, step, project.sizeStep);
    const fresh = generateBlock(familyOf(piece.generator.type), m).find(p => p.generator.type === piece.generator.type);
    if (!fresh) throw new Error('Unknown piece generator.');
    return mergeGenerated(piece, fresh, project.sizeStep);
  }
  const result = clonePiece(piece);
  result.points = piece.points.map(p => {
    const dx = (p.grade?.dx ?? 0) * step, dy = (p.grade?.dy ?? 0) * step;
    return { ...copyPoint(p), x: p.x + dx, y: p.y + dy,
      ...(p.in ? { in: { x: p.in.x + dx, y: p.in.y + dy } } : {}),
      ...(p.out ? { out: { x: p.out.x + dx, y: p.out.y + dy } } : {}) };
  });
  // Guides use a continuous inverse-distance field from the anchor grade rules.
  const moveGuide = p => {
    let dx = 0, dy = 0, total = 0;
    for (const anchor of piece.points) {
      const d = length(p, anchor);
      if (d < EPS) { dx = (anchor.grade?.dx ?? 0); dy = (anchor.grade?.dy ?? 0); total = 1; break; }
      const w = 1 / (d * d); total += w; dx += (anchor.grade?.dx ?? 0) * w; dy += (anchor.grade?.dy ?? 0) * w;
    }
    dx = total ? dx / total * step : 0; dy = total ? dy / total * step : 0;
    return { ...copyPoint(p), x: p.x + dx, y: p.y + dy,
      ...(p.in ? { in: { x: p.in.x + dx, y: p.in.y + dy } } : {}),
      ...(p.out ? { out: { x: p.out.x + dx, y: p.out.y + dy } } : {}) };
  };
  if (piece.grain) result.grain = { a: moveGuide(piece.grain.a), b: moveGuide(piece.grain.b) };
  if (piece.internalLines) result.internalLines = piece.internalLines.map(l => ({ ...l, points: l.points.map(moveGuide) }));
  for (const p of result.points) xy(p, 'Graded point');
  return result;
}

export function regenerateProject(project) {
  validateProject(project);
  const cache = new Map();
  return { ...project, measurements: { ...project.measurements }, sizes: [...project.sizes], pieces: project.pieces.map(piece => {
    if (!piece.generator?.type) return clonePiece(piece);
    const family = familyOf(piece.generator.type);
    if (!cache.has(family)) cache.set(family, generateBlock(family, project.measurements));
    const fresh = cache.get(family).find(p => p.generator.type === piece.generator.type);
    return mergeGenerated(piece, fresh, project.sizeStep);
  }) };
}

/** Validate imported/editor project data without mutation; returns the input. */
export function validateProject(project) {
  if (!project || typeof project !== 'object' || Array.isArray(project) || project.schemaVersion !== 1 || project.units !== 'mm') throw new Error('Unsupported project schema or units.');
  const text = (v, label, maximum = 200) => { if (typeof v !== 'string' || !v.trim() || v.length > maximum) throw new Error(`${label} must be nonempty text, at most ${maximum} characters.`); };
  text(project.name, 'Project name'); validateMeasurements(project.measurements);
  finite(project.sizeStep, 'Size increment', 500); if (project.sizeStep <= 0) throw new Error('Size increment must be positive.');
  if (!Array.isArray(project.sizes) || !project.sizes.length || project.sizes.length > 51 || project.sizes.some(s => !Number.isInteger(s) || Math.abs(s) > 50) || new Set(project.sizes).size !== project.sizes.length) throw new Error('Sizes must be unique integer steps from −50 to 50, with at most 51 entries.');
  if (!Array.isArray(project.pieces) || project.pieces.length > 1000) throw new Error('A project can contain at most 1000 pieces.');
  let totalPoints = 0; const pieceIds = new Set();
  const checkPoint = (p, label, requireId = false) => {
    xy(p, label); if (requireId) text(p.id, `${label} id`);
    if (p.in !== undefined) xy(p.in, `${label}.in`); if (p.out !== undefined) xy(p.out, `${label}.out`);
    if (p.grade !== undefined) { if (!p.grade || typeof p.grade !== 'object') throw new Error('Invalid grade vector.'); finite(p.grade.dx, 'Grade dx', 10_000); finite(p.grade.dy, 'Grade dy', 10_000); }
    if (++totalPoints > MAX_TOTAL_POINTS) throw new Error('Project contains too many points.');
  };
  for (const piece of project.pieces) {
    if (!piece || typeof piece !== 'object' || Array.isArray(piece)) throw new Error('Invalid piece.');
    text(piece.id, 'Piece id'); text(piece.name, 'Piece name');
    if (pieceIds.has(piece.id)) throw new Error('Piece ids must be unique.'); pieceIds.add(piece.id);
    if (typeof piece.closed !== 'boolean' || typeof piece.onFold !== 'boolean') throw new Error('Closed and onFold must be booleans.');
    if (!Array.isArray(piece.points) || piece.points.length > MAX_POINTS || (piece.closed && piece.points.length < 3)) throw new Error('A closed piece needs at least three anchors; a piece can contain at most 10000 anchors.');
    const pointIds = new Set();
    for (const p of piece.points) { checkPoint(p, 'Anchor', true); if (pointIds.has(p.id)) throw new Error('Anchor ids must be unique within each piece.'); pointIds.add(p.id); }
    xy(piece.offset, 'Piece offset'); finite(piece.seamAllowance, 'Seam allowance', 1000); if (piece.seamAllowance < 0) throw new Error('Seam allowance must not be negative.');
    if (!Number.isInteger(piece.quantity) || piece.quantity < 1 || piece.quantity > 1000) throw new Error('Quantity must be an integer from 1 to 1000.');
    if (piece.generator !== undefined && (!piece.generator || !GENERATORS.has(piece.generator.type))) throw new Error('Unknown piece generator.');
    if (piece.grain !== undefined) { if (!piece.grain || typeof piece.grain !== 'object') throw new Error('Invalid grainline.'); xy(piece.grain.a, 'Grainline start'); xy(piece.grain.b, 'Grainline end'); }
    if (!Array.isArray(piece.notches) || piece.notches.length > 10_000) throw new Error('Invalid notches.');
    const edgeCount = piece.closed ? piece.points.length : Math.max(0, piece.points.length - 1);
    for (const n of piece.notches) {
      if (!n || !Number.isInteger(n.edge) || n.edge < 0 || n.edge >= edgeCount) throw new Error('Notch edge is outside the outline.');
      finite(n.t, 'Notch position', 1); finite(n.depth, 'Notch depth', 1000); if (n.t < 0 || n.depth < 0) throw new Error('Notch position/depth must not be negative.');
    }
    if (piece.internalLines !== undefined) {
      if (!Array.isArray(piece.internalLines) || piece.internalLines.length > MAX_POINTS) throw new Error('Invalid internal lines.');
      for (const line of piece.internalLines) {
        if (!line || !Array.isArray(line.points) || line.points.length > MAX_POINTS) throw new Error('Invalid internal line.');
        for (const p of line.points) checkPoint(p, 'Internal point');
      }
    }
  }
  return project;
}
