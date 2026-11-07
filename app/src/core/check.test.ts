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
  it("a Z measured from part 001's drawing is not an error in an empty part that does not use it", () => {
    const m = design();
    m.parts![1].steps = [];
    m.parts!.push({ no: 3, name: "uses", steps: [{ op: "point", id: 1, x: "Z5", y: "0" }] as Model["steps"], names: {}, nextId: 2, pieces: [] });
    m.variables.push({ id: 5, name: "len", expr: "", measure: { type: "dist", a: { obj: 1 }, b: { obj: 2 } } });
    const r = checkParts(m, { all: true, grade: false });
    expect(r.rows.map((x) => [x.part, x.errors.some((e) => /^Z5/.test(e))])).toEqual([["001 front", false], ["002 back", false], ["003 uses", true]]);
  });
});

describe("test run warnings: where the seam allowance cannot come out clean (0.9.184)", () => {
  // a shoulder piece corner as in a user's file: the side curve ends with 15 % tension at an angle that
  // makes it bend sharply in its last millimetres towards the cut side
  const piece = (endAngle: string, endTension: string, endRel?: number) => {
    const m = emptyModel("t");
    m.steps = [
      { op: "point", id: 1, x: "0", y: "0" }, { op: "point", id: 2, x: "160", y: "0" }, { op: "point", id: 3, x: "160", y: "-40" },
      { op: "point", id: 4, x: "40", y: "-150" }, { op: "point", id: 5, x: "0", y: "-150" },
      { op: "line", id: 6, p1: { obj: 1 }, p2: { obj: 2 } }, { op: "line", id: 7, p1: { obj: 2 }, p2: { obj: 3 } },
      { op: "line", id: 9, p1: { obj: 4 }, p2: { obj: 5 } },
      { op: "curve", id: 8, through: [{ obj: 3 }, { obj: 4 }], startAngle: "", endAngle, endTension, ...(endRel ? { endRel } : {}) },
      { op: "line", id: 10, p1: { obj: 5 }, p2: { obj: 1 } },
    ] as Model["steps"];
    Object.assign(m.names, { 8: "C1", 9: "L12" });
    m.nextId = 11;
    m.pieces = [{ id: 1, name: "p", quantity: 1, fabric: "", edges: [6, 7, 8, 9, 10], seam: ["10", "10", "10", "10", "10"], notches: [], grain: "90" }];
    return m;
  };
  it("warns where a curve end bends tighter than the allowance towards the cut side, and says where", () => {
    const r = checkParts(piece("120", "15"), { all: false, grade: false });
    expect(r.failed).toBe(0);
    expect(r.warned).toBe(1);
    expect(r.rows[0].warnings.some((w) => /طرف C1 ينحني/.test(w))).toBe(true);
    // the warning points at the bending end itself (40, -150), and at the curve's step
    expect(r.rows[0].warnRefs.some((x) => x.step === 8 && Math.hypot(x.at[0] - 40, x.at[1] + 150) < 1e-6)).toBe(true);
  });
  it("an inherited curve (its step brings several elements): the warning points at the bending end, not the step's middle", () => {
    const base = piece("120", "15");
    const m = emptyModel("t");
    const ids = [6, 7, 8, 9, 10];
    m.parts = [
      { no: 1, name: "front", steps: base.steps, names: base.names, nextId: base.nextId, pieces: [], amount: 1 },
      { no: 2, name: "yoke", steps: [{ op: "inherit", part: 1, items: ids.map((src, k) => ({ src, dst: k + 1 })) }] as Model["steps"], names: { 3: "C1" }, nextId: 6, amount: 1,
        pieces: [{ id: 1, name: "p", quantity: 1, fabric: "", edges: [1, 2, 3, 4, 5], seam: ["10", "10", "10", "10", "10"], notches: [], grain: "90" }] },
    ];
    m.activePart = 0;
    Object.assign(m, { steps: base.steps, names: base.names, nextId: base.nextId, pieces: [] });
    const r = checkParts(m, { all: true, grade: false });
    const row = r.rows.find((x) => x.k === 1)!;
    expect(row.errors).toEqual([]);
    expect(row.warnings.some((w) => /طرف C1 ينحني/.test(w))).toBe(true);
    const ref = row.warnRefs.find((_, i) => /طرف C1/.test(row.warnings[i]))!;
    expect(ref.step).toBeUndefined();
    expect(Math.hypot(ref.at[0] - 40, ref.at[1] + 150)).toBeLessThan(1e-6);
  });
  it("no warning when the curve meets the line at a proper angle", () => {
    const r = checkParts(piece("90", "100", 9), { all: false, grade: false });
    expect(r.failed).toBe(0);
    expect(r.warned).toBe(0);
    expect(r.rows[0].warnings).toEqual([]);
  });
});
