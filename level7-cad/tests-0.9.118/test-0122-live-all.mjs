// 0.9.122: live drawing in every value tool. The result is drawn while the mouse moves
// (or before the last click), the mouse sets the value, and a click on the drawing fixes it.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0122-live-all.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC,exe=path.join(src,'node_modules/electron/dist/electron');
const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'l7live-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:exe,args:['--no-sandbox',src],env,timeout:60000});const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForSelector('#tool-guide');
 await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),frame=page.frameLocator('#l7-design-frame');
 // L-shape: L1 from (200,0) to (0,0), L2 from (0,200) to (0,0)
 await f.evaluate(()=>{const a=window.level7,m=a.model;m.steps.push({op:'point',id:1,x:'200',y:'0'},{op:'point',id:2,x:'0',y:'0'},{op:'point',id:3,x:'0',y:'200'},{op:'line',id:4,p1:{obj:1},p2:{obj:2}},{op:'line',id:5,p1:{obj:3},p2:{obj:2}});Object.assign(m.names,{1:'P1',2:'P2',3:'P3',4:'L1',5:'L2'});m.nextId=6;a.changed();a.fit();});
 const box=await frame.locator('#canvas').boundingBox();
 const at=async(x,y)=>{const[sx,sy]=await f.evaluate(([x,y])=>window.level7.toScreen([x,y]),[x,y]);return[box.x+sx,box.y+sy];};
 const tool=async key=>{const b=page.locator(`[data-l7d-tool="${key}"]`);if(!await b.isVisible()){const cat=await b.evaluate(e=>e.closest('[data-l7d-cat-panel]').dataset.l7dCatPanel);await page.locator(`[data-l7d-cat="${cat}"]`).click();}await b.click();await page.waitForFunction(k=>document.querySelector(`[data-l7d-tool="${k}"]`).getAttribute('aria-pressed')==='true',key);};
 const liveCount=()=>f.evaluate(()=>document.querySelectorAll('#canvas [stroke="var(--live)"]').length);
 const val=(k,v)=>f.waitForFunction(([k,v])=>document.querySelector(`#tool-box [data-key="${k}"]`)?.value===v,[k,v],{timeout:5000}).catch(async()=>assert.fail(k+'='+await f.evaluate(k=>document.querySelector(`#tool-box [data-key="${k}"]`)?.value,k)+' expected '+v));
 const last=()=>f.evaluate(()=>window.level7.model.steps.at(-1));
 // parallel: the distance follows the mouse
 await tool('parallel');await page.mouse.click(...await at(100,0));await frame.locator('#tool-box [data-ok]').waitFor();
 await page.mouse.move(...await at(100,20),{steps:3});await page.mouse.move(...await at(100,30),{steps:3});
 await val('dist','30');assert(await liveCount()>0);
 await page.mouse.click(...await at(100,30));await f.waitForFunction(()=>window.level7.model.steps.at(-1).op==='parallel');const pr=await last();assert.equal(pr.dist,'30');
 pass('parallel: distance follows the mouse (30 mm), result drawn live, click fixes it');
 await page.keyboard.press('Escape');
 // set length: the length follows the mouse beyond the end
 await tool('setLength');await page.mouse.click(...await at(30,0));await frame.locator('#tool-box [data-ok]').waitFor();
 await page.mouse.move(...await at(-8,0),{steps:4});await f.waitForFunction(()=>Math.abs(Number(document.querySelector('#tool-box [data-key="length"]').value)-208)<=0.5,null,{timeout:5000});
 await page.mouse.click(...await at(-8,0));await f.waitForFunction(()=>window.level7.model.steps.at(-1).op==='setLength');const sl=Number((await last()).length);assert(Math.abs(sl-208)<=0.5,String(sl));
 pass('line length: follows the mouse past the end ('+sl+' mm)');
 await page.keyboard.press('Escape');await page.keyboard.press('Control+z');await f.waitForFunction(()=>window.level7.model.steps.at(-1).op==='parallel');
 // round corner: preview before the second click, then the radius follows the mouse
 await tool('cornerRound');await page.mouse.click(...await at(20,0));await page.mouse.move(...await at(0,40),{steps:3});
 await f.waitForFunction(()=>document.querySelectorAll('#canvas [stroke="var(--live)"]').length>0);pass('round corner: result previewed while hovering the second line, before clicking');
 await page.mouse.click(...await at(0,40));await frame.locator('#tool-box [data-ok]').waitFor();
 await page.mouse.move(...await at(10,10),{steps:3});await page.mouse.move(...await at(15,0),{steps:3});
 await val('size','15');
 await page.mouse.click(...await at(15,0));await f.waitForFunction(()=>window.level7.model.steps.at(-1).op==='corner');const c=await last();assert.equal(c.kind,'round');assert.equal(c.size,'15');
 assert.equal(await f.evaluate(()=>window.level7.res.stepErrors.size),0);pass('round corner: radius follows the mouse (15 mm) and the corner is built');
 await page.keyboard.press('Escape');
 // trim: preview before the click
 await tool('trim');await page.mouse.click(...await at(100,30));await page.mouse.move(...await at(0,150),{steps:3});
 await f.waitForFunction(()=>document.querySelectorAll('#canvas [stroke="var(--live)"]').length>0);pass('trim/extend: result previewed while hovering the boundary');
 // typed value stays fixed while the mouse moves
 await page.keyboard.press('Escape');await tool('parallel');await page.mouse.click(...await at(100,0));await frame.locator('#tool-box [data-ok]').waitFor();
 await frame.locator('#tool-box input[data-key="dist"]').fill('X1');await f.evaluate(()=>{});await page.mouse.move(...await at(100,70),{steps:3});
 assert.equal(await f.evaluate(()=>document.querySelector('#tool-box input[data-key="dist"]').value),'X1');pass('a typed value is not changed by the mouse');
 // 0.9.123: X added while the box is open is recognised; right click confirms; double-click edits.
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');await tool('lineAngle');await page.mouse.click(...await at(150,150));await frame.locator('#tool-box [data-ok]').waitFor();
 await f.evaluate(()=>{const a=window.level7;a.model.measurements.push({id:2,name:'',value:80});a.changed();});
 await frame.locator('#tool-box input[data-key="angle"]').fill('-90');await frame.locator('#tool-box input[data-key="length"]').fill('X2');
 await f.waitForFunction(()=>!document.querySelector('#tool-box input[data-key="length"]').classList.contains('bad'));
 const n0=await f.evaluate(()=>window.level7.model.steps.length);const [rx,ry]=await at(120,60);await page.mouse.click(rx,ry,{button:'right'});
 await f.waitForFunction(n=>window.level7.model.steps.length===n,n0+0).catch(()=>{});await f.waitForFunction(()=>window.level7.model.steps.at(-1).op==='lineAngle'&&window.level7.model.steps.at(-1).length==='X2');
 pass('X2 added while the box is open is accepted; right click confirms the line');
 await page.mouse.click(rx,ry,{button:'right'});await page.waitForFunction(()=>!document.querySelector('[data-l7d-tool][aria-pressed="true"]'));pass('a second right click ends the tool');
 const id=await f.evaluate(()=>window.level7.model.steps.at(-1).id);const [mx,my]=await at(150,110);await page.mouse.dblclick(mx,my);
 await frame.locator('#tool-box input[data-key="length"]').waitFor();assert.equal(await frame.locator('#tool-box input[data-key="length"]').inputValue(),'X2');
 await frame.locator('#tool-box input[data-key="length"]').fill('50');await frame.locator('#tool-box input[data-key="length"]').press('Enter');
 await f.waitForFunction(id=>{const o=window.level7.res.objects.get(id);return Math.abs(Math.hypot(o.pts[1][0]-o.pts[0][0],o.pts[1][1]-o.pts[0][1])-50)<1e-6;},id);
 pass('double-click on the line opens angle and length (X2) and changes it to 50 mm');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
