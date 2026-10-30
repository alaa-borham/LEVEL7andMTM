// Command line for other systems (MTM, marker making): build a pattern for
// customers or sizes without opening the program, and write the files.
//
//   level7 --model thobe.level7.json --order order.json --out out/
//   level7 --model thobe.level7.json --csv customers.csv --unit cm --format aama,plt --out out/
//   level7 --model thobe.level7.json --all-sizes --out out/
//   level7 --model thobe.level7.json --graded --out out/
//
// A report (level7-report.json) is always written to the output folder.
// Exit code: 0 all good, 1 some pieces failed, 2 wrong arguments or input.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toGradedAama } from "./core/aama-graded";
import { allSizeItems, toAamaDxf, toPlt, type ExportItem } from "./core/export";
import { evaluateModel, sizeName, withSize, type Model } from "./core/model";
import { addCustomer, parseCsv, parseOrders, type CustomerOrder, type Unit } from "./core/mtm";
import { parseModel, safeFileName, toDxf } from "./ui/files";

type Format = "aama" | "plt" | "dxf";

interface Args {
  model?: string;
  order?: string;
  csv?: string;
  unit: Unit;
  size?: string;
  allSizes: boolean;
  graded: boolean;
  formats: Format[];
  out: string;
}

export const USAGE = `LEVEL7 CAD - command line
  --model FILE        pattern file (.level7.json)                    required
  --order FILE        customer order(s) as JSON
  --csv FILE          customers as CSV (one row per customer)
  --unit mm|cm|in     unit of the customer measurements (default mm)
  --size NAME         export one size from the size table (default: base size)
  --all-sizes         export every size in one file
  --graded            graded DXF-AAMA (base size + grade rules) and .rul table
  --format LIST       aama,plt,dxf (default aama)
  --out DIR           output folder (default .)
`;

function parseArgs(argv: string[]): Args {
  const a: Args = { unit: "mm", allSizes: false, graded: false, formats: ["aama"], out: "." };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => {
      const x = argv[++i];
      if (x === undefined) throw new Error(`${k} needs a value`);
      return x;
    };
    switch (k) {
      case "--model": a.model = v(); break;
      case "--order": a.order = v(); break;
      case "--csv": a.csv = v(); break;
      case "--unit": a.unit = v() as Unit; break;
      case "--size": a.size = v(); break;
      case "--all-sizes": a.allSizes = true; break;
      case "--graded": a.graded = true; break;
      case "--format":
        a.formats = v().split(",").map((s) => s.trim().toLowerCase()) as Format[];
        for (const f of a.formats) if (!["aama", "plt", "dxf"].includes(f)) throw new Error(`unknown format ${f}`);
        break;
      case "--out": a.out = v(); break;
      case "--cli": break; // passed through by the Windows program
      default:
        if (k.startsWith("--")) throw new Error(`unknown option ${k}`);
    }
  }
  if (!a.model) throw new Error("--model is required");
  if (!["mm", "cm", "in"].includes(a.unit)) throw new Error(`unknown unit ${a.unit}`);
  return a;
}

interface Report {
  ok: boolean;
  files: string[];
  errors: string[];
  customers: { customer: string; order?: string; files: string[]; unknown: string[]; missing: string[]; errors: string[] }[];
}

/** Pieces of size index i of the model. */
function itemsOf(model: Model, i: number): { items: ExportItem[]; errors: string[] } {
  const r = evaluateModel(withSize(model, i));
  const items: ExportItem[] = [];
  const errors: string[] = [];
  for (const piece of model.pieces ?? []) {
    const geo = r.pieces.get(piece.id);
    if (geo) items.push({ piece, geo });
    else errors.push(`${piece.name}: ${r.pieceErrors.get(piece.id) ?? "error"}`);
  }
  for (const [k, e] of r.stepErrors) errors.push(`step ${k + 1}: ${e}`);
  return { items, errors };
}

export function run(argv: string[], log: (s: string) => void = console.log): number {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    log(`${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  const report: Report = { ok: true, files: [], errors: [], customers: [] };
  const finish = (code: number) => {
    report.ok = code === 0;
    try {
      mkdirSync(args.out, { recursive: true });
      writeFileSync(join(args.out, "level7-report.json"), JSON.stringify(report, null, 2));
    } catch (e) {
      log(`cannot write report: ${(e as Error).message}`);
    }
    log(`${report.ok ? "OK" : "ERRORS"}: ${report.files.length} file(s) in ${args.out}`);
    for (const e of report.errors) log(`  ${e}`);
    return code;
  };

  let model: Model;
  try {
    model = parseModel(readFileSync(args.model as string, "utf8"));
    mkdirSync(args.out, { recursive: true });
  } catch (e) {
    report.errors.push(`model: ${(e as Error).message}`);
    return finish(2);
  }
  if (!model.pieces?.length && args.formats.some((f) => f !== "dxf")) {
    report.errors.push("the pattern has no pieces to export");
    return finish(2);
  }

  const write = (name: string, text: string, list: string[]) => {
    const f = join(args.out, name);
    writeFileSync(f, text);
    report.files.push(f);
    list.push(f);
  };
  const exportSize = (m: Model, i: number, base: string, list: string[]): string[] => {
    const { items, errors } = itemsOf(m, i);
    const size = sizeName(m, i);
    for (const f of args.formats) {
      if (f === "aama") write(`${base}.dxf`, toAamaDxf(items, { style: m.name, size }), list);
      if (f === "plt") write(`${base}.plt`, toPlt(items, { size }), list);
      if (f === "dxf") write(`${base}_construction.dxf`, toDxf(evaluateModel(withSize(m, i)).objects.values()), list);
    }
    return errors;
  };

  // ---- customers
  let orders: CustomerOrder[] = [];
  try {
    if (args.order) orders = orders.concat(parseOrders(readFileSync(args.order, "utf8")));
    if (args.csv) orders = orders.concat(parseCsv(readFileSync(args.csv, "utf8"), args.unit));
  } catch (e) {
    report.errors.push(`orders: ${(e as Error).message}`);
    return finish(2);
  }
  if (orders.length) {
    let failed = false;
    for (const o of orders) {
      if (args.order && !o.unit) o.unit = args.unit;
      const m: Model = JSON.parse(JSON.stringify(model));
      const { index, applied } = addCustomer(m, o);
      const files: string[] = [];
      const base = safeFileName([o.order, o.customer].filter(Boolean).join("_"));
      const errors = exportSize(m, index, base, files);
      if (errors.length) failed = true;
      report.customers.push({ customer: o.customer, order: o.order, files, unknown: applied.unknown, missing: applied.missing, errors });
      for (const e of errors) report.errors.push(`${o.customer}: ${e}`);
    }
    return finish(failed ? 1 : 0);
  }

  // ---- sizes
  const name = safeFileName(model.name);
  if (args.graded) {
    const r = toGradedAama(model);
    write(`${name}.dxf`, r.dxf, []);
    write(`${name}.rul`, r.rul, []);
    report.errors.push(...r.errors);
    return finish(r.errors.length ? 1 : 0);
  }
  if (args.allSizes) {
    const { items, errors } = allSizeItems(model);
    for (const f of args.formats) {
      if (f === "aama") write(`${name}_all-sizes.dxf`, toAamaDxf(items, { style: model.name, size: "" }), []);
      if (f === "plt") write(`${name}_all-sizes.plt`, toPlt(items, { size: "" }), []);
    }
    report.errors.push(...errors);
    return finish(errors.length ? 1 : 0);
  }
  let i = -1;
  if (args.size !== undefined) {
    i = [-1, ...(model.sizes ?? []).map((_, k) => k)].find((k) => sizeName(model, k) === args.size) ?? -2;
    if (i === -2) {
      report.errors.push(`size "${args.size}" not found`);
      return finish(2);
    }
  }
  const errors = exportSize(model, i, `${name}_${safeFileName(sizeName(model, i))}`, []);
  report.errors.push(...errors);
  return finish(errors.length ? 1 : 0);
}
