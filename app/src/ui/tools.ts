// Drawing tools: what each tool asks the user to pick, which values it asks
// for, and the construction step it adds.

import { dist, polyLen, type Pt } from "../core/geometry";
import {
  nearerEnd,
  newId,
  sideOf,
  type EvalResult,
  type GObj,
  type Model,
  type PointRef,
  type Step,
  type Variable,
} from "../core/model";
import type { Piece } from "../core/piece";

export type PickKind = "point" | "line" | "canvas" | "object";

export type Pick =
  | { kind: "point"; ref: PointRef; at: Pt }
  | { kind: "line"; obj: number; at: Pt }
  | { kind: "canvas"; at: Pt };

export interface Field {
  key: string;
  label: string;
  value: string;
  optional?: boolean; // may be left empty
  text?: boolean; // plain text, not a formula
  options?: [string, string][]; // select: [value, label]
}

export interface Ctx {
  model: Model;
  res: EvalResult;
  picks: Pick[];
  extra: Pick[]; // picks made in the multi-pick phase (mirror objects, curve points)
}

export interface Tool {
  key: string;
  name: string;
  group: string;
  shortcut?: string;
  picks: { kind: PickKind; prompt: string }[];
  multi?: { kind: "point" | "object" | "line"; prompt: string; min: number }; // any number of picks, finished with Enter
  fields?: (c: Ctx) => Field[];
  build?: (c: Ctx, v: Record<string, string>) => Step;
  makeVar?: (c: Ctx, v: Record<string, string>) => Omit<Variable, "id">; // measurement tools
  makePiece?: (c: Ctx, v: Record<string, string>) => Omit<Piece, "id">;
  addNotch?: boolean; // notch tool: the picked point goes to the nearest piece
  /** A tool that opens a window instead of picking on the drawing (inheritance). */
  action?: boolean;
  /** Delete tools: what they remove, picked one by one or inside a frame (two corners). */
  remove?: "points" | "lines" | "all" | "texts" | "symbols" | "stitches" | "notches";
  frame?: boolean;
}

/** Object id of a multi-pick (a whole point or line). */
export const pickedId = (p: Pick): number | null => (p.kind === "point" ? p.ref.obj : p.kind === "line" ? p.obj : null);

/** Kind for naming a copy of an object (curves keep the C prefix). */
const copyKind = (c: Ctx, id: number): "point" | "line" | "curve" => {
  const o = obj(c, id);
  return o.kind === "point" ? "point" : (c.model.names[id] ?? "").startsWith("C") ? "curve" : "line";
};

const r1 = (x: number) => String(Math.round(x * 10) / 10);
const obj = (c: Ctx, id: number): GObj => c.res.objects.get(id) as GObj;
const line = (c: Ctx, i: number) => c.picks[i] as Extract<Pick, { kind: "line" }>;
const point = (c: Ctx, i: number) => c.picks[i] as Extract<Pick, { kind: "point" }>;

const MODE_FIELD: Field = { key: "mode", label: "النتيجة", value: "copy", options: [["copy", "نسخة جديدة"], ["move", "نقل الأصل"]] };
/** Transformed items: copies get new names (curves keep the C prefix), moves keep the object. */
const transformItems = (c: Ctx, mode: string) =>
  c.extra.map((p) => pickedId(p) as number).map((src) => (mode === "move" ? { src } : { src, dst: newId(c.model, copyKind(c, src)) }));

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
    build: (c, v) => ({ op: "parallel", id: newId(c.model, copyKind(c, line(c, 0).obj) === "curve" ? "curve" : "line"), of: line(c, 0).obj, dist: v.dist, side: v.side === "1" ? 1 : -1 }),
  },
  {
    key: "parallelMany",
    name: "موازٍ لعدة خطوط ومنحنيات",
    group: "الخطوط",
    picks: [],
    multi: { kind: "line", prompt: "انقر الخطوط والمنحنيات، كلاً في الجهة التي تريد الموازي فيها، ثم Enter أو كليك يمين", min: 1 },
    fields: () => [
      { key: "dist", label: "المسافة", value: "10" },
      { key: "flip", label: "الجهة", value: "", options: [["", "كما نقرت"], ["1", "الجهة الأخرى للكل"]] },
    ],
    build: (c, v) => {
      const of = c.extra.map((p) => pickedId(p) as number);
      const sides = c.extra.map((p) => (sideOf(obj(c, pickedId(p) as number), p.at) * (v.flip === "1" ? -1 : 1)) as 1 | -1);
      return { op: "parallels", ids: of.map((id) => newId(c.model, copyKind(c, id) === "curve" ? "curve" : "line")), of, sides, dist: v.dist };
    },
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
    name: "انعكاس حول خط (نسخة)",
    group: "التحويلات",
    shortcut: "8",
    picks: [{ kind: "line", prompt: "انقر محور الانعكاس" }],
    multi: { kind: "object", prompt: "انقر العناصر المراد نسخها بالانعكاس، ثم Enter للتنفيذ", min: 1 },
    build: (c) => ({
      op: "mirror",
      axis: line(c, 0).obj,
      items: c.extra.map((p) => pickedId(p) as number).map((src) => ({ src, dst: newId(c.model, copyKind(c, src)) })),
    }),
  },
  {
    key: "mirrorMove",
    name: "انعكاس حول خط (نقل)",
    group: "التحويلات",
    picks: [{ kind: "line", prompt: "انقر محور الانعكاس" }],
    multi: { kind: "object", prompt: "انقر العناصر المراد قلبها في مكانها، ثم Enter للتنفيذ", min: 1 },
    build: (c) => ({ op: "mirror", axis: line(c, 0).obj, items: c.extra.map((p) => ({ src: pickedId(p) as number })) }),
  },
  {
    key: "stitchLock",
    name: "غرزة مستقيمة (Lockstitch)",
    group: "الغرز",
    picks: [{ kind: "line", prompt: "انقر الخط أو المنحنى في الجهة التي تريد الغرزة فيها" }],
    fields: () => [{ key: "size", label: "البعد عن الحافة مم", value: "3" }],
    build: (c, v) => ({ op: "mark", kind: "lock", obj: line(c, 0).obj, side: sideOf(obj(c, line(c, 0).obj), line(c, 0).at), size: v.size }),
  },
  {
    key: "stitchDouble",
    name: "غرزة مزدوجة",
    group: "الغرز",
    picks: [{ kind: "line", prompt: "انقر الخط أو المنحنى في الجهة التي تريد الغرزة فيها" }],
    fields: () => [{ key: "size", label: "البعد عن الحافة مم", value: "3" }],
    build: (c, v) => ({ op: "mark", kind: "double", obj: line(c, 0).obj, side: sideOf(obj(c, line(c, 0).obj), line(c, 0).at), size: v.size }),
  },
  {
    key: "stitchZigzag",
    name: "غرزة زجزاج",
    group: "الغرز",
    picks: [{ kind: "line", prompt: "انقر الخط أو المنحنى في الجهة التي تريد الغرزة فيها" }],
    fields: () => [{ key: "size", label: "البعد عن الحافة مم", value: "3" }],
    build: (c, v) => ({ op: "mark", kind: "zigzag", obj: line(c, 0).obj, side: sideOf(obj(c, line(c, 0).obj), line(c, 0).at), size: v.size }),
  },
  {
    key: "stitchDeco",
    name: "غرز زخرفية",
    group: "الغرز",
    picks: [{ kind: "line", prompt: "انقر الخط أو المنحنى في الجهة التي تريد الغرزة فيها" }],
    fields: () => [{ key: "size", label: "البعد عن الحافة مم", value: "3" }],
    build: (c, v) => ({ op: "mark", kind: "deco", obj: line(c, 0).obj, side: sideOf(obj(c, line(c, 0).obj), line(c, 0).at), size: v.size }),
  },
  {
    key: "stitchGather",
    name: "كشكشة (Gather)",
    group: "الغرز",
    picks: [{ kind: "line", prompt: "انقر الخط أو المنحنى في الجهة التي تريد الغرزة فيها" }],
    fields: () => [{ key: "size", label: "البعد عن الحافة مم", value: "3" }],
    build: (c, v) => ({ op: "mark", kind: "gather", obj: line(c, 0).obj, side: sideOf(obj(c, line(c, 0).obj), line(c, 0).at), size: v.size }),
  },
  {
    key: "grainLine",
    name: "خط النسيج (Grain line)",
    group: "العلامات",
    picks: [
      { kind: "point", prompt: "انقر بداية خط النسيج" },
      { kind: "point", prompt: "انقر نهايته" },
    ],
    build: (c) => ({ op: "mark", kind: "grain", a: point(c, 0).ref, b: point(c, 1).ref, size: "0" }),
  },
  {
    key: "symButton",
    name: "زر",
    group: "العلامات",
    picks: [{ kind: "point", prompt: "انقر موضع العلامة" }],
    fields: () => [{ key: "size", label: "قطر الزر مم", value: "12" }],
    build: (c, v) => ({ op: "mark", kind: "button", a: point(c, 0).ref, size: v.size }),
  },
  {
    key: "symDrill",
    name: "ثقب (Drill hole)",
    group: "العلامات",
    picks: [{ kind: "point", prompt: "انقر موضع العلامة" }],
    fields: () => [{ key: "size", label: "القطر مم", value: "4" }],
    build: (c, v) => ({ op: "mark", kind: "drill", a: point(c, 0).ref, size: v.size }),
  },
  {
    key: "symCross",
    name: "علامة +",
    group: "العلامات",
    picks: [{ kind: "point", prompt: "انقر موضع العلامة" }],
    fields: () => [{ key: "size", label: "الحجم مم", value: "8" }],
    build: (c, v) => ({ op: "mark", kind: "cross", a: point(c, 0).ref, size: v.size }),
  },
  {
    key: "convertNotch",
    name: "تحويل النوتش (Convert notch)",
    group: "العلامات",
    picks: [{ kind: "canvas", prompt: "انقر النوتش في القطعة" }],
    fields: () => [{ key: "type", label: "شكل النوتش", value: "t", options: [["slit", "شق I"], ["t", "شق T"], ["v", "شق V"], ["castle", "مربع (Castle)"]] }],
  },
  {
    key: "textCreate",
    name: "نص على الرسم",
    group: "النصوص",
    picks: [{ kind: "point", prompt: "انقر موضع النص" }],
    fields: () => [
      { key: "text", label: "النص ({X1} يعرض قيمة X1)", value: "", text: true },
      { key: "size", label: "ارتفاع الحروف مم", value: "6" },
      { key: "angle", label: "الزاوية °", value: "0" },
    ],
    build: (c, v) => ({ op: "text", at: point(c, 0).ref, text: v.text || "نص", size: v.size, angle: v.angle }),
  },
  {
    key: "delText",
    name: "حذف نص",
    group: "الحذف",
    picks: [{ kind: "canvas", prompt: "انقر النص المراد حذفه" }],
    remove: "texts",
  },
  {
    key: "delTextFrame",
    name: "حذف نصوص داخل إطار",
    group: "الحذف",
    picks: [
      { kind: "canvas", prompt: "انقر ركن الإطار الأول" },
      { kind: "canvas", prompt: "انقر الركن المقابل" },
    ],
    remove: "texts",
    frame: true,
  },
  {
    key: "delSymbolsFrame",
    name: "حذف العلامات الداخلية داخل إطار",
    group: "الحذف",
    picks: [
      { kind: "canvas", prompt: "انقر ركن الإطار الأول" },
      { kind: "canvas", prompt: "انقر الركن المقابل" },
    ],
    remove: "symbols",
    frame: true,
  },
  {
    key: "delStitchesFrame",
    name: "حذف الغرز داخل إطار",
    group: "الحذف",
    picks: [
      { kind: "canvas", prompt: "انقر ركن الإطار الأول" },
      { kind: "canvas", prompt: "انقر الركن المقابل" },
    ],
    remove: "stitches",
    frame: true,
  },
  {
    key: "delNotchesFrame",
    name: "حذف النوتشات داخل إطار",
    group: "الحذف",
    picks: [
      { kind: "canvas", prompt: "انقر ركن الإطار الأول" },
      { kind: "canvas", prompt: "انقر الركن المقابل" },
    ],
    remove: "notches",
    frame: true,
  },
  {
    key: "delPoints",
    name: "حذف نقاط",
    group: "الحذف",
    picks: [],
    multi: { kind: "object", prompt: "انقر النقاط المراد حذفها، ثم Enter أو كليك يمين", min: 1 },
    remove: "points",
  },
  {
    key: "delLines",
    name: "حذف خطوط ومنحنيات",
    group: "الحذف",
    picks: [],
    multi: { kind: "line", prompt: "انقر الخطوط والمنحنيات المراد حذفها، ثم Enter أو كليك يمين", min: 1 },
    remove: "lines",
  },
  {
    key: "delPointsFrame",
    name: "حذف نقاط داخل إطار",
    group: "الحذف",
    picks: [
      { kind: "canvas", prompt: "انقر ركن الإطار الأول" },
      { kind: "canvas", prompt: "انقر الركن المقابل" },
    ],
    remove: "points",
    frame: true,
  },
  {
    key: "delLinesFrame",
    name: "حذف خطوط ومنحنيات داخل إطار",
    group: "الحذف",
    picks: [
      { kind: "canvas", prompt: "انقر ركن الإطار الأول" },
      { kind: "canvas", prompt: "انقر الركن المقابل" },
    ],
    remove: "lines",
    frame: true,
  },
  {
    key: "delAllFrame",
    name: "حذف الكل داخل إطار",
    group: "الحذف",
    picks: [
      { kind: "canvas", prompt: "انقر ركن الإطار الأول" },
      { kind: "canvas", prompt: "انقر الركن المقابل" },
    ],
    remove: "all",
    frame: true,
  },
  {
    key: "inheritObjects",
    name: "وراثة عناصر من بارت سابق",
    group: "الوراثة",
    picks: [],
    action: true,
  },
  {
    key: "inheritBlock",
    name: "وراثة قالب أساسي من المكتبة",
    group: "الوراثة",
    picks: [],
    action: true,
  },
  {
    key: "saveBlock",
    name: "حفظ البارت في مكتبة القوالب",
    group: "الوراثة",
    picks: [],
    action: true,
  },
  {
    key: "inheritPart",
    name: "وراثة بارت كامل",
    group: "الوراثة",
    picks: [],
    action: true,
  },
  {
    key: "mirrorPts",
    name: "انعكاس بمحور من نقطة إلى نقطة",
    group: "التحويلات",
    picks: [
      { kind: "point", prompt: "انقر النقطة الأولى لمحور الانعكاس" },
      { kind: "point", prompt: "انقر النقطة الثانية لمحور الانعكاس" },
    ],
    multi: { kind: "object", prompt: "انقر العناصر المراد عكسها، ثم Enter أو كليك يمين", min: 1 },
    fields: () => [MODE_FIELD],
    build: (c, v) => ({ op: "mirror", axisPts: [point(c, 0).ref, point(c, 1).ref], items: transformItems(c, v.mode) }),
  },
  {
    key: "mirrorDir",
    name: "انعكاس بمحور من نقطة واتجاه",
    group: "التحويلات",
    picks: [{ kind: "point", prompt: "انقر نقطة على محور الانعكاس" }],
    multi: { kind: "object", prompt: "انقر العناصر المراد عكسها، ثم Enter أو كليك يمين", min: 1 },
    fields: () => [{ key: "angle", label: "اتجاه المحور °", value: "90" }, MODE_FIELD],
    build: (c, v) => ({ op: "mirror", axisAt: point(c, 0).ref, axisAngle: v.angle, items: transformItems(c, v.mode) }),
  },
  {
    key: "scalePts",
    name: "تكبير وتصغير حول نقطة",
    group: "التحويلات",
    picks: [{ kind: "point", prompt: "انقر نقطة مركز التكبير" }],
    multi: { kind: "object", prompt: "انقر العناصر المراد تكبيرها أو تصغيرها، ثم Enter أو كليك يمين", min: 1 },
    fields: () => [{ key: "factor", label: "النسبة %", value: "100" }, MODE_FIELD],
    build: (c, v) => ({ op: "scale", center: point(c, 0).ref, factor: v.factor, items: transformItems(c, v.mode) }),
  },
  {
    key: "scaleDir",
    name: "تكبير وتصغير باتجاه",
    group: "التحويلات",
    picks: [{ kind: "point", prompt: "انقر نقطة الأساس" }],
    multi: { kind: "object", prompt: "انقر العناصر المراد مطّها، ثم Enter أو كليك يمين", min: 1 },
    fields: () => [{ key: "angle", label: "الاتجاه °", value: "0" }, { key: "factor", label: "النسبة %", value: "100" }, MODE_FIELD],
    build: (c, v) => ({ op: "scale", center: point(c, 0).ref, factor: v.factor, angle: v.angle, items: transformItems(c, v.mode) }),
  },
  {
    key: "curve",
    name: "منحنى عبر نقاط",
    group: "المنحنيات",
    shortcut: "9",
    picks: [],
    multi: { kind: "point", prompt: "انقر نقاط المنحنى بالترتيب، ثم Enter", min: 2 },
    fields: () => [
      { key: "startAngle", label: "اتجاه البداية °", value: "", optional: true },
      { key: "endAngle", label: "اتجاه النهاية °", value: "", optional: true },
    ],
    build: (c, v) => ({
      op: "curve",
      id: newId(c.model, "curve"),
      through: c.extra.map((p) => (p as Extract<Pick, { kind: "point" }>).ref),
      startAngle: v.startAngle,
      endAngle: v.endAngle,
    }),
  },
  {
    key: "cornerSharp",
    name: "زاوية حادة",
    group: "الزوايا",
    picks: [
      { kind: "line", prompt: "انقر الخط الأول قرب الزاوية" },
      { kind: "line", prompt: "انقر الخط الثاني قرب الزاوية" },
    ],
    build: (c) => cornerStep(c, "sharp", "0"),
  },
  {
    key: "cornerRound",
    name: "زاوية مستديرة",
    group: "الزوايا",
    picks: [
      { kind: "line", prompt: "انقر الخط الأول قرب الزاوية" },
      { kind: "line", prompt: "انقر الخط الثاني قرب الزاوية" },
    ],
    fields: () => [{ key: "size", label: "نصف القطر", value: "10" }],
    build: (c, v) => cornerStep(c, "round", v.size),
  },
  {
    key: "cornerChamfer",
    name: "قطع الزاوية",
    group: "الزوايا",
    picks: [
      { kind: "line", prompt: "انقر الخط الأول قرب الزاوية" },
      { kind: "line", prompt: "انقر الخط الثاني قرب الزاوية" },
    ],
    fields: () => [{ key: "size", label: "المسافة من الزاوية", value: "10" }],
    build: (c, v) => cornerStep(c, "chamfer", v.size),
  },
  {
    key: "piece",
    name: "قطعة من الحدود",
    group: "القطع",
    shortcut: "0",
    picks: [],
    multi: { kind: "line", prompt: "انقر حدود القطعة بالترتيب حولها (خطوط ومنحنيات)، ثم Enter", min: 2 },
    fields: (c) => [
      { key: "name", label: "اسم القطعة", value: `قطعة ${(c.model.pieces?.length ?? 0) + 1}`, text: true },
      { key: "seam", label: "حاشية الخياطة", value: "10" },
      { key: "quantity", label: "العدد", value: "1", text: true },
      { key: "fabric", label: "القماش", value: "قماش الوجه", text: true },
      { key: "grain", label: "خط النسيج °", value: "90" },
    ],
    makePiece: (c, v) => ({
      name: v.name,
      quantity: Math.max(1, Math.round(Number(v.quantity) || 1)),
      fabric: v.fabric,
      edges: c.extra.map((p) => pickedId(p) as number),
      seam: c.extra.map(() => v.seam),
      notches: [],
      grain: v.grain,
    }),
  },
  {
    key: "notch",
    name: "نوتش",
    group: "القطع",
    picks: [{ kind: "point", prompt: "انقر نقطة على حدود القطعة (نقطة أو طرف خط)" }],
    addNotch: true,
  },
  {
    key: "dimAligned",
    name: "بُعد مائل (مسافة)",
    group: "الأبعاد",
    picks: [
      { kind: "point", prompt: "انقر النقطة الأولى" },
      { kind: "point", prompt: "انقر النقطة الثانية" },
    ],
    fields: () => [{ key: "offset", label: "إزاحة خط البعد", value: "10" }],
    build: (c, v) => ({ op: "dim", kind: "aligned", a: point(c, 0).ref, b: point(c, 1).ref, offset: v.offset }),
  },
  {
    key: "dimH",
    name: "بُعد أفقي",
    group: "الأبعاد",
    picks: [
      { kind: "point", prompt: "انقر النقطة الأولى" },
      { kind: "point", prompt: "انقر النقطة الثانية" },
    ],
    fields: () => [{ key: "offset", label: "إزاحة خط البعد", value: "10" }],
    build: (c, v) => ({ op: "dim", kind: "h", a: point(c, 0).ref, b: point(c, 1).ref, offset: v.offset }),
  },
  {
    key: "dimV",
    name: "بُعد رأسي",
    group: "الأبعاد",
    picks: [
      { kind: "point", prompt: "انقر النقطة الأولى" },
      { kind: "point", prompt: "انقر النقطة الثانية" },
    ],
    fields: () => [{ key: "offset", label: "إزاحة خط البعد", value: "10" }],
    build: (c, v) => ({ op: "dim", kind: "v", a: point(c, 0).ref, b: point(c, 1).ref, offset: v.offset }),
  },
  {
    key: "dimLength",
    name: "بُعد طول خط أو منحنى",
    group: "الأبعاد",
    picks: [{ kind: "line", prompt: "انقر الخط أو المنحنى" }],
    fields: () => [{ key: "offset", label: "إزاحة خط البعد", value: "10" }],
    build: (c, v) => ({ op: "dim", kind: "length", obj: line(c, 0).obj, offset: v.offset }),
  },
  {
    key: "dimSum",
    name: "مجموع أطوال (Σ)",
    group: "الأبعاد",
    picks: [],
    multi: { kind: "line", prompt: "انقر الخطوط والمنحنيات المراد جمع أطوالها، ثم Enter أو كليك يمين", min: 1 },
    fields: () => [
      { key: "offset", label: "إزاحة خط البعد", value: "10" },
      { key: "text", label: "نص على البعد", value: "", text: true, optional: true },
    ],
    build: (c, v) => ({ op: "dim", kind: "sum", objs: c.extra.map((p) => pickedId(p) as number), offset: v.offset, text: v.text || undefined }),
  },
  {
    key: "dimAngle",
    name: "بُعد زاوية",
    group: "الأبعاد",
    picks: [
      { kind: "point", prompt: "انقر نقطة على الضلع الأول" },
      { kind: "point", prompt: "انقر رأس الزاوية" },
      { kind: "point", prompt: "انقر نقطة على الضلع الثاني" },
    ],
    build: (c) => ({ op: "dim", kind: "angle", a: point(c, 0).ref, b: point(c, 1).ref, c: point(c, 2).ref, offset: "0" }),
  },
  {
    key: "measureDist",
    name: "قياس مسافة ← Z",
    group: "القياس من الرسم",
    picks: [
      { kind: "point", prompt: "انقر النقطة الأولى" },
      { kind: "point", prompt: "انقر النقطة الثانية" },
    ],
    fields: (c) => [{ key: "name", label: "الوصف", value: `مسافة ${r1(dist(c.picks[0].at, c.picks[1].at))}`, text: true }],
    makeVar: (c, v) => ({ name: v.name, expr: "", measure: { type: "dist", a: point(c, 0).ref, b: point(c, 1).ref } }),
  },
  {
    key: "measureLength",
    name: "قياس طول ← Z",
    group: "القياس من الرسم",
    picks: [{ kind: "line", prompt: "انقر الخط أو المنحنى" }],
    fields: (c) => [{ key: "name", label: "الوصف", value: `طول ${c.model.names[line(c, 0).obj] ?? ""}`, text: true }],
    makeVar: (c, v) => ({ name: v.name, expr: "", measure: { type: "length", obj: line(c, 0).obj } }),
  },
];

/** Expression fields of an existing step, for editing it from the step list. */
/** Corner step from two line picks; each line is cut at the end nearer its click. */
function cornerStep(c: Ctx, kind: "sharp" | "round" | "chamfer", size: string): Step {
  const a = line(c, 0), b = line(c, 1);
  if (a.obj === b.obj) throw new Error("اختر خطين مختلفين");
  return {
    op: "corner", kind, a: a.obj, endA: nearerEnd(obj(c, a.obj), a.at), b: b.obj, endB: nearerEnd(obj(c, b.obj), b.at), size,
    ...(kind === "sharp" ? {} : { id: newId(c.model, kind === "round" ? "curve" : "line") }),
  };
}

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
    case "dim":
      return [
        ...(s.kind === "angle" ? [] : [{ key: "offset", label: "إزاحة خط البعد", value: s.offset }]),
        { key: "text", label: "نص على البعد", value: s.text ?? "", text: true, optional: true },
        { key: "flip", label: "اتجاه القيمة", value: s.flip ?? "", options: [["", "عادي"], ["1", "مقلوب (الجهة الأخرى)"]] as [string, string][] },
      ];
    case "pointOffset":
      return [
        { key: "dx", label: "إزاحة س", value: s.dx },
        { key: "dy", label: "إزاحة ص", value: s.dy },
      ];
    case "lineAngle":
      return [
        { key: "angle", label: "الزاوية °", value: s.angle },
        { key: "length", label: "الطول", value: s.length },
      ];
    case "parallels":
      return [{ key: "dist", label: "المسافة", value: s.dist }];
    case "text":
      return [
        { key: "text", label: "النص", value: s.text, text: true },
        { key: "size", label: "ارتفاع الحروف مم", value: s.size },
        { key: "angle", label: "الزاوية °", value: s.angle },
      ];
    case "mark":
      return s.kind === "grain" ? [] : [{ key: "size", label: s.obj !== undefined ? "البعد عن الحافة مم" : "الحجم مم", value: s.size }];
    case "mirror":
      return s.axisAt ? [{ key: "axisAngle", label: "اتجاه المحور °", value: s.axisAngle ?? "90" }] : [];
    case "scale":
      return [{ key: "factor", label: "النسبة %", value: s.factor }, ...(s.angle !== undefined ? [{ key: "angle", label: "الاتجاه °", value: s.angle }] : [])];
    case "parallel":
      return [
        { key: "dist", label: "المسافة", value: s.dist },
        { key: "side", label: "الجهة", value: String(s.side), options: [["1", "يسار اتجاه الخط"], ["-1", "يمين اتجاه الخط"]] },
      ];
    case "setLength":
      return [{ key: "length", label: "الطول الجديد", value: s.length }];
    case "trim":
      return [{ key: "end", label: "الطرف", value: s.end, options: [["start", "البداية"], ["end", "النهاية"]] }];
    case "corner":
      return s.kind === "sharp" ? [] : [{ key: "size", label: s.kind === "round" ? "نصف القطر" : "المسافة من الزاوية", value: s.size }];
    case "curve":
      return [
        { key: "startAngle", label: "اتجاه البداية °", value: s.startAngle, optional: true },
        { key: "endAngle", label: "اتجاه النهاية °", value: s.endAngle, optional: true },
        { key: "startTension", label: "شدة البداية %", value: s.startTension ?? "", optional: true },
        { key: "endTension", label: "شدة النهاية %", value: s.endTension ?? "", optional: true },
      ];
    default:
      return [];
  }
}

export function applyFields(s: Step, v: Record<string, string>): void {
  const t = s as unknown as Record<string, unknown>;
  for (const [k, val] of Object.entries(v)) t[k] = k === "side" ? (val === "1" ? 1 : -1) : val;
}
