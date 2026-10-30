import { toAamaDxf, toPlt } from "../src/core/export";
import { emptyModel, evaluateModel, newId, type Model } from "../src/core/model";
import { signedArea } from "../src/core/piece";

// Four construction lines that overshoot each other, like a real draft.
function rect(seam: string[], reverseOrder = false): { m: Model; notchPt: number } {
  const m = emptyModel();
  const p = (x: string, y: string) => {
    const id = newId(m, "point");
    m.steps.push({ op: "point", id, x, y });
    return id;
  };
  const l = (a: number, b: number) => {
    const id = newId(m, "line");
    m.steps.push({ op: "line", id, p1: { obj: a }, p2: { obj: b } });
    return id;
  };
  const bottom = l(p("-20", "0"), p("120", "0"));
  const right = l(p("100", "-20"), p("100", "70"));
  const top = l(p("120", "50"), p("-20", "50"));
  const left = l(p("0", "70"), p("0", "-20"));
  const notchPt = p("50", "0");
  const edges = [bottom, right, top, left];
  m.pieces = [
    {
      id: 1,
      name: "front",
      quantity: 2,
      fabric: "قماش الوجه",
      edges: reverseOrder ? [...edges].reverse() : edges,
      seam: reverseOrder ? [...seam].reverse() : seam,
      notches: [{ obj: notchPt }],
      grain: "90",
    },
  ];
  return { m, notchPt };
}

const bbox = (p: [number, number][]) => {
  const xs = p.map((q) => q[0]);
  const ys = p.map((q) => q[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((v) => Math.round(v * 1000) / 1000);
};

describe("pieces", () => {
  it("closes the outline from overshooting lines", () => {
    const r = evaluateModel(rect(["0", "0", "0", "0"]).m);
    expect([...r.pieceErrors]).toEqual([]);
    const g = r.pieces.get(1)!;
    expect(bbox(g.sew)).toEqual([0, 0, 100, 50]);
    expect(signedArea(g.sew)).toBeCloseTo(5000);
  });

  it("adds seam allowance per edge with square corners", () => {
    for (const rev of [false, true]) {
      const r = evaluateModel(rect(["10", "10", "40", "10"], rev).m);
      const g = r.pieces.get(1)!;
      expect(bbox(g.cut)).toEqual([-10, -10, 110, 90]);
      expect(g.cut.length).toBe(4);
    }
  });

  it("places notches and grain line", () => {
    const r = evaluateModel(rect(["10", "10", "10", "10"]).m);
    const n = r.pieces.get(1)!.notches[0];
    expect(n.at[0]).toBeCloseTo(50);
    expect(n.at[1]).toBeCloseTo(-10);
    expect(n.to[1]).toBeCloseTo(-4);
    const [a, b] = r.pieces.get(1)!.grain;
    expect(a[0]).toBeCloseTo(b[0]); // vertical
  });

  it("follows the measurements", () => {
    const { m } = rect(["X1", "10", "10", "10"]);
    m.measurements = [{ id: 1, name: "hem", value: 25 }];
    const r = evaluateModel(m);
    expect(bbox(r.pieces.get(1)!.cut)[1]).toBe(-25);
  });

  it("works with curved edges", () => {
    const m = emptyModel();
    const p = (x: string, y: string) => {
      const id = newId(m, "point");
      m.steps.push({ op: "point", id, x, y });
      return id;
    };
    const a = p("0", "0");
    const b = p("100", "0");
    const c = p("50", "40");
    const base = newId(m, "line");
    m.steps.push({ op: "line", id: base, p1: { obj: a }, p2: { obj: b } });
    const arc = newId(m, "curve");
    m.steps.push({ op: "curve", id: arc, through: [{ obj: b }, { obj: c }, { obj: a }], startAngle: "90", endAngle: "-90" });
    m.pieces = [{ id: 1, name: "cap", quantity: 1, fabric: "", edges: [base, arc], seam: ["10", "10"], notches: [], grain: "0" }];
    const r = evaluateModel(m);
    expect([...r.pieceErrors]).toEqual([]);
    const g = r.pieces.get(1)!;
    const [x0, y0, x1, y1] = bbox(g.cut);
    expect(y0).toBeCloseTo(-10);
    expect(x0).toBeLessThan(-9);
    expect(x1).toBeGreaterThan(109);
    expect(y1).toBeGreaterThan(49);
  });

  it("reports pieces whose edges are missing", () => {
    const { m } = rect(["0", "0", "0", "0"]);
    m.pieces![0].edges.push(999);
    m.pieces![0].seam.push("0");
    expect(evaluateModel(m).pieceErrors.get(1)).toBeTruthy();
  });
});

describe("export", () => {
  const r = evaluateModel(rect(["10", "10", "40", "10"]).m);
  const items = [{ piece: rect(["0"]).m.pieces![0], geo: r.pieces.get(1)! }];

  it("writes DXF-AAMA with the standard layers", () => {
    const dxf = toAamaDxf(items, { style: "thobe", size: "52" });
    const lines = dxf.split("\r\n");
    const layers = new Set(lines.filter((_, i) => lines[i - 1] === "8"));
    for (const l of ["1", "2", "4", "7", "14"]) expect(layers.has(l)).toBe(true);
    expect(dxf).toContain("ANSI/AAMA VERSION: 1.0.0");
    expect(dxf).toContain("Material: \\U+0642"); // Arabic as \U+ escapes
    expect(dxf).toContain("INSERT");
    expect(dxf.trim().endsWith("EOF")).toBe(true);
  });

  it("writes HPGL", () => {
    const plt = toPlt(items, { size: "52" });
    expect(plt.startsWith("IN;")).toBe(true);
    expect(plt).toContain("SP1;PU");
    expect(plt).toContain("LBfront x2 52\x03");
    // piece moved to the positive quadrant: cut line starts at 0 or more
    const nums = [...plt.matchAll(/P[UD](-?\d+),(-?\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(Math.min(...nums.flat())).toBeGreaterThanOrEqual(0);
  });
});
