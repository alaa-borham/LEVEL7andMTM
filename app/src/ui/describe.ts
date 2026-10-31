// Arabic, human readable description of construction steps.

import type { Measure, Model, PointRef, Step } from "../core/model";

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
    case "dim": {
      const k = { aligned: "بُعد مائل", h: "بُعد أفقي", v: "بُعد رأسي", length: "بُعد طول", angle: "بُعد زاوية", sum: "مجموع أطوال" }[s.kind] + (s.text ? ` «${s.text}»` : "");
      if (s.kind === "length") return `${k} ${n(s.obj as number)}`;
      if (s.kind === "sum") return `${k} ${(s.objs ?? []).map(n).join(" + ")}`;
      if (s.kind === "angle") return `${k} ${pr(s.a as PointRef)} – ${pr(s.b as PointRef)} – ${pr(s.c as PointRef)}`;
      return `${k} بين ${pr(s.a as PointRef)} و ${pr(s.b as PointRef)}`;
    }
    case "pointOffset":
      return `نقطة ${n(s.id)} = ${pr(s.from)} + (${e(s.dx)} ، ${e(s.dy)})`;
    case "line":
      return `خط ${n(s.id)} من ${pr(s.p1)} إلى ${pr(s.p2)}`;
    case "lineAngle":
      return `خط ${n(s.id)} من ${pr(s.start)} بزاوية ${e(s.angle + "°")} وطول ${e(s.length)}`;
    case "parallels":
      return `خطوط موازية ${s.ids.map(n).join("، ")} لـ ${s.of.map(n).join("، ")} بمسافة ${e(s.dist)}`;
    case "parallel":
      return `خط ${n(s.id)} موازي لـ ${n(s.of)} بمسافة ${e(s.dist)}`;
    case "setLength":
      return `طول ${n(s.target)} = ${e(s.length)}`;
    case "trim":
      return `${s.end === "start" ? "بداية" : "نهاية"} ${n(s.target)} حتى ${n(s.to)}`;
    case "curve": {
      const ends = [s.startAngle && `اتجاه البداية ${e(s.startAngle + "°")}`, s.endAngle && `اتجاه النهاية ${e(s.endAngle + "°")}`].filter(Boolean);
      return `منحنى ${n(s.id)} يمر بـ ${s.through.map(pr).join("، ")}${ends.length ? ` (${ends.join("، ")})` : ""}`;
    }
    case "corner": {
      const at = `${s.endA === "start" ? "بداية" : "نهاية"} ${n(s.a)} و${s.endB === "start" ? "بداية" : "نهاية"} ${n(s.b)}`;
      if (s.kind === "sharp") return `زاوية حادة بين ${at}`;
      return s.kind === "round" ? `زاوية مستديرة ${s.id !== undefined ? n(s.id) + " " : ""}بين ${at} بنصف قطر ${e(s.size)}` : `قطع زاوية ${s.id !== undefined ? n(s.id) + " " : ""}بين ${at} بمسافة ${e(s.size)}`;
    }
    case "mirror": {
      const list = s.items.map((it) => (it.dst ? `${n(it.src)}←${n(it.dst)}` : n(it.src))).join("، ");
      const axis = s.axisPts ? `${pr(s.axisPts[0])}–${pr(s.axisPts[1])}` : s.axisAt ? `${pr(s.axisAt)} بزاوية ${e((s.axisAngle ?? "90") + "°")}` : n(s.axis as number);
      return `انعكاس حول ${axis} ${s.items.some((it) => it.dst) ? "(نسخة)" : "(نقل)"}: ${list}`;
    }
    case "fixed":
      return `${s.kind === "point" ? "نقطة" : "خط"} مستورد ${n(s.id)} (هندسة ثابتة)`;
    case "text":
      return `نص «${s.text}» عند ${pr(s.at)}`;
    case "mark": {
      const k = { lock: "غرزة مستقيمة", double: "غرزة مزدوجة", zigzag: "غرزة زجزاج", deco: "غرز زخرفية", gather: "كشكشة", grain: "خط النسيج (البوصلة)", button: "زر", drill: "ثقب", cross: "علامة +" }[s.kind];
      if (s.obj !== undefined) return `${k} على ${n(s.obj)} بمسافة ${e(s.size)}`;
      if (s.kind === "grain") return `${k} من ${pr(s.a as PointRef)} إلى ${pr(s.b as PointRef)}`;
      return `${k} عند ${pr(s.a as PointRef)} بحجم ${e(s.size)}`;
    }
    case "inherit":
      return `وراثة من البارت ${e(String(s.part).padStart(3, "0"))}: ${s.items.map((it) => n(it.dst)).join("، ")}`;
    case "scale": {
      const list = s.items.map((it) => (it.dst ? `${n(it.src)}←${n(it.dst)}` : n(it.src))).join("، ");
      return `تكبير ${e(s.factor + "%")} حول ${pr(s.center)}${s.angle ? ` باتجاه ${e(s.angle + "°")}` : ""} ${s.items.some((it) => it.dst) ? "(نسخة)" : "(نقل)"}: ${list}`;
    }
  }
}

export function describeMeasure(m: Measure, model: Model): string {
  const n = (id: number) => ltr(model.names[id] ?? `#${id}`);
  const pr = (r: PointRef) => (r.end ? `${r.end === "start" ? "بداية" : "نهاية"} ${n(r.obj)}` : n(r.obj));
  return m.type === "dist" ? `المسافة بين ${pr(m.a)} و ${pr(m.b)}` : `طول ${n(m.obj)}`;
}
