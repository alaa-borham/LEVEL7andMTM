import { describe, expect, it } from "vitest";
import { emptyModel, type Model, type Step } from "./model";
import { markerItems, toAamaDxf } from "./export";

const square = (): Step[] => [
  { op: "point", id: 1, x: "0", y: "0" }, { op: "point", id: 2, x: "X1", y: "0" }, { op: "point", id: 3, x: "X1", y: "200" }, { op: "point", id: 4, x: "0", y: "200" },
  { op: "line", id: 5, p1: { obj: 1 }, p2: { obj: 2 } }, { op: "line", id: 6, p1: { obj: 2 }, p2: { obj: 3 } }, { op: "line", id: 7, p1: { obj: 3 }, p2: { obj: 4 } }, { op: "line", id: 8, p1: { obj: 4 }, p2: { obj: 1 } },
];
function design(): Model {
  const m = emptyModel("thobe");
  m.measurements.push({ id: 1, name: "width", value: 100 });
  m.sizes = [{ name: "L", step: 1, values: { 1: 120 } }];
  const piece = { id: 1, name: "front", quantity: 1, fabric: "", edges: [5, 6, 7, 8], seam: ["10", "10", "10", "10"], notches: [], grain: "90" };
  m.parts = [
    { no: 1, name: "front", steps: square(), names: {}, nextId: 9, pieces: [piece], production: true, amount: 1, mirrored: 1 },
    { no: 2, name: "draft", steps: square(), names: {}, nextId: 9, pieces: [piece], production: false },
  ];
  m.activePart = 1; // the draft part is active: production parts come from the parts list
  m.steps = m.parts[1].steps;
  m.pieces = m.parts[1].pieces;
  return m;
}

describe("marker export", () => {
  it("production parts only, every size, normal and mirrored pieces", () => {
    const r = markerItems(design());
    expect(r.errors).toEqual([]);
    expect(r.parts).toBe(1);
    expect(r.items.map((i) => `${i.piece.name}|${i.size}|${i.piece.quantity}`)).toEqual(["front - front|الأساسي|1", "front - front (M)|الأساسي|1", "front - front|L|1", "front - front (M)|L|1"]);
    const w = (k: number) => Math.max(...r.items[k].geo.sew.map((p) => p[0])) - Math.min(...r.items[k].geo.sew.map((p) => p[0]));
    expect(Math.round(w(0))).toBe(100);
    expect(Math.round(w(2))).toBe(120); // size L follows X1
    // the mirrored copy is turned over about its centre
    const c = r.items[0].geo.centre[0];
    expect(r.items[1].geo.sew.map((p) => Math.round(2 * c - p[0])).sort()).toEqual(r.items[0].geo.sew.map((p) => Math.round(p[0])).sort());
    expect(toAamaDxf(r.items, { style: "thobe", size: "" })).toContain("Quantity: 1");
  });
  it("a production part without pieces is reported", () => {
    const m = design();
    m.parts![0].pieces = [];
    const r = markerItems(m);
    expect(r.items).toEqual([]);
    expect(r.errors[0]).toMatch(/لا توجد قطع/);
  });
});
