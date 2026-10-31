// 0.9.118 LEVEL7 design mode: the host icons drive the embedded LEVEL7 engine.
// Usage: L7_SRC=<app dir> [L7_EXE=<packaged exe>] xvfb-run -a node test-0118-design.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC,exe=process.env.L7_EXE||path.join(src,'node_modules/electron/dist/electron'),args=process.env.L7_EXE?['--no-sandbox']:['--no-sandbox',src];
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'l7design-'));const env={...process.env,LOCALAPPDATA:tmp};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);
const tool=async(page,key)=>{const b=page.locator(`[data-l7d-tool="${key}"]`);if(!await b.isVisible()){const cat=await b.evaluate(e=>e.closest('[data-l7d-cat-panel]').dataset.l7dCatPanel);await page.locator(`[data-l7d-cat="${cat}"]`).click({button:"right"});}return b;};let failed=0,app;
try{
 app=await _electron.launch({executablePath:exe,args,env,timeout:60000});const page=await app.firstWindow();page.setDefaultTimeout(20000);await page.waitForSelector('#tool-guide');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();
 await page.waitForSelector('#l7-design:not([hidden]) .l7-design-cat');
 const n=await page.locator('[data-l7d-tool] svg').count();assert(n>=19,'tools '+n);const cats=await page.locator('[data-l7d-cat]').evaluateAll(b=>b.map(x=>x.dataset.l7dCat));assert(cats.includes('الزوايا')&&cats.includes('التصدير والحفظ'),cats.join());assert.equal(await page.locator('.l7-design-flyout:not([hidden])').count(),0);await page.locator('.l7-design-cat').first().click({button:'right'});assert.equal(await page.locator('.l7-design-flyout:not([hidden])').count(),1);await page.locator('.l7-design-cat').nth(1).click({button:'right'});assert.equal(await page.locator('.l7-design-flyout:not([hidden])').count(),1);await page.keyboard.press('Escape');assert.equal(await page.locator('.l7-design-flyout:not([hidden])').count(),0);pass(n+' engine tools in '+(await page.locator('.l7-design-cat').count())+' strip icons; each opens one flyout menu');
 // 0.9.128: left click starts the group's last (or first) tool at once, no menu
 await page.locator('[data-l7d-cat="الخطوط"]').click();await page.waitForFunction(()=>document.querySelector('[data-l7d-tool="line"]').getAttribute('aria-pressed')==='true');
 assert.equal(await page.locator('.l7-design-flyout:not([hidden])').count(),0);
 await page.locator('[data-l7d-cat="الخطوط"]').click({button:'right'});await page.locator('[data-l7d-tool="parallel"]').click();await page.waitForFunction(()=>document.querySelector('[data-l7d-tool="parallel"]').getAttribute('aria-pressed')==='true');
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('[data-l7d-tool][aria-pressed="true"]'));
 await page.locator('[data-l7d-cat="الخطوط"]').click();await page.waitForFunction(()=>document.querySelector('[data-l7d-tool="parallel"]').getAttribute('aria-pressed')==='true');
 await page.keyboard.press('Escape');pass('group icon: left click starts the last tool used (parallel) directly; right click opens the menu');
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
 // 0.9.124: the page panel is a floating window, hidden until its button is pressed
 assert(await f.evaluate(()=>getComputedStyle(document.querySelector('.panel')).display==='none'));
 await page.locator('[data-l7d-command="tab-steps"]').click();await f.waitForFunction(()=>document.querySelector('.panel').classList.contains('open'));
 await page.waitForFunction(()=>document.querySelector('[data-l7d-command="tab-steps"]').getAttribute('aria-pressed')==='true');
 const hb=await frame.locator('.float-head').boundingBox();await page.mouse.move(hb.x+60,hb.y+15);await page.mouse.down();await page.mouse.move(hb.x+260,hb.y+135,{steps:6});await page.mouse.up();
 const hb2=await frame.locator('.float-head').boundingBox();assert(Math.abs(hb2.x-hb.x-200)<3&&Math.abs(hb2.y-hb.y-120)<3,JSON.stringify([hb,hb2]));
 await page.locator('[data-l7d-command="tab-steps"]').click();await f.waitForFunction(()=>!document.querySelector('.panel').classList.contains('open'));
 pass('steps / X / Z window: hidden until pressed, dragged anywhere, pressing again closes it');
 // 0.9.125 Record: table + preview of the pattern up to the selected step
 await page.locator('[data-l7d-command="tab-steps"]').click();await frame.locator('.record tbody tr').first().waitFor();
 assert.equal(await frame.locator('.float-title').textContent(),'Record · سجل الإنشاء');
 await frame.locator('.record tbody tr').nth(1).click();await f.waitForFunction(()=>document.querySelector('.record tr.selected')?.dataset.i==='1'&&document.querySelectorAll('.rec-preview .rec-now').length>0);
 await frame.locator('[data-rec="next"]').click();await f.waitForFunction(()=>document.querySelector('.record tr.selected')?.dataset.i==='2');
 assert.equal(await frame.locator('.rec-at').textContent(),'3 / 3');
 await page.locator('[data-l7d-command="tab-steps"]').click();await f.waitForFunction(()=>!document.querySelector('.panel').classList.contains('open'));
 pass('Record window: steps table (RS, Name), preview up to the selected step, ▶ next step');
 assert(await page.locator('.l7-design-bar .palette-command').count()>=16);
 await page.locator('[data-l7d-command="tab-x"]').click();await f.waitForFunction(()=>document.querySelector('.tabs .active')?.dataset.tab==='x');
 await frame.locator('#canvas').click({position:{x:20,y:20},button:'middle'});await page.keyboard.press('F11');await f.waitForFunction(()=>document.querySelector('.tabs .active')?.dataset.tab==='z');
 await page.keyboard.press('F5');await f.waitForFunction(()=>document.querySelector('.tabs .active')?.dataset.tab==='steps');
 const sc0=await f.evaluate(()=>window.level7.scale);await page.keyboard.press('+');await f.waitForFunction(s=>window.level7.scale>s,sc0);
 await page.locator('[data-l7d-command="zoomOut"]').click();await f.waitForFunction(s=>Math.abs(window.level7.scale-s)<1e-9,sc0);
 await page.keyboard.press('Control+z');await f.waitForFunction(()=>window.level7.model.steps.length===2);await page.keyboard.press('Control+y');await f.waitForFunction(()=>window.level7.model.steps.length===3);
 pass('command bar and shortcuts (X, F11, F5, +/−, Ctrl+Z/Y) drive the engine, also with focus in the drawing');
 await page.locator('[data-l7d-command="tab-steps"]').click();await f.waitForFunction(()=>!document.querySelector('.panel').classList.contains('open'));
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
 // 0.9.121 live drawing: the angle line follows the mouse, a click on the drawing fixes it.
 await (await tool(page,'lineAngle')).click();await page.waitForFunction(()=>document.querySelector('[data-l7d-tool="lineAngle"]').getAttribute('aria-pressed')==='true');
 const x0=cb.x+cb.width*0.5,y0=cb.y+cb.height*0.5;await page.mouse.click(x0,y0);await frame.locator('#tool-box [data-angle-step]').waitFor();
 await frame.locator('#tool-box [data-angle-step]').selectOption('45');
 await page.mouse.move(x0+60,y0-50,{steps:4});await page.mouse.move(x0+120,y0-110,{steps:4});
 const live=await f.evaluate(()=>({a:document.querySelector('#tool-box input[data-key="angle"]').value,l:Number(document.querySelector('#tool-box input[data-key="length"]').value),label:document.querySelector('#canvas text.live-label')?.textContent}));
 assert.equal(live.a,'45');assert(live.l>0&&/45° · /.test(live.label||''),JSON.stringify(live));
 const n0=await f.evaluate(()=>window.level7.model.steps.length);await page.mouse.click(x0+120,y0-110);
 await f.waitForFunction(n=>window.level7.model.steps.length===n+1,n0);const st=await f.evaluate(()=>window.level7.model.steps.at(-1));assert.equal(st.op,'lineAngle');assert.equal(st.angle,'45');
 pass('angle line follows the mouse with a 45° step and a click fixes it ('+st.length+' mm)');
 // step card: picture and back arrow
 assert(await page.locator('.l7-design-guide:not([hidden]) .l7g-pic svg').count()===1);
 const n1=await f.evaluate(()=>window.level7.model.steps.length);await page.mouse.click(x0-100,y0+60);await f.waitForFunction(()=>document.querySelector('#tool-box').hidden===false);
 await page.locator('[data-l7d-step="back"]').click();await f.waitForFunction(n=>document.querySelector('#tool-box').hidden&&window.level7.model.steps.length===n,n1);
 assert.equal(await page.locator('[data-l7d-tool="lineAngle"]').getAttribute('aria-pressed'),'true');
 pass('step card shows a picture; ‹ goes back one step and removes the point the click made');
 await page.keyboard.press('Escape');
 // X list in the value box: X1 = 1500 is offered and lower-case / Arabic digits are read.
 await f.evaluate(()=>{const m=window.level7.model;m.measurements.push({id:91,name:'طول',value:1500});});
 await (await tool(page,'lineAngle')).click();await page.waitForFunction(()=>document.querySelector('[data-l7d-tool="lineAngle"]').getAttribute('aria-pressed')==='true');await page.mouse.click(x0+40,y0+40);await frame.locator('#tool-box .ref-pick').first().waitFor();
 const opts=await frame.locator('#tool-box .ref-pick').nth(1).locator('option').allTextContents();assert(opts.some(o=>o.startsWith('X91 = 1500')),opts.join('|'));
 await frame.locator('#tool-box .ref-pick').nth(1).selectOption('X91');assert.equal(await frame.locator('#tool-box input[data-key="length"]').inputValue(),'X91');
 await frame.locator('#tool-box input[data-key="length"]').fill('x91/٢');await frame.locator('#tool-box [data-ok]').click();
 await f.waitForFunction(()=>window.level7.model.steps.at(-1).length==='x91/2');const L=await f.evaluate(()=>{const s=window.level7.model.steps.at(-1);const o=window.level7.res.objects.get(s.id);return Math.hypot(o.pts[1][0]-o.pts[0][0],o.pts[1][1]-o.pts[0][1]);});
 assert(Math.abs(L-750)<1e-6,String(L));pass('value box lists X (X91 = 1500); "x91/٢" (typed Arabic digit becomes 2) is read as 750 mm');
 await page.keyboard.press('Escape');
 // corner tools: round the corner between the angle line and the first line
 await (await tool(page,'cornerRound')).click();await page.waitForFunction(()=>document.querySelector('[data-l7d-cat="الزوايا"]').classList.contains('l7-active'));
 assert.equal(await page.locator('.l7-design-flyout:not([hidden])').count(),0);assert.equal(await page.locator('[data-l7d-cat="الزوايا"] svg').getAttribute('data-tool-icon'),'circularCorner');pass('choosing a corner tool closes the menu and its strip icon shows that tool');
 await page.keyboard.press('Escape');
 assert.equal(await f.evaluate(()=>document.querySelectorAll('#canvas line[stroke^="var(--grid"]').length),0);assert(await f.evaluate(()=>getComputedStyle(document.querySelector('.panel .tabs')).display==='none'));pass('no grid squares; page tabs only in the command bar');
 await page.locator('[data-l7d="close"]').click();assert(await page.locator('#l7-design').isHidden());await page.waitForSelector('#canvas-empty');pass('closing returns to the MDL workspace');
 assert.deepEqual(errors,[]);pass('no page errors');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
