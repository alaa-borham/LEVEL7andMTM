// 0.9.113 interface test: version, Arabic captions on icon tools, help card for
// available and unavailable tools, updater status element. Runs the real app.
// Usage: L7_SRC=<app dir> [L7_EXE=<packaged exe>] xvfb-run -a node test-0113-ui.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC,exe=process.env.L7_EXE||path.join(src,'node_modules/electron/dist/electron'),args=process.env.L7_EXE?['--no-sandbox']:['--no-sandbox',src];
const qa=await fs.mkdtemp(path.join(os.tmpdir(),'l7-0113-')),env={...process.env,LOCALAPPDATA:path.join(qa,'profile')};delete env.ELECTRON_RUN_AS_NODE;
let failed=0;const pass=t=>console.log('PASS '+t);
const app=await _electron.launch({executablePath:exe,args,env,timeout:60000});
try{const page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1440,height:900});
 {const v=await app.evaluate(({app})=>app.getVersion());assert.match(v,/^0\.9\.11[3-9]$/);pass('version '+v);}
 await page.waitForSelector('body.ui-0113');await page.waitForSelector('#tool-guide');
 const caps=await page.locator('.grafis-category-grid .grafis-icon-option').evaluateAll(b=>b.map(x=>x.dataset.caption||''));
 assert(caps.length>=10&&caps.every(c=>/[؀-ۿ]/.test(c)),JSON.stringify(caps));pass(`all ${caps.length} tool groups show an Arabic caption`);
 await page.locator('[data-tool-category="parallel"]').hover();await page.waitForFunction(()=>/التوازي/.test(document.querySelector('.tool-guide-title').textContent));
 assert.match(await page.locator('.tool-guide-state').textContent(),/مجموعة/);pass('help card names the group under the pointer');
 await page.locator('#cad-toolbox [data-action="new-template"]').click();await page.locator('[data-tool-category="points"]').click();
 const pending=page.locator('#tool-category-view .grafis-icon-option:disabled:visible').first();
 if(await pending.count()){await pending.hover({force:true});await page.waitForFunction(()=>document.querySelector('#tool-guide').dataset.available==='false');assert.match(await page.locator('.tool-guide-state').textContent(),/غير متاح/);pass('a disabled tool is described as unavailable and stays disabled');assert(await pending.isDisabled());}
 const avail=page.locator('#tool-category-view .grafis-icon-option:not(:disabled):visible').first();await avail.hover();await page.waitForFunction(()=>document.querySelector('#tool-guide').dataset.available==='true');pass('an available tool is described as usable');
 assert.equal(errors.length,0,errors.join('\n'));pass('no page errors');
}catch(e){failed=1;console.error(e);}finally{await app.close().catch(()=>{});}
process.exit(failed);
