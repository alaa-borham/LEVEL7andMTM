// 0.9.189: a direction set at an inner point of a curve (as GRAFIS «Set direction»)
import { describe, expect, it } from "vitest";
import { emptyModel, evaluateModel, type Model } from "./model";

const curve = (pointAngles?: string[]) => {
  const m = emptyModel("t");
  m.steps = [
    { op: "point", id: 1, x: "0", y: "0" }, { op: "point", id: 2, x: "100", y: "60" }, { op: "point", id: 3, x: "200", y: "0" },
    { op: "curve", id: 4, through: [{ obj: 1 }, { obj: 2 }, { obj: 3 }], startAngle: "", endAngle: "", ...(pointAngles ? { pointAngles } : {}) },
  ] as Model["steps"];
  m.nextId = 5;
  return evaluateModel(m).objects.get(4)!.pts;
};
const dirAt = (pts: number[][], x: number, y: number) => {
  const k = pts.findIndex((p) => Math.hypot(p[0] - x, p[1] - y) < 1e-6);
  const a = pts[k - 1], b = pts[k + 1];
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
};

describe("curve direction at an inner point", () => {
  it("free: the curve crosses the middle point level (symmetric shape)", () => {
    expect(Math.abs(dirAt(curve(), 100, 60))).toBeLessThan(1);
  });
  it("set to 30°: the curve passes the middle point at 30°, and still through all its points", () => {
    const pts = curve(["", "30", ""]);
    expect(Math.abs(dirAt(pts, 100, 60) - 30)).toBeLessThan(3); // read from the neighbouring samples (a secant)
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([200, 0]);
  });
  it("a direction given the other way round (210°) is the same tangent line", () => {
    expect(Math.abs(dirAt(curve(["", "210", ""]), 100, 60) - 30)).toBeLessThan(3);
  });
});
