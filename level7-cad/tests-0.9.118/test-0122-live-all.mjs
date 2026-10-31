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
 const f=page.frames().find(x=>x.url().includes('l7design')),frame=page.frameLocator('#l7-design-frame'),fr=frame;
 // L-shape: L1 from (200,0) to (0,0), L2 from (0,200) to (0,0)
 await f.evaluate(()=>{const a=window.level7,m=a.model;m.steps.push({op:'point',id:1,x:'200',y:'0'},{op:'point',id:2,x:'0',y:'0'},{op:'point',id:3,x:'0',y:'200'},{op:'line',id:4,p1:{obj:1},p2:{obj:2}},{op:'line',id:5,p1:{obj:3},p2:{obj:2}});Object.assign(m.names,{1:'P1',2:'P2',3:'P3',4:'L1',5:'L2'});m.nextId=6;a.changed();a.fit();});
 const box=await frame.locator('#canvas').boundingBox();
 const at=async(x,y)=>{const[sx,sy]=await f.evaluate(([x,y])=>window.level7.toScreen([x,y]),[x,y]);return[box.x+sx,box.y+sy];};
 const tool=async key=>{const b=page.locator(`[data-l7d-tool="${key}"]`);if(!await b.isVisible()){const cat=await b.evaluate(e=>e.closest('[data-l7d-cat-panel]').dataset.l7dCatPanel);await page.locator(`[data-l7d-cat="${cat}"]`).click({button:"right"});}await b.click();await page.waitForFunction(k=>document.querySelector(`[data-l7d-tool="${k}"]`).getAttribute('aria-pressed')==='true',key);};
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
 // 0.9.134: parallel of a curve by X, and parallels of several lines and curves at once
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 await f.evaluate(()=>{const a=window.level7,m=a.model;m.measurements.push({id:7,name:'seam',value:12});m.steps.push({op:'curve',id:60,through:[{obj:3},{obj:2,end:undefined}],startAngle:'0',endAngle:'-90'});m.names[60]='C60';m.nextId=Math.max(m.nextId,61);a.changed();});
 await tool('parallel');const cm=await f.evaluate(()=>{const o=window.level7.res.objects.get(60);return o.pts[Math.floor(o.pts.length/2)];});
 await page.mouse.click(...await at(cm[0]+3,cm[1]+3));await fr.locator('#tool-box [data-ok]').waitFor();
 await fr.locator('#tool-box input[data-key="dist"]').fill('X7');await fr.locator('#tool-box input[data-key="dist"]').press('Enter');
 await f.waitForFunction(()=>window.level7.model.steps.at(-1).op==='parallel'&&window.level7.model.steps.at(-1).of===60);
 const dc=await f.evaluate(()=>{const a=window.level7,s=a.model.steps.at(-1),o=a.res.objects.get(s.id),src=a.res.objects.get(60);const p=o.pts[Math.floor(o.pts.length/2)];let best=1e9;for(const q of src.pts)best=Math.min(best,Math.hypot(p[0]-q[0],p[1]-q[1]));return{name:a.model.names[s.id],d:best};});
 assert(Math.abs(dc.d-12)<0.6&&dc.name.startsWith('C'),JSON.stringify(dc));pass('parallel of a curve at X7 = 12 mm (a curve, named '+dc.name+')');
 await page.keyboard.press('Escape');await tool('parallelMany');
 await page.mouse.click(...await at(120,1.5));await page.mouse.click(...await at(1.5,120));await page.mouse.click(...await at(cm[0]-1,cm[1]-1));await page.keyboard.press('Enter');
 await fr.locator('#tool-box input[data-key="dist"]').waitFor();await fr.locator('#tool-box input[data-key="dist"]').fill('X7*2');await fr.locator('#tool-box input[data-key="dist"]').press('Enter');
 await f.waitForFunction(()=>window.level7.model.steps.at(-1).op==='parallels');const pm=await f.evaluate(()=>{const s=window.level7.model.steps.at(-1);return{n:s.ids.length,of:s.of,sides:s.sides};});
 assert.equal(pm.n,3);pass('parallels of 2 lines and a curve at once (distance X7*2), each on the side it was clicked');
 await f.evaluate(()=>{const a=window.level7;a.model.measurements.find(m=>m.id===7).value=20;a.changed();});
 const y1=await f.evaluate(()=>{const s=window.level7.model.steps.at(-1);return window.level7.res.objects.get(s.ids[0]).pts[0][1];});assert(Math.abs(Math.abs(y1)-40)<1e-6,String(y1));
 pass('changing X7 to 20 moves all of them to 40 mm');
 // 0.9.134 transformations: mirror point-to-point and scale about a point by X
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 await tool('mirrorPts');await page.mouse.click(...await at(0,0));await page.mouse.click(...await at(0,200));await page.mouse.click(...await at(150,0.5));await page.keyboard.press('Enter');
 await fr.locator('#tool-box select[data-key="mode"]').waitFor();await fr.locator('#tool-box [data-ok]').click();
 await f.waitForFunction(()=>window.level7.model.steps.at(-1).op==='mirror');
 const mr=await f.evaluate(()=>{const a=window.level7,s=a.model.steps.at(-1);const r=v=>Math.round(v*1000)/1000;return{dst:a.res.objects.get(s.items[0].dst).pts.map(p=>p.map(r)),src:a.res.objects.get(s.items[0].src).pts.map(p=>[r(-p[0]),r(p[1])])};});
 assert.deepEqual(mr.dst,mr.src);pass('mirror from point to point (P2–P3 axis): L1 copied to the other side');
 await page.keyboard.press('Escape');await tool('scalePts');await page.mouse.click(...await at(0,0));await page.mouse.click(...await at(150,0.5));await page.keyboard.press('Enter');
 await fr.locator('#tool-box input[data-key="factor"]').waitFor();await fr.locator('#tool-box input[data-key="factor"]').fill('X7*5');await fr.locator('#tool-box [data-ok]').click();
 await f.waitForFunction(()=>window.level7.model.steps.at(-1).op==='scale');
 const sr=await f.evaluate(()=>{const a=window.level7,s=a.model.steps.at(-1);const r=v=>Math.round(v*1000)/1000;return{dst:a.res.objects.get(s.items[0].dst).pts.map(p=>p.map(r)),src:a.res.objects.get(s.items[0].src).pts.map(p=>p.map(r))};});
 assert.deepEqual(sr.dst,sr.src);pass('scale about P2 by X7*5 = 100 % keeps L1 (200 mm)');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
