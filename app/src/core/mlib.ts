// Measurement library: the X tables (measurements with every size / customer) of each model,
// kept on this computer. A table is copied INTO a design file; edits there stay in the file.
// The library entry changes only when the user asks to update it.
import type { Measurement, Model, Size } from "./model";

export interface MEntry {
  id: string;
  name: string; // usually the model name
  saved: string; // ISO time of the last save to the library
  size?: string; // name of the base size
  measurements: Measurement[];
  sizes?: Size[];
  grading?: Record<number, number>;
}

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v ?? null)) as T;

/** The X table of a design as a library entry (a copy). */
export function tableOf(model: Model, name: string, id = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`): MEntry {
  return { id, name: name.trim() || model.name, saved: new Date().toISOString(), size: model.size, measurements: copy(model.measurements), sizes: copy(model.sizes ?? []), grading: copy(model.grading ?? {}) };
}

/** Put a copy of a library table into the design (its X numbers are kept, so formulas that use
 * X3 keep pointing at X3). Z values, the drawing and the parts are not touched. */
export function applyEntry(model: Model, e: MEntry): void {
  model.measurements = copy(e.measurements);
  model.sizes = copy(e.sizes ?? []);
  model.grading = copy(e.grading ?? {});
  model.size = e.size;
  model.activeSize = -1;
  model.baseOff = undefined;
  model.mlibFrom = { id: e.id, name: e.name };
}

/** A library file (export) and reading one back (import): entries with the same id are replaced. */
export function mergeLibrary(lib: MEntry[], text: string): { lib: MEntry[]; added: number; replaced: number } {
  const raw = JSON.parse(text) as { kind?: string; entries?: MEntry[] } | MEntry[];
  const list = Array.isArray(raw) ? raw : raw.entries ?? [];
  const ok = list.filter((e) => e && typeof e.id === "string" && Array.isArray(e.measurements));
  if (!ok.length) throw new Error("الملف ليس مكتبة قياسات LEVEL7");
  const out = [...lib];
  let added = 0, replaced = 0;
  for (const e of ok) {
    const k = out.findIndex((x) => x.id === e.id);
    if (k >= 0) (out[k] = e), replaced++;
    else out.push(e), added++;
  }
  return { lib: out, added, replaced };
}
export const libraryFile = (lib: MEntry[]) => JSON.stringify({ kind: "LEVEL7 measurement library", version: 1, entries: lib }, null, 1);
