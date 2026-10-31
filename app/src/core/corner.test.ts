import { describe, expect, it } from "vitest";
import { emptyModel, evaluateModel, type Model } from "./model";

// Two lines meeting at a right angle at (0,0): L1 from (100,0) to (5,0), L2 from (0,100) to (0,5).
function corner(kind: "sharp" | "round" | "chamfer", size = "10"): ReturnType<typeof evaluateModel> {
  const m: Model = emptyModel();
  m.steps.push(
    { op: "point", id: 1, x: "100", y: "0" }, { op: "point", id: 2, x: "5", y: "0" },
    { op: "point", id: 3, x: "0", y: "100" }, { op: "point", id: 4, x: "0", y: "5" },
    { op: "line", id: 5, p1: { obj: 1 }, p2: { obj: 2 } }, { op: "line", id: 6, p1: { obj: 3 }, p2: { obj: 4 } },
    { op: "corner", kind, a: 5, endA: "end", b: 6, endB: "end", size, ...(kind === "sharp" ? {} : { id: 7 }) },
  );
  m.nextId = 8;
  return evaluateModel(m);
}
const close = (p: number[], q: number[]) => expect(Math.hypot(p[0] - q[0], p[1] - q[1])).toBeLessThan(1e-6);

describe("corner tools", () => {
  it("sharp corner extends both lines to their intersection", () => {
    const r = corner("sharp");
    expect(r.stepErrors.size).toBe(0);
    close(r.objects.get(5)!.pts[1], [0, 0]);
    close(r.objects.get(6)!.pts[1], [0, 0]);
  });
  it("round corner trims to tangent points and adds an arc of the radius", () => {
    const r = corner("round", "10");
    expect(r.stepErrors.size).toBe(0);
    close(r.objects.get(5)!.pts[1], [10, 0]);
    close(r.objects.get(6)!.pts[1], [0, 10]);
    const arc = r.objects.get(7)!.pts;
    close(arc[0], [10, 0]);
    close(arc[arc.length - 1], [0, 10]);
    for (const p of arc) expect(Math.abs(Math.hypot(p[0] - 10, p[1] - 10) - 10)).toBeLessThan(1e-6);
  });
  it("chamfer cuts the corner with a straight line", () => {
    const r = corner("chamfer", "20");
    close(r.objects.get(7)!.pts[0], [20, 0]);
    close(r.objects.get(7)!.pts[1], [0, 20]);
  });
  it("refuses a radius larger than the lines", () => {
    expect([...corner("round", "500").stepErrors.values()][0]).toMatch(/نصف القطر/);
  });
});
