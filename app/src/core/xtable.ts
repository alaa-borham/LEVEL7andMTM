// X values to / from a table (Excel or CSV): X | Name | MTM | Standard | one column per size.
import type { Model } from "./model";
import type { Cell } from "./xlsx";

const baseName = (m: Model) => m.size || "Standard";

export function xTableRows(model: Model): Cell[][] {
  const sizes = model.sizes ?? [];
  const rows: Cell[][] = [["X", "Name", "MTM", baseName(model), ...sizes.map((s) => s.name)]];
  for (const x of model.measurements) rows.push([`X${x.id}`, x.name, x.code ?? "", x.value, ...sizes.map((s) => s.values[x.id] ?? x.value)]);
  return rows;
}

const num = (c: Cell | undefined): number | null => {
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  const s = String(c ?? "").trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(",", ".");
  return s !== "" && /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};
const xid = (c: Cell | undefined): number | null => {
  const m = /^\s*[Xx]?\s*0*(\d{1,4})\s*$/.exec(String(c ?? ""));
  return m ? Number(m[1]) : null;
};

export interface XImport {
  added: number;
  updated: number;
  sizes: string[];
}

/** Merge a table into the measurements: rows with an X number update that X (or create it);
 * rows without one are matched by name or added. Columns are found by their headers
 * (X, Name / الاسم, MTM / code, Standard / القيمة / the base size name, other sizes),
 * or by content when there is no header row. */
export function importXTable(model: Model, rows: Cell[][]): XImport {
  const filled = rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  if (!filled.length) throw new Error("الملف فارغ");
  const head = filled[0].map((c) => String(c).trim().toLowerCase());
  const hasHeader = head.some((h) => /^(x|name|الاسم|القياس|mtm|code|standard|value|القيمة|الأساسي|رمز)/.test(h)) && !filled[0].some((c) => typeof c === "number");
  const data = hasHeader ? filled.slice(1) : filled;
  const width = Math.max(...filled.map((r) => r.length));
  const colOf = (re: RegExp) => (hasHeader ? head.findIndex((h) => re.test(h)) : -1);
  const share = (k: number, test: (c: Cell | undefined) => boolean) => data.filter((r) => test(r[k])).length / Math.max(1, data.length);
  let idCol = colOf(/^(x|رمز|no\.?|#)$/);
  if (idCol < 0) for (let k = 0; k < width; k++) if (share(k, (c) => /^\s*[Xx]\s*\d+\s*$/.test(String(c ?? ""))) > 0.6) (idCol = k), (k = width);
  let codeCol = colOf(/^(mtm|code|رمز mtm)/);
  let nameCol = colOf(/^(name|الاسم|القياس|text|الوصف)/);
  if (nameCol < 0) for (let k = 0; k < width; k++) if (k !== idCol && k !== codeCol && share(k, (c) => typeof c === "string" && c.trim() !== "" && num(c) === null) > 0.5) (nameCol = k), (k = width);
  const base = baseName(model).toLowerCase();
  let valueCol = colOf(new RegExp(`^(standard|value|القيمة|الأساسي|base|${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`));
  if (valueCol < 0) for (let k = 0; k < width; k++) if (k !== idCol && k !== nameCol && k !== codeCol && share(k, (c) => num(c) !== null) > 0.5) (valueCol = k), (k = width);
  if (valueCol < 0) throw new Error("لم أجد عمود القيم (Standard / القيمة)");
  if (codeCol === valueCol) codeCol = -1;
  const sizeCols = hasHeader ? head.map((_h, k) => ({ k, name: String(filled[0][k]).trim() })).filter(({ k, name }) => name && ![idCol, nameCol, codeCol, valueCol].includes(k) && share(k, (c) => num(c) !== null || String(c ?? "").trim() === "") > 0.8 && data.some((r) => num(r[k]) !== null)) : [];

  model.sizes ??= [];
  const sizeFor = (name: string) => {
    let s = model.sizes!.find((z) => z.name.toLowerCase() === name.toLowerCase());
    if (!s) model.sizes!.push((s = { name, step: model.sizes!.length + 1, values: {} }));
    return s;
  };
  const res: XImport = { added: 0, updated: 0, sizes: sizeCols.map((c) => c.name) };
  let next = model.measurements.reduce((a, m) => Math.max(a, m.id), 0) + 1;
  for (const r of data) {
    const value = num(r[valueCol]);
    if (value === null) continue;
    const name = nameCol >= 0 ? String(r[nameCol] ?? "").trim() : "";
    let id = idCol >= 0 ? xid(r[idCol]) : null;
    let m = id !== null ? model.measurements.find((x) => x.id === id) : name ? model.measurements.find((x) => x.name.trim().toLowerCase() === name.toLowerCase()) : undefined;
    if (!m) {
      id ??= next;
      next = Math.max(next, id + 1);
      m = { id, name, value };
      model.measurements.push(m);
      res.added++;
    } else res.updated++;
    m.value = value;
    if (nameCol >= 0 && name && name !== "0") m.name = name;
    if (codeCol >= 0) {
      const code = String(r[codeCol] ?? "").trim();
      if (code && code !== "—") m.code = code;
    }
    for (const { k, name: sz } of sizeCols) {
      const v = num(r[k]);
      if (v === null) continue;
      // a size value equal to the base value means "same as the base" (an empty cell)
      if (v === m.value) delete sizeFor(sz).values[m.id];
      else sizeFor(sz).values[m.id] = v;
    }
  }
  model.measurements.sort((a, b) => a.id - b.id);
  if (!res.added && !res.updated) throw new Error("لا توجد صفوف بقيم رقمية في الملف");
  return res;
}
