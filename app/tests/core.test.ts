import { evaluate, FormulaError } from "../src/core/formula";
import { crossings, pointAlong, subPolyline, type Pt } from "../src/core/geometry";
import { evaluateModel } from "../src/core/model";
import { thobeSample as thobe } from "../src/core/sample";

const ev = (s: string, x: Record<number, number> = {}, z: Record<number, number> = {}) =>
  evaluate(s, (k, n) => (k === "X" ? x[n] : z[n]));

describe("formula", () => {
  it("evaluates GRAFIS syntax", () => {
    expect(ev("(X23+Z7)-70", { 23: 370 }, { 7: 66 })).toBe(366);
    expect(ev("CMDIF[X4>=64]{61}[X4<64]{50}{55}", { 4: 70 })).toBe(61);
    expect(ev("CMDIF[X4>=64]{61}[X4<64]{50}{55}", { 4: 50 })).toBe(50);
    expect(ev("CMDIF[X4>50]{X4/20}{0}", { 4: 50 })).toBe(0);
    expect(ev("X35/", { 35: 150 })).toBe(150); // dangling operator ignored like GRAFIS
    expect(() => ev("X1*(2", { 1: 1 })).toThrow(FormulaError);
  });
});

describe("geometry", () => {
  const L: Pt[] = [[0, 0], [100, 0]];
  it("points along and extensions", () => {
    expect(pointAlong(L, 30)).toEqual([30, 0]);
    expect(pointAlong(L, 30, true)).toEqual([70, 0]);
    expect(pointAlong(L, 150)).toEqual([150, 0]);
    expect(subPolyline(L, -10, 50)).toEqual([[-10, 0], [50, 0]]);
  });
  it("extended crossings", () => {
    const c = crossings(L, [[120, -5], [120, 5]]);
    expect(c[0].pt[0]).toBeCloseTo(120);
    expect(c[0].s).toBeCloseTo(120);
  });
});

describe("model rebuilds the GRAFIS thobe", () => {
  const close = (a: Pt[], b: Pt[]) => a.forEach((p, i) => {
    expect(p[0]).toBeCloseTo(b[i][0], 3);
    expect(p[1]).toBeCloseTo(b[i][1], 3);
  });

  it("matches the stored GRAFIS coordinates", () => {
    const { m, ids } = thobe();
    const r = evaluateModel(m);
    expect([...r.stepErrors]).toEqual([]);
    const o = (k: string) => r.objects.get(ids[k])!.pts;
    close(o("cf"), [[0, 0], [0, -1320]]);
    close(o("sh"), [[0, 0], [185, 0]]);
    close(o("neck"), [[52.2388, 0]]);
    close(o("neckD"), [[0, -66.0377]]);
    close(o("lL"), [[0, -69], [-172, -69]]);
    close(o("lR"), [[0, -43.75], [172, -43.75]]);
    close(o("shL"), [[-52.2388, 0], [-172, -69]]);
    close(o("shR"), [[52.2388, 0], [172, -43.75]]);
    close(o("up"), [[172, -43.75], [172, 0]]);
    close(o("par"), [[0, -50], [185, -50]]);
  });

  it("follows a measurement change", () => {
    const { m, ids } = thobe();
    m.measurements.find((x) => x.id === 3)!.value = 400; // shoulder
    const r = evaluateModel(m);
    expect(r.objects.get(ids.sh)!.pts[1][0]).toBeCloseTo(200);
    expect(r.objects.get(ids.lR)!.pts[1][0]).toBeCloseTo(187);
  });

  it("reports broken steps without stopping", () => {
    const { m } = thobe();
    m.variables.find((v) => v.id === 9)!.expr = "X99/2";
    const r = evaluateModel(m);
    expect(r.zErrors.get(9)).toMatch(/X99/);
    expect(r.stepErrors.size).toBeGreaterThan(0);
    expect(r.objects.size).toBeGreaterThan(3);
  });
});
