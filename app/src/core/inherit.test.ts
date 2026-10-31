import { describe, expect, it } from "vitest";
import { emptyModel, evaluateModel, type Model } from "./model";

function design(): Model {
  const m = emptyModel();
  m.measurements.push({ id: 1, name: "length", value: 300 });
  const p1 = {
    no: 1, name: "front", nextId: 4, names: { 1: "P1", 2: "P2", 3: "L1" } as Record<number, string>,
    steps: [{ op: "point", id: 1, x: "0", y: "0" }, { op: "point", id: 2, x: "X1", y: "0" }, { op: "line", id: 3, p1: { obj: 1 }, p2: { obj: 2 } }],
  } as Model["parts"] extends (infer P)[] | undefined ? P : never;
  m.parts = [p1, { no: 2, name: "back", steps: [], names: {}, nextId: 1 }];
  m.activePart = 1;
  m.steps = [{ op: "inherit", part: 1, items: [{ src: 3, dst: 1 }] }];
  m.names = { 1: "L1" };
  m.nextId = 2;
  return m;
}

describe("inheritance between parts", () => {
  it("copies an object of an earlier part, linked to it", () => {
    const m = design();
    let r = evaluateModel(m);
    expect(r.stepErrors.size).toBe(0);
    expect(r.objects.get(1)!.pts).toEqual([[0, 0], [300, 0]]);
    m.measurements[0].value = 420; // the source part follows X1 …
    r = evaluateModel(m);
    expect(r.objects.get(1)!.pts[1]).toEqual([420, 0]); // … and so does the inherited line
  });
  it("only from an earlier part", () => {
    const m = design();
    m.steps = [{ op: "inherit", part: 2, items: [{ src: 3, dst: 1 }] }];
    expect([...evaluateModel(m).stepErrors.values()][0]).toMatch(/سابق/);
  });
});
