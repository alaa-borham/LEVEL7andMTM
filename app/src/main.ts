import "./ui/style.css";
import { App } from "./ui/app";
import { TOOLS } from "./ui/tools";

/** Command-bar shortcuts, as in the program's own toolbox. */
function shortcut(e: KeyboardEvent, typing: boolean): string | null {
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && !e.shiftKey && !e.altKey) {
    const map: Record<string, string> = { s: "save", n: "new", o: "open", e: "aama", g: "tab-sizes" };
    if (map[k]) return map[k];
    if (!typing && ({ z: "undo", y: "redo", x: "tab-x" } as Record<string, string>)[k]) return ({ z: "undo", y: "redo", x: "tab-x" } as Record<string, string>)[k];
    return null;
  }
  if (e.key === "F6") return "fit";
  if (e.key === "F5") return "tab-steps";
  if (e.key === "F11") return "tab-z";
  if (!typing && !ctrl && !e.altKey && (e.key === "+" || e.key === "=")) return "zoomIn";
  if (!typing && !ctrl && !e.altKey && e.key === "-") return "zoomOut";
  return null;
}

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
  app.selectTool = (t) => { select(t); post({ type: "l7:tool-state", tool: t.key }); };
  app.cancelTool = () => { cancel(); post({ type: "l7:tool-state", tool: null }); };
  const click = (action: string) => (document.querySelector(`.actions [data-action="${action}"]`) as HTMLButtonElement | null)?.click();
  // The steps / X / Z / pieces / sizes page is a floating window: hidden until its
  // button is pressed, dragged by its title bar anywhere, resizable, remembered.
  const panel = document.querySelector(".panel") as HTMLElement;
  const TITLES: Record<string, string> = { steps: "Record · سجل الإنشاء", x: "القياسات X", z: "المعادلات Z", pieces: "القطع", sizes: "المقاسات والتدرج" };
  const head = document.createElement("div");
  head.className = "float-head";
  head.innerHTML = `<b class="float-title"></b><button type="button" class="float-close" title="إغلاق">×</button>`;
  panel.prepend(head);
  let openTab: string | null = null;
  // each page keeps its own place and size; the Record opens wide by default
  const DEFAULTS: Record<string, { width: string; height: string }> = { steps: { width: "780px", height: "430px" } };
  const restore = (tab: string) => {
    let g: Record<string, string> | null = null;
    try {
      g = JSON.parse(localStorage.getItem("level7.panel.geometry." + tab) || "null");
    } catch {}
    const d = DEFAULTS[tab] ?? { width: "430px", height: "62vh" };
    Object.assign(panel.style, { left: g?.left ?? panel.style.left, top: g?.top ?? panel.style.top, width: g?.width ?? d.width, height: g?.height ?? d.height });
  };
  const keep = () => {
    if (!openTab) return;
    try {
      localStorage.setItem("level7.panel.geometry." + openTab, JSON.stringify({ left: panel.style.left, top: panel.style.top, width: panel.style.width || panel.offsetWidth + "px", height: panel.style.height || panel.offsetHeight + "px" }));
    } catch {}
  };
  const togglePanel = (tab: string | null) => {
    if (tab && openTab === tab) tab = null;
    openTab = tab;
    panel.classList.toggle("open", !!tab);
    if (tab) {
      restore(tab);
      (document.querySelector(`.tabs [data-tab="${tab}"]`) as HTMLButtonElement | null)?.click();
      (head.firstElementChild as HTMLElement).textContent = TITLES[tab] ?? "";
      const r = panel.getBoundingClientRect();
      if (r.right > innerWidth || r.bottom > innerHeight || r.left < 0 || r.top < 0) Object.assign(panel.style, { left: "16px", top: "56px" });
    }
    post({ type: "l7:panel", tab });
  };
  (head.lastElementChild as HTMLElement).addEventListener("click", () => togglePanel(null));
  head.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const r = panel.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    head.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const x = Math.min(Math.max(0, ev.clientX - dx), innerWidth - 80), y = Math.min(Math.max(0, ev.clientY - dy), innerHeight - 40);
      Object.assign(panel.style, { left: x + "px", top: y + "px" });
    };
    const up = () => {
      head.removeEventListener("pointermove", move);
      head.removeEventListener("pointerup", up);
      keep();
    };
    head.addEventListener("pointermove", move);
    head.addEventListener("pointerup", up);
  });
  new ResizeObserver(() => panel.classList.contains("open") && keep()).observe(panel);

  const run = (action: string) => {
    if (["save", "dxf", "aama", "plt", "undo", "redo", "fit", "demo"].includes(action)) click(action);
    else if (action === "confirm") app.confirmStep();
    else if (action === "back") app.backStep();
    else if (action === "zoomIn") app.zoomBy(1.25);
    else if (action === "zoomOut") app.zoomBy(1 / 1.25);
    else if (/^tab-(steps|x|z|pieces|sizes)$/.test(action)) togglePanel(action.slice(4));
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
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent || typeof e.data?.type !== "string") return;
    const d = e.data as { type: string; key?: string; action?: string; text?: string; name?: string; grafis?: boolean };
    switch (d.type) {
      case "l7:tool": {
        const t = TOOLS.find((x) => x.key === d.key);
        if (t) select(t), post({ type: "l7:tool-state", tool: t.key });
        break;
      }
      case "l7:theme": document.body.classList.toggle("dark", (d as { dark?: boolean }).dark === true); break;
      case "l7:cancel": app.cancelTool(); break;
      case "l7:new": app.newDesign(); break;
      case "l7:open": if (typeof d.text === "string") app.openText(d.text, d.name ?? "", d.grafis === true); break;
      case "l7:action": if (d.action) run(d.action); break;
    }
  });
  post({ type: "l7:ready", tools: TOOLS.map((t) => ({ key: t.key, name: t.name, group: t.group })) });
}
