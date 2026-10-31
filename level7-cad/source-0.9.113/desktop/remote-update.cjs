'use strict';
// 0.9.113 automatic updates. The program reads a release manifest from the
// LEVEL7 and MTM repository, downloads only the application files whose
// SHA-256 differs from the installed ones, verifies every file, and installs
// them after the next normal exit (the running program is never patched).
// Only application files are touched: documents and user data are not.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const REPO_RAW = 'https://raw.githubusercontent.com/alaa-borham/LEVEL7andMTM';
const CHANNELS = ['main', 'claude/tender-pasteur-bwjzzi'];
const MANIFEST_PATH = 'level7-cad/releases/latest.json';
const ALLOWED = /^(?:native\.html|index\.html|package\.json|README[^/]*\.md|(?:src|desktop|assets|examples)\/[A-Za-z0-9._\-\/]+)$/;
const MAX_FILES = 2000, MAX_FILE = 16 * 1024 * 1024, MAX_TOTAL = 64 * 1024 * 1024;

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const versionParts = v => String(v || '').split('.').map(n => Number.parseInt(n, 10) || 0);
function newer(a, b) { const x = versionParts(a), y = versionParts(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }
function safeRelative(p) { return typeof p === 'string' && ALLOWED.test(p) && !p.split('/').some(s => s === '..' || s === '.' || s === '') ; }

function createRemoteUpdater({ app, net, appRoot, dataRoot, notify }) {
  const root = path.join(dataRoot, 'Updates');
  const currentVersion = app.getVersion();
  const manifestOverride = process.env.L7_UPDATE_MANIFEST_URL || '';
  const enabled = app.isPackaged || !!manifestOverride;
  let state = enabled ? { state: 'current', currentVersion, message: 'لم يُفحص بعد.' } : { state: 'disabled', currentVersion, message: 'التحديث التلقائي يعمل في النسخة المبنية فقط.' };
  let busy = null, staged = null;
  const publish = next => { state = { currentVersion, ...next }; try { notify?.(state); } catch {} return state; };

  async function fetchBytes(url, limit) {
    if (!manifestOverride && !url.startsWith(REPO_RAW + '/')) throw Error('مصدر تحديث غير مسموح.');
    const response = await net.fetch(url, { cache: 'no-store', redirect: 'error' });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > limit) throw Error('الملف أكبر من الحد المسموح.');
    return bytes;
  }
  async function readManifest() {
    const urls = manifestOverride ? [manifestOverride] : CHANNELS.map(c => `${REPO_RAW}/${c}/${MANIFEST_PATH}`);
    let lastError = null;
    for (const url of urls) {
      try {
        const manifest = JSON.parse((await fetchBytes(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), 2 * 1024 * 1024)).toString('utf8'));
        if (manifest?.product !== 'LEVEL7 and MTM' || typeof manifest.version !== 'string' || !Array.isArray(manifest.files) || manifest.files.length > MAX_FILES) throw Error('ملف الإصدار غير صالح.');
        for (const f of manifest.files) if (!safeRelative(f?.path) || !/^[a-f0-9]{64}$/.test(f?.sha256 || '') || !Number.isInteger(f?.size) || f.size < 0 || f.size > MAX_FILE) throw Error('ملف الإصدار يحتوي مساراً غير مسموح.');
        return { manifest, base: manifest.baseUrl || url.slice(0, url.lastIndexOf('/')) + '/app' };
      } catch (error) { lastError = error; }
    }
    throw lastError || Error('تعذر قراءة ملف الإصدار.');
  }
  async function localHash(rel) { try { return sha256(await fsp.readFile(path.join(appRoot, ...rel.split('/')))); } catch { return null; } }

  async function check() {
    if (!enabled) return state;
    if (busy) return busy;
    busy = (async () => {
      publish({ state: 'checking', message: 'يفحص وجود تحديث…' });
      try {
        const { manifest, base } = await readManifest();
        if (!newer(manifest.version, currentVersion)) { staged = null; return publish({ state: 'current', version: manifest.version, message: `البرنامج محدّث (${currentVersion}).` }); }
        try { await fsp.access(appRoot, fs.constants.W_OK); } catch { return publish({ state: 'error', version: manifest.version, message: 'مجلد البرنامج للقراءة فقط، فلا يمكن تثبيت التحديث تلقائياً. انقل البرنامج إلى مجلد قابل للكتابة.' }); }
        const dir = path.join(root, 'staged-' + manifest.version.replace(/[^0-9.]/g, ''));
        await fsp.rm(dir, { recursive: true, force: true }); await fsp.mkdir(dir, { recursive: true });
        const changed = []; let total = 0;
        for (const f of manifest.files) {
          if (await localHash(f.path) === f.sha256) continue;
          const bytes = await fetchBytes(`${base}/${f.path.split('/').map(encodeURIComponent).join('/')}?v=${manifest.version}`, MAX_FILE);
          if (bytes.length !== f.size || sha256(bytes) !== f.sha256) throw Error('فشل التحقق من الملف ' + f.path + '؛ لم يُثبّت شيء');
          total += bytes.length; if (total > MAX_TOTAL) throw Error('حجم التحديث أكبر من الحد المسموح.');
          const target = path.join(dir, 'files', ...f.path.split('/'));
          await fsp.mkdir(path.dirname(target), { recursive: true }); await fsp.writeFile(target, bytes);
          changed.push(f);
        }
        await fsp.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ version: manifest.version, changed, notes: manifest.notes || '' }, null, 1));
        staged = { dir, version: manifest.version, changed };
        return publish({ state: 'ready', version: manifest.version, message: `الإصدار ${manifest.version} جاهز (${changed.length} ملف). يُثبَّت تلقائياً عند إغلاق البرنامج.${manifest.notes ? '\n' + manifest.notes : ''}` });
      } catch (error) {
        return publish({ state: 'error', message: 'تعذر فحص التحديث: ' + (error?.message || error) + '. البرنامج الحالي لم يتغير.' });
      } finally { busy = null; }
    })();
    return busy;
  }

  // Runs synchronously while the program exits. Every staged file was verified
  // when it was downloaded and is verified again here; replaced files are backed
  // up first so a failed copy restores the previous version.
  function installOnExit() {
    if (!staged) return false;
    const backup = path.join(root, `backup-${currentVersion}-${Date.now()}`), done = [];
    try {
      for (const f of staged.changed) {
        const from = path.join(staged.dir, 'files', ...f.path.split('/')), bytes = fs.readFileSync(from);
        if (sha256(bytes) !== f.sha256) throw Error('staged file changed: ' + f.path);
      }
      for (const f of staged.changed) {
        const target = path.join(appRoot, ...f.path.split('/')), from = path.join(staged.dir, 'files', ...f.path.split('/'));
        if (fs.existsSync(target)) { const b = path.join(backup, ...f.path.split('/')); fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(target, b); }
        fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(from, target); done.push(f);
      }
      fs.writeFileSync(path.join(root, 'last-install.json'), JSON.stringify({ from: currentVersion, to: staged.version, files: done.map(f => f.path), backup, time: new Date().toISOString() }, null, 1));
      fs.rmSync(staged.dir, { recursive: true, force: true }); staged = null; return true;
    } catch (error) {
      for (const f of done) { const b = path.join(backup, ...f.path.split('/')); try { if (fs.existsSync(b)) fs.copyFileSync(b, path.join(appRoot, ...f.path.split('/'))); } catch {} }
      try { fs.writeFileSync(path.join(root, 'last-install-error.json'), JSON.stringify({ from: currentVersion, to: staged?.version, error: String(error?.message || error), time: new Date().toISOString() }, null, 1)); } catch {}
      return false;
    }
  }

  return { status: () => state, check, installOnExit, enabled };
}

module.exports = { createRemoteUpdater, newer, safeRelative };
