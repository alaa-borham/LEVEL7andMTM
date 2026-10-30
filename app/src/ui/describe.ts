// Arabic, human readable description of construction steps.

import type { Model, PointRef, Step } from "../core/model";

// formulas and names are Latin text inside Arabic sentences: isolate them
// left-to-right so "Z6+10" or "-90" keep their order
const ltr = (t: string) => `\u2066${t}\u2069`;

export function describe(s: Step, m: Model): string {
  const n = (id: number) => ltr(m.names[id] ?? `#${id}`);
  const e = ltr;
  const pr = (r: PointRef) => (r.end ? `${r.end === "start" ? "بداية" : "نهاية"} ${n(r.obj)}` : n(r.obj));
  switch (s.op) {
    case "point":
      return `نقطة ${n(s.id)} عند (${e(s.x)} ، ${e(s.y)})`;
    case "pointOn":
      return `نقطة ${n(s.id)} على ${n(s.on)} بمسافة ${e(s.dist + (s.unit === "%" ? "%" : ""))} من ${s.from === "start" ? "البداية" : "النهاية"}`;
    case "intersect":
      return `نقطة ${n(s.id)} تقاطع ${n(s.a)} و ${n(s.b)}`;
    case "pointMove":
      return `نقطة ${n(s.id)} = ${pr(s.from)} منقولة ${e(s.dist)} باتجاه ${n(s.along)}`;
    case "line":
      return `خط ${n(s.id)} من ${pr(s.p1)} إلى ${pr(s.p2)}`;
    case "lineAngle":
      return `خط ${n(s.id)} من ${pr(s.start)} بزاوية ${e(s.angle + "°")} وطول ${e(s.length)}`;
    case "parallel":
      return `خط ${n(s.id)} موازي لـ ${n(s.of)} بمسافة ${e(s.dist)}`;
    case "setLength":
      return `طول ${n(s.target)} = ${e(s.length)}`;
    case "trim":
      return `${s.end === "start" ? "بداية" : "نهاية"} ${n(s.target)} حتى ${n(s.to)}`;
    case "mirror": {
      const list = s.items.map((it) => (it.dst ? `${n(it.src)}←${n(it.dst)}` : n(it.src))).join("، ");
      return `انعكاس حول ${n(s.axis)} ${s.items.some((it) => it.dst) ? "(نسخة)" : "(نقل)"}: ${list}`;
    }
  }
}
