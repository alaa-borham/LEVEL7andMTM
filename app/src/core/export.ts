// Piece export: DXF-AAMA (ASTM D6673 layers) for marker/CAD systems and
// HPGL (.plt) for plotters and cutters. Units: mm.

import type { Pt } from "./geometry";
import type { Piece, PieceGeo } from "./piece";
import { evaluateModel, sizeName, withSize, type Model } from "./model";

/** Pieces of every size (base first), each re-evaluated with that size's measurements. */
export function allSizeItems(model: Model): { items: ExportItem[]; errors: string[] } {
  const items: ExportItem[] = [];
  const errors: string[] = [];
  for (let i = -1; i < (model.sizes?.length ?? 0); i++) {
    const r = evaluateModel(withSize(model, i));
    const size = sizeName(model, i);
    for (const piece of model.pieces ?? []) {
      const geo = r.pieces.get(piece.id);
      if (geo) items.push({ piece, geo, size });
      else errors.push(`${piece.name} (${size}): ${r.pieceErrors.get(piece.id) ?? "خطأ"}`);
    }
  }
  return { items, errors };
}

/** AAMA layer numbers used here. */
export const AAMA = { boundary: 1, turn: 2, notch: 4, grain: 7, sew: 14 } as const;

const GAP = 50; // mm between pieces laid out side by side

export interface ExportItem {
  piece: Piece;
  geo: PieceGeo;
  size?: string; // set when several sizes are exported together
}

interface Placed extends ExportItem {
  dx: number; // shift applied to the piece geometry
  dy: number;
}

/** Lay the pieces side by side along x; each size gets its own row. */
export function layout(items: ExportItem[]): Placed[] {
  const rows = [...new Set(items.map((it) => it.size ?? ""))];
  const out: Placed[] = [];
  let y = 0;
  for (const row of rows) {
    let x = 0;
    let h = 0;
    for (const it of items.filter((i) => (i.size ?? "") === row)) {
      const xs = it.geo.cut.map((p) => p[0]);
      const ys = it.geo.cut.map((p) => p[1]);
      out.push({ ...it, dx: x - Math.min(...xs), dy: y - Math.min(...ys) });
      x += Math.max(...xs) - Math.min(...xs) + GAP;
      h = Math.max(h, Math.max(...ys) - Math.min(...ys));
    }
    y += h + GAP;
  }
  return out;
}

/** Non-ASCII text as \U+XXXX, which DXF readers understand regardless of code page. */
function dxfText(s: string): string {
  return [...s].map((c) => (c.charCodeAt(0) < 128 ? c : `\\U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`)).join("");
}

const ascii = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "");
const blockName = (it: ExportItem, i: number) =>
  `P${i + 1}_${ascii(it.piece.name) || "PIECE"}${it.size !== undefined ? `_S${ascii(it.size) || i + 1}` : ""}`.slice(0, 31);

export function toAamaDxf(items: ExportItem[], meta: { style: string; size: string; date?: Date }): string {
  const out: string[] = [];
  const g = (code: number, v: string | number) => out.push(String(code), typeof v === "number" ? v.toFixed(3) : v);
  const placed = layout(items);

  g(0, "SECTION");
  g(2, "HEADER");
  g(9, "$ACADVER");
  g(1, "AC1009");
  g(9, "$INSUNITS");
  g(70, "4");
  g(0, "ENDSEC");

  g(0, "SECTION");
  g(2, "BLOCKS");
  placed.forEach((it, i) => {
    const { piece, geo, dx, dy } = it;
    const T = (p: Pt): [number, number] => [p[0] + dx, p[1] + dy];
    const poly = (layer: number, pts: Pt[]) => {
      g(0, "POLYLINE");
      g(8, String(layer));
      g(66, "1");
      g(70, "0");
      g(10, 0);
      g(20, 0);
      g(30, 0);
      for (const p of [...pts, pts[0]]) {
        const [x, y] = T(p);
        g(0, "VERTEX");
        g(8, String(layer));
        g(10, x);
        g(20, y);
        g(30, 0);
      }
      g(0, "SEQEND");
      g(8, String(layer));
    };
    const line = (layer: number, a: Pt, b: Pt) => {
      const [x1, y1] = T(a);
      const [x2, y2] = T(b);
      g(0, "LINE");
      g(8, String(layer));
      g(10, x1);
      g(20, y1);
      g(30, 0);
      g(11, x2);
      g(21, y2);
      g(31, 0);
    };
    const text = (s: string, k: number) => {
      const [x, y] = T(geo.centre);
      g(0, "TEXT");
      g(8, String(AAMA.boundary));
      g(10, x);
      g(20, y - k * 12);
      g(30, 0);
      g(40, 8);
      g(1, dxfText(s));
    };
    const name = blockName(it, i);
    g(0, "BLOCK");
    g(8, "0");
    g(2, name);
    g(70, "0");
    g(10, 0);
    g(20, 0);
    g(30, 0);
    g(3, name);
    poly(AAMA.boundary, geo.cut);
    for (const p of turnPoints(geo.cut)) {
      const [x, y] = T(p);
      g(0, "POINT");
      g(8, String(AAMA.turn));
      g(10, x);
      g(20, y);
      g(30, 0);
    }
    poly(AAMA.sew, geo.sew);
    for (const n of geo.notches) line(AAMA.notch, n.at, n.to);
    line(AAMA.grain, geo.grain[0], geo.grain[1]);
    text(`Piece Name: ${piece.name}`, 0);
    text(`Quantity: ${piece.quantity}`, 1);
    text(`Material: ${piece.fabric}`, 2);
    text(`Size: ${it.size ?? meta.size}`, 3);
    g(0, "ENDBLK");
  });
  g(0, "ENDSEC");

  g(0, "SECTION");
  g(2, "ENTITIES");
  const header = [
    "ANSI/AAMA VERSION: 1.0.0",
    `PRODUCT: ${meta.style}`,
    `SIZE: ${meta.size}`,
    "UNITS: METRIC",
    `CREATION DATE: ${(meta.date ?? new Date()).toISOString().slice(0, 10)}`,
    "AUTHOR: LEVEL7 CAD",
  ];
  header.forEach((s, k) => {
    g(0, "TEXT");
    g(8, "1");
    g(10, 0);
    g(20, -20 - k * 12);
    g(30, 0);
    g(40, 8);
    g(1, dxfText(s));
  });
  placed.forEach((it, i) => {
    g(0, "INSERT");
    g(8, "1");
    g(2, blockName(it, i));
    g(10, 0);
    g(20, 0);
    g(30, 0);
  });
  g(0, "ENDSEC");
  g(0, "EOF");
  return out.join("\r\n") + "\r\n";
}

/** Corners of a closed polyline: where the direction turns by more than 15 degrees. */
export function turnPoints(p: Pt[]): Pt[] {
  const out: Pt[] = [];
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[(i - 1 + n) % n];
    const b = p[i];
    const c = p[(i + 1) % n];
    const a1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const a2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    let d = Math.abs(a2 - a1);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (d > (15 * Math.PI) / 180) out.push(b);
  }
  return out;
}

/** HPGL for plotters: pen 1 cutting line and notches, pen 2 sewing line, grain line and labels. */
export function toPlt(items: ExportItem[], meta: { size: string }): string {
  const U = 40; // plotter units per mm (1 unit = 0.025 mm)
  const placed = layout(items);
  const cmds: string[] = ["IN", "DT\x03"];
  const pt = (p: Pt, dx: number, dy: number) => `${Math.round((p[0] + dx) * U)},${Math.round((p[1] + dy) * U)}`;
  const path = (pts: Pt[], dx: number, dy: number) => {
    cmds.push(`PU${pt(pts[0], dx, dy)}`);
    cmds.push(`PD${pts.slice(1).map((p) => pt(p, dx, dy)).join(",")}`);
    cmds.push("PU");
  };
  for (const { piece, geo, dx, dy, size } of placed) {
    cmds.push("SP1");
    path([...geo.cut, geo.cut[0]], dx, dy);
    for (const n of geo.notches) path([n.at, n.to], dx, dy);
    cmds.push("SP2");
    path([...geo.sew, geo.sew[0]], dx, dy);
    path(geo.grain, dx, dy);
    // plotters only print ASCII; Arabic names are left out of the label
    const label = [piece.name, `x${piece.quantity}`, size ?? meta.size].map((s) => s.replace(/[^\x20-\x7E]/g, "").trim()).filter(Boolean).join(" ");
    if (label) {
      cmds.push(`PU${pt([geo.centre[0], geo.centre[1] - 20], dx, dy)}`);
      cmds.push(`SI0.3,0.45`);
      cmds.push(`LB${label}\x03`);
    }
  }
  cmds.push("PU", "SP0");
  return cmds.join(";") + ";\n";
}
