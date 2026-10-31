// Test run and grading (as GRAFIS): build a part, or every part, in the base size (test run) or in
// every active size (grade), and list what fails. Nothing in the design is changed.
import { evaluateModel, sizeActive, sizeName, withSize, type Model } from "./model";

export interface CheckRow {
  part: string; // "002 basic thobe"
  size: string;
  errors: string[]; // empty = built without errors
}

export interface CheckResult {
  rows: CheckRow[];
  parts: number;
  sizes: number;
  failed: number; // rows with errors
}

export function checkParts(model: Model, o: { all: boolean; grade: boolean }): CheckResult {
  const act = model.activePart ?? 0;
  const list = model.parts?.length ? model.parts.map((p, k) => ({ p, k })) : [{ p: { no: 1, name: model.name, steps: model.steps, names: model.names, pieces: model.pieces }, k: 0 }];
  const parts = o.all ? list : list.filter(({ k }) => k === act);
  const sizes = o.grade ? [-1, ...(model.sizes ?? []).map((_s, i) => i)].filter((i) => sizeActive(model, i)) : [-1];
  const rows: CheckRow[] = [];
  for (const { p, k } of parts) {
    const live = k === act;
    const steps = live ? model.steps : p.steps, names = live ? model.names : p.names, pieces = (live ? model.pieces : p.pieces) ?? [];
    const label = `${String(p.no).padStart(3, "0")} ${p.name ?? ""}`.trim();
    for (const i of sizes) {
      const r = evaluateModel(withSize({ ...model, steps, names, pieces, activePart: model.parts?.length ? k : model.activePart }, i));
      const errors = [
        ...[...r.stepErrors].map(([si, msg]) => `خطوة ${si + 1}: ${msg}`),
        ...[...r.zErrors].map(([id, msg]) => `Z${id}: ${msg}`),
        ...[...r.pieceErrors].map(([id, msg]) => `قطعة ${pieces.find((pc) => pc.id === id)?.name ?? id}: ${msg}`),
      ];
      rows.push({ part: label, size: sizeName(model, i), errors });
    }
  }
  return { rows, parts: parts.length, sizes: sizes.length, failed: rows.filter((r) => r.errors.length).length };
}
