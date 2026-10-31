import { toGradedAama } from "../core/aama-graded";
import { FUNCTION_NAMES, normalizeFormula, references } from "../core/formula";
import { fromBase64, readCsv, readXlsx, writeXlsx } from "../core/xlsx";
import { importXTable, xTableRows } from "../core/xtable";
import { allSizeItems, toAamaDxf, toPlt } from "../core/export";
import { addCustomer, parseCsv, parseOrders, type Unit } from "../core/mtm";
import { closestOnPolyline, crossings, directionAt, dist, lineIntersection, offsetPolyline, pointAlong, polyLen, type Pt } from "../core/geometry";
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
  type Part,
} from "../core/model";
import { thobeSample } from "../core/sample";
import type { NotchType, Piece } from "../core/piece";
import { describe, describeMeasure } from "./describe";
import { autosave, download, downloadBytes, fromGrafis, parseModel, restore, safeFileName, toDxf } from "./files";
import { applyFields, pickedId, stepFields, TOOLS, type Field, type Pick, type PickKind, type Tool } from "./tools";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const fmt = (v: number) => (Math.round(v * 100) / 100).toString();

const PICK_PX = 10;
/** Points attract the pointer from farther away (magnet): a click then takes that point. */
const SNAP_PX = 18;
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

  // view: world point at the canvas centre and pixels per mm
  private cx = 0;
  private cy = 0;
  private scale = 1;
  showNames = false;
  private nameHover: number | null = null;
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
    // other parts shown faded behind the active one
    const parts = this.model.parts ?? [];
    this.ghosts = parts.flatMap((p, k) => (k !== this.model.activePart && p.visible ? [evaluateModel(withSize({ ...this.model, steps: p.steps, names: p.names, nextId: p.nextId, pieces: [], activePart: k }))] : []));
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
  // ------------------------------------------------------------ parts (as GRAFIS)
  private ghosts: EvalResult[] = [];

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
    const part: Part = src ? (JSON.parse(JSON.stringify({ ...src, no, name: `${src.name} (2)`, visible: false })) as Part) : { no, name: "", steps: [], names: {}, nextId: 1, pieces: [], amount: 1 };
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
        <div class="ps-side"><b>${p.no}</b><button data-seye="${k}" class="${p.visible || k === act ? "on" : ""}" title="إظهار البارت باهتاً"${k === act || !ps ? " disabled" : ""}>👁</button></div>
        <svg viewBox="${pv.box}">${pv.svg}</svg></div>`;
    });
    strip.innerHTML = `<div class="ps-head"><button data-smode="permanent" class="${this.stripMode === "permanent" ? "on" : ""}" title="دائم">📌</button><button data-smode="dynamic" class="${this.stripMode === "dynamic" ? "on" : ""}" title="ديناميكي: يظهر عند الاقتراب">⇔</button><button data-smode="off" class="${this.stripMode === "off" ? "on" : ""}" title="إخفاء">⦸</button></div><div class="ps-list">${items.join("")}</div>`;
  }

  /** Product info (as GRAFIS 2026): product texts, logo, two sketches and a fabric picture,
   * kept in the design file. */
  openProduct(): void {
    document.querySelector(".product-win")?.remove();
    const pr: Record<string, string> = { ...(this.model.product ?? {}) };
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
      const res = this.partResult(k);
      const taken = new Set(Object.values(this.model.names));
      const items = ids.map((sid) => {
        const o = res.objects.get(sid) as GObj, nm = src.names[sid];
        let dst: number;
        if (nm && !taken.has(nm)) {
          dst = this.model.nextId++;
          this.model.names[dst] = nm;
          taken.add(nm);
        } else dst = newId(this.model, o.kind === "point" ? "point" : nm?.startsWith("C") ? "curve" : "line");
        return { src: sid, dst };
      });
      this.model.steps.push({ op: "inherit", part: src.no, items });
      this.changed();
      el.remove();
      this.toast(`وُرثت ${items.length} عناصر من البارت ${String(src.no).padStart(3, "0")}`);
    });
  }

  private snapshot(): void {
    const ap = this.model.parts?.[this.model.activePart ?? 0];
    if (ap) ap.edited = new Date().toISOString();
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
    this.updateHistoryBar();
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
    const parts: string[] = [this.imagesSvg(), this.gridSvg(r.width, r.height)];
    const highlight = this.highlighted();
    const lineColor = (o: GObj) => (highlight.has(o.id) ? "var(--select)" : "var(--line)");

    for (const g of this.vis.ghosts ? this.ghosts : [])
      for (const o of g.objects.values())
        if (o.kind === "line") parts.push(`<polyline class="ghost" points="${o.pts.map((p) => this.toScreen(p).map((v) => v.toFixed(1)).join(",")).join(" ")}" fill="none"/>`);
    if (this.showNest) parts.push(this.nestSvg());
    if (this.showPieces) parts.push(this.piecesSvg());
    for (const o of this.res.objects.values()) {
      if (o.kind !== "line") continue;
      const pts = o.pts.map((p) => this.toScreen(p).map((v) => v.toFixed(1)).join(",")).join(" ");
      const w = highlight.has(o.id) ? 2.5 : 1.4;
      parts.push(`<polyline points="${pts}" fill="none" stroke="${lineColor(o)}" stroke-width="${w}"/>`);
      if (this.showNames) {
        const mid = this.toScreen(o.pts[Math.floor(o.pts.length / 2)]);
        parts.push(`<text x="${mid[0] + 4}" y="${mid[1] - 4}">${esc(o.name)}</text>`);
      }
    }
    for (const o of this.res.objects.values()) {
      if (o.kind !== "point" || !this.vis.points) continue;
      const [x, y] = this.toScreen(o.pts[0]);
      const c = highlight.has(o.id) ? "var(--select)" : "var(--point)";
      parts.push(`<circle cx="${x}" cy="${y}" r="2.6" fill="${c}"/>`);
      if (this.showNames) parts.push(`<text x="${x + 5}" y="${y - 5}">${esc(o.name)}</text>`);
    }
    // picks already made by the current tool
    for (const p of [...this.picks, ...this.extra]) parts.push(this.markSvg(p, "var(--select)"));
    if (this.hover) parts.push(this.markSvg(this.hover, "var(--hover)"));
    parts.push(this.vis.dims ? this.dimsSvg() : "");
    parts.push(this.vis.marks ? this.marksSvg() : "");
    parts.push(this.vis.texts ? this.textsSvg() : "");
    if (this.vis.lengths) parts.push(this.lengthsSvg());
    if (this.showDup) parts.push(this.duplicatesSvg());
    parts.push(this.liveSvg());
    parts.push(this.curveHandlesSvg());
    // no letters on the drawing: the name of the element under the pointer only
    const under = this.nameHover;
    if (under && !this.showNames) {
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
      return `<text class="dim-text" x="${mx}" y="${flip ? my + 15 : my - 5}" transform="rotate(${ang.toFixed(1)} ${mx} ${my})" text-anchor="middle">${full}</text>`;
    };
    const hit = (pts: Pt[]) => {
      if (!live && dimIndex >= 0) this.dimHits.push({ i: dimIndex, pts: pts.map(sc) });
    };
    const line = (a: Pt, b: Pt, dashed = false) => `<line x1="${sc(a)[0]}" y1="${sc(a)[1]}" x2="${sc(b)[0]}" y2="${sc(b)[1]}"${dashed ? ' stroke-dasharray="4 3"' : ""}/>`;
    const out: string[] = [];
    // values in mm, or in inches when the drawing's unit is inch
    const inch = this.model.unit === "in";
    const r1 = (v: number) => (inch ? `${fmt(Math.round((v / 25.4) * 100) / 100)}″` : fmt(Math.round(v * 10) / 10));
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

  private dimsSvg(): string {
    const out: string[] = [];
    this.dimHits = [];
    this.model.steps.forEach((s, i) => {
      if (s.op === "dim" && !this.res.stepErrors.has(i)) out.push(this.dimSvg(s, false, i));
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
    if (!s || s.op !== "curve" || this.form) return [];
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
  private curvePoints(): { k: number; ref: PointRef; s: Pt }[] {
    const s = this.model.steps[this.selectedStep];
    if (!s || s.op !== "curve" || this.form) return [];
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

  private dragPoint: { step: number; mode: "xy" | "offset"; base: Pt } | null = null;
  private dragDim: number | null = null;

  /** The dimension whose line is under the pointer (screen px). */
  private dimAt(sx: number, sy: number): number | null {
    let best: { i: number; d: number } | null = null;
    for (const h of this.dimHits) {
      const d = closestOnPolyline(h.pts, [sx, sy]).d;
      if (d <= 8 && (!best || d < best.d)) best = { i: h.i, d };
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
  private grabCurvePoint(ci: number, k: number): void {
    const curve = this.model.steps[ci] as Extract<Step, { op: "curve" }>;
    const ref = curve.through[k];
    const plain = (v: string) => /^-?\d+(\.\d+)?$/.test(v.trim());
    const si = ref.end ? -1 : this.model.steps.findIndex((t) => (t.op === "point" || t.op === "pointOffset") && t.id === ref.obj);
    const st = this.model.steps[si];
    this.snapshot();
    if (st?.op === "point" && plain(st.x) && plain(st.y)) return void (this.dragPoint = { step: si, mode: "xy", base: [0, 0] });
    if (st?.op === "pointOffset" && plain(st.dx) && plain(st.dy)) return void (this.dragPoint = { step: si, mode: "offset", base: this.pointOf(st.from) });
    // tied point: put an offset point between it and the curve, just before the curve
    const id = newId(this.model, "point");
    this.model.steps.splice(ci, 0, { op: "pointOffset", id, from: { ...ref }, dx: "0", dy: "0" });
    curve.through[k] = { obj: id };
    this.selectedStep = ci + 1;
    this.evaluate();
    this.dragPoint = { step: ci, mode: "offset", base: this.pointOf(ref) };
  }

  private handleAt(sx: number, sy: number) {
    return this.curveHandles().find((h) => Math.hypot(h.hs[0] - sx, h.hs[1] - sy) <= 9) ?? null;
  }

  private curveHandlesSvg(): string {
    const hs = this.curveHandles();
    if (!hs.length) return "";
    const out: string[] = [];
    for (const h of hs) {
      out.push(`<line x1="${h.es[0]}" y1="${h.es[1]}" x2="${h.hs[0]}" y2="${h.hs[1]}" stroke="var(--text)" stroke-dasharray="4 3" stroke-width="1.3"/>`);
      out.push(`<circle class="curve-handle" cx="${h.hs[0]}" cy="${h.hs[1]}" r="6.5" fill="none" stroke="#e53935" stroke-width="2"/><circle cx="${h.hs[0]}" cy="${h.hs[1]}" r="2.2" fill="#e53935"/>`);
      out.push(`<circle cx="${h.es[0]}" cy="${h.es[1]}" r="4" fill="var(--live)"/>`);
      out.push(`<text class="live-label" x="${h.hs[0] + 9}" y="${h.hs[1] - 9}" direction="ltr">\u2066${h.deg}°${h.set ? "" : " (حر)"} · ${h.pct}%\u2069</text>`);
    }
    // the points the curve passes through: drag them to reshape the curve
    for (const p of this.curvePoints()) out.push(`<rect class="curve-pt" x="${p.s[0] - 5}" y="${p.s[1] - 5}" width="10" height="10" fill="var(--bg)" stroke="#2fa4dd" stroke-width="2"/>`);
    const s = this.model.steps[hs[0].i] as Extract<Step, { op: "curve" }>, o = this.res.objects.get(s.id) as GObj;
    const mid = this.toScreen(o.pts[Math.floor(o.pts.length / 2)]);
    out.push(`<text class="live-label" x="${mid[0] + 8}" y="${mid[1] + 18}" direction="ltr">\u2066${fmt(Math.round(polyLen(o.pts) * 10) / 10)} mm\u2069</text>`);
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
    for (const pc of this.model.pieces ?? []) {
      const g = this.res.pieces.get(pc.id);
      if (!g) continue;
      out.push(`<polygon points="${pts(g.cut)}" fill="var(--piece-fill)" stroke="var(--piece)" stroke-width="2"/>`);
      out.push(`<polygon points="${pts(g.sew)}" fill="none" stroke="var(--piece)" stroke-width="1.2" stroke-dasharray="6 4"/>`);
      for (const n of g.notches) for (const sh of n.shape) out.push(`<polyline points="${pts(sh)}" fill="none" stroke="var(--piece)" stroke-width="2.2"/>`);
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
          if (d <= (kind === "point" ? SNAP_PX : PICK_PX) && (!best || d < best.d)) best = { d, ref };
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
    if (t.action) {
      this.cancelTool();
      if (t.key === "inheritBlock") this.openLibrary();
      else if (t.key === "saveBlock") this.saveBlock();
      else this.openInherit(t.key === "inheritPart");
      return;
    }
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
      const pick = document.createElement("select");
      pick.className = "pt-ref";
      pick.title = "اختر X أو Z";
      pick.innerHTML = `<option value="">XZ</option>`;
      pick.addEventListener("focus", () => (pick.innerHTML = `<option value="">XZ</option>` + this.refOptions().map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")));
      pick.addEventListener("mousedown", () => pick.dispatchEvent(new Event("focus")));
      pick.addEventListener("change", () => {
        if (!pick.value) return;
        inp.value = pick.value;
        pick.value = "";
        inp.dispatchEvent(new Event("input"));
      });
      inp.after(pick);
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
    const u = this.undoStack.length, r = this.redoStack.length;
    (bar.querySelector('[data-h="undo"]') as HTMLButtonElement).disabled = !u;
    (bar.querySelector('[data-h="undo-list"]') as HTMLButtonElement).disabled = u < 2;
    (bar.querySelector('[data-h="undo"] b') as HTMLElement).textContent = u ? String(u) : "";
    // the forward arrow only appears after going back
    for (const sel of ['[data-h="redo"]', '[data-h="redo-list"]']) (bar.querySelector(sel) as HTMLElement).hidden = !r;
    (bar.querySelector('[data-h="redo"] b') as HTMLElement).textContent = r ? String(r) : "";
    (bar.querySelector(".hist-menu") as HTMLElement).hidden = true;
  }

  /** X and Z values with their current numbers and names, for pick lists. */
  private refOptions(): [string, string][] {
    const sized = withSize(this.model);
    return [
      ...sized.measurements.map((m): [string, string] => [`X${m.id}`, `X${m.id} = ${fmt(m.value)}${m.name ? " · " + m.name : ""}`]),
      ...this.model.variables.map((v): [string, string] => [`Z${v.id}`, `Z${v.id}${this.res.z.has(v.id) ? " = " + fmt(this.res.z.get(v.id) as number) : ""}${v.name ? " · " + v.name : ""}`]),
    ];
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
    if (this.form || (this.collecting && this.extra.length)) this.confirmStep();
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
      if (step.op === "curve") this.selectedStep = this.model.steps.length - 1; // its end handles show at once
      this.changed();
      const err = this.res.stepErrors.get(this.model.steps.length - 1);
      if (err) this.toast(`تمت إضافة الخطوة لكن فيها خطأ: ${err}`);
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
      if (this.calibrating !== null) {
        const rr = svg.getBoundingClientRect();
        this.calibrateClick(this.toWorld(e.clientX - rr.left, e.clientY - rr.top));
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
        const di = !this.tool || (!this.picks.length && !this.extra.length && !this.form) ? this.dimAt(sx, sy) : null;
        if (di !== null) {
          this.snapshot();
          this.dragDim = di;
          e.preventDefault();
          return;
        }
        const cp = this.curvePoints().find((p) => Math.abs(p.s[0] - sx) <= 7 && Math.abs(p.s[1] - sy) <= 7);
        if (cp && (!this.tool || (!this.picks.length && !this.extra.length && !this.form))) {
          this.grabCurvePoint(this.selectedStep, cp.k);
          e.preventDefault();
          return;
        }
      }
      if (this.form?.live?.submit) {
        this.form.live.submit();
        return;
      }
      const kind = this.currentPickKind();
      if (!kind) return;
      const r = svg.getBoundingClientRect();
      const h = this.hit(kind, e.clientX - r.left, e.clientY - r.top);
      if (kind === "point" && this.ptMode !== "free") {
        const made = this.modePoint(this.toWorld(e.clientX - r.left, e.clientY - r.top), e.clientX - r.left, e.clientY - r.top);
        if (made) this.onPick(made);
        return;
      }
      if (h) this.onPick(h);
      else if (kind === "point" && this.tool && (!this.collecting || this.tool.multi?.kind === "point")) this.onPick(this.freePointAt(this.toWorld(e.clientX - r.left, e.clientY - r.top)));
      else if (kind !== "canvas") this.toast(kind === "line" ? "انقر على خط" : "انقر على نقطة أو طرف خط");
    });
    window.addEventListener("mouseup", (e) => {
      // right click without dragging = confirm the step (as in GRAFIS); dragging pans
      if (this.dragHandle || this.dragPoint !== null || this.dragDim !== null) {
        this.dragHandle = null;
        this.dragPoint = null;
        this.dragDim = null;
        this.changed();
      }
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
      if (this.dragDim !== null) {
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
        else if (t.op === "pointOffset") (t.dx = r(this.mouse[0] - this.dragPoint.base[0])), (t.dy = r(this.mouse[1] - this.dragPoint.base[1]));
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
          const q = this.angleStep > 0 ? this.angleStep : 1;
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
      if (!this.pan) {
        const oh = this.hit("object", sx, sy), id = oh ? pickedId(oh) : null;
        if (id !== this.nameHover) {
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
      mirror: "Mirror", curve: "Curve", corner: "Corner", parallels: "Parallels", scale: "Scale", inherit: "Inherit objects", mark: "Symbol / stitch", text: "Text", pointOffset: "Point offset", dim: "Dimension",
    };
    const steps = this.model.steps;
    const sel = this.selectedStep;
    const rows = steps
      .map((s, i) => {
        const err = this.res.stepErrors.get(i);
        const name = s.op === "corner" ? `Corner (${s.kind})` : NAMES[s.op] ?? s.op;
        return `<tr data-i="${i}" class="${i === sel ? "selected" : ""}${err ? " error" : ""}" title="${err ? esc(err) : "دابل كليك للتعديل"}"><td class="rs">${i + 1}</td><td class="nm">${name}</td><td class="ds">${describe(s, this.model).replace(/\u2066(.*?)\u2069/g, '<bdi dir="ltr">$1</bdi>')}</td></tr>`;
      })
      .join("");
    box.innerHTML = `<div class="record">
      <div class="rec-table" tabindex="0">${steps.length ? `<table><thead><tr><th>RS</th><th>Name</th><th>التفاصيل</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">لا توجد خطوات بعد.</div>`}</div>
      <div class="rec-preview"><svg></svg><span class="rec-at"></span></div>
      <div class="rec-foot">
        <button data-rec="first" title="أول خطوة">⏮</button><button data-rec="prev" title="الخطوة السابقة">◀</button><button data-rec="next" class="rec-play" title="الخطوة التالية">▶</button><button data-rec="last" title="آخر خطوة">⏭</button>
        <span class="rec-gap"></span>
        <button data-rec="edit" title="تعديل قيم الخطوة">تعديل</button><button data-rec="del" class="danger" title="حذف الخطوة">حذف</button>
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
      }),
    );
    const editable = sel >= 0 && !!steps[sel] && stepFields(steps[sel]).length > 0;
    (box.querySelector('[data-rec="edit"]') as HTMLButtonElement).disabled = !editable;
    (box.querySelector('[data-rec="del"]') as HTMLButtonElement).disabled = sel < 0;
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

  /** Texts / symbols / stitches / notches: annotations, not objects. A frame removes those
   * whose anchor lies inside it; a click removes the text under it. */
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
        if (what === "symbols" && st.obj === undefined && inside(anchor(st.a)) && (st.kind !== "grain" || inside(anchor(st.b)))) gone.add(i);
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
        const [x, y] = this.toScreen([im.x, im.y + im.h]), [x2, y2] = this.toScreen([im.x + im.w, im.y]);
        return `<image href="${im.data}" x="${x}" y="${y}" width="${Math.max(1, x2 - x)}" height="${Math.max(1, y2 - y)}" opacity="${im.opacity}" preserveAspectRatio="none"/>`;
      })
      .join("");
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
      <div class="img-f"><span>الشفافية</span><input type="range" min="0.1" max="1" step="0.05" data-ik="opacity" value="${im.opacity}"/><button data-ia="cal" title="انقر نقطتين معروفتين على الصورة ثم اكتب المسافة الحقيقية">📏 معايرة بنقطتين</button><button data-ia="del" class="danger">حذف</button></div></div>`).join("");
    el.innerHTML = `<div class="za-head"><b>Pixel images · صور الخلفية (F9)</b><button data-ia="close">×</button></div><div class="za-body">${rows || '<p class="empty">لا توجد صور. أضف صورة باترون لتتبعها بالرسم.</p>'}
      <div class="za-foot"><button class="primary" data-ia="add">＋ إضافة صورة</button><button data-ia="close">إغلاق</button></div></div>`;
    document.body.append(el);
    el.addEventListener("change", (e) => {
      const t = e.target as HTMLInputElement, k = Number(t.closest<HTMLElement>(".img-row")?.dataset.k), im = list[k], f = t.dataset.ik;
      if (!im || !f) return;
      this.snapshot();
      if (f === "visible") im.visible = t.checked;
      else {
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
      else if (a === "del" && list[k]) {
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
  openVisibility(): void {
    const old = document.querySelector(".vis-win");
    if (old) return old.remove();
    const el = document.createElement("section");
    el.className = "z-assistant vis-win";
    el.dir = "rtl";
    const items: [keyof App["vis"] | "pieces", string][] = [["points", "النقاط"], ["dims", "الأبعاد (F7)"], ["marks", "الغرز والعلامات"], ["texts", "النصوص"], ["ghosts", "البارتات الباهتة"], ["pieces", "القطع وحواشي الخياطة"], ["lengths", "أطوال الخطوط (F8)"], ["images", "صور الخلفية (F9)"]];
    el.innerHTML = `<div class="za-head"><b>Visibility · الرؤية</b><button data-v="close">×</button></div><div class="za-body">${items
      .map(([k, l]) => `<label class="za-r"><input type="checkbox" data-vk="${k}" ${(k === "pieces" ? this.showPieces : this.vis[k]) ? "checked" : ""}/> ${l}</label>`)
      .join("")}<label class="za-r"><input type="checkbox" data-vk="dup" ${this.showDup ? "checked" : ""}/> إبراز العناصر المكررة (F4)</label></div>`;
    document.body.append(el);
    el.addEventListener("change", (e) => {
      const t = e.target as HTMLInputElement, k = t.dataset.vk;
      if (k === "pieces") (this.showPieces = t.checked), this.render();
      else if (k === "dup") this.showDup !== t.checked && this.toggleDuplicates();
      else if (k) this.setVis(k as keyof App["vis"], t.checked);
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
          pc.notchTypes?.splice(Number(b.dataset.ndel), 1);
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

  /** X values, laid out as GRAFIS: a dense table X | name | MTM | Standard | one column per
   * size, a tool bar (add / delete the selected row) and a search box. */
  private xSel = -1;
  private xFilter = "";

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
          <td class="xn"><input data-i="${i}" data-f="name" value="${esc(m.name)}" placeholder="0"/></td>
          <td class="xc"><input dir="ltr" data-i="${i}" data-f="code" value="${esc(m.code ?? "")}" placeholder="—" title="اسم هذا القياس في نظام MTM أو ملف الاستيراد"/></td>
          <td class="xv"><input class="expr num" type="text" inputmode="decimal" dir="ltr" lang="en" data-i="${i}" data-f="value" value="${m.value}"/></td>${cells}
        </tr>`;
      })
      .join("");
    const head = sizes.map((sz) => `<th class="sz" title="${sz.kind === "customer" ? "زبون" : "مقاس"}">${esc(sz.name)}</th>`).join("");
    box.innerHTML = `<div class="xgrid">
      <div class="xg-bar"><button data-add class="xg-add" title="إضافة قياس X">⊕</button><button data-xa="del" class="xg-del" title="حذف القياس المحدد"${this.xSel < 0 ? " disabled" : ""}>✕</button>
        <span class="xg-info">${this.model.measurements.length} X · ${sizes.length + 1} ${sizes.length ? "مقاسات" : "مقاس"}</span></div>
      <div class="xg-table"><table><thead><tr><th class="xid">X</th><th class="xn">الاسم · Name</th><th class="xc">MTM</th><th class="xv">${esc(sizeName(this.model, -1))}</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
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
      inp.addEventListener("focus", () => setTimeout(() => inp.select(), 0));
      inp.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const rows = [...tbody.querySelectorAll<HTMLInputElement>(`input[data-sz="${inp.dataset.sz}"]`)];
        const next = rows[rows.indexOf(inp) + 1];
        if (next) next.focus();
        else inp.blur();
      });
    });
    box.querySelector(".xg-bar")?.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>("[data-xa]")?.dataset.xa;
      if (a === "del" && this.xSel >= 0 && this.model.measurements[this.xSel]) {
        const m = this.model.measurements[this.xSel];
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
  async importXFile(name: string, data: { text?: string; bytes?: Uint8Array; base64?: string }): Promise<void> {
    try {
      const bytes = data.bytes ?? (data.base64 ? fromBase64(data.base64) : undefined);
      const rows = bytes ? await readXlsx(bytes) : readCsv(data.text ?? "");
      const before = JSON.stringify(this.model);
      const r = importXTable(this.model, rows);
      this.undoStack.push(before);
      this.redoStack = [];
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
          <td><input data-i="${i}" data-f="name" value="${esc(v.name)}" placeholder="—" title="الوصف"/></td>
          <td class="val${err ? " bad" : ""}" data-zval="${v.id}" title="${err ? esc(err) : ""}">${err ? esc(err) : val !== undefined ? fmt(val) : ""}</td>
          <td><button class="danger" data-del="${i}" title="حذف">×</button></td>
        </tr>`;
      })
      .join("");
    box.innerHTML =
      `<table class="grid ztable"><thead><tr><th>Z</th><th>Formula · المعادلة</th><th>Text · الوصف</th><th>Value</th><th></th></tr></thead><tbody>${rows}</tbody></table>` +
      `<div class="table-actions"><button data-add>إضافة معادلة</button><button data-zas-bar title="مساعد المعادلة للسطر الحالي: شروط IF وقوائم X و Z">ƒx مساعد المعادلات</button></div>` +
      `<p class="empty">اكتب المعادلة في خانة Formula (مثل X2/2 أو Z1+10)، أو اضغط ƒx للمساعد. Enter يحفظ وينتقل للسطر التالي. للقياس من الرسم استخدم أداتي «قياس مسافة» و«قياس طول».</p>`;
    this.bindTable(box, "variables");
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
        // show the stored number cleanly (no leading zeros or stray characters)
        if (inp.dataset.f === "value") inp.value = String((this.model[key][Number(inp.dataset.i)] as unknown as { value: number }).value);
        this.renderSteps();
      });
      // a field opens with its text selected, so typing replaces the old value (0)
      inp.addEventListener("focus", () => setTimeout(() => inp.select(), 0));
      // Enter saves the value at once and moves to the same field of the next row
      inp.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        inp.dispatchEvent(new Event("change"));
        const next = box.querySelector<HTMLInputElement>(`input[data-f="${inp.dataset.f}"][data-i="${Number(inp.dataset.i) + 1}"]`);
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
