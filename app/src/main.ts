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
  const run = (action: string) => {
    if (["save", "dxf", "aama", "plt", "undo", "redo", "fit", "demo"].includes(action)) click(action);
    else if (action === "zoomIn") app.zoomBy(1.25);
    else if (action === "zoomOut") app.zoomBy(1 / 1.25);
    else if (/^tab-(steps|x|z|pieces|sizes)$/.test(action)) (document.querySelector(`.tabs [data-tab="${action.slice(4)}"]`) as HTMLButtonElement | null)?.click();
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
