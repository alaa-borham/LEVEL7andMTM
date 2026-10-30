// Made-to-measure input: customer measurements from other systems (CSV or JSON
// orders), matched to the pattern's X measurements.

import type { Measurement, Model } from "./model";

export interface CustomerOrder {
  customer: string;
  order?: string;
  quantity?: number;
  unit?: Unit;
  measurements: Record<string, number>; // external code or name -> value
}

export type Unit = "mm" | "cm" | "in";
const TO_MM: Record<Unit, number> = { mm: 1, cm: 10, in: 25.4 };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * X id for an external measurement key. Matched in this order: the MTM code
 * set on the measurement, "X<n>", then the measurement name.
 */
export function matchKey(model: Model, key: string): number | undefined {
  const k = norm(key);
  const byCode = model.measurements.find((m) => m.code && norm(m.code) === k);
  if (byCode) return byCode.id;
  const x = /^x(\d+)$/.exec(k);
  if (x && model.measurements.some((m) => m.id === Number(x[1]))) return Number(x[1]);
  return model.measurements.find((m: Measurement) => m.name && norm(m.name) === k)?.id;
}

export interface Applied {
  values: Record<number, number>; // X id -> mm
  unknown: string[]; // keys that matched no measurement
  missing: string[]; // measurements the order did not give (base value used)
}

export function mapOrder(model: Model, o: CustomerOrder): Applied {
  const f = TO_MM[o.unit ?? "mm"];
  if (!f) throw new Error(`وحدة غير معروفة: ${o.unit}`);
  const values: Record<number, number> = {};
  const unknown: string[] = [];
  for (const [key, v] of Object.entries(o.measurements)) {
    const id = matchKey(model, key);
    if (id === undefined) unknown.push(key);
    else if (Number.isFinite(v)) values[id] = Math.round(v * f * 100) / 100;
  }
  const missing = model.measurements.filter((m) => values[m.id] === undefined).map((m) => m.code || m.name || `X${m.id}`);
  return { values, unknown, missing };
}

/** Adds (or replaces) the customer column; returns its size index. */
export function addCustomer(model: Model, o: CustomerOrder): { index: number; applied: Applied } {
  const applied = mapOrder(model, o);
  model.sizes ??= [];
  const name = o.order ? `${o.customer} (${o.order})` : o.customer;
  let index = model.sizes.findIndex((s) => s.kind === "customer" && s.name === name);
  const entry = { name, step: 0, kind: "customer" as const, values: applied.values };
  if (index >= 0) model.sizes[index] = entry;
  else index = model.sizes.push(entry) - 1;
  return { index, applied };
}

/** One order as JSON: {"customer": "...", "order": "...", "unit": "cm", "measurements": {...}} or a list of them. */
export function parseOrders(text: string): CustomerOrder[] {
  const data = JSON.parse(text) as unknown;
  const list = Array.isArray(data) ? data : [data];
  return list.map((o, i) => {
    const r = o as Partial<CustomerOrder> & { name?: string; id?: string };
    const customer = String(r.customer ?? r.name ?? r.id ?? `زبون ${i + 1}`);
    if (!r.measurements || typeof r.measurements !== "object") throw new Error(`الطلب ${i + 1}: لا توجد قياسات (measurements)`);
    const measurements: Record<string, number> = {};
    for (const [k, v] of Object.entries(r.measurements)) measurements[k] = Number(v);
    return { customer, order: r.order === undefined ? undefined : String(r.order), quantity: r.quantity, unit: r.unit, measurements };
  });
}

/** Split one CSV line (comma, semicolon or tab separated; quotes allowed). */
function splitCsv(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const NAME_COLS = ["customer", "name", "id", "client", "الزبون", "العميل", "الاسم"];
const ORDER_COLS = ["order", "order no", "رقم الطلب", "الطلب"];
const UNIT_COLS = ["unit", "الوحدة"];

/**
 * CSV with a header row: one column for the customer (customer / name / الزبون ...),
 * optionally order and unit, and one column per measurement.
 */
export function parseCsv(text: string, unit: Unit = "mm"): CustomerOrder[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("ملف CSV يحتاج سطر عناوين وسطر بيانات على الأقل");
  const sep = [",", ";", "\t"].reduce((a, b) => (lines[0].split(b).length > lines[0].split(a).length ? b : a));
  const head = splitCsv(lines[0], sep);
  const find = (names: string[]) => head.findIndex((h) => names.includes(norm(h)));
  const nameCol = Math.max(find(NAME_COLS), 0);
  const orderCol = find(ORDER_COLS);
  const unitCol = find(UNIT_COLS);
  return lines.slice(1).map((line, r) => {
    const cells = splitCsv(line, sep);
    const measurements: Record<string, number> = {};
    head.forEach((h, c) => {
      if (c === nameCol || c === orderCol || c === unitCol || !h) return;
      const v = Number((cells[c] ?? "").replace(",", "."));
      if (cells[c] !== undefined && cells[c] !== "" && Number.isFinite(v)) measurements[h] = v;
    });
    return {
      customer: cells[nameCol] || `زبون ${r + 1}`,
      order: orderCol >= 0 ? cells[orderCol] || undefined : undefined,
      unit: (unitCol >= 0 ? (cells[unitCol] as Unit) : undefined) || unit,
      measurements,
    };
  });
}
