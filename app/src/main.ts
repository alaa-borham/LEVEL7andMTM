import "./ui/style.css";
import { App } from "./ui/app";

const app = new App();
// handy for debugging from the browser console
(window as unknown as { level7: App }).level7 = app;
