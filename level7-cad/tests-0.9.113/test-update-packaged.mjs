// Packaged automatic-update test: a local server publishes version 0.9.999; the
// packaged program must detect it, stage verified files while running, leave its
// files unchanged until exit, then install into resources/app on a normal exit.
// Usage: L7_EXE=<prog>/level7-and-mtm L7_MANIFEST=http://127.0.0.1:8766/latest.json xvfb-run -a node test-update-packaged.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const exe=process.env.L7_EXE,appDir=path.join(path.dirname(exe),'resources','app'),data=await fs.mkdtemp(path.join(os.tmpdir(),'l7-upd-'));
const env={...process.env,LOCALAPPDATA:data,L7_UPDATE_MANIFEST_URL:process.env.L7_MANIFEST};delete env.ELECTRON_RUN_AS_NODE;
const before=JSON.parse(await fs.readFile(appDir+'/package.json','utf8')).version;
const app=await _electron.launch({executablePath:exe,args:['--no-sandbox'],env,timeout:60000});const page=await app.firstWindow();page.setDefaultTimeout(40000);
await page.waitForFunction(()=>{const o=document.querySelector('#local-update-status');return o&&!o.hidden&&o.dataset.state==='ready';});
console.log('STATUS',await page.locator('#local-update-status').textContent());
assert.equal(JSON.parse(await fs.readFile(appDir+'/package.json','utf8')).version,before);console.log('PASS packaged program stages the verified update and keeps running unchanged');
await app.evaluate(({app})=>app.quit());await new Promise(r=>setTimeout(r,3000));
assert.equal(JSON.parse(await fs.readFile(appDir+'/package.json','utf8')).version,'0.9.999');assert((await fs.readFile(appDir+'/src/ui-0113.css','utf8')).includes('UPDATE-TEST-MARKER'));
const log=JSON.parse(await fs.readFile(path.join(data,'LEVEL7 CAD','Updates','last-install.json'),'utf8'));console.log('PASS installed into resources/app on exit:',log.from,'->',log.to,log.files);
