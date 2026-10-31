import { describe, expect, it } from "vitest";
import { emptyModel, type Model } from "./model";
import { markerItems, toAamaDxf, toPlt } from "./export";
import { parseMarker, parseMarkerDxf, toIsoCut, toMarkerPlt } from "./iso";

function design(): Model {
  const m = emptyModel("thobe");
  m.measurements.push({ id: 1, name: "width", value: 100 });
  const steps = [
    { op: "point", id: 1, x: "0", y: "0" }, { op: "point", id: 2, x: "X1", y: "0" }, { op: "point", id: 3, x: "X1", y: "200" }, { op: "point", id: 4, x: "0", y: "200" },
    { op: "line", id: 5, p1: { obj: 1 }, p2: { obj: 2 } }, { op: "line", id: 6, p1: { obj: 2 }, p2: { obj: 3 } }, { op: "line", id: 7, p1: { obj: 3 }, p2: { obj: 4 } }, { op: "line", id: 8, p1: { obj: 4 }, p2: { obj: 1 } },
    { op: "pointOn", id: 9, on: 6, dist: "50", unit: "%", from: "start" },
  ] as Model["steps"];
  const piece = { id: 1, name: "front", quantity: 1, fabric: "", edges: [5, 6, 7, 8], seam: ["10", "10", "10", "10"], notches: [{ obj: 9 }], grain: "90" };
  m.parts = [{ no: 1, name: "front", steps, names: {}, nextId: 10, pieces: [piece], production: true, amount: 1, mirrored: 1 }];
  m.activePart = 0;
  m.steps = steps;
  m.pieces = [piece];
  return m;
}
const blocks = (iso: string) => iso.replace(/\r\n/g, "").split("*").filter(Boolean);

describe("ISO cutter file from a marker", () => {
  it("AAMA marker DXF → ISO: pieces, notches as slits, outline last, 0.1 mm units", () => {
    const r = markerItems(design());
    const m = parseMarker("m.dxf", toAamaDxf(r.items, { style: "thobe", size: "" }));
    expect(m.pieces.length).toBe(2); // normal + mirrored
    expect(m.pieces.every((p) => p.notches.length === 1 && p.holes.length === 0)).toBe(true);
    expect(Math.round(m.width)).toBe(220); // 200 + 2 x 10 seam allowance
    const iso = toIsoCut(m, { name: "thobe", notches: "slit", newline: true });
    const b = blocks(iso);
    expect(b.slice(0, 3)).toEqual(["H1", "M20", `thobe/L=${m.length.toFixed(1)}/W=${m.width.toFixed(1)}`]);
    expect(b.slice(3, 5)).toEqual(["N1", "G71"]);
    expect(b[b.length - 1]).toBe("M0");
    expect(b.filter((s) => s === "M14").length).toBe(4); // 2 notches + 2 outlines
    expect(b).toContain("X0Y0"); // origin at the lower-left corner of the marker
    expect(b).toContain("X1200Y2200"); // 120 mm x 220 mm in 0.1 mm
    // first piece: the notch is cut before its outline
    const n2 = b.indexOf("N2");
    const first = b.slice(0, n2), down = first.flatMap((s, i) => (s === "M14" ? [i] : []));
    expect(down.length).toBe(2);
    expect(first[down[0] + 2]).toBe("M15"); // a slit is one cut
    expect(iso).not.toMatch(/[^\x20-\x7E\r\n]/);
    expect(blocks(toIsoCut(m, { name: "x", notches: "none", newline: false })).filter((s) => s === "M14").length).toBe(2);
  });
  it("nested DXF with rotated blocks, LWPOLYLINE, cut-out and drill hole", () => {
    const g = (...kv: (string | number)[]) => kv.map(String).join("\n");
    const dxf = g(
      0, "SECTION", 2, "BLOCKS",
      0, "BLOCK", 8, 0, 2, "A", 10, 0, 20, 0,
      0, "LWPOLYLINE", 8, 1, 90, 4, 70, 1, 10, 0, 20, 0, 10, 100, 20, 0, 10, 100, 20, 50, 10, 0, 20, 50,
      0, "LWPOLYLINE", 8, 11, 90, 4, 70, 1, 10, 40, 20, 20, 10, 60, 20, 20, 10, 60, 20, 30, 10, 40, 20, 30,
      0, "POINT", 8, 13, 10, 20, 20, 25,
      0, "LINE", 8, 14, 10, 5, 20, 5, 11, 95, 21, 5,
      0, "ENDBLK",
      0, "ENDSEC", 0, "SECTION", 2, "ENTITIES",
      0, "INSERT", 8, 1, 2, "A", 10, 1000, 20, 500,
      0, "INSERT", 8, 1, 2, "A", 10, 1200, 20, 500, 50, 90,
      0, "ENDSEC", 0, "EOF") + "\n";
    const m = parseMarkerDxf(dxf);
    expect(m.pieces.length).toBe(2);
    expect(m.pieces.map((p) => [p.holes.length, p.drills.length])).toEqual([[1, 1], [1, 1]]);
    expect(m.skipped).toBe(2); // the sewing lines
    expect([Math.round(m.length), Math.round(m.width)]).toEqual([200, 100]); // 1000..1200 x 500..600
    const b = blocks(toIsoCut(m, { name: "nest", notches: "slit", newline: true }));
    const n2 = b.indexOf("N2");
    // drill, then the cut-out, then the outline
    expect(b.slice(0, n2).filter((s) => /^M(14|43)$/.test(s))).toEqual(["M43", "M14", "M14"]);
    expect(b).toContain("X200Y250"); // drill hole of piece 1 at (20, 25)
  });
  it("HPGL marker: pen 1 is cut, notch shapes stay with their piece", () => {
    const r = markerItems(design());
    const m = parseMarker("m.plt", toPlt(r.items, { size: "" }));
    expect(m.pieces.length).toBe(2);
    expect(m.pieces.every((p) => p.notches.length === 1)).toBe(true);
    expect(m.skipped).toBe(4); // sewing and grain lines of pen 2
  });
});

describe("PLT of the nested marker", () => {
  it("pen 1 cut lines in ISO order, pen 2 other lines and drill crosses, reads back the same", () => {
    const g = (...kv: (string | number)[]) => kv.map(String).join("\n");
    const dxf = g(0, "SECTION", 2, "ENTITIES",
      0, "LWPOLYLINE", 8, 1, 90, 4, 70, 1, 10, 0, 20, 0, 10, 100, 20, 0, 10, 100, 20, 50, 10, 0, 20, 50,
      0, "LINE", 8, 4, 10, 100, 20, 25, 11, 95, 21, 25,
      0, "POINT", 8, 13, 10, 20, 20, 25,
      0, "LINE", 8, 7, 10, 50, 20, 10, 11, 50, 21, 40,
      0, "ENDSEC", 0, "EOF") + "\n";
    const m = parseMarkerDxf(dxf);
    expect(m.draw.length).toBe(1); // the grain line
    const plt = toMarkerPlt(m, { notches: "slit", drawing: true });
    expect(plt.startsWith("IN;SP1;PU4000,1000;PD3800,1000;")).toBe(true); // the notch slit first
    expect(plt).toContain("PU0,0;PD4000,0,4000,2000,0,2000,0,0;"); // then the outline, closed
    expect(plt).toContain("SP2;PU2000,400;PD2000,1600;"); // grain line with pen 2
    expect(plt.trim().endsWith("PU;SP0;")).toBe(true);
    expect(toMarkerPlt(m, { notches: "none", drawing: false })).toBe("IN;SP1;PU0,0;PD4000,0,4000,2000,0,2000,0,0;PU;SP0;\n");
    const back = parseMarker("x.plt", plt);
    expect(back.pieces.length).toBe(1);
    expect(back.pieces[0].notches.length).toBe(1);
  });
});
