import "./ui/style.css";
import { App } from "./ui/app";
import { TOOLS } from "./ui/tools";

/** Command-bar shortcuts, as in the program's own toolbox. */
function shortcut(e: KeyboardEvent, typing: boolean): string | null {
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  // GRAFIS: Ctrl+6 grade all parts, Ctrl+Shift+6 test run all parts
  if (ctrl && !e.altKey && e.code === "Digit6") return e.shiftKey ? "testAll" : "gradeAll";
  if (ctrl && !e.shiftKey && !e.altKey) {
    const map: Record<string, string> = { s: "save", n: "new", o: "open", e: "aama", g: "tab-sizes", t: "tab-partlist" };
    if (map[k]) return map[k];
    if (!typing && ({ z: "undo", y: "redo", x: "tab-x" } as Record<string, string>)[k]) return ({ z: "undo", y: "redo", x: "tab-x" } as Record<string, string>)[k];
    return null;
  }
  if (e.key === "F4") return "dup";
  if (e.key === "F7") return "dims";
  if (e.key === "F8") return "lengths";
  if (e.key === "F9") return "imgtoggle";
  if (e.altKey && !ctrl && e.key.toLowerCase() === "o") return "visibility";
  if (e.key === "F6") return "fit";
  if (e.key === "F5") return "tab-steps";
  if (e.key === "F11") return "tab-z";
  if (!typing && !ctrl && !e.altKey && (e.key === "+" || e.key === "=")) return "zoomIn";
  if (!typing && !ctrl && !e.altKey && e.key === "-") return "zoomOut";
  return null;
}

/** Numbers always in English digits: every field is marked English (number fields
 * otherwise follow the page language and show Arabic-Indic digits), and Arabic-Indic
 * digits typed from the keyboard are turned into 0-9 at once. */
function englishDigits(): void {
  const mark = (root: ParentNode) => root.querySelectorAll?.("input, select, textarea").forEach((el) => el.setAttribute("lang", "en"));
  mark(document);
  new MutationObserver((recs) => recs.forEach((r) => r.addedNodes.forEach((n) => n instanceof Element && (n.matches("input, select, textarea") ? n.setAttribute("lang", "en") : mark(n))))).observe(document.body, { childList: true, subtree: true });
  document.addEventListener("input", (e) => {
    const el = e.target as EventTarget;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || el.type === "number" || !/[\u0660-\u0669\u06f0-\u06f9]/.test(el.value)) return;
    const at = el.selectionStart;
    el.value = el.value.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
    if (at !== null) el.setSelectionRange(at, at);
  }, true);
}
englishDigits();

const embedded = new URLSearchParams(location.search).get("embedded") === "1";
if (embedded) document.body.classList.add("embedded");
if (new URLSearchParams(location.search).get("theme") === "dark") document.body.classList.add("dark");

const app = new App();
// handy for debugging from the browser console
(window as unknown as { level7: App }).level7 = app;

// Embedded in LEVEL7 and MTM: the host's tool icons drive this engine, and files
// are opened and saved through the host's dialogs. Messages are accepted only
// from the parent window.
if (embedded && window.parent !== window) {
  const post = (msg: Record<string, unknown>) => window.parent.postMessage(msg, "*");
  const select = app.selectTool.bind(app), cancel = app.cancelTool.bind(app);
  const activeKey = () => (app as unknown as { tool: { key: string } | null }).tool?.key ?? null;
  app.selectTool = (t) => { select(t); post({ type: "l7:tool-state", tool: activeKey() }); };
  app.cancelTool = () => { cancel(); post({ type: "l7:tool-state", tool: null }); };
  const click = (action: string) => (document.querySelector(`.actions [data-action="${action}"]`) as HTMLButtonElement | null)?.click();
  // The steps / X / Z / pieces / sizes page is a floating window: hidden until its
  // button is pressed, dragged by its title bar anywhere, resizable, remembered.
  // Exception: Z has a window of its own, so X and Z can be open at the same time.
  const TITLES: Record<string, string> = { steps: "Record · سجل الإنشاء", x: "القياسات X", z: "المعادلات Z", pieces: "القطع", sizes: "المقاسات والتدرج", partlist: "Parts · البارتات" };
  const DEFAULTS: Record<string, { width: string; height: string; left?: string; top?: string }> = {
    steps: { width: "780px", height: "430px" },
    z: { width: "560px", height: "56vh", left: "458px", top: "56px" }, // beside the X window
    partlist: { width: "760px", height: "560px", left: "40px", top: "56px" },
  };
  const panel = document.querySelector(".panel") as HTMLElement;
  const zwin = document.createElement("aside");
  zwin.className = "panel zwin";
  zwin.append(document.querySelector("#tab-z") as HTMLElement);
  panel.after(zwin);
  // the parts window (as GRAFIS part organisation) also has a window of its own
  const pwin = document.createElement("aside");
  pwin.className = "panel pwin";
  pwin.innerHTML = `<div class="tab-body" id="tab-partlist"></div>`;
  zwin.after(pwin);
  app.renderParts();
  const open: Record<"main" | "z" | "parts", string | null> = { main: null, z: null, parts: null };
  const report = () => post({ type: "l7:panel", tab: open.main, tabs: [open.main, open.z, open.parts].filter(Boolean) });
  const makeWindow = (win: HTMLElement, slot: "main" | "z" | "parts") => {
    const head = document.createElement("div");
    head.className = "float-head";
    head.innerHTML = `<b class="float-title"></b><span class="float-btns"><button type="button" class="float-max" title="ملء الشاشة / الحجم السابق (دابل كليك على العنوان)">▢</button><button type="button" class="float-close" title="إغلاق">×</button></span>`;
    win.prepend(head);
    // 0.9.144: resize from every edge and corner (large tables: drag to see all sizes / columns)
    for (const dir of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
      const h = document.createElement("div");
      h.className = `float-grip g-${dir}`;
      h.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        win.classList.remove("maxed");
        const r = win.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
        h.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) => {
          const dx = ev.clientX - x0, dy = ev.clientY - y0;
          let { left, top, width, height } = r;
          if (dir.includes("e")) width = r.width + dx;
          if (dir.includes("s")) height = r.height + dy;
          if (dir.includes("w")) (width = r.width - dx), (left = r.left + dx);
          if (dir.includes("n")) (height = r.height - dy), (top = r.top + dy);
          width = Math.min(Math.max(width, 300), innerWidth - 4);
          height = Math.min(Math.max(height, 180), innerHeight - 4);
          if (dir.includes("w")) left = Math.max(0, r.right - width);
          if (dir.includes("n")) top = Math.max(0, r.bottom - height);
          Object.assign(win.style, { left: left + "px", top: top + "px", width: width + "px", height: height + "px" });
        };
        const up = () => {
          h.removeEventListener("pointermove", move);
          h.removeEventListener("pointerup", up);
          keep();
        };
        h.addEventListener("pointermove", move);
        h.addEventListener("pointerup", up);
      });
      win.append(h);
    }
    let before: Partial<CSSStyleDeclaration> | null = null;
    const maximize = () => {
      if (win.classList.toggle("maxed")) {
        before = { left: win.style.left, top: win.style.top, width: win.style.width, height: win.style.height };
        Object.assign(win.style, { left: "4px", top: "4px", width: innerWidth - 8 + "px", height: innerHeight - 8 + "px" });
      } else if (before) Object.assign(win.style, before);
    };
    head.querySelector(".float-max")?.addEventListener("click", maximize);
    head.addEventListener("dblclick", (e) => !(e.target as HTMLElement).closest("button") && maximize());
    const restore = (tab: string) => {
      let g: Record<string, string> | null = null;
      try {
        g = JSON.parse(localStorage.getItem("level7.panel.geometry." + tab) || "null");
      } catch {}
      const d = DEFAULTS[tab] ?? { width: "430px", height: "62vh" };
      // empty saved values (from older versions) count as missing
      Object.assign(win.style, { left: g?.left || d.left || win.style.left, top: g?.top || d.top || win.style.top, width: g?.width || d.width, height: g?.height || d.height });
    };
    const keep = () => {
      const tab = open[slot];
      if (!tab) return;
      try {
        localStorage.setItem("level7.panel.geometry." + tab, JSON.stringify({ left: win.style.left, top: win.style.top, width: win.style.width || win.offsetWidth + "px", height: win.style.height || win.offsetHeight + "px" }));
      } catch {}
    };
    const toggle = (tab: string | null) => {
      if (tab && open[slot] === tab) tab = null;
      open[slot] = tab;
      win.classList.toggle("open", !!tab);
      if (tab) {
        restore(tab);
        if (slot === "main") (document.querySelector(`.tabs [data-tab="${tab}"]`) as HTMLButtonElement | null)?.click();
        (head.firstElementChild as HTMLElement).textContent = TITLES[tab] ?? "";
        const r = win.getBoundingClientRect();
        if (r.right > innerWidth || r.bottom > innerHeight || r.left < 0 || r.top < 0) Object.assign(win.style, { left: "16px", top: "56px" });
        win.style.zIndex = String(++zTop);
      }
      report();
    };
    head.querySelector(".float-close")?.addEventListener("click", () => toggle(null));
    win.addEventListener("pointerdown", () => (win.style.zIndex = String(++zTop)));
    head.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const r = win.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const x = Math.min(Math.max(0, ev.clientX - dx), innerWidth - 80), y = Math.min(Math.max(0, ev.clientY - dy), innerHeight - 40);
        Object.assign(win.style, { left: x + "px", top: y + "px" });
      };
      const up = () => {
        head.removeEventListener("pointermove", move);
        head.removeEventListener("pointerup", up);
        keep();
      };
      head.addEventListener("pointermove", move);
      head.addEventListener("pointerup", up);
    });
    new ResizeObserver(() => win.classList.contains("open") && keep()).observe(win);
    return toggle;
  };
  let zTop = 30;
  const toggleMain = makeWindow(panel, "main"), toggleZ = makeWindow(zwin, "z"), toggleParts = makeWindow(pwin, "parts");
  const togglePanel = (tab: string | null) => (tab === "z" ? toggleZ(tab) : tab === "partlist" ? toggleParts(tab) : toggleMain(tab));

  const run = (action: string) => {
    if (["save", "dxf", "aama", "plt", "undo", "redo", "fit", "demo"].includes(action)) click(action);
    else if (action === "confirm") app.confirmStep();
    else if (action === "product") app.openProduct();
    else if (action === "dup") app.toggleDuplicates();
    else if (action === "dims") app.setVis("dims", !app.vis.dims);
    else if (action === "visibility") app.openVisibility();
    else if (action === "images") app.openImages();
    else if (action === "imgtoggle") app.setVis("images", !app.vis.images);
    else if (action === "lengths") app.setVis("lengths", !app.vis.lengths);
    else if (action === "arrange") app.openArrange();
    else if (action === "marker") app.exportMarker();
    else if (action === "gradeview") app.cycleGradeView();
    else if (action === "aamaAll") app.exportAllSizes("aama");
    else if (action === "pltAll") app.exportAllSizes("plt");
    else if (action === "aamaGraded") app.exportGraded();
    else if (action === "testPart") app.runCheck(false, false);
    else if (action === "gradePart") app.runCheck(false, true);
    else if (action === "testAll") app.runCheck(true, false);
    else if (action === "gradeAll") app.runCheck(true, true);
    else if (action === "iso") app.openMarkerForIso();
    else if (action === "back") app.backStep();
    else if (action === "zoomIn") app.zoomBy(1.25);
    else if (action === "zoomOut") app.zoomBy(1 / 1.25);
    else if (/^tab-(steps|x|z|pieces|sizes|partlist)$/.test(action)) togglePanel(action.slice(4));
  };
  // Shortcuts of the program's command bar also work while the drawing has focus;
  // the host decides what each one does (new/open use its file dialogs).
  window.addEventListener("keydown", (e) => {
    const typing = (e.target as HTMLElement).matches("input, select, textarea");
    const action = shortcut(e, typing);
    if (!action) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    post({ type: "l7:shortcut", action });
  }, true);
  // a right click in the drawing also closes an open tool menu of the program
  window.addEventListener("contextmenu", () => post({ type: "l7:context" }));
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent || typeof e.data?.type !== "string") return;
    const d = e.data as { type: string; key?: string; action?: string; text?: string; name?: string; grafis?: boolean; value?: unknown };
    switch (d.type) {
      case "l7:tool": {
        const t = TOOLS.find((x) => x.key === d.key);
        if (t) select(t), post({ type: "l7:tool-state", tool: activeKey() });
        break;
      }
      case "l7:theme": document.body.classList.toggle("dark", (d as { dark?: boolean }).dark === true); break;
      case "l7:cancel": app.cancelTool(); break;
      case "l7:json": if (typeof d.text === "string") { const pu = (d as unknown as { purpose?: string }).purpose; if (pu === "library") app.importLibrary(d.text); else if (pu === "mlib") app.importMLib(d.text); } break;
      case "l7:marker": if (typeof d.text === "string") app.isoFromMarker(String(d.name ?? ""), d.text); break;
      case "l7:table": void app.importXFile(String(d.name ?? ""), { text: typeof d.text === "string" ? d.text : undefined, base64: (d as unknown as { base64?: unknown }).base64 as string | undefined }); break;
      case "l7:new": app.newDesign(); break;
      case "l7:saved": app.markSaved(); break;
      case "l7:size": if (typeof d.value === "number") app.setSize(d.value); break;
      case "l7:unit": if (d.value === "mm" || d.value === "in") app.setUnit(d.value); break;
      case "l7:open": if (typeof d.text === "string") app.openText(d.text, d.name ?? "", d.grafis === true); break;
      case "l7:action": if (d.action) run(d.action); break;
    }
  });
  post({ type: "l7:ready", tools: TOOLS.map((t) => ({ key: t.key, name: t.name, group: t.group })) });
}
