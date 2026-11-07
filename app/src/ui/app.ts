import { toGradedAama } from "../core/aama-graded";
import { FUNCTION_NAMES, normalizeFormula, references } from "../core/formula";
import { fromBase64, readCsv, readXlsx, writeXlsx } from "../core/xlsx";
import { importXTable, xTableRows } from "../core/xtable";
import { allSizeItems, markerItems, toAamaDxf, toPlt } from "../core/export";
import { parseMarker, toIsoCut, toMarkerPlt, type Marker } from "../core/iso";
import { checkParts } from "../core/check";
import { applyEntry, libraryFile, mergeLibrary, tableOf, type MEntry } from "../core/mlib";
import { addCustomer, parseCsv, parseOrders, type Unit } from "../core/mtm";
import { closestOnPolyline, crossings, directionAt, dist, insidePoly, lineIntersection, offsetPolyline, pointAlong, polyLen, type Pt } from "../core/geometry";
import {
  createdIds,
  nearerEnd,
  sideOf,
  emptyModel,
  newId,
  fillGrading,
  sizeName,
  sizeActive,
  withSize,
  usedIds,
  LINE_DASHES,
  type LineDash,
  evaluateModel,
  Vars,
  type EvalResult,
  type GObj,
  type Model,
  type PointRef,
  type Step,
  type Part,
} from "../core/model";
import { thobeSample } from "../core/sample";
import type { NotchType, Piece, PieceGeo } from "../core/piece";
import { describe, describeMeasure } from "./describe";
import { autosave, download, downloadBytes, fromGrafis, hasUnsaved, packModel, parseModel, restore, safeFileName, setUnsaved, toDxf, unpackModel } from "./files";
import { applyFields, pickedId, stepFields, TOOLS, type Field, type Pick, type PickKind, type Tool } from "./tools";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const fmt = (v: number) => (Math.round(v * 100) / 100).toString();

const PICK_PX = 30; // 0.9.151: same distance as the near mark: where its dot shows, a click picks that line
/** Points attract the pointer from farther away (magnet): a click then takes that point. */
const SNAP_PX = 18;
/** A one-line text area that grows with its text (descriptions). */
const grow = (t: HTMLElement): void => {
  t.style.height = "";
  // a hidden window has no size yet: CSS (field-sizing) sizes it when it shows
  if (t.scrollHeight) t.style.height = t.scrollHeight + 2 + "px";
};
/** Drawing colours the user can change (View → colours). */
/** How far (screen pixels) from a line / curve / point its near mark appears (= PICK_PX). */
const NEAR_PX = PICK_PX;
/** With Shift held (as GRAFIS): the pointer snaps to the nearest line end or point within this distance. */
const SHIFT_SNAP_PX = 60;
const COLOR_KEYS: [string, string][] = [["--line", "الخطوط المستقيمة"], ["--curve", "المنحنيات"], ["--point", "النقاط"], ["--near", "علامة الاقتراب من خط"], ["--canvas", "خلفية الرسم"]];
const NEST_COLORS = ["#2e7d32", "#c62828", "#1565c0", "#ef6c00", "#6a1b9a", "#00838f", "#ad1457", "#5d4037", "#827717", "#283593"];

type Hover = Pick | null;

/** The tool bars over the drawing (curve, seam allowance, inherit): a grip to move them anywhere and a
 * button to stand them up (vertical) or lay them down; where and how is remembered. */
const BAR_CHROME = `<span class="bar-grip" title="اسحب لتحريك الشريط · دابل كليك يعيده إلى مكانه">⠿</span><button class="bar-turn" title="أفقي / رأسي">⇅</button>`;
const barPrefs = (): { x?: number; y?: number; vert?: boolean } => {
  try {
    return JSON.parse(localStorage.getItem("level7.barPos") || "{}");
  } catch {
    return {};
  }
};
const saveBarPrefs = (v: { x?: number; y?: number; vert?: boolean }) => {
  try {
    localStorage.setItem("level7.barPos", JSON.stringify(v));
  } catch {}
};
function placeBar(bar: HTMLElement): void {
  const p = barPrefs();
  bar.classList.toggle("vert", !!p.vert);
  const wrap = bar.parentElement;
  if (p.x === undefined || p.y === undefined || !wrap) {
    bar.style.left = bar.style.top = bar.style.transform = "";
    return;
  }
  // kept inside the drawing area
  const W = wrap.clientWidth, H = wrap.clientHeight;
  bar.style.transform = "none";
  bar.style.left = `${Math.max(0, Math.min(p.x, W - 60))}px`;
  bar.style.top = `${Math.max(0, Math.min(p.y, H - 40))}px`;
}
function setupBar(bar: HTMLElement): void {
  queueMicrotask(() => placeBar(bar));
  bar.addEventListener("mousedown", (e) => {
    const grip = (e.target as HTMLElement).closest(".bar-grip");
    if (!grip || e.button !== 0) return;
    e.preventDefault();
    const r = bar.getBoundingClientRect(), wr = (bar.parentElement as HTMLElement).getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = (ev: MouseEvent) => {
      saveBarPrefs({ ...barPrefs(), x: ev.clientX - wr.left - dx, y: ev.clientY - wr.top - dy });
      document.querySelectorAll<HTMLElement>(".curve-bar").forEach(placeBar);
    };
    const up = () => (window.removeEventListener("mousemove", move), window.removeEventListener("mouseup", up));
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  });
  bar.addEventListener("dblclick", (e) => {
    if (!(e.target as HTMLElement).closest(".bar-grip")) return;
    const p = barPrefs();
    delete p.x;
    delete p.y;
    saveBarPrefs(p);
    document.querySelectorAll<HTMLElement>(".curve-bar").forEach(placeBar);
  });
  bar.addEventListener("click", (e) => {
    if (!(e.target as HTMLElement).closest(".bar-turn")) return;
    saveBarPrefs({ ...barPrefs(), vert: !barPrefs().vert });
    document.querySelectorAll<HTMLElement>(".curve-bar").forEach(placeBar);
  });
}

/** Relative luminance of a #rrggbb colour (0 black … 1 white). */
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const ch = (h: string) => {
    const v = parseInt(h, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(m[1]) + 0.7152 * ch(m[2]) + 0.0722 * ch(m[3]);
}
/** Contrast ratio of two colours (1 … 21). */
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** "Show all parts" (as GRAFIS): where each part is drawn, side by side in rows, in part order;
 * a translation per part (null = empty part). */
function layoutParts(res: EvalResult[]): (Pt | null)[] {
  const boxes = res.map((r) => {
    const pts = [...r.objects.values()].flatMap((o) => o.pts);
    if (!pts.length) return null;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  });
  const ws = boxes.filter((b): b is NonNullable<typeof b> => !!b).map((b) => b.x1 - b.x0);
  const gap = Math.max(60, Math.max(...ws, 0) * 0.08), rowMax = Math.max(2500, 3 * Math.max(...ws, 0));
  let x = 0, top = 0, rowH = 0;
  return boxes.map((b) => {
    if (!b) return null;
    if (x > 0 && x + (b.x1 - b.x0) > rowMax) (x = 0), (top -= rowH + gap), (rowH = 0);
    const t: Pt = [x - b.x0, top - b.y1]; // rows hang from their top line (y up)
    x += b.x1 - b.x0 + gap;
    rowH = Math.max(rowH, b.y1 - b.y0);
    return t;
  });
}

/** Curve bar icons (24 grid, drawn like the LEVEL7 tool icons: ink, blue curve, red pin / cross). */
const cbSvg = (d: string) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const SEAM_ICON = {
  std: cbSvg('<path d="M7 3v18" stroke="currentColor"/><path d="M12 3v18" stroke="#9ccc3c" stroke-dasharray="2 2"/><path d="M15 3v18" stroke="#9ccc3c" stroke-dasharray="2 2"/>'),
  dist: cbSvg('<path d="M8 3v18" stroke="currentColor"/><path d="M14 3v18" stroke="#9ccc3c" stroke-dasharray="2 2"/>'),
  unpar: cbSvg('<path d="M8 3v18" stroke="currentColor"/><path d="M12 21L17 3" stroke="#9ccc3c"/>'),
  none: cbSvg('<path d="M8 3v18" stroke="currentColor"/><path d="M13 9l6 6M19 9l-6 6" stroke="#e53935"/>'),
};
const CB_ICON = {
  add: cbSvg('<path d="M3 19C8 18 13 14 16 6" stroke="#2fa4dd"/><circle cx="11.5" cy="12.5" r="2.2" fill="#2fa4dd" stroke="none"/><path d="M18 14v7M14.5 17.5h7" stroke="#2e9e4f" stroke-width="2.2"/>'),
  bind: cbSvg('<path d="M3 19C8 18 13 14 16 6" stroke="#2fa4dd"/><path d="M14 4l6 6M15.5 8.5l-4 4M17 3.5l3.5 3.5" stroke="currentColor"/><circle cx="11.5" cy="12.5" r="2.2" fill="#e53935" stroke="none"/>'),
  unbind: cbSvg('<path d="M3 19C8 18 13 14 16 6" stroke="#2fa4dd"/><path d="M14 4l6 6M17 3.5l3.5 3.5" stroke="currentColor"/><path d="M15 15l5 5M20 15l-5 5" stroke="#e53935"/><circle cx="11.5" cy="12.5" r="2" fill="currentColor" stroke="none"/>'),
  del: cbSvg('<path d="M3 19C8 18 13 14 18 5" stroke="#2fa4dd"/><circle cx="10" cy="14.5" r="2.4" fill="currentColor" stroke="none"/><path d="M15 15l5 5M20 15l-5 5" stroke="#e53935"/>'),
  rel: cbSvg('<path d="M5 3v18" stroke="currentColor"/><path d="M5 14C11 14 16 10 20 4" stroke="#2fa4dd"/><path d="M5 10h4v4" stroke="#f08c00"/>'),
  dir: cbSvg('<path d="M3 19C8 18 12 13 15 6" stroke="#2fa4dd"/><path d="M4 16L21 9" stroke="currentColor" stroke-dasharray="3 2"/><circle cx="11.5" cy="12.6" r="2.2" fill="#f08c00" stroke="none"/>'),
  undir: cbSvg('<path d="M3 19C8 18 12 13 15 6" stroke="#2fa4dd"/><path d="M4 16L14 12" stroke="currentColor" stroke-dasharray="3 2"/><path d="M15 15l5 5M20 15l-5 5" stroke="#e53935"/>'),
};

/** The drawing tool groups: a double-click on a piece's cut line opens the seam allowance bar while they are on. */
const DRAW_GROUPS = ["النقاط", "الخطوط", "المنحنيات", "الأبعاد", "النصوص", "القياس من الرسم"];

interface FormState {
  title: string;
  /** The values window of an existing step (double-click / ✎): its handles, points and bar stay usable. */
  editOf?: number;
  fields: Field[];
  onOk: (v: Record<string, string>) => void;
  /** Live drawing: the line follows the mouse from `from`; angle and length fill in
   * until typed by hand, and a click on the drawing confirms. */
  live?: { from?: Pt; values?: (at: Pt, cur: Record<string, string>) => Record<string, string> | null; follow?: (at: Pt) => void; submit?: () => void };
}

interface LibBlock {
  name: string;
  saved: string;
  steps: Step[];
  names: Record<number, string>;
  nextId: number;
  pieces: Piece[];
  measurements: Model["measurements"];
  variables: Model["variables"];
}

export class App {
  model: Model;
  res!: EvalResult;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private redoKept: string[] = [];
  /** Picture data shared by all undo copies (stored once). */
  private blobs = new Map<string, string>();
  private blobKeys = new Map<string, string>();
  private pack = () => packModel(this.model, this.blobs, this.blobKeys);
  /** Changes not saved to a file; kept across restarts with the autosave. */
  private unsaved = hasUnsaved();
  private autosaveWarned = "";

  // view: world point at the canvas centre and pixels per mm
  private cx = 0;
  private cy = 0;
  private scale = 1;
  showNames = false;
  private nameHover: number | null = null;
  /** As GRAFIS: the line / curve / point under the pointer and the nearest point on it. */
  private near: { id: number; at: Pt } | null = null;
  /** Shift held: snap to line ends / points. */
  private shift = false;
  private lastScreen: Pt = [0, 0];
  showGrid = false;

  private tool: Tool | null = null;
  private picks: Pick[] = [];
  private extra: Pick[] = [];
  private collecting = false;
  private hover: Hover = null;
  private mouse: Pt = [0, 0];
  private form: FormState | null = null;
  private selectedStep = -1;
  private pan: { x: number; y: number; cx: number; cy: number } | null = null;

  private svg = $<SVGSVGElement & HTMLElement>("#canvas");

  constructor() {
    const restored = restore();
    this.model = restored ?? emptyModel();
    this.fromRestore = !!restored && this.unsaved;
    this.evaluate();
    this.applyColors();
    // every small window (library, product, marker, ISO, product info ...) moves by its title bar
    document.addEventListener("pointerdown", (e) => {
      const head = (e.target as HTMLElement).closest<HTMLElement>(".z-assistant .za-head");
      if (!head || (e.target as HTMLElement).closest("button, input, select, textarea")) return;
      const win = head.closest<HTMLElement>(".z-assistant")!;
      const r = win.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      Object.assign(win.style, { left: r.left + "px", top: r.top + "px", right: "auto", bottom: "auto", transform: "none" });
      head.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => Object.assign(win.style, { left: Math.min(Math.max(0, ev.clientX - dx), innerWidth - 80) + "px", top: Math.min(Math.max(0, ev.clientY - dy), innerHeight - 40) + "px" });
      const up = () => (head.removeEventListener("pointermove", move), head.removeEventListener("pointerup", up));
      head.addEventListener("pointermove", move);
      head.addEventListener("pointerup", up);
    });
    // size on / off ticks (X table and size page): one listener for both windows
    document.addEventListener("change", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.matches?.("input[data-son]")) this.setSizeActive(Number(t.dataset.son), t.checked);
    });
    this.buildTools();
    this.bindTopbar();
    this.bindTabs();
    this.bindCanvas();
    this.buildPointPanel();
    this.buildHistoryBar();
    this.bindKeys();
    this.renderPanels();
    requestAnimationFrame(() => this.fit());
  }

  // ------------------------------------------------------------ model state
  private evaluate(): void {
    const n = this.model.sizes?.length ?? 0;
    if ((this.model.activeSize ?? -1) >= n) this.model.activeSize = -1;
    this.syncPart();
    this.res = evaluateModel(withSize(this.model));
    // other parts: with "show all parts" laid out side by side (as GRAFIS); otherwise the parts whose eye
    // is on, faded behind the active one in place
    const parts = this.model.parts ?? [], act = this.model.activePart ?? 0;
    const evalPart = (k: number) => evaluateModel(withSize({ ...this.model, steps: parts[k].steps, names: parts[k].names, nextId: parts[k].nextId, pieces: parts[k].pieces ?? [], activePart: k }));
    if (this.allParts && parts.length > 1) {
      const res = parts.map((_, k) => (k === act ? this.res : evalPart(k)));
      const lay = layoutParts(res);
      const base = lay[act] ?? [0, 0];
      this.ghosts = [];
      this.ghostInfo = [];
      res.forEach((r, k) => {
        if (k === act || !lay[k]) return;
        this.ghosts.push(r);
        this.ghostInfo.push({ k, off: [lay[k]![0] - base[0], lay[k]![1] - base[1]], all: true });
      });
    } else {
      this.ghosts = [];
      this.ghostInfo = [];
      parts.forEach((p, k) => {
        if (k === act || p.visible !== true) return;
        this.ghosts.push(evalPart(k));
        this.ghostInfo.push({ k, off: [0, 0], all: false });
      });
    }
    this.nest = this.gradeView !== "off" ? this.nestResults() : [];
  }

  // ------------------------------------------------------------ sizes
  /** Grading view (as GRAFIS): off, all sizes stacked on each other, or side by side. */
  private gradeView: "off" | "stack" | "side" = "off";
  private get showNest(): boolean {
    return this.gradeView !== "off";
  }
  /** Command bar: off → stacked → side by side → off. */
  cycleGradeView(): void {
    if (!(this.model.sizes ?? []).length) return this.toast("لا توجد مقاسات: أضفها من جدول X أو صفحة المقاسات (Ctrl+G)");
    this.gradeView = this.gradeView === "off" ? "stack" : this.gradeView === "stack" ? "side" : "off";
    this.evaluate();
    this.renderPanels();
    this.render();
    if (this.gradeView === "side") this.fitAll();
    this.toast(this.gradeView === "stack" ? "المقاسات فوق بعض (Stack)" : this.gradeView === "side" ? "المقاسات جنباً إلى جنب" : "عرض المقاس الحالي فقط");
  }
  private nest: { name: string; color: string; res: EvalResult }[] = [];
  /** The drawing as it was before the first click of a possible double-click (with a drawing tool on, the
   * clicks act at once: a double-click on a piece's cut line takes them back). */
  private preDbl: { pack: string; undo: number; res: EvalResult } | null = null;

  private nestResults() {
    const out: { name: string; color: string; res: EvalResult }[] = [];
    for (let i = -1; i < (this.model.sizes?.length ?? 0); i++) {
      out.push({ name: sizeName(this.model, i), color: NEST_COLORS[(i + 1) % NEST_COLORS.length], res: evaluateModel(withSize(this.model, i)) });
    }
    return out;
  }

  /** Call before every change so it can be undone. */
  // ------------------------------------------------------------ parts (as GRAFIS)
  private ghosts: EvalResult[] = [];
  /** For each ghost: its part, where it is drawn (offset from its own coordinates), laid out or in place. */
  private ghostInfo: { k: number; off: Pt; all: boolean }[] = [];
  /** "Show all parts" (as GRAFIS): every part drawn, side by side; a click on one switches to it. */
  allParts = (() => {
    try {
      return localStorage.getItem("level7.allParts") === "1";
    } catch {
      return false;
    }
  })();
  private partHover: number | null = null;
  /** Round / chamfer tool on a corner of a piece's cut line (outer line). */
  private cutCornerPick: { piece: number; key: string; pt: Pt; pick: Pick } | null = null;

  /** The notch under the pointer (within 10 px of its mark). */
  private notchNear(sx: number, sy: number): { piece: number; k: number } | null {
    let best: { piece: number; k: number; d: number } | null = null;
    for (const pc of this.model.pieces ?? []) {
      const g = this.res.pieces.get(pc.id);
      g?.notches.forEach((n, k) => {
        if (k >= pc.notches.length) return; // the mirrored half of a folded piece follows its own notch
        const [a, b] = [n.at, n.to].map((p) => this.toScreen(p)), dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((sx - a[0]) * dx + (sy - a[1]) * dy) / L2)), d = Math.hypot(sx - a[0] - t * dx, sy - a[1] - t * dy);
        if (d <= 10 && (!best || d < best.d)) best = { piece: pc.id, k, d };
      });
    }
    const b = best as { piece: number; k: number; d: number } | null;
    return b && { piece: b.piece, k: b.k };
  }

  /** Mirror a notch with the mirror tool in use: its point (or line end) is mirrored as a new element and
   * the piece gets a notch there, with the same shape and length; «move» leaves no notch at the old place. */
  private mirrorNotch(pieceId: number, k: number, batch = false): void {
    const t = this.tool, values = this.instantValues, pc = this.model.pieces?.find((p) => p.id === pieceId);
    if (!t?.build || !values || !pc) return;
    const r = pc.notches[k], src = this.res.objects.get(r.obj);
    if (!src) return;
    let step: Step;
    try {
      step = t.build({ model: this.model, res: this.res, picks: this.picks, extra: [] }, values); // the axis only: no new ids yet
    } catch (e) {
      return this.toast((e as Error).message);
    }
    if (step.op !== "mirror") return;
    if (!batch) this.snapshot();
    // the notch on a line end: a point at that end is mirrored (not the whole line)
    let srcPt = r.obj;
    if (src.kind !== "point") {
      srcPt = newId(this.model, "point");
      this.model.steps.push({ op: "pointOn", id: srcPt, on: r.obj, dist: "0", unit: "mm", from: r.end === "end" ? "end" : "start" } as Step);
    }
    // always a copy of the point: lines that use it stay where they are; only the notch goes across
    const dst = newId(this.model, "point");
    step.items = [{ src: srcPt, dst }];
    this.model.steps.push(step);
    const move = !this.selCopy;
    const type = pc.notchTypes?.[k] ?? "slit", len = pc.notchLen?.[k] ?? "";
    if (move) {
      pc.notches[k] = { obj: dst };
    } else {
      const n = pc.notches.push({ obj: dst }) - 1;
      pc.notchTypes ??= [];
      while (pc.notchTypes.length < pc.notches.length - 1) pc.notchTypes.push("slit");
      pc.notchTypes[n] = type;
      pc.notchLen ??= [];
      while (pc.notchLen.length < pc.notches.length - 1) pc.notchLen.push("");
      pc.notchLen[n] = len;
    }
    if (batch) return;
    this.changed();
    this.toast(move ? "نُقل النوتش بالانعكاس · انقر التالي أو كليك يمين للإنهاء" : "نُسخ النوتش بالانعكاس · انقر التالي أو كليك يمين للإنهاء");
    this.render();
  }

  // ---- mirror bar (as GRAFIS): selection mode and copy / move, shown as soon as a mirror tool is chosen
  private selMode: "single" | "frameAll" | "frameLines" | "frameCross" | "framePoints" | "notches" | "piece" = "single";
  /** The notch under the pointer while a mirror tool collects (it lights up: it can be clicked). */
  private notchHover: { piece: number; k: number } | null = null;
  private selCopy = true;
  private selFrame: Pt | null = null;

  private mirrorClick(sx: number, sy: number, h: Pick | null): void {
    const w = this.toWorld(sx, sy), mode = this.selMode;
    if (mode === "single" || mode === "notches") {
      const nn = this.notchNear(sx, sy);
      if (nn) return this.mirrorNotch(nn.piece, nn.k);
    }
    if (mode === "single") {
      const id = h ? pickedId(h) : null;
      if (id === null || (h?.kind === "point" && h.ref.end)) return this.toast("انقر عنصراً أو نوتشاً، أو اختر طريقة تحديد أخرى من الشريط");
      return this.mirrorBatch([id], []);
    }
    if (mode === "piece") {
      const pc = (this.model.pieces ?? []).find((p) => {
        const g = this.res.pieces.get(p.id);
        return g && insidePoly(w, g.cut);
      });
      if (!pc) return this.toast("انقر داخل قطعة");
      return this.mirrorBatch([...pc.edges], pc.notches.map((_, k) => ({ piece: pc.id, k })));
    }
    if (!this.selFrame) {
      this.selFrame = w;
      this.toast("انقر الركن المقابل للإطار");
      return this.render();
    }
    const a = this.selFrame;
    this.selFrame = null;
    const x0 = Math.min(a[0], w[0]), x1 = Math.max(a[0], w[0]), y0 = Math.min(a[1], w[1]), y1 = Math.max(a[1], w[1]);
    const inside = (p: Pt) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
    const ids: number[] = [];
    if (mode !== "notches")
      for (const o of this.res.objects.values()) {
      if (this.res.stepErrors.has(o.step)) continue;
      const all = o.pts.every(inside), some = o.pts.some(inside);
      if (o.kind === "point" ? (mode === "frameAll" || mode === "framePoints") && all : mode === "frameAll" || mode === "frameLines" ? all : mode === "frameCross" && some) ids.push(o.id);
    }
    // a notch is in the frame when its point on the sewing line or its mark on the cut line is
    const notches: { piece: number; k: number }[] = [];
    if (mode !== "frameLines" && mode !== "frameCross")
      for (const pc of this.model.pieces ?? []) {
        const g = this.res.pieces.get(pc.id);
        pc.notches.forEach((r, k) => {
          const n = g?.notches[k];
          if (inside(this.pointOf(r)) || (n && (inside(n.at) || inside(n.to)))) notches.push({ piece: pc.id, k });
        });
      }
    if (!ids.length && !notches.length) {
      this.toast("لا يوجد ما يُعكس داخل الإطار");
      return this.render();
    }
    this.mirrorBatch(ids, notches);
  }

  /** One mirror step for all the chosen elements (copies get new names), then the notches. */
  private mirrorBatch(ids: number[], notches: { piece: number; k: number }[]): void {
    const t = this.tool, values = this.instantValues;
    if (!t?.build || !values) return;
    let step: Step;
    try {
      step = t.build({ model: this.model, res: this.res, picks: this.picks, extra: [] }, values); // the axis only
    } catch (e) {
      return this.toast((e as Error).message);
    }
    if (step.op !== "mirror") return;
    this.snapshot();
    if (ids.length) {
      step.items = ids.map((src) => {
        if (!this.selCopy) return { src };
        const o = this.res.objects.get(src), nm = this.model.names[src];
        return { src, dst: newId(this.model, o?.kind === "point" ? "point" : nm?.startsWith("C") ? "curve" : "line") };
      });
      this.model.steps.push(step);
    }
    for (const n of notches) this.mirrorNotch(n.piece, n.k, true);
    this.changed();
    const what = [ids.length ? `${ids.length} عنصر` : "", notches.length ? `${notches.length} نوتش` : ""].filter(Boolean).join(" و");
    this.toast(`${this.selCopy ? "نُسخ" : "نُقل"} بالانعكاس: ${what} · انقر التالي أو كليك يمين للإنهاء`);
    this.render();
  }

  private readonly selModes: [string, string, string][] = [
    ["single", "عناصر مفردة: كل نقرة تعكس خطاً أو نقطة أو نوتشاً", '<path d="M10 3v14" stroke-dasharray="2 2"/><path d="M5 6v8M15 6v8"/>'],
    ["frameAll", "تحديد النقاط والخطوط داخل إطار", '<rect x="3" y="3" width="14" height="14" stroke-dasharray="2 2"/><path d="M7 6v8"/><circle cx="12" cy="8" r="1.3"/><circle cx="12" cy="12" r="1.3"/>'],
    ["frameLines", "تحديد الخطوط داخل إطار", '<rect x="3" y="3" width="14" height="14" stroke-dasharray="2 2"/><path d="M7 6v8M13 6v8"/>'],
    ["frameCross", "تحديد الخطوط التي تمر بالإطار", '<rect x="5" y="5" width="10" height="10" stroke-dasharray="2 2"/><path d="M2 16L18 4"/>'],
    ["framePoints", "تحديد النقاط داخل إطار", '<rect x="3" y="3" width="14" height="14" stroke-dasharray="2 2"/><circle cx="7" cy="8" r="1.3"/><circle cx="12" cy="6" r="1.3"/><circle cx="10" cy="13" r="1.3"/>'],
    ["notches", "النوتشات فقط: انقر نوتشاً، أو ارسم إطاراً حول عدة نوتشات", '<path d="M3 16h14"/><path d="M7 16v-6M13 16v-6" stroke-width="2.4"/>'],
    ["piece", "قطعة كاملة: حدودها ونوتشاتها", '<path d="M5 3h7l3 4v10H5z"/>'],
  ];

  private renderSelBar(): void {
    const on = !!this.tool && /^mirror/.test(this.tool.key);
    let bar = document.querySelector(".sel-bar") as HTMLElement | null;
    if (!on) {
      bar?.remove();
      this.selFrame = null;
      return;
    }
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "curve-bar sel-bar";
      setupBar(bar);
      (document.querySelector(".canvas-wrap") as HTMLElement).append(bar);
      bar.addEventListener("mousedown", (e) => e.stopPropagation());
      bar.addEventListener("click", (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>("[data-sel]");
        if (!b) return;
        const v = b.dataset.sel as string;
        if (v === "copy") this.selCopy = !this.selCopy;
        else this.selMode = v as typeof this.selMode;
        this.selFrame = null;
        this.render();
      });
    }
    const ic = (d: string) => `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5">${d}</svg>`;
    const html =
      BAR_CHROME +
      this.selModes.map(([k, tip, d]) => `<button data-sel="${k}" class="${this.selMode === k ? "on" : ""}" title="${tip}">${ic(d)}</button>`).join("") +
      `<span class="seg-gap"></span><button data-sel="copy" class="${this.selCopy ? "on" : ""}" title="${this.selCopy ? "نسخ العناصر (الأصل يبقى) · انقر للنقل" : "نقل العناصر (بلا نسخة) · انقر للنسخ"}">${ic('<rect x="3" y="7" width="9" height="10"/><rect x="8" y="3" width="9" height="10"/>')}<span>${this.selCopy ? "نسخ" : "نقل"}</span></button>`;
    if (bar.innerHTML !== html) bar.innerHTML = html;
  }

  /** The frame being drawn with the mirror bar. */
  private selFrameSvg(): string {
    if (!this.selFrame) return "";
    const [x0, y0] = this.toScreen(this.selFrame), [x1, y1] = this.toScreen(this.mouse);
    return `<rect class="sel-frame" x="${Math.min(x0, x1)}" y="${Math.min(y0, y1)}" width="${Math.abs(x1 - x0)}" height="${Math.abs(y1 - y0)}"/>`;
  }

  /** The corner of a cut line under the pointer (within 24 px). With a drawing line also under the
   * pointer, only when the pointer is in the seam allowance (outside the sewing line). */
  private cutCornerNear(sx: number, sy: number, lineHit: boolean): { piece: number; key: string; pt: Pt } | null {
    const w = this.toWorld(sx, sy);
    let best: { piece: number; key: string; pt: Pt; d: number } | null = null;
    for (const pc of this.model.pieces ?? []) {
      const g = this.res.pieces.get(pc.id);
      if (!g?.cutCornerAt || (lineHit && insidePoly(w, g.sew))) continue;
      for (const c of g.cutCornerAt) {
        const d = dist(c.pt, w) * this.scale;
        if (d <= 24 && (!best || d < best.d)) best = { piece: pc.id, key: c.key, pt: c.pt, d };
      }
    }
    return best && { piece: best.piece, key: best.key, pt: best.pt };
  }

  /** With all parts shown: the other part whose line is under the pointer. */
  private partAt(sx: number, sy: number): number | null {
    if (!this.allParts) return null;
    const w = this.toWorld(sx, sy);
    let best: { k: number; d: number } | null = null;
    this.ghosts.forEach((g, gi) => {
      const info = this.ghostInfo[gi];
      if (!info?.all) return;
      const q: Pt = [w[0] - info.off[0], w[1] - info.off[1]];
      for (const o of g.objects.values()) {
        if (o.kind !== "line") continue;
        const d = closestOnPolyline(o.pts, q).d * this.scale;
        if (d <= 8 && (!best || d < best.d)) best = { k: info.k, d };
      }
    });
    return (best as { k: number; d: number } | null)?.k ?? null;
  }

  /** Switch to part k from the all-parts view: the drawing stays where it is on the screen. */
  private switchPartInPlace(k: number): void {
    const info = this.ghostInfo.find((g) => g.k === k);
    const cx = this.cx, cy = this.cy, sc = this.scale;
    this.switchPart(k);
    if (info) {
      this.cx = cx - info.off[0];
      this.cy = cy - info.off[1];
      this.scale = sc;
      this.partHover = null;
      this.render();
    }
  }

  setAllParts(on: boolean): void {
    this.allParts = on;
    try {
      localStorage.setItem("level7.allParts", on ? "1" : "0");
    } catch {}
    if (!on) for (const p of this.model.parts ?? []) p.visible = false;
    this.evaluate();
    this.renderPartStrip();
    this.fit();
  }

  /** The active part's construction is model.steps / names / nextId / pieces; keep the
   * parts list pointing at it so other parts (inheritance, ghosts) see it current. */
  private syncPart(): void {
    const ps = this.model.parts, k = this.model.activePart ?? 0;
    if (!ps?.[k]) return;
    Object.assign(ps[k], { steps: this.model.steps, names: this.model.names, nextId: this.model.nextId, pieces: this.model.pieces ?? [] });
  }

  /** Turn a single-part design into one with a parts list (part 001). */
  private ensureParts(): Part[] {
    if (!this.model.parts?.length) {
      this.model.parts = [{ no: 1, name: this.model.name || "Part 1", steps: this.model.steps, names: this.model.names, nextId: this.model.nextId, pieces: this.model.pieces ?? [], amount: 1 }];
      this.model.activePart = 0;
    }
    return this.model.parts;
  }

  switchPart(k: number): void {
    const ps = this.ensureParts();
    if (!ps[k] || k === this.model.activePart) return;
    this.syncPart();
    this.cancelTool();
    const p = ps[k];
    Object.assign(this.model, { steps: p.steps, names: p.names, nextId: p.nextId, pieces: p.pieces ?? [], activePart: k });
    this.selectedStep = -1;
    this.changed();
    this.fit();
  }

  private addPart(copyOf?: number): void {
    const ps = this.ensureParts();
    this.snapshot();
    this.syncPart();
    const no = ps.reduce((a, p) => Math.max(a, p.no), 0) + 1;
    const src = copyOf !== undefined ? ps[copyOf] : undefined;
    const part: Part = src ? (JSON.parse(JSON.stringify({ ...src, no, name: `${src.name} (2)` })) as Part) : { no, name: "", steps: [], names: {}, nextId: 1, pieces: [], amount: 1 };
    // a copy keeps inheriting from the same earlier parts
    ps.push(part);
    this.switchPart(ps.length - 1);
  }

  private deletePart(k: number): void {
    const ps = this.ensureParts();
    if (ps.length < 2) return this.toast("لا يمكن حذف البارت الوحيد");
    const no = ps[k].no;
    const users = ps.filter((p) => p.steps.some((s) => s.op === "inherit" && s.part === no)).map((p) => String(p.no).padStart(3, "0"));
    if (users.length && !confirm(`البارتات ${users.join("، ")} ترث من هذا البارت وستظهر فيها أخطاء. حذف؟`)) return;
    this.snapshot();
    this.syncPart();
    // its line types / colours go with it (a later part may get the same number)
    for (const key of Object.keys(this.model.lineStyles ?? {})) if (key.startsWith(`${no}:`)) delete this.model.lineStyles![key];
    ps.splice(k, 1);
    const next = Math.min(k, ps.length - 1), p = ps[next];
    Object.assign(this.model, { steps: p.steps, names: p.names, nextId: p.nextId, pieces: p.pieces ?? [], activePart: next });
    this.selectedStep = -1;
    this.changed();
  }

  /** A small black preview of a part's construction (as GRAFIS). */
  private partPreview(res: EvalResult, highlight = new Set<number>()): { box: string; svg: string } {
    const all = [...res.objects.values()];
    if (!all.length) return { box: "0 0 100 100", svg: "" };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const o of all) for (const [x, y] of o.pts) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
    const pad = Math.max(x1 - x0, y1 - y0, 1) * 0.06, w = (Math.max(x1 - x0, y1 - y0, 1) / 260).toFixed(3);
    const svg = all
      .map((o) =>
        o.kind === "point"
          ? `<circle cx="${o.pts[0][0]}" cy="${-o.pts[0][1]}" r="${(Number(w) * 2.2).toFixed(3)}" class="${highlight.has(o.id) ? "rec-now" : "rec-old"}"/>`
          : `<polyline points="${o.pts.map(([x, y]) => `${x},${-y}`).join(" ")}" class="${highlight.has(o.id) ? "rec-now" : "rec-old"}" stroke-width="${highlight.has(o.id) ? Number(w) * 2.2 : w}"/>`,
      )
      .join("");
    return { box: `${x0 - pad} ${-(y1 + pad)} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`, svg };
  }

  private partResult(k: number): EvalResult {
    if (k === (this.model.activePart ?? 0)) return this.res;
    const p = (this.model.parts ?? [])[k];
    return evaluateModel(withSize({ ...this.model, steps: p.steps, names: p.names, nextId: p.nextId, pieces: [], activePart: k }));
  }

  /** Parts strip (as GRAFIS): a thumbnail per part on the left of the drawing, to see and
   * pick a part at once. Permanent, dynamic (opens when the pointer reaches it) or off. */
  private stripMode: "permanent" | "dynamic" | "off" = (() => {
    try {
      const v = localStorage.getItem("level7.partStrip");
      return v === "dynamic" || v === "off" ? v : "permanent";
    } catch {
      return "permanent";
    }
  })();

  private renderPartStrip(): void {
    let strip = document.querySelector(".part-strip") as HTMLElement | null;
    if (!strip) {
      strip = document.createElement("aside");
      strip.className = "part-strip";
      (document.querySelector(".canvas-wrap") as HTMLElement).append(strip);
      strip.addEventListener("click", (e) => {
        const t = e.target as HTMLElement, m = t.closest<HTMLElement>("[data-smode]"), eye = t.closest<HTMLElement>("[data-seye]"), th = t.closest<HTMLElement>("[data-spart]");
        if (m) {
          this.stripMode = m.dataset.smode as "permanent" | "dynamic" | "off";
          try {
            localStorage.setItem("level7.partStrip", this.stripMode);
          } catch {}
          this.renderPartStrip();
        } else if (t.closest("[data-sall]")) {
          const on = t.closest<HTMLElement>("[data-sall]")!.dataset.sall === "1";
          this.setAllParts(on);
          this.toast(on ? "كل البارتات ظاهرة جنباً إلى جنب · انقر خط أي بارت للانتقال إليه" : "يظهر البارت النشط وحده");
        } else if (eye) {
          const p = (this.model.parts ?? [])[Number(eye.dataset.seye)];
          if (p) (p.visible = !p.visible), this.changed();
        } else if (th) this.switchPart(Number(th.dataset.spart));
      });
    }
    strip.dataset.mode = this.stripMode;
    const ps = this.model.parts?.length ? this.model.parts : null, act = this.model.activePart ?? 0;
    const items = (ps ?? [{ no: 1, name: this.model.name } as Part]).map((p, k) => {
      const pv = this.partPreview(ps ? this.partResult(k) : this.res);
      return `<div class="ps-item${k === act ? " act" : ""}" data-spart="${k}" title="${String(p.no).padStart(3, "0")} ${esc(p.name)}">
        <div class="ps-side"><b>${p.no}</b><button data-seye="${k}" class="${p.visible || k === act ? "on" : ""}" title="إظهار / إخفاء البارت خلف البارت النشط"${k === act || !ps ? " disabled" : ""}>👁</button></div>
        <svg viewBox="${pv.box}">${pv.svg}</svg></div>`;
    });
    strip.innerHTML = `<div class="ps-head"><button data-smode="permanent" class="${this.stripMode === "permanent" ? "on" : ""}" title="دائم">📌</button><button data-smode="dynamic" class="${this.stripMode === "dynamic" ? "on" : ""}" title="ديناميكي: يظهر عند الاقتراب">⇔</button><button data-smode="off" class="${this.stripMode === "off" ? "on" : ""}" title="إخفاء الشريط">⦸</button><button data-sall="1" class="${this.allParts ? "on" : ""}" title="إظهار كل البارتات جنباً إلى جنب · Show all parts">👁</button><button data-sall="0" title="إخفاء كل البارتات · Hide all parts">🚫</button></div><div class="ps-list">${items.join("")}</div>`;
  }

  /** Product info (as GRAFIS 2026): product texts, logo, two sketches and a fabric picture,
   * kept in the design file. */
  openProduct(): void {
    document.querySelector(".product-win")?.remove();
    const pr: Record<string, string> = { name: this.model.name, ...(this.model.product ?? {}) };
    const f = (k: string, label: string, list = false) => `<label class="pi-f"><span>${label}</span><input data-pi="${k}" value="${esc(pr[k] ?? "")}"${list ? ` list="pi-${k}"` : ""}/></label>`;
    const img = (k: string, label: string, cls = "") => `<div class="pi-img ${cls}"><div class="pi-img-head"><span>${label}</span><button data-pimg="${k}" title="اختيار صورة">📁</button><button data-pclr="${k}" class="pi-x" title="إزالة">✕</button></div><div class="pi-pic" data-ppic="${k}">${pr[k] ? `<img src="${pr[k]}" alt=""/>` : ""}</div></div>`;
    const sizes = [sizeName(this.model, -1), ...(this.model.sizes ?? []).map((z) => z.name)];
    const el = document.createElement("section");
    el.className = "z-assistant product-win";
    el.dir = "rtl";
    el.innerHTML = `<div class="za-head"><b>Product info · معلومات المنتج</b><button data-pi-act="close">×</button></div>
      <div class="za-body pi-grid">
        <div class="pi-col">${img("logo", "Logo · الشعار", "small")}${f("name", "Name · الاسم")}${f("article", "Article · الصنف")}${f("version", "Version · الإصدار")}${f("variation", "Variation · النوع")}${img("sketch1", "Sketch 1 · رسم 1")}${img("sketch2", "Sketch 2 · رسم 2")}</div>
        <div class="pi-col">${f("season", "Season · الموسم", true)}${f("collection", "Collection · المجموعة", true)}${f("group", "Product group · فئة المنتج", true)}${f("audience", "Target audience · الفئة المستهدفة", true)}${f("block", "Block reference · مرجع القالب")}${f("fabricName", "Fabric name · اسم القماش")}${f("fabricType", "Fabric type · نوع القماش")}${f("subtitle", "Subtitle · عنوان فرعي")}
          <label class="pi-t"><span>Comments · ملاحظات</span><textarea data-pi="comments" rows="5">${esc(pr.comments ?? "")}</textarea></label>
          <label class="pi-t"><span>Addition · إضافات</span><textarea data-pi="addition" rows="5">${esc(pr.addition ?? "")}</textarea></label></div>
        <div class="pi-col"><div class="pi-ro"><span>Sample size · المقاس الأساسي</span><b dir="ltr">${esc(sizes[0])}</b></div><div class="pi-ro"><span>Size list · المقاسات</span><div class="pi-sizes" dir="ltr">${sizes.map(esc).join("<br>")}</div></div>
          ${f("completion", "Completion · التسليم")}${f("author", "Author · المصمم")}${img("fabric", "Fabric · القماش")}</div>
        <datalist id="pi-season"><option>Summer</option><option>Winter</option><option>Ramadan</option><option>Eid</option></datalist>
        <datalist id="pi-collection"></datalist><datalist id="pi-group"><option>Thobe</option><option>Shirt</option><option>Trousers</option></datalist><datalist id="pi-audience"><option>Men</option><option>Women</option><option>Kids</option></datalist>
      </div>
      <div class="za-foot pi-foot"><button class="primary" data-pi-act="ok">✓ حفظ</button><button data-pi-act="print" title="طباعة صفحة المنتج إلى PDF">🖶 طباعة PDF</button><button data-pi-act="close">إلغاء</button></div>`;
    document.body.append(el);
    el.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.pi) pr[t.dataset.pi] = t.value;
    });
    el.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const pick = t.closest<HTMLElement>("[data-pimg]"), clr = t.closest<HTMLElement>("[data-pclr]"), act = t.closest<HTMLElement>("[data-pi-act]")?.dataset.piAct;
      const show = (k: string) => ((el.querySelector(`[data-ppic="${k}"]`) as HTMLElement).innerHTML = pr[k] ? `<img src="${pr[k]}" alt=""/>` : "");
      if (pick) {
        const k = pick.dataset.pimg as string, inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "image/png,image/jpeg,image/gif,image/webp";
        inp.onchange = () => {
          const file = inp.files?.[0];
          if (!file) return;
          if (file.size > 2_000_000) return this.toast("الصورة أكبر من 2 ميجابايت");
          const r = new FileReader();
          r.onload = () => ((pr[k] = String(r.result)), show(k));
          r.readAsDataURL(file);
        };
        inp.click();
      } else if (clr) {
        delete pr[clr.dataset.pclr as string];
        show(clr.dataset.pclr as string);
      } else if (act === "close") el.remove();
      else if (act === "print") this.printProduct(pr, sizes);
      else if (act === "ok") {
        this.snapshot();
        this.model.product = Object.fromEntries(Object.entries(pr).filter(([, v]) => v && v.trim() !== ""));
        if (pr.name?.trim()) this.model.name = pr.name.trim();
        this.changed();
        el.remove();
        this.toast("حُفظت معلومات المنتج");
      }
    });
  }

  /** Product sheet as a printable page (A4): texts, sizes, pictures and the active part. */
  private printProduct(pr: Record<string, string>, sizes: string[]): void {
    const row = (l: string, k: string) => (pr[k] ? `<tr><th>${l}</th><td>${esc(pr[k])}</td></tr>` : "");
    const pic = (k: string, l: string) => (pr[k] && /^data:image\/(png|jpeg|gif|webp);base64,/.test(pr[k]) ? `<figure><img src="${pr[k]}"/><figcaption>${l}</figcaption></figure>` : "");
    const pv = this.partPreview(this.res);
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
      @page{size:A4;margin:14mm}body{font-family:Arial,Tahoma,sans-serif;color:#111;font-size:11pt}h1{margin:0 0 4mm;font-size:18pt}
      header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #333;padding-bottom:3mm;margin-bottom:4mm}header img{max-height:22mm}
      table{border-collapse:collapse;width:100%}th{text-align:right;color:#555;font-weight:normal;width:38%;padding:1.5mm 2mm;border-bottom:1px solid #ddd}td{padding:1.5mm 2mm;border-bottom:1px solid #ddd}
      .cols{display:grid;grid-template-columns:1fr 1fr;gap:6mm}figure{margin:0 0 4mm;text-align:center}figure img{max-width:100%;max-height:70mm}figcaption{color:#666;font-size:9pt}
      .notes{white-space:pre-wrap;border:1px solid #ccc;padding:3mm;min-height:15mm}svg{width:100%;height:70mm;border:1px solid #ccc}svg polyline{fill:none;stroke:#111}svg circle{fill:#111}
      </style></head><body><header><div><h1>${esc(pr.name || this.model.name)}</h1>${esc(pr.subtitle ?? "")}</div>${pr.logo && /^data:image\//.test(pr.logo) ? `<img src="${pr.logo}"/>` : ""}</header>
      <div class="cols"><div><table>${row("الصنف · Article", "article")}${row("الإصدار · Version", "version")}${row("النوع · Variation", "variation")}${row("الموسم · Season", "season")}${row("المجموعة · Collection", "collection")}${row("فئة المنتج · Product group", "group")}${row("الفئة المستهدفة · Target audience", "audience")}${row("مرجع القالب · Block reference", "block")}${row("القماش · Fabric", "fabricName")}${row("نوع القماش · Fabric type", "fabricType")}${row("التسليم · Completion", "completion")}${row("المصمم · Author", "author")}
        <tr><th>المقاس الأساسي · Sample size</th><td dir="ltr">${esc(sizes[0])}</td></tr><tr><th>المقاسات · Sizes</th><td dir="ltr">${sizes.map(esc).join(", ")}</td></tr></table></div>
      <div>${pic("sketch1", "Sketch 1")}${pic("sketch2", "Sketch 2")}${pic("fabric", "Fabric")}<svg viewBox="${pv.box}">${pv.svg.replace(/class="rec-(old|now)"/g, "")}</svg></div></div>
      ${pr.comments ? `<h3>ملاحظات · Comments</h3><div class="notes">${esc(pr.comments)}</div>` : ""}${pr.addition ? `<h3>إضافات · Addition</h3><div class="notes">${esc(pr.addition)}</div>` : ""}</body></html>`;
    if (document.body.classList.contains("embedded") && window.parent !== window) window.parent.postMessage({ type: "l7:print", html, name: `${safeFileName(pr.name || this.model.name)} product.pdf` }, "*");
    else {
      const w = window.open("", "_blank");
      w?.document.write(html);
      w?.print();
    }
  }

  /** Parts window: list (No, eye, name, RS, Obj, production), properties and a preview. */
  renderParts(): void {
    if (document.body.classList.contains("embedded")) this.renderPartStrip();
    const box = document.querySelector("#tab-partlist") as HTMLElement | null;
    if (!box) return;
    const ps = this.ensureParts(), act = this.model.activePart ?? 0;
    this.syncPart();
    const rows = ps
      .map((p, k) => {
        const objs = p.steps.reduce((a, st) => a + createdIds(st).length, 0);
        return `<tr data-part="${k}" class="${k === act ? "sel" : ""}"><td class="pno">${String(p.no).padStart(3, "0")}</td>
          <td class="peye"><button data-peye="${k}" title="إظهار البارت باهتاً خلف البارت النشط" class="${p.visible || k === act ? "on" : ""}"${k === act ? " disabled" : ""}>👁</button></td>
          <td class="pname"><input data-pname="${k}" value="${esc(p.name)}" placeholder="#"/></td><td class="pn">${p.steps.length}</td><td class="pn">${objs}</td><td class="pn">${p.production ? "✂" : ""}</td></tr>`;
      })
      .join("");
    const p = ps[act];
    const pv = this.partPreview(this.res);
    const when = p.edited ? new Date(p.edited) : null;
    box.innerHTML = `<div class="pgrid">
      <div class="xg-bar"><button data-pa="add" class="xg-add" title="بارت جديد">⊕</button><button data-pa="copy" title="نسخ البارت النشط إلى بارت جديد">⧉</button><button data-pa="del" class="xg-del" title="حذف البارت النشط">✕</button>
        <span class="xg-info">${ps.length} بارت · النشط ${String(p.no).padStart(3, "0")}</span></div>
      <div class="pg-main"><div class="xg-table"><table><thead><tr><th>No</th><th>👁</th><th>Part name · الاسم</th><th>RS</th><th>Obj</th><th>✂</th></tr></thead><tbody>${rows}</tbody></table></div>
        <svg class="pg-preview" viewBox="${pv.box}">${pv.svg}</svg></div>
      <div class="pg-props">
        <label><input type="radio" name="pkind" value="draft" ${p.production ? "" : "checked"}/> بارت رسم (لا يُقص) · Draft part</label>
        <label><input type="radio" name="pkind" value="prod" ${p.production ? "checked" : ""}/> بارت إنتاج (يُقص) · Production part</label>
        <div class="pg-row"><span>القماش · Fabric</span><input data-pp="fabric" value="${esc(p.fabric ?? "")}" placeholder="(غير محدد)"/></div>
        <div class="pg-row"><span>العدد · Amount</span><input data-pp="amount" class="num" dir="ltr" value="${p.amount ?? 1}"/><small>عادي</small><input data-pp="mirrored" class="num" dir="ltr" value="${p.mirrored ?? 0}"/><small>معكوس</small><b>${(p.amount ?? 1) + (p.mirrored ?? 0)} للموديل</b></div>
        <div class="pg-row"><span>الفئة · Category</span><input data-pp="category" value="${esc(p.category ?? "")}"/></div>
        <div class="pg-row"><span>آخر تعديل</span><output dir="ltr">${when ? when.toLocaleString("en-GB") : "—"}</output></div>
      </div></div>`;
    box.querySelectorAll<HTMLElement>("tr[data-part]").forEach((tr) => tr.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("input, button")) return;
      this.switchPart(Number(tr.dataset.part));
    }));
    box.querySelectorAll<HTMLInputElement>("input[data-pname]").forEach((inp) => {
      inp.addEventListener("focus", () => this.switchPart(Number(inp.dataset.pname)));
      inp.addEventListener("change", () => {
        this.snapshot();
        ps[Number(inp.dataset.pname)].name = inp.value.trim();
        this.changed();
      });
    });
    box.querySelectorAll<HTMLButtonElement>("[data-peye]").forEach((b) => b.addEventListener("click", () => {
      const q = ps[Number(b.dataset.peye)];
      q.visible = !q.visible;
      this.changed();
    }));
    box.querySelector('[data-pa="add"]')?.addEventListener("click", () => this.addPart());
    box.querySelector('[data-pa="copy"]')?.addEventListener("click", () => this.addPart(act));
    box.querySelector('[data-pa="del"]')?.addEventListener("click", () => this.deletePart(act));
    box.querySelectorAll<HTMLInputElement>('input[name="pkind"]').forEach((r) => r.addEventListener("change", () => {
      this.snapshot();
      p.production = r.value === "prod";
      this.changed();
    }));
    box.querySelectorAll<HTMLInputElement>("[data-pp]").forEach((inp) => inp.addEventListener("change", () => {
      this.snapshot();
      const k = inp.dataset.pp as "fabric" | "amount" | "mirrored" | "category";
      if (k === "amount" || k === "mirrored") p[k] = Math.max(0, Math.round(Number(normalizeFormula(inp.value)) || 0));
      else p[k] = inp.value.trim();
      this.changed();
    }));
  }

  // ---- basic blocks library (as GRAFIS): parts kept on this computer, for any design
  private library(): LibBlock[] {
    try {
      const v = JSON.parse(localStorage.getItem("level7.library") || "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  private storeLibrary(list: LibBlock[]): boolean {
    try {
      localStorage.setItem("level7.library", JSON.stringify(list));
      return true;
    } catch {
      this.toast("تعذر الحفظ في المكتبة (المساحة ممتلئة)");
      return false;
    }
  }

  /** Save the active part as a basic block, with the X / Z values it needs. */
  saveBlock(): void {
    this.syncPart();
    if (!this.model.steps.length) return this.toast("البارت فارغ");
    const p = this.model.parts?.[this.model.activePart ?? 0];
    // a small window for the name (the desktop program has no prompt())
    document.querySelector(".lib-save")?.remove();
    const el = document.createElement("section");
    el.className = "z-assistant lib-save";
    el.dir = "rtl";
    el.innerHTML = `<div class="za-head"><b>حفظ في مكتبة القوالب</b><button data-ls="close">×</button></div><div class="za-body"><div class="za-row"><span>الاسم</span><input data-ls="name" value="${esc(p?.name || this.model.name)}"/></div><p class="za-msg"></p><div class="za-foot"><button class="primary" data-ls="ok">✓ حفظ</button><button data-ls="close">إلغاء</button></div></div>`;
    document.body.append(el);
    const inp = el.querySelector('[data-ls="name"]') as HTMLInputElement;
    inp.select();
    const save = () => {
      const name = inp.value.trim();
      if (!name) return void ((el.querySelector(".za-msg") as HTMLElement).textContent = "اكتب اسماً");
      const list = this.library().filter((b) => b.name !== name);
      list.push({ name, saved: new Date().toISOString(), steps: this.model.steps, names: this.model.names, nextId: this.model.nextId, pieces: this.model.pieces ?? [], measurements: this.model.measurements, variables: this.model.variables });
      if (this.storeLibrary(JSON.parse(JSON.stringify(list)))) this.toast(`حُفظ القالب «${name}» في المكتبة`);
      el.remove();
    };
    inp.addEventListener("keydown", (e) => e.key === "Enter" && save());
    el.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>("[data-ls]")?.dataset.ls;
      if (a === "close") el.remove();
      else if (a === "ok") save();
    });
  }

  /** Add the blocks of a library file (blocks with the same name are replaced). */
  importLibrary(text: string): void {
    let blocks: LibBlock[];
    try {
      const v = JSON.parse(text);
      blocks = (Array.isArray(v) ? v : []).filter((b) => b && typeof b.name === "string" && Array.isArray(b.steps) && Array.isArray(b.measurements));
    } catch {
      blocks = [];
    }
    if (!blocks.length) return this.toast("الملف ليس مكتبة قوالب LEVEL7");
    const names = new Set(blocks.map((b) => b.name));
    if (this.storeLibrary([...this.library().filter((b) => !names.has(b.name)), ...blocks])) {
      this.toast(`أُضيف ${blocks.length} قالب إلى المكتبة`);
      if (document.querySelector(".lib-win")) this.openLibrary();
    }
  }

  /** Inherit a basic block: it becomes a new part of this design; X / Z it needs that the
   * design does not have are added. */
  openLibrary(): void {
    document.querySelector(".lib-win")?.remove();
    const list = this.library();
    const el = document.createElement("section");
    el.className = "z-assistant inherit-win lib-win";
    el.dir = "rtl";
    el.innerHTML = `<div class="za-head"><b>Inherit basic blocks · مكتبة القوالب</b><button data-lb="close">×</button></div>
      <div class="za-body"><div class="ih-main"><div class="ih-list"><ul>${list.map((b, k) => `<li><label><input type="radio" name="lib" value="${k}" ${k ? "" : "checked"}/> <b>${esc(b.name)}</b> <i dir="ltr">${b.steps.length} RS · ${new Date(b.saved).toLocaleDateString("en-GB")}</i></label></li>`).join("")}</ul></div><svg class="pg-preview"></svg></div>
      ${list.length ? "" : '<p class="empty">المكتبة فارغة: احفظ بارتاً فيها، أو استورد ملف مكتبة.</p>'}
      <p class="za-msg"></p><div class="za-foot"><button class="primary" data-lb="ok"${list.length ? "" : " disabled"}>✓ إدراج كبارت جديد</button><button data-lb="del" class="danger"${list.length ? "" : " disabled"}>حذف من المكتبة</button><button data-lb="export" title="حفظ المكتبة في ملف لنقلها إلى جهاز آخر"${list.length ? "" : " disabled"}>⤒ تصدير المكتبة</button><button data-lb="import" title="إضافة قوالب من ملف مكتبة">⤓ استيراد مكتبة</button><button data-lb="close">إلغاء</button></div></div>`;
    document.body.append(el);
    const chosen = () => Number((el.querySelector('input[name="lib"]:checked') as HTMLInputElement | null)?.value ?? -1);
    const draw = () => {
      const b = list[chosen()];
      if (!b) return;
      const res = evaluateModel({ ...emptyModel(), measurements: b.measurements, variables: b.variables, steps: b.steps, names: b.names, nextId: b.nextId });
      const pv = this.partPreview(res), svg = el.querySelector("svg") as SVGSVGElement;
      svg.setAttribute("viewBox", pv.box);
      svg.innerHTML = pv.svg;
    };
    draw();
    el.addEventListener("change", draw);
    el.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>("[data-lb]")?.dataset.lb, k = chosen(), b = list[k];
      if (a === "close") el.remove();
      else if (a === "export") download("LEVEL7 library.level7lib.json", JSON.stringify(list), "application/json");
      else if (a === "import") {
        if (document.body.classList.contains("embedded") && window.parent !== window) window.parent.postMessage({ type: "l7:open-json", purpose: "library" }, "*");
        else {
          const inp = document.createElement("input");
          inp.type = "file";
          inp.accept = ".json";
          inp.onchange = async () => inp.files?.[0] && this.importLibrary(await inp.files[0].text());
          inp.click();
        }
      } else if (a === "del" && b && confirm(`حذف «${b.name}» من المكتبة؟`)) {
        list.splice(k, 1);
        this.storeLibrary(list);
        el.remove();
        if (list.length) this.openLibrary();
      } else if (a === "ok" && b) {
        this.snapshot();
        const ps = this.ensureParts();
        this.syncPart();
        let added = 0;
        for (const x of b.measurements) if (!this.model.measurements.some((m) => m.id === x.id)) (this.model.measurements.push({ ...x }), added++);
        for (const z of b.variables) if (!this.model.variables.some((v) => v.id === z.id)) (this.model.variables.push({ ...z }), added++);
        this.model.measurements.sort((p, q) => p.id - q.id);
        this.model.variables.sort((p, q) => p.id - q.id);
        const no = ps.reduce((m, p) => Math.max(m, p.no), 0) + 1;
        // a block keeps only its own construction (inheritance from other parts does not travel)
        const steps = (JSON.parse(JSON.stringify(b.steps)) as Step[]).filter((st) => st.op !== "inherit");
        ps.push({ no, name: b.name, steps, names: { ...b.names }, nextId: b.nextId, pieces: JSON.parse(JSON.stringify(b.pieces ?? [])), amount: 1 });
        el.remove();
        this.switchPart(ps.length - 1);
        this.toast(`أُدرج القالب «${b.name}» كبارت ${String(no).padStart(3, "0")}${added ? `، وأُضيف ${added} من X/Z` : ""}`);
      }
    });
  }

  /** Inherit objects (or a whole part) from an earlier part: linked copies (as GRAFIS). */
  // ---- seam allowance tool (as GRAFIS): pick the kind and value, then click the edges of the pieces
  seamTool: { mode: "std" | "v0" | "v1" | "v2" | "unpar" | "none" } | null = null;
  private seamHover: { pc: number; k: number } | null = null;
  private seamVals = (() => {
    const d = { std: "10", v0: "20", v1: "30", v2: "40", ua: "10", ub: "20" };
    try {
      return { ...d, ...JSON.parse(localStorage.getItem("level7.seamVals") || "{}") } as typeof d;
    } catch {
      return d;
    }
  })();

  startSeamTool(): void {
    if (!this.model.pieces?.length) return this.needPiece("seam");
    this.cancelTool();
    this.seamTool = { mode: "std" };
    this.renderSeamBar();
    this.render();
  }

  endSeamTool(): void {
    if (!this.seamTool) return;
    this.seamTool = null;
    this.seamHover = null;
    document.querySelector(".seam-bar")?.remove();
    this.render();
  }

  private renderSeamBar(): void {
    let bar = document.querySelector(".seam-bar") as HTMLElement | null;
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "curve-bar seam-bar";
      setupBar(bar);
      (document.querySelector(".canvas-wrap") as HTMLElement).append(bar);
      bar.addEventListener("mousedown", (e) => e.stopPropagation());
      bar.addEventListener("click", (e) => {
        const t = e.target as HTMLElement, m = t.closest<HTMLElement>("[data-sm]")?.dataset.sm;
        if (t.closest("[data-sall]")) return this.seamAll();
        if (t.closest("[data-send]")) return this.endSeamTool();
        if (m && this.seamTool && !t.matches("input")) {
          this.seamTool.mode = m as NonNullable<typeof this.seamTool>["mode"];
          this.renderSeamBar();
        }
      });
      bar.addEventListener("input", (e) => {
        const t = e.target as HTMLInputElement;
        if (!t.dataset.sv) return;
        (this.seamVals as Record<string, string>)[t.dataset.sv] = t.value.trim();
        try {
          localStorage.setItem("level7.seamVals", JSON.stringify(this.seamVals));
        } catch {}
      });
      bar.addEventListener("focusin", (e) => {
        const m = (e.target as HTMLElement).closest<HTMLElement>("[data-sm]")?.dataset.sm;
        if (m && this.seamTool && this.seamTool.mode !== m) {
          this.seamTool.mode = m as NonNullable<typeof this.seamTool>["mode"];
          bar!.querySelectorAll("[data-sm]").forEach((x) => x.classList.toggle("on", (x as HTMLElement).dataset.sm === m));
        }
      });
    }
    const m = this.seamTool?.mode, v = this.seamVals;
    const box = (mode: string, icon: string, tip: string, inputs: string) => `<label data-sm="${mode}" class="sm${m === mode ? " on" : ""}" title="${tip}">${icon}${inputs}</label>`;
    const inp = (k: keyof typeof v) => `<input data-sv="${k}" class="expr" dir="ltr" value="${esc(v[k])}"/>`;
    bar.innerHTML = BAR_CHROME + `<b>مسافة الخياطة</b>` +
      box("std", SEAM_ICON.std, "مسافة قياسية · Assign standard distance", inp("std")) +
      box("v0", SEAM_ICON.dist, "مسافة · Assign distance", inp("v0")) + box("v1", SEAM_ICON.dist, "مسافة · Assign distance", inp("v1")) + box("v2", SEAM_ICON.dist, "مسافة · Assign distance", inp("v2")) +
      box("unpar", SEAM_ICON.unpar, "غير متوازية: القيمة الأولى عند الطرف الأقرب للنقرة · Assign unparallel", inp("ua") + inp("ub")) +
      box("none", SEAM_ICON.none, "بدون مسافة خياطة · No allowance", "") +
      `<button data-sall="1" title="القيمة القياسية على كل حواف كل القطع">⬚ الكل</button><span>انقر حافة القطعة · كليك يمين للإنهاء</span><button data-send="1">إنهاء</button>`;
  }

  /** The piece edge under the pointer: piece index and edge index in Piece.edges. */
  private seamEdgeAt(sx: number, sy: number): { pc: number; k: number } | null {
    const w = this.toWorld(sx, sy);
    let best: { pc: number; k: number; d: number } | null = null;
    (this.model.pieces ?? []).forEach((pc, pi) => {
      const g = this.res.pieces.get(pc.id);
      g?.edges.forEach((e, i) => {
        const d = closestOnPolyline(e, w).d * this.scale;
        if (d <= 12 && (!best || d < best.d)) best = { pc: pi, k: g.order[i], d };
      });
    });
    const b = best as { pc: number; k: number; d: number } | null;
    return b && { pc: b.pc, k: b.k };
  }

  private seamValue(src: string): string | null {
    try {
      new Vars(withSize(this.model), undefined, this.res.z).eval(src);
      return src;
    } catch {
      this.toast(`القيمة «${src}» غير صحيحة`);
      return null;
    }
  }

  private seamClick(sx: number, sy: number): void {
    const h = this.seamEdgeAt(sx, sy), t = this.seamTool;
    if (!t) return;
    if (!h) return this.toast("انقر حافة قطعة");
    const pc = (this.model.pieces ?? [])[h.pc], v = this.seamVals;
    let a: string | null = "0", b: string | null = "";
    if (t.mode === "unpar") {
      // the first value goes to the end of the edge nearer the click
      const o = this.res.objects.get(pc.edges[h.k]), at = this.toWorld(sx, sy);
      const nearStart = !o || closestOnPolyline(o.pts, at).s <= polyLen(o.pts) / 2;
      a = this.seamValue(nearStart ? v.ua : v.ub);
      b = this.seamValue(nearStart ? v.ub : v.ua);
    } else if (t.mode !== "none") a = this.seamValue(t.mode === "std" ? v.std : v[t.mode]);
    if (a === null || b === null) return;
    this.snapshot();
    pc.seam[h.k] = a;
    pc.seamEnd ??= [];
    while (pc.seamEnd.length < pc.edges.length) pc.seamEnd.push("");
    pc.seamEnd[h.k] = b;
    if (!pc.seamEnd.some((x) => x.trim())) delete pc.seamEnd;
    this.changed();
  }

  private seamAll(): void {
    const a = this.seamValue(this.seamVals.std);
    if (a === null || !this.model.pieces?.length) return;
    this.snapshot();
    for (const pc of this.model.pieces) {
      pc.seam = pc.edges.map(() => a);
      delete pc.seamEnd;
    }
    this.changed();
    this.toast(`مسافة خياطة ${a} على كل حواف القطع`);
  }

  /** While the tool is on: the allowance of each edge written on it ("9/11" when unparallel). */
  private seamLabelsSvg(): string {
    if (!this.seamTool) return "";
    const out: string[] = [];
    (this.model.pieces ?? []).forEach((pc, pi) => {
      const g = this.res.pieces.get(pc.id);
      g?.edges.forEach((e, i) => {
        const k = g.order[i], hv = this.seamHover?.pc === pi && this.seamHover.k === k;
        const val = (src: string) => this.formulaText(src || "0");
        const end = pc.seamEnd?.[k]?.trim();
        const txt = end ? `${val(pc.seam[k])} / ${val(end)}` : val(pc.seam[k]);
        if (hv) out.push(`<polyline class="seam-hover" points="${e.map((p) => this.toScreen(p).map((q) => q.toFixed(1)).join(",")).join(" ")}" fill="none"/>`);
        const m = this.toScreen(pointAlong(e, polyLen(e) / 2)), c = this.toScreen(g.centre);
        const dx = m[0] - c[0], dy = m[1] - c[1], L = Math.hypot(dx, dy) || 1;
        out.push(`<text class="seam-label" x="${(m[0] - (dx / L) * 22).toFixed(1)}" y="${(m[1] - (dy / L) * 22 + 4).toFixed(1)}" text-anchor="middle">\u2066${esc(txt)}\u2069</text>`);
      });
    });
    return out.join("");
  }

  /** New objects in the active part for objects of part k (they keep their names where free). */
  private inheritItems(k: number, ids: number[]): { src: number; dst: number }[] {
    const src = this.ensureParts()[k], res = this.partResult(k);
    const taken = new Set(Object.values(this.model.names));
    return ids.map((sid) => {
      const o = res.objects.get(sid) as GObj, nm = src.names[sid];
      let dst: number;
      if (nm && !taken.has(nm)) {
        dst = this.model.nextId++;
        this.model.names[dst] = nm;
        taken.add(nm);
      } else dst = newId(this.model, o.kind === "point" ? "point" : nm?.startsWith("C") ? "curve" : "line");
      return { src: sid, dst };
    });
  }

  // ---- inherit by clicking (as GRAFIS): the earlier parts show, the element under the pointer lights up,
  // a click brings it into the active part (linked: it follows its part); right click ends
  inheritPick: { k: number; no: number; res: EvalResult }[] | null = null;
  private ihHover: { k: number; id: number } | null = null;

  startInheritPick(): void {
    const ps = this.ensureParts(), me = ps[this.model.activePart ?? 0].no;
    this.syncPart();
    const earlier = ps.map((p, k) => ({ k, no: p.no })).filter((x) => x.no < me);
    if (!earlier.length) return this.toast("لا توجد بارتات سابقة للوراثة منها؛ أنشئ بارتاً من نافذة البارتات (Parts)");
    this.cancelTool();
    this.inheritPick = earlier.map((x) => ({ ...x, res: this.partResult(x.k) }));
    this.ihHover = null;
    this.renderInheritBar();
    this.render();
  }

  endInheritPick(): void {
    if (!this.inheritPick) return;
    this.inheritPick = null;
    this.ihHover = null;
    document.querySelector(".inherit-bar")?.remove();
    this.render();
  }

  private renderInheritBar(): void {
    let bar = document.querySelector(".inherit-bar") as HTMLElement | null;
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "curve-bar inherit-bar";
      setupBar(bar);
      (document.querySelector(".canvas-wrap") as HTMLElement).append(bar);
      bar.addEventListener("mousedown", (e) => e.stopPropagation());
      bar.addEventListener("click", (e) => {
        const a = (e.target as HTMLElement).closest<HTMLElement>("[data-ihb]")?.dataset.ihb;
        if (a === "list") (this.endInheritPick(), this.openInherit(false));
        else if (a === "end") this.endInheritPick();
      });
    }
    bar.innerHTML = BAR_CHROME + `<b>وراثة عناصر</b><span>مرّر على خط من بارت سابق ثم انقره: يُنقل إلى البارت النشط ويبقى تابعاً لبارته · كليك يمين للإنهاء</span><button data-ihb="list" title="الاختيار من قائمة">☰ القائمة</button><button data-ihb="end">إنهاء</button>`;
  }

  private inheritAt(sx: number, sy: number): { k: number; id: number } | null {
    let best: { k: number; id: number; d: number } | null = null;
    const w = this.toWorld(sx, sy);
    // 0.9.189: what is already inherited does not take the pointer (it often lies right on top of a line
    // still to be taken, which then could not be reached: «already inherited» every time)
    const taken = new Set<string>();
    for (const st of this.model.steps) if (st.op === "inherit") for (const it of st.items) taken.add(`${st.part}:${it.src}`);
    for (const pr of this.inheritPick ?? [])
      for (const o of pr.res.objects.values()) {
        if (pr.res.stepErrors.has(o.step) || taken.has(`${pr.no}:${o.id}`)) continue;
        const d = o.kind === "point" ? dist(this.toScreen(o.pts[0]), [sx, sy]) : closestOnPolyline(o.pts, w).d * this.scale;
        if (d <= (o.kind === "point" ? 10 : PICK_PX / 2) && (!best || d < best.d - (o.kind === "point" ? 4 : 0))) best = { k: pr.k, id: o.id, d };
      }
    return best && { k: best.k, id: best.id };
  }

  private inheritClick(): void {
    const h = this.ihHover, pr = h && this.inheritPick?.find((x) => x.k === h.k);
    if (!h || !pr) return this.toast("مرّر على خط من بارت سابق حتى يتلوّن ثم انقره");
    const done = this.model.steps.some((st) => st.op === "inherit" && st.part === pr.no && st.items.some((it) => it.src === h.id));
    if (done) return this.toast("هذا العنصر موروث سابقاً في هذا البارت");
    this.snapshot();
    const items = this.inheritItems(h.k, [h.id]), last = this.model.steps[this.model.steps.length - 1];
    if (last?.op === "inherit" && last.part === pr.no) last.items.push(...items);
    else this.model.steps.push({ op: "inherit", part: pr.no, items });
    this.changed();
    this.toast(`نُقل ${this.ensureParts()[h.k].names[h.id] ?? "العنصر"} من البارت ${String(pr.no).padStart(3, "0")} · انقر التالي أو كليك يمين للإنهاء`);
  }

  private inheritSvg(): string {
    if (!this.inheritPick) return "";
    const out: string[] = [];
    const taken = new Set<string>();
    for (const st of this.model.steps) if (st.op === "inherit") for (const it of st.items) taken.add(`${st.part}:${it.src}`);
    for (const pr of this.inheritPick)
      for (const o of pr.res.objects.values()) {
        if (pr.res.stepErrors.has(o.step)) continue;
        const hv = this.ihHover?.k === pr.k && this.ihHover.id === o.id, done = taken.has(`${pr.no}:${o.id}`);
        const cls = hv ? "ih-hover" : done ? "ih-done" : "ih-src";
        if (o.kind === "point") {
          const [x, y] = this.toScreen(o.pts[0]);
          out.push(`<circle class="${cls}" cx="${x}" cy="${y}" r="${hv ? 4 : 2.4}"/>`);
        } else out.push(`<polyline class="${cls}" points="${o.pts.map((p) => this.toScreen(p).map((v) => v.toFixed(1)).join(",")).join(" ")}" fill="none"/>`);
      }
    return out.join("");
  }

  private openInherit(whole: boolean): void {
    const ps = this.ensureParts(), act = this.model.activePart ?? 0, me = ps[act].no;
    this.syncPart();
    const earlier = ps.map((p, k) => ({ p, k })).filter(({ p }) => p.no < me);
    if (!earlier.length) return this.toast("لا توجد بارتات سابقة للوراثة منها؛ أنشئ بارتاً من نافذة البارتات (Parts)");
    document.querySelector(".inherit-win")?.remove();
    const el = document.createElement("section");
    el.className = "z-assistant inherit-win";
    el.dir = "rtl";
    el.innerHTML = `<div class="za-head"><b>${whole ? "Inherit part · وراثة بارت كامل" : "Inherit objects · وراثة عناصر"}</b><button type="button" data-ih="close">×</button></div>
      <div class="za-body"><div class="za-row"><span>من البارت</span><select data-ih="part">${earlier.map(({ p, k }) => `<option value="${k}">${String(p.no).padStart(3, "0")} ${esc(p.name)}</option>`).join("")}</select></div>
        <div class="ih-main"><div class="ih-list"><label class="ih-all"><input type="checkbox" data-ih="all" ${whole ? "checked disabled" : ""}/> الكل</label><ul></ul></div><svg class="pg-preview"></svg></div>
        <p class="za-msg"></p><div class="za-foot"><button class="primary" data-ih="ok">✓ وراثة</button><button data-ih="close">إلغاء</button></div></div>`;
    document.body.append(el);
    const q = <T extends Element>(sel: string) => el.querySelector(sel) as T;
    const fill = () => {
      const k = Number(q<HTMLSelectElement>('[data-ih="part"]').value), res = this.partResult(k), p = ps[k];
      const objs = [...res.objects.values()].filter((o) => !res.stepErrors.has(o.step));
      q<HTMLUListElement>("ul").innerHTML = objs.map((o) => `<li><label><input type="checkbox" data-obj="${o.id}" ${whole ? "checked disabled" : ""}/> <b dir="ltr">${esc(p.names[o.id] ?? "#" + o.id)}</b> <i>${o.kind === "point" ? "نقطة" : (p.names[o.id] ?? "").startsWith("C") ? "منحنى" : "خط"}</i></label></li>`).join("") || `<li class="none">لا توجد عناصر</li>`;
      draw();
    };
    const picked = () => new Set([...el.querySelectorAll<HTMLInputElement>("input[data-obj]:checked")].map((i) => Number(i.dataset.obj)));
    const draw = () => {
      const k = Number(q<HTMLSelectElement>('[data-ih="part"]').value), pv = this.partPreview(this.partResult(k), picked());
      const svg = q<SVGSVGElement>("svg");
      svg.setAttribute("viewBox", pv.box);
      svg.innerHTML = pv.svg;
    };
    fill();
    el.addEventListener("change", (e) => {
      const t = e.target as HTMLElement;
      if (t.matches('[data-ih="part"]')) fill();
      else if (t.matches('[data-ih="all"]')) el.querySelectorAll<HTMLInputElement>("input[data-obj]").forEach((i) => (i.checked = (t as HTMLInputElement).checked)), draw();
      else draw();
    });
    el.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>("[data-ih]")?.dataset.ih;
      if (a === "close") el.remove();
      if (a !== "ok") return;
      const k = Number(q<HTMLSelectElement>('[data-ih="part"]').value), src = ps[k], ids = [...picked()];
      if (!ids.length) return void (q<HTMLElement>(".za-msg").textContent = "اختر عنصراً واحداً على الأقل");
      this.snapshot();
      const items = this.inheritItems(k, ids);
      this.model.steps.push({ op: "inherit", part: src.no, items });
      this.changed();
      el.remove();
      this.toast(`وُرثت ${items.length} عناصر من البارت ${String(src.no).padStart(3, "0")}`);
    });
  }

  private snapshot(): void {
    const ap = this.model.parts?.[this.model.activePart ?? 0];
    if (ap) ap.edited = new Date().toISOString();
    // only drawing changes enter the history: a table edit (X, Z, sizes) leaves the drawing as the
    // last entry already has it, so nothing is added and the count stays the number of drawing actions
    const now = this.pack();
    if (this.undoStack[this.undoStack.length - 1] === now) return;
    this.undoStack.push(now);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoKept = this.redoStack;
    this.redoStack = [];
  }

  private changed(panels = true): void {
    this.evaluate();
    this.syncPart();
    // a change that left the drawing as it was (X, Z, sizes, unit...) takes its history entry back
    if (this.undoStack.length && this.undoStack[this.undoStack.length - 1] === this.pack()) {
      this.undoStack.pop();
      if (!this.redoStack.length && this.redoKept.length) this.redoStack = this.redoKept; // redo stays possible
    }
    this.redoKept = [];
    const kept = autosave(this.model);
    if (kept !== "ok" && this.autosaveWarned !== kept) {
      this.autosaveWarned = kept;
      this.toast(kept === "noimages" ? "الحفظ التلقائي يعمل بدون الصور الخلفية (حجمها كبير): احفظ الملف Ctrl+S للاحتفاظ بها" : "تعذر الحفظ التلقائي: احفظ الملف Ctrl+S");
    }
    if (!this.unsaved) setUnsaved((this.unsaved = true));
    if (panels) this.renderPanels();
    else this.refreshValues();
    this.refreshForm?.();
    this.updateHistoryBar();
    this.render();
  }

  /** Embedded mode: the host program hands over a file it opened. */
  openText(text: string, name: string, grafis = false): void {
    if (!this.keepOrSave()) return;
    try {
      if (grafis) this.importGrafis(text);
      else {
        this.load(parseModel(text));
        setUnsaved((this.unsaved = false));
        this.toast(`تم فتح ${name}`);
      }
    } catch (e) {
      this.toast(`تعذر قراءة الملف: ${(e as Error).message}`);
    }
  }

  /** Embedded mode: start an empty design without asking. */
  newDesign(): void {
    if (!this.keepOrSave()) return;
    this.load(emptyModel());
    // a new design has no file yet: its first Ctrl+S asks where (0.9.190)
    if (document.body.classList.contains("embedded") && window.parent !== window) window.parent.postMessage({ type: "l7:design-new" }, "*");
    setUnsaved((this.unsaved = false));
    // a new model starts by choosing its measurements from the library (when there is one)
    if (this.mlib().length) this.openMLib();
  }

  /** Before another design replaces this one: unsaved work (also from before a restart or a
   * crash) is offered back, or saved to a file. False = keep the current design open. */
  private keepOrSave(): boolean {
    const ps = this.model.parts ?? [];
    const empty = !this.model.steps.length && ps.every((p) => !p.steps.length) && !this.model.measurements.length;
    if (!this.unsaved || empty) return true;
    if (this.fromRestore) {
      this.fromRestore = false;
      // the first request after the program started: the design on screen is the one restored from the autosave
      if (confirm(`التصميم «${this.model.name}» فيه تعديلات لم تُحفظ في ملف (من آخر مرة).\n\nموافق = استرجاعه ومتابعة العمل عليه\nإلغاء = خيارات أخرى`)) return false;
    }
    if (confirm(`حفظ التصميم «${this.model.name}» في ملف قبل استبداله؟\n\nموافق = حفظ ثم متابعة\nإلغاء = متابعة بدون حفظ (يمكن التراجع Ctrl+Z)`)) this.save();
    return true;
  }
  /** The design on screen is the autosave restored at start, with unsaved changes. */
  private fromRestore = false;

  private load(m: Model): void {
    this.fromRestore = false;
    this.snapshot();
    this.model = m;
    this.cancelTool();
    this.selectedStep = -1;
    this.changed();
    this.fit();
  }

  private undo(): void {
    // entries that would not change the drawing (left by table edits) are skipped
    const cur = this.pack();
    let prev = this.undoStack.pop();
    while (prev !== undefined && prev === cur) prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.pack());
    this.model = unpackModel(prev, this.blobs, this.model);
    this.cancelTool();
    this.changed();
  }

  private redo(): void {
    const cur = this.pack();
    let next = this.redoStack.pop();
    while (next !== undefined && next === cur) next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.pack());
    this.model = unpackModel(next, this.blobs, this.model);
    this.cancelTool();
    this.changed();
  }

  // ------------------------------------------------------------ view
  private toScreen = (p: Pt): Pt => {
    const r = this.svg.getBoundingClientRect();
    return [(p[0] - this.cx) * this.scale + r.width / 2, r.height / 2 - (p[1] - this.cy) * this.scale];
  };

  private toWorld = (x: number, y: number): Pt => {
    const r = this.svg.getBoundingClientRect();
    return [(x - r.width / 2) / this.scale + this.cx, (r.height / 2 - y) / this.scale + this.cy];
  };

  fit(): void {
    const all = [...this.res.objects.values()].flatMap((o) => o.pts);
    this.ghosts.forEach((g, gi) => {
      const info = this.ghostInfo[gi];
      if (info?.all) for (const o of g.objects.values()) for (const p of o.pts) all.push([p[0] + info.off[0], p[1] + info.off[1]]);
    });
    const r = this.svg.getBoundingClientRect();
    if (!all.length || !r.width) {
      this.cx = 0;
      this.cy = 0;
      this.scale = 1;
      this.render();
      return;
    }
    const xs = all.map((p) => p[0]);
    const ys = all.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    this.cx = (x0 + x1) / 2;
    this.cy = (y0 + y1) / 2;
    const w = Math.max(x1 - x0, 50);
    const h = Math.max(y1 - y0, 50);
    // room above and below for the undo / size bar over the drawing; inside LEVEL7 and MTM also
    // room on the right for the tool card, so the drawing is never under it
    const side = document.body.classList.contains("embedded") ? Math.min(240, r.width * 0.25) : 0;
    // and room on the left for the parts strip when it stays open
    const ps = document.querySelector<HTMLElement>(".part-strip"), left = ps && getComputedStyle(ps).position !== "static" && ps.offsetWidth && this.stripMode === "permanent" ? ps.offsetWidth : 0;
    this.scale = Math.min((r.width - 80 - side - left) / w, (r.height - 128) / h);
    this.cx += (side - left) / 2 / this.scale;
    this.render();
  }

  // ------------------------------------------------------------ rendering
  /** Embedded mode: zoom about the centre of the drawing area (host +/- commands). */
  zoomBy(f: number): void {
    this.scale = Math.min(200, Math.max(0.02, this.scale * f));
    this.render();
  }

  /** Zoom mode (Space, as GRAFIS): left click zooms in, right click zooms out, at the click. */
  private zoomMode = false;
  /** F5: refresh the screen — everything worked out again and drawn afresh (the work stays as it is). */
  refreshView(): void {
    this.hover = null;
    this.near = null;
    this.partHover = null;
    this.evaluate();
    this.renderPanels();
    this.render();
  }

  toggleZoomMode(on = !this.zoomMode): void {
    this.zoomMode = on;
    this.svg.classList.toggle("zoom-mode", on);
    this.toast(on ? "وضع الزووم: كليك يسار تكبير · كليك يمين تصغير · Space أو Esc للخروج" : "خروج من وضع الزووم");
  }
  leaveZoom(): void {
    if (this.zoomMode) this.toggleZoomMode(false);
  }
  private zoomAt(sx: number, sy: number, f: number): void {
    const before = this.toWorld(sx, sy);
    this.scale = Math.min(200, Math.max(0.02, this.scale * f));
    const after = this.toWorld(sx, sy);
    this.cx += before[0] - after[0];
    this.cy += before[1] - after[1];
    this.render();
  }

  render(): void {
    const r = this.svg.getBoundingClientRect();
    const parts: string[] = [this.imagesSvg(), this.gridSvg(r.width, r.height)];
    const highlight = this.highlighted();
    // with all parts shown, the part being worked on stands out in its own colour (as GRAFIS)
    const activeMark = this.allParts && this.ghostInfo.some((g) => g.all);
    const lineColor = (o: GObj) => (highlight.has(o.id) ? "var(--select)" : activeMark ? "var(--active-part, #2fa4dd)" : o.pts.length > 2 ? "var(--curve, var(--line))" : "var(--line)");

    this.ghosts.forEach((g, gi) => {
      const gi2 = this.ghostInfo[gi];
      if (!gi2 || (!gi2.all && !this.vis.ghosts)) return;
      const [ox, oy] = gi2.off, hv = this.partHover === gi2.k;
      for (const o of g.objects.values())
        if (o.kind === "line") parts.push(`<polyline class="${gi2.all ? (hv ? "allpart hover" : "allpart") : "ghost"}" points="${o.pts.map((p) => this.toScreen([p[0] + ox, p[1] + oy]).map((v) => v.toFixed(1)).join(",")).join(" ")}" fill="none"/>`);
      // the pieces of the other part too: cut line, sewing line and notches (seam allowances stay in sight)
      if (this.showPieces) {
        const sp = (pts: Pt[]) => pts.map((p) => this.toScreen([p[0] + ox, p[1] + oy]).map((v) => v.toFixed(1)).join(",")).join(" ");
        for (const pg of g.pieces.values()) {
          parts.push(this.pieceSvg(pg, sp, true));
        }
      }
    });
    if (this.showNest) parts.push(this.nestSvg());
    if (this.showPieces) parts.push(this.piecesSvg());
    for (const o of this.res.objects.values()) {
      if (o.kind !== "line") continue;
      const pts = o.pts.map((p) => this.toScreen(p).map((v) => v.toFixed(1)).join(",")).join(" ");
      const w = highlight.has(o.id) ? 2.5 : 1.4, sty = this.lineStyle(o.id);
      const dash = sty.dash ? ` stroke-dasharray="${LINE_DASHES[sty.dash]}"${sty.dash === "dotted" ? ' stroke-linecap="round"' : ""}` : "";
      const col = sty.color ?? lineColor(o);
      parts.push(`<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="${sty.color && highlight.has(o.id) ? 3 : w}"${dash}/>`);
      if (this.showNames) {
        const mid = this.toScreen(o.pts[Math.floor(o.pts.length / 2)]);
        parts.push(`<text x="${mid[0] + 4}" y="${mid[1] - 4}">${esc(o.name)}</text>`);
      }
    }
    // a point that is just the end of a line is the line's end: no separate dot (as GRAFIS)
    const ends = new Set<string>();
    for (const o of this.res.objects.values()) if (o.kind === "line" && o.pts.length) for (const q of [o.pts[0], o.pts[o.pts.length - 1]]) ends.add(`${q[0].toFixed(3)},${q[1].toFixed(3)}`);
    for (const o of this.res.objects.values()) {
      if (o.kind !== "point" || !this.vis.points) continue;
      if (!highlight.has(o.id) && ends.has(`${o.pts[0][0].toFixed(3)},${o.pts[0][1].toFixed(3)}`)) continue;
      const [x, y] = this.toScreen(o.pts[0]);
      const c = highlight.has(o.id) ? "var(--select)" : "var(--point)";
      parts.push(`<circle cx="${x}" cy="${y}" r="2.6" fill="${c}"/>`);
      if (this.showNames) parts.push(`<text x="${x + 5}" y="${y - 5}">${esc(o.name)}</text>`);
    }
    // picks already made by the current tool
    for (const p of [...this.picks, ...this.extra]) parts.push(this.markSvg(p, "var(--select)"));
    if (this.near && !this.pan) parts.push(this.nearSvg(this.near));
    // the curve under the pointer shows the points it passes through (drag one to reshape it, as GRAFIS)
    if (this.hover) parts.push(this.markSvg(this.hover, "var(--hover)"));
    parts.push(this.vis.dims ? this.dimsSvg() + this.ghostDimsSvg() : "");
    const dhv = this.dimHover !== null ? this.dimHits.find((h) => h.i === this.dimHover) : undefined;
    if (dhv) parts.push(`<polyline class="near-glow" points="${dhv.pts.map((q) => q.map((v) => v.toFixed(1)).join(",")).join(" ")}" fill="none"/>`);
    parts.push(this.vis.marks ? this.marksSvg() : "");
    parts.push(this.vis.texts ? this.textsSvg() : "");
    if (this.vis.lengths) parts.push(this.lengthsSvg());
    if (this.showDup) parts.push(this.duplicatesSvg());
    parts.push(this.liveSvg());
    parts.push(this.curveHandlesSvg());
    parts.push(this.curveDirSvg());
    parts.push(this.formulaLabelsSvg());
    for (const id of this.flashIds) {
      const o = this.res.objects.get(id);
      if (o?.kind === "line") parts.push(`<polyline class="err-edge" points="${o.pts.map((q) => this.toScreen(q).map((v) => v.toFixed(1)).join(",")).join(" ")}" fill="none"/>`);
    }
    // with the piece's edges in red no circle is needed (it fell between them, on another line)
    if (this.flash && !this.flashIds.size) {
      const [fx, fy] = this.toScreen(this.flash);
      parts.push(`<circle class="err-flash" cx="${fx}" cy="${fy}" r="26" fill="none"/>`);
    }
    parts.push(this.inheritSvg());
    parts.push(this.seamLabelsSvg());
    parts.push(this.imgEditSvg());
    parts.push(this.selFrameSvg());
    if (this.notchHover) {
      const g = this.res.pieces.get(this.notchHover.piece), n = g?.notches[this.notchHover.k];
      if (n) for (const sh of n.shape) parts.push(`<polyline class="notch-hover" points="${sh.map((q) => this.toScreen(q).map((v) => v.toFixed(1)).join(",")).join(" ")}" fill="none"/>`);
    }
    this.renderSelBar();
    this.renderCurveBar();
    this.renderDimBar();
    // no letters on the drawing: the name of the element under the pointer only
    // no name under the pointer either (only with "names" switched on): the drawing stays clean
    const under = this.nameHover;
    if (under && !this.showNames && this.nameTips) {
      const o = this.res.objects.get(under);
      if (o) {
        const [x, y] = this.toScreen(o.kind === "point" ? o.pts[0] : o.pts[Math.floor(o.pts.length / 2)]);
        parts.push(`<text class="name-tip" x="${x + 8}" y="${y - 8}">${esc(o.name)}</text>`);
      }
    }
    this.svg.innerHTML = parts.join("");
  }

  // ---- dimensions (annotation steps): drawn from the current geometry, always up to date
  private dimHits: { i: number; pts: Pt[] }[] = [];
  /** The dimension under the pointer (it glows; a press drags it). */
  private dimHover: number | null = null;
  private dimMoved = false;

  /** Options of the active dimension (as a bar like the curve's): note, text direction and size, unit, ×2 / ×4. */
  private renderDimBar(): void {
    const s = this.model.steps[this.selectedStep];
    let bar = document.querySelector(".curve-bar.dim-bar") as HTMLElement | null;
    if (!s || s.op !== "dim" || this.tool || this.blockingForm()) return void bar?.remove();
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "curve-bar dim-bar";
      setupBar(bar);
      (document.querySelector(".canvas-wrap") as HTMLElement).append(bar);
      bar.addEventListener("mousedown", (e) => e.stopPropagation());
      const edit = (f: (d: Extract<Step, { op: "dim" }>) => void) => {
        const d = this.model.steps[this.selectedStep];
        if (d?.op !== "dim") return;
        this.snapshot();
        f(d);
        this.changed();
        this.refreshEditForm();
      };
      bar.addEventListener("change", (e) => {
        const t = e.target as HTMLInputElement;
        const k = t.dataset.dk;
        if (k === "text") edit((d) => (t.value.trim() ? (d.text = t.value.trim()) : delete d.text));
        else if (k === "size") edit((d) => (t.value ? (d.size = t.value) : delete d.size));
        else if (k === "unit") edit((d) => (t.value ? (d.unit = t.value as "mm" | "cm" | "in") : delete d.unit));
        else if (k === "mult") edit((d) => (t.value !== "1" ? (d.mult = t.value) : delete d.mult));
      });
      bar.addEventListener("click", (e) => {
        const t = (e.target as HTMLElement).closest<HTMLElement>("[data-da]");
        const ub = (e.target as HTMLElement).closest<HTMLElement>("[data-du]"), mb = (e.target as HTMLElement).closest<HTMLElement>("[data-dm]");
        if (ub) edit((d) => (d.unit = ub.dataset.du as "mm" | "cm" | "in"));
        else if (mb) edit((d) => (mb.dataset.dm === "1" ? delete d.mult : (d.mult = mb.dataset.dm)));
        else if (t?.dataset.da === "flip") edit((d) => (d.flip === "1" ? delete d.flip : (d.flip = "1")));
        else if (t?.dataset.da === "edit") this.editStep(this.selectedStep);
      });
    }
    if (bar.contains(document.activeElement) && document.activeElement?.matches("input")) return; // typing a note
    const opt = (v: string, t: string, cur: string) => `<option value="${v}"${v === cur ? " selected" : ""}>${t}</option>`;
    const angle = s.kind === "angle";
    bar.innerHTML = BAR_CHROME + `<b>بُعد</b>` +
      `<input data-dk="text" class="dim-note" placeholder="ملاحظة / اسم" value="${esc(s.text ?? "")}" title="نص يُكتب قبل الرقم"/>` +
      `<button data-da="flip" class="${s.flip === "1" ? "on" : ""}" title="الكتابة على الجهة الأخرى من خط البعد">⇵ الكتابة</button>` +
      `<select data-dk="size" title="حجم الكتابة">${opt("", "حجم عادي", s.size ?? "")}${["10", "14", "18", "24", "32"].map((v) => opt(v, `${v} px`, s.size ?? "")).join("")}</select>` +
      // unit and multiplier as buttons in sight (a list hid the inch)
      (angle
        ? ""
        : `<span class="seg" title="وحدة القياس">${(["mm", "cm", "in"] as const).map((u) => `<button data-du="${u}" class="${(s.unit ?? (this.model.unit === "in" ? "in" : "mm")) === u ? "on" : ""}">${u === "mm" ? "مم" : u === "cm" ? "سم" : "بوصة"}</button>`).join("")}</span>` +
          `<span class="seg" title="ضرب القيمة">${["1", "2", "4"].map((v) => `<button data-dm="${v}" class="${(s.mult ?? "1") === v ? "on" : ""}">×${v}</button>`).join("")}</span>`) +
      `<button data-da="edit" title="كل قيم البعد">✎</button><span>اسحب البعد لتحريكه · رايت كليك للخروج</span>`;
  }

  private dimSvg(s: Extract<Step, { op: "dim" }>, live = false, dimIndex = -1): string {
    let off = 0;
    try {
      off = new Vars(withSize(this.model), undefined, this.res.z).eval(s.offset || "0");
    } catch {
      return "";
    }
    const P = (r?: PointRef) => (r ? this.pointOf(r) : null);
    const sc = (p: Pt) => this.toScreen(p);
    const cls = live ? "dim live" : "dim";
    const fs = Number(s.size) > 0 ? ` style="font-size:${Number(s.size)}px"` : "";
    const arrow = (tip: Pt, from: Pt) => {
      const [x, y] = sc(tip), [fx, fy] = sc(from), L = Math.hypot(x - fx, y - fy) || 1, ux = (x - fx) / L, uy = (y - fy) / L;
      return `M${x} ${y} l${(-9 * ux + 3.5 * uy).toFixed(1)} ${(-9 * uy - 3.5 * ux).toFixed(1)} M${x} ${y} l${(-9 * ux - 3.5 * uy).toFixed(1)} ${(-9 * uy + 3.5 * ux).toFixed(1)}`;
    };
    const flip = s.flip === "1";
    const text = (a: Pt, b: Pt, label: string) => {
      const [x1, y1] = sc(a), [x2, y2] = sc(b);
      let ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      if (ang > 90) ang -= 180;
      if (ang < -90) ang += 180;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const full = s.text ? `${esc(s.text)} \u2066${label}\u2069` : `\u2066${label}\u2069`;
      // flipped: the value sits on the other side of the dimension line, still readable
      const gap = Number(s.size) > 0 ? Number(s.size) * 0.4 : 5;
      return `<text class="dim-text" x="${mx}" y="${flip ? my + gap + 10 * (Number(s.size) > 0 ? Number(s.size) / 12 : 1) : my - gap}" transform="rotate(${ang.toFixed(1)} ${mx} ${my})" text-anchor="middle"${fs}>${full}</text>`;
    };
    const hit = (pts: Pt[]) => {
      if (!live && dimIndex >= 0) this.dimHits.push({ i: dimIndex, pts: pts.map(sc) });
    };
    const line = (a: Pt, b: Pt, dashed = false) => `<line x1="${sc(a)[0]}" y1="${sc(a)[1]}" x2="${sc(b)[0]}" y2="${sc(b)[1]}"${dashed ? ' stroke-dasharray="4 3"' : ""}/>`;
    const out: string[] = [];
    // values in mm, or in inches when the drawing's unit is inch
    const unit = s.unit ?? (this.model.unit === "in" ? "in" : "mm"), mult = Number(s.mult) > 0 ? Number(s.mult) : 1;
    const r1 = (v0: number) => {
      const v = v0 * mult, x = mult !== 1 ? ` (×${mult})` : "";
      if (unit === "in") return `${fmt(Math.round((v / 25.4) * 100) / 100)}″${x}`;
      if (unit === "cm") return `${fmt(Math.round(v) / 10)} cm${x}`;
      return `${fmt(Math.round(v * 10) / 10)}${x}`;
    };
    if (s.kind === "aligned" || s.kind === "h" || s.kind === "v") {
      const A = P(s.a), B = P(s.b);
      if (!A || !B) return "";
      let A2: Pt, B2: Pt, val: number;
      if (s.kind === "h") (A2 = [A[0], A[1] + off]), (B2 = [B[0], A[1] + off]), (val = Math.abs(B[0] - A[0]));
      else if (s.kind === "v") (A2 = [A[0] + off, A[1]]), (B2 = [A[0] + off, B[1]]), (val = Math.abs(B[1] - A[1]));
      else {
        const L = dist(A, B) || 1, nx = -(B[1] - A[1]) / L, ny = (B[0] - A[0]) / L;
        A2 = [A[0] + nx * off, A[1] + ny * off];
        B2 = [B[0] + nx * off, B[1] + ny * off];
        val = L;
      }
      out.push(line(A, A2, true), line(B, B2, true), line(A2, B2), `<path d="${arrow(A2, B2)} ${arrow(B2, A2)}"/>`, text(A2, B2, r1(val)));
      hit([A2, B2]);
    } else if (s.kind === "length" && s.obj !== undefined) {
      const o = this.res.objects.get(s.obj);
      if (!o) return "";
      const pts = off ? offsetPolyline(o.pts, off) : o.pts, n = pts.length;
      out.push(`<polyline points="${pts.map((p) => sc(p).join(",")).join(" ")}" fill="none"/>`, `<path d="${arrow(pts[0], pts[1])} ${arrow(pts[n - 1], pts[n - 2])}"/>`);
      const m = Math.floor(n / 2);
      out.push(text(pts[Math.max(0, m - 1)], pts[Math.min(n - 1, m + 1)], r1(polyLen(o.pts))));
      hit(pts);
    } else if (s.kind === "sum" && s.objs?.length) {
      // several lines / curves: each drawn beside itself, one total
      let total = 0, first: Pt[] | null = null;
      for (const id of s.objs) {
        const o = this.res.objects.get(id);
        if (!o) return "";
        total += polyLen(o.pts);
        const pts = off ? offsetPolyline(o.pts, off) : o.pts, n = pts.length;
        first ??= pts;
        out.push(`<polyline points="${pts.map((p) => sc(p).join(",")).join(" ")}" fill="none"/>`, `<path d="${arrow(pts[0], pts[1])} ${arrow(pts[n - 1], pts[n - 2])}"/>`);
        hit(pts);
      }
      const f0 = first as Pt[], m = Math.floor(f0.length / 2);
      out.push(text(f0[Math.max(0, m - 1)], f0[Math.min(f0.length - 1, m + 1)], `Σ ${r1(total)}`));
    } else if (s.kind === "angle") {
      const A = P(s.a), V = P(s.b), C = P(s.c);
      if (!A || !V || !C) return "";
      const [vx, vy] = sc(V), [ax, ay] = sc(A), [cx, cy] = sc(C);
      const a1 = Math.atan2(ay - vy, ax - vx), a2 = Math.atan2(cy - vy, cx - vx);
      let sweep = a2 - a1;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      while (sweep < -Math.PI) sweep += 2 * Math.PI;
      const R = 32, p1 = [vx + R * Math.cos(a1), vy + R * Math.sin(a1)], p2 = [vx + R * Math.cos(a1 + sweep), vy + R * Math.sin(a1 + sweep)];
      out.push(`<path d="M${p1[0]} ${p1[1]} A${R} ${R} 0 0 ${sweep > 0 ? 1 : 0} ${p2[0]} ${p2[1]}" fill="none"/>`);
      const mid = a1 + sweep / 2;
      const deg = `\u2066${fmt(Math.round(((Math.abs(sweep) * 180) / Math.PI) * 10) / 10)}°\u2069`; // angles stay in degrees
      const rr = flip ? R - 14 : R + 14;
      out.push(`<text class="dim-text" x="${vx + rr * Math.cos(mid)}" y="${vy + rr * Math.sin(mid) + 4}" text-anchor="middle">${s.text ? esc(s.text) + " " : ""}${deg}</text>`);
      hit([p1 as Pt, p2 as Pt]);
    }
    return `<g class="${cls}">${out.join("")}</g>`;
  }

  // ---- stitch lines and symbols (annotation steps)
  private symbolSvg(s: Extract<Step, { op: "mark" }>, live = false): string {
    let size = 0;
    try {
      size = new Vars(withSize(this.model), undefined, this.res.z).eval(s.size || "0");
    } catch {
      return "";
    }
    const sc = (p: Pt) => this.toScreen(p).map((v) => v.toFixed(1)).join(",");
    const cls = live ? "mark live" : "mark";
    if (s.obj !== undefined) {
      const o = this.res.objects.get(s.obj);
      if (!o || o.pts.length < 2) return "";
      const side = s.side ?? 1, base = offsetPolyline(o.pts, side * size), L = polyLen(base);
      if (!(L > 0)) return "";
      const along = (d: number, n = 0): Pt => {
        const p = pointAlong(base, Math.min(L, Math.max(0, d))), [ux, uy] = directionAt(base, Math.min(L, Math.max(0, d)));
        return [p[0] - uy * n * side, p[1] + ux * n * side]; // n > 0: farther from the edge
      };
      const line = (pts: Pt[], extra = "") => `<polyline points="${pts.map(sc).join(" ")}" fill="none"${extra}/>`;
      const out: string[] = [];
      if (s.kind === "lock") out.push(line(base, ' stroke-dasharray="6 3"'));
      else if (s.kind === "double") out.push(line(base, ' stroke-dasharray="6 3"'), line(offsetPolyline(o.pts, side * (size + 3)), ' stroke-dasharray="6 3"'));
      else if (s.kind === "zigzag") {
        const pts: Pt[] = [];
        for (let d = 0, k = 0; d <= L; d += 2, k++) pts.push(along(d, k % 2 ? 1.5 : -1.5));
        out.push(line(pts));
      } else if (s.kind === "gather") {
        const pts: Pt[] = [];
        for (let d = 0; d <= L; d += 0.5) pts.push(along(d, 1.6 * Math.sin((d / 6) * 2 * Math.PI)));
        out.push(line(pts));
      } else if (s.kind === "deco") {
        out.push(line(base));
        for (let d = 2; d < L; d += 4) out.push(line([along(d, 0), along(d, 2.5)]));
      }
      return `<g class="${cls}">${out.join("")}</g>`;
    }
    if (!s.a) return "";
    const A = this.pointOf(s.a), [ax, ay] = this.toScreen(A);
    if (s.kind === "grain" && !s.b && s.angle !== undefined) {
      // as GRAFIS: from the start point in its direction, one open arrowhead at the end
      let deg = 0, len = 0;
      try {
        const v = new Vars(withSize(this.model), undefined, this.res.z);
        deg = v.eval(s.angle);
        len = v.eval(s.size || "0");
      } catch {
        return "";
      }
      const B: Pt = [A[0] + Math.cos((deg * Math.PI) / 180) * len, A[1] + Math.sin((deg * Math.PI) / 180) * len];
      const [bx, by] = this.toScreen(B), L = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / L, uy = (by - ay) / L;
      return `<g class="${cls} grain"><path d="M${ax} ${ay} L${bx} ${by}" fill="none"/><path d="M${bx} ${by} L${(bx - 16 * ux + 6 * uy).toFixed(1)} ${(by - 16 * uy - 6 * ux).toFixed(1)} L${(bx - 16 * ux - 6 * uy).toFixed(1)} ${(by - 16 * uy + 6 * ux).toFixed(1)} Z" fill="none"/></g>`;
    }
    if (s.kind === "grain") {
      if (!s.b) return "";
      const [bx, by] = this.toScreen(this.pointOf(s.b)), L = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / L, uy = (by - ay) / L;
      const head = (x: number, y: number, k: number) => `M${x} ${y} l${(k * (-12 * ux + 5 * uy)).toFixed(1)} ${(k * (-12 * uy - 5 * ux)).toFixed(1)} M${x} ${y} l${(k * (-12 * ux - 5 * uy)).toFixed(1)} ${(k * (-12 * uy + 5 * ux)).toFixed(1)}`;
      return `<g class="${cls} grain"><path d="M${ax} ${ay} L${bx} ${by} ${head(bx, by, 1)} ${head(ax, ay, -1)}" fill="none"/></g>`;
    }
    const r = Math.max(2.5, (size / 2) * this.scale);
    if (s.kind === "button") return `<g class="${cls}"><circle cx="${ax}" cy="${ay}" r="${r}" fill="none"/><circle cx="${ax - r / 3}" cy="${ay}" r="${Math.max(1, r / 7)}"/><circle cx="${ax + r / 3}" cy="${ay}" r="${Math.max(1, r / 7)}"/></g>`;
    if (s.kind === "drill") return `<g class="${cls}"><circle cx="${ax}" cy="${ay}" r="${r}" fill="none"/><path d="M${ax - r * 1.4} ${ay} H${ax + r * 1.4} M${ax} ${ay - r * 1.4} V${ay + r * 1.4}" fill="none"/></g>`;
    return `<g class="${cls}"><path d="M${ax - r} ${ay} H${ax + r} M${ax} ${ay - r} V${ay + r}" fill="none" stroke-width="2"/></g>`;
  }

  private marksSvg(): string {
    const out: string[] = [];
    this.model.steps.forEach((s, i) => {
      if (s.op === "mark" && !this.res.stepErrors.has(i)) out.push(this.symbolSvg(s));
    });
    const t = this.tool;
    if (t?.build && (t.group === "الغرز" || t.group === "العلامات")) {
      let picks = this.picks;
      let values: Record<string, string> | null = null;
      if (this.form) {
        values = {};
        $("#tool-box").querySelectorAll<HTMLInputElement>("[data-key]").forEach((el) => ((values as Record<string, string>)[el.dataset.key as string] = el.value.trim()));
      } else if (this.hover && picks.length === t.picks.length - 1 && t.picks[picks.length].kind === this.hover.kind) picks = [...picks, this.hover];
      else return out.join("");
      try {
        const ctx = { model: parseModel(JSON.stringify(this.model)), res: this.res, picks, extra: this.extra };
        if (!values) values = Object.fromEntries((t.fields?.(ctx) ?? []).map((f) => [f.key, f.value]));
        const st = t.build(ctx, values);
        if (st.op === "mark") out.push(this.symbolSvg(st, true));
      } catch {
        /* incomplete */
      }
    }
    return out.join("");
  }

  /** With all parts shown: the other parts' dimensions too, each in its part's place (F7 shows / hides
   * them all). They are drawn from that part's own result, the view moved by the part's offset. */
  private ghostDimsSvg(): string {
    if (!this.allParts) return "";
    const out: string[] = [];
    const keep = { res: this.res, cx: this.cx, cy: this.cy, hits: this.dimHits };
    try {
      this.ghosts.forEach((g, gi) => {
        const info = this.ghostInfo[gi], p = info?.all ? this.model.parts?.[info.k] : undefined;
        if (!p) return;
        this.res = g;
        this.cx = keep.cx - info.off[0];
        this.cy = keep.cy - info.off[1];
        p.steps.forEach((st, i) => {
          if (st.op === "dim" && !g.stepErrors.has(i)) out.push(this.dimSvg(st, false, -1));
        });
      });
    } finally {
      Object.assign(this, { res: keep.res, cx: keep.cx, cy: keep.cy, dimHits: keep.hits });
    }
    return out.join("");
  }

  private dimsSvg(): string {
    const out: string[] = [];
    this.dimHits = [];
    this.model.steps.forEach((s, i) => {
      if (s.op === "dim" && !this.res.stepErrors.has(i)) out.push(i === this.selectedStep ? `<g class="dim-sel">${this.dimSvg(s, false, i)}</g>` : this.dimSvg(s, false, i));
    });
    // the dimension being placed
    const t = this.tool;
    if (t?.key.startsWith("dim") && t.build) {
      let picks = this.picks;
      let values: Record<string, string> | null = null;
      if (this.form) {
        values = {};
        $("#tool-box").querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-key]").forEach((el) => ((values as Record<string, string>)[el.dataset.key as string] = el.value.trim()));
      } else if (this.hover && picks.length === t.picks.length - 1 && t.picks[picks.length].kind === this.hover.kind) picks = [...picks, this.hover];
      else return out.join("");
      try {
        const model = parseModel(JSON.stringify(this.model));
        const ctx = { model, res: this.res, picks, extra: this.extra };
        if (!values) values = Object.fromEntries((t.fields?.(ctx) ?? []).map((f) => [f.key, f.value]));
        const st = t.build(ctx, values);
        if (st.op === "dim") out.push(this.dimSvg(st, true));
      } catch {
        /* incomplete */
      }
    }
    return out.join("");
  }

  // ---- curve end handles (as GRAFIS): drag the red circle to set the direction at that end
  private dragHandle: { i: number; end: "start" | "end"; flip: boolean } | null = null;

  private curveHandles(): { i: number; end: "start" | "end"; at: Pt; hs: Pt; es: Pt; set: boolean; deg: number; flip: boolean; pct: number }[] {
    const i = this.selectedStep, s = this.model.steps[i];
    if (!s || s.op !== "curve" || this.blockingForm()) return [];
    const o = this.res.objects.get(s.id);
    if (!o || o.pts.length < 2) return [];
    const out: { i: number; end: "start" | "end"; at: Pt; hs: Pt; es: Pt; set: boolean; deg: number; flip: boolean; pct: number }[] = [];
    const W = this.svg.clientWidth, H = this.svg.clientHeight;
    for (const end of ["start", "end"] as const) {
      const n = o.pts.length, at = end === "start" ? o.pts[0] : o.pts[n - 1], nb = end === "start" ? o.pts[1] : o.pts[n - 2];
      const es = this.toScreen(at), ns = this.toScreen(nb);
      // direction of travel along the curve at that end, on screen
      let dx = end === "start" ? ns[0] - es[0] : es[0] - ns[0], dy = end === "start" ? ns[1] - es[1] : es[1] - ns[1];
      const L = Math.hypot(dx, dy) || 1;
      dx /= L;
      dy /= L;
      const tens = (end === "start" ? s.startTension : s.endTension)?.trim();
      const pct = tens && Number.isFinite(Number(tens)) ? Number(tens) : 100;
      const len = Math.max(18, 70 * (pct / 100)); // handle length shows the strength of the curve at that end
      let k = end === "start" ? -len : len; // start handle behind the curve, end handle ahead of it
      // a handle that would fall outside the view goes to the other side of its end point
      const inside = (x: number, y: number) => x > 8 && y > 8 && x < W - 8 && y < H - 8;
      const flip = !inside(es[0] + dx * k, es[1] + dy * k) && inside(es[0] - dx * k, es[1] - dy * k);
      if (flip) k = -k;
      const given = (end === "start" ? s.startAngle : s.endAngle).trim();
      const deg = given && Number.isFinite(Number(given)) ? Number(given) : Math.round((Math.atan2(-dy, dx) * 180) / Math.PI);
      out.push({ i, end, at, es, hs: [es[0] + dx * k, es[1] + dy * k], set: !!given, deg, flip, pct });
    }
    return out;
  }

  /** Every point the selected curve passes through can be dragged in any direction:
   * a free point moves itself; a point tied to a line (on a line, intersection, line end …)
   * gets an offset (dx, dy) from where it is tied, so it still follows its line. */
  private curvePoints(idx = this.selectedStep): { k: number; ref: PointRef; s: Pt }[] {
    const s = this.model.steps[idx];
    if (!s || s.op !== "curve" || this.blockingForm()) return [];
    const n = s.through.length;
    return s.through.flatMap((ref, k) => {
      if (k === 0 || k === n - 1) return []; // the ends have the direction handles
      try {
        return [{ k, ref, s: this.toScreen(this.pointOf(ref)) }];
      } catch {
        return [];
      }
    });
  }

  private dragPoint: { step: number; mode: "xy" | "offset" | "on" | "slide"; base: Pt; cands?: number[] } | null = null;
  /** The curve point last dragged (curve id, index): its own fields show in the curve's values window. */
  private cpEdit: { ci: number | undefined; k: number } | null = null;
  private dragDim: number | null = null;

  /** The dimension whose line is under the pointer (screen px). */
  private dimAt(sx: number, sy: number): number | null {
    let best: { i: number; d: number } | null = null;
    for (const h of this.dimHits) {
      const d = closestOnPolyline(h.pts, [sx, sy]).d;
      if (d <= 10 && (!best || d < best.d)) best = { i: h.i, d };
    }
    return best?.i ?? null;
  }

  /** The offset that puts dimension s's line under the mouse (world mm). */
  private dimOffsetAt(s: Extract<Step, { op: "dim" }>, at: Pt): number | null {
    if (s.kind === "h" && s.a) return at[1] - this.pointOf(s.a)[1];
    if (s.kind === "v" && s.a) return at[0] - this.pointOf(s.a)[0];
    if (s.kind === "aligned" && s.a && s.b) {
      const A = this.pointOf(s.a), B = this.pointOf(s.b), L = dist(A, B) || 1;
      return (-(B[1] - A[1]) * (at[0] - A[0]) + (B[0] - A[0]) * (at[1] - A[1])) / L;
    }
    const id = s.kind === "length" ? s.obj : s.objs?.[0];
    const o = id !== undefined ? this.res.objects.get(id) : undefined;
    return o ? closestOnPolyline(o.pts, at).d * sideOf(o, at) : null;
  }

  /** Start dragging through-point k of the curve at step index ci. */
  /** The curve end handle under the pointer. */
  private handleHover: "start" | "end" | null = null;
  /** The point of the active curve under the pointer / being dragged (index in its list of points). */
  private cpHover: number | null = null;
  private cpDrag: number | null = null;

  private grabCurvePoint(ci: number, k: number, free = false): void {
    this.cpDrag = k;
    this.cpEdit = { ci: this.model.steps[ci] && (this.model.steps[ci] as { id?: number }).id, k };
    const curve = this.model.steps[ci] as Extract<Step, { op: "curve" }>;
    const ref = curve.through[k];
    const plain = (v: string) => /^-?\d+(\.\d+)?$/.test(v.trim());
    const si = ref.end ? -1 : this.model.steps.findIndex((t) => (t.op === "point" || t.op === "pointOffset" || t.op === "pointMove") && t.id === ref.obj);
    const st = this.model.steps[si];
    this.snapshot();
    // a point already moved along a line (an earlier drag): it goes on sliding on that line, its distance follows
    if (!free && st?.op === "pointMove" && st.slide && plain(st.dist)) return void (this.dragPoint = { step: si, mode: "slide", base: this.pointOf(st.from) });
    if (st?.op === "point" && plain(st.x) && plain(st.y)) return void (this.dragPoint = { step: si, mode: "xy", base: [0, 0] });
    // the lines a point lies on (made before step `before`): it slides along them
    const linesAt = (p: Pt, before: number) => [...this.res.objects.values()].filter((o) => o.kind === "line" && o.step < before && o.pts.length > 1 && closestOnPolyline(o.pts, p).d < 0.05).map((o) => o.id);
    if (st?.op === "pointOffset" && plain(st.dx) && plain(st.dy)) {
      // an offset (س / ص) made by an earlier drag from a point that lies on a line: from now on it slides on that line
      const b = this.pointOf(st.from), on = free ? [] : linesAt(b, si);
      if (on.length) {
        // it starts where it is now, brought onto the line
        const L = this.res.objects.get(on[0]) as { pts: Pt[] }, now = this.pointOf(ref);
        const d0 = closestOnPolyline(L.pts, now).s - closestOnPolyline(L.pts, b).s;
        this.model.steps[si] = { op: "pointMove", id: st.id, from: st.from, along: on[0], dist: String(Math.round(d0 * 10) / 10), slide: true };
        this.evaluate();
        return void (this.dragPoint = { step: si, mode: "slide", base: b, cands: on.length > 1 ? on : undefined });
      }
      return void (this.dragPoint = { step: si, mode: "offset", base: b });
    }
    // 0.9.189 (as GRAFIS): a point that sits on a line slides along that line; its distance follows
    const so = ref.end ? -1 : this.model.steps.findIndex((t) => t.op === "pointOn" && t.id === ref.obj);
    const sOn = this.model.steps[so];
    // (Alt: moved freely off the line, as before: an offset point tied to it)
    if (!free && sOn?.op === "pointOn" && plain(sOn.dist)) return void (this.dragPoint = { step: so, mode: "on", base: [0, 0] });
    const id = newId(this.model, "point");
    // 0.9.191 (as GRAFIS): a tied point that lies on a line (an intersection, a line end, a point at a formula
    // distance …) slides along that line, also on its extension: one value, how far it moved on the line.
    // On several lines, the one the drag goes along is taken once the pointer has moved a little.
    const at = this.pointOf(ref);
    const cands = free ? [] : linesAt(at, ci);
    if (cands.length) {
      this.model.steps.splice(ci, 0, { op: "pointMove", id, from: { ...ref }, along: cands[0], dist: "0", slide: true });
      curve.through[k] = { obj: id };
      this.selectedStep = ci + 1;
      this.evaluate();
      this.dragPoint = { step: ci, mode: "slide", base: at, cands: cands.length > 1 ? cands : undefined };
      return;
    }
    // tied point on no line (or Alt): put an offset point between it and the curve, just before the curve
    this.model.steps.splice(ci, 0, { op: "pointOffset", id, from: { ...ref }, dx: "0", dy: "0" });
    curve.through[k] = { obj: id };
    this.selectedStep = ci + 1;
    this.evaluate();
    this.dragPoint = { step: ci, mode: "offset", base: this.pointOf(ref) };
  }

  /** "Z9 الكتف=225" for a value field: the formula, the name of the single X / Z it is, its value. */
  private formulaText(expr: string, unit = ""): string {
    const e = expr.trim();
    if (!e) return "";
    let v: number;
    try {
      v = new Vars(withSize(this.model), undefined, this.res.z).eval(e);
    } catch {
      return `${e}=?`;
    }
    if (/^-?\d+(\.\d+)?$/.test(e)) return `${fmt(v)}${unit}`;
    const one = /^([XZ])0*(\d+)$/i.exec(e);
    const nm = one ? (one[1].toUpperCase() === "X" ? this.model.measurements : this.model.variables).find((m) => m.id === Number(one[2]))?.name : "";
    return `${e}${nm ? " \u2067" + nm + "\u2069" : ""}=${fmt(v)}${unit}`; // the name isolated: Arabic does not reorder the numbers
  }

  /** When a line or curve is selected: the formulas it is built on, written where they act (as GRAFIS):
   * at each end the formula of the point it starts / ends on, at the end of a line by angle its length,
   * at its start its angle, in the middle of a parallel its distance. */
  private formulaLabelsSvg(): string {
    const s = this.model.steps[this.selectedStep];
    if (!s || this.tool || (this.form && !this.form.title?.startsWith("تعديل"))) return "";
    const ids = createdIds(s), o = ids.length ? this.res.objects.get(ids[0]) : undefined;
    if (!o || o.kind !== "line" || o.pts.length < 2) return "";
    const out: string[] = [];
    const n = o.pts.length;
    const put = (at: Pt, toward: Pt, text: string, row = 0) => {
      if (!text) return;
      const a = this.toScreen(at), b = this.toScreen(toward);
      let dx = a[0] - b[0], dy = a[1] - b[1];
      const L = Math.hypot(dx, dy) || 1;
      (dx /= L), (dy /= L);
      const x = a[0] + dx * 14, y = a[1] + dy * 14 + 4 + row * 15;
      out.push(`<text class="formula-label" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${dx < -0.3 ? "end" : dx > 0.3 ? "start" : "middle"}" direction="ltr">\u2066${esc(text)}\u2069</text>`);
    };
    const pointText = (r?: PointRef): string => {
      if (!r || r.end !== undefined) return "";
      const t = this.model.steps.find((q) => "id" in q && q.id === r.obj);
      if (!t) return "";
      // 0.9.181: say what the number is — the distance along which line (and from which end), or the offset in x / y
      if (t.op === "pointOn") {
        const v = this.formulaText(t.dist, t.unit === "%" ? "%" : "");
        return v && `${this.model.names[t.on] ?? this.res.objects.get(t.on)?.name ?? ""} ${t.from === "end" ? "◂" : "▸"} ${v}`.trim();
      }
      if (t.op === "pointOffset") return [t.dx.trim() && `Δx ${this.formulaText(t.dx)}`, t.dy.trim() && `Δy ${this.formulaText(t.dy)}`].filter(Boolean).join(" · ");
      return "";
    };
    const start = o.pts[0], end = o.pts[n - 1], s1 = o.pts[1], e1 = o.pts[n - 2];
    if (s.op === "lineAngle") {
      put(start, s1, pointText(s.start));
      put(start, s1, `∠ ${this.formulaText(s.angle, "°")}`, pointText(s.start) ? 1 : 0);
      put(end, e1, this.formulaText(s.length));
    } else if (s.op === "line") {
      put(start, s1, pointText(s.p1));
      put(end, e1, pointText(s.p2));
    } else if (s.op === "curve") {
      const st = pointText(s.through[0]), en = pointText(s.through[s.through.length - 1]);
      put(start, s1, st);
      put(end, e1, en);
      // an end square / at an angle to a line: "∠ 90° L4"
      const relText = (a: string, rel?: number) => (rel !== undefined && a.trim() ? `∠ ${this.formulaText(a, "°")} ${this.model.names[rel] ?? ""}` : "");
      put(start, s1, relText(s.startAngle, s.startRel), st ? 1 : 0);
      put(end, e1, relText(s.endAngle, s.endRel), en ? 1 : 0);
    } else if (s.op === "parallel") {
      const m = o.pts[Math.floor(n / 2)];
      const a = this.toScreen(m);
      out.push(`<text class="formula-label" x="${a[0] + 6}" y="${a[1] - 8}" direction="ltr">\u2066${esc(this.formulaText(s.dist))}\u2069</text>`);
    }
    return out.join("");
  }

  // ---- curve bar (as GRAFIS, shown while a curve is selected): bind / unbind / delete a point, angle on a line
  curveMode: "add" | "bind" | "unbind" | "del" | "rel" | "dir" | "undir" | null = null;
  /** «Set direction»: the curve point picked; the next click gives its direction (as GRAFIS). */
  private dirPick: { k: number } | null = null;

  private selectedCurve(): Extract<Step, { op: "curve" }> | null {
    const s = this.model.steps[this.selectedStep];
    return s && s.op === "curve" && !this.tool && !this.blockingForm() ? s : null;
  }

  /** The selected step when it makes a line or curve (no tool open): its style can be set. */
  private selectedLineStep(): Step | null {
    const s = this.model.steps[this.selectedStep];
    if (!s || this.tool || this.blockingForm()) return null;
    return createdIds(s).some((id) => this.res.objects.get(id)?.kind === "line") ? s : null;
  }

  private styleKey(id: number): string {
    return `${this.model.parts?.[this.model.activePart ?? 0]?.no ?? 1}:${id}`;
  }

  lineStyle(id: number): { dash?: LineDash; color?: string } {
    return this.model.lineStyles?.[this.styleKey(id)] ?? {};
  }

  private setLineStyle(st: Step, patch: { dash?: LineDash; color?: string | null }): void {
    this.snapshot();
    const all = (this.model.lineStyles ??= {});
    for (const id of createdIds(st)) {
      if (this.res.objects.get(id)?.kind !== "line") continue;
      const k = this.styleKey(id), cur = { ...(all[k] ?? {}) };
      if (patch.dash) patch.dash === "solid" ? delete cur.dash : (cur.dash = patch.dash);
      if (patch.color !== undefined) patch.color ? (cur.color = patch.color) : delete cur.color;
      if (cur.dash || cur.color) all[k] = cur;
      else delete all[k];
    }
    this.changed();
  }

  private renderCurveBar(): void {
    const ls = this.selectedLineStep();
    const c = ls?.op === "curve" ? ls : null;
    let bar = document.querySelector(".curve-bar.obj-bar") as HTMLElement | null;
    if (!ls) {
      bar?.remove();
      this.curveMode = null;
      this.dirPick = null;
      return;
    }
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "curve-bar obj-bar";
      setupBar(bar);
      (document.querySelector(".canvas-wrap") as HTMLElement).append(bar);
      bar.addEventListener("mousedown", (e) => e.stopPropagation());
      bar.addEventListener("click", (e) => {
        const m = (e.target as HTMLElement).closest<HTMLElement>("[data-cm]")?.dataset.cm as typeof this.curveMode | "off";
        if (!m) return;
        this.curveMode = m === "off" || m === this.curveMode ? null : m;
        this.dirPick = null;
        this.render();
      });
      bar.addEventListener("change", (e) => {
        const t = e.target as HTMLInputElement, st = this.selectedLineStep();
        if (!st) return;
        if (t.dataset.dash) this.setLineStyle(st, { dash: t.value as LineDash });
        else if (t.dataset.color) this.setLineStyle(st, { color: t.value });
      });
      bar.addEventListener("click", (e) => {
        const st = this.selectedLineStep();
        if (st && (e.target as HTMLElement).closest("[data-nocolor]")) this.setLineStyle(st, { color: null });
        if (st && (e.target as HTMLElement).closest("[data-cedit]")) this.editStep(this.selectedStep);
      });
    }
    const first = createdIds(ls).find((id) => this.res.objects.get(id)?.kind === "line") as number, sty = this.lineStyle(first);
    const dashes: [LineDash, string][] = [["solid", "─── متصل"], ["dashed", "- - - متقطع"], ["dotted", "······ نقاط"], ["long", "── ── متقطع طويل"], ["shortlong", "── - ── قصير-طويل"], ["dashdot", "─ · ─ شرطة-نقطة"]];
    const styleCtl = `<select data-dash="1" title="نوع الخط · Line type">${dashes.map(([v, t]) => `<option value="${v}"${(sty.dash ?? "solid") === v ? " selected" : ""}>${t}</option>`).join("")}</select>` +
      `<input type="color" data-color="1" value="${sty.color ?? "#2fa4dd"}" title="لون الخط"/><button data-nocolor="1" title="اللون الافتراضي"${sty.color ? "" : " disabled"}>↺</button>`;
    if (!c) {
      this.curveMode = null;
      bar.innerHTML = BAR_CHROME + `<b>${esc(this.model.names[first] ?? "خط")}</b>${styleCtl}<span>رايت كليك للخروج</span>`;
      return;
    }
    const b = (m: string, icon: string, tip: string) => `<button data-cm="${m}" class="${this.curveMode === m ? "on" : ""}" title="${tip}">${icon}</button>`;
    const say: Record<string, string> = {
      add: "انقر على المنحنى حيث تريد نقطة جديدة (واسحبها مباشرة إن أردت) · كليك يمين للإنهاء",
      bind: "انقر نقطة أو طرف خط أو مكاناً على خط: يمر المنحنى به ويبقى مثبتاً عليه",
      unbind: "انقر نقطة مثبتة على المنحنى: تصير نقطة حرة في مكانها",
      del: "انقر نقطة داخل المنحنى لحذفها منه",
      rel: "انقر الخط الذي تُقاس منه زاوية طرف المنحنى (مثلاً 90° عمودي عليه)",
      dir: this.dirPick ? "حرّك الماوس: الخط المتقطع اتجاه المنحنى عند النقطة · انقر لتثبيته (Shift: بلا تقريب)" : "انقر أي نقطة على المنحنى أو أي مكان عليه لتحديد اتجاهه عندها",
      undir: "انقر نقطة على المنحنى لحذف الاتجاه المحدد عندها (يعود حراً)",
    };
    bar.title = "اسحب المقابض أو النقاط (نقطة على خط تنزلق عليه؛ Alt: حرة) · رايت كليك للخروج";
    bar.innerHTML = BAR_CHROME + `<b>${esc(this.model.names[c.id] ?? "منحنى")}</b>` +
      b("add", CB_ICON.add, "إضافة نقطة على المنحنى") + b("bind", CB_ICON.bind, "تثبيت نقطة على المنحنى · Bind point") + b("unbind", CB_ICON.unbind, "فك تثبيت نقطة · Unbind point") +
      b("del", CB_ICON.del, "حذف نقطة من المنحنى · Delete point") + b("rel", CB_ICON.rel, "زاوية الطرف على خط (90° أو 45° …)") +
      b("dir", CB_ICON.dir, "تحديد اتجاه المنحنى عند نقطة · Set direction") + b("undir", CB_ICON.undir, "حذف الاتجاه · Delete direction") +
      `<button data-cedit="1" title="كتابة قيم المنحنى: الاتجاهات والشدة">✎</button>` + styleCtl +
      // the hint only while an option is on: a shorter bar keeps clear of the values window
      (this.curveMode ? `<span>${say[this.curveMode]}</span>` : "");
  }

  /** Index of the step that makes object id, or -1. */
  private creatorOf(id: number): number {
    let i = -1;
    this.model.steps.forEach((st, k) => createdIds(st).includes(id) && (i = k));
    return i;
  }

  /** The curve must come after step k (it reads what k makes): move it there when nothing between
   * uses the curve. Returns the curve's index, or -1 when it cannot move. */
  private curveAfter(ci: number, k: number): number {
    if (k < ci) return ci;
    const c = this.model.steps[ci] as Extract<Step, { op: "curve" }>;
    for (let j = ci + 1; j <= k; j++) if (usedIds(this.model.steps[j]).includes(c.id)) return -1;
    this.model.steps.splice(ci, 1);
    this.model.steps.splice(k, 0, c);
    return k;
  }

  /** Where along the curve a point lies: the place in its list of points (inner points only). */
  private throughSlot(c: Extract<Step, { op: "curve" }>, at: Pt): number {
    const o = this.res.objects.get(c.id);
    if (!o) return c.through.length - 1;
    const sAt = closestOnPolyline(o.pts, at).s;
    let k = 1;
    for (let j = 1; j < c.through.length - 1; j++) {
      try {
        if (closestOnPolyline(o.pts, this.pointOf(c.through[j])).s < sAt) k = j + 1;
      } catch {
        /* keeps its place */
      }
    }
    return k;
  }

  private curveModeClick(sx: number, sy: number): void {
    const c = this.selectedCurve();
    if (!c) return;
    let ci = this.selectedStep;
    const throughAt = () => c.through.findIndex((r) => {
      try {
        return dist(this.toScreen(this.pointOf(r)), [sx, sy]) <= 10;
      } catch {
        return false;
      }
    });
    if (this.curveMode === "add") {
      const ci0 = this.curveAtScreen(sx, sy);
      if (ci0 !== ci) return this.toast("انقر على المنحنى نفسه");
      this.insertCurvePoint(ci, this.toWorld(sx, sy)); // and it can be dragged at once
      return;
    }
    if (this.curveMode === "bind") {
      const hp = this.hit("point", sx, sy);
      let ref: PointRef | null = hp?.kind === "point" && hp.ref.obj !== c.id && !c.through.some((r) => r.obj === hp.ref.obj && r.end === hp.ref.end) ? hp.ref : null;
      let line: { id: number; s: number } | null = null;
      if (!ref) {
        const nr = this.nearest(sx, sy), o = nr && nr.id !== c.id ? this.res.objects.get(nr.id) : undefined;
        if (o?.kind === "line") line = { id: o.id, s: closestOnPolyline(o.pts, nr!.at).s };
      }
      if (!ref && !line) return this.toast("انقر نقطة أو طرف خط أو خطاً آخر");
      this.snapshot();
      ci = this.curveAfter(ci, this.creatorOf(ref ? ref.obj : line!.id));
      if (ci < 0) {
        this.undoStack.pop();
        return this.toast("لا يمكن: هذا الخط مبني على المنحنى نفسه");
      }
      if (line) {
        // a point on that line where it was clicked, linked to the line (moves with it)
        const id = newId(this.model, "point");
        this.model.steps.splice(ci, 0, { op: "pointOn", id, on: line.id, dist: String(Math.round(line.s * 10) / 10), unit: "mm", from: "start" });
        ci++;
        ref = { obj: id };
      }
      this.evaluate();
      const slot = this.throughSlot(c, this.pointOf(ref!));
      c.through.splice(slot, 0, ref!);
      if (c.pointAngles) c.pointAngles.splice(slot, 0, "");
      this.selectedStep = ci;
      this.changed();
      this.toast("ثُبّتت النقطة: المنحنى يمر بها ويتبعها");
    } else if (this.curveMode === "unbind") {
      const k = throughAt();
      if (k < 0) return this.toast("انقر نقطة على المنحنى");
      const r = c.through[k], st = r.end === undefined ? this.model.steps[this.creatorOf(r.obj)] : undefined;
      if (st?.op === "point" && /^-?\d+(\.\d+)?$/.test(st.x.trim()) && /^-?\d+(\.\d+)?$/.test(st.y.trim())) return this.toast("هذه النقطة حرة أصلاً");
      const q = this.pointOf(r), id = newId(this.model, "point"), rd = (v: number) => String(Math.round(v * 10) / 10);
      this.snapshot();
      this.model.steps.splice(ci, 0, { op: "point", id, x: rd(q[0]), y: rd(q[1]) });
      c.through[k] = { obj: id };
      this.selectedStep = ci + 1;
      this.changed();
      this.toast("فُك التثبيت: النقطة حرة في مكانها، اسحبها كما تريد");
    } else if (this.curveMode === "del") {
      const k = throughAt();
      if (k <= 0 || k >= c.through.length - 1) return this.toast(k < 0 ? "انقر نقطة داخل المنحنى" : "طرفا المنحنى لا يُحذفان");
      this.snapshot();
      c.through.splice(k, 1);
      c.pointAngles?.splice(k, 1);
      this.changed();
      this.toast("حُذفت النقطة من المنحنى");
    } else if (this.curveMode === "dir") {
      if (!this.dirPick) {
        let k = throughAt();
        // 0.9.191 (as GRAFIS): any point lying on the curve, or any place on the curve itself, not only the
        // points the curve was drawn through: such a point becomes one of them (the curve keeps its shape there)
        if (k < 0) k = this.curvePointFor(ci, c, sx, sy);
        if (k < 0) return this.toast("انقر نقطة على المنحنى أو أي مكان عليه");
        this.dirPick = { k };
        return this.render();
      }
      const k = this.dirPick.k, at = this.pointOf(c.through[k]), w = this.toWorld(sx, sy);
      if (dist(at, w) * this.scale < 8) return this.toast("حرّك الماوس بعيداً عن النقطة لتحديد الاتجاه");
      const ang = this.dirAngle(at, w);
      this.snapshot();
      this.setCurveDir(c, k, String(ang));
      this.dirPick = null;
      this.changed();
      this.toast(`اتجاه المنحنى عند النقطة ${ang}° · انقر نقطة أخرى أو كليك يمين للخروج`);
    } else if (this.curveMode === "undir") {
      const k = throughAt();
      if (k < 0) return this.toast("انقر نقطة على المنحنى");
      const n = c.through.length, had = k === 0 ? c.startAngle.trim() : k === n - 1 ? c.endAngle.trim() : c.pointAngles?.[k]?.trim();
      if (!had) return this.toast("لا اتجاه محدد عند هذه النقطة");
      this.snapshot();
      this.setCurveDir(c, k, "");
      this.changed();
      this.toast("حُذف الاتجاه: المنحنى حر عند هذه النقطة");
    } else if (this.curveMode === "rel") {
      const nr = this.nearest(sx, sy), o = nr && nr.id !== c.id ? this.res.objects.get(nr.id) : undefined;
      if (o?.kind !== "line") return this.toast("انقر خطاً");
      const co = this.res.objects.get(c.id)!, a = co.pts[0], z = co.pts[co.pts.length - 1];
      const end = closestOnPolyline(o.pts, a).d <= closestOnPolyline(o.pts, z).d ? "start" : "end";
      const name = this.model.names[o.id] ?? "الخط";
      this.curveMode = null;
      const cur = end === "start" ? c.startAngle : c.endAngle, curRel = end === "start" ? c.startRel : c.endRel;
      this.openForm({
        title: `زاوية طرف المنحنى على ${name}`,
        fields: [
          { key: "end", label: "الطرف", value: end, options: [["start", "البداية"], ["end", "النهاية"]] },
          { key: "angle", label: `الزاوية من ${name} °`, value: curRel === o.id && cur.trim() ? cur : "90" },
        ],
        onOk: (v) => {
          this.snapshot();
          const ci2 = this.curveAfter(this.model.steps.indexOf(c), this.creatorOf(o.id));
          if (ci2 < 0) {
            this.undoStack.pop();
            return this.toast("لا يمكن: هذا الخط مبني على المنحنى نفسه");
          }
          if (v.end === "start") (c.startRel = o.id), (c.startAngle = v.angle);
          else (c.endRel = o.id), (c.endAngle = v.angle);
          this.selectedStep = ci2;
          this.changed();
          this.toast(`طرف المنحنى بزاوية ${v.angle}° على ${name}`);
        },
      });
    }
  }

  /** The open floating window on top (Visibility, libraries, Z assistant …) is closed, as by its ×.
   * True when one was closed (a right click anywhere does this first, as GRAFIS). */
  closeTopWindow(): boolean {
    const wins = [...document.querySelectorAll<HTMLElement>(".z-assistant")].filter((w) => w.getClientRects().length > 0);
    if (!wins.length) return false;
    const z = (w: HTMLElement) => Number(getComputedStyle(w).zIndex) || 0;
    const top = wins.reduce((a, b) => (z(b) >= z(a) ? b : a));
    const x = [...top.querySelectorAll<HTMLButtonElement>(".za-head button")].find((b) => b.textContent?.trim() === "×");
    if (x) x.click();
    else top.remove();
    return true;
  }

  /** The name of the element under the pointer (C1, L4 …): off, the user does not want it on the drawing. */
  nameTips = false;

  /** The curve under the screen point (the selected curve first), or -1. */
  private curveAtScreen(sx: number, sy: number): number {
    const at = this.toWorld(sx, sy), tol = 7 / this.scale;
    const near = (j: number) => {
      const t = this.model.steps[j];
      if (t?.op !== "curve") return false;
      const o = this.res.objects.get(t.id);
      return !!o && o.pts.length > 1 && closestOnPolyline(o.pts, at).d <= tol;
    };
    return near(this.selectedStep) ? this.selectedStep : -1;
  }

  /** Add a free point at `at` to the curve at step ci, in its place along the curve, and drag it. */
  /** For «set direction» at a place that is not yet one of the curve's points: a drawn point lying on the
   * curve is bound into it, else a point is put on the curve where it was clicked. Its index, or -1. */
  private curvePointFor(ci: number, c: Extract<Step, { op: "curve" }>, sx: number, sy: number): number {
    const co = this.res.objects.get(c.id);
    if (!co) return -1;
    const hp = this.hit("point", sx, sy);
    let ref: PointRef | null = null, spot = this.toWorld(sx, sy);
    if (hp?.kind === "point" && hp.ref.obj !== c.id) {
      try {
        const q = this.pointOf(hp.ref);
        if (closestOnPolyline(co.pts, q).d * this.scale <= 4) (ref = hp.ref), (spot = q);
      } catch {
        /* not resolvable: not taken */
      }
    }
    if (!ref && this.curveAtScreen(sx, sy) !== ci) return -1;
    this.snapshot();
    if (ref) {
      const kq = this.creatorOf(ref.obj), st = this.model.steps[kq];
      if (kq > ci && st && usedIds(st).every((id) => this.creatorOf(id) < ci)) {
        // a point made after the curve from what is before it (e.g. a free point): it moves before the curve
        this.model.steps.splice(kq, 1);
        this.model.steps.splice(ci, 0, st);
        ci++;
      } else {
        const k = this.curveAfter(ci, kq);
        // a point made from the curve itself (e.g. where a line crosses it) cannot hold it: a point at its place
        if (k < 0) ref = null;
        else ci = k;
      }
    }
    if (!ref) {
      const at = closestOnPolyline(co.pts, spot).pt, id = newId(this.model, "point");
      const r = (v: number) => String(Math.round(v * 10) / 10);
      this.model.steps.splice(ci, 0, { op: "point", id, x: r(at[0]), y: r(at[1]) });
      ci++;
      ref = { obj: id };
    }
    this.evaluate();
    const slot = this.throughSlot(c, this.pointOf(ref));
    c.through.splice(slot, 0, ref);
    if (c.pointAngles) c.pointAngles.splice(slot, 0, "");
    this.selectedStep = ci;
    this.evaluate();
    return slot;
  }

  private insertCurvePoint(ci: number, at: Pt): void {
    const curve = this.model.steps[ci] as Extract<Step, { op: "curve" }>;
    const o = this.res.objects.get(curve.id);
    if (!o) return;
    const sAt = closestOnPolyline(o.pts, at).s;
    let k = 1;
    for (let j = 1; j < curve.through.length - 1; j++) {
      try {
        if (closestOnPolyline(o.pts, this.pointOf(curve.through[j])).s < sAt) k = j + 1;
      } catch {
        /* a point that does not resolve keeps its place */
      }
    }
    this.snapshot();
    const id = newId(this.model, "point");
    const r = (v: number) => String(Math.round(v * 10) / 10);
    this.model.steps.splice(ci, 0, { op: "point", id, x: r(at[0]), y: r(at[1]) });
    curve.through.splice(k, 0, { obj: id });
    if (curve.pointAngles) curve.pointAngles.splice(k, 0, "");
    this.selectedStep = ci + 1;
    this.evaluate();
    this.dragPoint = { step: ci, mode: "xy", base: [0, 0] };
    this.cpDrag = k;
    this.toast("نقطة جديدة على المنحنى: اسحبها لضبط الشكل");
  }

  private handleAt(sx: number, sy: number) {
    return this.curveHandles().find((h) => Math.hypot(h.hs[0] - sx, h.hs[1] - sy) <= 9) ?? null;
  }

  /** Direction from a curve point towards the pointer, in whole degrees (Shift: tenths). */
  private dirAngle(at: Pt, w: Pt): number {
    const a = (Math.atan2(w[1] - at[1], w[0] - at[0]) * 180) / Math.PI;
    return this.shift ? Math.round(a * 10) / 10 : Math.round(a);
  }

  /** Set (or with "" free) the direction of a curve at its k-th point: the ends use the end angles. */
  private setCurveDir(c: Extract<Step, { op: "curve" }>, k: number, ang: string): void {
    const n = c.through.length;
    if (k === 0) (c.startAngle = ang), delete c.startRel;
    else if (k === n - 1) (c.endAngle = ang), delete c.endRel;
    else {
      c.pointAngles ??= c.through.map(() => "");
      while (c.pointAngles.length < n) c.pointAngles.push("");
      c.pointAngles[k] = ang;
      if (c.pointAngles.every((x) => !x.trim())) delete c.pointAngles;
    }
  }

  /** The direction being set (dashed tangent line through the point, with its angle) and the directions
   * already set at inner points of the selected curve (short dashed lines). */
  private curveDirSvg(): string {
    const c = this.selectedCurve();
    if (!c) return "";
    const out: string[] = [];
    const line = (at: Pt, deg: number, len: number, cls: string) => {
      const r = (deg * Math.PI) / 180, [x, y] = this.toScreen(at), dx = Math.cos(r), dy = Math.sin(r);
      const [x2, y2] = this.toScreen([at[0] + dx, at[1] + dy]), L = Math.hypot(x2 - x, y2 - y) || 1, ux = (x2 - x) / L, uy = (y2 - y) / L;
      return `<line class="${cls}" x1="${x - ux * len}" y1="${y - uy * len}" x2="${x + ux * len}" y2="${y + uy * len}"/>`;
    };
    c.pointAngles?.forEach((a, k) => {
      if (!a?.trim() || k === 0 || k === c.through.length - 1) return;
      try {
        const v = new Vars(withSize(this.model), undefined, this.res.z).eval(a);
        out.push(line(this.pointOf(c.through[k]), v, 28, "curve-dir"));
      } catch {
        /* a formula that does not work out: nothing drawn */
      }
    });
    if (this.dirPick && this.curveMode === "dir") {
      const at = this.pointOf(c.through[this.dirPick.k]), deg = this.dirAngle(at, this.mouse);
      out.push(line(at, deg, 2000, "curve-dir live"));
      const [x, y] = this.toScreen(this.mouse);
      out.push(`<text class="live-label" x="${x + 10}" y="${y - 10}" direction="ltr">\u2066${deg}°\u2069</text>`);
    }
    return out.join("");
  }

  private curveHandlesSvg(): string {
    const hs = this.curveHandles();
    // while curve handles show, the undo bar fades and lets clicks through (a handle may sit under it)
    document.querySelector(".hist-bar")?.classList.toggle("ghost", hs.length > 0);
    if (!hs.length) return "";
    const out: string[] = [];
    for (const h of hs) {
      // the handle under the pointer or being dragged stands out from the other one
      const hot = this.dragHandle ? this.dragHandle.end === h.end : this.handleHover === h.end;
      out.push(`<line x1="${h.es[0]}" y1="${h.es[1]}" x2="${h.hs[0]}" y2="${h.hs[1]}" stroke="${hot ? "#e53935" : "var(--text)"}"${hot ? "" : ' stroke-dasharray="4 3"'} stroke-width="${hot ? 2 : 1.3}"/>`);
      out.push(
        hot
          ? `<circle class="curve-handle hot" cx="${h.hs[0]}" cy="${h.hs[1]}" r="9" fill="rgba(229,57,53,.28)" stroke="#e53935" stroke-width="3"/><circle cx="${h.hs[0]}" cy="${h.hs[1]}" r="3.2" fill="#e53935"/>`
          : `<circle class="curve-handle" cx="${h.hs[0]}" cy="${h.hs[1]}" r="6.5" fill="none" stroke="#e53935" stroke-width="2"/><circle cx="${h.hs[0]}" cy="${h.hs[1]}" r="2.2" fill="#e53935"/>`,
      );
      out.push(`<circle cx="${h.es[0]}" cy="${h.es[1]}" r="4" fill="var(--live)"/>`);
      // the angle / strength shows only while that handle is dragged (as GRAFIS), not standing on the drawing
      if (this.dragHandle?.end === h.end) out.push(`<text class="live-label" x="${h.hs[0] + 9}" y="${h.hs[1] - 9}" direction="ltr">\u2066${h.deg}°${h.set ? "" : " (حر)"} · ${h.pct}%\u2069</text>`);
    }
    // the points the curve passes through: drag them to reshape the curve
    // a small dot on each; the square only on the point under the pointer or being dragged (as GRAFIS)
    for (const p of this.curvePoints())
      out.push(
        p.k === this.cpHover || p.k === this.cpDrag
          ? `<rect class="curve-pt" x="${p.s[0] - 5}" y="${p.s[1] - 5}" width="10" height="10" fill="var(--bg)" stroke="#2fa4dd" stroke-width="2"/>`
          : `<circle class="curve-dot" cx="${p.s[0]}" cy="${p.s[1]}" r="3" fill="#2fa4dd"/>`,
      );
    // a point sliding along its line shows its distance on that line (as GRAFIS)
    const dp = this.dragPoint, ts = dp?.mode === "on" || dp?.mode === "slide" ? this.model.steps[dp.step] : undefined;
    if (ts?.op === "pointOn" || ts?.op === "pointMove") {
      const o = this.res.objects.get(ts.id);
      if (o) {
        const [x, y] = this.toScreen(o.pts[0]);
        out.push(`<text class="live-label" x="${x + 10}" y="${y - 10}" direction="ltr">\u2066${ts.dist}${ts.op === "pointOn" && ts.unit === "%" ? "%" : " mm"}\u2069</text>`);
      }
    }
    // no standing length label on the curve (the length is in Info / the dimension tools)
    return out.join("");
  }

  /** Live preview: the result of the open tool in the live colour, plus for a line by
   * angle the dashed length circle and an angle/length label, and for a line between two
   * points a rubber band to the mouse. */
  private liveSvg(): string {
    const out: string[] = [];
    const scr = (p: Pt) => this.toScreen(p).map((v) => v.toFixed(1)).join(",");
    const label = (a: Pt, b: Pt, angle = true) => {
      const L = dist(a, b), deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      const [x, y] = this.toScreen(b);
      return `<text class="live-label" x="${x + 8}" y="${y - 8}" direction="ltr">\u2066${angle ? fmt(Math.round(deg * 10) / 10) + "° · " : ""}${fmt(Math.round(L * 10) / 10)} mm\u2069</text>`;
    };
    const objs = this.previewObjects();
    if (this.tool?.frame && this.picks.length === 1) {
      const [x1, y1] = this.toScreen(this.picks[0].at), [x2, y2] = this.toScreen(this.mouse);
      out.push(`<rect x="${Math.min(x1, x2)}" y="${Math.min(y1, y2)}" width="${Math.abs(x2 - x1)}" height="${Math.abs(y2 - y1)}" fill="rgba(229,57,53,.08)" stroke="#e53935" stroke-dasharray="5 3"/>`);
      const a = this.picks[0].at, b = this.mouse, X0 = Math.min(a[0], b[0]), X1 = Math.max(a[0], b[0]), Y0 = Math.min(a[1], b[1]), Y1 = Math.max(a[1], b[1]);
      for (const o of this.res.objects.values())
        if (["points", "lines", "all"].includes(this.tool.remove ?? "") && this.kindOk(o.id, this.tool.remove as "points" | "lines" | "all") && o.pts.every(([x, y]) => x >= X0 && x <= X1 && y >= Y0 && y <= Y1))
          out.push(o.kind === "point" ? `<circle cx="${this.toScreen(o.pts[0])[0]}" cy="${this.toScreen(o.pts[0])[1]}" r="5" fill="none" stroke="#e53935" stroke-width="2"/>` : `<polyline points="${o.pts.map((p) => this.toScreen(p).join(",")).join(" ")}" fill="none" stroke="#e53935" stroke-width="2.5"/>`);
    }
    if (this.currentPickKind() === "point" && this.ptMode !== "free") {
      const [sx, sy] = this.toScreen(this.mouse);
      const c = this.modeCandidate(this.mouse, sx, sy);
      if (c) {
        const [x, y] = this.toScreen(c.pt);
        out.push(`<circle cx="${x}" cy="${y}" r="5.5" fill="none" stroke="var(--live)" stroke-width="2"/>`);
      }
    }
    for (const o of objs) {
      if (o.kind === "point") {
        const [x, y] = this.toScreen(o.pts[0]);
        out.push(`<circle cx="${x}" cy="${y}" r="4.5" fill="none" stroke="var(--live)" stroke-width="2"/><circle cx="${x}" cy="${y}" r="2" fill="var(--live)"/>`);
      } else {
        out.push(`<polyline points="${o.pts.map(scr).join(" ")}" fill="none" stroke="var(--live)" stroke-width="2.2"/>`);
      }
    }
    const t = this.tool;
    const live = this.form?.live;
    if (t?.key === "lineAngle" && live?.from && objs[0]?.kind === "line") {
      const from = live.from, to = objs[0].pts[objs[0].pts.length - 1];
      const [x1, y1] = this.toScreen(from), [x2, y2] = this.toScreen(to);
      out.push(`<circle cx="${x1}" cy="${y1}" r="${Math.hypot(x2 - x1, y2 - y1).toFixed(1)}" fill="none" stroke="var(--muted)" stroke-dasharray="4 4"/>`);
      out.push(label(from, to));
    } else if (t?.key === "line" && this.picks.length === 1 && this.picks[0].kind === "point" && !this.form) {
      const from = this.pointOf(this.picks[0].ref);
      const to = this.hover?.kind === "point" ? this.pointOf(this.hover.ref) : this.mouse;
      if (!objs.length) out.push(`<polyline points="${scr(from)} ${scr(to)}" stroke="var(--live)" stroke-width="2" fill="none"/>`);
      out.push(label(from, to));
    } else if ((t?.key === "cornerRound" || t?.key === "cornerChamfer") && live?.from) {
      const [x, y] = this.toScreen(live.from);
      out.push(`<circle cx="${x}" cy="${y}" r="3" fill="var(--muted)"/>`);
    }
    for (const o of objs) if (o.kind === "line" && t?.key !== "lineAngle" && t?.key !== "line" && o.pts.length === 2) out.push(label(o.pts[0], o.pts[1], false));
    return out.join("");
  }

  private highlighted(): Set<number> {
    const ids = new Set<number>();
    for (const p of [...this.picks, ...this.extra]) {
      if (p.kind === "line") ids.add(p.obj);
      else if (p.kind === "point" && !p.ref.end && this.tool?.multi?.kind === "object") ids.add(p.ref.obj);
    }
    const s = this.model.steps[this.selectedStep];
    if (s) {
      for (const id of createdIds(s)) ids.add(id);
      if (s.op === "setLength" || s.op === "trim") ids.add(s.target);
      if (s.op === "mirror" || s.op === "scale") for (const it of s.items) ids.add(it.dst ?? it.src);
    }
    return ids;
  }

  private showPieces = true;

  private piecesSvg(): string {
    const out: string[] = [];
    const pts = (p: Pt[]) => p.map((q) => this.toScreen(q).map((v) => v.toFixed(1)).join(",")).join(" ");
    const grains: Pt[] = [];
    for (const s of this.model.steps) if (s.op === "mark" && s.kind === "grain" && s.a) try { grains.push(this.pointOf(s.a)); } catch { /* point gone */ }
    for (const pc of this.model.pieces ?? []) {
      const g = this.res.pieces.get(pc.id);
      if (!g) continue;
      out.push(this.pieceSvg(g, pts, false));
      const c = this.toScreen(g.centre);
      out.push(`<text class="piece-label" x="${c[0] + 8}" y="${c[1]}">${esc(pc.name)} (${pc.quantity})</text>`);
      // a grain line drawn with the grain tool inside the piece replaces the automatic one
      if (grains.some((p) => insidePoly(p, g.sew))) continue;
      const [a, b] = g.grain.map((q) => this.toScreen(q));
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const head = (p: Pt, dir: number) =>
        `<polyline points="${[dir + 2.6, dir - 2.6].map((t) => [p[0] + 10 * Math.cos(t), p[1] + 10 * Math.sin(t)].join(",")).join(` ${p.join(",")} `)}" fill="none" stroke="var(--piece)" stroke-width="1.4"/>`;
      out.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="var(--piece)" stroke-width="1.4"/>`);
      out.push(head(b, ang), head(a, ang + Math.PI));
    }
    return out.join("");
  }

  /** One piece as GRAFIS draws it: cut line in blue, sewing line, red notches; a folded piece shows
   * its sewing line on the drawn half only, the fold line dash-dotted and the cut line opened out. */
  private pieceSvg(g: PieceGeo, pts: (p: Pt[]) => string, ghost: boolean): string {
    const cls = ghost ? ' class="ghost-piece"' : "";
    const out = [`<polygon${cls} points="${pts(g.cut)}" fill="var(--piece-fill)" stroke="var(--piece-cut)" stroke-width="${ghost ? 1.6 : 2}"/>`];
    out.push(`<polygon${cls} points="${pts(g.fold ? g.fold.halfSew : g.sew)}" fill="none" stroke="var(--piece-sew)" stroke-width="${ghost ? 1 : 1.3}"/>`);
    if (g.fold) out.push(`<polyline${cls} points="${pts(g.fold.line)}" fill="none" stroke="var(--piece-cut)" stroke-width="1.3" stroke-dasharray="14 4 2 4"/>`);
    for (const n of g.notches) for (const sh of n.shape) out.push(`<polyline${cls} points="${pts(sh)}" fill="none" stroke="var(--piece-notch)" stroke-width="${ghost ? 1.8 : 2.2}"/>`);
    return out.join("");
  }

  private pieceItems() {
    return (this.model.pieces ?? []).flatMap((piece) => {
      const geo = this.res.pieces.get(piece.id);
      return geo ? [{ piece, geo }] : [];
    });
  }

  /** The object nearest to the pointer within NEAR_PX screen pixels and the closest point on it
   * (points win when they are as close as a line, so line ends stay easy to reach). */
  private nearest(sx: number, sy: number): { id: number; at: Pt } | null {
    if (this.shift) {
      // Shift: only points and line ends, from farther away; the dot sits exactly on the end
      let b: { id: number; at: Pt; d: number } | null = null;
      for (const o of this.res.objects.values())
        for (const q of o.kind === "point" ? [o.pts[0]] : [o.pts[0], o.pts[o.pts.length - 1]]) {
          const d = dist(this.toScreen(q), [sx, sy]);
          if (d <= SHIFT_SNAP_PX && (!b || d < b.d)) b = { id: o.id, at: q, d };
        }
      return b && { id: b.id, at: b.at };
    }
    const lim = NEAR_PX / this.scale;
    let best: { id: number; at: Pt; d: number } | null = null;
    for (const o of this.res.objects.values()) {
      if (o.kind === "point" && !this.vis.points) continue;
      const c = o.kind === "point" ? { pt: o.pts[0], d: dist(o.pts[0], this.mouse) } : closestOnPolyline(o.pts, this.mouse);
      const d = o.kind === "point" ? c.d - 4 / this.scale : c.d;
      if (d <= lim && (!best || d < best.d)) best = { id: o.id, at: c.pt, d };
    }
    return best && { id: best.id, at: best.at };
  }

  /** The near-pointer mark: the object glows, its nearest point gets a dot (as GRAFIS). */
  private nearSvg(n: { id: number; at: Pt }): string {
    const o = this.res.objects.get(n.id);
    if (!o) return "";
    const [x, y] = this.toScreen(n.at);
    const glow = o.kind === "line" ? `<polyline class="near-glow" points="${o.pts.map((q) => this.toScreen(q).map((v) => v.toFixed(1)).join(",")).join(" ")}" fill="none"/>` : `<circle class="near-glow" cx="${x}" cy="${y}" r="7" fill="none"/>`;
    return `${glow}<circle class="near-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"/>`;
  }

  private markSvg(p: Pick, color: string): string {
    if (p.kind === "line") {
      const o = this.res.objects.get(p.obj);
      if (!o) return "";
      const pts = o.pts.map((q) => this.toScreen(q).join(",")).join(" ");
      return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="3.5" opacity="0.8"/>`;
    }
    const [x, y] = this.toScreen(p.kind === "point" ? this.pointOf(p.ref) : p.at);
    return `<circle cx="${x}" cy="${y}" r="8" fill="none" stroke="${color}" stroke-width="2.4"/><circle cx="${x}" cy="${y}" r="2.6" fill="${color}"/>`;
  }

  private gridSvg(w: number, h: number): string {
    // pick a grid step that is 15-150 px on screen
    let step = 1;
    for (const s of [1, 5, 10, 50, 100, 500, 1000]) {
      step = s;
      if (s * this.scale >= 15) break;
    }
    const [x0, y1] = this.toWorld(0, 0);
    const [x1, y0] = this.toWorld(w, h);
    const out: string[] = [];
    const major = step * 10;
    // 0.9.119: no grid squares on the drawing (user request); only the origin cross.
    if (!this.showGrid) {
      const [ox, oy] = this.toScreen([0, 0]);
      return `<line x1="${ox - 8}" y1="${oy}" x2="${ox + 8}" y2="${oy}" stroke="#9aa3ad"/><line x1="${ox}" y1="${oy - 8}" x2="${ox}" y2="${oy + 8}" stroke="#9aa3ad"/>`;
    }
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
      const sx = this.toScreen([x, 0])[0].toFixed(1);
      const c = Math.abs(x % major) < 1e-9 ? "var(--grid-major)" : "var(--grid)";
      out.push(`<line x1="${sx}" y1="0" x2="${sx}" y2="${h}" stroke="${c}"/>`);
    }
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
      const sy = this.toScreen([0, y])[1].toFixed(1);
      const c = Math.abs(y % major) < 1e-9 ? "var(--grid-major)" : "var(--grid)";
      out.push(`<line x1="0" y1="${sy}" x2="${w}" y2="${sy}" stroke="${c}"/>`);
    }
    const [ox, oy] = this.toScreen([0, 0]);
    out.push(`<line x1="${ox - 8}" y1="${oy}" x2="${ox + 8}" y2="${oy}" stroke="#9aa3ad"/>`);
    out.push(`<line x1="${ox}" y1="${oy - 8}" x2="${ox}" y2="${oy + 8}" stroke="#9aa3ad"/>`);
    return out.join("");
  }

  // ------------------------------------------------------------ picking
  private pointOf(r: PointRef): Pt {
    const o = this.res.objects.get(r.obj);
    if (!o) return [0, 0];
    if (o.kind === "point" || !r.end) return o.pts[0];
    return r.end === "end" ? o.pts[o.pts.length - 1] : o.pts[0];
  }

  /** What would be picked at screen position (sx, sy) for this kind of pick. */
  private hit(kind: PickKind, sx: number, sy: number): Hover {
    const w = this.toWorld(sx, sy);
    const near = (p: Pt) => dist(this.toScreen(p), [sx, sy]);
    if (kind === "canvas") return { kind: "canvas", at: w };

    if (kind === "point" || kind === "object") {
      let best: { d: number; ref: PointRef } | null = null;
      for (const o of this.res.objects.values()) {
        const cands: PointRef[] = o.kind === "point" ? [{ obj: o.id }] : kind === "point" ? [{ obj: o.id, end: "start" }, { obj: o.id, end: "end" }] : [];
        for (const ref of cands) {
          const d = near(this.pointOf(ref));
          if (d <= (kind === "point" ? (this.shift ? SHIFT_SNAP_PX : SNAP_PX) : PICK_PX) && (!best || d < best.d)) best = { d, ref };
        }
      }
      if (best) return { kind: "point", ref: best.ref, at: w };
      if (kind === "point") return null;
    }
    let bestLine: { d: number; id: number } | null = null;
    for (const o of this.res.objects.values()) {
      if (o.kind !== "line") continue;
      const c = closestOnPolyline(o.pts, w);
      const d = c.d * this.scale;
      if (d <= PICK_PX && (!bestLine || d < bestLine.d)) bestLine = { d, id: o.id };
    }
    return bestLine ? { kind: "line", obj: bestLine.id, at: w } : null;
  }

  private currentPickKind(): PickKind | null {
    if (!this.tool || this.form) return null;
    if (this.collecting) return this.tool.multi?.kind ?? null;
    return this.tool.picks[this.picks.length]?.kind ?? null;
  }

  // ------------------------------------------------------------ tools
  private buildTools(): void {
    const box = $("#tools");
    const groups = [...new Set(TOOLS.map((t) => t.group))];
    box.innerHTML = groups
      .map(
        (g) =>
          `<h3>${g}</h3>` +
          TOOLS.filter((t) => t.group === g)
            .map((t) => `<button data-tool="${t.key}">${t.name}${t.shortcut ? `<span class="key">${t.shortcut}</span>` : ""}</button>`)
            .join(""),
      )
      .join("");
    box.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button[data-tool]") as HTMLElement | null;
      if (!b) return;
      const t = TOOLS.find((x) => x.key === b.dataset.tool) as Tool;
      if (this.tool === t) this.cancelTool();
      else this.selectTool(t);
    });
  }

  selectTool(t: Tool): void {
    if (/^mirror/.test(t.key)) {
      // the mirror bar starts in copy mode for «نسخة» tools, move for «نقل»
      this.selCopy = t.key !== "mirrorMove";
      this.selFrame = null;
    }
    if (t.action) {
      this.cancelTool();
      if (t.key === "inheritBlock") this.openLibrary();
      else if (t.key === "saveBlock") this.saveBlock();
      else if (t.key === "inheritObjects") this.startInheritPick();
      else if (t.key === "seamAllowance") this.startSeamTool();
      else this.openInherit(t.key === "inheritPart");
      return;
    }
    // a notch goes on a piece: without one, the piece is made first (then the notch tool comes back)
    if (t.key === "notch" && !this.model.pieces?.length) return this.needPiece("notch");
    this.cancelTool();
    this.tool = t;
    this.selectedStep = -1;
    document.querySelectorAll("#tools button").forEach((b) => b.classList.toggle("active", (b as HTMLElement).dataset.tool === t.key));
    this.collecting = !t.picks.length && !!t.multi;
    this.updatePrompt();
    this.renderSteps();
    this.render();
    this.svg.focus();
  }

  /** The tool to come back to once the piece is made («قطعة من الحدود»), when it was chosen with no piece. */
  private afterPiece: "seam" | "notch" | null = null;

  /** Seam allowance and notches belong to a piece (its outline): with none in this part yet, the piece
   * tool starts and the chosen tool comes back when the piece is made. */
  private needPiece(next: "seam" | "notch"): void {
    const piece = TOOLS.find((x) => x.key === "piece");
    if (!piece) return;
    this.selectTool(piece);
    this.afterPiece = next;
    this.toast(`${next === "seam" ? "مسافة الخياطة" : "النوتش"} تكون على قطعة، وهذا البارت لا قطعة فيه بعد: انقر حدود القطعة بالترتيب حولها ثم Enter، وبعدها ${next === "seam" ? "يُفتح شريط مسافة الخياطة" : "تعود أداة النوتش"}`);
  }

  cancelTool(): void {
    this.imgEdit = null;
    this.imgDrag = null;
    this.dirPick = null;
    this.selFrame = null;
    this.cutCornerPick = null;
    this.afterPiece = null;
    this.endInheritPick();
    this.endSeamTool();
    this.curveMode = null;
    this.instantValues = null;
    if (this.tool) this.resetPointPanel();
    this.tool = null;
    this.picks = [];
    this.extra = [];
    this.collecting = false;
    this.hover = null;
    this.closeForm();
    document.querySelectorAll("#tools button").forEach((b) => b.classList.remove("active"));
    this.updatePrompt();
    this.render();
  }

  private restartTool(): void {
    const t = this.tool;
    this.instantValues = null;
    this.picks = [];
    this.extra = [];
    this.collecting = false;
    this.closeForm();
    this.tool = t;
    this.collecting = !!t && !t.picks.length && !!t.multi;
    this.updatePrompt();
  }

  private updatePrompt(): void {
    if (this.pointPanel) this.pointPanel.hidden = this.currentPickKind() !== "point";
    let text = "اختر أداة من القائمة. اسحب بالزر الأيمن للتحريك، والعجلة للتكبير.";
    if (this.tool) {
      if (this.form) text = `${this.tool.name}: أدخل القيم ثم Enter`;
      else if (this.collecting) text = `${this.tool.name}: ${this.tool.multi?.prompt} (${this.extra.length} محدد)`;
      else text = `${this.tool.name}: ${this.tool.picks[this.picks.length]?.prompt ?? ""}`;
      text += " — Esc للإلغاء";
    }
    $("#prompt").textContent = text;
    // inside LEVEL7 and MTM the line under the drawing is hidden: the current step goes to the tool card
    if (document.body.classList.contains("embedded") && window.parent !== window && text !== this.lastPrompt) {
      this.lastPrompt = text;
      window.parent.postMessage({ type: "l7:prompt", text: this.tool ? text.replace(/ — Esc للإلغاء$/, "") : "" }, "*");
    }
  }
  private lastPrompt = "";

  // ---- measurement library (X tables of every model, on this computer)
  private mlib(): MEntry[] {
    try {
      const v = JSON.parse(localStorage.getItem("level7.mlib") || "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  private setMLib(list: MEntry[]): boolean {
    try {
      localStorage.setItem("level7.mlib", JSON.stringify(list));
      return true;
    } catch {
      this.toast("تعذر حفظ مكتبة القياسات (مساحة التخزين ممتلئة)");
      return false;
    }
  }

  /** The library window: use a table in this design (a copy), save this design's table, update
   * an entry from this design (only on request), delete, export / import the library file. */
  openMLib(): void {
    document.querySelector(".mlib-win")?.remove();
    const el = document.createElement("section");
    el.className = "z-assistant marker-win mlib-win";
    el.dir = "rtl";
    const draw = () => {
      const lib = this.mlib(), from = this.model.mlibFrom;
      const day = (iso: string) => iso.slice(0, 10);
      el.innerHTML = `<div class="za-head"><b>📚 مكتبة القياسات · ${lib.length}</b><button data-ml="close">×</button></div>
        <div class="za-body">
          <p class="ml-note">${from ? `جدول هذا التصميم نسخة من «<b>${esc(from.name)}</b>». تعديلاتك عليه تُحفظ في ملف التصميم فقط، ولا تتغير المكتبة إلا بزر «تحديث المكتبة».` : "اختر جدولاً فتُنسخ قياساته ومقاساته إلى هذا التصميم. التعديل بعدها يكون في الملف فقط."}</p>
          <div class="ml-search"><input data-ml="q" placeholder="بحث باسم الموديل"/></div>
          <ul class="ml-list">${
            lib.length
              ? lib
                  .map(
                    (e) => `<li data-id="${esc(e.id)}"${from?.id === e.id ? ' class="cur"' : ""}><div><b>${esc(e.name)}</b><small dir="ltr">${e.measurements.length} X · ${(e.sizes?.length ?? 0) + 1} sizes · ${day(e.saved)}</small></div>
                <span><button class="primary" data-ml="use" title="نسخ هذا الجدول إلى التصميم (يستبدل قياسات X والمقاسات؛ Z والرسم لا يتغيران)">استخدام</button><button data-ml="edit" title="تعديل قياسات هذا المنتج داخل المكتبة (لا يغيّر التصميم المفتوح)">✎ تعديل</button><button data-ml="update" title="استبدال جدول المكتبة بجدول هذا التصميم">تحديث المكتبة</button><button class="danger" data-ml="del" title="حذف من المكتبة">×</button></span></li>`,
                  )
                  .join("")
              : `<li class="empty">المكتبة فارغة: احفظ جدول هذا التصميم فيها، أو استورد ملف مكتبة.</li>`
          }</ul>
          <div class="za-row ml-save"><span>حفظ جدول هذا التصميم باسم</span><input data-ml="name" value="${esc(from?.name ?? this.model.name)}"/><button class="primary" data-ml="save">＋ حفظ كجدول جديد</button></div>
          <div class="za-foot"><button class="primary" data-ml="new" title="منتج جديد في المكتبة: تكتب قياساته ومقاساته مباشرة">＋ منتج جديد</button><button data-ml="export">⤒ تصدير المكتبة (ملف)</button><button data-ml="import">⤓ استيراد مكتبة</button></div>
        </div>`;
    };
    draw();
    document.body.append(el);
    el.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.ml !== "q") return;
      const q = t.value.trim().toLowerCase();
      el.querySelectorAll<HTMLElement>(".ml-list li[data-id]").forEach((li) => (li.hidden = !!q && !(li.textContent ?? "").toLowerCase().includes(q)));
    });
    el.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-ml]");
      if (!b) return;
      const act = b.dataset.ml, id = b.closest<HTMLElement>("li[data-id]")?.dataset.id;
      const lib = this.mlib(), entry = lib.find((x) => x.id === id);
      if (act === "close") return el.remove();
      if (act === "new") return this.editMEntry(null);
      if (act === "edit" && entry) return this.editMEntry(entry.id);
      if (act === "use" && entry) {
        if (this.model.measurements.length && !confirm(`استبدال قياسات X والمقاسات في هذا التصميم بجدول «${entry.name}»؟\n(المعادلات Z والرسم لا يتغيران؛ يمكن التراجع بإعادة الاختيار)`)) return;
        this.syncPart();
        applyEntry(this.model, entry);
        this.changed();
        this.toast(`نُسخ جدول «${entry.name}»: ${entry.measurements.length} X و${(entry.sizes?.length ?? 0) + 1} مقاس`);
        return el.remove();
      }
      if (act === "update" && entry) {
        if (!confirm(`تحديث جدول المكتبة «${entry.name}» بقياسات هذا التصميم؟ الجدول القديم في المكتبة يُستبدل.`)) return;
        const k = lib.indexOf(entry);
        lib[k] = tableOf(this.model, entry.name, entry.id);
        if (this.setMLib(lib)) this.toast(`حُدّث «${entry.name}» في المكتبة`);
        return draw();
      }
      if (act === "del" && entry) {
        if (!confirm(`حذف «${entry.name}» من مكتبة القياسات؟ (التصاميم التي نُسخ إليها لا تتأثر)`)) return;
        this.setMLib(lib.filter((x) => x !== entry));
        return draw();
      }
      if (act === "save") {
        if (!this.model.measurements.length) return this.toast("جدول X فارغ");
        const name = (el.querySelector('[data-ml="name"]') as HTMLInputElement).value;
        const e2 = tableOf(this.model, name);
        if (lib.some((x) => x.name.trim() === e2.name) && !confirm(`يوجد في المكتبة جدول باسم «${e2.name}». حفظ جدول جديد بنفس الاسم؟ (لاستبدال القديم استخدم «تحديث المكتبة»)`)) return;
        if (this.setMLib([...lib, e2])) {
          this.model.mlibFrom = { id: e2.id, name: e2.name };
          this.changed();
          this.toast(`حُفظ «${e2.name}» في مكتبة القياسات`);
        }
        return draw();
      }
      if (act === "export") return download("LEVEL7 measurement library.json", libraryFile(lib), "application/json");
      if (act === "import") {
        if (document.body.classList.contains("embedded") && window.parent !== window) window.parent.postMessage({ type: "l7:open-json", purpose: "mlib" }, "*");
        else {
          const inp = document.createElement("input");
          inp.type = "file";
          inp.accept = ".json,application/json";
          inp.onchange = async () => inp.files?.[0] && this.importMLib(await inp.files[0].text());
          inp.click();
        }
      }
    });
  }

  /** Edit a library product (or a new one) in the library itself: name, base size, X rows
   * (number, name, base value) and one column per size. The open design is not touched. */
  editMEntry(id: string | null): void {
    document.querySelector(".mlib-edit")?.remove();
    const lib = this.mlib();
    const orig = id ? lib.find((x) => x.id === id) : undefined;
    const e: MEntry = orig ? JSON.parse(JSON.stringify(orig)) : { id: `m${Date.now().toString(36)}`, name: "", saved: new Date().toISOString(), size: "", measurements: [], sizes: [], grading: {} };
    e.sizes ??= [];
    const el = document.createElement("section");
    el.className = "z-assistant marker-win mlib-edit";
    el.dir = "rtl";
    const num = (v: string) => Number(normalizeFormula(v).trim());
    const draw = () => {
      const sz = e.sizes ?? [];
      el.innerHTML = `<div class="za-head"><b>${orig ? "تعديل منتج في المكتبة" : "منتج جديد في المكتبة"}</b><button data-me="close">×</button></div>
        <div class="za-body">
          <div class="za-row me-top"><span>اسم المنتج</span><input data-me="name" value="${esc(e.name)}" placeholder="مثل: ثوب سعودي كلاسيك"/><span>اسم المقاس الأساسي</span><input data-me="base" value="${esc(e.size ?? "")}" placeholder="الأساسي" lang="en" dir="ltr"/></div>
          <div class="me-table"><table class="grid"><thead><tr><th>X</th><th>القياس</th><th>${esc(e.size || "الأساسي")}</th>${sz
            .map((z, i) => `<th><input data-sn="${i}" value="${esc(z.name)}" lang="en" dir="ltr"/><button class="danger" data-me="delsize" data-i="${i}" title="حذف المقاس">×</button></th>`)
            .join("")}<th></th></tr></thead><tbody>${e.measurements
            .map(
              (m, r) => `<tr><td class="xid" dir="ltr">X${m.id}</td><td><input data-mn="${r}" value="${esc(m.name)}" placeholder="—"/></td><td><input class="num" data-mv="${r}" value="${m.value}" lang="en" dir="ltr"/></td>${sz
                .map((z, i) => `<td><input class="num" data-sv="${i}:${m.id}" value="${z.values[m.id] ?? ""}" placeholder="${m.value}" lang="en" dir="ltr"/></td>`)
                .join("")}<td><button class="danger" data-me="delrow" data-r="${r}" title="حذف القياس">×</button></td></tr>`,
            )
            .join("")}</tbody></table></div>
          <div class="table-actions"><button data-me="addrow">＋ قياس X</button><button data-me="addsize">＋ مقاس</button><button data-me="xlsx" title="رفع قياسات X والمقاسات من ملف إكسل (.xlsx) أو CSV إلى هذا المنتج (نفس شكل جدول X: X | Name | MTM | الأساسي | المقاسات)">⤓ استيراد Excel</button></div>
          <p class="ml-note">الخانة الفارغة في عمود مقاس تأخذ قيمة المقاس الأساسي. الحفظ يغيّر المكتبة فقط؛ التصاميم التي نُسخ إليها هذا المنتج لا تتغير.</p>
          <div class="za-foot"><button class="primary" data-me="save">✓ حفظ في المكتبة</button><button data-me="close">إلغاء</button></div>
        </div>`;
    };
    draw();
    document.body.append(el);
    el.addEventListener("input", (ev) => {
      const t = ev.target as HTMLInputElement, d = t.dataset;
      if (d.me === "name") e.name = t.value;
      else if (d.me === "base") e.size = t.value.trim() || undefined;
      else if (d.mn !== undefined) e.measurements[Number(d.mn)].name = t.value;
      else if (d.mv !== undefined && t.value.trim() !== "" && !Number.isNaN(num(t.value))) e.measurements[Number(d.mv)].value = num(t.value);
      else if (d.sn !== undefined) e.sizes![Number(d.sn)].name = t.value;
      else if (d.sv !== undefined) {
        const [i, xid] = d.sv.split(":").map(Number), z = e.sizes![i];
        if (t.value.trim() === "") delete z.values[xid];
        else if (!Number.isNaN(num(t.value))) z.values[xid] = num(t.value);
      }
    });
    el.addEventListener("click", (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-me]");
      if (!b) return;
      const act = b.dataset.me;
      if (act === "close" || act === "save") this.xImportTarget = null; // a cancelled file choice does not fill a closed editor later
      if (act === "close") return el.remove();
      if (act === "xlsx") {
        this.xImportTarget = { e, done: draw };
        if (document.body.classList.contains("embedded") && window.parent !== window) window.parent.postMessage({ type: "l7:open-table" }, "*");
        else {
          const inp = document.createElement("input");
          inp.type = "file";
          inp.accept = ".xlsx,.csv,.txt";
          inp.onchange = async () => {
            const file = inp.files?.[0];
            if (!file) return;
            if (/\.xlsx$/i.test(file.name)) await this.importXFile(file.name, { bytes: new Uint8Array(await file.arrayBuffer()) });
            else await this.importXFile(file.name, { text: await file.text() });
          };
          inp.click();
        }
        return;
      }
      if (act === "addrow") {
        const nid = e.measurements.reduce((a, m) => Math.max(a, m.id), 0) + 1;
        e.measurements.push({ id: nid, name: "", value: 0 });
        draw();
        el.querySelector<HTMLInputElement>(`[data-mn="${e.measurements.length - 1}"]`)?.focus();
      } else if (act === "addsize") {
        e.sizes!.push({ name: `S${e.sizes!.length + 1}`, step: e.sizes!.length + 1, values: {} });
        draw();
      } else if (act === "delrow" && confirm(`حذف X${e.measurements[Number(b.dataset.r)].id} من هذا المنتج؟`)) {
        e.measurements.splice(Number(b.dataset.r), 1);
        draw();
      } else if (act === "delsize" && confirm(`حذف المقاس «${e.sizes![Number(b.dataset.i)].name}» من هذا المنتج؟`)) {
        e.sizes!.splice(Number(b.dataset.i), 1);
        draw();
      } else if (act === "save") {
        if (!e.name.trim()) return this.toast("اكتب اسم المنتج");
        e.name = e.name.trim();
        e.saved = new Date().toISOString();
        const list = this.mlib(), k = list.findIndex((x) => x.id === e.id);
        if (k >= 0) list[k] = e;
        else list.push(e);
        if (!this.setMLib(list)) return;
        this.toast(`حُفظ «${e.name}» في المكتبة: ${e.measurements.length} X و${e.sizes!.length + 1} مقاس`);
        el.remove();
        if (document.querySelector(".mlib-win")) this.openMLib();
      }
    });
  }

  importMLib(text: string): void {
    try {
      const r = mergeLibrary(this.mlib(), text);
      if (this.setMLib(r.lib)) this.toast(`مكتبة القياسات: ${r.added} جديد، ${r.replaced} مُستبدَل`);
      if (document.querySelector(".mlib-win")) this.openMLib();
    } catch (e) {
      this.toast("تعذر استيراد المكتبة: " + (e as Error).message);
    }
  }

  /** Test run / grade (as GRAFIS): the current part or all parts, in the base size or every
   * active size; shows what fails. Nothing is changed. */
  runCheck(all: boolean, grade: boolean): void {
    this.syncPart();
    const r = checkParts(this.model, { all, grade });
    const title = `${grade ? "تدريج" : "تشغيل تجريبي"} ${all ? "كل البارتات" : "البارت الحالي"}`;
    document.querySelector(".check-win")?.remove();
    if (!r.failed && !r.warned) return this.toast(`✓ ${title}: ${r.parts} بارت × ${r.sizes} مقاس بلا أخطاء ولا تنبيهات`);
    const el = document.createElement("section");
    el.className = "z-assistant marker-win check-win";
    el.dir = "rtl";
    // errors first; then the warnings (0.9.184): places where the seam allowance cannot come out clean
    const rows = r.rows.filter((x) => x.errors.length || x.warnings.length);
    const head = [r.failed ? `${r.failed} من ${r.rows.length} فيها أخطاء` : "بلا أخطاء", r.warned ? `${r.rows.reduce((n, x) => n + x.warnings.length, 0)} تنبيه` : ""].filter(Boolean).join(" · ");
    const list = (x: (typeof rows)[number], ri: number, kind: "e" | "w") => {
      const items = kind === "e" ? x.errors : x.warnings;
      return items.slice(0, 8).map((e, ei) => `<li class="ck-go${kind === "w" ? " ck-warn" : ""}" data-r="${ri}" data-${kind}="${ei}" title="إظهار مكانه على الرسم">${kind === "w" ? "⚠ " : ""}${esc(e)}</li>`).join("") + (items.length > 8 ? `<li>… و${items.length - 8} غيرها</li>` : "");
    };
    el.innerHTML = `<div class="za-head"><b>${title}: ${head}</b><button data-ck="close">×</button></div><div class="za-body"><p class="ck-hint">انقر الخطأ أو التنبيه لترى مكانه على الرسم</p><ul class="mk-list">${rows
      .map((x, ri) => `<li><b>${esc(x.part)}</b> · <span dir="ltr">${esc(x.size)}</span><ul>${list(x, ri, "e")}${list(x, ri, "w")}</ul></li>`)
      .join("")}</ul></div>`;
    document.body.append(el);
    el.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-ck="close"]')) return el.remove();
      const go = t.closest<HTMLElement>(".ck-go");
      if (!go) return;
      el.querySelectorAll(".ck-go.on").forEach((x) => x.classList.remove("on"));
      go.classList.add("on");
      const row = rows[Number(go.dataset.r)];
      this.gotoError(row.k, row.sizeIndex, go.dataset.w !== undefined ? row.warnRefs[Number(go.dataset.w)] : row.refs[Number(go.dataset.e)]);
    });
  }

  /** Opened by the program around the engine: the Z table (set from main). */
  showPanel?: (tab: string) => void;
  private flash: Pt | null = null;
  /** Edges of a piece shown in red for a moment (a click on a piece error of the test run). */
  private flashIds = new Set<number>();
  private flashTimer = 0;

  /** Show where an error of the test run is: its part and size, the step on the drawing (or what it is
   * built on, when it could not be drawn), the piece, or the Z table. */
  gotoError(k: number, size: number, ref: { step: number } | { z: number } | { piece: number } | { at: Pt; step?: number } | undefined): void {
    if (this.model.parts?.length && k !== (this.model.activePart ?? 0)) this.switchPart(k);
    if ((this.model.activeSize ?? -1) !== size) this.setSize(size);
    if (!ref) return;
    if ("z" in ref) {
      this.showPanel?.("z");
      return this.toast(`Z${ref.z}: في جدول Z`);
    }
    let pts: Pt[] = [];
    this.flashIds = new Set<number>();
    if ("at" in ref) {
      // the exact place (a warning): the view centres on it; its curve is shown active when known
      const d = 25;
      pts = [[ref.at[0] - d, ref.at[1] - d], [ref.at[0] + d, ref.at[1] + d]];
      if (ref.step !== undefined && this.model.steps[ref.step]) {
        this.selectedStep = ref.step;
        this.renderSteps();
      }
    } else if ("piece" in ref) {
      const pc = this.model.pieces?.find((p) => p.id === ref.piece);
      const g = this.res.pieces.get(ref.piece);
      pts = g ? g.sew : (pc?.edges ?? []).flatMap((id) => this.res.objects.get(id)?.pts ?? []);
      // the piece's own edges light up in red: it is clear which lines the message is about
      this.flashIds = new Set(pc?.edges ?? []);
    } else {
      const st = this.model.steps[ref.step];
      if (!st) return;
      this.selectedStep = ref.step;
      const made = createdIds(st).filter((id) => this.res.objects.has(id) && !this.res.stepErrors.has(ref.step));
      const ids = made.length ? made : usedIds(st).filter((id) => this.res.objects.has(id));
      pts = ids.flatMap((id) => this.res.objects.get(id)!.pts);
      this.renderSteps();
    }
    if (!pts.length) return this.toast("لا يوجد على الرسم ما يُظهر مكان هذا الخطأ");
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const r = this.svg.getBoundingClientRect();
    this.cx = (x0 + x1) / 2;
    this.cy = (y0 + y1) / 2;
    // the place fills about half the drawing (not closer than the current zoom for a small place)
    const fit = Math.min((r.width * 0.5) / Math.max(x1 - x0, 1), (r.height * 0.5) / Math.max(y1 - y0, 1));
    this.scale = Math.min(200, Math.max(Math.min(this.scale, fit), fit));
    this.flash = [this.cx, this.cy];
    clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => ((this.flash = null), (this.flashIds = new Set()), this.render()), 2500);
    this.render();
  }

  /** Switch a size on / off (-1 = base). Not part of the drawing history. */
  setSizeActive(i: number, on: boolean): void {
    if (i < 0) this.model.baseOff = !on || undefined;
    else if (this.model.sizes?.[i]) this.model.sizes[i].off = !on || undefined;
    this.changed();
    this.toast(`${sizeName(this.model, i)}: ${on ? "مفعّل" : "غير مفعّل — لا يدخل في التعشيق والتصدير"}`);
  }

  /** Two lists beside a value field: one with the X measurements, one with the Z values
   * (not mixed). Choosing an entry hands its name (X3 / Z2) to onPick. */
  private refPicks(onPick: (ref: string) => void, compact = false): HTMLElement {
    const box = document.createElement("span");
    box.className = "ref-picks" + (compact ? " compact" : "");
    const make = (kind: "X" | "Z") => {
      const sel = document.createElement("select");
      sel.className = `ref-pick ref-${kind.toLowerCase()}`;
      sel.title = kind === "X" ? "اختر قياس X" : "اختر قيمة Z";
      sel.setAttribute("aria-label", sel.title);
      const fill = () => {
        const sized = withSize(this.model);
        const rows: [string, string][] =
          kind === "X"
            ? sized.measurements.map((m) => [`X${m.id}`, `X${m.id} = ${fmt(m.value)}${m.name ? " · " + m.name : ""}`])
            : this.model.variables.map((v) => {
                const val = this.res.z.get(v.id);
                return [`Z${v.id}`, `Z${v.id}${val !== undefined ? " = " + fmt(val) : ""}${v.name ? " · " + v.name : ""}`];
              });
        sel.innerHTML = `<option value="">${kind}</option>` + (rows.length ? rows.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("") : `<option value="" disabled>${kind === "X" ? "لا توجد قياسات X" : "لا توجد قيم Z"}</option>`);
      };
      fill();
      sel.addEventListener("focus", fill);
      sel.addEventListener("mousedown", fill);
      sel.addEventListener("change", () => {
        const ref = sel.value;
        sel.value = "";
        if (ref) onPick(ref);
      });
      return sel;
    };
    box.append(make("X"), make("Z"));
    return box;
  }

  // ---- point input panel (as GRAFIS): how a click makes the point a tool needs
  ptMode: "free" | "online" | "intersect" | "pct" | "mm" | "xy" = "free";
  ptPct = "50";
  ptMm = "100";
  ptDx = "0";
  ptDy = "0";
  ptRaster = (() => {
    try {
      const v = Number(localStorage.getItem("level7.ptRaster"));
      return [0.1, 1, 5, 10].includes(v) ? v : 1;
    } catch {
      return 1;
    }
  })();

  /** Where the point of the current mode would be for a click at `at` (no step made). */
  private modeCandidate(at: Pt, sx: number, sy: number): { pt: Pt; step: (id: number) => Step } | null {
    const lineHit = this.hit("line", sx, sy);
    const lineObj = lineHit?.kind === "line" ? this.res.objects.get(lineHit.obj) : undefined;
    const vars = new Vars(withSize(this.model), undefined, this.res.z);
    const num = (src: string) => {
      try {
        return vars.eval(src);
      } catch {
        return NaN;
      }
    };
    switch (this.ptMode) {
      case "online": {
        if (!lineObj) return null;
        const c = closestOnPolyline(lineObj.pts, at), d = String(Math.round(c.s * 10) / 10);
        return { pt: pointAlong(lineObj.pts, Number(d)), step: (id) => ({ op: "pointOn", id, on: lineObj.id, dist: d, unit: "mm", from: "start" }) };
      }
      case "pct":
      case "mm": {
        if (!lineObj) return null;
        const from = nearerEnd(lineObj, at), L = polyLen(lineObj.pts), raw = this.ptMode === "pct" ? this.ptPct : this.ptMm, v = num(raw);
        if (!Number.isFinite(v)) return null;
        const d = this.ptMode === "pct" ? (L * v) / 100 : v;
        return { pt: pointAlong(lineObj.pts, d, from === "end"), step: (id) => ({ op: "pointOn", id, on: lineObj.id, dist: raw, unit: this.ptMode === "pct" ? "%" : "mm", from }) };
      }
      case "intersect": {
        const tol = (PICK_PX * 2.5) / this.scale;
        const near = [...this.res.objects.values()].filter((o) => o.kind === "line" && closestOnPolyline(o.pts, at).d <= tol);
        let best: { pt: Pt; a: number; b: number; d: number } | null = null;
        for (let i = 0; i < near.length; i++)
          for (let j = i + 1; j < near.length; j++)
            for (const c of crossings(near[i].pts, near[j].pts)) {
              const d = dist(c.pt, at);
              if (d <= tol && (!best || d < best.d)) best = { pt: c.pt, a: near[i].id, b: near[j].id, d };
            }
        if (!best) return null;
        const b = best;
        return { pt: b.pt, step: (id) => ({ op: "intersect", id, a: b.a, b: b.b, near: [Math.round(b.pt[0] * 10) / 10, Math.round(b.pt[1] * 10) / 10] }) };
      }
      case "xy": {
        const h = this.hit("point", sx, sy);
        if (h?.kind !== "point") return null;
        const p = this.pointOf(h.ref), dx = num(this.ptDx), dy = num(this.ptDy);
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
        const dxs = this.ptDx, dys = this.ptDy;
        return { pt: [p[0] + dx, p[1] + dy], step: (id) => ({ op: "pointOffset", id, from: h.ref, dx: dxs, dy: dys }) };
      }
      default:
        return null;
    }
  }

  /** A click in a point mode: make that point as a linked step and return it as a pick. */
  private modePoint(at: Pt, sx: number, sy: number): Pick | null {
    const c = this.modeCandidate(at, sx, sy);
    if (!c) {
      this.toast(this.ptMode === "xy" ? "انقر على نقطة موجودة" : this.ptMode === "intersect" ? "انقر قرب تقاطع خطين" : "انقر على خط");
      return null;
    }
    this.snapshot();
    const id = newId(this.model, "point");
    this.model.steps.push(c.step(id));
    this.changed();
    this.autoPoint = id;
    return { kind: "point", ref: { obj: id }, at: c.pt };
  }

  /** Small floating panel shown while a tool waits for a point. */
  private buildPointPanel(): void {
    const wrap = document.querySelector(".canvas-wrap") as HTMLElement;
    const box = document.createElement("div");
    box.className = "pt-modes";
    box.hidden = true;
    box.innerHTML = `<div class="pt-head" title="اسحب لتحريك اللوحة">▼</div>
      <button data-pm="free" title="نقطة موجودة أو حرة بالنقر"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.6"/></svg></button>
      <button data-pm="online" title="نقطة على خط حيث تنقر"><svg viewBox="0 0 24 24"><path d="M4 16L20 8"/><circle cx="12" cy="12" r="2.2"/></svg></button>
      <button data-pm="intersect" title="نقطة تقاطع خطين"><svg viewBox="0 0 24 24"><path d="M5 5L19 19M19 5L5 19"/></svg></button>
      <label data-pm-row="pct"><button data-pm="pct" title="نقطة بنسبة من طول الخط، من الطرف الأقرب">%</button><input data-pv="ptPct" class="expr" value="${this.ptPct}"/></label>
      <label data-pm-row="mm"><button data-pm="mm" class="pt-mm" title="نقطة على الخط بمسافة من الطرف الأقرب">mm</button><input data-pv="ptMm" class="expr" value="${this.ptMm}"/></label>
      <label data-pm-row="xy" class="pt-xy"><button data-pm="xy" title="نقطة بإزاحة س/ص من نقطة موجودة"><svg viewBox="0 0 24 24"><path d="M6 4V18H20M6 4L3.5 7M6 4L8.5 7M20 18L17 15.5M20 18L17 20.5"/></svg></button><span><input data-pv="ptDx" class="expr" value="${this.ptDx}" title="إزاحة س"/><input data-pv="ptDy" class="expr" value="${this.ptDy}" title="إزاحة ص"/></span></label>
      <label class="pt-raster" title="خطوة تقريب النقطة الحرة (مم)"><svg viewBox="0 0 24 24"><path d="M4 20V8M8 20V12M12 20V8M16 20V12M20 20V8M3 20H21"/></svg><select data-raster>${[0.1, 1, 5, 10].map((v) => `<option value="${v}"${v === this.ptRaster ? " selected" : ""}>${v}</option>`).join("")}</select></label>`;
    wrap.append(box);
    try {
      const g = JSON.parse(localStorage.getItem("level7.pointPanel") || "null");
      if (g) Object.assign(box.style, { left: g.left, top: g.top, right: "auto" });
    } catch {}
    const mark = () => box.querySelectorAll<HTMLElement>("[data-pm]").forEach((b) => b.classList.toggle("on", b.dataset.pm === this.ptMode));
    mark();
    box.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("[data-pm]") as HTMLElement | null;
      if (!b) return;
      this.ptMode = b.dataset.pm as App["ptMode"];
      mark();
      this.updatePrompt();
      this.render();
    });
    // X / Z list beside every value of the panel (the value stays linked to the measurement)
    box.querySelectorAll<HTMLInputElement>("[data-pv]").forEach((inp) => {
      inp.after(this.refPicks((ref) => {
        inp.value = ref;
        inp.dispatchEvent(new Event("input"));
      }, true));
    });
    box.querySelectorAll<HTMLInputElement>("[data-pv]").forEach((inp) =>
      inp.addEventListener("input", () => {
        (this as unknown as Record<string, string>)[inp.dataset.pv as string] = inp.value.trim();
        const row = inp.closest("[data-pm-row]") as HTMLElement | null;
        if (row) (this.ptMode = row.dataset.pmRow as App["ptMode"]), mark();
      }),
    );
    (box.querySelector("[data-raster]") as HTMLSelectElement).addEventListener("change", (e) => {
      this.ptRaster = Number((e.target as HTMLSelectElement).value);
      try {
        localStorage.setItem("level7.ptRaster", String(this.ptRaster));
      } catch {}
    });
    const head = box.querySelector(".pt-head") as HTMLElement;
    head.addEventListener("pointerdown", (e) => {
      const r = box.getBoundingClientRect(), wr = wrap.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => Object.assign(box.style, { right: "auto", left: Math.max(0, ev.clientX - wr.left - dx) + "px", top: Math.max(0, ev.clientY - wr.top - dy) + "px" });
      const up = () => {
        head.removeEventListener("pointermove", move);
        head.removeEventListener("pointerup", up);
        try {
          localStorage.setItem("level7.pointPanel", JSON.stringify({ left: box.style.left, top: box.style.top }));
        } catch {}
      };
      head.addEventListener("pointermove", move);
      head.addEventListener("pointerup", up);
    });
    this.pointPanel = box;
  }

  private pointPanel: HTMLElement | null = null;

  /** After an operation is finished or the tool is closed, the point panel starts clean:
   * all values 0 and the plain point mode (•). The raster step is kept. */
  private resetPointPanel(): void {
    this.ptMode = "free";
    this.ptPct = this.ptMm = this.ptDx = this.ptDy = "0";
    const box = this.pointPanel;
    if (!box) return;
    box.querySelectorAll<HTMLInputElement>("[data-pv]").forEach((inp) => (inp.value = "0"));
    box.querySelectorAll<HTMLElement>("[data-pm]").forEach((b) => b.classList.toggle("on", b.dataset.pm === "free"));
  }

  // ---- back / forward arrows on the drawing (as Excel): ↶ with a list to go back several
  // steps; ↷ appears once something was undone
  private histBar: HTMLElement | null = null;

  private buildHistoryBar(): void {
    const wrap = document.querySelector(".canvas-wrap") as HTMLElement;
    const bar = document.createElement("div");
    bar.className = "hist-bar";
    bar.innerHTML = `<button data-h="undo" title="رجوع خطوة (Ctrl+Z)"><svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/></svg><b></b></button><button data-h="undo-list" class="hist-more" title="الرجوع عدة خطوات">▾</button>
      <button data-h="redo" title="إعادة خطوة (Ctrl+Y)"><svg viewBox="0 0 24 24"><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/></svg><b></b></button><button data-h="redo-list" class="hist-more" title="الإعادة عدة خطوات">▾</button>
      <div class="hist-menu" hidden></div>`;
    wrap.append(bar);

    const menu = bar.querySelector(".hist-menu") as HTMLElement;
    const many = (dir: "undo" | "redo", k: number) => {
      for (let n = 0; n < k; n++) dir === "undo" ? this.undo() : this.redo();
      menu.hidden = true;
    };
    bar.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-h], [data-hk]");
      if (!b) return;
      if (b.dataset.hk) return many(b.dataset.hdir as "undo" | "redo", Number(b.dataset.hk));
      const h = b.dataset.h;
      if (h === "undo") this.undo();
      else if (h === "redo") this.redo();
      else {
        const dir = h === "undo-list" ? "undo" : "redo";
        const stack = dir === "undo" ? this.undoStack : this.redoStack;
        if (!menu.hidden && menu.dataset.dir === dir) return void (menu.hidden = true);
        const n = Math.min(stack.length, 20);
        const items: string[] = [];
        for (let k = 1; k <= n; k++) {
          let steps = "";
          try {
            steps = String((JSON.parse(stack[stack.length - k]) as Model).steps.length);
          } catch {}
          items.push(`<button data-hk="${k}" data-hdir="${dir}">${dir === "undo" ? "رجوع" : "إعادة"} ${k} ${k === 1 ? "خطوة" : "خطوات"}<i>${steps ? `${steps} خطوة بناء` : ""}</i></button>`);
        }
        menu.innerHTML = items.join("");
        menu.dataset.dir = dir;
        menu.style.left = b.offsetLeft - 30 + "px";
        menu.hidden = false;
      }
    });
    document.addEventListener("pointerdown", (e) => {
      if (!menu.hidden && !(e.target as HTMLElement).closest(".hist-bar")) menu.hidden = true;
    });
    this.histBar = bar;
    this.updateHistoryBar();
  }

  private updateHistoryBar(): void {
    const bar = this.histBar;
    if (!bar) return;
    const cur = this.pack(), u = this.undoStack.filter((x) => x !== cur).length, r = this.redoStack.length; // drawing actions only
    (bar.querySelector('[data-h="undo"]') as HTMLButtonElement).disabled = !u;
    (bar.querySelector('[data-h="undo-list"]') as HTMLButtonElement).disabled = u < 2;
    (bar.querySelector('[data-h="undo"] b') as HTMLElement).textContent = u ? String(u) : "";
    // the forward arrow only appears after going back
    for (const sel of ['[data-h="redo"]', '[data-h="redo-list"]']) (bar.querySelector(sel) as HTMLElement).hidden = !r;
    (bar.querySelector('[data-h="redo"] b') as HTMLElement).textContent = r ? String(r) : "";
    (bar.querySelector(".hist-menu") as HTMLElement).hidden = true;
  }

  /** A click on empty space where a point is expected creates a free point there
   * (as in GRAFIS), so lines can be drawn on a blank page. */
  private freePointAt(at: Pt): Pick {
    const q = this.ptRaster > 0 ? this.ptRaster : 0.1;
    const x = Math.round(Math.round(at[0] / q) * q * 10) / 10, y = Math.round(Math.round(at[1] / q) * q * 10) / 10;
    this.snapshot();
    const id = newId(this.model, "point");
    this.model.steps.push({ op: "point", id, x: String(x), y: String(y) } as Step);
    this.changed();
    this.autoPoint = id;
    return { kind: "point", ref: { obj: id }, at: [x, y] };
  }

  private onPick(p: Pick): void {
    const t = this.tool;
    if (!t) return;
    if (this.collecting) {
      if (t.multi?.kind === "point") {
        const last = this.extra[this.extra.length - 1];
        if (!(last && JSON.stringify(last.kind === "point" && last.ref) === JSON.stringify(p.kind === "point" && p.ref))) this.extra.push(p);
      } else {
        const id = pickedId(p);
        if (id === null || (p.kind === "point" && p.ref.end)) return;
        if (t.instant && this.instantValues) {
          this.extra = [p];
          this.commit(this.instantValues);
          return;
        }
        const i = this.extra.findIndex((q) => pickedId(q) === id);
        if (i >= 0) this.extra.splice(i, 1);
        else this.extra.push(p);
      }
      this.updatePrompt();
      this.render();
      return;
    }
    this.picks.push(p);
    if (this.picks.length < t.picks.length) {
      this.updatePrompt();
      this.render();
      return;
    }
    if (t.multi && t.instant) {
      // mirror (as GRAFIS): the axis is set; first copy or move (and the axis angle), then each click
      // mirrors that element at once, until a right click
      const fields = t.fields?.({ model: this.model, res: this.res, picks: this.picks, extra: [] }) ?? [];
      const start = (v: Record<string, string>) => {
        this.instantValues = v;
        this.selFrame = null;
        this.collecting = true;
        this.updatePrompt();
        this.render();
      };
      if (fields.length) this.openForm({ title: t.name, fields, onOk: start });
      else start({});
      return;
    }
    if (t.multi) {
      this.collecting = true;
      this.updatePrompt();
      this.render();
      return;
    }
    this.finishPicks();
  }

  /** The values of an instant tool (mirror: copy / move, axis angle), chosen before the elements. */
  private instantValues: Record<string, string> | null = null;

  private finishPicks(): void {
    const t = this.tool as Tool;
    if (t.remove === "grain") {
      this.removeGrain(this.picks[0].at);
      this.restartTool();
      this.render();
      return;
    }
    if (t.remove && ["texts", "symbols", "stitches", "notches"].includes(t.remove)) {
      this.removeAnnotations(t.remove as "texts" | "symbols" | "stitches" | "notches", !!t.frame);
      this.restartTool();
      this.render();
      return;
    }
    if (t.remove) {
      const what = t.remove as "points" | "lines" | "all";
      const ids = t.frame ? this.inFrame(what) : this.extra.map((p) => pickedId(p)).filter((id): id is number => id !== null && this.kindOk(id, what));
      if (!ids.length) this.toast("لا يوجد ما يُحذف");
      else this.removeObjects(new Set(ids));
      this.restartTool();
      this.render();
      return;
    }
    if (t.multi && this.extra.length < t.multi.min) {
      this.toast(t.multi.kind === "point" ? `حدد ${t.multi.min} نقاط على الأقل` : "لم تحدد أي عنصر");
      return;
    }
    const ctx = { model: this.model, res: this.res, picks: this.picks, extra: this.extra };
    const fields = t.fields?.(ctx) ?? [];
    // a multi-pick whose fields are all optional (curve end directions) is created at once;
    // the values can be set later by double-clicking the result
    if (t.multi && fields.length && fields.every((f) => f.optional)) {
      this.commit(Object.fromEntries(fields.map((f) => [f.key, f.value])));
      return;
    }
    if (!fields.length) {
      this.commit({});
      return;
    }
    this.openForm({ title: t.name, fields, onOk: (v) => this.commit(v), live: this.liveFor(t) });
  }

  /** Live drawing: which field values the mouse position gives for the open tool. */
  private liveFor(t: Tool): FormState["live"] {
    // values from the mouse are rounded to a step that suits the zoom (about one pixel)
    const q = [0.1, 0.5, 1, 5, 10].find((v) => v * this.scale >= 1) ?? 10;
    const r1 = (x: number) => String(Math.round(Math.round(x / q) * q * 10) / 10);
    const pk = this.picks;
    const lineObj = (i: number) => (pk[i]?.kind === "line" ? this.res.objects.get((pk[i] as Extract<Pick, { kind: "line" }>).obj) : undefined);
    const ptOf = (i: number) => (pk[i]?.kind === "point" ? this.pointOf((pk[i] as Extract<Pick, { kind: "point" }>).ref) : undefined);
    switch (t.key) {
      case "lineAngle": {
        const from = ptOf(0);
        if (!from) return undefined;
        return {
          from,
          values: (at) => {
            const dx = at[0] - from[0], dy = at[1] - from[1];
            let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
            if (this.angleStep > 0) ang = Math.round(ang / this.angleStep) * this.angleStep;
            ang = Math.round(ang * 10) / 10;
            if (ang <= -180) ang += 360;
            const len = Math.hypot(dx, dy);
            const v: Record<string, string> = { angle: String(ang) };
            if (len > 0) v.length = r1(len);
            return v;
          },
        };
      }
      case "grainLine": {
        // as GRAFIS: the direction follows the mouse in 90° steps (Shift: any angle), the length its distance
        const from = ptOf(0);
        if (!from) return undefined;
        return {
          from,
          values: (at) => {
            const dx = at[0] - from[0], dy = at[1] - from[1];
            let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
            const q = this.shift ? 1 : 90;
            ang = Math.round(ang / q) * q;
            if (ang <= -180) ang += 360;
            const len = Math.hypot(dx, dy);
            const v: Record<string, string> = { angle: String(ang) };
            if (len > 0) v.length = r1(len);
            return v;
          },
        };
      }
      case "pointOn": {
        const o = lineObj(0);
        if (!o) return undefined;
        const L = polyLen(o.pts);
        return {
          values: (at, cur) => {
            let d = closestOnPolyline(o.pts, at).s;
            if (cur.from === "end") d = L - d;
            return { dist: cur.unit === "%" ? r1((d / L) * 100) : r1(d) };
          },
        };
      }
      case "pointMove": {
        const from = ptOf(0), o = lineObj(1);
        if (!from || !o) return undefined;
        const [ux, uy] = directionAt(o.pts, 0);
        return { values: (at) => ({ dist: r1((at[0] - from[0]) * ux + (at[1] - from[1]) * uy) }) };
      }
      case "parallel": {
        const o = lineObj(0);
        if (!o) return undefined;
        return { values: (at) => ({ dist: r1(closestOnPolyline(o.pts, at).d), side: String(sideOf(o, at)) }) };
      }
      case "parallelMany": {
        const p0 = this.extra[0], o = p0?.kind === "line" ? this.res.objects.get(p0.obj) : undefined;
        if (!o) return undefined;
        return { values: (at) => ({ dist: r1(closestOnPolyline(o.pts, at).d) }) };
      }
      case "setLength": {
        const o = lineObj(0);
        if (!o) return undefined;
        const L = polyLen(o.pts), end = o.pts[o.pts.length - 1], [ux, uy] = directionAt(o.pts, L);
        return {
          values: (at) => {
            const c = closestOnPolyline(o.pts, at);
            const len = c.s >= L - 1e-6 ? L + (at[0] - end[0]) * ux + (at[1] - end[1]) * uy : c.s;
            return len > 0 ? { length: r1(len) } : null;
          },
        };
      }
      case "dimAligned":
      case "dimH":
      case "dimV": {
        const A = ptOf(0), B = ptOf(1);
        if (!A || !B) return undefined;
        return {
          values: (at) => {
            if (t.key === "dimH") return { offset: r1(at[1] - A[1]) };
            if (t.key === "dimV") return { offset: r1(at[0] - A[0]) };
            const L = dist(A, B) || 1;
            return { offset: r1((-(B[1] - A[1]) * (at[0] - A[0]) + (B[0] - A[0]) * (at[1] - A[1])) / L) };
          },
        };
      }
      case "dimLength": {
        const o = lineObj(0);
        if (!o) return undefined;
        return { values: (at) => ({ offset: r1(closestOnPolyline(o.pts, at).d * sideOf(o, at)) }) };
      }
      case "cornerRound":
      case "cornerChamfer": {
        const a = lineObj(0), b = lineObj(1);
        if (!a || !b) return undefined;
        const pa = pk[0] as Extract<Pick, { kind: "line" }>, pb = pk[1] as Extract<Pick, { kind: "line" }>;
        const seg = (o: GObj, near: Pt): [Pt, Pt] => {
          const n = o.pts.length;
          return nearerEnd(o, near) === "end" ? [o.pts[n - 2], o.pts[n - 1]] : [o.pts[1], o.pts[0]];
        };
        const [qa, ea] = seg(a, pa.at), [qb, eb] = seg(b, pb.at);
        // a corner of the cut line (outer line): sized from that corner
        const X = this.cutCornerPick?.pick === pk[0] ? this.cutCornerPick.pt : lineIntersection(qa, ea, qb, eb);
        if (!X) return undefined;
        const va: Pt = [qa[0] - X[0], qa[1] - X[1]], vb: Pt = [qb[0] - X[0], qb[1] - X[1]];
        const theta = Math.acos(Math.max(-1, Math.min(1, (va[0] * vb[0] + va[1] * vb[1]) / (Math.hypot(...va) * Math.hypot(...vb) || 1))));
        return {
          from: X,
          values: (at) => {
            const d = dist(at, X);
            return { size: r1(t.key === "cornerRound" ? d * Math.tan(theta / 2) : d) };
          },
        };
      }
      default:
        return undefined;
    }
  }

  /** What the open tool would create or change: from the value box while it is open,
   * or from the element under the pointer before the last click. Drawn in the live colour. */
  private previewObjects(): GObj[] {
    const t = this.tool;
    if (!t?.build) return [];
    let picks = this.picks;
    let values: Record<string, string> | null = null;
    if (this.form) {
      values = {};
      $("#tool-box").querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-key]").forEach((el) => ((values as Record<string, string>)[el.dataset.key as string] = el.value.trim()));
    } else if (!t.multi && !this.collecting && this.hover && picks.length === t.picks.length - 1 && t.picks[picks.length].kind === this.hover.kind) {
      picks = [...picks, this.hover];
    } else if (!(this.collecting && t.multi?.kind === "point" && this.extra.length)) return [];
    try {
      const model = parseModel(JSON.stringify(this.model));
      let extra = this.extra;
      if (this.collecting && t.multi?.kind === "point") {
        // rubber curve: the points so far plus the mouse (or the point under it)
        let ref: PointRef;
        if (this.hover?.kind === "point") ref = this.hover.ref;
        else {
          const id = model.nextId++;
          model.steps.push({ op: "point", id, x: String(this.mouse[0]), y: String(this.mouse[1]) });
          ref = { obj: id };
        }
        extra = [...extra, { kind: "point", ref, at: this.mouse }];
      }
      const ctx = { model, res: this.res, picks, extra };
      if (!values) {
        values = {};
        for (const f of t.fields?.(ctx) ?? []) values[f.key] = f.value;
      }
      model.steps.push(t.build(ctx, values));
      const r = evaluateModel(model), last = model.steps.length - 1;
      if (r.stepErrors.has(last)) return [];
      return [...r.objects.values()].filter((o) => o.step === last);
    } catch {
      return [];
    }
  }

  /** Angle step for live drawing, in degrees (0 = free). */
  // remembered on this computer until changed (angle step of live lines, raster of free points)
  angleStep = (() => {
    try {
      const v = Number(localStorage.getItem("level7.angleStep"));
      return [0, 1, 5, 15, 45, 90].includes(v) && localStorage.getItem("level7.angleStep") !== null ? v : 1;
    } catch {
      return 1;
    }
  })();
  private autoPoint: number | null = null;

  private rightDown: { x: number; y: number } | null = null;

  /** Right click: confirm the open value box (or finish a multi-pick); with nothing
   * pending it ends the tool, so the next operation can be chosen. */
  private rightConfirm(): void {
    if (this.inheritPick) return void this.endInheritPick();
    if (this.seamTool) return void this.endSeamTool();
    if (this.tool?.instant && this.collecting && !this.form) return void this.cancelTool();
    if (this.form || (this.collecting && this.extra.length)) this.confirmStep();
    else if (this.tool && !this.picks.length) this.cancelTool();
    else if (this.curveMode) {
      this.curveMode = null;
      this.render();
    } else if (!this.tool && this.selectedStep >= 0) {
      // right click leaves the editing of the selected element (curve handles etc.)
      this.selectedStep = -1;
      this.render();
    }
  }

  /** Embedded mode: the ✓ of the step card (Enter). */
  confirmStep(): void {
    if (this.tool?.instant && this.collecting && !this.form) return void this.cancelTool();
    if (this.form) ($("#tool-box").querySelector("[data-ok]") as HTMLButtonElement | null)?.click();
    else if (this.collecting) this.finishPicks();
  }

  /** Embedded mode: the back arrow of the step card: undo the last pick of the tool. */
  backStep(): void {
    if (!this.tool) return;
    if (this.form) this.closeForm();
    else if (this.collecting && this.extra.length) this.extra.pop();
    else if (this.collecting) this.collecting = false;
    if (!this.collecting) {
      const p = this.picks.pop();
      // a point made by clicking empty space goes away with its pick
      const last = this.model.steps[this.model.steps.length - 1];
      if (p?.kind === "point" && last?.op === "point" && last.id === p.ref.obj && this.autoPoint === p.ref.obj) {
        const prev = this.undoStack.pop();
        if (prev) {
          this.model = unpackModel(prev, this.blobs, this.model);
          this.changed();
        }
        this.autoPoint = null;
      }
    }
    this.updatePrompt();
    this.render();
  }

  private commit(values: Record<string, string>): void {
    const t = this.tool as Tool;
    if ((t.key === "cornerRound" || t.key === "cornerChamfer" || t.key === "cornerSquare") && this.cutCornerPick && this.picks[0] === this.cutCornerPick.pick) {
      const cc = this.cutCornerPick, pc = this.model.pieces?.find((p) => p.id === cc.piece);
      this.cutCornerPick = null;
      if (pc && t.key === "cornerSquare") {
        this.snapshot();
        pc.cutCorners ??= {};
        pc.cutCorners[cc.key] = { kind: "square", size: "", on: Number(values.on) };
        this.changed();
        this.toast(`تنتهي زاوية خط القص بخط قائم على ${this.model.names[Number(values.on)] ?? "الحد"}`);
      } else if (pc) {
        this.snapshot();
        const size = (values.size ?? "").trim();
        pc.cutCorners ??= {};
        if (!size || size === "0") delete pc.cutCorners[cc.key];
        else pc.cutCorners[cc.key] = { kind: t.key === "cornerRound" ? "round" : "chamfer", size };
        this.changed();
        this.toast(size && size !== "0" ? (t.key === "cornerRound" ? "استدارت زاوية خط القص" : "قُطعت زاوية خط القص") : "عادت زاوية خط القص حادة");
      }
      this.restartTool();
      this.render();
      return;
    }
    if (t.key === "convertNotch") {
      // the notch nearest the click takes the chosen shape
      const at = this.picks[0]?.at;
      let best: { pc: number; k: number; d: number } | null = null;
      (this.model.pieces ?? []).forEach((pc, pi) => {
        const g = this.res.pieces.get(pc.id);
        g?.notches.forEach((n, k) => {
          const d = at ? dist(n.at, at) * this.scale : Infinity;
          if (d <= 25 && (!best || d < best.d)) best = { pc: pi, k, d };
        });
      });
      const b = best as { pc: number; k: number; d: number } | null;
      if (!b) this.toast("انقر قرب نوتش في قطعة");
      else {
        this.snapshot();
        const pc = (this.model.pieces ?? [])[b.pc];
        pc.notchTypes ??= [];
        while (pc.notchTypes.length < pc.notches.length) pc.notchTypes.push("slit");
        pc.notchTypes[b.k] = values.type as NotchType;
        this.changed();
        this.toast("تغيّر شكل النوتش");
      }
      this.restartTool();
      this.render();
      return;
    }
    this.snapshot();
    const ctx = { model: this.model, res: this.res, picks: this.picks, extra: this.extra };
    if (t.makePiece) {
      this.model.pieces ??= [];
      const id = this.model.pieces.reduce((a, p) => Math.max(a, p.id), 0) + 1;
      this.model.pieces.push({ id, ...t.makePiece(ctx, values) });
      this.changed();
      const err = this.res.pieceErrors.get(id);
      if (err) {
        // 0.9.187: a piece whose edges do not close is not made (it would stay as an error in the test run)
        this.model.pieces = this.model.pieces.filter((p) => p.id !== id);
        this.undoStack.pop();
        this.changed();
        this.toast(`لم تُنشأ القطعة: ${err}. انقر كل حدود القطعة حولها بالترتيب ثم Enter`);
        this.afterPiece = null;
        this.restartTool();
        this.render();
        return;
      }
      this.toast("أُنشئت القطعة. عدّل مسافة الخياطة لكل حد من صفحة «القطع»");
      const next = this.afterPiece;
      this.afterPiece = null;
      if (next && !err) {
        // back to the tool chosen before (seam allowance / notch)
        queueMicrotask(() => (next === "seam" ? this.startSeamTool() : this.selectTool(TOOLS.find((x) => x.key === "notch")!)));
      }
    } else if (t.addNotch) {
      const pick = this.picks[0];
      const at = pick.kind === "point" ? this.pointOf(pick.ref) : pick.at;
      let best: { id: number; d: number } | null = null;
      for (const [id, g] of this.res.pieces) {
        const d = closestOnPolyline([...g.sew, g.sew[0]], at).d;
        if (!best || d < best.d) best = { id, d };
      }
      const pc = best && this.model.pieces?.find((p) => p.id === best!.id);
      if (!pc || pick.kind !== "point") {
        this.undoStack.pop();
        this.toast("لا توجد قطعة لإضافة النوتش إليها");
      } else {
        const k = pc.notches.push(pick.ref) - 1;
        pc.notchTypes ??= [];
        while (pc.notchTypes.length < k) pc.notchTypes.push("slit");
        pc.notchTypes[k] = (values.type as NotchType) || "slit";
        pc.notchLen ??= [];
        while (pc.notchLen.length < k) pc.notchLen.push("");
        pc.notchLen[k] = (values.len ?? "").trim();
        this.changed();
        this.toast(`أُضيف نوتش إلى «${pc.name}»`);
      }
    } else if (t.makeVar) {
      const id = this.model.variables.reduce((a, v) => Math.max(a, v.id), 0) + 1;
      this.model.variables.push({ id, ...t.makeVar(ctx, values) });
      this.changed();
      const v = this.res.z.get(id);
      this.toast(`أُضيف Z${id}${v !== undefined ? ` = ${fmt(v)}` : ""} ويمكن استخدامه في المعادلات`);
    } else if (t.build) {
      let step: Step;
      try {
        step = t.build(ctx, values);
      } catch (e) {
        this.undoStack.pop();
        this.toast((e as Error).message);
        this.restartTool();
        return;
      }
      this.model.steps.push(step);
      if (step.op === "curve") this.selectedStep = this.model.steps.length - 1; // its end handles show at once
      this.changed();
      const err = this.res.stepErrors.get(this.model.steps.length - 1);
      if (err) this.toast(`تمت إضافة الخطوة لكن فيها خطأ: ${err}`);
      if (t.instant && this.instantValues && this.collecting) {
        // the axis stays: the next click mirrors the next element
        this.extra = [];
        if (!err) this.toast(this.instantValues.mode === "move" || t.key === "mirrorMove" ? "عُكس العنصر (نقل) · انقر التالي أو كليك يمين للإنهاء" : "نُسخ العنصر بالانعكاس · انقر التالي أو كليك يمين للإنهاء");
        this.updatePrompt();
        this.render();
        return;
      }
    }
    this.resetPointPanel();
    this.restartTool();
    this.render();
  }

  // ------------------------------------------------------------ form
  private openForm(f: FormState): void {
    this.form = f;
    const box = $("#tool-box");
    box.hidden = false;
    box.innerHTML =
      `<h4><span>${esc(f.title)}</span>${f.editOf !== undefined ? `<button type="button" class="form-min" title="تصغير / تكبير النافذة">${this.formMini ? "▢" : "▁"}</button>` : ""}</h4>` +
      f.fields
        .map((fl) =>
          fl.options
            ? `<label class="field"><span>${fl.label}</span><select data-key="${fl.key}">${fl.options
                .map(([v, l]) => `<option value="${v}"${v === fl.value ? " selected" : ""}>${l}</option>`)
                .join("")}</select></label>`
            : fl.text
              ? `<label class="field"><span>${fl.label}</span><input data-key="${fl.key}" value="${esc(fl.value)}"/></label>`
              : `<label class="field"><span>${fl.label}</span><input class="expr" data-key="${fl.key}" value="${esc(fl.value)}"/></label><div class="field"><span></span><div class="preview" data-preview="${fl.key}"></div></div>`,
        )
        .join("") +
      `<p class="hint">تقبل الحقول أرقاماً أو معادلات مثل Z6 أو X3/2+10</p>` +
      `<div class="buttons"><button class="primary" data-ok>موافق</button><button data-cancel>إلغاء</button></div>`;
    // fresh every time: measurements may be added or changed while the box is open
    const vars = { eval: (src: string) => new Vars(withSize(this.model), undefined, this.res.z).eval(src) };
    const optional = new Set(f.fields.filter((x) => x.optional).map((x) => x.key));
    const preview = (inp: HTMLInputElement) => {
      const out = box.querySelector(`[data-preview="${inp.dataset.key}"]`) as HTMLElement;
      if (!inp.value.trim() && optional.has(inp.dataset.key as string)) {
        out.textContent = "فارغ = حر";
        out.classList.remove("bad");
        inp.classList.remove("bad");
        return;
      }
      try {
        out.textContent = "= " + fmt(vars.eval(inp.value));
        out.classList.remove("bad");
        inp.classList.remove("bad");
      } catch (e) {
        out.textContent = (e as Error).message;
        out.classList.add("bad");
        inp.classList.add("bad");
      }
    };
    box.querySelectorAll<HTMLInputElement>("input.expr").forEach((inp) => {
      preview(inp);
      inp.addEventListener("input", () => preview(inp));
    });
    // X / Z list next to every formula field: pick a measurement or variable instead of typing it.
    this.refreshForm = () => box.querySelectorAll<HTMLInputElement>("input.expr").forEach((inp) => preview(inp));
    if (true) {
      box.querySelectorAll<HTMLInputElement>("input.expr").forEach((inp) => {
        inp.after(this.refPicks((ref) => {
          const cur = inp.value.trim();
          // a choice replaces the field; it is added only after an operator typed on purpose ("X3/2+")
          inp.value = /[-+*/(]\s*$/.test(cur) ? cur + ref : ref;
          inp.scrollLeft = 0;
          inp.dispatchEvent(new Event("input"));
          inp.focus();
        }));
      });
    }
    if (f.live) {
      const live = f.live;
      const step = document.createElement("label");
      if (this.tool?.key !== "lineAngle") step.hidden = true;
      step.className = "field";
      step.innerHTML = `<span>خطوة الزاوية</span><select data-angle-step>${[0, 1, 5, 15, 45, 90]
        .map((v) => `<option value="${v}"${v === this.angleStep ? " selected" : ""}>${v ? v + "°" : "حرة"}</option>`)
        .join("")}</select>`;
      box.querySelector(".hint")?.before(step);
      (step.querySelector("select") as HTMLSelectElement).addEventListener("change", (e) => {
        this.angleStep = Number((e.target as HTMLSelectElement).value);
        try {
          localStorage.setItem("level7.angleStep", String(this.angleStep));
        } catch {}
        live.follow?.(this.mouse);
      });
      const hint = box.querySelector(".hint") as HTMLElement;
      hint.textContent = "حرّك الماوس: النتيجة تتبعه والقيم تتحدث. اكتب قيمة لتثبيتها، ثم انقر على الرسم أو Enter.";
      const typed = new Set<string>();
      box.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-key]").forEach((el) => el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => typed.add(el.dataset.key as string)));
      live.follow = (at) => {
        const cur: Record<string, string> = {};
        box.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-key]").forEach((el) => (cur[el.dataset.key as string] = el.value));
        const v = live.values?.(at, cur);
        for (const [k, val] of Object.entries(v ?? {})) {
          if (typed.has(k)) continue;
          const el = box.querySelector(`[data-key="${k}"]`) as HTMLInputElement | HTMLSelectElement | null;
          if (!el) continue;
          el.value = val;
          if (el.classList.contains("expr")) preview(el as HTMLInputElement);
        }
        this.render();
      };
    }
    box.addEventListener("input", () => this.render());
    box.addEventListener("change", () => this.render());
    const ok = () => {
      const v: Record<string, string> = {};
      let bad = false;
      box.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-key]").forEach((el) => {
        v[el.dataset.key as string] = el.value.trim();
        if (el.classList.contains("bad")) bad = true;
      });
      if (bad) {
        this.toast("صحح القيم المعلّمة بالأحمر");
        return;
      }
      const cb = f.onOk;
      this.closeForm();
      cb(v);
    };
    box.querySelector("[data-ok]")?.addEventListener("click", ok);
    if (f.live) f.live.submit = ok;
    box.querySelector("[data-cancel]")?.addEventListener("click", () => (this.tool ? this.restartTool() : this.closeForm()));
    box.classList.toggle("mini", f.editOf !== undefined && this.formMini);
    box.querySelector(".form-min")?.addEventListener("click", (e) => {
      this.formMini = !this.formMini;
      try {
        localStorage.setItem("level7.formMini", this.formMini ? "1" : "0");
      } catch {}
      box.classList.toggle("mini", this.formMini);
      (e.currentTarget as HTMLElement).textContent = this.formMini ? "▢" : "▁";
    });
    box.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        ok();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.cancelTool();
      }
      e.stopPropagation();
    };
    (box.querySelector("input, select") as HTMLElement | null)?.focus();
    (box.querySelector("input") as HTMLInputElement | null)?.select();
    this.updatePrompt();
  }

  private refreshForm: (() => void) | null = null;

  /** After a change from the bar (dimension options, curve point bound / freed / deleted …), an open values
   * window of the same element shows the new values (its OK would otherwise bring the old ones back). */
  private refreshEditForm(): void {
    if (this.form?.editOf !== undefined && this.form.editOf === this.selectedStep) this.editStep(this.selectedStep, true);
  }

  /** An open window that is not the values window of the active element (that one leaves its bar,
   * handles and points usable). */
  private blockingForm(): boolean {
    return !!this.form && this.form.editOf !== this.selectedStep;
  }
  /** The values window: minimized to its title (remembered). */
  private formMini = (() => {
    try {
      return localStorage.getItem("level7.formMini") === "1";
    } catch {
      return false;
    }
  })();

  private closeForm(): void {
    this.form = null;
    this.refreshForm = null;
    const box = $("#tool-box");
    box.hidden = true;
    box.innerHTML = "";
  }

  // ------------------------------------------------------------ events
  private bindCanvas(): void {
    const svg = this.svg;
    svg.addEventListener("contextmenu", (e) => e.preventDefault());
    // double-click a line, curve or point: open its step with its values (angle, length, X/Z ...)
    svg.addEventListener("dblclick", (e) => {
      const r = svg.getBoundingClientRect();
      const th = this.textHits.find((h) => Math.hypot(h.s[0] - (e.clientX - r.left), h.s[1] - (e.clientY - r.top)) <= h.r);
      if (th && !this.tool) {
        this.editStep(th.i);
        return;
      }
      const dd = this.dimAt(e.clientX - r.left, e.clientY - r.top);
      if (dd !== null) {
        this.cancelTool();
        this.editStep(dd);
        return;
      }
      const hh = this.handleAt(e.clientX - r.left, e.clientY - r.top);
      if (hh) {
        const s = this.model.steps[hh.i] as Extract<Step, { op: "curve" }>;
        this.snapshot();
        if (hh.end === "start") (s.startAngle = ""), (s.startTension = "");
        else (s.endAngle = ""), (s.endTension = "");
        this.changed();
        this.toast("اتجاه طرف المنحنى صار حراً");
        return;
      }
      // 0.9.189 (as GRAFIS): a double-click on a piece's outer (cut) line opens the seam allowance bar
      // 0.9.191: also while a drawing tool is active (as GRAFIS, tools stay on while working): its clicks on the
      // cut line are dropped; the piece tools (seams, corners, notches …) keep their own clicks there
      // judged on the drawing as it was before the two clicks
      const pre = this.preDbl;
      this.preDbl = null;
      if ((pre || !this.tool) && !this.seamTool) {
        const w = this.toWorld(e.clientX - r.left, e.clientY - r.top), R = pre ? pre.res : this.res;
        const onCut = [...R.pieces.values()].some((g) => closestOnPolyline([...g.cut, g.cut[0]], w).d * this.scale <= 8);
        let lineD = Infinity;
        for (const o of R.objects.values()) {
          if (o.kind === "point" && !this.vis.points) continue;
          lineD = Math.min(lineD, (o.kind === "point" ? dist(o.pts[0], w) : closestOnPolyline(o.pts, w).d) * this.scale);
        }
        if (onCut && lineD > 4) {
          if (pre) {
            // what the tool's clicks did (a point made, a window, a line confirmed) is taken back
            this.cancelTool();
            this.model = unpackModel(pre.pack, this.blobs, this.model);
            this.undoStack.length = Math.min(this.undoStack.length, pre.undo);
            this.changed();
          }
          this.startSeamTool();
          return this.toast("مسافة الخياطة: اختر النوع والقيمة من الشريط ثم انقر حدود القطعة · كليك يمين للإنهاء");
        }
      }
      if (this.tool && !this.form && this.picks.length) this.backStep(); // undo the first click's pick
      // what glows under the pointer (the near mark) is what opens: a point beside the curve does not
      // take the double-click from the curve
      const nr = this.nearest(e.clientX - r.left, e.clientY - r.top);
      const h = nr ? null : this.hit("object", e.clientX - r.left, e.clientY - r.top);
      const id = nr ? nr.id : h && pickedId(h);
      if (id === null || id === undefined) return;
      let i = -1;
      this.model.steps.forEach((st, k) => {
        if (createdIds(st).includes(id)) i = k;
      });
      if (i < 0) return;
      this.cancelTool();
      const st = this.model.steps[i];
      if (st.op === "inherit") {
        this.selectedStep = i;
        this.render();
        return this.toast(`${this.model.names[id] ?? "هذا العنصر"} موروث من البارت ${String(st.part).padStart(3, "0")} ويتبعه: عدّله في ذلك البارت`);
      }
      if (st.op === "curve") {
        // a curve: its handles, points and bar show for dragging (as GRAFIS) together with its values window
        this.renderSteps();
        return this.editStep(i);
      }
      if (stepFields(st).length) this.editStep(i);
      else {
        this.selectedStep = i;
        this.renderSteps();
        this.render();
        this.toast(`الخطوة ${i + 1} ليس لها قيم للتعديل`);
      }
    });
    svg.addEventListener("mousedown", (e) => {
      svg.focus();
      if (e.button === 0 && e.detail === 1) this.preDbl = this.tool && DRAW_GROUPS.includes(this.tool.group) ? { pack: this.pack(), undo: this.undoStack.length, res: this.res } : null;
      if (this.zoomMode && (e.button === 0 || e.button === 2)) {
        const rz = svg.getBoundingClientRect();
        this.zoomAt(e.clientX - rz.left, e.clientY - rz.top, e.button === 0 ? 1.6 : 1 / 1.6);
        e.preventDefault();
        return;
      }
      if (e.button === 2) this.rightDown = { x: e.clientX, y: e.clientY };
      if (e.button === 1 || e.button === 2) {
        this.pan = { x: e.clientX, y: e.clientY, cx: this.cx, cy: this.cy };
        svg.classList.add("panning");
        e.preventDefault();
        return;
      }
      if (e.button === 0 && this.imgEdit !== null) {
        // a picture moved / resized by hand: every press counts (also a quick second one)
        const rr = svg.getBoundingClientRect();
        this.imgEditDown(e.clientX - rr.left, e.clientY - rr.top);
        e.preventDefault();
        return;
      }
      if (e.button !== 0 || e.detail >= 2) return; // the second click of a double-click edits (below)
      if (this.calibrating !== null) {
        const rr = svg.getBoundingClientRect();
        this.calibrateClick(this.toWorld(e.clientX - rr.left, e.clientY - rr.top));
        return;
      }
      if (this.seamTool) {
        const rr = svg.getBoundingClientRect();
        this.seamClick(e.clientX - rr.left, e.clientY - rr.top);
        e.preventDefault();
        return;
      }
      if (this.inheritPick) {
        this.inheritClick();
        e.preventDefault();
        return;
      }
      if (this.curveMode && this.selectedCurve()) {
        const rr = svg.getBoundingClientRect();
        this.curveModeClick(e.clientX - rr.left, e.clientY - rr.top);
        if (!this.dragPoint) this.refreshEditForm(); // (an added point being dragged refreshes on release)
        e.preventDefault();
        return;
      }
      {
        const r0 = svg.getBoundingClientRect(), hh = this.handleAt(e.clientX - r0.left, e.clientY - r0.top);
        if (hh) {
          this.snapshot();
          this.dragHandle = { i: hh.i, end: hh.end, flip: hh.flip };
          e.preventDefault();
          return;
        }
        const sx = e.clientX - r0.left, sy = e.clientY - r0.top;
        // drag a dimension closer to / farther from what it measures
        // with a tool open, a click is the tool's pick (a dimension under the pointer is not dragged)
        const di = !this.tool ? this.dimAt(sx, sy) : null;
        if (di !== null) {
          this.snapshot();
          this.dragDim = di;
          this.dimMoved = false;
          e.preventDefault();
          return;
        }
        // a point a curve passes through is dragged straight away (as GRAFIS), also when the curve is
        // not selected: the selected curve first, then any curve
        // only the curve made active by a double-click can be reshaped (nothing reacts before that)
        const cpStep = this.selectedStep;
        const cp = this.curvePoints().find((p) => Math.abs(p.s[0] - sx) <= 9 && Math.abs(p.s[1] - sy) <= 9);
        if (cp && (!this.tool || (!this.picks.length && !this.extra.length && !this.form))) {
          this.selectedStep = cpStep;
          this.grabCurvePoint(cpStep, cp.k, e.altKey);
          e.preventDefault();
          return;
        }
        // pressing on the curve itself adds nothing (0.9.175): points are added only with ➕ in the curve bar
      }
      if (this.form?.live?.submit) {
        this.form.live.submit();
        return;
      }
      const kind = this.currentPickKind();
      if (!kind) {
        if (!this.tool && !this.form) {
          // no tool: a click on a line selects it and shows the formulas it is built on (as GRAFIS)
          const rr = svg.getBoundingClientRect(), nr = this.nearest(e.clientX - rr.left, e.clientY - rr.top);
          const other = nr ? null : this.partAt(e.clientX - rr.left, e.clientY - rr.top);
          if (other !== null) return void this.switchPartInPlace(other);
          // nothing is made active by a single click (only by a double-click, as GRAFIS); a click
          // beside the active element leaves it
          let i = -1;
          if (nr) this.model.steps.forEach((st, k) => createdIds(st).includes(nr.id) && (i = k));
          if (this.selectedStep >= 0 && i !== this.selectedStep) {
            this.selectedStep = -1;
            this.renderSteps();
            this.render();
          }
        }
        return;
      }
      const r = svg.getBoundingClientRect();
      this.shift = e.shiftKey;
      const h = this.hit(kind, e.clientX - r.left, e.clientY - r.top);
      // Shift + click: join the nearest line end / point directly (as GRAFIS)
      if (kind === "point" && e.shiftKey && h?.kind === "point") return void this.onPick(h);
      if (kind === "point" && this.ptMode !== "free") {
        const made = this.modePoint(this.toWorld(e.clientX - r.left, e.clientY - r.top), e.clientX - r.left, e.clientY - r.top);
        if (made) this.onPick(made);
        return;
      }
      // 0.9.183: mirror tools as GRAFIS: after the axis, the mirror bar's selection mode decides what a
      // click takes (single element / notch, a frame of points and lines…, a whole piece); copy or move
      if (this.collecting && this.instantValues && this.tool && /^mirror/.test(this.tool.key)) {
        return void this.mirrorClick(e.clientX - r.left, e.clientY - r.top, h);
      }
      // 0.9.181: round / cut off a corner of the cut line (outer line) too: a click near that corner, in the seam allowance
      if (kind === "line" && (this.tool?.key === "cornerRound" || this.tool?.key === "cornerChamfer" || this.tool?.key === "cornerSquare") && !this.picks.length) {
        const cc = this.cutCornerNear(e.clientX - r.left, e.clientY - r.top, !!h);
        if (cc) {
          const [a, b] = cc.key.split(",").map(Number);
          const first: Pick = { kind: "line", obj: a, at: cc.pt };
          this.cutCornerPick = { piece: cc.piece, key: cc.key, pt: cc.pt, pick: first };
          this.onPick(first);
          this.onPick({ kind: "line", obj: b, at: cc.pt });
          return;
        }
      }
      if (h) this.onPick(h);
      else if (kind === "point" && this.tool && (!this.collecting || this.tool.multi?.kind === "point")) {
        // the near mark sits on a line: the point is made ON that line where the mark is (as GRAFIS),
        // linked to it, not a loose point beside it
        const sx = e.clientX - r.left, sy = e.clientY - r.top, nr = this.nearest(sx, sy), no = nr && this.res.objects.get(nr.id);
        if (nr && no?.kind === "line") {
          const keep = this.ptMode;
          this.ptMode = "online";
          const made = this.modePoint(nr.at, sx, sy);
          this.ptMode = keep;
          if (made) return void this.onPick(made);
        }
        this.onPick(this.freePointAt(this.toWorld(sx, sy)));
      }
      else if (kind !== "canvas") this.toast(kind === "line" ? "انقر على خط" : "انقر على نقطة أو طرف خط");
    });
    window.addEventListener("mouseup", (e) => {
      // right click without dragging = confirm the step (as in GRAFIS); dragging pans
      // a click on a dimension (no drag) makes it active: its bar of options shows
      if (this.imgDrag) {
        const rr = svg.getBoundingClientRect();
        this.imgEditMove(this.toWorld(e.clientX - rr.left, e.clientY - rr.top)); // where the button is let go
        this.imgDrag = null;
        this.changed();
      }
      if (this.dragDim !== null && !this.dimMoved) this.selectedStep = this.dragDim;
      if (this.dragHandle || this.dragPoint !== null || this.dragDim !== null) {
        const refresh = (this.dragHandle || this.dragPoint !== null) && this.form?.editOf === this.selectedStep;
        // 0.9.189: a curve point let go: the curve's values window opens with that point's own fields
        // (a value, or X / Z), whether or not it was open
        const cpLetGo = this.cpDrag !== null && this.dragPoint !== null && this.model.steps[this.selectedStep]?.op === "curve";
        if (cpLetGo) queueMicrotask(() => this.editStep(this.selectedStep, !!this.form));
        else if (refresh) queueMicrotask(() => this.form?.editOf === this.selectedStep && this.editStep(this.selectedStep, true));
        this.dragHandle = null;
        this.dragPoint = null;
        this.cpDrag = null;
        this.dragDim = null;
        this.changed();
      }
      const rd = this.rightDown;
      this.rightDown = null;
      if (e.button === 2 && rd && !this.zoomMode && Math.hypot(e.clientX - rd.x, e.clientY - rd.y) < 5) this.rightConfirm();
      this.pan = null;
      svg.classList.remove("panning");
    });
    const shiftKey = (e: KeyboardEvent) => {
      if (e.key !== "Shift" || this.shift === (e.type === "keydown")) return;
      this.shift = e.type === "keydown";
      const [sx, sy] = this.lastScreen;
      this.near = this.nearest(sx, sy);
      const kind0 = this.currentPickKind();
      this.hover = kind0 === "point" ? this.hit("point", sx, sy) : this.hover;
      this.render();
    };
    window.addEventListener("keydown", shiftKey);
    window.addEventListener("keyup", shiftKey);
    svg.addEventListener("mousemove", (e) => {
      const r = svg.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      this.shift = e.shiftKey;
      this.lastScreen = [sx, sy];
      if (this.pan) {
        this.cx = this.pan.cx - (e.clientX - this.pan.x) / this.scale;
        this.cy = this.pan.cy + (e.clientY - this.pan.y) / this.scale;
        this.render();
        return;
      }
      this.mouse = this.toWorld(sx, sy);
      if (this.imgDrag) return void this.imgEditMove(this.mouse);
      if (this.selFrame) return void this.render(); // the mirror bar's frame follows the pointer
      if (this.dirPick) return void this.render(); // the direction being set follows the pointer
      if (this.collecting && this.instantValues && this.tool && /^mirror/.test(this.tool.key)) {
        const nh = this.selMode === "single" || this.selMode === "notches" ? this.notchNear(sx, sy) : null;
        if (JSON.stringify(nh) !== JSON.stringify(this.notchHover)) {
          this.notchHover = nh;
          this.render();
        }
        if (nh || this.selMode === "notches") return;
      } else if (this.notchHover) this.notchHover = null;
      if (this.seamTool) {
        const h = this.seamEdgeAt(sx, sy);
        if (JSON.stringify(h) !== JSON.stringify(this.seamHover)) {
          this.seamHover = h;
          this.render();
        }
        return;
      }
      if (this.inheritPick) {
        const h = this.inheritAt(sx, sy);
        if (JSON.stringify(h) !== JSON.stringify(this.ihHover)) {
          this.ihHover = h;
          this.render();
        }
        return;
      }
      if (this.dragDim !== null) {
        this.dimMoved = true;
        const st = this.model.steps[this.dragDim] as Extract<Step, { op: "dim" }>;
        const off = this.dimOffsetAt(st, this.mouse);
        if (off !== null) {
          st.offset = String(Math.round(off * 10) / 10);
          this.render();
        }
        return;
      }
      if (this.dragPoint !== null) {
        const q = this.ptRaster > 0 ? this.ptRaster : 0.1;
        const r = (v: number) => String(Math.round(Math.round(v / q) * q * 10) / 10);
        const t = this.model.steps[this.dragPoint.step];
        if (t.op === "point") (t.x = r(this.mouse[0])), (t.y = r(this.mouse[1]));
        else if (t.op === "pointOn") {
          const L = this.res.objects.get(t.on);
          if (L) {
            const len = polyLen(L.pts) || 1;
            let d = closestOnPolyline(L.pts, this.mouse).s;
            if (t.from === "end") d = len - d;
            t.dist = t.unit === "%" ? String(Math.round((d / len) * 1000) / 10) : r(d);
          }
        }
        else if (t.op === "pointOffset") (t.dx = r(this.mouse[0] - this.dragPoint.base[0])), (t.dy = r(this.mouse[1] - this.dragPoint.base[1]));
        else if (t.op === "pointMove" && t.slide) {
          const dp = this.dragPoint, b = dp.base, mv: Pt = [this.mouse[0] - b[0], this.mouse[1] - b[1]], ml = Math.hypot(mv[0], mv[1]);
          // on several lines: the one most in the direction of the drag
          if (dp.cands && ml > 1.5) {
            let best = -1;
            for (const c of dp.cands) {
              const o = this.res.objects.get(c);
              if (!o) continue;
              const dir = directionAt(o.pts, closestOnPolyline(o.pts, b).s), al = Math.abs(dir[0] * mv[0] + dir[1] * mv[1]) / ml;
              if (al > best) (best = al), (t.along = c);
            }
            dp.cands = undefined;
          }
          const L = this.res.objects.get(t.along);
          if (L) {
            const s0 = closestOnPolyline(L.pts, b).s, len = polyLen(L.pts);
            // past the ends: on the line's extension (the distance along the end direction)
            let s = closestOnPolyline(L.pts, this.mouse).s;
            const ext = (end: number, from: Pt, dir: Pt, sign: number) => end + sign * ((this.mouse[0] - from[0]) * dir[0] + (this.mouse[1] - from[1]) * dir[1]);
            if (s <= 1e-6) s = Math.min(0, ext(0, L.pts[0], directionAt(L.pts, 0), 1));
            else if (s >= len - 1e-6) s = Math.max(len, ext(len, L.pts[L.pts.length - 1], directionAt(L.pts, len), 1));
            t.dist = r(s - s0);
          }
        }
        this.evaluate();
        this.render();
        return;
      }
      if (this.dragHandle) {
        const s = this.model.steps[this.dragHandle.i] as Extract<Step, { op: "curve" }>, o = this.res.objects.get(s.id);
        if (o) {
          const at = this.dragHandle.end === "start" ? o.pts[0] : o.pts[o.pts.length - 1];
          // the start handle sits behind the curve: the direction points from it to the end point
          const behind = (this.dragHandle.end === "start") !== this.dragHandle.flip; // handle lies behind the travel direction
          const v: Pt = behind ? [at[0] - this.mouse[0], at[1] - this.mouse[1]] : [this.mouse[0] - at[0], this.mouse[1] - at[1]];
          let deg = (Math.atan2(v[1], v[0]) * 180) / Math.PI;
          // an end measured from a line keeps that: the angle is stored from the line's direction there
          const rel = this.dragHandle.end === "start" ? s.startRel : s.endRel, ro = rel !== undefined ? this.res.objects.get(rel) : undefined;
          if (ro) {
            const d = directionAt(ro.pts, closestOnPolyline(ro.pts, at).s);
            deg -= (Math.atan2(d[1], d[0]) * 180) / Math.PI;
            deg = ((deg % 360) + 540) % 360 - 180;
          }
          // the handle moves freely in every direction (1°), whatever the angle step of the line tools;
          // Shift snaps it to 15°
          const q = this.shift ? 15 : 1;
          deg = Math.round(deg / q) * q;
          // the distance of the handle from the end sets the strength (70 px = 100 %)
          const [ex, ey] = this.toScreen(at), [mx, my] = this.toScreen(this.mouse);
          const pct = Math.min(400, Math.max(10, Math.round((Math.hypot(mx - ex, my - ey) / 70) * 100 / 5) * 5));
          if (this.dragHandle.end === "start") (s.startAngle = String(deg)), (s.startTension = String(pct));
          else (s.endAngle = String(deg)), (s.endTension = String(pct));
          this.evaluate();
          this.render();
        }
        return;
      }
      if (this.form?.live?.follow) {
        this.form.live.follow(this.mouse);
        return;
      }
      $("#coords").textContent = `x ${fmt(this.mouse[0])}   y ${fmt(this.mouse[1])}   mm`;
      {
        const cph = this.curvePoints().find((p) => Math.abs(p.s[0] - sx) <= 9 && Math.abs(p.s[1] - sy) <= 9)?.k ?? null;
        const hh = this.handleAt(sx, sy)?.end ?? null;
        if (cph !== this.cpHover || hh !== this.handleHover) {
          this.cpHover = cph;
          this.handleHover = hh;
          this.render();
        }
      }
      if (this.allParts && !this.tool) {
        const ph = this.nearest(sx, sy) ? null : this.partAt(sx, sy);
        if (ph !== this.partHover) {
          this.partHover = ph;
          svg.style.cursor = ph !== null ? "pointer" : "";
          this.render();
        }
      }
      if (!this.pan) {
        const oh = this.hit("object", sx, sy), id = oh ? pickedId(oh) : null;
        // the object near the pointer is marked (glow) with a dot on its nearest point
        // a dimension under the pointer (no tool open) glows itself and takes the press, not the line beside it
        const dh = !this.tool && !this.form ? this.dimAt(sx, sy) : null;
        const near = dh === null ? this.nearest(sx, sy) : null;
        const moved = !!near !== !!this.near || (near && this.near && (near.id !== this.near.id || dist(near.at, this.near.at) * this.scale > 0.5)) || dh !== this.dimHover;
        this.near = near;
        this.dimHover = dh;
        svg.style.cursor = dh !== null ? "move" : "";
        if (id !== this.nameHover || moved) {
          this.nameHover = id;
          this.render();
        }
      }
      const kind0 = this.currentPickKind();
      const kind: PickKind | null = kind0 === "point" && this.ptMode !== "free" && this.ptMode !== "xy" ? "line" : kind0;
      const h = kind ? this.hit(kind, sx, sy) : null;
      if (kind0 === "point" && this.ptMode !== "free") this.render();
      if (JSON.stringify(h && { ...h, at: 0 }) !== JSON.stringify(this.hover && { ...this.hover, at: 0 })) {
        this.hover = h;
        this.render();
      } else if ((this.tool?.frame && this.picks.length === 1) || (this.tool?.key === "line" && this.picks.length === 1) || (this.collecting && this.tool?.multi?.kind === "point" && this.extra.length)) this.render(); // rubber band / curve
    });
    svg.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const r = svg.getBoundingClientRect();
        const before = this.toWorld(e.clientX - r.left, e.clientY - r.top);
        this.scale = Math.min(200, Math.max(0.02, this.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        const after = this.toWorld(e.clientX - r.left, e.clientY - r.top);
        this.cx += before[0] - after[0];
        this.cy += before[1] - after[1];
        this.render();
      },
      { passive: false },
    );
    window.addEventListener("resize", () => this.render());
  }

  private bindKeys(): void {
    window.addEventListener("keydown", (e) => {
      const typing = (e.target as HTMLElement).matches("input, select, textarea");
      // the key's place on the keyboard (KeyZ → z): the shortcuts work with any keyboard language
      const key = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "z" && !typing) {
        e.preventDefault();
        this.undo();
      } else if ((e.ctrlKey || e.metaKey) && key === "y" && !typing) {
        e.preventDefault();
        this.redo();
      } else if ((e.ctrlKey || e.metaKey) && key === "s") {
        e.preventDefault();
        this.save();
      } else if (typing) {
        return;
      } else if (e.key === "Escape") {
        this.leaveZoom();
        this.cancelTool();
      } else if (e.key === "Enter" && this.collecting) {
        this.finishPicks();
      } else if (key === "f") {
        this.fit();
      } else {
        // the digit by its key's place (Digit7 → 7): Arabic keyboards type ٧
        const digit = /^(Digit|Numpad)(\d)$/.exec(e.code)?.[2] ?? e.key;
        const t = TOOLS.find((x) => x.shortcut === digit);
        if (t) this.selectTool(t);
      }
    });
  }

  private bindTopbar(): void {
    $<HTMLSelectElement>("#unit-select").addEventListener("change", (e) => {
      this.snapshot();
      this.model.unit = (e.target as HTMLSelectElement).value === "in" ? "in" : "mm";
      this.changed();
      this.toast(this.model.unit === "in" ? "قيم الأبعاد بالبوصة" : "قيم الأبعاد بالمليمتر");
    });
    const name = $<HTMLInputElement>("#model-name");
    name.value = this.model.name;
    name.addEventListener("change", () => {
      this.snapshot();
      this.model.name = name.value;
      autosave(this.model);
    });
    const fileInput = $<HTMLInputElement>("#file-input");
    let fileMode: "open" | "grafis" | "customers" = "open";
    this.pickFile = (mode) => {
      fileMode = mode;
      fileInput.accept = mode === "customers" ? ".csv,.json,.txt" : ".json,application/json";
      fileInput.click();
    };
    fileInput.addEventListener("change", async () => {
      const f = fileInput.files?.[0];
      fileInput.value = "";
      if (!f) return;
      try {
        const text = await f.text();
        if (fileMode === "customers") {
          this.importCustomers(text, f.name);
        } else if (fileMode === "open") {
          this.load(parseModel(text));
          this.toast(`تم فتح ${f.name}`);
        } else {
          this.importGrafis(text);
        }
      } catch (e) {
        this.toast(`تعذر قراءة الملف: ${(e as Error).message}`);
      }
    });
    document.querySelector(".actions")?.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button[data-action]") as HTMLElement | null;
      switch (b?.dataset.action) {
        case "new":
          if (this.model.steps.length && !confirm("بدء باترون جديد؟ يمكنك التراجع بعدها.")) return;
          this.load(emptyModel());
          break;
        case "open":
          this.pickFile("open");
          break;
        case "import-grafis":
          this.pickFile("grafis");
          break;
        case "save":
          this.save();
          break;
        case "aama":
        case "plt": {
          const items = this.pieceItems();
          if (!items.length) {
            this.toast("لا توجد قطع للتصدير. أنشئ قطعة بأداة «قطعة من الحدود»");
            return;
          }
          const size = sizeName(this.model, this.model.activeSize ?? -1);
          const base = `${safeFileName(this.model.name)}_${safeFileName(size)}`;
          if (b?.dataset.action === "aama") download(`${base}.dxf`, toAamaDxf(items, { style: this.model.name, size }), "application/dxf");
          else download(`${base}.plt`, toPlt(items, { size }), "application/vnd.hp-hpgl");
          break;
        }
        case "dxf":
          download(`${safeFileName(this.model.name)}.dxf`, toDxf(this.res.objects.values()), "application/dxf");
          break;
        case "undo":
          this.undo();
          break;
        case "redo":
          this.redo();
          break;
        case "fit":
          this.fit();
          break;
        case "demo":
          this.load(thobeSample().m);
          break;
      }
    });
  }

  private pickFile: (mode: "open" | "grafis" | "customers") => void = () => {};
  private importUnit: Unit = "mm";

  private importCustomers(text: string, fileName: string): void {
    const orders = /\.json$/i.test(fileName) || text.trim().startsWith("{") || text.trim().startsWith("[") ? parseOrders(text) : parseCsv(text, this.importUnit);
    this.snapshot();
    const unknown = new Set<string>();
    let last = -1;
    for (const o of orders) {
      if (!o.unit) o.unit = this.importUnit;
      const { index, applied } = addCustomer(this.model, o);
      applied.unknown.forEach((k) => unknown.add(k));
      last = index;
    }
    this.model.activeSize = last;
    this.changed();
    this.toast(
      `استُورد ${orders.length} زبون` +
        (unknown.size ? `. قياسات غير معروفة: ${[...unknown].slice(0, 6).join("، ")} (أضف رموزها في عمود «رمز MTM» بصفحة القياسات)` : ""),
    );
  }

  /** The program confirmed that the design file was written (the save dialog was not cancelled). */
  markSaved(): void {
    setUnsaved((this.unsaved = false));
  }

  private save(saveAs = false): void {
    this.syncPart();
    // inside LEVEL7 and MTM the file is written by the program, which confirms with l7:saved
    if (!(document.body.classList.contains("embedded") && window.parent !== window)) this.markSaved();
    download(`${safeFileName(this.model.name)}.level7`, JSON.stringify(this.model, null, 1), "application/json", saveAs);
  }

  /** Save as (Ctrl+Shift+S): always asks where; Ctrl+S writes the design back to its own file. */
  saveAs(): void {
    this.save(true);
  }

  private importGrafis(text: string): void {
    const g = fromGrafis(text);
    this.snapshot();
    this.model.measurements = g.measurements;
    this.model.variables = g.variables;
    if (!this.model.steps.length) this.model.name = g.name;
    this.changed();
    this.toast(
      `تم استيراد ${g.measurements.length} قياس و${g.variables.length} معادلة` +
        (g.skipped.length ? `. ${g.skipped.length} متغير يُقاس من الرسم وُضع صفراً مؤقتاً` : ""),
    );
  }

  private toastTimer = 0;
  toast(msg: string): void {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (t.hidden = true), 3500);
  }

  // ------------------------------------------------------------ panels
  private bindTabs(): void {
    document.querySelector(".tabs")?.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button[data-tab]") as HTMLElement | null;
      if (!b) return;
      document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
      for (const id of ["steps", "x", "z", "pieces", "sizes"]) $(`#tab-${id}`).hidden = id !== b.dataset.tab;
    });
  }

  renderPanels(): void {
    $<HTMLInputElement>("#model-name").value = this.model.name;
    $<HTMLSelectElement>("#unit-select").value = this.model.unit ?? "mm";
    this.renderSteps();
    this.renderX();
    this.renderZ();
    this.renderPieces();
    this.renderSizes();
    this.renderParts();
  }

  private renderSteps(): void {
    const box = $("#tab-steps");
    if (document.body.classList.contains("embedded")) return this.renderRecord(box);
    if (!this.model.steps.length) {
      box.innerHTML = `<div class="empty">لا توجد خطوات بعد.<br>ابدأ بأداة «نقطة حرة» أو «خط بزاوية وطول»، أو افتح «مثال» من الشريط العلوي.<br>كل خطوة تبقى مربوطة بالقياسات والمعادلات.</div>`;
      return;
    }
    box.innerHTML =
      `<ol class="steps">` +
      this.model.steps
        .map((s, i) => {
          const err = this.res.stepErrors.get(i);
          const editable = stepFields(s).length > 0;
          return `<li data-i="${i}" class="${i === this.selectedStep ? "selected" : ""}${err ? " error" : ""}">
            <span class="num">${i + 1}</span>
            <span class="desc">${esc(describe(s, this.model)).replace(/\u2066(.*?)\u2069/g, '<bdi dir="ltr">$1</bdi>')}${err ? `<span class="err">${esc(err)}</span>` : ""}</span>
            <span class="row-actions">${editable ? `<button data-edit="${i}" title="تعديل القيم" aria-label="تعديل القيم"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg></button>` : ""}<button class="danger" data-del="${i}" title="حذف الخطوة" aria-label="حذف الخطوة"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg></button></span>
          </li>`;
        })
        .join("") +
      `</ol>`;
    box.querySelectorAll<HTMLElement>("li").forEach((li) =>
      li.addEventListener("click", (e) => {
        const i = Number(li.dataset.i);
        const t = ((e.target as HTMLElement).closest("button") ?? e.target) as HTMLElement;
        if (t.dataset.edit) return this.editStep(i);
        if (t.dataset.del) return this.deleteStep(i);
        this.selectedStep = this.selectedStep === i ? -1 : i;
        this.renderSteps();
        this.render();
      }),
    );
  }

  /** Record (embedded mode): table of construction steps with a preview of the pattern
   * up to the selected step, like GRAFIS's list of interactive constructions. */
  private renderRecord(box: HTMLElement): void {
    const NAMES: Record<string, string> = {
      point: "Point", pointOn: "Point on line", intersect: "Intersection", pointMove: "Point moved", line: "Line",
      lineAngle: "Line with direction", parallel: "Parallel", setLength: "Lengthen", trim: "Trim / extend",
      mirror: "Mirror", curve: "Curve", corner: "Corner", parallels: "Parallels", scale: "Scale", inherit: "Inherit objects", mark: "Symbol / stitch", text: "Text", fixed: "Imported", pointOffset: "Point offset", dim: "Dimension",
    };
    const steps = this.model.steps;
    const sel = this.selectedStep;
    const rows = steps
      .map((s, i) => {
        const err = this.res.stepErrors.get(i);
        const name = s.op === "corner" ? `Corner (${s.kind})` : NAMES[s.op] ?? s.op;
        return `<tr data-i="${i}" class="${i === sel ? "selected" : ""}${err ? " error" : ""}" title="${err ? esc(err) : "دابل كليك للتعديل"}"><td class="rs">${i + 1}</td><td class="nm">${name}</td><td class="ds">${(describe(s, this.model) ?? s.op).replace(/\u2066(.*?)\u2069/g, '<bdi dir="ltr">$1</bdi>')}</td></tr>`;
      })
      .join("");
    box.innerHTML = `<div class="record">
      <div class="rec-table" tabindex="0">${steps.length ? `<table><thead><tr><th>RS</th><th>Name</th><th>التفاصيل</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">لا توجد خطوات بعد.</div>`}</div>
      <div class="rec-preview"><svg></svg><span class="rec-at"></span></div>
      <div class="rec-foot">
        <button data-rec="first" title="أول خطوة">⏮</button><button data-rec="prev" title="الخطوة السابقة">◀</button><button data-rec="next" class="rec-play" title="الخطوة التالية">▶</button><button data-rec="last" title="آخر خطوة">⏭</button>
        <span class="rec-gap"></span>
        <button data-rec="edit" title="تعديل قيم الخطوة">تعديل</button><button data-rec="del" class="danger" title="حذف الخطوة">حذف</button><button data-rec="back" class="danger" title="الرجوع إلى هذه الخطوة: حذف كل الخطوات بعدها (يمكن التراجع Ctrl+Z)">⤺ الرجوع إلى هنا</button>
      </div></div>`;
    this.drawRecordPreview(box);
    const go = (i: number) => {
      if (!steps.length) return;
      this.selectedStep = Math.max(0, Math.min(steps.length - 1, i));
      this.renderSteps();
      this.render();
      (box.querySelector("tr.selected") as HTMLElement | null)?.scrollIntoView({ block: "nearest" });
      (box.querySelector(".rec-table") as HTMLElement).focus();
    };
    box.querySelectorAll<HTMLElement>("tbody tr").forEach((tr) => {
      tr.addEventListener("click", () => go(Number(tr.dataset.i)));
      tr.addEventListener("dblclick", () => {
        const i = Number(tr.dataset.i);
        if (stepFields(steps[i]).length) this.editStep(i);
      });
    });
    box.querySelector(".rec-table")?.addEventListener("keydown", (e) => {
      const k = (e as KeyboardEvent).key;
      if (k === "ArrowDown" || k === "ArrowUp") {
        e.preventDefault();
        go((sel < 0 ? -1 : sel) + (k === "ArrowDown" ? 1 : -1));
      }
    });
    box.querySelectorAll<HTMLButtonElement>("[data-rec]").forEach((b) =>
      b.addEventListener("click", () => {
        const a = b.dataset.rec;
        if (a === "first") go(0);
        else if (a === "last") go(steps.length - 1);
        else if (a === "next") go(sel + 1);
        else if (a === "prev") go(sel - 1);
        else if (a === "edit" && sel >= 0 && stepFields(steps[sel]).length) this.editStep(sel);
        else if (a === "del" && sel >= 0) this.deleteStep(sel);
        else if (a === "back" && sel >= 0) this.backTo(sel);
      }),
    );
    const editable = sel >= 0 && !!steps[sel] && stepFields(steps[sel]).length > 0;
    (box.querySelector('[data-rec="edit"]') as HTMLButtonElement).disabled = !editable;
    (box.querySelector('[data-rec="del"]') as HTMLButtonElement).disabled = sel < 0;
    (box.querySelector('[data-rec="back"]') as HTMLButtonElement).disabled = sel < 0 || sel >= steps.length - 1;
  }

  /** The pattern as it stood after the selected step; that step's objects highlighted. */
  private drawRecordPreview(box: HTMLElement): void {
    const svg = box.querySelector(".rec-preview svg") as SVGSVGElement;
    const all = [...this.res.objects.values()];
    if (!all.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const o of all) for (const [x, y] of o.pts) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
    const pad = Math.max(x1 - x0, y1 - y0, 1) * 0.06;
    svg.setAttribute("viewBox", `${x0 - pad} ${-(y1 + pad)} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`);
    const upto = this.selectedStep >= 0 ? this.selectedStep : this.model.steps.length - 1;
    const res = evaluateModel({ ...this.model, steps: this.model.steps.slice(0, upto + 1), pieces: [] });
    const w = (Math.max(x1 - x0, y1 - y0, 1) / 300).toFixed(3);
    const out: string[] = [];
    for (const o of res.objects.values()) {
      const now = o.step === upto;
      if (o.kind === "point") out.push(`<circle cx="${o.pts[0][0]}" cy="${-o.pts[0][1]}" r="${(Number(w) * 2.4).toFixed(3)}" class="${now ? "rec-now" : "rec-old"}"/>`);
      else out.push(`<polyline points="${o.pts.map(([x, y]) => `${x},${-y}`).join(" ")}" class="${now ? "rec-now" : "rec-old"}" stroke-width="${now ? Number(w) * 2.2 : w}"/>`);
    }
    svg.innerHTML = out.join("");
    (box.querySelector(".rec-at") as HTMLElement).textContent = `${upto + 1} / ${this.model.steps.length}`;
  }

  private editStep(i: number, refresh = false): void {
    const s = this.model.steps[i];
    if (refresh) this.closeForm();
    else this.cancelTool();
    this.selectedStep = i;
    this.render();
    // a line's start (and end) point made for it, a point on a line or a free point, is edited here
    // too: e.g. how far down the line starts on the line it was drawn from
    const pointStep = (r?: PointRef) => (r && r.end === undefined ? this.model.steps.findIndex((t, k) => k < i && (t.op === "pointOn" || t.op === "point" || t.op === "pointOffset" || t.op === "pointMove") && t.id === r.obj) : -1);
    const ends: [string, string, number][] = [];
    const st0 = s as { op: string; start?: PointRef; p1?: PointRef; p2?: PointRef };
    // a curve: the points it passes through (where the Z values it was drawn with are)
    const refs: [string, string, PointRef | undefined][] =
      s.op === "curve"
        ? s.through.map((r, k, all): [string, string, PointRef | undefined] => [`p${k}`, k === 0 ? "البداية" : k === all.length - 1 ? "النهاية" : `النقطة ${k + 1}`, r])
        : [["s", "البداية", st0.op === "lineAngle" ? st0.start : st0.op === "line" ? st0.p1 : undefined], ["e", "النهاية", st0.op === "line" ? st0.p2 : undefined]];
    for (const [tag, label, r] of refs) {
      const j = pointStep(r);
      if (j >= 0) ends.push([tag, label + (this.model.steps[j].op === "pointOn" ? " على الخط" : ""), j]);
    }
    const dragged = s.op === "curve" && this.cpEdit && this.cpEdit.ci === s.id ? `p${this.cpEdit.k}` : "";
    // a curve end measured from a line says which line
    const own = stepFields(s).map((f) => {
      if (s.op !== "curve") return f;
      const rel = f.key === "startAngle" ? s.startRel : f.key === "endAngle" ? s.endRel : undefined;
      return rel !== undefined ? { ...f, label: `${f.label} (من ${this.model.names[rel] ?? "الخط"})` } : f;
    });
    this.openForm({
      editOf: i,
      title: `تعديل الخطوة ${i + 1}`,
      // for a curve only what was set with X / Z or a formula (kept short: no plain coordinates of dragged
      // points, no unit / measured-from lists); a line shows its start / end in full
      fields: [
        ...own,
        ...ends.flatMap(([tag, label, j]) =>
          stepFields(this.model.steps[j])
            // the point last dragged shows all its fields (type a value, or X / Z, instead of the drag)
            .filter((f) => s.op !== "curve" || tag === dragged || (!f.options && !/^-?\d+(\.\d+)?$/.test(f.value.trim())))
            .map((f) => ({ ...f, key: `${tag}:${f.key}`, label: `${s.op === "curve" ? label.replace(" على الخط", "") : label}${tag === dragged ? " (المسحوبة)" : ""}: ${f.label}` })),
        ),
      ],
      onOk: (v) => {
        this.snapshot();
        const own: Record<string, string> = {}, of: Record<string, Record<string, string>> = {};
        for (const [k, val] of Object.entries(v)) {
          const m = /^(s|e|p\d+):(.+)$/.exec(k);
          if (m) (of[m[1]] ??= {})[m[2]] = val;
          else own[k] = val;
        }
        applyFields(this.model.steps[i], own);
        for (const [tag, , j] of ends) if (of[tag]) applyFields(this.model.steps[j], of[tag]);
        this.changed();
      },
    });
  }

  /** Texts / symbols / stitches / notches: annotations, not objects. A frame removes those
   * whose anchor lies inside it; a click removes the text under it. */
  /** Both ends of a grain line drawn with the grain tool (null if it cannot be worked out). */
  private grainEnds(st: Step): [Pt, Pt] | null {
    if (st.op !== "mark" || st.kind !== "grain" || !st.a) return null;
    const A = this.pointOf(st.a);
    if (st.b) return [A, this.pointOf(st.b)];
    try {
      const v = new Vars(withSize(this.model), undefined, this.res.z), deg = (v.eval(st.angle ?? "0") * Math.PI) / 180, len = v.eval(st.size || "0");
      return [A, [A[0] + Math.cos(deg) * len, A[1] + Math.sin(deg) * len]];
    } catch {
      return null;
    }
  }

  /** Delete grain line (as GRAFIS): the grain line drawn nearest the click goes. */
  private removeGrain(at: Pt): void {
    const [sx, sy] = this.toScreen(at);
    let best: { i: number; d: number } | null = null;
    this.model.steps.forEach((st, i) => {
      const e = this.grainEnds(st);
      if (!e) return;
      const [a, b] = e.map((p) => this.toScreen(p)), dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((sx - a[0]) * dx + (sy - a[1]) * dy) / L2)), d = Math.hypot(sx - a[0] - t * dx, sy - a[1] - t * dy);
      if (d <= 14 && (!best || d < best.d)) best = { i, d };
    });
    const b = best as { i: number; d: number } | null;
    if (!b) {
      const auto = (this.model.pieces ?? []).some((pc) => {
        const g = this.res.pieces.get(pc.id);
        if (!g) return false;
        const [a, c] = g.grain.map((p) => this.toScreen(p)), dx = c[0] - a[0], dy = c[1] - a[1], L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((sx - a[0]) * dx + (sy - a[1]) * dy) / L2));
        return Math.hypot(sx - a[0] - t * dx, sy - a[1] - t * dy) <= 14;
      });
      return this.toast(auto ? "هذا خط النسيج التلقائي للقطعة: اتجاهه من «خط النسيج °» في صفحة القطع، ويختفي إذا رسمت خط نسيج بالأداة" : "لا يوجد خط اتجاه قماش هنا");
    }
    this.snapshot();
    this.model.steps.splice(b.i, 1);
    this.selectedStep = -1;
    this.changed();
    this.toast("حُذف خط اتجاه القماش");
  }

  private removeAnnotations(what: "texts" | "symbols" | "stitches" | "notches", frame: boolean): void {
    let x0 = -Infinity, x1 = Infinity, y0 = -Infinity, y1 = Infinity;
    if (frame) {
      const [a, b] = this.picks.map((p) => p.at);
      [x0, x1, y0, y1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    }
    const inside = (p: Pt | null) => !!p && p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
    const anchor = (r?: PointRef) => {
      try {
        return r ? this.pointOf(r) : null;
      } catch {
        return null;
      }
    };
    const gone = new Set<number>();
    if (what === "texts" && !frame) {
      const [sx, sy] = this.toScreen(this.picks[0].at);
      let best: { i: number; d: number } | null = null;
      for (const h of this.textHits) {
        const d = Math.hypot(h.s[0] - sx, h.s[1] - sy);
        if (d <= h.r && (!best || d < best.d)) best = { i: h.i, d };
      }
      if (best) gone.add(best.i);
    } else if (what !== "notches")
      this.model.steps.forEach((st, i) => {
        if (what === "texts" && st.op === "text" && inside(anchor(st.at))) gone.add(i);
        if (st.op !== "mark") return;
        if (what === "symbols" && st.obj === undefined && inside(anchor(st.a)) && (st.kind !== "grain" || !st.b || inside(anchor(st.b)))) gone.add(i);
        if (what === "stitches" && st.obj !== undefined) {
          const o = this.res.objects.get(st.obj);
          if (o && o.pts.every((p) => inside(p))) gone.add(i);
        }
      });
    let notches = 0;
    if (what === "notches") {
      this.snapshot();
      for (const pc of this.model.pieces ?? []) {
        const keepIdx = pc.notches.map((r, k) => (inside(anchor(r)) ? -1 : k)).filter((k) => k >= 0);
        notches += pc.notches.length - keepIdx.length;
        if (pc.notchTypes) pc.notchTypes = keepIdx.map((k) => pc.notchTypes?.[k] ?? "slit");
        if (pc.notchLen) pc.notchLen = keepIdx.map((k) => pc.notchLen?.[k] ?? "");
        pc.notches = keepIdx.map((k) => pc.notches[k]);
      }
      if (!notches) {
        this.undoStack.pop();
        return this.toast("لا توجد نوتشات داخل الإطار");
      }
      this.changed();
      return this.toast(`حُذفت ${notches} نوتشات`);
    }
    if (!gone.size) return this.toast(what === "texts" ? "لا يوجد نص هنا" : "لا يوجد ما يُحذف داخل الإطار");
    this.snapshot();
    this.model.steps = this.model.steps.filter((_, i) => !gone.has(i));
    this.selectedStep = -1;
    this.changed();
    this.toast(`حُذف ${gone.size}`);
  }

  private textHits: { i: number; s: Pt; r: number }[] = [];

  // ---- view options (as GRAFIS View menu): what the drawing shows, remembered here
  vis = (() => {
    const d = { points: true, dims: true, marks: true, texts: true, ghosts: true, lengths: false, images: true };
    try {
      return { ...d, ...JSON.parse(localStorage.getItem("level7.visibility") || "{}") } as typeof d;
    } catch {
      return d;
    }
  })();
  showDup = false;

  setVis(k: keyof App["vis"], on: boolean): void {
    this.vis[k] = on;
    try {
      localStorage.setItem("level7.visibility", JSON.stringify(this.vis));
    } catch {}
    if (k === "dims" && !on) this.dimHits = [];
    if (k === "texts" && !on) this.textHits = [];
    this.render();
  }

  /** F8: the length of every line and curve written on it. */
  private lengthsSvg(): string {
    const inch = this.model.unit === "in", out: string[] = [];
    for (const o of this.res.objects.values()) {
      if (o.kind !== "line") continue;
      const L = polyLen(o.pts), m = Math.floor(o.pts.length / 2), a = o.pts[Math.max(0, m - 1)], b = o.pts[Math.min(o.pts.length - 1, m + (o.pts.length === 2 ? 0 : 1))];
      const [x1, y1] = this.toScreen(o.pts.length === 2 ? o.pts[0] : a), [x2, y2] = this.toScreen(o.pts.length === 2 ? o.pts[1] : b);
      let ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      if (ang > 90) ang -= 180;
      if (ang < -90) ang += 180;
      const [mx, my] = o.pts.length === 2 ? [(x1 + x2) / 2, (y1 + y2) / 2] : this.toScreen(o.pts[m]);
      const v = inch ? `${fmt(Math.round((L / 25.4) * 100) / 100)}″` : fmt(Math.round(L * 10) / 10);
      out.push(`<text class="len-label" x="${mx}" y="${my - 4}" text-anchor="middle" transform="rotate(${ang.toFixed(1)} ${mx} ${my})">\u2066${v}\u2069</text>`);
    }
    return out.join("");
  }

  /** Background pictures (under the grid and the drawing). */
  private imagesSvg(): string {
    if (!this.vis.images) return "";
    return (this.model.images ?? [])
      .filter((im) => im.visible && /^data:image\/(png|jpeg|gif|webp);base64,/.test(im.data))
      .map((im) => {
        // fixed as the background of the whole screen (all parts, not moved by zoom or pan)
        if (im.screen) return `<image href="${im.data}" x="0" y="0" width="100%" height="100%" opacity="${im.opacity}" preserveAspectRatio="xMidYMid slice"/>`;
        const [x, y] = this.toScreen([im.x, im.y + im.h]), [x2, y2] = this.toScreen([im.x + im.w, im.y]);
        return `<image href="${im.data}" x="${x}" y="${y}" width="${Math.max(1, x2 - x)}" height="${Math.max(1, y2 - y)}" opacity="${im.opacity}" preserveAspectRatio="none"/>`;
      })
      .join("");
  }

  /** Picture being moved / resized by hand (index in model.images), and the drag going on. */
  private imgEdit: number | null = null;
  private imgDrag: { mode: "move" | "nw" | "ne" | "sw" | "se"; from: Pt; orig: { x: number; y: number; w: number; h: number } } | null = null;

  private imgCorners(im: { x: number; y: number; w: number; h: number }): Record<"nw" | "ne" | "sw" | "se", Pt> {
    return { nw: [im.x, im.y + im.h], ne: [im.x + im.w, im.y + im.h], sw: [im.x, im.y], se: [im.x + im.w, im.y] };
  }

  /** The frame and corner handles of the picture being edited by hand. */
  private imgEditSvg(): string {
    const im = this.imgEdit !== null ? this.model.images?.[this.imgEdit] : undefined;
    if (!im || im.screen) return "";
    const c = this.imgCorners(im), [x, y] = this.toScreen(c.nw), [x2, y2] = this.toScreen(c.se);
    const hs = Object.values(c).map((p) => {
      const [hx, hy] = this.toScreen(p);
      return `<rect class="img-handle" x="${(hx - 6).toFixed(1)}" y="${(hy - 6).toFixed(1)}" width="12" height="12"/>`;
    });
    return `<g class="img-edit"><rect class="img-frame" x="${x}" y="${y}" width="${Math.max(1, x2 - x)}" height="${Math.max(1, y2 - y)}"/>${hs.join("")}</g>`;
  }

  /** Mouse down while a picture is edited by hand: grab a corner (resize) or the picture (move);
   * a press outside it ends the editing. */
  private imgEditDown(sx: number, sy: number): void {
    const im = this.imgEdit !== null ? this.model.images?.[this.imgEdit] : undefined;
    if (!im) return void (this.imgEdit = null);
    const w = this.toWorld(sx, sy), c = this.imgCorners(im);
    for (const k of ["nw", "ne", "sw", "se"] as const) {
      const [hx, hy] = this.toScreen(c[k]);
      if (Math.hypot(hx - sx, hy - sy) <= 10) {
        this.snapshot();
        this.imgDrag = { mode: k, from: w, orig: { x: im.x, y: im.y, w: im.w, h: im.h } };
        return;
      }
    }
    if (w[0] >= im.x && w[0] <= im.x + im.w && w[1] >= im.y && w[1] <= im.y + im.h) {
      this.snapshot();
      this.imgDrag = { mode: "move", from: w, orig: { x: im.x, y: im.y, w: im.w, h: im.h } };
      return;
    }
    this.imgEdit = null;
    this.toast("انتهى تعديل الصورة");
    this.render();
  }

  private imgEditMove(at: Pt): void {
    const im = this.imgEdit !== null ? this.model.images?.[this.imgEdit] : undefined, d = this.imgDrag;
    if (!im || !d) return;
    const o = d.orig;
    if (d.mode === "move") {
      im.x = o.x + at[0] - d.from[0];
      im.y = o.y + at[1] - d.from[1];
    } else {
      // the opposite corner stays; the picture keeps its proportions (Shift: free)
      const opp = this.imgCorners(o)[({ nw: "se", ne: "sw", sw: "ne", se: "nw" } as const)[d.mode]];
      const dx = at[0] - opp[0], dy = at[1] - opp[1];
      let w = Math.max(1, Math.abs(dx)), h = Math.max(1, Math.abs(dy));
      if (!this.shift) {
        const ratio = o.h / (o.w || 1);
        w = Math.max(w, h / ratio);
        h = w * ratio;
      }
      im.w = w;
      im.h = h;
      im.x = dx < 0 ? opp[0] - w : opp[0];
      im.y = dy < 0 ? opp[1] - h : opp[1];
    }
    this.render();
  }

  /** Pictures window (F9 shows / hides them): add a picture, place it in mm, set its width,
   * transparency, or calibrate it from two clicked points and their real distance. */
  openImages(): void {
    document.querySelector(".img-win")?.remove();
    const list = (this.model.images ??= []);
    const el = document.createElement("section");
    el.className = "z-assistant img-win";
    el.dir = "rtl";
    const rows = list.map((im, k) => `<div class="img-row" data-k="${k}"><label class="za-r"><input type="checkbox" data-ik="visible" ${im.visible ? "checked" : ""}/> <b>${esc(im.name)}</b></label>
      <div class="img-f"><span>X مم</span><input data-ik="x" value="${im.x}"/><span>Y مم</span><input data-ik="y" value="${im.y}"/><span>العرض مم</span><input data-ik="w" value="${Math.round(im.w * 10) / 10}"/></div>
      <div class="img-f"><span>الشفافية</span><input type="range" min="0.1" max="1" step="0.05" data-ik="opacity" value="${im.opacity}"/><button data-ia="cal" title="انقر نقطتين معروفتين على الصورة ثم اكتب المسافة الحقيقية">📏 معايرة بنقطتين</button><button data-ia="del" class="danger">حذف</button></div>
      <div class="img-f"><button data-ia="hand" ${im.screen ? "disabled" : ""} title="اسحب الصورة لتحريكها، واسحب أحد أركانها لتغيير حجمها (Shift: بدون حفظ النسبة)">✥ تحريك وتحجيم باليد</button><label class="za-r"><input type="checkbox" data-ik="screen" ${im.screen ? "checked" : ""}/> 📌 تثبيت: خلفية كاملة للشاشة</label></div></div>`).join("");
    el.innerHTML = `<div class="za-head"><b>Pixel images · صور الخلفية (F9)</b><button data-ia="close">×</button></div><div class="za-body">${rows || '<p class="empty">لا توجد صور. أضف صورة باترون لتتبعها بالرسم.</p>'}
      <div class="za-foot"><button class="primary" data-ia="add">＋ إضافة صورة</button><button data-ia="close">إغلاق</button></div></div>`;
    document.body.append(el);
    el.addEventListener("change", (e) => {
      const t = e.target as HTMLInputElement, k = Number(t.closest<HTMLElement>(".img-row")?.dataset.k), im = list[k], f = t.dataset.ik;
      if (!im || !f) return;
      this.snapshot();
      if (f === "visible") im.visible = t.checked;
      else if (f === "screen") {
        im.screen = t.checked || undefined;
        if (im.screen && this.imgEdit === k) this.imgEdit = null;
        this.changed();
        return void this.openImages();
      } else {
        const v = Number(normalizeFormula(t.value));
        if (!Number.isFinite(v)) return;
        if (f === "w" && v > 0) (im.h = (im.h * v) / im.w), (im.w = v);
        else if (f === "x" || f === "y" || f === "opacity") im[f] = v;
      }
      this.changed();
    });
    el.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement, k = Number(t.closest<HTMLElement>(".img-row")?.dataset.k);
      if (t.dataset.ik === "opacity" && list[k]) (list[k].opacity = Number(t.value)), this.render();
    });
    el.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-ia]"), a = b?.dataset.ia, k = Number(b?.closest<HTMLElement>(".img-row")?.dataset.k);
      if (a === "close") el.remove();
      else if (a === "hand" && list[k]) {
        el.remove();
        this.imgEdit = k;
        list[k].visible = true;
        if (!this.vis.images) this.setVis("images", true);
        this.toast("اسحب الصورة لتحريكها أو ركنها لتغيير الحجم؛ انقر خارجها للإنهاء");
        this.render();
      } else if (a === "del" && list[k]) {
        if (this.imgEdit !== null) this.imgEdit = null;
        this.snapshot();
        list.splice(k, 1);
        this.changed();
        this.openImages();
      } else if (a === "cal" && list[k]) {
        el.remove();
        this.calibrating = k;
        this.calPts = [];
        this.toast("انقر النقطة الأولى المعروفة على الصورة");
      } else if (a === "add") {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "image/png,image/jpeg,image/gif,image/webp";
        inp.onchange = () => {
          const file = inp.files?.[0];
          if (!file) return;
          if (file.size > 8_000_000) return this.toast("الصورة أكبر من 8 ميجابايت");
          const r = new FileReader();
          r.onload = () => {
            const data = String(r.result), img = new Image();
            img.onload = () => {
              this.snapshot();
              // placed at the view centre, 1 pixel = 1 mm until calibrated
              const w = img.naturalWidth, h = img.naturalHeight, c = this.toWorld(this.svg.clientWidth / 2, this.svg.clientHeight / 2);
              list.push({ id: list.reduce((m, q) => Math.max(m, q.id), 0) + 1, name: file.name, data, x: Math.round(c[0] - w / 2), y: Math.round(c[1] - h / 2), w, h, opacity: 0.5, visible: true });
              this.changed();
              this.openImages();
              this.toast("أُضيفت الصورة؛ عايرها بنقطتين لتطابق المقاس الحقيقي");
            };
            img.src = data;
          };
          r.readAsDataURL(file);
        };
        inp.click();
      }
    });
  }

  private calibrating: number | null = null;
  private calPts: Pt[] = [];

  /** Calibration: the second click asks for the real distance; the picture is scaled about
   * the first point so that the two points are that far apart. */
  private calibrateClick(at: Pt): void {
    this.calPts.push(at);
    if (this.calPts.length < 2) return void this.toast("انقر النقطة الثانية");
    const [a, b] = this.calPts, k = this.calibrating as number, im = this.model.images?.[k];
    this.calibrating = null;
    this.calPts = [];
    if (!im) return;
    const d = dist(a, b);
    const el = document.createElement("section");
    el.className = "z-assistant lib-save";
    el.dir = "rtl";
    el.innerHTML = `<div class="za-head"><b>معايرة الصورة</b><button data-cv="close">×</button></div><div class="za-body"><p>المسافة على الصورة الآن ${fmt(Math.round(d * 10) / 10)} مم.</p><div class="za-row"><span>الحقيقية مم</span><input data-cv="real" value=""/></div><div class="za-foot"><button class="primary" data-cv="ok">✓ معايرة</button><button data-cv="close">إلغاء</button></div></div>`;
    document.body.append(el);
    const inp = el.querySelector('[data-cv="real"]') as HTMLInputElement;
    inp.focus();
    const ok = () => {
      const real = Number(normalizeFormula(inp.value));
      if (!(real > 0) || !(d > 0)) return;
      const f = real / d;
      this.snapshot();
      im.x = a[0] + (im.x - a[0]) * f;
      im.y = a[1] + (im.y - a[1]) * f;
      im.w *= f;
      im.h *= f;
      this.changed();
      el.remove();
      this.toast(`عُويرت الصورة (×${fmt(Math.round(f * 1000) / 1000)})`);
    };
    inp.addEventListener("keydown", (e) => e.key === "Enter" && ok());
    el.addEventListener("click", (e) => {
      const c = (e.target as HTMLElement).closest<HTMLElement>("[data-cv]")?.dataset.cv;
      if (c === "close") el.remove();
      else if (c === "ok") ok();
    });
  }

  /** Marker making: one AAMA file with the pieces of every production part, every size and
   * customer, with the amounts (mirrored pieces turned over). */
  exportMarker(): void {
    this.syncPart();
    const r = markerItems(this.model);
    if (!r.parts) return this.toast("لا توجد بارتات إنتاج: حدّد «بارت إنتاج» من نافذة Parts");
    if (r.items.length) download(`${safeFileName(this.model.name)} marker.dxf`, toAamaDxf(r.items, { style: this.model.name, size: "" }), "application/dxf");
    const sizes = new Set(r.items.map((i) => i.size)).size, n = r.items.reduce((a, i) => a + i.piece.quantity, 0);
    if (!r.errors.length) return this.toast(`للتعشيق: ${n} قطعة من ${r.parts} بارت إنتاج × ${sizes} مقاس`);
    document.querySelector(".marker-win")?.remove();
    const el = document.createElement("section");
    el.className = "z-assistant marker-win";
    el.dir = "rtl";
    el.innerHTML = `<div class="za-head"><b>التصدير للتعشيق</b><button data-mk="close">×</button></div><div class="za-body"><p>${r.items.length ? `صُدّر ${n} قطعة (${sizes} مقاس). ` : "لم يُصدَّر شيء. "}هذه تحتاج مراجعة:</p><ul class="mk-list">${r.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>`;
    document.body.append(el);
    el.addEventListener("click", (e) => (e.target as HTMLElement).closest('[data-mk="close"]') && el.remove());
  }

  /** ISO cutter file (Bullmer / FK / Yin, Gerber ISO) from a marker nested in another program. */
  openMarkerForIso(): void {
    if (document.body.classList.contains("embedded") && window.parent !== window) return void window.parent.postMessage({ type: "l7:open-marker" }, "*");
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".dxf,.plt,.hpgl";
    inp.onchange = async () => {
      const file = inp.files?.[0];
      if (file) this.isoFromMarker(file.name, await file.text());
    };
    inp.click();
  }

  isoFromMarker(name: string, text: string): void {
    let m: Marker;
    try {
      m = parseMarker(name, text);
    } catch (e) {
      return this.toast("تعذر قراءة ملف التعشيق: " + (e as Error).message);
    }
    document.querySelector(".iso-win")?.remove();
    const base = safeFileName(name.replace(/\.(dxf|plt|hpgl)$/i, "")) || "marker";
    const n = (f: (p: Marker["pieces"][number]) => number) => m.pieces.reduce((a, p) => a + f(p), 0);
    const el = document.createElement("section");
    el.className = "z-assistant marker-win iso-win";
    el.dir = "rtl";
    el.innerHTML = `<div class="za-head"><b>ملف القص بعد التعشيق · ISO / PLT</b><button data-iso="close">×</button></div><div class="za-body">
      <p dir="rtl"><b>${esc(name)}</b></p>
      <ul class="mk-list"><li>القطع: <b>${m.pieces.length}</b></li><li>طول التعشيق × العرض: <b><bdi dir="ltr">${m.length.toFixed(1)} × ${m.width.toFixed(1)} mm</bdi></b></li>
      <li>نوتشات: ${n((p) => p.notches.length)} · فتحات داخلية: ${n((p) => p.holes.length)} · ثقوب: ${n((p) => p.drills.length)}</li>
      ${m.skipped ? `<li>خطوط لا تُقص (خياطة / نسيج / نص): ${m.skipped}</li>` : ""}</ul>
      <label class="field-inline"><input type="checkbox" data-iso="notch" checked/> قص النوتشات بالسكين</label>
      <label class="field-inline"><input type="checkbox" data-iso="nl" checked/> ISO: كل أمر في سطر</label>
      <label class="field-inline"><input type="checkbox" data-iso="draw" checked/> PLT: رسم خطوط الخياطة والنسيج وعلامات الثقوب (القلم 2)</label>
      <p class="iso-hint">الصيغة: Gerber ISO متري (G71، وحدة 0.1 mm)، السكين M14 / M15، الثقوب M43. الداخل يُقص قبل حد القطعة.<br/>PLT: HPGL، القلم 1 للقص بنفس الترتيب، 40 وحدة / mm.</p>
      <div class="za-foot"><button class="primary" data-iso="save">حفظ ISO</button> <button class="primary" data-iso="plt">حفظ PLT</button></div></div>`;
    document.body.append(el);
    el.addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-iso]")?.dataset.iso;
      if (t === "close") el.remove();
      if (t !== "save" && t !== "plt") return;
      const q = (k: string) => el.querySelector<HTMLInputElement>(`[data-iso="${k}"]`)!.checked;
      const notches = q("notch") ? "slit" : "none";
      if (t === "save") download(`${base}.iso`, toIsoCut(m, { name: base, notches, newline: q("nl") }), "text/plain");
      else download(`${base} cut.plt`, toMarkerPlt(m, { notches, drawing: q("draw") }), "application/vnd.hp-hpgl");
      this.toast(`ملف ${t === "save" ? "ISO" : "PLT"}: ${m.pieces.length} قطعة`);
    });
  }

  /** Arrange parts: all parts as large pictures; a click opens one. */
  openArrange(): void {
    document.querySelector(".arrange-win")?.remove();
    const ps = this.ensureParts();
    this.syncPart();
    const el = document.createElement("section");
    el.className = "arrange-win";
    el.dir = "rtl";
    el.innerHTML = `<div class="ar-head"><b>ترتيب البارتات · ${ps.length}</b><span>انقر بارتاً لفتحه · Esc للإغلاق</span><button data-ar="close">×</button></div><div class="ar-grid">${ps
      .map((p, k) => {
        const pv = this.partPreview(this.partResult(k));
        return `<div class="ar-item${k === (this.model.activePart ?? 0) ? " act" : ""}" data-ar-part="${k}"><svg viewBox="${pv.box}">${pv.svg}</svg><div><b>${String(p.no).padStart(3, "0")}</b> ${esc(p.name)}${p.production ? " ✂" : ""}</div></div>`;
      })
      .join("")}</div>`;
    document.body.append(el);
    const close = () => (el.remove(), document.removeEventListener("keydown", esc_));
    const esc_ = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", esc_);
    el.addEventListener("click", (e) => {
      const t = e.target as HTMLElement, it = t.closest<HTMLElement>("[data-ar-part]");
      if (t.closest('[data-ar="close"]')) close();
      else if (it) (this.switchPart(Number(it.dataset.arPart)), close());
    });
  }

  /** Objects that lie exactly on top of another one (same points within 0.01 mm). */
  duplicates(): number[][] {
    const key = (o: GObj) => {
      const p = o.pts.map(([x, y]) => `${Math.round(x * 100)},${Math.round(y * 100)}`);
      const a = p.join(" "), b = [...p].reverse().join(" ");
      return o.kind + ":" + (a < b ? a : b);
    };
    const groups = new Map<string, number[]>();
    for (const o of this.res.objects.values()) groups.set(key(o), [...(groups.get(key(o)) ?? []), o.id]);
    return [...groups.values()].filter((g) => g.length > 1);
  }

  private duplicatesSvg(): string {
    const out: string[] = [];
    for (const g of this.duplicates())
      for (const id of g) {
        const o = this.res.objects.get(id) as GObj;
        out.push(o.kind === "point" ? `<circle cx="${this.toScreen(o.pts[0])[0]}" cy="${this.toScreen(o.pts[0])[1]}" r="7" fill="none" stroke="#ff00d4" stroke-width="2.5"/>` : `<polyline points="${o.pts.map((p) => this.toScreen(p).join(",")).join(" ")}" fill="none" stroke="#ff00d4" stroke-width="3.5" opacity="0.8"/>`);
      }
    return out.join("");
  }

  toggleDuplicates(): void {
    this.showDup = !this.showDup;
    const n = this.duplicates().reduce((a, g) => a + g.length - 1, 0);
    this.toast(this.showDup ? (n ? `${n} عنصر مكرر مُبرز باللون الوردي` : "لا توجد عناصر مكررة") : "إخفاء إبراز المكرر");
    this.render();
  }

  /** Visibility window (Alt+O): which kinds of elements the drawing shows. */
  /** User colours for the drawing (kept on this computer): straight lines, curves, points,
   * the near-pointer mark and the drawing background. */
  private colors(): Record<string, string> {
    try {
      return JSON.parse(localStorage.getItem("level7.colors") || "{}") || {};
    } catch {
      return {};
    }
  }
  private colorOf(k: string): string {
    const c = this.colors()[k];
    if (c) return c;
    const v = getComputedStyle(document.body).getPropertyValue(k === "--canvas" ? "--bg" : k).trim() || "#888888";
    return /^#[0-9a-f]{6}$/i.test(v) ? v : k === "--near" ? "#f2e85c" : k === "--curve" ? this.colorOf("--line") : "#888888";
  }
  private setColor(k: string, v: string): void {
    const c = this.colors();
    c[k] = v;
    if (k === "--canvas") {
      // a background that hides the lines: those colours turn to readable ones (as on a dark / light sheet)
      const dark = luminance(v) < 0.35;
      const auto: Record<string, string> = dark ? { "--line": "#e6e8ec", "--curve": "#a9c4dc", "--point": "#ff6b6b" } : { "--line": "#1f2430", "--curve": "#5b6270", "--point": "#d32f2f" };
      const changed: string[] = [];
      for (const key of ["--line", "--curve", "--point"]) {
        if (contrast(this.colorOf(key), v) < 3) (c[key] = auto[key]), changed.push(COLOR_KEYS.find(([q]) => q === key)![1]);
      }
      if (changed.length) this.toast(`الخلفية ${dark ? "داكنة" : "فاتحة"}: تغيّر لون ${changed.join(" و")} ليظهر عليها`);
    }
    try {
      localStorage.setItem("level7.colors", JSON.stringify(c));
    } catch {}
    this.applyColors();
    this.render();
  }
  applyColors(): void {
    const c = this.colors(), st = document.body.style; // on body: the theme sets its colours there
    for (const [k] of COLOR_KEYS) if (k !== "--canvas") c[k] ? st.setProperty(k, c[k]) : st.removeProperty(k);
    this.svg.style.background = c["--canvas"] ?? "";
    // labels, halos and handles on the drawing follow the background's lightness
    const bg = c["--canvas"], sv = this.svg.style;
    document.body.classList.toggle("canvas-dark", !!bg && luminance(bg) < 0.35);
    document.body.classList.toggle("canvas-light", !!bg && luminance(bg) >= 0.35);
    if (bg) {
      const dark = luminance(bg) < 0.35;
      sv.setProperty("--bg", bg);
      sv.setProperty("--text", dark ? "#e8eaed" : "#1f2430");
      sv.setProperty("--muted", dark ? "#9aa3ad" : "#6b7280");
    } else for (const k of ["--bg", "--text", "--muted"]) sv.removeProperty(k);
  }

  openVisibility(): void {
    const old = document.querySelector(".vis-win");
    if (old) return old.remove();
    const el = document.createElement("section");
    el.className = "z-assistant vis-win";
    el.dir = "rtl";
    const items: [keyof App["vis"] | "pieces", string][] = [["points", "النقاط"], ["dims", "الأبعاد (F7)"], ["marks", "الغرز والعلامات"], ["texts", "النصوص"], ["ghosts", "البارتات الباهتة"], ["pieces", "القطع ومسافة الخياطة"], ["lengths", "أطوال الخطوط (F8)"], ["images", "صور الخلفية (F9)"]];
    el.innerHTML = `<div class="za-head"><b>Visibility · الرؤية</b><button data-v="close">×</button></div><div class="za-body">${items
      .map(([k, l]) => `<label class="za-r"><input type="checkbox" data-vk="${k}" ${(k === "pieces" ? this.showPieces : this.vis[k]) ? "checked" : ""}/> ${l}</label>`)
      .join("")}<label class="za-r"><input type="checkbox" data-vk="dup" ${this.showDup ? "checked" : ""}/> إبراز العناصر المكررة (F4)</label>
      <div class="vis-colors"><b>الألوان</b>${COLOR_KEYS.map(([k, l]) => `<label class="za-r"><input type="color" data-ck="${k}" value="${this.colorOf(k)}"/> ${l}</label>`).join("")}<button data-v="reset-colors">الألوان الأصلية</button></div></div>`;
    document.body.append(el);
    el.addEventListener("change", (e) => {
      const t = e.target as HTMLInputElement, k = t.dataset.vk;
      if (k === "pieces") (this.showPieces = t.checked), this.render();
      else if (k === "dup") this.showDup !== t.checked && this.toggleDuplicates();
      else if (k) this.setVis(k as keyof App["vis"], t.checked);
    });
    el.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement;
      if (!t.dataset.ck) return;
      this.setColor(t.dataset.ck, t.value);
      // the background may have turned the line colours readable: show them
      if (t.dataset.ck === "--canvas") el.querySelectorAll<HTMLInputElement>("[data-ck]").forEach((i) => i !== t && (i.value = this.colorOf(i.dataset.ck as string)));
    });
    el.addEventListener("click", (e) => {
      if (!(e.target as HTMLElement).closest('[data-v="reset-colors"]')) return;
      try {
        localStorage.removeItem("level7.colors");
      } catch {}
      this.applyColors();
      el.querySelectorAll<HTMLInputElement>("[data-ck]").forEach((i) => (i.value = this.colorOf(i.dataset.ck as string)));
      this.render();
    });
    el.addEventListener("click", (e) => (e.target as HTMLElement).closest('[data-v="close"]') && el.remove());
  }

  /** Texts on the drawing; {X1} / {Z3} show the current values. */
  private textsSvg(): string {
    this.textHits = [];
    const vars = new Vars(withSize(this.model), undefined, this.res.z);
    const num = (src: string, d: number) => {
      try {
        return vars.eval(src);
      } catch {
        return d;
      }
    };
    const out: string[] = [];
    this.model.steps.forEach((st, i) => {
      if (st.op !== "text" || this.res.stepErrors.has(i)) return;
      let at: Pt;
      try {
        at = this.pointOf(st.at);
      } catch {
        return;
      }
      const txt = st.text.replace(/\{\s*([XZxz]\d+)\s*\}/g, (_, r) => {
        const v = num(r, NaN);
        return Number.isFinite(v) ? fmt(Math.round(v * 10) / 10) : r;
      });
      const [x, y] = this.toScreen(at), h = Math.max(6, num(st.size || "6", 6) * this.scale), ang = -num(st.angle || "0", 0);
      out.push(`<text class="pat-text" x="${x}" y="${y}" style="font-size:${h.toFixed(1)}px" transform="rotate(${ang} ${x} ${y})">${esc(txt)}</text>`);
      this.textHits.push({ i, s: [x, y - h / 2], r: Math.max(14, h * Math.max(1, txt.length) * 0.35) });
    });
    return out.join("");
  }

  private kindOk(id: number, what: "points" | "lines" | "all"): boolean {
    const o = this.res.objects.get(id);
    return !!o && (what === "all" || (what === "points" ? o.kind === "point" : o.kind === "line"));
  }

  /** Objects lying wholly inside the frame of the two picked corners. */
  private inFrame(what: "points" | "lines" | "all"): number[] {
    const [a, b] = this.picks.map((p) => p.at);
    if (!a || !b) return [];
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    return [...this.res.objects.values()].filter((o) => this.kindOk(o.id, what) && o.pts.every(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)).map((o) => o.id);
  }

  /** Delete objects: the steps that made them (or just their part of a multi step), and
   * every later step that depends on them (after a confirmation). */
  removeObjects(ids: Set<number>): void {
    const del = new Set(ids);
    let dependents = 0;
    const keep: Step[] = [];
    for (const st of this.model.steps) {
      const made = createdIds(st), used = usedIds(st);
      if (used.some((id) => del.has(id))) {
        made.forEach((id) => del.add(id));
        dependents++;
        continue;
      }
      if (!made.some((id) => del.has(id))) {
        keep.push(st);
        continue;
      }
      if (made.every((id) => del.has(id))) continue;
      // only some results of a multi step go
      const s2 = JSON.parse(JSON.stringify(st)) as Step;
      if (s2.op === "mirror" || s2.op === "scale") s2.items = s2.items.filter((it) => it.dst === undefined || !del.has(it.dst));
      else if (s2.op === "inherit") s2.items = s2.items.filter((it) => !del.has(it.dst));
      else if (s2.op === "parallels") {
        const k = s2.ids.map((id, n) => (del.has(id) ? -1 : n)).filter((n) => n >= 0);
        Object.assign(s2, { ids: k.map((n) => s2.ids[n]), of: k.map((n) => s2.of[n]), sides: k.map((n) => s2.sides[n]) });
      }
      keep.push(s2);
    }
    const pieces = (this.model.pieces ?? []).filter((pc) => !pc.edges.some((id) => del.has(id)));
    const lostPieces = (this.model.pieces?.length ?? 0) - pieces.length;
    if ((dependents || lostPieces) && !confirm(`${dependents ? `${dependents} خطوة تعتمد على العناصر المحذوفة` : ""}${dependents && lostPieces ? " و" : ""}${lostPieces ? `${lostPieces} قطعة` : ""} ستُحذف أيضاً. متابعة؟`)) return;
    this.snapshot();
    this.model.steps = keep;
    this.model.pieces = pieces;
    for (const id of del) delete this.model.names[id];
    this.selectedStep = -1;
    this.changed();
    this.toast(`حُذف ${ids.size} عنصر${dependents ? ` و${dependents} خطوة تابعة` : ""}`);
  }

  /** Go back to step i: every later step is removed (one undo brings them all back). */
  backTo(i: number): void {
    const later = this.model.steps.length - 1 - i;
    if (later <= 0) return;
    if (!confirm(`الرجوع إلى الخطوة ${i + 1}: حذف ${later} خطوة بعدها؟ (Ctrl+Z يعيدها)`)) return;
    this.snapshot();
    for (const st of this.model.steps.splice(i + 1)) for (const id of createdIds(st)) delete this.model.names[id];
    this.selectedStep = i;
    this.changed();
    this.toast(`رجوع إلى الخطوة ${i + 1}: حُذفت ${later} خطوة`);
  }

  private deleteStep(i: number): void {
    const s = this.model.steps[i];
    const ids = createdIds(s);
    const users = this.model.steps.slice(i + 1).filter((t) => usedIds(t).some((id) => ids.includes(id)));
    if (ids.length && users.length && !confirm(`${users.length} خطوة لاحقة تعتمد على هذه الخطوة وستظهر فيها أخطاء. حذف؟`)) return;
    this.snapshot();
    this.model.steps.splice(i, 1);
    for (const id of ids) delete this.model.names[id];
    this.selectedStep = -1;
    this.changed();
  }

  private renderPieces(): void {
    const box = $("#tab-pieces");
    const pieces = this.model.pieces ?? [];
    const head = `<div class="piece-top">
        <label class="field-inline">اسم المقاس الأساسي <input data-size value="${esc(this.model.size ?? "")}" placeholder="مثل 52"/></label>
        <label class="field-inline"><input type="checkbox" data-show ${this.showPieces ? "checked" : ""}/> إظهار القطع على الرسم</label>
      </div>`;
    if (!pieces.length) {
      box.innerHTML = head + `<div class="empty">لا توجد قطع بعد.<br>استخدم أداة «قطعة من الحدود»: انقر حدود القطعة بالترتيب حولها ثم Enter. الخطوط الزائدة تُقص تلقائياً عند نقاط التقاء الحدود.</div>`;
    } else {
      box.innerHTML =
        head +
        pieces
          .map((pc, i) => {
            const err = this.res.pieceErrors.get(pc.id);
            const nm = (id: number) => esc(this.model.names[id] ?? `#${id}`);
            return `<section class="piece-card" data-p="${i}">
            <div class="piece-head"><input data-pf="name" value="${esc(pc.name)}"/><button class="danger" data-pdel title="حذف القطعة">حذف</button></div>
            ${err ? `<div class="err">${esc(err)}</div>` : ""}
            <div class="piece-grid">
              <label>العدد <input data-pf="quantity" type="number" lang="en" dir="ltr" min="1" value="${pc.quantity}"/></label>
              <label>القماش <input data-pf="fabric" value="${esc(pc.fabric)}"/></label>
              <label>خط النسيج ° <input class="expr" data-pf="grain" value="${esc(pc.grain)}"/></label>
              <label title="القطعة نصف تُفتح حول هذا الحد (بلا مسافة خياطة عليه)، وتُقص وتُصدَّر كاملة">خط الطي <select data-pfold><option value="">— بدون —</option>${pc.edges.map((id) => `<option value="${id}" ${pc.fold === id ? "selected" : ""}>${nm(id)}</option>`).join("")}</select></label>
            </div>
            <table class="grid"><thead><tr><th>الحد</th><th>مسافة الخياطة مم</th><th title="غير متوازية: القيمة عند نهاية الحد (فارغ = متوازية)">عند النهاية</th></tr></thead><tbody>
              ${pc.edges.map((id, k) => `<tr><td class="id">${nm(id)}</td><td><input class="expr" data-seam="${k}" value="${esc(pc.seam[k] ?? "0")}"/></td><td><input class="expr" data-seam-end="${k}" placeholder="—" value="${esc(pc.seamEnd?.[k] ?? "")}"/></td></tr>`).join("")}
            </tbody></table>
            <div class="notches">النوتشات: ${
              pc.notches.length
                ? pc.notches.map((r, k) => `<span class="chip">${nm(r.obj)}${r.end ? (r.end === "start" ? " (بداية)" : " (نهاية)") : ""} <input class="expr nlen" data-nlen="${k}" value="${esc(pc.notchLen?.[k] ?? "")}" placeholder="6" title="طول النوتش (رقم أو X/Z)"/><button data-ndel="${k}" title="حذف">×</button></span>`).join(" ")
                : "لا يوجد. أضفها بأداة «نوتش»"
            }</div>
          </section>`;
          })
          .join("");
    }
    box.querySelector<HTMLInputElement>("[data-size]")?.addEventListener("change", (e) => {
      this.snapshot();
      this.model.size = (e.target as HTMLInputElement).value.trim();
      autosave(this.model);
    });
    box.querySelector<HTMLInputElement>("[data-show]")?.addEventListener("change", (e) => {
      this.showPieces = (e.target as HTMLInputElement).checked;
      this.render();
    });
    box.querySelectorAll<HTMLElement>(".piece-card").forEach((card) => {
      const pc = pieces[Number(card.dataset.p)];
      let snapped = false;
      const edit = (fn: () => void) => {
        if (!snapped) {
          this.snapshot();
          snapped = true;
        }
        fn();
        this.changed(false);
      };
      card.querySelectorAll<HTMLInputElement>("input[data-pf]").forEach((inp) =>
        inp.addEventListener("input", () =>
          edit(() => {
            const f = inp.dataset.pf as "name" | "quantity" | "fabric" | "grain";
            if (f === "quantity") pc.quantity = Math.max(1, Math.round(Number(inp.value) || 1));
            else pc[f] = inp.value;
          }),
        ),
      );
      card.querySelectorAll<HTMLInputElement>("input[data-seam]").forEach((inp) =>
        inp.addEventListener("input", () => edit(() => (pc.seam[Number(inp.dataset.seam)] = inp.value))),
      );
      card.querySelectorAll<HTMLInputElement>("input[data-seam-end]").forEach((inp) =>
        inp.addEventListener("input", () =>
          edit(() => {
            pc.seamEnd ??= pc.edges.map(() => "");
            while (pc.seamEnd.length < pc.edges.length) pc.seamEnd.push("");
            pc.seamEnd[Number(inp.dataset.seamEnd)] = inp.value;
            if (!pc.seamEnd.some((x) => x.trim())) delete pc.seamEnd;
          }),
        ),
      );
      card.querySelectorAll("input").forEach((inp) => inp.addEventListener("change", () => ((snapped = false), this.renderPieces())));
      card.querySelector<HTMLSelectElement>("[data-pfold]")?.addEventListener("change", (e) => {
        const v = (e.target as HTMLSelectElement).value;
        this.snapshot();
        if (v) pc.fold = Number(v);
        else delete pc.fold;
        this.changed();
      });
      card.querySelector("[data-pdel]")?.addEventListener("click", () => {
        if (!confirm(`حذف القطعة «${pc.name}»؟`)) return;
        this.snapshot();
        this.model.pieces = pieces.filter((p) => p !== pc);
        this.changed();
      });
      card.querySelectorAll<HTMLInputElement>("[data-nlen]").forEach((inp) =>
        inp.addEventListener("change", () => {
          this.snapshot();
          const k = Number(inp.dataset.nlen);
          pc.notchLen ??= [];
          while (pc.notchLen.length < pc.notches.length) pc.notchLen.push("");
          pc.notchLen[k] = inp.value.trim();
          this.changed();
        }),
      );
      card.querySelectorAll<HTMLElement>("[data-ndel]").forEach((b) =>
        b.addEventListener("click", () => {
          this.snapshot();
          pc.notches.splice(Number(b.dataset.ndel), 1);
          pc.notchTypes?.splice(Number(b.dataset.ndel), 1);
          pc.notchLen?.splice(Number(b.dataset.ndel), 1);
          this.changed();
        }),
      );
    });
  }

  /** World box of a size's drawing. */
  private boxOf(res: EvalResult): [number, number, number, number] | null {
    const all = [...res.objects.values()].flatMap((o) => o.pts);
    if (!all.length) return null;
    const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  /** Side by side: where each size goes (x / y shift in mm), in rows and columns chosen to show
   * them as large as the screen allows; the active size stays where it is drawn (first place). */
  private sideShifts(): Pt[] {
    const boxes = this.nest.map((n) => this.boxOf(n.res));
    const w = Math.max(1, ...boxes.map((b) => (b ? b[2] - b[0] : 0)));
    const h = Math.max(1, ...boxes.map((b) => (b ? b[3] - b[1] : 0)));
    const r = this.svg.getBoundingClientRect(), n = this.nest.length;
    let gx = Math.max(40, w * 0.15), gy = Math.max(60, h * 0.25), cols = n, best = 0;
    const choose = () => {
      best = 0;
      for (let c = 1; c <= n; c++) {
        const rows = Math.ceil(n / c), sc = Math.min((r.width || 1000) / (c * (w + gx)), (r.height || 700) / (rows * (h + gy)));
        if (sc > best) (best = sc), (cols = c);
      }
    };
    choose();
    // room on screen between rows for the size name (below) and the measures (above): about 84 px
    if (gy * best < 84 || gx * best < 24) {
      gy = Math.max(gy, 84 / best);
      gx = Math.max(gx, 24 / best);
      choose();
      gy = Math.max(gy, 84 / best);
    }
    const active = (this.model.activeSize ?? -1) + 1;
    let k = 0;
    return this.nest.map((_n, i) => {
      const p = i === active ? 0 : ++k;
      return [(p % cols) * (w + gx), -Math.floor(p / cols) * (h + gy)];
    });
  }

  /** Fit the view to every size laid side by side. */
  private fitAll(): void {
    const sh = this.sideShifts();
    const boxes = this.nest.map((n, i) => {
      const b = this.boxOf(n.res);
      return b ? [b[0] + sh[i][0], b[1] + sh[i][1], b[2] + sh[i][0], b[3] + sh[i][1]] : null;
    }).filter((b): b is number[] => !!b);
    if (!boxes.length) return;
    const x0 = Math.min(...boxes.map((b) => b[0])), x1 = Math.max(...boxes.map((b) => b[2])), y0 = Math.min(...boxes.map((b) => b[1])), y1 = Math.max(...boxes.map((b) => b[3]));
    const r = this.svg.getBoundingClientRect();
    // same room as Fit: the tool card on the right, the parts strip on the left
    const side = document.body.classList.contains("embedded") ? Math.min(240, r.width * 0.25) : 0;
    const ps = document.querySelector<HTMLElement>(".part-strip"), left = ps && ps.offsetWidth && this.stripMode === "permanent" ? ps.offsetWidth : 0;
    this.cx = (x0 + x1) / 2;
    this.cy = (y0 + y1) / 2;
    this.scale = Math.min((r.width - 120 - side - left) / Math.max(x1 - x0, 50), (r.height - 160) / Math.max(y1 - y0, 50));
    this.cx += (side - left) / 2 / this.scale;
    this.render();
  }

  private nestSvg(): string {
    const out: string[] = [];
    const side = this.gradeView === "side";
    const sh: Pt[] = side ? this.sideShifts() : this.nest.map(() => [0, 0] as Pt);
    const active = (this.model.activeSize ?? -1) + 1;
    this.nest.forEach((n, i) => {
      // side by side: the active size is the normal drawing; the others are copies to its right
      if (side && i === active) {
        const b = this.boxOf(n.res);
        if (b) out.push(this.sizeLabel(n.name, n.color, b, [0, 0], true));
        return;
      }
      const pts = (p: Pt[]) => p.map((q) => this.toScreen([q[0] + sh[i][0], q[1] + sh[i][1]]).map((v) => v.toFixed(1)).join(",")).join(" ");
      const wid = side ? 1.4 : 1.2;
      if (n.res.pieces.size) {
        for (const g of n.res.pieces.values()) out.push(`<polygon points="${pts(g.cut)}" fill="none" stroke="${n.color}" stroke-width="${wid}" opacity="0.95"/>`);
        if (side) for (const o of n.res.objects.values()) if (o.kind === "line") out.push(`<polyline points="${pts(o.pts)}" fill="none" stroke="${n.color}" stroke-width="0.8" opacity="0.45"/>`);
      } else {
        for (const o of n.res.objects.values())
          if (o.kind === "line") out.push(`<polyline points="${pts(o.pts)}" fill="none" stroke="${n.color}" stroke-width="${side ? 1.3 : 1}" opacity="${side ? 0.95 : 0.8}"/>`);
      }
      const b = this.boxOf(n.res);
      if (side && b) out.push(this.sizeLabel(n.name, n.color, b, sh[i], false));
    });
    return out.join("");
  }

  /** Under each size: its name; above it: its width and height (mm, in the display unit). */
  private sizeLabel(name: string, color: string, b: [number, number, number, number], d: Pt, active: boolean): string {
    const [l, t] = this.toScreen([b[0] + d[0], b[3] + d[1]]), [r, btm] = this.toScreen([b[2] + d[0], b[1] + d[1]]);
    const cx = ((l + r) / 2).toFixed(1);
    const u = this.model.unit === "in" ? (v: number) => (v / 25.4).toFixed(2) + "″" : (v: number) => v.toFixed(1);
    return `<text x="${cx}" y="${(btm + 22).toFixed(1)}" text-anchor="middle" fill="${color}" font-size="15" font-weight="700" style="pointer-events:none">\u2068${esc(name)}\u2069${active ? " ✎" : ""}</text>` +
      `<text x="${cx}" y="${(t - 8).toFixed(1)}" text-anchor="middle" fill="${color}" font-size="12" direction="ltr" style="pointer-events:none">\u2066${u(b[2] - b[0])} × ${u(b[3] - b[1])}\u2069</text>`;
  }

  private renderSizeSelect(): void {
    const sel = $<HTMLSelectElement>("#size-select");
    const active = this.model.activeSize ?? -1;
    const opts = [-1, ...(this.model.sizes ?? []).map((_, i) => i)];
    sel.innerHTML = opts.map((i) => `<option value="${i}"${i === active ? " selected" : ""}>${esc(sizeName(this.model, i))}</option>`).join("");
    sel.onchange = () => this.setSize(Number(sel.value));
    // inside LEVEL7 and MTM the size and unit lists are in the program's command bar
    if (document.body.classList.contains("embedded") && window.parent !== window)
      window.parent.postMessage({ type: "l7:sizes", sizes: opts.map((i) => ({ value: i, name: sizeName(this.model, i) })), active, unit: this.model.unit ?? "mm" }, "*");
  }

  setSize(i: number): void {
    this.model.activeSize = i;
    this.changed();
  }

  setUnit(u: "mm" | "in"): void {
    this.snapshot();
    this.toast(u === "in" ? "قيم الأبعاد بالبوصة" : "قيم الأبعاد بالمليمتر");
    this.model.unit = u;
    $<HTMLSelectElement>("#unit-select").value = u;
    this.changed();
  }

  private renderSizes(): void {
    this.renderSizeSelect();
    const box = $("#tab-sizes");
    const sizes = this.model.sizes ?? [];
    const g = this.model.grading ?? {};
    const head = sizes
      .map(
        (sz, i) => `<th class="size-col${sz.kind === "customer" ? " customer" : ""}${sz.off ? " sz-off" : ""}">
          <label class="sz-on" title="مفعّل: يدخل في التعشيق والتصدير لكل المقاسات"><input type="checkbox" data-son="${i}"${sz.off ? "" : " checked"}/></label>
          <input data-sname="${i}" value="${esc(sz.name)}" title="اسم المقاس أو الزبون"/>
          ${
            sz.kind === "customer"
              ? `<div class="step">زبون</div>`
              : `<div class="step">درجة <input type="text" inputmode="decimal" lang="en" dir="ltr" data-sstep="${i}" value="${sz.step}" title="عدد درجات التدرج عن الأساسي"/></div>`
          }
          <button class="danger" data-sdel="${i}" title="حذف المقاس">×</button></th>`,
      )
      .join("");
    const rows = this.model.measurements
      .map(
        (m) => `<tr>
          <td class="id">X${m.id}</td><td class="mname">${esc(m.name)}</td>
          <td class="base">${m.value}</td>
          <td class="grade"><input class="expr" type="text" inputmode="decimal" lang="en" dir="ltr" data-grade="${m.id}" value="${g[m.id] ?? ""}" placeholder="0"/></td>
          ${sizes.map((sz, i) => `<td><input class="expr" type="text" inputmode="decimal" lang="en" dir="ltr" data-sv="${i}:${m.id}" value="${sz.values[m.id] ?? ""}" placeholder="${m.value}"/></td>`).join("")}
        </tr>`,
      )
      .join("");
    box.innerHTML = `
      <div class="table-actions size-top">
        <button data-sadd title="الخانة الفارغة في عمود مقاس تأخذ القيمة الأساسية">إضافة مقاس</button>
        <button data-cadd>إضافة زبون</button>
        <button data-sfill title="قيمة كل مقاس = الأساسي + الدرجة × التدرج">تعبئة بالتدرج</button>
        <button data-cimport title="CSV: سطر لكل زبون، أو JSON: طلب أو قائمة طلبات">استيراد زبائن (CSV / JSON)</button>
        <label class="field-inline">وحدة الملف <select data-cunit><option value="mm">مم</option><option value="cm">سم</option><option value="in">إنش</option></select></label>
        <button class="primary" data-sizes-mlib title="إنشاء منتجات في مكتبة القياسات، إضافة قياساتها وتعديلها، أو نسخ جدول منتج إلى هذا التصميم">📚 مكتبة القياسات</button>
      </div>
      <label class="field-inline"><input type="checkbox" data-nest ${this.showNest ? "checked" : ""}/> عرض كل المقاسات (فوق بعض أو جنباً إلى جنب من زر «Grading» في الشريط)</label>
      ${this.showNest ? `<div class="legend">${this.nest.map((n) => `<span><i style="background:${n.color}"></i>${esc(n.name)}</span>`).join("")}</div>` : ""}
      <div class="size-table"><table class="grid"><thead><tr><th class="id">رمز</th><th class="mname">القياس</th><th class="base">${esc(sizeName(this.model, -1))}</th><th class="grade">التدرج</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;

    let snapped = false;
    const edit = (fn: () => void, panels = false) => {
      if (!snapped) {
        this.snapshot();
        snapped = true;
      }
      fn();
      this.changed(panels);
      if (!panels) this.renderSizeSelect();
    };
    const num = (v: string) => { const t = normalizeFormula(v).trim(); return t === "" || Number.isNaN(Number(t)) ? undefined : Number(t); }; // Arabic digits are read too
    box.querySelectorAll<HTMLInputElement>("input").forEach((inp) => inp.addEventListener("change", () => (snapped = false)));
    box.querySelectorAll<HTMLInputElement>("[data-sname]").forEach((inp) =>
      inp.addEventListener("input", () => edit(() => (sizes[Number(inp.dataset.sname)].name = inp.value))),
    );
    box.querySelectorAll<HTMLInputElement>("[data-sstep]").forEach((inp) =>
      inp.addEventListener("input", () => edit(() => (sizes[Number(inp.dataset.sstep)].step = num(inp.value) ?? 0))),
    );
    box.querySelectorAll<HTMLInputElement>("[data-grade]").forEach((inp) =>
      inp.addEventListener("input", () =>
        edit(() => {
          this.model.grading ??= {};
          const v = num(inp.value);
          if (v === undefined) delete this.model.grading[Number(inp.dataset.grade)];
          else this.model.grading[Number(inp.dataset.grade)] = v;
        }),
      ),
    );
    box.querySelectorAll<HTMLInputElement>("[data-sv]").forEach((inp) =>
      inp.addEventListener("input", () =>
        edit(() => {
          const [i, id] = (inp.dataset.sv as string).split(":").map(Number);
          const v = num(inp.value);
          if (v === undefined) delete sizes[i].values[id];
          else sizes[i].values[id] = v;
        }),
      ),
    );
    box.querySelectorAll<HTMLElement>("[data-sdel]").forEach((b) =>
      b.addEventListener("click", () => {
        this.deleteSize(Number(b.dataset.sdel));
      }),
    );
    box.querySelector("[data-sadd]")?.addEventListener("click", () => {
      this.snapshot();
      this.model.sizes ??= [];
      const step = this.model.sizes.reduce((a, s) => Math.max(a, s.step), 0) + 1;
      this.model.sizes.push({ name: `مقاس ${this.model.sizes.length + 2}`, step, values: {} });
      fillGrading({ ...this.model, sizes: [this.model.sizes[this.model.sizes.length - 1]] });
      this.changed();
    });
    box.querySelector("[data-cadd]")?.addEventListener("click", () => {
      this.snapshot();
      this.model.sizes ??= [];
      this.model.sizes.push({ name: `زبون ${this.model.sizes.filter((x) => x.kind === "customer").length + 1}`, kind: "customer", step: 0, values: {} });
      this.changed();
    });
    box.querySelector("[data-cimport]")?.addEventListener("click", () => {
      this.importUnit = (box.querySelector("[data-cunit]") as HTMLSelectElement).value as Unit;
      this.pickFile("customers");
    });
    box.querySelector("[data-sfill]")?.addEventListener("click", () => {
      if (!Object.keys(this.model.grading ?? {}).length) {
        this.toast("أدخل قيم التدرج أولاً في عمود «التدرج»");
        return;
      }
      if (!confirm("تعبئة قيم المقاسات من التدرج؟ القيم المكتوبة للقياسات المتدرجة ستُستبدل.")) return;
      this.snapshot();
      fillGrading(this.model);
      this.changed();
    });
    box.querySelector("[data-sizes-mlib]")?.addEventListener("click", () => this.openMLib());
    box.querySelector<HTMLInputElement>("[data-nest]")?.addEventListener("change", (e) => {
      this.gradeView = (e.target as HTMLInputElement).checked ? "stack" : "off";
      this.evaluate();
      this.renderSizes();
      this.render();
    });
  }

  /** Export (command bar): AAMA / PLT of every active size in one file. */
  exportAllSizes(kind: "aama" | "plt"): void {
    this.syncPart();
    const { items, errors } = allSizeItems(this.model);
    if (!items.length) return this.toast("لا توجد قطع للتصدير");
    const base = `${safeFileName(this.model.name)}_all-sizes`;
    if (kind === "aama") download(`${base}.dxf`, toAamaDxf(items, { style: this.model.name, size: "" }), "application/dxf");
    else download(`${base}.plt`, toPlt(items, { size: "" }), "application/vnd.hp-hpgl");
    if (errors.length) this.toast(`لم تُصدَّر ${errors.length} قطعة بسبب أخطاء: ${errors[0]}`);
  }

  /** Export (command bar): AAMA of the base size with grade rule numbers + the RUL table. */
  exportGraded(): void {
    this.syncPart();
    if (!this.model.pieces?.length) {
      this.toast("لا توجد قطع للتصدير");
      return;
    }
    if (!this.model.sizes?.length) {
      this.toast("أضف مقاسات أولاً: قواعد التدرج تحتاج أكثر من مقاس");
      return;
    }
    const steps = [0, ...this.model.sizes.filter((s) => s.kind !== "customer").map((s) => s.step)];
    if (new Set(steps).size !== steps.length) {
      this.toast("لكل مقاس درجة مختلفة في جدول التدرج (والأساسي درجته 0). الزبائن لا تُصدَّر بقواعد التدرج");
      return;
    }
    const r = toGradedAama(this.model);
    const base = safeFileName(this.model.name);
    download(`${base}.dxf`, r.dxf, "application/dxf");
    setTimeout(() => download(`${base}.rul`, r.rul, "text/plain"), 300);
    this.toast(
      r.errors.length
        ? `صُدّر مع أخطاء: ${r.errors[0]}`
        : `صُدّر ${this.model.pieces.length} قطعة بـ ${r.rules} قاعدة تدرج للمقاسات ${r.sizes.join(" ")} (الأساسي ${r.sample})`,
    );
  }

  /** X values, laid out as GRAFIS: a dense table X | name | MTM | Standard | one column per
   * size, a tool bar (add / delete the selected row) and a search box. */
  private xSel = -1;
  private xFilter = "";

  /** delete a size / customer column (asks first); the drawing stays on the same size if another one goes */
  deleteSize(i: number): void {
    const sizes = this.model.sizes ?? [], sz = sizes[i];
    // X / Z tables are not in the drawing's undo history, so it asks first
    if (!sz || !confirm(`حذف ${sz.kind === "customer" ? "الزبون" : "المقاس"} «${sz.name}» وكل قيمه؟ (لا يمكن التراجع عنه بـ Ctrl+Z)`)) return;
    sizes.splice(i, 1);
    const a = this.model.activeSize ?? -1;
    if (a === i) this.model.activeSize = -1;
    else if (a > i) this.model.activeSize = a - 1;
    this.changed();
    this.renderSizeSelect();
    this.toast(`حُذف «${sz.name}»`);
  }

  private renderX(): void {
    const box = $("#tab-x");
    const sizes = this.model.sizes ?? [];
    const f = this.xFilter.trim().toLowerCase();
    const rows = this.model.measurements
      .map((m, i) => {
        if (f && !`x${m.id} ${m.name} ${m.code ?? ""}`.toLowerCase().includes(f)) return "";
        const cells = sizes
          .map((sz, k) => `<td class="xv sz"><input class="num" type="text" inputmode="decimal" dir="ltr" lang="en" data-sz="${k}" data-xid="${m.id}" value="${sz.values[m.id] ?? ""}" placeholder="${fmt(m.value)}" title="${esc(sz.name)}"/></td>`)
          .join("");
        return `<tr data-row="${i}" class="${i === this.xSel ? "sel" : ""}">
          <td class="xid">X${m.id}</td>
          <td class="xn"><input data-i="${i}" data-f="name" value="${esc(m.name)}" placeholder="—"/></td>
          <td class="xc"><input dir="ltr" data-i="${i}" data-f="code" value="${esc(m.code ?? "")}" placeholder="—" title="اسم هذا القياس في نظام MTM أو ملف الاستيراد"/></td>
          <td class="xv"><input class="expr num" type="text" inputmode="decimal" dir="ltr" lang="en" data-i="${i}" data-f="value" value="${m.value}"/></td>${cells}
        </tr>`;
      })
      .join("");
    // a tick above every size: switched-off sizes stay out of the marker and the all-size exports
    const tick = (i: number) => `<label class="sz-on" title="مفعّل: يدخل في التعشيق والتصدير لكل المقاسات"><input type="checkbox" data-son="${i}"${sizeActive(this.model, i) ? " checked" : ""}/></label>`;
    const head = sizes.map((sz, i) => `<th class="sz${sz.off ? " sz-off" : ""}" title="${sz.kind === "customer" ? "زبون" : "مقاس"}"><button class="sz-del" data-sdel-x="${i}" title="حذف هذا العمود (${esc(sz.name)})" aria-label="حذف"></button>${tick(i)}${esc(sz.name)}</th>`).join("");
    box.innerHTML = `<div class="xgrid">
      <div class="xg-bar"><button data-add class="xg-add" title="إضافة قياس X">⊕</button><button data-xa="del" class="xg-del" title="حذف القياس المحدد"${this.xSel < 0 ? " disabled" : ""}>✕</button>
        <button data-xa="mlib" class="xg-lib" title="مكتبة القياسات: اختر جدول قياسات محفوظ لموديل، أو احفظ هذا الجدول فيها">📚 مكتبة القياسات</button>
        <span class="xg-info">${this.model.mlibFrom ? `من المكتبة: «${esc(this.model.mlibFrom.name)}» · ` : ""}${this.model.measurements.length} X · ${sizes.length + 1} ${sizes.length ? "مقاسات" : "مقاس"}</span></div>
      <div class="xg-table"><table><thead><tr><th class="xid">X</th><th class="xn">الاسم · Name</th><th class="xc">MTM</th><th class="xv${this.model.baseOff ? " sz-off" : ""}">${tick(-1)}${esc(sizeName(this.model, -1))}</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      <div class="xg-foot"><span class="xg-search">⌕<input data-xa="search" value="${esc(this.xFilter)}" placeholder="بحث بالاسم أو الرقم"/><button data-xa="clear" title="مسح البحث">✕</button></span>
        <span class="xg-io"><button data-xa="import" title="رفع القياسات من ملف إكسل (.xlsx) أو CSV">⤓ استيراد Excel</button><button data-xa="export" title="تحميل القياسات كملف إكسل (.xlsx)">⤒ تصدير Excel</button><button data-xa="copy" title="نسخ الجدول (يُلصق في إكسل)">⧉ نسخ</button></span></div></div>`;
    this.bindTable(box, "measurements");
    const tbody = box.querySelector("tbody") as HTMLElement;
    tbody.addEventListener("focusin", (e) => {
      const tr = (e.target as HTMLElement).closest<HTMLElement>("tr[data-row]");
      if (!tr) return;
      this.xSel = Number(tr.dataset.row);
      tbody.querySelectorAll("tr.sel").forEach((r) => r.classList.remove("sel"));
      tr.classList.add("sel");
      (box.querySelector('[data-xa="del"]') as HTMLButtonElement).disabled = false;
    });
    // values per size (empty = the base value)
    let snapped = false;
    box.querySelectorAll<HTMLInputElement>("input[data-sz]").forEach((inp) => {
      inp.addEventListener("input", () => {
        if (!snapped) (this.snapshot(), (snapped = true));
        const sz = sizes[Number(inp.dataset.sz)], id = Number(inp.dataset.xid);
        const v = Number(normalizeFormula(inp.value).trim());
        if (inp.value.trim() === "") delete sz.values[id];
        else if (!Number.isNaN(v)) sz.values[id] = v;
        this.changed(false);
      });
      inp.addEventListener("change", () => (snapped = false));
      inp.addEventListener("focus", () => {
        const v0 = inp.value; // selected only if nothing was typed yet (fast typing keeps its first digit)
        // 0.9.184: selected at once too: keys already waiting (typed while a big drawing was redrawn) then
        // replace the 0 instead of going in front of it (1500 typed gave 15000)
        inp.select();
        setTimeout(() => inp.value === v0 && inp.select(), 0);
        // the mouse-up of the click that focused the field would put the caret back where it was pressed
        inp.addEventListener("mouseup", (e) => inp.value === v0 && (e.preventDefault(), inp.select()), { once: true });
      });
      inp.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const rows = [...tbody.querySelectorAll<HTMLInputElement>(`input[data-sz="${inp.dataset.sz}"]`)];
        const next = rows[rows.indexOf(inp) + 1];
        if (next) next.focus();
        else inp.blur();
      });
    });
    box.querySelectorAll<HTMLElement>("[data-sdel-x]").forEach((b) => b.addEventListener("click", () => this.deleteSize(Number(b.dataset.sdelX))));
    box.querySelector(".xg-bar")?.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>("[data-xa]")?.dataset.xa;
      if (a === "del" && this.xSel >= 0 && this.model.measurements[this.xSel]) {
        const m = this.model.measurements[this.xSel];
        // formulas that use this X (all parts, Z values) would show errors after the delete
        const re = new RegExp(`\\bX0*${m.id}\\b`, "i");
        this.syncPart();
        const uses = [...(this.model.parts ?? [{ steps: this.model.steps }]).flatMap((p) => p.steps), ...this.model.variables].filter((o) => re.test(JSON.stringify(o))).length;
        if (uses && !confirm(`X${m.id} «${m.name}» مستخدمة في ${uses} خطوة / معادلة وستظهر فيها أخطاء. حذف؟`)) return;
        this.snapshot();
        this.model.measurements.splice(this.xSel, 1);
        this.xSel = Math.min(this.xSel, this.model.measurements.length - 1);
        this.changed();
        this.toast(`حُذفت X${m.id}`);
      }
    });
    const search = box.querySelector('[data-xa="search"]') as HTMLInputElement;
    search.addEventListener("input", () => {
      this.xFilter = search.value;
      const pos = search.selectionStart;
      this.renderX();
      const again = $("#tab-x").querySelector('[data-xa="search"]') as HTMLInputElement;
      again.focus();
      if (pos !== null) again.setSelectionRange(pos, pos);
    });
    box.querySelector('[data-xa="export"]')?.addEventListener("click", () => {
      downloadBytes(`${safeFileName(this.model.name)} X.xlsx`, writeXlsx(xTableRows(this.model)), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    });
    box.querySelector('[data-xa="mlib"]')?.addEventListener("click", () => this.openMLib());
    box.querySelector('[data-xa="import"]')?.addEventListener("click", () => {
      if (document.body.classList.contains("embedded") && window.parent !== window) window.parent.postMessage({ type: "l7:open-table" }, "*");
      else {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = ".xlsx,.csv,.txt";
        inp.onchange = async () => {
          const file = inp.files?.[0];
          if (!file) return;
          if (/\.xlsx$/i.test(file.name)) await this.importXFile(file.name, { bytes: new Uint8Array(await file.arrayBuffer()) });
          else await this.importXFile(file.name, { text: await file.text() });
        };
        inp.click();
      }
    });
    box.querySelector('[data-xa="clear"]')?.addEventListener("click", () => ((this.xFilter = ""), this.renderX()));
    box.querySelector('[data-xa="copy"]')?.addEventListener("click", async () => {
      const lines = [["X", "Name", "MTM", sizeName(this.model, -1), ...sizes.map((z) => z.name)].join("\t")];
      for (const m of this.model.measurements) lines.push([`X${m.id}`, m.name, m.code ?? "", String(m.value), ...sizes.map((z) => String(z.values[m.id] ?? m.value))].join("\t"));
      try {
        await navigator.clipboard.writeText(lines.join("\n"));
        this.toast("نُسخ الجدول؛ الصقه في إكسل");
      } catch {
        this.toast("تعذر النسخ");
      }
    });
  }

  /** X values from an Excel (.xlsx) or CSV file: merged into the table (see importXTable). */
  /** Set by the library product editor: the next Excel / CSV file fills that product. */
  private xImportTarget: { e: MEntry; done: () => void } | null = null;

  async importXFile(name: string, data: { text?: string; bytes?: Uint8Array; base64?: string }): Promise<void> {
    try {
      const bytes = data.bytes ?? (data.base64 ? fromBase64(data.base64) : undefined);
      const rows = bytes ? await readXlsx(bytes) : readCsv(data.text ?? "");
      // the library product editor asked for this file: the table goes into that product only
      const target = this.xImportTarget;
      this.xImportTarget = null;
      if (target) {
        const tmp = emptyModel();
        tmp.measurements = target.e.measurements;
        tmp.sizes = target.e.sizes ?? [];
        tmp.size = target.e.size;
        const r = importXTable(tmp, rows);
        target.e.measurements = tmp.measurements;
        target.e.sizes = tmp.sizes;
        target.done();
        return this.toast(`استُورد إلى منتج المكتبة: ${r.added} قياس جديد، ${r.updated} محدَّث${r.sizes.length ? `، المقاسات: ${r.sizes.join("، ")}` : ""} (احفظ في المكتبة)`);
      }
      const r = importXTable(this.model, rows); // tables are not in the drawing history
      this.changed();
      this.toast(`استُورد من ${name}: ${r.added} قياس جديد، ${r.updated} محدَّث${r.sizes.length ? `، المقاسات: ${r.sizes.join("، ")}` : ""}`);
    } catch (e) {
      this.toast(`تعذر الاستيراد: ${(e as Error).message}`);
    }
  }

  private renderZ(): void {
    const box = $("#tab-z");
    // a formula typed into the text (description) field by mistake while the formula is
    // still 0 is moved to the formula field
    for (const v of this.model.variables)
      if (!v.measure && v.expr.trim() === "0" && /[XZ]\d/i.test(v.name) && /^[\sXZxz\d+\-*/().]+$/.test(v.name)) {
        v.expr = v.name.trim();
        v.name = "";
        this.evaluate();
        autosave(this.model);
      }
    const rows = this.model.variables
      .map((v, i) => {
        const val = this.res.z.get(v.id);
        const err = this.res.zErrors.get(v.id);
        const formula = v.measure
          ? `<div class="measure">${esc(describeMeasure(v.measure, this.model)).replace(/⁦(.*?)⁩/g, '<bdi dir="ltr">$1</bdi>')}</div>`
          : `<div class="zf"><span class="zf-eq">Z${v.id}=</span><input class="expr" dir="ltr" lang="en" data-i="${i}" data-f="expr" value="${esc(v.expr)}" placeholder="مثل X2/2"/><button type="button" class="zf-as" data-zas="${i}" title="مساعد المعادلة (شرط IF وقائمة X و Z)">ƒx</button></div>`;
        return `<tr>
          <td class="id">Z${v.id}</td>
          <td class="zf-cell">${formula}</td>
          <td class="zdesc-cell"><textarea class="zdesc" rows="1" data-i="${i}" data-f="name" placeholder="—" title="الوصف">${esc(v.name)}</textarea></td>
          <td class="val${err ? " bad" : ""}" data-zval="${v.id}" title="${err ? esc(err) : ""}">${err ? esc(err) : val !== undefined ? fmt(val) : ""}</td>
          <td><button class="danger" data-del="${i}" title="حذف">×</button></td>
        </tr>`;
      })
      .join("");
    box.innerHTML =
      // 0.9.144: the buttons at the top of the window (they stay there while the list scrolls)
      `<div class="table-actions z-actions"><button data-add>إضافة معادلة</button><button data-zas-bar title="مساعد المعادلة للسطر الحالي: شروط IF وقوائم X و Z">ƒx مساعد المعادلات</button></div>` +
      `<table class="grid ztable"><thead><tr><th>Z</th><th>Formula · المعادلة</th><th>Text · الوصف</th><th>Value</th><th></th></tr></thead><tbody>${rows}</tbody></table>` +
      `<p class="empty">اكتب المعادلة في خانة Formula (مثل X2/2 أو Z1+10)، أو اضغط ƒx للمساعد. Enter يحفظ وينتقل للسطر التالي. للقياس من الرسم استخدم أداتي «قياس مسافة» و«قياس طول».</p>`;
    this.bindTable(box, "variables");
    // the description grows with its text, so all of it shows
    // (CSS field-sizing grows it; grow() is the fallback, run again when the field gets the focus)
    box.querySelectorAll<HTMLTextAreaElement>("textarea.zdesc").forEach((t) => (grow(t), t.addEventListener("focus", () => grow(t))));
    box.querySelectorAll<HTMLButtonElement>("[data-zas]").forEach((b) => b.addEventListener("click", () => this.openZAssistant(Number(b.dataset.zas))));
    box.querySelectorAll<HTMLInputElement>("input[data-f='expr']").forEach((inp) => inp.addEventListener("focus", () => (this.zRow = Number(inp.dataset.i))));
    box.querySelector("[data-zas-bar]")?.addEventListener("click", () => {
      const i = this.zRow >= 0 && this.zRow < this.model.variables.length ? this.zRow : this.model.variables.length - 1;
      if (i >= 0) this.openZAssistant(i);
      else this.toast("أضف معادلة أولاً");
    });
  }

  private zRow = -1;

  /** Z value assistant (as GRAFIS, plus Excel-style formulas): a formula, a distinction of
   * cases with any number of IF / THEN rows (CMDIF), or an Excel formula (IF, IFS, AND, OR,
   * MIN, MAX, ROUND …). Only X values and Z rows before this one may be used. */
  private openZAssistant(i: number): void {
    const v = this.model.variables[i];
    if (!v || v.measure) return;
    document.querySelector(".z-assistant")?.remove();
    const expr = v.expr.trim();
    const m = /^\s*CMDIF\s*((?:\[[^\]]*\]\s*\{[^}]*\}\s*)+)(?:\{([^}]*)\})?\s*$/i.exec(expr);
    const cases = m ? [...m[1].matchAll(/\[([^\]]*)\]\s*\{([^}]*)\}/g)].map((x) => [x[1].trim(), x[2].trim()]) : [["", ""]];
    const excel = !m && /[A-Za-z_]{2,}\s*\(/.test(expr);
    const mode = m ? "c" : excel ? "e" : "f";
    const earlierZ = new Set(this.model.variables.slice(0, i).map((z) => z.id));
    const el = document.createElement("section");
    el.className = "z-assistant";
    el.dir = "rtl";
    el.innerHTML = `<div class="za-head"><b>Z value assistant · مساعد Z${v.id}</b><button type="button" data-za="close" title="إغلاق">×</button></div>
      <div class="za-body">
        <h5>Calculation instruction · طريقة الحساب</h5>
        <label class="za-r"><input type="radio" name="za-kind" value="f" ${mode === "f" ? "checked" : ""}/> Formula · معادلة</label>
        <div class="za-row" data-k="f"><span dir="ltr">Z${v.id}=</span><input dir="ltr" lang="en" data-zf="formula" value="${mode === "f" ? esc(expr) : ""}"/></div>
        <label class="za-r"><input type="radio" name="za-kind" value="c" ${mode === "c" ? "checked" : ""}/> Distinction of cases · حالات (IF) — بلا حد</label>
        <div class="za-cases" data-k="c">
          <div class="za-conds">${cases.map(([c, t], k) => this.zCaseRow(c, t, k)).join("")}</div>
          <button type="button" class="za-add" data-za="add">+ إضافة شرط (ELSE IF)</button>
          <div class="za-row"><span>ELSE …</span><input dir="ltr" lang="en" data-zf="else" value="${esc(m?.[2]?.trim() ?? "")}"/></div>
        </div>
        <label class="za-r"><input type="radio" name="za-kind" value="e" ${mode === "e" ? "checked" : ""}/> Excel formula · معادلة مثل إكسل</label>
        <div data-k="e"><textarea dir="ltr" lang="en" data-zf="excel" rows="3" placeholder="IF(X1>1000; Z1+10; IF(X1>500; 5; 0))">${mode === "e" ? esc(expr) : ""}</textarea>
          <small class="za-help">مثل إكسل: IF(شرط; نعم; لا) متداخلة بلا حد، IFS(شرط; قيمة; شرط; قيمة …)، AND، OR، MIN، MAX، ROUND … الفاصل ; أو ,</small></div>
        <h5>Formula element · عناصر المعادلة <small>(X وZ السابقة لهذا السطر فقط)</small></h5>
        <div class="za-els">
          <div class="za-list"><select data-zf="cat"><option value="X">X value · قيم X</option><option value="Z">Z value · قيم Z السابقة</option><option value="F">Functions · دوال إكسل</option></select><ul></ul></div>
          <div class="za-ops"><span>Logical operator</span>${["=", "<", ">", "<>", "<=", ">="].map((o) => `<button type="button" data-op="${o}">${esc(o)}</button>`).join("")}<span>+ − × ÷ ^</span>${["+", "-", "*", "/", "^", "(", ")", ";"].map((o) => `<button type="button" data-op="${o}">${o}</button>`).join("")}</div>
        </div>
        <p class="za-msg" role="status"></p>
        <div class="za-foot"><button type="button" class="primary" data-za="ok">✓ اعتماد</button><button type="button" data-za="close">إلغاء</button></div>
      </div>`;
    document.body.append(el);
    const q = <T extends Element>(sel: string) => el.querySelector(sel) as T;
    let target: HTMLInputElement | HTMLTextAreaElement = q(mode === "c" ? '[data-zc="if"]' : mode === "e" ? '[data-zf="excel"]' : '[data-zf="formula"]');
    el.addEventListener("focusin", (e) => {
      const t = e.target as HTMLElement;
      if (t.matches("input[type=text], input:not([type]), textarea")) target = t as HTMLInputElement;
    });
    const insert = (t: string, caretBack = 0) => {
      const a = target.selectionStart ?? target.value.length, b = target.selectionEnd ?? a;
      target.value = target.value.slice(0, a) + t + target.value.slice(b);
      target.focus();
      target.setSelectionRange(a + t.length - caretBack, a + t.length - caretBack);
    };
    const kind = () => q<HTMLInputElement>('input[name="za-kind"]:checked').value as "f" | "c" | "e";
    const sync = () => {
      for (const k of ["f", "c", "e"]) el.querySelector<HTMLElement>(`[data-k="${k}"]`)!.classList.toggle("off", kind() !== k);
    };
    el.addEventListener("change", sync);
    sync();
    const FN_HELP: Record<string, string> = {
      IF: "IF(شرط; إذا تحقق; إذا لم يتحقق)", IFS: "IFS(شرط; قيمة; شرط; قيمة …)", AND: "AND(شرط; شرط …)", OR: "OR(شرط; شرط …)", NOT: "NOT(شرط)",
      MIN: "MIN(a; b …)", MAX: "MAX(a; b …)", ROUND: "ROUND(قيمة; خانات)", ROUNDUP: "ROUNDUP(قيمة; خانات)", ROUNDDOWN: "ROUNDDOWN(قيمة; خانات)",
      ABS: "ABS(قيمة)", INT: "INT(قيمة)", SQRT: "SQRT(قيمة)", POWER: "POWER(أساس; أس)", MOD: "MOD(a; b)", SUM: "SUM(a; b …)", AVERAGE: "AVERAGE(a; b …)",
      SIN: "SIN(زاوية°)", COS: "COS(زاوية°)", TAN: "TAN(زاوية°)", ASIN: "ASIN(قيمة) → °", ACOS: "ACOS(قيمة) → °", ATAN: "ATAN(قيمة) → °", PI: "PI()",
    };
    const list = () => {
      const cat = q<HTMLSelectElement>('[data-zf="cat"]').value;
      const sized = withSize(this.model);
      let items: [string, string, string][];
      if (cat === "X") items = sized.measurements.map((x) => [`X${x.id}`, x.name, fmt(x.value)]);
      else if (cat === "Z") items = this.model.variables.filter((z) => earlierZ.has(z.id)).map((z) => [`Z${z.id}`, z.name, this.res.z.has(z.id) ? fmt(this.res.z.get(z.id) as number) : ""]);
      else items = FUNCTION_NAMES.map((n) => [`${n}()`, FN_HELP[n] ?? "", ""]);
      q<HTMLUListElement>("ul").innerHTML = items.length
        ? items.map(([k, n, val]) => `<li data-ins="${k}"><b dir="ltr">${k}</b><span${cat === "F" ? ' dir="ltr"' : ""}>${esc(n || "")}</span><i dir="ltr">${val}</i></li>`).join("")
        : `<li class="none">${cat === "Z" ? "لا توجد معادلات Z قبل هذا السطر" : "لا توجد قيم"}</li>`;
    };
    list();
    q<HTMLSelectElement>('[data-zf="cat"]').addEventListener("change", list);
    el.addEventListener("mousedown", (e) => {
      if ((e.target as HTMLElement).closest("[data-ins],[data-op]")) e.preventDefault(); // keep the caret in the field
    });
    el.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const ins = t.closest<HTMLElement>("[data-ins]"), op = t.closest<HTMLElement>("[data-op]"), za = t.closest<HTMLElement>("[data-za]"), del = t.closest<HTMLElement>("[data-zc-del]");
      if (ins) {
        const k = ins.dataset.ins as string;
        if (k.endsWith("()")) insert(k, k === "PI()" ? 0 : 1);
        else insert(k);
      } else if (op) insert(op.dataset.op as string);
      else if (del) {
        if (el.querySelectorAll(".za-cond").length > 1) del.closest(".za-cond")?.remove();
      } else if (za?.dataset.za === "add") {
        const rows = q<HTMLElement>(".za-conds");
        rows.insertAdjacentHTML("beforeend", this.zCaseRow("", "", rows.children.length));
        (rows.lastElementChild?.querySelector('[data-zc="if"]') as HTMLInputElement)?.focus();
      } else if (za?.dataset.za === "close") el.remove();
      else if (za?.dataset.za === "ok") {
        const msg = q<HTMLElement>(".za-msg");
        let out: string;
        if (kind() === "f") out = q<HTMLInputElement>('[data-zf="formula"]').value.trim();
        else if (kind() === "e") out = q<HTMLTextAreaElement>('[data-zf="excel"]').value.trim().replace(/\s*\n\s*/g, " ");
        else {
          const rows = [...el.querySelectorAll(".za-cond")].map((r) => [(r.querySelector('[data-zc="if"]') as HTMLInputElement).value.trim(), (r.querySelector('[data-zc="then"]') as HTMLInputElement).value.trim()]);
          const els = q<HTMLInputElement>('[data-zf="else"]').value.trim();
          if (rows.some(([c, t]) => !c || !t) || !els) return void (msg.textContent = "أكمل كل IF و THEN و ELSE");
          out = "CMDIF" + rows.map(([c, t]) => `[${c}]{${t}}`).join("") + `{${els}}`;
        }
        if (!out) return void (msg.textContent = "اكتب المعادلة");
        // only X values and the Z rows before this one
        const later = references(out).filter((r) => r[0] === "Z" && !earlierZ.has(Number(r.slice(1))));
        if (later.length) return void (msg.textContent = `${later.join("، ")} ليست قبل Z${v.id}؛ استخدم X أو Z السابقة فقط`);
        try {
          new Vars(withSize(this.model), undefined, this.res.z).eval(out);
        } catch (err) {
          return void (msg.textContent = (err as Error).message);
        }
        this.snapshot();
        v.expr = out;
        this.changed();
        el.remove();
        this.toast(`حُفظت Z${v.id}`);
      }
    });
    // drag by the title bar
    const head = q<HTMLElement>(".za-head");
    head.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => Object.assign(el.style, { left: Math.max(0, ev.clientX - dx) + "px", top: Math.max(0, ev.clientY - dy) + "px", right: "auto" });
      const up = () => (head.removeEventListener("pointermove", move), head.removeEventListener("pointerup", up));
      head.addEventListener("pointermove", move);
      head.addEventListener("pointerup", up);
    });
    target.focus();
  }

  private zCaseRow(cond: string, then: string, k: number): string {
    return `<div class="za-cond"><div class="za-row"><span>${k ? "ELSE IF …" : "IF …"}</span><input dir="ltr" lang="en" data-zc="if" value="${esc(cond)}" placeholder="X1>1000"/></div>
      <div class="za-row"><span>THEN …</span><input dir="ltr" lang="en" data-zc="then" value="${esc(then)}"/><button type="button" class="za-del" data-zc-del title="حذف الشرط">×</button></div></div>`;
  }

  private bindTable(box: HTMLElement, key: "measurements" | "variables"): void {
    let snapped = false;
    box.querySelectorAll<HTMLInputElement>("input[data-f], textarea[data-f]").forEach((inp) => {
      inp.addEventListener("input", () => {
        if (inp.tagName === "TEXTAREA") grow(inp);
        const row = this.model[key][Number(inp.dataset.i)] as unknown as Record<string, unknown>;
        const v = Number(normalizeFormula(inp.value).trim());
        if (inp.dataset.f === "value" && (inp.value === "" || Number.isNaN(v))) return; // nothing to keep yet
        if (!snapped) {
          this.snapshot();
          snapped = true;
        }
        if (inp.dataset.f === "value") row.value = v;
        else row[inp.dataset.f as string] = inp.value;
        this.changed(false);
      });
      inp.addEventListener("change", () => {
        snapped = false;
        // show the stored number cleanly (no leading zeros or stray characters)
        if (inp.dataset.f === "value") inp.value = String((this.model[key][Number(inp.dataset.i)] as unknown as { value: number }).value);
        this.renderSteps();
      });
      // a field opens with its text selected, so typing replaces the old value (0)
      inp.addEventListener("focus", () => {
        const v0 = inp.value; // selected only if nothing was typed yet (fast typing keeps its first digit)
        // 0.9.184: selected at once too: keys already waiting (typed while a big drawing was redrawn) then
        // replace the 0 instead of going in front of it (1500 typed gave 15000)
        inp.select();
        setTimeout(() => inp.value === v0 && inp.select(), 0);
        // the mouse-up of the click that focused the field would put the caret back where it was pressed
        inp.addEventListener("mouseup", (e) => inp.value === v0 && (e.preventDefault(), inp.select()), { once: true });
      });
      // Enter saves the value at once and moves to the same field of the next row
      inp.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        inp.dispatchEvent(new Event("change"));
        const next = box.querySelector<HTMLInputElement>(`[data-f="${inp.dataset.f}"][data-i="${Number(inp.dataset.i) + 1}"]`);
        if (next) next.focus();
        else inp.blur();
        const label = key === "measurements" ? `X${this.model.measurements[Number(inp.dataset.i)]?.id}` : `Z${this.model.variables[Number(inp.dataset.i)]?.id}`;
        this.toast(`حُفظت ${label}`);
      });
    });
    box.querySelectorAll<HTMLElement>("[data-del]").forEach((b) =>
      b.addEventListener("click", () => {
        this.snapshot();
        this.model[key].splice(Number(b.dataset.del), 1);
        this.changed();
      }),
    );
    box.querySelector("[data-add]")?.addEventListener("click", () => {
      this.snapshot();
      const list = this.model[key];
      const id = list.reduce((a, r) => Math.max(a, r.id), 0) + 1;
      if (key === "measurements") this.model.measurements.push({ id, name: "", value: 0 });
      else this.model.variables.push({ id, name: "", expr: "0" });
      this.changed();
      // the new row's value field gets the focus (its 0 is selected and replaced by typing)
      const inputs = box.querySelectorAll<HTMLInputElement>(key === "measurements" ? "input[data-f='value']" : "input[data-f='expr']");
      inputs[inputs.length - 1]?.focus();
    });
  }

  /** Update computed values in place while the user types in a table. */
  private refreshValues(): void {
    document.querySelectorAll<HTMLElement>("[data-zval]").forEach((td) => {
      const id = Number(td.dataset.zval);
      const err = this.res.zErrors.get(id);
      const v = this.res.z.get(id);
      td.textContent = err ?? (v !== undefined ? fmt(v) : "");
      td.classList.toggle("bad", !!err);
    });
  }
}
