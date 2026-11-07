'use strict';

const { app, BrowserWindow, dialog, ipcMain, session, Menu, crashReporter, clipboard, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { randomBytes,createHash } = require('node:crypto');
const{createNativeSaveTargets}=require('./native-save-targets.cjs');
const { createRemoteUpdater } = require('./remote-update.cjs');

const APP_ROOT = path.resolve(__dirname, '..');
const INDEX_FILE = path.join(APP_ROOT, 'native.html');
const INDEX_URL = pathToFileURL(INDEX_FILE).href;
const DATA_ROOT = app.isPackaged
  ? path.join(process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local'), 'LEVEL7 CAD')
  : path.resolve(APP_ROOT, '../../work/level7-desktop-data');
const OPEN_LIMIT = 20 * 1024 * 1024;
const SAVE_LIMIT = 30 * 1024 * 1024;
const FORMATS = Object.freeze({
  text: { name: 'Text report', extensions: ['txt'], suffix: '.txt' },
  mdl: { name: 'GRAFIS native style', extensions: ['mdl'], suffix: '.mdl' },
  project: { name: 'LEVEL7 and MTM project', extensions: ['json'], suffix: '.json' },
  svg: { name: 'SVG pattern (millimetres)', extensions: ['svg'], suffix: '.svg' },
  dxf: { name: 'ASCII DXF pattern', extensions: ['dxf'], suffix: '.dxf' },
  hpgl: { name: 'HPGL plotter drawing', extensions: ['plt', 'hpgl'], suffix: '.plt' },
  design: { name: 'LEVEL7 design', extensions: ['level7'], suffix: '.level7' }, // 0.9.148: own extension (double-click opens it)
  rul: { name: 'AAMA grade rules', extensions: ['rul'], suffix: '.rul' },
  xlsx: { name: 'Excel workbook', extensions: ['xlsx'], suffix: '.xlsx', base64: true },
  csv: { name: 'CSV table (Excel)', extensions: ['csv'], suffix: '.csv' },
  iso: { name: 'ISO cutter file (Gerber ISO)', extensions: ['iso', 'cut'], suffix: '.iso' }
});

// Keep installed application data in the current user profile.
fs.mkdirSync(DATA_ROOT, { recursive: true });
app.setPath('userData', DATA_ROOT);
app.setPath('sessionData', path.join(DATA_ROOT, 'Session'));
app.setPath('crashDumps', path.join(DATA_ROOT, 'CrashDumps'));
app.setAppLogsPath(path.join(DATA_ROOT, 'Logs'));
app.enableSandbox();
// Display name 0.9.112: "LEVEL7 and MTM". The data folder below keeps the old name so
// existing settings and profiles are found after the update.
app.setName('LEVEL7 and MTM');
// Local diagnostics only: no server, upload or design data in the event log.
crashReporter.start({ uploadToServer: false });
if (process.platform === 'win32') app.setAppUserModelId('LEVEL7CAD');

let mainWindow = null;
let operationBusy = false;
// 0.9.190: the file the open design came from (opened, saved or saved as): Ctrl+S writes it again without
// asking; «Save as» asks and remembers the new place; a new design forgets it
let designPath = null;

function inside(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function localRequest(url, exactFile = null) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') return true;
    if (parsed.protocol !== 'file:') return false;
    const file = path.resolve(fileURLToPath(parsed));
    return exactFile ? file === path.resolve(exactFile) : inside(APP_ROOT, file);
  } catch {
    return false;
  }
}

function lockSession(targetSession, exactFile = null) {
  targetSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  targetSession.setPermissionCheckHandler(() => false);
  targetSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    callback({ cancel: !localRequest(details.url, exactFile) });
  });
  targetSession.on('will-download', event => event.preventDefault());
}

function designFrameUrl(url) {
  try { const u = new URL(url); return u.protocol === 'file:' && path.resolve(fileURLToPath(u)) === path.join(APP_ROOT, 'assets', 'l7design', 'index.html'); } catch { return false; }
}

function lockWindow(win, permittedUrl) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, legacyUrl) => {
    if ((event.url ?? legacyUrl) !== permittedUrl) event.preventDefault();
  });
  win.webContents.on('will-redirect', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.webContents.on('will-frame-navigate', event => {
    // No child-frame navigation is required by the local drafting application.
    // 0.9.118: the embedded LEVEL7 design engine is the one permitted child frame.
    if (event.isMainFrame ? event.url !== permittedUrl : !designFrameUrl(event.url)) event.preventDefault();
  });
}

function assertMainSender(event) {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents ||
      !event.senderFrame || event.senderFrame !== mainWindow.webContents.mainFrame ||
      event.senderFrame.url !== INDEX_URL) {
    throw new Error('This operation is restricted to the local main window.');
  }
}

function textPayload(value, label) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > SAVE_LIMIT) {
    throw new Error(`${label} must be text no larger than 30 MB.`);
  }
  return value;
}

function safeFilename(value, fallback) {
  const name = typeof value === 'string' ? path.basename(value).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[ .]+$/, '').slice(0, 140) : '';
  return name && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? name : fallback;
}

async function atomicWrite(destination, contents,expectedHash) {
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${randomBytes(8).toString('hex')}.tmp`);
  try {
    await fsp.writeFile(temporary, contents, { flag: 'wx' });
    if(expectedHash&&createHash('sha256').update(await readBounded(destination,{binary:true})).digest('hex')!==expectedHash)throw Error('تغير الملف خارج LEVEL7؛ لم يُستبدل.');
    await fsp.rename(temporary, destination);
  } finally {
    await fsp.rm(temporary, { force: true }).catch(() => {});
  }
}

async function readBounded(filePath, { binary = false } = {}) {
  const handle = await fsp.open(filePath, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > OPEN_LIMIT) throw new Error('Choose a regular file no larger than 20 MB.');
    // A bounded read also covers a file that changes after the size check.
    const chunks = []; let bytes = 0;
    while (bytes <= OPEN_LIMIT) {
      const buffer = Buffer.alloc(Math.min(65536, OPEN_LIMIT + 1 - bytes));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      chunks.push(buffer.subarray(0, bytesRead)); bytes += bytesRead;
    }
    if (bytes > OPEN_LIMIT) throw new Error('File exceeds the 20 MB import limit.');
    const data = Buffer.concat(chunks, bytes);
    if (binary) return new Uint8Array(data);
    // UTF-16 text exports are common on Windows; all output is UTF-8.
    if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) return data.subarray(2).toString('utf16le');
    if (data.length >= 2 && data[0] === 0xfe && data[1] === 0xff) {
      const swapped = Buffer.from(data.subarray(2));
      for (let i = 0; i + 1 < swapped.length; i += 2) { const b = swapped[i]; swapped[i] = swapped[i + 1]; swapped[i + 1] = b; }
      return swapped.toString('utf16le');
    }
    const utf8 = data.toString('utf8').replace(/^\uFEFF/, '');
    // Readable legacy MAS files can use Windows-1252 instead of UTF-8.
    return /\.mas$/i.test(filePath) && utf8.includes('\ufffd') ? new TextDecoder('windows-1252').decode(data) : utf8;
  } finally {
    await handle.close();
  }
}

async function chooseSave(filename, format) {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: `Save ${format.name}`,
    defaultPath: safeFilename(filename, 'LEVEL7 and MTM' + format.suffix),
    filters: [{ name: format.name, extensions: format.extensions }],
    properties: ['showOverwriteConfirmation', 'createDirectory']
  });
  if (result.canceled || !result.filePath) return null;
  const extension = path.extname(result.filePath).slice(1).toLowerCase();
  return format.extensions.includes(extension) ? result.filePath : result.filePath + format.suffix;
}

function registerOperation(channel, handler) {
  ipcMain.handle(channel, async (event, options) => {
    assertMainSender(event);
    if (operationBusy) throw new Error('Finish the current file operation first.');
    operationBusy = true;
    try { return await handler(options); }
    finally { operationBusy = false; }
  });
}

const nativeSaveTargets=createNativeSaveTargets({readBounded,atomicWrite});
let closeFlow = null;
function registerIpc() {
  ipcMain.handle('pattern:request-close',event=>{assertMainSender(event);if(operationBusy)throw Error('انتظر انتهاء عملية الملف.');setImmediate(()=>mainWindow?.close());return true;});
  ipcMain.handle('pattern:finish-close', (event, options) => {
    assertMainSender(event);
    const flow = closeFlow;
    if (!flow?.token || options?.token !== flow.token || typeof options.saved !== 'boolean') throw new Error('No matching save-before-close request.');
    closeFlow = null;
    if (options.saved) setImmediate(() => { if (!flow.window.isDestroyed()) flow.window.destroy(); });
    return { closing: options.saved };
  });
  registerOperation('pattern:transfer-xz-mdl', async options => {
    if (!(options?.bytes instanceof Uint8Array) || options.bytes.length > OPEN_LIMIT) throw new Error('Invalid source MDL.');
    const { parseMdl } = await import(pathToFileURL(path.join(APP_ROOT, 'src', 'native-mdl.js')).href);
    const { createNativeXZTransfer } = await import(pathToFileURL(path.join(APP_ROOT, 'src', 'native-xz-transfer.js')).href);
    const transfer = await createNativeXZTransfer(parseMdl(options.bytes), { xOverrides: options.xOverrides, zOverrides: options.zOverrides });
    const destination = await chooseSave(options.filename, FORMATS.mdl);
    if (!destination) return null;
    // Publish a completed sibling temporary file with an exclusive hard link.
    // Existing files (including originals and links to them) are never replaced.
    const temporary = path.join(path.dirname(destination), `.level7-xz-${randomBytes(12).toString('hex')}.tmp`);
    try {
      await fsp.writeFile(temporary, transfer.bytes, { flag: 'wx' });
      await fsp.link(temporary, destination);
    } catch (error) {
      if (error.code === 'EEXIST') throw new Error('اختر اسم ملف جديد؛ تصدير X/Z لا يستبدل أي ملف موجود.');
      throw error;
    } finally { await fsp.unlink(temporary).catch(() => {}); }
    return { saved: true, name: path.basename(destination), changes: transfer.changes.length, requiresGrafisRecalculation: true };
  });
  registerOperation('pattern:transfer-parameters-mdl', async options => {
    if (!(options?.bytes instanceof Uint8Array) || options.bytes.length > OPEN_LIMIT) throw new Error('Invalid source MDL.');
    const { parseMdl } = await import(pathToFileURL(path.join(APP_ROOT, 'src', 'native-mdl.js')).href);
    const { createNativeParameterTransfer } = await import(pathToFileURL(path.join(APP_ROOT, 'src', 'native-parameter-transfer.js')).href);
    const transfer = await createNativeParameterTransfer(parseMdl(options.bytes), options.edits);
    const destination = await chooseSave(options.filename, FORMATS.mdl);
    if (!destination) return null;
    // Publish a completed sibling temporary file with an exclusive hard link.
    // Existing files (including originals and links to them) are never replaced.
    const temporary = path.join(path.dirname(destination), `.level7-xz-${randomBytes(12).toString('hex')}.tmp`);
    try {
      await fsp.writeFile(temporary, transfer.bytes, { flag: 'wx' });
      await fsp.link(temporary, destination);
    } catch (error) {
      if (error.code === 'EEXIST') throw new Error('اختر اسم ملف جديد؛ تصدير X/Z لا يستبدل أي ملف موجود.');
      throw error;
    } finally { await fsp.unlink(temporary).catch(() => {}); }
    return { saved: true, name: path.basename(destination), changes: transfer.changes.length, requiresGrafisRecalculation: true };
  });
  registerOperation('pattern:open-mdl', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open GRAFIS native style',
      properties: ['openFile'],
      filters: [{ name: 'GRAFIS style', extensions: ['mdl'] }]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const selected = result.filePaths[0];
    if (path.extname(selected).toLowerCase() !== '.mdl') throw new Error('Choose a native .MDL style.');
    const canonical=await fsp.realpath(selected),bytes=await readBounded(canonical,{binary:true});return{name:path.basename(selected),bytes,saveToken:await nativeSaveTargets.remember(canonical,bytes)};
  });

  registerOperation('pattern:save-mdl', async options => {
    const value = options?.bytes;
    if (!(value instanceof Uint8Array) || value.byteLength < 88 || value.byteLength > OPEN_LIMIT) {
      throw new Error('Native style must contain between 88 bytes and 20 MB.');
    }
    const bytes = Buffer.from(value);
    const { parseMdl, serializeMdl } = await import(pathToFileURL(path.join(APP_ROOT, 'src', 'native-mdl.js')).href);
    const checked = serializeMdl(parseMdl(bytes));
    if(options?.saveToken)return nativeSaveTargets.save(options.saveToken,Buffer.from(checked));
    const destination = await chooseSave(options?.filename, FORMATS.mdl);
    if (!destination) return null;
    await atomicWrite(destination, Buffer.from(checked));
    return { saved:true,name:path.basename(destination),saveToken:await nativeSaveTargets.remember(destination,checked) };
  });

  registerOperation('pattern:open-file', async options => {
    const measurements = options?.measurements === true, design = options?.design === true, table = options?.table === true;
    if (options?.marker === true) {
      // 0.9.141: a marker nested in another program, to be written as an ISO cutter file
      const pick = await dialog.showOpenDialog(mainWindow, { title: 'Open marker (DXF / PLT)', properties: ['openFile'], filters: [{ name: 'Marker DXF / HPGL', extensions: ['dxf', 'plt', 'hpgl'] }] });
      if (pick.canceled || !pick.filePaths[0]) return null;
      const chosen = pick.filePaths[0];
      if (!['.dxf', '.plt', '.hpgl'].includes(path.extname(chosen).toLowerCase())) throw new Error('اختر ملف تعشيق ‎.dxf أو ‎.plt.');
      return { text: await readBounded(chosen), name: path.basename(chosen) };
    }
    if (table) {
      // 0.9.133: X values from Excel (.xlsx, read as bytes) or CSV / tab text
      const pick = await dialog.showOpenDialog(mainWindow, { title: 'Import X values from Excel', properties: ['openFile'], filters: [{ name: 'Excel / CSV', extensions: ['xlsx', 'csv', 'txt'] }] });
      if (pick.canceled || !pick.filePaths[0]) return null;
      const chosen = pick.filePaths[0], ext = path.extname(chosen).toLowerCase();
      if (!['.xlsx', '.csv', '.txt'].includes(ext)) throw new Error('اختر ملف إكسل ‎.xlsx أو ‎.csv.');
      if (ext === '.xlsx') return { name: path.basename(chosen), base64: Buffer.from(await readBounded(chosen, { binary: true })).toString('base64') };
      return { text: await readBounded(chosen), name: path.basename(chosen) };
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: design ? 'Open LEVEL7 design' : measurements ? 'Import measurement table' : 'Open project or import geometry',
      properties: ['openFile'],
      filters: design ? [{ name: 'LEVEL7 design', extensions: ['level7', 'json'] }] : measurements
        ? [{ name: 'Measurement tables', extensions: ['csv', 'mas'] }, { name: 'Supported files', extensions: ['json', 'dxf', 'csv', 'mas'] }]
        : [{ name: 'LEVEL7 and MTM and interchange', extensions: ['json', 'dxf', 'csv', 'mas'] }]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const selected = result.filePaths[0];
    if (design && !['.level7', '.json'].includes(path.extname(selected).toLowerCase())) throw new Error('افتح ملف تصميم LEVEL7 بامتداد ‎.level7 (أو ‎.level7.json القديم).');
    if (!['.json', '.dxf', '.csv', '.mas', ...(design ? ['.level7'] : [])].includes(path.extname(selected).toLowerCase())) throw new Error('Supported imports: JSON, DXF, CSV, and MAS.');
    const opened = { text: await readBounded(selected), name: path.basename(selected) };
    if (design) designPath = path.extname(selected).toLowerCase() === '.level7' ? selected : null;
    return opened;
  });

  registerOperation('pattern:copy-text', async options => {
    const text = textPayload(options?.text, 'Copy');
    if (text.length > 1024 * 1024) throw new Error('Text report is too large to copy.');
    clipboard.writeText(text);
    return { copied: true };
  });
  registerOperation('pattern:save-file', async options => {
    const format = FORMATS[options?.kind];
    if (!Object.hasOwn(FORMATS, options?.kind) || options?.kind === 'mdl') throw new Error('Unsupported text export kind.');
    const text = textPayload(options?.text, 'Export');
    if (format.base64 && !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error('Invalid binary export.');
    // Ctrl+S on a design that has its file: written there again, no dialog
    if (options?.kind === 'design' && options?.inPlace === true && designPath && await fsp.stat(designPath).then(st => st.isFile(), () => false)) {
      await atomicWrite(designPath, text);
      return { saved: true, name: path.basename(designPath), inPlace: true };
    }
    const destination = await chooseSave(options?.filename, format);
    if (!destination) return null;
    await atomicWrite(destination, format.base64 ? Buffer.from(text, 'base64') : text);
    if (options?.kind === 'design') designPath = destination;
    return { saved: true, name: path.basename(destination) };
  });
  registerOperation('pattern:forget-design', async () => { designPath = null; return { forgotten: true }; });

  registerOperation('pattern:print-pdf', async options => {
    const html = textPayload(options?.html, 'Print document');
    const destination = await chooseSave(options?.filename, { name: 'PDF at actual scale', extensions: ['pdf'], suffix: '.pdf' });
    if (!destination) return null;
    const tempDir = await fsp.mkdtemp(path.join(DATA_ROOT, 'print-'));
    const printFile = path.join(tempDir, 'document.html');
    const printSession = session.fromPartition('print-' + randomBytes(10).toString('hex'));
    let printWindow;
    try {
      // CSS @page sizes and SVG physical mm dimensions are kept intact.
      // Scripts are disabled independently of this restrictive policy.
      const policy = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src data:; script-src \'none\'; frame-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">';
      const guarded = /<head(?:\s[^>]*)?>/i.test(html) ? html.replace(/<head(?:\s[^>]*)?>/i, match => match + policy) : policy + html;
      await fsp.writeFile(printFile, guarded, { encoding: 'utf8', flag: 'wx' });
      lockSession(printSession, printFile);
      printWindow = new BrowserWindow({
        show: false,
        width: 1000,
        height: 800,
        webPreferences: {
          session: printSession,
          nodeIntegration: false,
          nodeIntegrationInSubFrames: false,
          contextIsolation: true,
          sandbox: true,
          javascript: false,
          webSecurity: true,
          allowRunningInsecureContent: false,
          webviewTag: false,
          spellcheck: false,
          defaultFontFamily: { standard: 'Arial', sansSerif: 'Arial', serif: 'Times New Roman' }
        }
      });
      lockWindow(printWindow, pathToFileURL(printFile).href);
      await printWindow.loadFile(printFile);
      const pdf = await printWindow.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        scale: 1,
        margins: { top: 0, bottom: 0, left: 0, right: 0 }
      });
      await atomicWrite(destination, pdf);
      return { saved: true, name: path.basename(destination) };
    } finally {
      if (printWindow && !printWindow.isDestroyed()) printWindow.destroy();
      await printSession.clearStorageData().catch(() => {});
      // Only the unique directory created above is eligible for recursive cleanup.
      if (inside(DATA_ROOT, tempDir) && path.basename(tempDir).startsWith('print-')) await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 950,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#101722',
    title: 'LEVEL7 and MTM',
    icon: path.join(APP_ROOT, 'assets', 'icon.ico'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false
    }
  });
  mainWindow = win;
  lockWindow(win, INDEX_URL);
  win.webContents.on('will-prevent-unload', event => {
    // Unload remains cancelled while the asynchronous choice/save is pending.
    // A caller that explicitly permits unload (such as a controlled test) wins.
    setImmediate(async () => {
      if (event.defaultPrevented || win.isDestroyed() || closeFlow) return;
      const flow = { window: win, token: null };closeFlow = flow;
      try {
        const choice = await dialog.showMessageBox(win, {
          type: 'question', title: 'LEVEL7 and MTM', message: 'هل تريد حفظ التعديلات قبل إغلاق البرنامج؟',
          detail: 'حفظ وإغلاق يحفظ نسخة MDL أولًا. إذا ألغيت الحفظ أو تعذّر، يبقى البرنامج مفتوحًا.',
          buttons: ['حفظ وإغلاق', 'إغلاق دون حفظ', 'إلغاء'], defaultId: 2, cancelId: 2, noLink: true
        });
        if (win.isDestroyed() || closeFlow !== flow) return;
        if (choice.response === 1) { closeFlow = null;win.destroy(); }
        else if (choice.response === 0) { flow.token = randomBytes(16).toString('hex');win.webContents.send('pattern:save-before-close', { token: flow.token }); }
        else closeFlow = null;
      } catch (error) { if (closeFlow === flow) closeFlow = null;console.error('Save-before-close failed:', error.message); }
    });
  });
  let recoveryPending = false;
  win.webContents.on('render-process-gone', async (_event, details) => {
    if (details.reason === 'clean-exit' || win.isDestroyed() || recoveryPending) return;
    recoveryPending = true;
    try {
      const log = path.join(DATA_ROOT, 'Logs', 'renderer-failure.json');
      await fsp.mkdir(path.dirname(log), { recursive: true });
      await fsp.writeFile(log, JSON.stringify({ version: app.getVersion(), time: new Date().toISOString(), reason: details.reason, exitCode: details.exitCode, freeMemoryBytes: require('node:os').freemem(), processes: app.getAppMetrics().map(p => ({ type: p.type, memory: p.memory })) }, null, 2));
    } catch (error) { console.error('Could not record renderer failure:', error.message); }
    try {
      const choice = await dialog.showMessageBox(win, {
        type: 'error', title: 'LEVEL7 and MTM',
        message: 'توقفت نافذة الرسم عن العمل.',
        detail: 'يمكن إعادة فتح الواجهة ثم فتح آخر نسخة حفظتها. التعديلات غير المحفوظة قد تكون فُقدت. سُجل تشخيص محلي للمساعدة في تحديد السبب.',
        buttons: ['إعادة فتح الواجهة', 'إغلاق البرنامج'], defaultId: 0, cancelId: 1
      });
      if (!win.isDestroyed()) {
        if (choice.response === 0) await win.loadFile(INDEX_FILE);
        else win.close();
      }
    } catch (error) { console.error('Renderer recovery failed:', error.message); }
    finally { recoveryPending = false; }
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { if (mainWindow === win) mainWindow = null;if (closeFlow?.window === win) closeFlow = null; });
  await win.loadFile(INDEX_FILE);
}

// 0.9.144: shortcuts made for earlier versions show Electron's icon (the exe of those builds has
// no LEVEL7 icon, and updates do not replace the exe). On Windows, shortcuts on the desktop and in
// the Start menu that start this program are pointed at assets/icon.ico. Only those shortcuts,
// only their icon; any failure is ignored.
function fixShortcutIcons() {
  if (process.platform !== 'win32') return;
  const ico = path.join(app.getAppPath(), 'assets', 'icon.ico'), exe = process.execPath.toLowerCase();
  const dirs = [app.getPath('desktop'), path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')];
  for (const dir of dirs) {
    let names = [];
    try { names = fs.readdirSync(dir).filter(n => n.toLowerCase().endsWith('.lnk')); } catch { continue; }
    for (const n of names) {
      try {
        const file = path.join(dir, n), link = shell.readShortcutLink(file);
        if (String(link.target || '').toLowerCase() !== exe || String(link.icon || '').toLowerCase() === ico.toLowerCase()) continue;
        shell.writeShortcutLink(file, 'update', { icon: ico, iconIndex: 0 });
      } catch { /* not a readable shortcut */ }
    }
  }
}

// 0.9.148: a design file double-clicked in Windows (or given on the command line) opens in the
// program: the first instance reads it at start, a second launch hands it to the open window.
const DESIGN_FILE = /\.level7(\.json)?$/i;
function designArg(argv) {
  for (const a of argv.slice(1)) {
    if (!DESIGN_FILE.test(a)) continue;
    try { if (fs.statSync(a).isFile()) return path.resolve(a); } catch { /* not a file */ }
  }
  return null;
}
let pendingDesign = designArg(process.argv);
async function designPayload(file) {
  const d = { name: path.basename(file), text: await readBounded(file) };
  designPath = path.extname(file).toLowerCase() === '.level7' ? file : null;
  return d;
}
if (app.isPackaged && !app.requestSingleInstanceLock()) app.quit();
else app.on('second-instance', (_event, argv) => {
  const file = designArg(argv);
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  if (file && mainWindow) void designPayload(file).then(d => mainWindow.webContents.send('pattern:open-design', d)).catch(() => {});
});
// Windows: .level7 files open with this program and show its icon (current user only, idempotent)
function registerDesignFiles() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  const { execFile } = require('node:child_process');
  const exe = process.execPath, ico = path.join(APP_ROOT, 'assets', 'icon.ico'), root = 'HKCU\\Software\\Classes';
  const keys = [
    [`${root}\\.level7`, 'LEVEL7.Design'],
    [`${root}\\LEVEL7.Design`, 'LEVEL7 design'],
    [`${root}\\LEVEL7.Design\\DefaultIcon`, `"${ico}"`],
    [`${root}\\LEVEL7.Design\\shell\\open\\command`, `"${exe}" "%1"`]
  ];
  for (const [key, value] of keys) execFile('reg', ['add', key, '/ve', '/d', value, '/f'], { windowsHide: true }, () => {});
}

app.whenReady().then(async () => {
  try { fixShortcutIcons(); } catch { /* ignore */ }
  Menu.setApplicationMenu(null);
  lockSession(session.defaultSession);
  registerIpc();
  ipcMain.handle('pattern:take-open-design', async event => {
    assertMainSender(event);
    const file = pendingDesign; pendingDesign = null;
    return file ? designPayload(file) : null;
  });
  try { registerDesignFiles(); } catch { /* ignore */ }
  registerUpdates();
  await createWindow();
  if (updater.enabled) { setTimeout(() => void updater.check(), 8000); setInterval(() => void updater.check(), 6 * 60 * 60 * 1000); }
}).catch(error => {
  dialog.showErrorBox('LEVEL7 and MTM could not start', error.message);
  app.quit();
});

// 0.9.113 automatic updates: see remote-update.cjs. Verified files install after a normal exit.
let updater = null;
function registerUpdates() {
  updater = createRemoteUpdater({ app, net: session.fromPartition('level7-updates', { cache: false }), appRoot: APP_ROOT, dataRoot: DATA_ROOT, notify: state => mainWindow?.webContents.send('update:status', state) });
  ipcMain.handle('update:status', event => { assertMainSender(event); return updater.status(); });
  ipcMain.handle('update:check', event => { assertMainSender(event); return updater.check(); });
}
app.on('will-quit', () => { if (updater) updater.installOnExit(); });

app.on('window-all-closed', () => app.quit());
