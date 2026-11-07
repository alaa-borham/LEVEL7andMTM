// Graded DXF-AAMA (base size + grade rules): also when the base size is switched off in the size table
// (0.9.191: it threw — the sample is then the active size nearest to the base)
import { describe, expect, it } from "vitest";
import { emptyModel, type Model } from "./model";
import { toGradedAama } from "./aama-graded";

const model = (o: Partial<Model> = {}): Model => {
  const m = emptyModel("t");
  m.measurements = [{ id: 1, name: "w", value: 100 }];
  m.steps = [
    { op: "point", id: 1, x: "0", y: "0" }, { op: "point", id: 2, x: "X1", y: "0" }, { op: "point", id: 3, x: "X1", y: "50" }, { op: "point", id: 4, x: "0", y: "50" },
    { op: "line", id: 5, p1: { obj: 1 }, p2: { obj: 2 } }, { op: "line", id: 6, p1: { obj: 2 }, p2: { obj: 3 } },
    { op: "line", id: 7, p1: { obj: 3 }, p2: { obj: 4 } }, { op: "line", id: 8, p1: { obj: 4 }, p2: { obj: 1 } },
  ] as Model["steps"];
  m.nextId = 9;
  m.pieces = [{ id: 1, name: "p", quantity: 1, fabric: "", edges: [5, 6, 7, 8], seam: ["10", "10", "10", "10"], notches: [], grain: "90" }];
  m.sizes = [{ name: "S", step: 1, values: { 1: 110 } }, { name: "M", step: 2, values: { 1: 120 } }];
  return { ...m, ...o };
};

describe("graded AAMA", () => {
  it("base size on: the base is the sample, the other sizes give grade rules", () => {
    const r = toGradedAama(model());
    expect(r.errors).toEqual([]);
    expect(r.sizes.length).toBe(3);
    expect(r.rules).toBeGreaterThan(1);
    expect(r.dxf).toContain("POLYLINE");
  });
  it("base size switched off: no error, the nearest active size is the sample, only active sizes", () => {
    const r = toGradedAama(model({ baseOff: true }));
    expect(r.errors).toEqual([]);
    expect(r.sample).toBe("S");
    expect(r.sizes).toEqual(["S", "M"]);
    expect(r.rul).toContain("SAMPLE SIZE: S");
  });
  it("no active size: a message, no file", () => {
    const m = model({ baseOff: true });
    m.sizes = m.sizes!.map((s) => ({ ...s, off: true }));
    const r = toGradedAama(m);
    expect(r.dxf).toBe("");
    expect(r.errors.length).toBe(1);
  });
});
