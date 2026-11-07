// 0.9.191: a point moved along a line (pointMove slide): from where its point lies on the line, on the
// line itself and on its extension past the ends
import { describe, expect, it } from "vitest";
import { emptyModel, evaluateModel, type Model } from "./model";

const at = (along: number, dist: string, from = 4) => {
  const m = emptyModel("t");
  m.steps = [
    { op: "point", id: 1, x: "0", y: "0" }, { op: "point", id: 2, x: "100", y: "0" }, { op: "point", id: 7, x: "100", y: "100" },
    { op: "line", id: 3, p1: { obj: 1 }, p2: { obj: 2 } },
    { op: "pointOn", id: 4, on: 3, dist: "30", unit: "mm", from: "start" },
    { op: "curve", id: 8, through: [{ obj: 1 }, { obj: 2 }, { obj: 7 }], startAngle: "", endAngle: "" },
    { op: "pointMove", id: 5, from: { obj: from }, along, dist, slide: true },
  ] as Model["steps"];
  m.nextId = 9;
  return evaluateModel(m).objects.get(5)!.pts[0];
};

describe("point sliding on a line", () => {
  it("moves along the line from where its point is", () => {
    expect(at(3, "20")).toEqual([50, 0]);
    expect(at(3, "-10")).toEqual([20, 0]);
  });
  it("goes on along the extension past either end", () => {
    const e = at(3, "90"), b = at(3, "-50");
    expect(e[0]).toBeCloseTo(120);
    expect(e[1]).toBeCloseTo(0);
    expect(b[0]).toBeCloseTo(-20);
  });
  it("follows a curve along its length", () => {
    // from the curve's middle point (100,0), 40 mm on: off the start of the curve, toward (100,100)
    const c = at(8, "40", 2);
    expect(c[1]).toBeGreaterThan(20);
  });
});
