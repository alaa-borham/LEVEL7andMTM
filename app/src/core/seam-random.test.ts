// 0.9.184: a broad check of the seam allowance on random pieces (curves, hooks into corners, end angles,
// tensions, allowances 5-20 mm), checked against two rules that must always hold.
import { describe, expect, it } from "vitest";
import { emptyModel, evaluateModel, type Model } from "../core/model";
type P = [number, number];
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const segX = (a: P, b: P, c: P, d: P) => {
  const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (Math.abs(den) < 1e-12) return false;
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den, u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
};
const distSeg = (q: P, a: P, b: P) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L)); return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy); };
describe("seam allowance on random pieces (broad check)", () => {
 it("the cut line never crosses itself and never comes nearer the sewing line than the allowance", () => {
  const N = 300, fails: Record<string, number> = {}, ex: string[] = [];
  for (let k = 0; k < N; k++) {
    // a convex-ish piece: 4..6 corners on an ellipse, some edges curves bulging out or in, sometimes hooking at an end
    const nV = 4 + Math.floor(rnd() * 3), R = 120 + rnd() * 200, V: P[] = [];
    for (let i = 0; i < nV; i++) { const t = (i / nV) * 2 * Math.PI + (rnd() - 0.5) * 0.6; V.push([R * Math.cos(t) * (1 + rnd() * 0.5), R * Math.sin(t)]); }
    const m = emptyModel("t"), steps: Model["steps"] = [];
    let id = 1;
    const pid = V.map((v) => { steps.push({ op: "point", id, x: v[0].toFixed(2), y: v[1].toFixed(2) } as Model["steps"][number]); return id++; });
    const edges: number[] = [];
    for (let i = 0; i < nV; i++) {
      const a = V[i], b = V[(i + 1) % nV];
      if (rnd() < 0.55) {
        const mids: number[] = [], nm = 1 + Math.floor(rnd() * 2);
        for (let j = 1; j <= nm; j++) {
          const f = j / (nm + 1), bulge = (rnd() - 0.5) * 0.35 * Math.hypot(b[0] - a[0], b[1] - a[1]);
          const nx = -(b[1] - a[1]), ny = b[0] - a[0], nl = Math.hypot(nx, ny);
          steps.push({ op: "point", id, x: (a[0] + (b[0] - a[0]) * f + (nx / nl) * bulge).toFixed(2), y: (a[1] + (b[1] - a[1]) * f + (ny / nl) * bulge).toFixed(2) } as Model["steps"][number]);
          mids.push(id++);
        }
        // sometimes a through point very near an end (a hook into the corner), sometimes end angles / tension
        if (rnd() < 0.3) { const e = rnd() < 0.5 ? a : b, o = rnd() < 0.5 ? mids[0] : mids[mids.length - 1]; void o; const d = 1 + rnd() * 4, th = rnd() * 2 * Math.PI;
          steps.push({ op: "point", id, x: (e[0] * 0.97 + (e === a ? b[0] : a[0]) * 0.03 + Math.cos(th) * d).toFixed(2), y: (e[1] * 0.97 + (e === a ? b[1] : a[1]) * 0.03 + Math.sin(th) * d).toFixed(2) } as Model["steps"][number]);
          if (e === a) mids.unshift(id++); else mids.push(id++); }
        const ang = () => (rnd() < 0.3 ? String(Math.round(rnd() * 360)) : "");
        const ten = () => (rnd() < 0.2 ? String(Math.round(30 + rnd() * 200)) : "");
        steps.push({ op: "curve", id, through: [pid[i], ...mids, pid[(i + 1) % nV]].map((o) => ({ obj: o })), startAngle: ang(), endAngle: ang(), startTension: ten(), endTension: ten() } as Model["steps"][number]);
      } else steps.push({ op: "line", id, p1: { obj: pid[i] }, p2: { obj: pid[(i + 1) % nV] } } as Model["steps"][number]);
      edges.push(id++);
    }
    const a = [5, 10, 15, 20][Math.floor(rnd() * 4)];
    m.steps = steps; m.nextId = id;
    m.pieces = [{ id: 1, name: "p", quantity: 1, fabric: "", edges, seam: edges.map(() => String(a)), notches: [], grain: "90" }];
    let g; try { const r = evaluateModel(m); g = r.pieces.get(1); if (!g) continue; } catch { continue; }
    // skip pieces whose sewing line crosses itself (a broken drawing, not a seam allowance problem)
    const S = g.sew as P[], C = g.cut as P[];
    let sx = false; for (let i = 0; i < S.length && !sx; i++) for (let j = i + 2; j < S.length; j++) if (!(i === 0 && j === S.length - 1) && segX(S[i], S[(i + 1) % S.length], S[j], S[(j + 1) % S.length])) { sx = true; break; }
    if (sx) continue;
    const bad: string[] = [];
    let cx = false; for (let i = 0; i < C.length && !cx; i++) for (let j = i + 2; j < C.length; j++) if (!(i === 0 && j === C.length - 1) && segX(C[i], C[(i + 1) % C.length], C[j], C[(j + 1) % C.length])) { cx = true; break; }
    if (cx) bad.push("selfcross");
    let near = Infinity; for (const q of C) for (let i = 0; i < S.length; i++) near = Math.min(near, distSeg(q, S[i], S[(i + 1) % S.length]));
    if (near < a * 0.9) bad.push("tooNear");
    for (const b of bad) { fails[b] = (fails[b] ?? 0) + 1; if (ex.length < 6) ex.push(`#${k} ${b} a=${a} near=${near.toFixed(2)}`); }
  }
  expect(fails, ex.join("; ")).toEqual({});
 });
});
