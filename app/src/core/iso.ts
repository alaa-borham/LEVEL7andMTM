// Cutter files in the ISO (Gerber) format, as read by Bullmer, FK and Yin cutters, from a marker
// (the nested layout) saved by a nesting program as AAMA / ASTM DXF or HPGL (.plt).
// ISO blocks end with "*": H1 file, M20 message, N piece, G71 metric 5.1 (0.1 mm), M15 knife up,
// M14 knife down, XnYn absolute position, M43 drill, M0 end of file.

type P = [number, number];

export interface MarkerPiece {
  cut: P[]; // closed outline (last point not repeated)
  holes: P[][]; // internal cut-outs, cut before the outline
  notches: P[][]; // knife paths from the edge (a slit for AAMA notches, the notch shape from a plotter file)
  drills: P[];
}

export interface Marker {
  pieces: MarkerPiece[];
  length: number; // mm along x
  width: number; // mm along y
  skipped: number; // lines that are not cut (sewing, grain, internal lines, text)
}

export interface IsoOptions {
  name: string;
  notches: "slit" | "none";
  newline: boolean; // one block per line (the controller ignores line breaks)
}

const near = (a: P, b: P, e = 0.05) => Math.abs(a[0] - b[0]) < e && Math.abs(a[1] - b[1]) < e;
const area = (p: P[]) => p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0) / 2;
function inside(pt: P, poly: P[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function distToEdge(pt: P, poly: P[]): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L)) : 0;
    d = Math.min(d, Math.hypot(pt[0] - a[0] - t * dx, pt[1] - a[1] - t * dy));
  }
  return d;
}
const closedOf = (pts: P[]): P[] | null => (pts.length >= 4 && near(pts[0], pts[pts.length - 1], 0.5) ? pts.slice(0, -1) : null);

/** Group loose geometry into pieces: outer closed outlines are pieces; closed outlines inside
 * them are cut-outs; notches and drills go to the piece that holds them. */
function assemble(closed: P[][], notches: P[][], drills: P[], skipped: number, open: P[][]): Marker {
  const sorted = closed.filter((c) => Math.abs(area(c)) > 1).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
  const pieces: MarkerPiece[] = [];
  for (const c of sorted) {
    // a small closed shape on the edge of a piece is a notch (V / castle notch from a plotter file)
    const edge = Math.abs(area(c)) < 150 ? pieces.find((p) => c.some((q) => distToEdge(q, p.cut) < 0.6)) : undefined;
    if (edge) { edge.notches.push([...c, c[0]]); continue; }
    const host = pieces.find((p) => inside(c[0], p.cut) && !p.holes.some((h) => inside(c[0], h)));
    if (host) host.holes.push(c);
    else pieces.push({ cut: c, holes: [], notches: [], drills: [] });
  }
  const owner = (pt: P) => pieces.find((p) => inside(pt, p.cut)) ?? pieces.reduce<MarkerPiece | undefined>((best, p) => (!best || distToEdge(pt, p.cut) < distToEdge(pt, best.cut) ? p : best), undefined);
  for (const n of notches) {
    const p = owner(n[0]);
    if (p) p.notches.push(distToEdge(n[0], p.cut) <= distToEdge(n[n.length - 1], p.cut) ? n : [...n].reverse()); // the slit starts at the edge
  }
  for (const d of drills) pieces.find((p) => inside(d, p.cut))?.drills.push(d);
  // open lines from a plotter file: short ones that touch an outline are notches, the rest are not cut
  for (const o of open) {
    const a = o[0], b = o[o.length - 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const p = len <= 25 ? pieces.find((q) => distToEdge(a, q.cut) < 0.6 || distToEdge(b, q.cut) < 0.6) : undefined;
    if (p) p.notches.push(distToEdge(a, p.cut) <= distToEdge(b, p.cut) ? o : [...o].reverse());
    else skipped++;
  }
  const all = pieces.flatMap((p) => p.cut);
  const xs = all.map((q) => q[0]), ys = all.map((q) => q[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  // the cutter origin is the lower-left corner of the marker
  const sh = (q: P): P => [q[0] - x0, q[1] - y0];
  for (const p of pieces) {
    p.cut = p.cut.map(sh);
    p.holes = p.holes.map((h) => h.map(sh));
    p.notches = p.notches.map((n) => n.map(sh));
    p.drills = p.drills.map(sh);
  }
  pieces.sort((a, b) => Math.min(...a.cut.map((q) => q[0])) - Math.min(...b.cut.map((q) => q[0])) || Math.min(...a.cut.map((q) => q[1])) - Math.min(...b.cut.map((q) => q[1])));
  return { pieces, length: all.length ? Math.max(...xs) - x0 : 0, width: all.length ? Math.max(...ys) - y0 : 0, skipped };
}

// ---------- DXF (AAMA / ASTM marker, or a plain DXF of closed outlines) ----------

interface Ent { type: string; layer: string; v: [number, string][]; verts?: P[]; closed?: boolean }
type M3 = [number, number, number, number, number, number]; // x' = a x + b y + c, y' = d x + e y + f
const mul = (m: M3, n: M3): M3 => [m[0] * n[0] + m[1] * n[3], m[0] * n[1] + m[1] * n[4], m[0] * n[2] + m[1] * n[5] + m[2], m[3] * n[0] + m[4] * n[3], m[3] * n[1] + m[4] * n[4], m[3] * n[2] + m[4] * n[5] + m[5]];
const app = (m: M3, p: P): P => [m[0] * p[0] + m[1] * p[1] + m[2], m[3] * p[0] + m[4] * p[1] + m[5]];
const I: M3 = [1, 0, 0, 0, 1, 0];

export function parseMarkerDxf(text: string): Marker {
  const lines = text.split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([Number(lines[i].trim()), lines[i + 1].trim()]);
  // entities of the BLOCKS and ENTITIES sections
  const blocks = new Map<string, { base: P; ents: Ent[] }>();
  const top: Ent[] = [];
  let section = "", cur: Ent[] | null = null, ent: Ent | null = null, poly: Ent | null = null, block: { name: string; base: P; ents: Ent[] } | null = null;
  const flush = () => {
    if (!ent) return;
    if (ent.type === "VERTEX" && poly) poly.verts!.push([num(ent, 10), num(ent, 20)]);
    else if (ent.type === "SEQEND") { if (poly && cur) cur.push(poly); poly = null; }
    else if (ent.type === "POLYLINE") { poly = { ...ent, verts: [], closed: (num(ent, 70) & 1) === 1 }; }
    else if (ent.type === "BLOCK") { block = { name: str(ent, 2), base: [num(ent, 10), num(ent, 20)], ents: [] }; cur = block.ents; }
    else if (ent.type === "ENDBLK") { if (block) blocks.set(block.name, block); block = null; cur = null; }
    else if (cur) cur.push(ent);
    ent = null;
  };
  for (const [c, v] of pairs) {
    if (c === 0) {
      flush();
      if (v === "SECTION" || v === "ENDSEC" || v === "EOF") { section = v === "SECTION" ? "?" : ""; cur = null; continue; }
      ent = { type: v, layer: "", v: [] };
      continue;
    }
    if (section === "?" && c === 2) { section = v; if (v === "ENTITIES") cur = top; continue; }
    if (ent) { if (c === 8) ent.layer = v; ent.v.push([c, v]); }
  }
  flush();

  const closed: P[][] = [], notches: P[][] = [], drills: P[] = [], open: P[][] = [];
  let skipped = 0;
  const all: { e: Ent; m: M3 }[] = [];
  const walk = (ents: Ent[], m: M3, depth: number) => {
    for (const e of ents) {
      if (e.type === "INSERT" && depth < 8) {
        const b = blocks.get(str(e, 2));
        if (!b) continue;
        const sx = num(e, 41, 1), sy = num(e, 42, 1), r = (num(e, 50) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
        const ins: M3 = [c * sx, -s * sy, num(e, 10), s * sx, c * sy, num(e, 20)];
        walk(b.ents, mul(mul(m, ins), [1, 0, -b.base[0], 0, 1, -b.base[1]]), depth + 1);
      } else all.push({ e, m });
    }
  };
  walk(top, I, 0);
  const layers = new Set(all.map(({ e }) => e.layer));
  const aama = layers.has("1"); // AAMA layer 1 = cut line; otherwise every closed outline is cut
  const role = (l: string) => (!aama ? "any" : l === "1" || l === "11" ? "cut" : ["4", "80", "81", "82", "83"].includes(l) ? "notch" : l === "13" ? "drill" : "skip");
  for (const { e, m } of all) {
    const r = role(e.layer);
    const pts = shape(e).map((p) => app(m, p));
    if (e.type === "POINT" || (e.type === "CIRCLE" && (r === "drill" || num(e, 40) < 3))) {
      const c = e.type === "POINT" ? pts[0] : app(m, [num(e, 10), num(e, 20)]);
      if (r === "drill" || (r === "any" && e.type === "CIRCLE")) drills.push(c);
      else if (r !== "notch") skipped += r === "skip" ? 1 : 0;
      continue;
    }
    if (pts.length < 2) continue;
    if (r === "skip") { skipped++; continue; }
    if (r === "notch") { notches.push([pts[0], pts[pts.length - 1]]); continue; }
    const c = e.closed || e.type === "CIRCLE" ? pts : closedOf(pts);
    if (c) closed.push(c);
    else if (r === "any") open.push(pts);
    else skipped++;
  }
  return assemble(closed, notches, drills, skipped, open);
}
function num(e: Ent, code: number, dflt = 0): number { const f = e.v.find(([c]) => c === code); return f ? Number(f[1]) || 0 : dflt; }
function str(e: Ent, code: number): string { return e.v.find(([c]) => c === code)?.[1] ?? ""; }
function shape(e: Ent): P[] {
  if (e.type === "POLYLINE") return e.verts ?? [];
  if (e.type === "LWPOLYLINE") {
    const out: P[] = [];
    for (const [c, v] of e.v) if (c === 10) out.push([Number(v), 0]); else if (c === 20 && out.length) out[out.length - 1][1] = Number(v);
    e.closed = (num(e, 70) & 1) === 1;
    return out;
  }
  if (e.type === "LINE") return [[num(e, 10), num(e, 20)], [num(e, 11), num(e, 21)]];
  if (e.type === "POINT") return [[num(e, 10), num(e, 20)]];
  if (e.type === "CIRCLE" || e.type === "ARC") {
    const cx = num(e, 10), cy = num(e, 20), r = num(e, 40);
    let a0 = e.type === "ARC" ? num(e, 50) : 0, a1 = e.type === "ARC" ? num(e, 51) : 360;
    if (a1 <= a0) a1 += 360;
    const n = Math.max(8, Math.ceil(((a1 - a0) / 360) * 72));
    const out: P[] = [];
    for (let k = 0; k <= n; k++) { const t = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180; out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
    if (e.type === "CIRCLE") out.pop();
    return out;
  }
  return [];
}

// ---------- HPGL (.plt) ----------

export function parseMarkerPlt(text: string): Marker {
  const U = 40; // plotter units per mm
  const paths: { pen: number; pts: P[] }[] = [];
  let pen = 1, pos: P = [0, 0], down = false, curPath: P[] | null = null;
  const end = () => { if (curPath && curPath.length >= 2) paths.push({ pen, pts: curPath }); curPath = null; };
  for (const raw of text.replace(/LB[^\x03]*\x03/g, "").split(/[;\n\r]+/)) {
    const cmd = raw.trim().slice(0, 2).toUpperCase(), args = raw.trim().slice(2).split(/[ ,]+/).filter(Boolean).map(Number);
    if (cmd === "SP") { end(); pen = args[0] ?? 1; continue; }
    if (cmd !== "PU" && cmd !== "PD" && cmd !== "PA") continue;
    if (cmd === "PU") { end(); down = false; } else if (cmd === "PD") down = true;
    for (let k = 0; k + 1 < args.length; k += 2) {
      const p: P = [args[k] / U, args[k + 1] / U];
      if (down) { curPath ??= [pos]; curPath.push(p); }
      pos = p;
    }
  }
  end();
  // several pens: pen 1 is the cutting pen (pen 2 and up: sewing lines, grain lines, text)
  const pens = new Set(paths.map((p) => p.pen));
  const use = pens.size > 1 && pens.has(1) ? paths.filter((p) => p.pen === 1) : paths;
  const closed: P[][] = [], open: P[][] = [];
  for (const { pts } of use) (closedOf(pts) ? closed.push(closedOf(pts)!) : open.push(pts));
  return assemble(closed, [], [], paths.length - use.length, open);
}

export function parseMarker(name: string, text: string): Marker {
  const m = /\.(plt|hpgl|hpg)$/i.test(name) || /^\s*(IN|PU|SP|DF)[;\d ]/i.test(text) ? parseMarkerPlt(text) : parseMarkerDxf(text);
  if (!m.pieces.length) throw new Error("لم أجد قطعاً مغلقة في ملف التعشيق");
  return m;
}

// ---------- ISO output ----------

export function toIsoCut(marker: Marker, o: IsoOptions): string {
  const b: string[] = [];
  const u = (v: number) => String(Math.round(v * 10)); // 5.1 metric: 0.1 mm, no decimal point
  const xy = (p: P) => `X${u(p[0])}Y${u(p[1])}`;
  const label = o.name.replace(/[^\x20-\x7E]/g, "").replace(/[*\/]/g, "-").trim().slice(0, 30) || "MARKER";
  b.push("H1", "M20", `${label}/L=${marker.length.toFixed(1)}/W=${marker.width.toFixed(1)}`);
  const cutPath = (pts: P[], close: boolean) => {
    b.push("M15", xy(pts[0]), "M14");
    for (const p of pts.slice(1)) b.push(xy(p));
    if (close) b.push(xy(pts[0]));
    b.push("M15");
  };
  marker.pieces.forEach((p, k) => {
    b.push(`N${k + 1}`);
    if (k === 0) b.push("G71");
    for (const d of p.drills) b.push("M15", xy(d), "M43");
    for (const h of p.holes) cutPath(h, true);
    if (o.notches === "slit")
      for (const n of p.notches) if (n.length >= 2 && !near(n[0], n[n.length - 1], 0.01) || n.length > 2) cutPath(n, false);
    // the outline last, so the piece is held by the uncut cloth while its inside is cut
    cutPath(p.cut, true);
  });
  b.push("M0");
  return b.map((s) => s + "*").join(o.newline ? "\r\n" : "") + "\r\n";
}
