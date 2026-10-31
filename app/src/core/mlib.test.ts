import { describe, expect, it } from "vitest";
import { emptyModel } from "./model";
import { applyEntry, libraryFile, mergeLibrary, tableOf } from "./mlib";

describe("measurement library", () => {
  it("a table is copied into the design; edits in the design do not reach the library entry", () => {
    const a = emptyModel("thobe");
    a.measurements.push({ id: 3, name: "shoulder", value: 460 });
    a.sizes = [{ name: "52-S", step: 1, values: { 3: 370 } }];
    const e = tableOf(a, "thobe ALAA");
    const b = emptyModel("new model");
    b.variables.push({ id: 1, name: "", expr: "X3/2" });
    applyEntry(b, e);
    expect(b.measurements).toEqual([{ id: 3, name: "shoulder", value: 460 }]);
    expect(b.sizes![0].values[3]).toBe(370);
    expect(b.variables[0].expr).toBe("X3/2"); // Z untouched
    expect(b.mlibFrom).toEqual({ id: e.id, name: "thobe ALAA" });
    b.measurements[0].value = 470;
    b.sizes![0].values[3] = 380;
    expect(e.measurements[0].value).toBe(460);
    expect(e.sizes![0].values[3]).toBe(370);
  });
  it("export and import of the library file; same id replaces", () => {
    const m = emptyModel("x");
    m.measurements.push({ id: 1, name: "w", value: 1 });
    const e = tableOf(m, "A", "id1");
    const r = mergeLibrary([tableOf(m, "old", "id1"), tableOf(m, "B", "id2")], libraryFile([e]));
    expect([r.added, r.replaced, r.lib.map((x) => x.name)]).toEqual([0, 1, ["A", "B"]]);
    expect(() => mergeLibrary([], "{}")).toThrow();
  });
});
