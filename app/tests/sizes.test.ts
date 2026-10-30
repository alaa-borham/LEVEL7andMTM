import { allSizeItems, toAamaDxf, toPlt } from "../src/core/export";
import { evaluateModel, fillGrading, sizeName, withSize } from "../src/core/model";
import { thobeSample } from "../src/core/sample";

function graded() {
  const { m, ids } = thobeSample();
  m.size = "50";
  m.grading = { 3: 10, 1: 20 }; // shoulder +10 per size, length +20
  m.sizes = [
    { name: "48", step: -1, values: {} },
    { name: "52", step: 1, values: {} },
    { name: "زبون أحمد", step: 0, values: { 3: 420 } }, // made to measure: own shoulder
  ];
  fillGrading(m);
  return { m, ids };
}

describe("sizes and grading", () => {
  it("fills size columns from the grading steps", () => {
    const { m } = graded();
    expect(m.sizes![0].values).toEqual({ 1: 1300, 3: 360 });
    expect(m.sizes![1].values).toEqual({ 1: 1340, 3: 380 });
    // step 0 keeps base values for graded measurements, own value is overwritten only for graded ones
    expect(m.sizes![2].values[3]).toBe(370);
  });

  it("rebuilds the pattern for each size", () => {
    const { m, ids } = graded();
    const shoulder = (i: number) => evaluateModel(withSize(m, i)).objects.get(ids.sh)!.pts[1][0];
    expect(shoulder(-1)).toBeCloseTo(185); // X3/2
    expect(shoulder(0)).toBeCloseTo(180);
    expect(shoulder(1)).toBeCloseTo(190);
    m.sizes![2].values[3] = 420;
    expect(shoulder(2)).toBeCloseTo(210);
    expect(sizeName(m, -1)).toBe("50");
    expect(sizeName(m, 2)).toBe("زبون أحمد");
  });

  it("the active size drives the default evaluation", () => {
    const { m, ids } = graded();
    m.activeSize = 1;
    expect(evaluateModel(withSize(m)).objects.get(ids.sh)!.pts[1][0]).toBeCloseTo(190);
  });

  it("exports every size", () => {
    const { m } = graded();
    const { items, errors } = allSizeItems(m);
    expect(errors).toEqual([]);
    expect(items.map((it) => it.size)).toEqual(["50", "48", "52", "زبون أحمد"]);
    const dxf = toAamaDxf(items, { style: "thobe", size: "" });
    expect(dxf.match(/\r\nBLOCK\r\n/g)?.length).toBe(4);
    expect(dxf).toContain("Size: 52");
    // the hem of the bigger size is lower: pieces differ
    const h = (i: number) => Math.min(...items[i].geo.cut.map((p) => p[1]));
    expect(h(2)).toBeLessThan(h(1));
    expect(toPlt(items, { size: "" })).toContain("x1 52");
  });
});
