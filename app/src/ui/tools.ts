// Drawing tools: what each tool asks the user to pick, which values it asks
// for, and the construction step it adds.

import { dist, polyLen, type Pt } from "../core/geometry";
import { nearerEnd, newId, sideOf, type EvalResult, type GObj, type Model, type PointRef, type Step } from "../core/model";

export type PickKind = "point" | "line" | "canvas" | "object";

export type Pick =
  | { kind: "point"; ref: PointRef; at: Pt }
  | { kind: "line"; obj: number; at: Pt }
  | { kind: "canvas"; at: Pt };

export interface Field {
  key: string;
  label: string;
  value: string;
  options?: [string, string][]; // select: [value, label]
}

export interface Ctx {
  model: Model;
  res: EvalResult;
  picks: Pick[];
  extra: number[]; // multi-pick objects (mirror)
}

export interface Tool {
  key: string;
  name: string;
  group: string;
  shortcut?: string;
  picks: { kind: PickKind; prompt: string }[];
  multi?: string; // prompt for picking any number of objects, finished with Enter
  fields?: (c: Ctx) => Field[];
  build: (c: Ctx, v: Record<string, string>) => Step;
}

const r1 = (x: number) => String(Math.round(x * 10) / 10);
const obj = (c: Ctx, id: number): GObj => c.res.objects.get(id) as GObj;
const line = (c: Ctx, i: number) => c.picks[i] as Extract<Pick, { kind: "line" }>;
const point = (c: Ctx, i: number) => c.picks[i] as Extract<Pick, { kind: "point" }>;

export const TOOLS: Tool[] = [
  {
    key: "point",
    name: "نقطة حرة",
    group: "النقاط",
    shortcut: "1",
    picks: [{ kind: "canvas", prompt: "انقر مكان النقطة، ثم عدّل الإحداثيات" }],
    fields: (c) => [
      { key: "x", label: "س (أفقي)", value: r1(c.picks[0].at[0]) },
      { key: "y", label: "ص (رأسي)", value: r1(c.picks[0].at[1]) },
    ],
    build: (c, v) => ({ op: "point", id: newId(c.model, "point"), x: v.x, y: v.y }),
  },
  {
    key: "pointOn",
    name: "نقطة على خط",
    group: "النقاط",
    shortcut: "2",
    picks: [{ kind: "line", prompt: "انقر على الخط قريباً من الطرف الذي تقيس منه" }],
    fields: (c) => {
      const p = line(c, 0);
      const o = obj(c, p.obj);
      const end = nearerEnd(o, p.at);
      const from = end === "start" ? o.pts[0] : o.pts[o.pts.length - 1];
      return [
        { key: "dist", label: "المسافة", value: r1(dist(from, p.at)) },
        { key: "unit", label: "الوحدة", value: "mm", options: [["mm", "مليمتر"], ["%", "نسبة من الطول %"]] },
        { key: "from", label: "تُقاس من", value: end, options: [["start", "بداية الخط"], ["end", "نهاية الخط"]] },
      ];
    },
    build: (c, v) => ({
      op: "pointOn",
      id: newId(c.model, "point"),
      on: line(c, 0).obj,
      dist: v.dist,
      unit: v.unit as "mm" | "%",
      from: v.from as "start" | "end",
    }),
  },
  {
    key: "intersect",
    name: "نقطة تقاطع",
    group: "النقاط",
    shortcut: "3",
    picks: [
      { kind: "line", prompt: "انقر الخط الأول" },
      { kind: "line", prompt: "انقر الخط الثاني قريباً من مكان التقاطع" },
    ],
    build: (c) => ({ op: "intersect", id: newId(c.model, "point"), a: line(c, 0).obj, b: line(c, 1).obj, near: c.picks[1].at }),
  },
  {
    key: "pointMove",
    name: "نقطة منقولة باتجاه خط",
    group: "النقاط",
    picks: [
      { kind: "point", prompt: "انقر النقطة الأصلية" },
      { kind: "line", prompt: "انقر الخط الذي يحدد الاتجاه (من بدايته لنهايته)" },
    ],
    fields: () => [{ key: "dist", label: "المسافة", value: "10" }],
    build: (c, v) => ({ op: "pointMove", id: newId(c.model, "point"), from: point(c, 0).ref, along: line(c, 1).obj, dist: v.dist }),
  },
  {
    key: "line",
    name: "خط بين نقطتين",
    group: "الخطوط",
    shortcut: "4",
    picks: [
      { kind: "point", prompt: "انقر نقطة البداية (نقطة أو طرف خط)" },
      { kind: "point", prompt: "انقر نقطة النهاية" },
    ],
    build: (c) => ({ op: "line", id: newId(c.model, "line"), p1: point(c, 0).ref, p2: point(c, 1).ref }),
  },
  {
    key: "lineAngle",
    name: "خط بزاوية وطول",
    group: "الخطوط",
    shortcut: "5",
    picks: [{ kind: "point", prompt: "انقر نقطة بداية الخط" }],
    fields: () => [
      { key: "angle", label: "الزاوية °", value: "0" },
      { key: "length", label: "الطول", value: "100" },
    ],
    build: (c, v) => ({ op: "lineAngle", id: newId(c.model, "line"), start: point(c, 0).ref, angle: v.angle, length: v.length }),
  },
  {
    key: "parallel",
    name: "خط موازي",
    group: "الخطوط",
    shortcut: "6",
    picks: [{ kind: "line", prompt: "انقر الخط، في الجهة التي تريد الموازي فيها" }],
    fields: (c) => {
      const p = line(c, 0);
      return [
        { key: "dist", label: "المسافة", value: "50" },
        { key: "side", label: "الجهة", value: String(sideOf(obj(c, p.obj), p.at)), options: [["1", "يسار اتجاه الخط"], ["-1", "يمين اتجاه الخط"]] },
      ];
    },
    build: (c, v) => ({ op: "parallel", id: newId(c.model, "line"), of: line(c, 0).obj, dist: v.dist, side: v.side === "1" ? 1 : -1 }),
  },
  {
    key: "setLength",
    name: "تعديل طول خط",
    group: "التعديل",
    picks: [{ kind: "line", prompt: "انقر الخط (يتغير طوله من نهايته)" }],
    fields: (c) => [{ key: "length", label: "الطول الجديد", value: r1(polyLen(obj(c, line(c, 0).obj).pts)) }],
    build: (c, v) => ({ op: "setLength", target: line(c, 0).obj, length: v.length }),
  },
  {
    key: "trim",
    name: "قص / تمديد لحد",
    group: "التعديل",
    shortcut: "7",
    picks: [
      { kind: "line", prompt: "انقر الخط قريباً من الطرف الذي تريد قصه أو تمديده" },
      { kind: "line", prompt: "انقر الخط الحد" },
    ],
    build: (c) => {
      const p = line(c, 0);
      return { op: "trim", target: p.obj, end: nearerEnd(obj(c, p.obj), p.at), to: line(c, 1).obj };
    },
  },
  {
    key: "mirrorCopy",
    name: "انعكاس (نسخة)",
    group: "التعديل",
    shortcut: "8",
    picks: [{ kind: "line", prompt: "انقر محور الانعكاس" }],
    multi: "انقر العناصر المراد نسخها بالانعكاس، ثم Enter للتنفيذ",
    build: (c) => ({
      op: "mirror",
      axis: line(c, 0).obj,
      items: c.extra.map((src) => ({ src, dst: newId(c.model, obj(c, src).kind) })),
    }),
  },
  {
    key: "mirrorMove",
    name: "انعكاس (نقل)",
    group: "التعديل",
    picks: [{ kind: "line", prompt: "انقر محور الانعكاس" }],
    multi: "انقر العناصر المراد قلبها في مكانها، ثم Enter للتنفيذ",
    build: (c) => ({ op: "mirror", axis: line(c, 0).obj, items: c.extra.map((src) => ({ src })) }),
  },
];

/** Expression fields of an existing step, for editing it from the step list. */
export function stepFields(s: Step): Field[] {
  switch (s.op) {
    case "point":
      return [
        { key: "x", label: "س (أفقي)", value: s.x },
        { key: "y", label: "ص (رأسي)", value: s.y },
      ];
    case "pointOn":
      return [
        { key: "dist", label: "المسافة", value: s.dist },
        { key: "unit", label: "الوحدة", value: s.unit, options: [["mm", "مليمتر"], ["%", "نسبة من الطول %"]] },
        { key: "from", label: "تُقاس من", value: s.from, options: [["start", "بداية الخط"], ["end", "نهاية الخط"]] },
      ];
    case "pointMove":
      return [{ key: "dist", label: "المسافة", value: s.dist }];
    case "lineAngle":
      return [
        { key: "angle", label: "الزاوية °", value: s.angle },
        { key: "length", label: "الطول", value: s.length },
      ];
    case "parallel":
      return [
        { key: "dist", label: "المسافة", value: s.dist },
        { key: "side", label: "الجهة", value: String(s.side), options: [["1", "يسار اتجاه الخط"], ["-1", "يمين اتجاه الخط"]] },
      ];
    case "setLength":
      return [{ key: "length", label: "الطول الجديد", value: s.length }];
    case "trim":
      return [{ key: "end", label: "الطرف", value: s.end, options: [["start", "البداية"], ["end", "النهاية"]] }];
    default:
      return [];
  }
}

export function applyFields(s: Step, v: Record<string, string>): void {
  const t = s as unknown as Record<string, unknown>;
  for (const [k, val] of Object.entries(v)) t[k] = k === "side" ? (val === "1" ? 1 : -1) : val;
}
