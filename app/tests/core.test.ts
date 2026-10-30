import { evaluate, FormulaError } from "../src/core/formula";
import { crossings, pointAlong, subPolyline, type Pt } from "../src/core/geometry";
import { emptyModel, evaluateModel, newId } from "../src/core/model";
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

  it("builds the demo piece", () => {
    const { m } = thobe();
    const r = evaluateModel(m);
    expect([...r.pieceErrors]).toEqual([]);
    const g = r.pieces.get(1)!;
    const xs = g.sew.map((p) => p[0]);
    const ys = g.sew.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(0);
    expect(Math.max(...xs)).toBeCloseTo(172);
    expect(Math.min(...ys)).toBeCloseTo(-1320);
    // hem allowance 40, nothing on the centre front (fold)
    expect(Math.min(...g.cut.map((p) => p[1]))).toBeCloseTo(-1360);
    expect(Math.min(...g.cut.map((p) => p[0]))).toBeCloseTo(0);
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

describe("phase 2: curves and measurements", () => {
  const base = () => {
    const m = emptyModel();
    m.measurements = [{ id: 1, name: "a", value: 100 }];
    const pid = (x: string, y: string) => {
      const id = newId(m, "point");
      m.steps.push({ op: "point", id, x, y });
      return id;
    };
    const a = pid("0", "0");
    const b = pid("X1", "50");
    const c = pid("200", "0");
    return { m, a, b, c };
  };

  it("curve passes through its points and honours end directions", () => {
    const { m, a, b, c } = base();
    const id = newId(m, "curve");
    m.steps.push({ op: "curve", id, through: [{ obj: a }, { obj: b }, { obj: c }], startAngle: "90", endAngle: "" });
    const r = evaluateModel(m);
    expect([...r.stepErrors]).toEqual([]);
    const pts = r.objects.get(id)!.pts;
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[24][0]).toBeCloseTo(100);
    expect(pts[24][1]).toBeCloseTo(50);
    expect(pts[pts.length - 1]).toEqual([200, 0]);
    // leaves the start straight up
    expect(Math.abs(pts[1][0])).toBeLessThan(0.5);
    expect(pts[1][1]).toBeGreaterThan(0);
    expect(m.names[id]).toBe("C1");
  });

  it("other tools work on curves", () => {
    const { m, a, b, c } = base();
    const cv = newId(m, "curve");
    m.steps.push({ op: "curve", id: cv, through: [{ obj: a }, { obj: b }, { obj: c }], startAngle: "", endAngle: "" });
    const p = newId(m, "point");
    m.steps.push({ op: "pointOn", id: p, on: cv, dist: "50", unit: "%", from: "start" });
    const par = newId(m, "curve");
    m.steps.push({ op: "parallel", id: par, of: cv, dist: "10", side: 1 });
    const r = evaluateModel(m);
    expect([...r.stepErrors]).toEqual([]);
    // symmetric curve: the middle is the apex
    expect(r.objects.get(p)!.pts[0][0]).toBeCloseTo(100, 0);
    expect(r.objects.get(par)!.pts.length).toBe(r.objects.get(cv)!.pts.length);
  });

  it("measured variables follow the drawing and feed formulas", () => {
    const { m, a, b, c } = base();
    const L = newId(m, "line");
    m.steps.push({ op: "line", id: L, p1: { obj: a }, p2: { obj: c } });
    m.variables = [
      { id: 1, name: "ab", expr: "", measure: { type: "dist", a: { obj: a }, b: { obj: b } } },
      { id: 2, name: "len", expr: "", measure: { type: "length", obj: L } },
      { id: 3, name: "half", expr: "Z2/2" },
    ];
    const q = newId(m, "point");
    m.steps.push({ op: "pointOn", id: q, on: L, dist: "Z3", unit: "mm", from: "start" });
    let r = evaluateModel(m);
    expect([...r.stepErrors]).toEqual([]);
    expect(r.z.get(1)).toBeCloseTo(Math.hypot(100, 50));
    expect(r.z.get(2)).toBeCloseTo(200);
    expect(r.objects.get(q)!.pts[0][0]).toBeCloseTo(100);
    // change the measurement: the measured distance follows
    m.measurements[0].value = 120;
    r = evaluateModel(m);
    expect(r.z.get(1)).toBeCloseTo(Math.hypot(120, 50));
  });

  it("a measurement used before its objects exist is an error, not a crash", () => {
    const { m, a } = base();
    m.variables = [{ id: 1, name: "len", expr: "", measure: { type: "length", obj: 999 } }];
    const q = newId(m, "point");
    m.steps.push({ op: "pointMove", id: q, from: { obj: a }, along: a, dist: "Z1" });
    const r = evaluateModel(m);
    expect(r.zErrors.get(1)).toBeTruthy();
    expect(r.stepErrors.size).toBe(1);
  });
});
