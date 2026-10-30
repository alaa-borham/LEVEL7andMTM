import { emptyModel, newId, type Model, type Step } from "./model";

// First steps of the basic thobe from ALAA2026.mdl, size __HN40_0.
// Expected numbers are the coordinates GRAFIS stored for the same objects.
export function thobeSample(): { m: Model; ids: Record<string, number> } {
  const m = emptyModel("الثوب الأساسي (بداية)");
  m.measurements = [
    { id: 1, name: "الطول", value: 1320 },
    { id: 3, name: "shoulder--B", value: 370 },
    { id: 4, name: "down FRONT R", value: 50 },
    { id: 5, name: "down FRONT L", value: 70 },
    { id: 7, name: "collar--E1", value: 350 },
  ];
  m.variables = [
    { id: 1, name: "", expr: "CMDIF[X4>50]{X4/20}{0}" },
    { id: 2, name: "", expr: "CMDIF[X4>50]{X4/24}{0}" },
    { id: 6, name: "فتحه الرقبه عرض", expr: "X7/6.7+Z1" },
    { id: 7, name: "فتحه الرقبه طول", expr: "X7/5.3+Z2" },
    { id: 9, name: "الكتف", expr: "X3/2" },
    { id: 11, name: "نزول الكتف امام R", expr: "X4-(X4/8)" },
    { id: 12, name: "نزول الكتف امام L", expr: "X5-1" },
    { id: 15, name: "فرق الصدر R", expr: "Z9-13" },
    { id: 16, name: "فرق الصدرL", expr: "Z15" },
    { id: 18, name: "الطول", expr: "X1" },
  ];
  const ids: Record<string, number> = {};
  const add = (key: string, kind: "point" | "line" | "curve", make: (id: number) => Step) => {
    const id = newId(m, kind);
    ids[key] = id;
    m.steps.push(make(id));
  };
  add("O", "point", (id) => ({ op: "point", id, x: "0", y: "0" }));
  add("cf", "line", (id) => ({ op: "lineAngle", id, start: { obj: ids.O }, angle: "-90", length: "Z18" })); // 2001
  add("sh", "line", (id) => ({ op: "lineAngle", id, start: { obj: ids.O }, angle: "0", length: "Z9" })); // 2002
  add("neck", "point", (id) => ({ op: "pointOn", id, on: ids.sh, dist: "Z6", unit: "mm", from: "start" })); // 2005
  add("neckD", "point", (id) => ({ op: "pointOn", id, on: ids.cf, dist: "Z7", unit: "mm", from: "start" })); // 2006
  add("pL", "point", (id) => ({ op: "pointOn", id, on: ids.cf, dist: "Z12", unit: "mm", from: "start" }));
  add("lL", "line", (id) => ({ op: "lineAngle", id, start: { obj: ids.pL }, angle: "0", length: "Z16" })); // 2003
  add("pR", "point", (id) => ({ op: "pointOn", id, on: ids.cf, dist: "Z11", unit: "mm", from: "start" }));
  add("lR", "line", (id) => ({ op: "lineAngle", id, start: { obj: ids.pR }, angle: "0", length: "Z15" })); // 2004
  add("shL", "line", (id) => ({ op: "line", id, p1: { obj: ids.neck }, p2: { obj: ids.lL, end: "end" } })); // 2007
  add("shR", "line", (id) => ({ op: "line", id, p1: { obj: ids.neck }, p2: { obj: ids.lR, end: "end" } })); // 2008
  add("up", "line", (id) => ({ op: "lineAngle", id, start: { obj: ids.lR, end: "end" }, angle: "90", length: "100" })); // 2041
  m.steps.push({ op: "trim", target: ids.up, end: "end", to: ids.sh });
  m.steps.push({ op: "mirror", axis: ids.cf, items: [{ src: ids.lL }, { src: ids.shL }] });
  add("par", "line", (id) => ({ op: "parallel", id, of: ids.sh, dist: "50", side: -1 }));
  // front neck curve: leaves the centre front at a right angle, ends on the shoulder neck point
  add("neckC", "curve", (id) => ({ op: "curve", id, through: [{ obj: ids.neckD }, { obj: ids.neck }], startAngle: "0", endAngle: "" }));
  m.variables.push({ id: 19, name: "طول فتحة الرقبة الأمامية", expr: "", measure: { type: "length", obj: ids.neckC } });
  // a simple front half piece (demonstration only): neck, shoulder, side, hem, centre front
  add("side", "line", (id) => ({ op: "lineAngle", id, start: { obj: ids.lR, end: "end" }, angle: "-90", length: "Z18" }));
  add("hem", "line", (id) => ({ op: "lineAngle", id, start: { obj: ids.cf, end: "end" }, angle: "0", length: "250" }));
  add("waist", "point", (id) => ({ op: "pointOn", id, on: ids.side, dist: "400", unit: "mm", from: "start" }));
  m.pieces = [
    {
      id: 1,
      name: "أمام (مثال)",
      quantity: 1,
      fabric: "قماش الوجه",
      edges: [ids.neckC, ids.shR, ids.side, ids.hem, ids.cf],
      seam: ["8", "10", "10", "40", "0"],
      notches: [{ obj: ids.waist }],
      grain: "90",
    },
  ];
  return { m, ids };
}
