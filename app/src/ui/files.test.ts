import { describe, expect, it } from "vitest";
import { parseModel } from "./files";

describe("opening a damaged design file", () => {
  it("next id below an id in use, active part out of range, missing lists: set straight", () => {
    const raw = JSON.stringify({
      version: 1, name: "x", measurements: [], steps: [{ op: "point", id: 7, x: "0", y: "0" }], nextId: 2,
      parts: [{ no: 1, name: "a", steps: [{ op: "point", id: 9, x: "1", y: "1" }], nextId: 1 }], activePart: 4,
    });
    const m = parseModel(raw);
    expect(m.activePart).toBe(0);
    expect(m.parts![0].nextId).toBe(10);
    expect(m.nextId).toBe(10);
    expect(m.steps[0]).toMatchObject({ id: 9 });
    expect(Array.isArray(m.pieces)).toBe(true);
    expect(m.parts![0].names).toEqual({});
  });
  it("a good file is left as it is", () => {
    const good = { version: 1, name: "g", measurements: [], variables: [], steps: [{ op: "point", id: 1, x: "0", y: "0" }], names: { 1: "P1" }, nextId: 2, pieces: [] };
    expect(parseModel(JSON.stringify(good))).toEqual(good);
  });
  it("not a LEVEL7 file: refused", () => {
    expect(() => parseModel(JSON.stringify({ hello: 1 }))).toThrow();
  });
});
