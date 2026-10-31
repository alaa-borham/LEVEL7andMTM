import { describe, expect, it } from "vitest";
import { emptyModel, evaluateModel, type Model, type Step } from "./model";

// a line L (id 4) from (10,0) to (30,0); points P5 (0,0), P6 (0,10)
function model(extra: Step): Model {
  const m = emptyModel();
  m.measurements.push({ id: 1, name: "", value: 150 });
  m.steps.push(
    { op: "point", id: 1, x: "10", y: "0" }, { op: "point", id: 2, x: "30", y: "0" }, { op: "line", id: 4, p1: { obj: 1 }, p2: { obj: 2 } },
    { op: "point", id: 5, x: "0", y: "0" }, { op: "point", id: 6, x: "0", y: "10" }, extra,
  );
  m.nextId = 20;
  return m;
}
const pts = (s: Step) => {
  const r = evaluateModel(model(s));
  expect(r.stepErrors.size).toBe(0);
  return r.objects.get(9)!.pts.map((p) => p.map((v) => Math.round(v * 1e6) / 1e6));
};

describe("transformations", () => {
  it("mirror from point to point (axis x = 0) as a copy", () => {
    expect(pts({ op: "mirror", axisPts: [{ obj: 5 }, { obj: 6 }], items: [{ src: 4, dst: 9 }] })).toEqual([[-10, 0], [-30, 0]]);
  });
  it("mirror with direction (point + 90°)", () => {
    expect(pts({ op: "mirror", axisAt: { obj: 5 }, axisAngle: "90", items: [{ src: 4, dst: 9 }] })).toEqual([[-10, 0], [-30, 0]]);
  });
  it("scale about a point by X1 % (150 %)", () => {
    expect(pts({ op: "scale", center: { obj: 5 }, factor: "X1", items: [{ src: 4, dst: 9 }] })).toEqual([[15, 0], [45, 0]]);
  });
  it("scale with direction stretches only along it", () => {
    expect(pts({ op: "scale", center: { obj: 5 }, factor: "200", angle: "90", items: [{ src: 4, dst: 9 }] })).toEqual([[10, 0], [30, 0]]);
    expect(pts({ op: "scale", center: { obj: 5 }, factor: "200", angle: "0", items: [{ src: 4, dst: 9 }] })).toEqual([[20, 0], [60, 0]]);
  });
});
