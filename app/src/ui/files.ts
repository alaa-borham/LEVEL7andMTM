// Saving, opening, autosave, DXF export and import from GRAFIS (JSON made by
// `python -m grafis_mdl extract`).

import type { GObj, Measurement, Model, Variable } from "../core/model";

const AUTOSAVE_KEY = "level7.cad.model";

export function autosave(m: Model): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(m));
  } catch {
    /* storage may be unavailable (private mode); the file save still works */
  }
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
  const m = JSON.parse(raw) as Model;
  if (m.version !== 1 || !Array.isArray(m.steps) || !Array.isArray(m.measurements)) {
    throw new Error("الملف ليس باترون LEVEL7");
  }
  m.names ??= {};
  m.variables ??= [];
  return m;
}

export function download(name: string, text: string, type: string): void {
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
