import { describe, expect, it } from "vitest";
import { emptyModel, evaluateModel, type Model } from "./model";

// rectangle 100 x 200; edge 6 runs from (100,0) up to (100,200)
function rect(seam: string[], seamEnd?: string[]): Model {
  const m = emptyModel("t");
  m.steps = [
    { op: "point", id: 1, x: "0", y: "0" }, { op: "point", id: 2, x: "100", y: "0" }, { op: "point", id: 3, x: "100", y: "200" }, { op: "point", id: 4, x: "0", y: "200" },
    { op: "line", id: 5, p1: { obj: 1 }, p2: { obj: 2 } }, { op: "line", id: 6, p1: { obj: 2 }, p2: { obj: 3 } }, { op: "line", id: 7, p1: { obj: 3 }, p2: { obj: 4 } }, { op: "line", id: 8, p1: { obj: 4 }, p2: { obj: 1 } },
  ] as Model["steps"];
  m.pieces = [{ id: 1, name: "p", quantity: 1, fabric: "", edges: [5, 6, 7, 8], seam, seamEnd, notches: [], grain: "90" }];
  return m;
}
const maxXAt = (cut: [number, number][], y: number) => Math.max(...cut.filter((p) => Math.abs(p[1] - y) < 1e-6).map((p) => p[0]));

describe("seam allowance (as GRAFIS)", () => {
  it("parallel: every edge moved out by its value; none = on the sewing line", () => {
    const g = evaluateModel(rect(["0", "20", "0", "0"])).pieces.get(1)!;
    expect(Math.max(...g.cut.map((p) => p[0]))).toBeCloseTo(120);
    expect(Math.min(...g.cut.map((p) => p[0]))).toBeCloseTo(0);
  });
  it("unparallel: 10 at the start of the edge, 30 at its end, evenly between", () => {
    const g = evaluateModel(rect(["0", "10", "0", "0"], ["", "30", "", ""])).pieces.get(1)!;
    expect(maxXAt(g.cut, 0)).toBeCloseTo(110);
    expect(maxXAt(g.cut, 200)).toBeCloseTo(130);
    const right = g.cutEdges[g.order.indexOf(1)];
    // x of the cut edge at y = 100 (half way): 10 + (30 - 10) / 2 = 20 out
    let x = NaN;
    for (let i = 1; i < right.length; i++) {
      const [a, b] = [right[i - 1], right[i]];
      if ((a[1] - 100) * (b[1] - 100) <= 0 && a[1] !== b[1]) x = a[0] + ((b[0] - a[0]) * (100 - a[1])) / (b[1] - a[1]);
    }
    expect(x).toBeCloseTo(120);
  });
  it("unparallel follows the edge's own direction, also when the outline runs the other way", () => {
    // the same values on a piece picked the other way round
    const m = rect(["0", "10", "0", "0"], ["", "30", "", ""]);
    m.pieces![0].edges = [8, 7, 6, 5];
    m.pieces![0].seam = ["0", "0", "10", "0"];
    m.pieces![0].seamEnd = ["", "", "30", ""];
    const g = evaluateModel(m).pieces.get(1)!;
    expect(maxXAt(g.cut, 0)).toBeCloseTo(110);
    expect(maxXAt(g.cut, 200)).toBeCloseTo(130);
  });
});

describe("seam allowance without teeth", () => {
  it("a near-zero first segment pointing sideways does not throw the offset out", async () => {
    const { offsetPolyline } = await import("./geometry");
    // the junction point lies 0.001 mm beside the start of a straight edge: a tiny sideways segment
    const p: [number, number][] = [[0, 0.001], [0.0005, 0], [50, 0], [100, 0]];
    const o = offsetPolyline(p, -10);
    for (const q of o) expect(Math.abs(q[1] + 10)).toBeLessThan(0.05);
  });
});

describe("seam allowance at a hooked corner (curve bending tight at the corner)", () => {
  const selfCross = (c: [number, number][]) => {
    const n = c.length;
    const X = (a: number[], b: number[], p: number[], q: number[]) => {
      const d = (b[0] - a[0]) * (q[1] - p[1]) - (b[1] - a[1]) * (q[0] - p[0]);
      if (Math.abs(d) < 1e-12) return false;
      const t = ((p[0] - a[0]) * (q[1] - p[1]) - (p[1] - a[1]) * (q[0] - p[0])) / d;
      const u = ((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / d;
      return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
    };
    let k = 0;
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) if (!(i === 0 && j === n - 1) && X(c[i], c[(i + 1) % n], c[j], c[(j + 1) % n])) k++;
    return k;
  };
  it("no spike or loop in the cut line, whatever way the curve runs", () => {
    for (const a of [10, 20, 30]) for (const mid of [[836, 120], [845, 100], [850, 95], [848, 90]]) for (const ang of ["", "240", "250", "260", "270", "280"]) for (const rev of [false, true]) {
      const m = emptyModel("t");
      m.steps = [
        { op: "point", id: 1, x: "600", y: "20" }, { op: "point", id: 2, x: "853", y: "80" },
        { op: "point", id: 3, x: String(mid[0]), y: String(mid[1]) }, { op: "point", id: 4, x: "808", y: "250" }, { op: "point", id: 10, x: "600", y: "250" },
        { op: "line", id: 5, p1: { obj: 1 }, p2: { obj: 2 } },
        { op: "curve", id: 6, through: rev ? [{ obj: 4 }, { obj: 3 }, { obj: 2 }] : [{ obj: 2 }, { obj: 3 }, { obj: 4 }], startAngle: rev ? "" : ang, endAngle: rev ? ang : "" },
        { op: "line", id: 7, p1: { obj: 4 }, p2: { obj: 10 } }, { op: "line", id: 9, p1: { obj: 10 }, p2: { obj: 1 } },
      ] as Model["steps"];
      m.pieces = [{ id: 1, name: "p", quantity: 1, fabric: "", edges: [5, 6, 7, 9], seam: [5, 6, 7, 9].map(() => String(a)), notches: [], grain: "90" }];
      const g = evaluateModel(m).pieces.get(1)!;
      expect(selfCross(g.cut), `${a} ${mid} ${ang} ${rev}`).toBe(0);
      // the corner stays out at the allowance: nothing of the cut line comes nearer the sewing line
      for (const q of g.cut) expect(Math.min(...g.sew.map((s) => Math.hypot(s[0] - q[0], s[1] - q[1]))), `${a} ${mid} ${ang} ${rev}`).toBeGreaterThan(a * 0.85);
    }
  });
});

describe("notch (as GRAFIS)", () => {
  it("runs on along an inner line that ends at the edge, with its own length (X / Z too)", () => {
    const m = rect(["10", "10", "10", "10"]);
    // inner line from (40,60) to the right edge at (100,100): slanted
    m.steps.push({ op: "point", id: 20, x: "40", y: "60" }, { op: "point", id: 21, x: "100", y: "100" }, { op: "line", id: 22, p1: { obj: 20 }, p2: { obj: 21 } } as Model["steps"][number]);
    m.nextId = 23;
    m.variables = [{ id: 1, name: "n", expr: "9" }];
    m.pieces![0].notches = [{ obj: 22, end: "end" }, { obj: 2 }];
    m.pieces![0].notchLen = ["Z1", ""];
    const r = evaluateModel(m);
    expect(r.pieceErrors.get(1) ?? "").toBe("");
    const g = r.pieces.get(1)!;
    const [n0, n1] = g.notches;
    // along the line: direction (60,40) normalised
    const u = [60 / Math.hypot(60, 40), 40 / Math.hypot(60, 40)];
    const v = [n0.at[0] - n0.to[0], n0.at[1] - n0.to[1]];
    expect(Math.hypot(v[0], v[1])).toBeCloseTo(9);
    expect(v[0] / 9).toBeCloseTo(u[0]);
    expect(v[1] / 9).toBeCloseTo(u[1]);
    expect(n0.at[0]).toBeCloseTo(110); // starts on the cut line
    // a corner point with no inner line: square to the edge, standard length (allowance, at most 6)
    expect(Math.hypot(n1.at[0] - n1.to[0], n1.at[1] - n1.to[1])).toBeCloseTo(6);
  });
});

describe("cut line corners (as GRAFIS)", () => {
  it("rounds or cuts off a corner of the cut line, the sewing line stays as it is", () => {
    const m = rect(["10", "10", "10", "10"]);
    const plain = evaluateModel(m).pieces.get(1)!;
    // the corner at (110,-10): edges 5 (bottom) and 6 (right)
    expect(plain.cutCornerAt!.some((c) => c.key === "5,6" && Math.hypot(c.pt[0] - 110, c.pt[1] + 10) < 1e-6)).toBe(true);
    m.pieces![0].cutCorners = { "5,6": { kind: "chamfer", size: "8" } };
    let g = evaluateModel(m).pieces.get(1)!;
    expect(g.cut.some((p) => Math.hypot(p[0] - 110, p[1] + 10) < 1e-6)).toBe(false);
    expect(g.cut.some((p) => Math.hypot(p[0] - 102, p[1] + 10) < 1e-6)).toBe(true);
    expect(g.cut.some((p) => Math.hypot(p[0] - 110, p[1] + 2) < 1e-6)).toBe(true);
    expect(g.sew).toEqual(plain.sew);
    m.variables = [{ id: 1, name: "r", expr: "6" }];
    m.pieces![0].cutCorners = { "5,6": { kind: "round", size: "Z1" } };
    g = evaluateModel(m).pieces.get(1)!;
    // a right angle: the arc starts 6 from the corner on both sides and stays inside the corner
    expect(g.cut.some((p) => Math.hypot(p[0] - 104, p[1] + 10) < 1e-6)).toBe(true);
    expect(g.cut.some((p) => Math.hypot(p[0] - 110, p[1] + 4) < 1e-6)).toBe(true);
    const arc = g.cut.filter((p) => p[0] > 104 + 1e-6 && p[1] < -4 - 1e-6);
    expect(arc.length).toBeGreaterThan(5);
    for (const p of arc) expect(Math.hypot(p[0] - 110, p[1] + 10)).toBeGreaterThan(1);
    // the other corners keep their point
    expect(g.cut.some((p) => Math.hypot(p[0] + 10, p[1] + 10) < 1e-6)).toBe(true);
  });
});
