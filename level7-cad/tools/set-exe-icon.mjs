// Sets the icon (and version strings) of the Windows exe, so the file, its shortcuts and the
// taskbar show LEVEL7 instead of Electron's icon. Pure JavaScript (resedit), runs on Linux.
// Usage: node set-exe-icon.mjs <exe> <icon.ico> <version>   (resedit installed next to this script or in NODE_PATH)
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ResEdit = require('resedit');
const [exe, ico, version] = process.argv.slice(2);
if (!exe || !ico) { console.error('usage: node set-exe-icon.mjs <exe> <icon.ico> <version>'); process.exit(2); }
const pe = ResEdit.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(pe);
const icon = ResEdit.Data.IconFile.from(fs.readFileSync(ico));
// Electron's main icon group is 1; replace it in every language it is stored under
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const ids = groups.length ? [...new Set(groups.map(g => `${g.id}|${g.lang}`))].map(k => k.split('|')) : [['1', '1033']];
for (const [id, lang] of ids) ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, Number(id) || id, Number(lang), icon.icons.map(i => i.data));
if (version) {
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  if (vi) {
    const [a, b, c] = version.split('.').map(Number);
    vi.setFileVersion(a, b, c, 0, 1033); vi.setProductVersion(a, b, c, 0, 1033);
    vi.setStringValues({ lang: 1033, codepage: 1200 }, { ProductName: 'LEVEL7 and MTM', FileDescription: 'LEVEL7 and MTM', CompanyName: 'LEVEL7', OriginalFilename: 'LEVEL7 and MTM.exe', InternalName: 'LEVEL7 and MTM' });
    vi.outputToResourceEntries(res.entries);
  }
}
res.outputResource(pe);
fs.writeFileSync(exe, Buffer.from(pe.generate()));
console.log(`icon set: ${exe} (${icon.icons.length} images, groups ${ids.map(i => i[0]).join(',')})`);
