import { describe, expect, it } from "vitest";
import { emptyModel, type Model } from "./model";
import { checkParts } from "./check";

function design(): Model {
  const m = emptyModel("thobe");
  m.measurements.push({ id: 1, name: "w", value: 100 });
  m.sizes = [{ name: "L", step: 1, values: { 1: 120 } }, { name: "XL", step: 2, values: { 1: 140 }, off: true }];
  const ok = [{ op: "point", id: 1, x: "0", y: "0" }, { op: "point", id: 2, x: "X1", y: "0" }] as Model["steps"];
  const bad = [{ op: "point", id: 1, x: "X9", y: "0" }] as Model["steps"]; // X9 does not exist
  m.parts = [
    { no: 1, name: "front", steps: ok, names: {}, nextId: 3, pieces: [] },
    { no: 2, name: "back", steps: bad, names: {}, nextId: 2, pieces: [] },
  ];
  m.activePart = 0;
  m.steps = ok;
  return m;
}

describe("test run / grade", () => {
  it("test run of the current part: base size only, no errors", () => {
    const r = checkParts(design(), { all: false, grade: false });
    expect(r.rows.map((x) => [x.part, x.size, x.errors.length])).toEqual([["001 front", "الأساسي", 0]]);
  });
  it("grade all parts: every active size (XL is switched off), errors listed per part and size", () => {
    const r = checkParts(design(), { all: true, grade: true });
    expect(r.rows.map((x) => [x.part, x.size])).toEqual([["001 front", "الأساسي"], ["001 front", "L"], ["002 back", "الأساسي"], ["002 back", "L"]]);
    expect(r.failed).toBe(2);
    expect(r.rows[2].errors[0]).toMatch(/^خطوة 1: .*X9/);
  });
});
