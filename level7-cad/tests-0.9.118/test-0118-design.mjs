// 0.9.118 LEVEL7 design mode: the host icons drive the embedded LEVEL7 engine.
// Usage: L7_SRC=<app dir> [L7_EXE=<packaged exe>] xvfb-run -a node test-0118-design.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC,exe=process.env.L7_EXE||path.join(src,'node_modules/electron/dist/electron'),args=process.env.L7_EXE?['--no-sandbox']:['--no-sandbox',src];
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'l7design-'));const env={...process.env,LOCALAPPDATA:tmp};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);
const tool=async(page,key)=>{const b=page.locator(`[data-l7d-tool="${key}"]`);if(!await b.isVisible()){const cat=await b.evaluate(e=>e.closest('[data-l7d-cat-panel]').dataset.l7dCatPanel);await page.locator(`[data-l7d-cat="${cat}"]`).click();}return b;};let failed=0,app;
try{
 app=await _electron.launch({executablePath:exe,args,env,timeout:60000});const page=await app.firstWindow();page.setDefaultTimeout(20000);await page.waitForSelector('#tool-guide');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();
 await page.waitForSelector('#l7-design:not([hidden]) .l7-design-cat');
 const n=await page.locator('[data-l7d-tool] svg').count();assert(n>=19,'tools '+n);const cats=await page.locator('[data-l7d-cat]').evaluateAll(b=>b.map(x=>x.dataset.l7dCat));assert(cats.includes('الزوايا')&&cats.includes('التصدير والحفظ'),cats.join());assert.equal(await page.locator('.l7-design-flyout:not([hidden])').count(),0);await page.locator('.l7-design-cat').first().click();assert.equal(await page.locator('.l7-design-flyout:not([hidden])').count(),1);await page.locator('.l7-design-cat').nth(1).click();assert.equal(await page.locator('.l7-design-flyout:not([hidden])').count(),1);await page.keyboard.press('Escape');assert.equal(await page.locator('.l7-design-flyout:not([hidden])').count(),0);pass(n+' engine tools in '+(await page.locator('.l7-design-cat').count())+' strip icons; each opens one flyout menu');
 const frame=page.frameLocator('#l7-design-frame');const f=page.frames().find(x=>x.url().includes('l7design'));assert(f,'engine frame loaded');
 assert(await f.evaluate(()=>document.body.classList.contains('embedded')&&getComputedStyle(document.querySelector('.tools')).display==='none'));pass('engine runs embedded, its own tool list hidden');
 assert(await f.evaluate(()=>document.body.classList.contains('dark')));pass('dark theme reaches the engine');
 // Point tool: click on the canvas, confirm, twice; then a line between them.
 const canvas=frame.locator('#canvas');const box=await canvas.boundingBox();
 for(const[dx,dy]of[[0.35,0.5],[0.65,0.4]]){if(await page.locator('[data-l7d-tool="point"]').getAttribute('aria-pressed')!=='true')await (await tool(page,'point')).click();await page.waitForFunction(()=>document.querySelector('[data-l7d-tool="point"]').getAttribute('aria-pressed')==='true');await page.mouse.click(box.x+box.width*dx,box.y+box.height*dy);await frame.locator('#tool-box [data-ok]').click();}
 assert.equal(await f.evaluate(()=>window.level7.model.steps.length),2);pass('host point icon builds points in the engine');
 await (await tool(page,'line')).click();await page.waitForFunction(()=>document.querySelector('[data-l7d-tool="line"]').getAttribute('aria-pressed')==='true');await page.mouse.click(box.x+box.width*0.35,box.y+box.height*0.5);await page.mouse.click(box.x+box.width*0.65,box.y+box.height*0.4);
 await f.waitForFunction(()=>window.level7.model.steps.length===3);
 const steps=await f.evaluate(()=>window.level7.model.steps.map(s=>s.op));assert.deepEqual(steps,['point','point','line'],JSON.stringify(steps));pass('host line icon joins the two points');
 await (await tool(page,'parallel')).click();await page.waitForFunction(()=>document.querySelector('[data-l7d-tool="parallel"]').getAttribute('aria-pressed')==='true');await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('[data-l7d-tool="parallel"]').getAttribute('aria-pressed')==='false');pass('tool state follows the engine; Esc cancels');
 // Command bar with the toolbox shortcuts (0.9.119).
 const tab=()=>f.evaluate(()=>document.querySelector('.tabs .active')?.dataset.tab);
 assert(await page.locator('.l7-design-bar .palette-command').count()>=16);
 await page.locator('[data-l7d-command="tab-x"]').click();await f.waitForFunction(()=>document.querySelector('.tabs .active')?.dataset.tab==='x');
 await frame.locator('#canvas').click({position:{x:20,y:20},button:'middle'});await page.keyboard.press('F11');await f.waitForFunction(()=>document.querySelector('.tabs .active')?.dataset.tab==='z');
 await page.keyboard.press('F5');await f.waitForFunction(()=>document.querySelector('.tabs .active')?.dataset.tab==='steps');
 const sc0=await f.evaluate(()=>window.level7.scale);await page.keyboard.press('+');await f.waitForFunction(s=>window.level7.scale>s,sc0);
 await page.locator('[data-l7d-command="zoomOut"]').click();await f.waitForFunction(s=>Math.abs(window.level7.scale-s)<1e-9,sc0);
 await page.keyboard.press('Control+z');await f.waitForFunction(()=>window.level7.model.steps.length===2);await page.keyboard.press('Control+y');await f.waitForFunction(()=>window.level7.model.steps.length===3);
 pass('command bar and shortcuts (X, F11, F5, +/−, Ctrl+Z/Y) drive the engine, also with focus in the drawing');
 // Save through the host dialog.
 const file=path.join(tmp,'design.level7.json');await app.evaluate(({dialog},p)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:p});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},file);
 await frame.locator('#canvas').click({position:{x:20,y:20},button:'middle'});await page.keyboard.press('Control+s');await page.waitForFunction(()=>/تم الحفظ/.test(document.querySelector('.l7-design-status').textContent));
 const saved=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(saved.steps.length,3);pass('save writes a LEVEL7 design file, not MDL');
 await f.evaluate(()=>window.level7.newDesign());assert.equal(await f.evaluate(()=>window.level7.model.steps.length),0);
 await page.locator('[data-l7d-command="open"]').click();await page.waitForFunction(()=>/تم فتح/.test(document.querySelector('.l7-design-status').textContent));
 await f.waitForFunction(()=>window.level7.model.steps.length===3);pass('open reads the design back through the host dialog');
 // 0.9.119: on a blank page a line tool starts from a click in empty space (a free point is created).
 await page.locator('[data-l7d-command="new"]').click();await f.waitForFunction(()=>window.level7.model.steps.length===0);
 await (await tool(page,'lineAngle')).click();await page.waitForFunction(()=>document.querySelector('[data-l7d-tool="lineAngle"]').getAttribute('aria-pressed')==='true');
 const cb=await frame.locator('#canvas').boundingBox();await page.mouse.click(cb.x+cb.width*0.4,cb.y+cb.height*0.4);await frame.locator('#tool-box [data-ok]').click();
 await f.waitForFunction(()=>window.level7.model.steps.map(s=>s.op).join()==='point,lineAngle');pass('line by angle and length works on a blank page');
 await (await tool(page,'line')).click();await page.waitForFunction(()=>document.querySelector('[data-l7d-tool="line"]').getAttribute('aria-pressed')==='true');
 await page.mouse.click(cb.x+cb.width*0.3,cb.y+cb.height*0.7);await page.mouse.click(cb.x+cb.width*0.6,cb.y+cb.height*0.75);
 await f.waitForFunction(()=>window.level7.model.steps.map(s=>s.op).join()==='point,lineAngle,point,point,line');pass('line between two clicks in empty space');
 // corner tools: round the corner between the angle line and the first line
 await (await tool(page,'cornerRound')).click();await page.waitForFunction(()=>document.querySelector('[data-l7d-cat="الزوايا"]').classList.contains('l7-active'));
 assert.equal(await page.locator('.l7-design-flyout:not([hidden])').count(),0);assert.equal(await page.locator('[data-l7d-cat="الزوايا"] svg').getAttribute('data-tool-icon'),'circularCorner');pass('choosing a corner tool closes the menu and its strip icon shows that tool');
 await page.keyboard.press('Escape');
 assert.equal(await f.evaluate(()=>document.querySelectorAll('#canvas line[stroke^="var(--grid"]').length),0);assert(await f.evaluate(()=>getComputedStyle(document.querySelector('.panel .tabs')).display==='none'));pass('no grid squares; page tabs only in the command bar');
 await page.locator('[data-l7d="close"]').click();assert(await page.locator('#l7-design').isHidden());await page.waitForSelector('#canvas-empty');pass('closing returns to the MDL workspace');
 assert.deepEqual(errors,[]);pass('no page errors');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
