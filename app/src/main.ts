import "./ui/style.css";
import { App } from "./ui/app";
import { TOOLS } from "./ui/tools";

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
      case "l7:action": if (d.action && ["save", "dxf", "aama", "plt", "undo", "redo", "fit", "demo"].includes(d.action)) click(d.action); break;
    }
  });
  post({ type: "l7:ready", tools: TOOLS.map((t) => ({ key: t.key, name: t.name, group: t.group })) });
}
