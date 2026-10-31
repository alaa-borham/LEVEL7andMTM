import { toGradedAama } from "../core/aama-graded";
import { normalizeFormula } from "../core/formula";
import { allSizeItems, toAamaDxf, toPlt } from "../core/export";
import { addCustomer, parseCsv, parseOrders, type Unit } from "../core/mtm";
import { closestOnPolyline, directionAt, dist, lineIntersection, polyLen, type Pt } from "../core/geometry";
import {
  createdIds,
  nearerEnd,
  sideOf,
  emptyModel,
  newId,
  fillGrading,
  sizeName,
  withSize,
  usedIds,
  evaluateModel,
  Vars,
  type EvalResult,
  type GObj,
  type Model,
  type PointRef,
  type Step,
} from "../core/model";
import { thobeSample } from "../core/sample";
import { describe, describeMeasure } from "./describe";
import { autosave, download, fromGrafis, parseModel, restore, safeFileName, toDxf } from "./files";
import { applyFields, pickedId, stepFields, TOOLS, type Field, type Pick, type PickKind, type Tool } from "./tools";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const fmt = (v: number) => (Math.round(v * 100) / 100).toString();

const PICK_PX = 10;
const NEST_COLORS = ["#2e7d32", "#c62828", "#1565c0", "#ef6c00", "#6a1b9a", "#00838f", "#ad1457", "#5d4037", "#827717", "#283593"];

type Hover = Pick | null;

interface FormState {
  title: string;
  fields: Field[];
  onOk: (v: Record<string, string>) => void;
  /** Live drawing: the line follows the mouse from `from`; angle and length fill in
   * until typed by hand, and a click on the drawing confirms. */
  live?: { from?: Pt; values?: (at: Pt, cur: Record<string, string>) => Record<string, string> | null; follow?: (at: Pt) => void; submit?: () => void };
}

export class App {
  model: Model;
  res!: EvalResult;
  private undoStack: string[] = [];
  private redoStack: string[] = [];

  // view: world point at the canvas centre and pixels per mm
  private cx = 0;
  private cy = 0;
  private scale = 1;
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
    this.model = restore() ?? emptyModel();
    this.evaluate();
    this.buildTools();
    this.bindTopbar();
    this.bindTabs();
    this.bindCanvas();
    this.bindKeys();
    this.renderPanels();
    requestAnimationFrame(() => this.fit());
  }

  // ------------------------------------------------------------ model state
  private evaluate(): void {
    const n = this.model.sizes?.length ?? 0;
    if ((this.model.activeSize ?? -1) >= n) this.model.activeSize = -1;
    this.res = evaluateModel(withSize(this.model));
    this.nest = this.showNest ? this.nestResults() : [];
  }

  // ------------------------------------------------------------ sizes
  private showNest = false;
  private nest: { name: string; color: string; res: EvalResult }[] = [];

  private nestResults() {
    const out: { name: string; color: string; res: EvalResult }[] = [];
    for (let i = -1; i < (this.model.sizes?.length ?? 0); i++) {
      out.push({ name: sizeName(this.model, i), color: NEST_COLORS[(i + 1) % NEST_COLORS.length], res: evaluateModel(withSize(this.model, i)) });
    }
    return out;
  }

  /** Call before every change so it can be undone. */
  private snapshot(): void {
    this.undoStack.push(JSON.stringify(this.model));
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
  }

  private changed(panels = true): void {
    this.evaluate();
    autosave(this.model);
    if (panels) this.renderPanels();
    else this.refreshValues();
    this.refreshForm?.();
    this.render();
  }

  /** Embedded mode: the host program hands over a file it opened. */
  openText(text: string, name: string, grafis = false): void {
    try {
      if (grafis) this.importGrafis(text);
      else {
        this.load(parseModel(text));
        this.toast(`تم فتح ${name}`);
      }
    } catch (e) {
      this.toast(`تعذر قراءة الملف: ${(e as Error).message}`);
    }
  }

  /** Embedded mode: start an empty design without asking. */
  newDesign(): void {
    this.load(emptyModel());
  }

  private load(m: Model): void {
    this.snapshot();
    this.model = m;
    this.cancelTool();
    this.selectedStep = -1;
    this.changed();
    this.fit();
  }

  private undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(JSON.stringify(this.model));
    this.model = parseModel(prev);
    this.cancelTool();
    this.changed();
  }

  private redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(JSON.stringify(this.model));
    this.model = parseModel(next);
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
    this.scale = Math.min((r.width - 80) / w, (r.height - 80) / h);
    this.render();
  }

  // ------------------------------------------------------------ rendering
  /** Embedded mode: zoom about the centre of the drawing area (host +/- commands). */
  zoomBy(f: number): void {
    this.scale = Math.min(200, Math.max(0.02, this.scale * f));
    this.render();
  }

  render(): void {
    const r = this.svg.getBoundingClientRect();
    const parts: string[] = [this.gridSvg(r.width, r.height)];
    const highlight = this.highlighted();
    const lineColor = (o: GObj) => (highlight.has(o.id) ? "var(--select)" : "var(--line)");

    if (this.showNest) parts.push(this.nestSvg());
    if (this.showPieces) parts.push(this.piecesSvg());
    for (const o of this.res.objects.values()) {
      if (o.kind !== "line") continue;
      const pts = o.pts.map((p) => this.toScreen(p).map((v) => v.toFixed(1)).join(",")).join(" ");
      const w = highlight.has(o.id) ? 2.5 : 1.4;
      parts.push(`<polyline points="${pts}" fill="none" stroke="${lineColor(o)}" stroke-width="${w}"/>`);
      const mid = this.toScreen(o.pts[Math.floor(o.pts.length / 2)]);
      parts.push(`<text x="${mid[0] + 4}" y="${mid[1] - 4}">${esc(o.name)}</text>`);
    }
    for (const o of this.res.objects.values()) {
      if (o.kind !== "point") continue;
      const [x, y] = this.toScreen(o.pts[0]);
      const c = highlight.has(o.id) ? "var(--select)" : "var(--point)";
      parts.push(`<circle cx="${x}" cy="${y}" r="3.2" fill="${c}"/>`);
      parts.push(`<text x="${x + 5}" y="${y - 5}">${esc(o.name)}</text>`);
    }
    // picks already made by the current tool
    for (const p of [...this.picks, ...this.extra]) parts.push(this.markSvg(p, "var(--select)"));
    if (this.hover) parts.push(this.markSvg(this.hover, "var(--hover)"));
    parts.push(this.liveSvg());
    this.svg.innerHTML = parts.join("");
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
      if (s.op === "mirror") for (const it of s.items) ids.add(it.dst ?? it.src);
    }
    return ids;
  }

  private showPieces = true;

  private piecesSvg(): string {
    const out: string[] = [];
    const pts = (p: Pt[]) => p.map((q) => this.toScreen(q).map((v) => v.toFixed(1)).join(",")).join(" ");
    for (const pc of this.model.pieces ?? []) {
      const g = this.res.pieces.get(pc.id);
      if (!g) continue;
      out.push(`<polygon points="${pts(g.cut)}" fill="var(--piece-fill)" stroke="var(--piece)" stroke-width="2"/>`);
      out.push(`<polygon points="${pts(g.sew)}" fill="none" stroke="var(--piece)" stroke-width="1.2" stroke-dasharray="6 4"/>`);
      for (const n of g.notches) out.push(`<polyline points="${pts([n.at, n.to])}" stroke="var(--piece)" stroke-width="2.2"/>`);
      const [a, b] = g.grain.map((q) => this.toScreen(q));
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const head = (p: Pt, dir: number) =>
        `<polyline points="${[dir + 2.6, dir - 2.6].map((t) => [p[0] + 10 * Math.cos(t), p[1] + 10 * Math.sin(t)].join(",")).join(` ${p.join(",")} `)}" fill="none" stroke="var(--piece)" stroke-width="1.4"/>`;
      out.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="var(--piece)" stroke-width="1.4"/>`);
      out.push(head(b, ang), head(a, ang + Math.PI));
      const c = this.toScreen(g.centre);
      out.push(`<text class="piece-label" x="${c[0] + 8}" y="${c[1]}">${esc(pc.name)} (${pc.quantity})</text>`);
    }
    return out.join("");
  }

  private pieceItems() {
    return (this.model.pieces ?? []).flatMap((piece) => {
      const geo = this.res.pieces.get(piece.id);
      return geo ? [{ piece, geo }] : [];
    });
  }

  private markSvg(p: Pick, color: string): string {
    if (p.kind === "line") {
      const o = this.res.objects.get(p.obj);
      if (!o) return "";
      const pts = o.pts.map((q) => this.toScreen(q).join(",")).join(" ");
      return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="3.5" opacity="0.8"/>`;
    }
    const [x, y] = this.toScreen(p.kind === "point" ? this.pointOf(p.ref) : p.at);
    return `<circle cx="${x}" cy="${y}" r="7" fill="none" stroke="${color}" stroke-width="2"/>`;
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
          if (d <= PICK_PX && (!best || d < best.d)) best = { d, ref };
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

  cancelTool(): void {
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
    this.picks = [];
    this.extra = [];
    this.collecting = false;
    this.closeForm();
    this.tool = t;
    this.collecting = !!t && !t.picks.length && !!t.multi;
    this.updatePrompt();
  }

  private updatePrompt(): void {
    let text = "اختر أداة من القائمة. اسحب بالزر الأيمن للتحريك، والعجلة للتكبير.";
    if (this.tool) {
      if (this.form) text = `${this.tool.name}: أدخل القيم ثم Enter`;
      else if (this.collecting) text = `${this.tool.name}: ${this.tool.multi?.prompt} (${this.extra.length} محدد)`;
      else text = `${this.tool.name}: ${this.tool.picks[this.picks.length]?.prompt ?? ""}`;
      text += " — Esc للإلغاء";
    }
    $("#prompt").textContent = text;
  }

  /** A click on empty space where a point is expected creates a free point there
   * (as in GRAFIS), so lines can be drawn on a blank page. */
  private freePointAt(at: Pt): Pick {
    const x = Math.round(at[0] * 10) / 10, y = Math.round(at[1] * 10) / 10;
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
    if (t.multi) {
      this.collecting = true;
      this.updatePrompt();
      this.render();
      return;
    }
    this.finishPicks();
  }

  private finishPicks(): void {
    const t = this.tool as Tool;
    if (t.multi && this.extra.length < t.multi.min) {
      this.toast(t.multi.kind === "point" ? `حدد ${t.multi.min} نقاط على الأقل` : "لم تحدد أي عنصر");
      return;
    }
    const ctx = { model: this.model, res: this.res, picks: this.picks, extra: this.extra };
    const fields = t.fields?.(ctx) ?? [];
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
        const X = lineIntersection(qa, ea, qb, eb);
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
    } else return [];
    try {
      const model = parseModel(JSON.stringify(this.model));
      const ctx = { model, res: this.res, picks, extra: this.extra };
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
  angleStep = 1;
  private autoPoint: number | null = null;

  private rightDown: { x: number; y: number } | null = null;

  /** Right click: confirm the open value box (or finish a multi-pick); with nothing
   * pending it ends the tool, so the next operation can be chosen. */
  private rightConfirm(): void {
    if (this.form || this.collecting) this.confirmStep();
    else if (this.tool && !this.picks.length) this.cancelTool();
  }

  /** Embedded mode: the ✓ of the step card (Enter). */
  confirmStep(): void {
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
          this.model = parseModel(prev);
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
    this.snapshot();
    const ctx = { model: this.model, res: this.res, picks: this.picks, extra: this.extra };
    if (t.makePiece) {
      this.model.pieces ??= [];
      const id = this.model.pieces.reduce((a, p) => Math.max(a, p.id), 0) + 1;
      this.model.pieces.push({ id, ...t.makePiece(ctx, values) });
      this.changed();
      const err = this.res.pieceErrors.get(id);
      this.toast(err ? `أُنشئت القطعة لكن فيها خطأ: ${err}` : "أُنشئت القطعة. عدّل حواشي كل حد من صفحة «القطع»");
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
        pc.notches.push(pick.ref);
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
      this.changed();
      const err = this.res.stepErrors.get(this.model.steps.length - 1);
      if (err) this.toast(`تمت إضافة الخطوة لكن فيها خطأ: ${err}`);
    }
    this.restartTool();
    this.render();
  }

  // ------------------------------------------------------------ form
  private openForm(f: FormState): void {
    this.form = f;
    const box = $("#tool-box");
    box.hidden = false;
    box.innerHTML =
      `<h4>${esc(f.title)}</h4>` +
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
    const sized = withSize(this.model);
    const refs: [string, string][] = [
      ...sized.measurements.map((m): [string, string] => [`X${m.id}`, `X${m.id} = ${fmt(m.value)}${m.name ? " · " + m.name : ""}`]),
      ...this.model.variables.map((v): [string, string] => {
        const val = this.res.z.get(v.id);
        return [`Z${v.id}`, `Z${v.id}${val !== undefined ? " = " + fmt(val) : ""}${v.name ? " · " + v.name : ""}`];
      }),
    ];
    this.refreshForm = () => box.querySelectorAll<HTMLInputElement>("input.expr").forEach((inp) => preview(inp));
    if (true) {
      const listId = "xz-refs";
      box.insertAdjacentHTML("beforeend", `<datalist id="${listId}">${refs.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</datalist>`);
      box.querySelectorAll<HTMLInputElement>("input.expr").forEach((inp) => {
        inp.setAttribute("list", listId);
        const pick = document.createElement("select");
        pick.className = "ref-pick";
        pick.title = "اختر قياس X أو متغير Z";
        pick.setAttribute("aria-label", "قائمة X و Z");
        pick.innerHTML = `<option value="">X / Z</option>` + refs.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("");
        pick.addEventListener("focus", () => {
          const sizedNow = withSize(this.model);
          const now: [string, string][] = [
            ...sizedNow.measurements.map((m): [string, string] => [`X${m.id}`, `X${m.id} = ${fmt(m.value)}${m.name ? " · " + m.name : ""}`]),
            ...this.model.variables.map((v): [string, string] => [`Z${v.id}`, `Z${v.id}${this.res.z.get(v.id) !== undefined ? " = " + fmt(this.res.z.get(v.id) as number) : ""}${v.name ? " · " + v.name : ""}`]),
          ];
          pick.innerHTML = `<option value="">X / Z</option>` + now.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("");
        });
        pick.addEventListener("change", () => {
          const ref = pick.value;
          pick.value = "";
          if (!ref) return;
          const cur = inp.value.trim();
          inp.value = !cur || /^[XxZz]?$|^[\d.\s\u0660-\u0669]*$/.test(cur) ? ref : /[-+*/(]$/.test(cur) ? cur + ref : cur + "+" + ref;
          inp.dispatchEvent(new Event("input"));
          inp.focus();
        });
        inp.after(pick);
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
      if (this.tool && !this.form && this.picks.length) this.backStep(); // undo the first click's pick
      const h = this.hit("object", e.clientX - r.left, e.clientY - r.top);
      const id = h && pickedId(h);
      if (id === null || id === undefined) return;
      let i = -1;
      this.model.steps.forEach((st, k) => {
        if (createdIds(st).includes(id)) i = k;
      });
      if (i < 0) return;
      this.cancelTool();
      if (stepFields(this.model.steps[i]).length) this.editStep(i);
      else {
        this.selectedStep = i;
        this.renderSteps();
        this.render();
        this.toast(`الخطوة ${i + 1} ليس لها قيم للتعديل`);
      }
    });
    svg.addEventListener("mousedown", (e) => {
      svg.focus();
      if (e.button === 2) this.rightDown = { x: e.clientX, y: e.clientY };
      if (e.button === 1 || e.button === 2) {
        this.pan = { x: e.clientX, y: e.clientY, cx: this.cx, cy: this.cy };
        svg.classList.add("panning");
        e.preventDefault();
        return;
      }
      if (e.button !== 0 || e.detail >= 2) return; // the second click of a double-click edits (below)
      if (this.form?.live?.submit) {
        this.form.live.submit();
        return;
      }
      const kind = this.currentPickKind();
      if (!kind) return;
      const r = svg.getBoundingClientRect();
      const h = this.hit(kind, e.clientX - r.left, e.clientY - r.top);
      if (h) this.onPick(h);
      else if (kind === "point" && this.tool && !this.collecting) this.onPick(this.freePointAt(this.toWorld(e.clientX - r.left, e.clientY - r.top)));
      else if (kind !== "canvas") this.toast(kind === "line" ? "انقر على خط" : "انقر على نقطة أو طرف خط");
    });
    window.addEventListener("mouseup", (e) => {
      // right click without dragging = confirm the step (as in GRAFIS); dragging pans
      const rd = this.rightDown;
      this.rightDown = null;
      if (e.button === 2 && rd && Math.hypot(e.clientX - rd.x, e.clientY - rd.y) < 5) this.rightConfirm();
      this.pan = null;
      svg.classList.remove("panning");
    });
    svg.addEventListener("mousemove", (e) => {
      const r = svg.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      if (this.pan) {
        this.cx = this.pan.cx - (e.clientX - this.pan.x) / this.scale;
        this.cy = this.pan.cy + (e.clientY - this.pan.y) / this.scale;
        this.render();
        return;
      }
      this.mouse = this.toWorld(sx, sy);
      if (this.form?.live?.follow) {
        this.form.live.follow(this.mouse);
        return;
      }
      $("#coords").textContent = `x ${fmt(this.mouse[0])}   y ${fmt(this.mouse[1])}   mm`;
      const kind = this.currentPickKind();
      const h = kind ? this.hit(kind, sx, sy) : null;
      if (JSON.stringify(h && { ...h, at: 0 }) !== JSON.stringify(this.hover && { ...this.hover, at: 0 })) {
        this.hover = h;
        this.render();
      } else if (this.tool?.key === "line" && this.picks.length === 1) this.render(); // rubber band
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        this.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y" && !typing) {
        e.preventDefault();
        this.redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        this.save();
      } else if (typing) {
        return;
      } else if (e.key === "Escape") {
        this.cancelTool();
      } else if (e.key === "Enter" && this.collecting) {
        this.finishPicks();
      } else if (e.key.toLowerCase() === "f") {
        this.fit();
      } else {
        const t = TOOLS.find((x) => x.shortcut === e.key);
        if (t) this.selectTool(t);
      }
    });
  }

  private bindTopbar(): void {
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

  private save(): void {
    download(`${safeFileName(this.model.name)}.level7.json`, JSON.stringify(this.model, null, 1), "application/json");
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
    this.renderSteps();
    this.renderX();
    this.renderZ();
    this.renderPieces();
    this.renderSizes();
  }

  private renderSteps(): void {
    const box = $("#tab-steps");
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

  private editStep(i: number): void {
    const s = this.model.steps[i];
    this.cancelTool();
    this.selectedStep = i;
    this.render();
    this.openForm({
      title: `تعديل الخطوة ${i + 1}`,
      fields: stepFields(s),
      onOk: (v) => {
        this.snapshot();
        applyFields(this.model.steps[i], v);
        this.changed();
      },
    });
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
              <label>العدد <input data-pf="quantity" type="number" min="1" value="${pc.quantity}"/></label>
              <label>القماش <input data-pf="fabric" value="${esc(pc.fabric)}"/></label>
              <label>خط النسيج ° <input class="expr" data-pf="grain" value="${esc(pc.grain)}"/></label>
            </div>
            <table class="grid"><thead><tr><th>الحد</th><th>حاشية الخياطة مم</th></tr></thead><tbody>
              ${pc.edges.map((id, k) => `<tr><td class="id">${nm(id)}</td><td><input class="expr" data-seam="${k}" value="${esc(pc.seam[k] ?? "0")}"/></td></tr>`).join("")}
            </tbody></table>
            <div class="notches">النوتشات: ${
              pc.notches.length
                ? pc.notches.map((r, k) => `<span class="chip">${nm(r.obj)}${r.end ? (r.end === "start" ? " (بداية)" : " (نهاية)") : ""}<button data-ndel="${k}" title="حذف">×</button></span>`).join(" ")
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
      card.querySelectorAll("input").forEach((inp) => inp.addEventListener("change", () => ((snapped = false), this.renderPieces())));
      card.querySelector("[data-pdel]")?.addEventListener("click", () => {
        if (!confirm(`حذف القطعة «${pc.name}»؟`)) return;
        this.snapshot();
        this.model.pieces = pieces.filter((p) => p !== pc);
        this.changed();
      });
      card.querySelectorAll<HTMLElement>("[data-ndel]").forEach((b) =>
        b.addEventListener("click", () => {
          this.snapshot();
          pc.notches.splice(Number(b.dataset.ndel), 1);
          this.changed();
        }),
      );
    });
  }

  private nestSvg(): string {
    const out: string[] = [];
    const pts = (p: Pt[]) => p.map((q) => this.toScreen(q).map((v) => v.toFixed(1)).join(",")).join(" ");
    for (const n of this.nest) {
      if (n.res.pieces.size) {
        for (const g of n.res.pieces.values()) out.push(`<polygon points="${pts(g.cut)}" fill="none" stroke="${n.color}" stroke-width="1.2" opacity="0.9"/>`);
      } else {
        for (const o of n.res.objects.values())
          if (o.kind === "line") out.push(`<polyline points="${pts(o.pts)}" fill="none" stroke="${n.color}" stroke-width="1" opacity="0.8"/>`);
      }
    }
    return out.join("");
  }

  private renderSizeSelect(): void {
    const sel = $<HTMLSelectElement>("#size-select");
    const active = this.model.activeSize ?? -1;
    const opts = [-1, ...(this.model.sizes ?? []).map((_, i) => i)];
    sel.innerHTML = opts.map((i) => `<option value="${i}"${i === active ? " selected" : ""}>${esc(sizeName(this.model, i))}</option>`).join("");
    sel.onchange = () => {
      this.model.activeSize = Number(sel.value);
      this.changed();
    };
  }

  private renderSizes(): void {
    this.renderSizeSelect();
    const box = $("#tab-sizes");
    const sizes = this.model.sizes ?? [];
    const g = this.model.grading ?? {};
    const head = sizes
      .map(
        (sz, i) => `<th class="size-col${sz.kind === "customer" ? " customer" : ""}">
          <input data-sname="${i}" value="${esc(sz.name)}" title="اسم المقاس أو الزبون"/>
          ${
            sz.kind === "customer"
              ? `<div class="step">زبون</div>`
              : `<div class="step">درجة <input type="number" step="any" data-sstep="${i}" value="${sz.step}" title="عدد درجات التدرج عن الأساسي"/></div>`
          }
          <button class="danger" data-sdel="${i}" title="حذف المقاس">×</button></th>`,
      )
      .join("");
    const rows = this.model.measurements
      .map(
        (m) => `<tr>
          <td class="id">X${m.id}</td><td class="mname">${esc(m.name)}</td>
          <td class="base">${m.value}</td>
          <td><input class="expr" type="number" step="any" data-grade="${m.id}" value="${g[m.id] ?? ""}" placeholder="0"/></td>
          ${sizes.map((sz, i) => `<td><input class="expr" type="number" step="any" data-sv="${i}:${m.id}" value="${sz.values[m.id] ?? ""}" placeholder="${m.value}"/></td>`).join("")}
        </tr>`,
      )
      .join("");
    box.innerHTML = `
      <p class="empty">كل عمود مقاس أو زبون. الخانة الفارغة تأخذ القيمة الأساسية. اختر المقاس المعروض من أعلى الشاشة، والباترون يُعاد بناؤه بقياساته.</p>
      <div class="table-actions">
        <button data-sadd>إضافة مقاس</button>
        <button data-cadd>إضافة زبون</button>
        <button data-sfill title="قيمة كل مقاس = الأساسي + الدرجة × التدرج">تعبئة بالتدرج</button>
      </div>
      <div class="table-actions">
        <button data-cimport title="CSV: سطر لكل زبون، أو JSON: طلب أو قائمة طلبات">استيراد زبائن (CSV / JSON)</button>
        <label class="field-inline">وحدة الملف <select data-cunit><option value="mm">مم</option><option value="cm">سم</option><option value="in">إنش</option></select></label>
      </div>
      <label class="field-inline"><input type="checkbox" data-nest ${this.showNest ? "checked" : ""}/> عرض كل المقاسات فوق بعض</label>
      ${this.showNest ? `<div class="legend">${this.nest.map((n) => `<span><i style="background:${n.color}"></i>${esc(n.name)}</span>`).join("")}</div>` : ""}
      <div class="size-table"><table class="grid"><thead><tr><th>رمز</th><th>القياس</th><th>${esc(sizeName(this.model, -1))}</th><th>التدرج</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      <div class="table-actions">
        <button data-xall="aama">تصدير AAMA لكل المقاسات</button>
        <button data-xall="plt">تصدير PLT لكل المقاسات</button>
      </div>
      <div class="table-actions">
        <button class="primary" data-graded title="المقاس الأساسي مع أرقام قواعد التدرج + ملف جدول القواعد RUL">تصدير AAMA مع قواعد التدرج + RUL</button>
      </div>`;

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
    const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? undefined : Number(v));
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
        const i = Number(b.dataset.sdel);
        if (!confirm(`حذف المقاس «${sizes[i].name}»؟`)) return;
        this.snapshot();
        sizes.splice(i, 1);
        this.model.activeSize = -1;
        this.changed();
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
    box.querySelector<HTMLInputElement>("[data-nest]")?.addEventListener("change", (e) => {
      this.showNest = (e.target as HTMLInputElement).checked;
      this.evaluate();
      this.renderSizes();
      this.render();
    });
    box.querySelector("[data-graded]")?.addEventListener("click", () => {
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
    });
    box.querySelectorAll<HTMLElement>("[data-xall]").forEach((b) =>
      b.addEventListener("click", () => {
        const { items, errors } = allSizeItems(this.model);
        if (!items.length) {
          this.toast("لا توجد قطع للتصدير");
          return;
        }
        const base = `${safeFileName(this.model.name)}_all-sizes`;
        if (b.dataset.xall === "aama") download(`${base}.dxf`, toAamaDxf(items, { style: this.model.name, size: "" }), "application/dxf");
        else download(`${base}.plt`, toPlt(items, { size: "" }), "application/vnd.hp-hpgl");
        if (errors.length) this.toast(`لم تُصدَّر ${errors.length} قطعة بسبب أخطاء: ${errors[0]}`);
      }),
    );
  }

  private renderX(): void {
    const box = $("#tab-x");
    const rows = this.model.measurements
      .map(
        (m, i) => `<tr>
          <td class="id">X${m.id}</td>
          <td><input data-i="${i}" data-f="name" value="${esc(m.name)}" placeholder="اسم القياس"/></td>
          <td style="width:90px"><input class="expr" data-i="${i}" data-f="code" value="${esc(m.code ?? "")}" placeholder="—" title="اسم هذا القياس في نظام MTM أو ملف الاستيراد"/></td>
          <td style="width:90px"><input class="expr" type="number" step="any" data-i="${i}" data-f="value" value="${m.value}"/></td>
          <td><button class="danger" data-del="${i}" title="حذف">×</button></td>
        </tr>`,
      )
      .join("");
    box.innerHTML =
      `<table class="grid"><thead><tr><th>رمز</th><th>القياس</th><th>رمز MTM</th><th>القيمة مم</th><th></th></tr></thead><tbody>${rows}</tbody></table>` +
      `<div class="table-actions"><button data-add>إضافة قياس</button></div>`;
    this.bindTable(box, "measurements");
  }

  private renderZ(): void {
    const box = $("#tab-z");
    const rows = this.model.variables
      .map((v, i) => {
        const val = this.res.z.get(v.id);
        const err = this.res.zErrors.get(v.id);
        return `<tr>
          <td class="id">Z${v.id}</td>
          <td><input data-i="${i}" data-f="name" value="${esc(v.name)}" placeholder="الوصف"/>
              ${
                v.measure
                  ? `<div class="measure">${esc(describeMeasure(v.measure, this.model)).replace(/\u2066(.*?)\u2069/g, '<bdi dir="ltr">$1</bdi>')}</div>`
                  : `<input class="expr" data-i="${i}" data-f="expr" value="${esc(v.expr)}" style="margin-top:3px"/>`
              }</td>
          <td class="val${err ? " bad" : ""}" data-zval="${v.id}">${err ? esc(err) : val !== undefined ? fmt(val) : ""}</td>
          <td><button class="danger" data-del="${i}" title="حذف">×</button></td>
        </tr>`;
      })
      .join("");
    box.innerHTML =
      `<table class="grid"><thead><tr><th>رمز</th><th>الوصف والمعادلة</th><th>القيمة</th><th></th></tr></thead><tbody>${rows}</tbody></table>` +
      `<div class="table-actions"><button data-add>إضافة معادلة</button></div>` +
      `<p class="empty">للقياس من الرسم استخدم أداتي «قياس مسافة» و«قياس طول». القيمة تؤخذ لحظة رسم العناصر المقاسة، مثل جرافس.</p>`;
    this.bindTable(box, "variables");
  }

  private bindTable(box: HTMLElement, key: "measurements" | "variables"): void {
    let snapped = false;
    box.querySelectorAll<HTMLInputElement>("input[data-f]").forEach((inp) => {
      inp.addEventListener("input", () => {
        if (!snapped) {
          this.snapshot();
          snapped = true;
        }
        const row = this.model[key][Number(inp.dataset.i)] as unknown as Record<string, unknown>;
        if (inp.dataset.f === "value") {
          const v = Number(normalizeFormula(inp.value).trim());
          if (inp.value === "" || Number.isNaN(v)) return;
          row.value = v;
        } else row[inp.dataset.f as string] = inp.value;
        this.changed(false);
      });
      inp.addEventListener("change", () => {
        snapped = false;
        this.renderSteps();
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
      const inputs = box.querySelectorAll<HTMLInputElement>("input[data-f='name']");
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
