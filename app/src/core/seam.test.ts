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
