import { toGradedAama } from "../src/core/aama-graded";
import { evaluateModel, fillGrading, withSize } from "../src/core/model";
import { thobeSample } from "../src/core/sample";

function graded() {
  const { m } = thobeSample();
  m.name = "thobe";
  m.size = "50";
  m.grading = { 1: 20, 3: 10, 7: 5 };
  m.sizes = [
    { name: "52", step: 1, values: {} },
    { name: "46", step: -2, values: {} },
    { name: "48", step: -1, values: {} },
  ];
  fillGrading(m);
  return m;
}

/** Group code / value pairs of a DXF. */
function pairs(dxf: string): [string, string][] {
  const l = dxf.split("\r\n");
  const out: [string, string][] = [];
  for (let i = 0; i + 1 < l.length; i += 2) out.push([l[i].trim(), l[i + 1]]);
  return out;
}

describe("graded AAMA", () => {
  const m = graded();
  const r = toGradedAama(m, new Date("2026-01-01"));

  it("orders sizes by grading step and marks the sample size", () => {
    expect(r.errors).toEqual([]);
    expect(r.sizes).toEqual(["46", "48", "50", "52"]);
    expect(r.sample).toBe("50");
    expect(r.rul).toContain("SIZE LIST: 46 48 50 52");
    expect(r.rul).toContain("SAMPLE SIZE: 50");
    expect(r.rul.trim().endsWith("END")).toBe(true);
    expect(r.dxf).toContain("GRADE RULE TABLE: thobe");
  });

  it("every rule has one offset per size, zero for the sample", () => {
    const lines = r.rul.split("\r\n");
    const rules = lines.flatMap((l, i) => (l.startsWith("RULE: DELTA") ? [lines[i + 1].trim().split(" ")] : []));
    expect(rules.length).toBe(r.rules);
    for (const d of rules) {
      expect(d.length).toBe(4);
      expect(d[2]).toBe("0.000,0.000");
    }
  });

  it("sample points plus rule offsets give the other sizes", () => {
    const p = pairs(r.dxf);
    // boundary vertices (layer 1) and rule texts of the first block
    const verts: [number, number][] = [];
    const texts: { x: number; y: number; n: number }[] = [];
    for (let i = 0; i < p.length; i++) {
      if (p[i][0] === "0" && p[i][1] === "ENDBLK") break;
      if (p[i][0] === "0" && p[i][1] === "VERTEX" && p[i + 1][1] === "1") verts.push([Number(p[i + 2][1]), Number(p[i + 3][1])]);
      if (p[i][0] === "0" && p[i][1] === "TEXT") {
        const t = p.slice(i, i + 8);
        const s = t.find((q) => q[0] === "1")?.[1] ?? "";
        if (s.startsWith("# ")) texts.push({ x: Number(t.find((q) => q[0] === "10")![1]), y: Number(t.find((q) => q[0] === "20")![1]), n: Number(s.slice(2)) });
      }
    }
    expect(texts.length).toBe(verts.length - 1); // polyline repeats its first vertex
    const lines = r.rul.split("\r\n");
    const rule = (n: number) =>
      lines[lines.indexOf(`RULE: DELTA ${n}`) + 1]
        .trim()
        .split(" ")
        .map((s) => s.split(",").map(Number));
    // corners of the evaluated pieces of every size, in the same shifted frame
    const base = evaluateModel(m).pieces.get(1)!;
    const shift = [verts[0][0] - base.cutEdges[0][0][0], verts[0][1] - base.cutEdges[0][0][1]];
    const sizeIdx = [1, 2, -1, 0]; // 46, 48, 50, 52
    sizeIdx.forEach((si, col) => {
      const g = evaluateModel(withSize(m, si)).pieces.get(1)!;
      for (const edge of g.cutEdges) {
        const corner = [edge[0][0] + shift[0], edge[0][1] + shift[1]];
        // the graded position of some grade point must land on this corner
        const hit = texts.some((t) => {
          const d = rule(t.n)[col];
          return Math.hypot(t.x + d[0] - corner[0], t.y + d[1] - corner[1]) < 0.01;
        });
        expect(hit).toBe(true);
      }
    });
  });
});
