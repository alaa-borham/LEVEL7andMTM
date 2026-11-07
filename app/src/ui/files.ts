// Saving, opening, autosave, DXF export and import from GRAFIS (JSON made by
// `python -m grafis_mdl extract`).

import { createdIds, type GObj, type Measurement, type Model, type Variable } from "../core/model";

const AUTOSAVE_KEY = "level7.cad.model";

const DIRTY_KEY = "level7.cad.unsaved";
const BIG = 20000; // data URLs (pictures) longer than this are kept out of copies

/** Autosave after every change. When the browser storage is full (large background pictures),
 * the design is kept without the picture data. Returns what was kept. */
export function autosave(m: Model): "ok" | "noimages" | "fail" {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(m));
    return "ok";
  } catch {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(m, (_k, v) => (typeof v === "string" && v.length > BIG && v.startsWith("data:") ? "" : v)));
      return "noimages";
    } catch {
      return "fail";
    }
  }
}

/** Whether the autosaved design has changes that were not saved to a file (kept across restarts). */
export function setUnsaved(on: boolean): void {
  try {
    if (on) localStorage.setItem(DIRTY_KEY, "1");
    else localStorage.removeItem(DIRTY_KEY);
  } catch {
    /* ignore */
  }
}
export function hasUnsaved(): boolean {
  try {
    return localStorage.getItem(DIRTY_KEY) === "1";
  } catch {
    return false;
  }
}

/** Undo copies without repeating picture data: each picture is stored once in `blobs`. */
/** The tables (X, Z, sizes, unit, product info, name) are not part of the drawing history:
 * undo / redo change the drawing only. */
export const TABLE_KEYS = ["name", "measurements", "variables", "size", "sizes", "grading", "activeSize", "baseOff", "unit", "product", "mlibFrom"] as const;
export function packModel(m: Model, blobs: Map<string, string>, keys: Map<string, string>): string {
  const drawing = Object.fromEntries(Object.entries(m).filter(([k]) => !(TABLE_KEYS as readonly string[]).includes(k)));
  return JSON.stringify(drawing, (_k, v) => {
    if (typeof v !== "string" || v.length <= BIG || !v.startsWith("data:")) return v;
    let key = keys.get(v);
    if (!key) {
      key = `\u0000blob:${blobs.size}`;
      blobs.set(key, v);
      keys.set(v, key);
    }
    return key;
  });
}
/** A drawing from the history, with the current tables kept. */
export function unpackModel(raw: string, blobs: Map<string, string>, current: Model): Model {
  const drawing = JSON.parse(raw, (_k, v) => (typeof v === "string" && v.startsWith("\u0000blob:") ? blobs.get(v) ?? "" : v)) as Partial<Model>;
  const tables = Object.fromEntries(TABLE_KEYS.filter((k) => k in current).map((k) => [k, current[k]]));
  return checkModel({ ...drawing, ...tables } as Model);
}

export function restore(): Model | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? parseModel(raw) : null;
  } catch {
    return null;
  }
}

export function parseModel(raw: string): Model {
  return checkModel(JSON.parse(raw) as Model);
}
function checkModel(m: Model): Model {
  if (m.version !== 1 || !Array.isArray(m.steps) || !Array.isArray(m.measurements)) {
    throw new Error("الملف ليس باترون LEVEL7");
  }
  m.names ??= {};
  m.variables ??= [];
  // a damaged or hand-edited file is set straight instead of failing later: missing lists, the active part
  // out of range, and a next-id counter below an id already used (it would give two elements one id)
  const nextOk = (steps: Model["steps"], next: number) => {
    let max = 0;
    for (const st of steps) for (const id of createdIds(st)) max = Math.max(max, id);
    return Math.max(Number.isFinite(next) ? next : 1, max + 1);
  };
  m.pieces = Array.isArray(m.pieces) ? m.pieces : [];
  if (m.parts !== undefined && !Array.isArray(m.parts)) delete m.parts;
  if (m.parts?.length) {
    for (const p of m.parts) {
      p.steps = Array.isArray(p.steps) ? p.steps : [];
      p.names ??= {};
      p.pieces = Array.isArray(p.pieces) ? p.pieces : [];
      p.nextId = nextOk(p.steps, p.nextId);
    }
    const k = m.activePart ?? 0;
    if (!(Number.isInteger(k) && k >= 0 && k < m.parts.length)) {
      const p = m.parts[0];
      Object.assign(m, { activePart: 0, steps: p.steps, names: p.names, nextId: p.nextId, pieces: p.pieces });
    }
  } else if (m.parts) delete m.parts;
  m.nextId = nextOk(m.steps, m.nextId);
  if (m.sizes !== undefined && !Array.isArray(m.sizes)) delete m.sizes;
  return m;
}

/** A binary file (Excel); inside LEVEL7 and MTM it is saved through the program's dialog. */
export function downloadBytes(name: string, bytes: Uint8Array, type: string): void {
  if (document.body.classList.contains("embedded") && window.parent !== window) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    window.parent.postMessage({ type: "l7:download", name, text: btoa(s), mime: type }, "*");
    return;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function download(name: string, text: string, type: string, saveAs = false): void {
  // Inside LEVEL7 and MTM the host program saves: a design back to its own file (Ctrl+S), or where asked
  if (document.body.classList.contains("embedded") && window.parent !== window) {
    window.parent.postMessage({ type: "l7:download", name, text, mime: type, saveAs }, "*");
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "_").trim() || "pattern";
}

/** Minimal AutoCAD R12 DXF in mm; layer per object name. */
export function toDxf(objects: Iterable<GObj>): string {
  const out: string[] = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
  const add = (...pairs: [number, string | number][]) => {
    for (const [c, v] of pairs) out.push(String(c), typeof v === "number" ? v.toFixed(4) : v);
  };
  for (const o of objects) {
    const layer = o.name.replace(/[^A-Za-z0-9_-]/g, "_");
    if (o.kind === "point") {
      add([0, "POINT"], [8, layer], [10, o.pts[0][0]], [20, o.pts[0][1]], [30, 0]);
    } else if (o.pts.length === 2) {
      const [a, b] = o.pts;
      add([0, "LINE"], [8, layer], [10, a[0]], [20, a[1]], [30, 0], [11, b[0]], [21, b[1]], [31, 0]);
    } else {
      add([0, "POLYLINE"], [8, layer], [66, "1"], [10, 0], [20, 0], [30, 0], [70, "0"]);
      for (const p of o.pts) add([0, "VERTEX"], [8, layer], [10, p[0]], [20, p[1]], [30, 0]);
      add([0, "SEQEND"], [8, layer]);
    }
  }
  add([0, "ENDSEC"], [0, "EOF"]);
  return out.join("\n") + "\n";
}

interface GrafisExport {
  part?: { name?: string };
  size?: string;
  x_variables?: { number: number; label: string; value: number }[];
  z_variables?: { number: number; formula: string; description: string; picks?: unknown[] }[];
}

/**
 * Measurements and formulas from a GRAFIS part. Measured variables (AB, GL)
 * need picks in the drawing, so they are imported as 0 with a note.
 */
export function fromGrafis(raw: string): { measurements: Measurement[]; variables: Variable[]; name: string; skipped: number[] } {
  const g = JSON.parse(raw) as GrafisExport;
  if (!g.x_variables || !g.z_variables) throw new Error("الملف ليس ملف JSON مستخرج من جرافس");
  const skipped: number[] = [];
  const variables = g.z_variables.map((z) => {
    const measured = Array.isArray(z.picks) && z.picks.length > 0;
    if (measured) skipped.push(z.number);
    const desc = z.description && z.description !== "0" ? z.description : "";
    return {
      id: z.number,
      name: measured ? `${desc} (يُقاس من الرسم: ${z.formula})`.trim() : desc,
      expr: measured ? "0" : z.formula,
    };
  });
  return {
    name: g.part?.name ?? "من جرافس",
    measurements: g.x_variables.map((x) => ({ id: x.number, name: x.label, value: x.value })),
    variables: variables.sort((a, b) => a.id - b.id),
    skipped,
  };
}
