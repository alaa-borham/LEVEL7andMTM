// 0.9.118 LEVEL7 design mode: the host icons drive the embedded LEVEL7 engine.
// Usage: L7_SRC=<app dir> [L7_EXE=<packaged exe>] xvfb-run -a node test-0118-design.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC,exe=process.env.L7_EXE||path.join(src,'node_modules/electron/dist/electron'),args=process.env.L7_EXE?['--no-sandbox']:['--no-sandbox',src];
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'l7design-'));const env={...process.env,LOCALAPPDATA:tmp};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:exe,args,env,timeout:60000});const page=await app.firstWindow();page.setDefaultTimeout(20000);await page.waitForSelector('#tool-guide');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();
 await page.waitForSelector('#l7-design:not([hidden]) .l7-design-tool');
 const n=await page.locator('.l7-design-tool svg').count();assert(n>=16,'tools '+n);pass(n+' engine tools drawn with host icons');
 const frame=page.frameLocator('#l7-design-frame');const f=page.frames().find(x=>x.url().includes('l7design'));assert(f,'engine frame loaded');
 assert(await f.evaluate(()=>document.body.classList.contains('embedded')&&getComputedStyle(document.querySelector('.tools')).display==='none'));pass('engine runs embedded, its own tool list hidden');
 assert(await f.evaluate(()=>document.body.classList.contains('dark')));pass('dark theme reaches the engine');
 // Point tool: click on the canvas, confirm, twice; then a line between them.
 const canvas=frame.locator('#canvas');const box=await canvas.boundingBox();
 for(const[dx,dy]of[[0.35,0.5],[0.65,0.4]]){if(await page.locator('[data-l7d-tool="point"]').getAttribute('aria-pressed')!=='true')await page.locator('[data-l7d-tool="point"]').click();await page.waitForFunction(()=>document.querySelector('[data-l7d-tool="point"]').getAttribute('aria-pressed')==='true');await page.mouse.click(box.x+box.width*dx,box.y+box.height*dy);await frame.locator('#tool-box [data-ok]').click();}
 assert.equal(await f.evaluate(()=>window.level7.model.steps.length),2);pass('host point icon builds points in the engine');
 await page.locator('[data-l7d-tool="line"]').click();await page.waitForFunction(()=>document.querySelector('[data-l7d-tool="line"]').getAttribute('aria-pressed')==='true');await page.mouse.click(box.x+box.width*0.35,box.y+box.height*0.5);await page.mouse.click(box.x+box.width*0.65,box.y+box.height*0.4);
 await f.waitForFunction(()=>window.level7.model.steps.length===3);
 const steps=await f.evaluate(()=>window.level7.model.steps.map(s=>s.op));assert.deepEqual(steps,['point','point','line'],JSON.stringify(steps));pass('host line icon joins the two points');
 await page.locator('[data-l7d-tool="parallel"]').click();await page.waitForFunction(()=>document.querySelector('[data-l7d-tool="parallel"]').getAttribute('aria-pressed')==='true');await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('[data-l7d-tool="parallel"]').getAttribute('aria-pressed')==='false');pass('tool state follows the engine; Esc cancels');
 // Save through the host dialog.
 const file=path.join(tmp,'design.level7.json');await app.evaluate(({dialog},p)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:p});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},file);
 await page.locator('[data-l7d-command="save"]').click();await page.waitForFunction(()=>/تم الحفظ/.test(document.querySelector('.l7-design-status').textContent));
 const saved=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(saved.steps.length,3);pass('save writes a LEVEL7 design file, not MDL');
 await f.evaluate(()=>window.level7.newDesign());assert.equal(await f.evaluate(()=>window.level7.model.steps.length),0);
 await page.locator('[data-l7d-command="open"]').click();await page.waitForFunction(()=>/تم فتح/.test(document.querySelector('.l7-design-status').textContent));
 await f.waitForFunction(()=>window.level7.model.steps.length===3);pass('open reads the design back through the host dialog');
 await page.locator('[data-l7d="close"]').click();assert(await page.locator('#l7-design').isHidden());await page.waitForSelector('#canvas-empty');pass('closing returns to the MDL workspace');
 assert.deepEqual(errors,[]);pass('no page errors');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
