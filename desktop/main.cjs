// Windows (and macOS/Linux) desktop shell: opens the same web app from local files.
const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "LEVEL7 CAD",
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, "web", "index.html"));
  // links to the outside world open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// Command line mode for other systems (MTM, marker making), no window:
//   "LEVEL7 CAD.exe" --cli --model thobe.level7.json --order order.json --out C:\orders\out
// The result is in level7-report.json in the output folder; the exit code is
// 0 when everything was exported, 1 when some pieces failed, 2 for bad input.
const cliAt = process.argv.indexOf("--cli");
if (cliAt >= 0) {
  const { run } = require(path.join(__dirname, "cli", "level7.cjs"));
  const code = run(process.argv.slice(cliAt + 1));
  app.exit(code);
} else {
  app.whenReady().then(createWindow);
  app.on("window-all-closed", () => app.quit());
}
