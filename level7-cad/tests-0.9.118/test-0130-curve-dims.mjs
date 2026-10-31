// 0.9.130: no letters on the drawing (name on hover), right click closes a tool menu,
// curve end handles (drag sets the direction, double-click frees it), dimensions.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0130-curve-dims.mjs  (writes shot-0130.png)
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'cd-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForSelector('#tool-guide');
 await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');
 await f.evaluate(()=>{const a=window.level7,m=a.model;m.steps.push({op:'point',id:1,x:'200',y:'0'},{op:'point',id:2,x:'0',y:'0'},{op:'point',id:3,x:'0',y:'200'},{op:'line',id:4,p1:{obj:1},p2:{obj:2}},{op:'line',id:5,p1:{obj:3},p2:{obj:2}});Object.assign(m.names,{1:'P1',2:'P2',3:'P3',4:'L1',5:'L2'});m.nextId=6;a.changed();a.fit();});
 const box=await fr.locator('#canvas').boundingBox();const at=async(x,y)=>{const[sx,sy]=await f.evaluate(([x,y])=>window.level7.toScreen([x,y]),[x,y]);return[box.x+sx,box.y+sy];};
 const tool=async key=>{const b=page.locator(`[data-l7d-tool="${key}"]`);if(!await b.isVisible()){const cat=await b.evaluate(e=>e.closest('[data-l7d-cat-panel]').dataset.l7dCatPanel);await page.locator(`[data-l7d-cat="${cat}"]`).click({button:"right"});}await b.click();await page.waitForFunction(k=>document.querySelector(`[data-l7d-tool="${k}"]`).getAttribute('aria-pressed')==='true',key);};
 // icons of every tool are real drawings (0.9.122 regression)
 assert.equal(await page.locator('[data-l7d-tool="cornerSharp"] svg').getAttribute('data-tool-icon'),'corners');assert.equal(await page.locator('[data-l7d-tool="mirrorCopy"] svg').getAttribute('data-tool-icon'),'mirror');
 pass('sharp corner and mirror copy show their own icons again');
 // no letters, name on hover
 assert.equal(await f.evaluate(()=>[...document.querySelectorAll('#canvas text')].filter(t=>/^[PLC]\d+$/.test(t.textContent)).length),0);
 await page.mouse.move(...await at(0,200));await f.waitForFunction(()=>document.querySelector('#canvas text.name-tip')?.textContent==='P3');
 pass('no P/L letters on the drawing; the name appears only under the pointer (P3)');
 // right click closes an open menu (in the program and on the drawing)
 await page.locator('[data-l7d-cat="الخطوط"]').click({button:'right'});assert.equal(await page.locator('.l7-design-flyout:not([hidden])').count(),1);
 await page.mouse.click(...await at(120,120),{button:'right'});await page.waitForFunction(()=>!document.querySelector('.l7-design-flyout:not([hidden])'));
 pass('right click on the drawing closes an open tool menu');
 // curve with end handles
 await tool('curve');for(const[x,y]of[[0,200],[80,120],[200,0]])await page.mouse.click(...await at(x,y));await page.mouse.click(...await at(150,150),{button:'right'});
 await f.waitForFunction(()=>window.level7.model.steps.at(-1).op==='curve');await page.mouse.click(...await at(150,150),{button:'right'});
 await f.waitForFunction(()=>document.querySelectorAll('#canvas .curve-handle').length===2);
 const h=await f.evaluate(()=>[...document.querySelectorAll('#canvas .curve-handle')].map(c=>[+c.getAttribute('cx'),+c.getAttribute('cy')]));
 const [hx,hy]=h[0];await page.mouse.move(box.x+hx,box.y+hy);await page.mouse.down();
 // drag the start handle level with the start point: the curve leaves the start going right (0°)
 const [sx0,sy0]=await f.evaluate(()=>window.level7.toScreen([0,200]));const flip=await f.evaluate(()=>window.level7.curveHandles()[0].flip);await page.mouse.up();await page.mouse.move(box.x+hx,box.y+hy);await page.mouse.down();const tx=sx0+(flip?70:-70),ty=sy0;await page.mouse.move(box.x+tx,box.y+ty,{steps:5});await page.mouse.up();
 await f.waitForFunction(()=>window.level7.model.steps.at(-1).startAngle==='0');
 await page.screenshot({path:'shot-0130.png'});
 pass('curve: two end handles; dragging the start handle sets the start direction (0°)');
 const hh2=await f.evaluate(()=>window.level7.curveHandles()[0].hs);await page.mouse.dblclick(box.x+hh2[0],box.y+hh2[1]);await f.waitForFunction(()=>window.level7.model.steps.at(-1).startAngle==='');pass('double-click on the handle frees the direction again');
 // dimensions
 await tool('dimH');await page.mouse.click(...await at(200,0));await page.mouse.click(...await at(0,200));await fr.locator('#tool-box [data-ok]').waitFor();
 await page.mouse.move(...await at(100,30),{steps:4});await f.waitForFunction(()=>document.querySelector('#canvas g.dim.live text')?.textContent.includes('200'));
 await page.mouse.click(...await at(100,30));await f.waitForFunction(()=>window.level7.model.steps.at(-1).op==='dim');
 assert.equal(await f.evaluate(()=>window.level7.model.steps.at(-1).kind),'h');
 // the dimension follows the pattern
 await f.evaluate(()=>{const a=window.level7;a.model.steps[0].x='260';a.changed();});
 await f.waitForFunction(()=>[...document.querySelectorAll('#canvas g.dim text')].some(t=>t.textContent.includes('260')));
 pass('horizontal dimension placed with the mouse (200 mm) and updated when the pattern changes (260 mm)');
 await page.keyboard.press('Escape');await tool('dimAngle');for(const[x,y]of[[150,0],[0,0],[0,150]])await page.mouse.click(...await at(x,y));
 await f.waitForFunction(()=>[...document.querySelectorAll('#canvas g.dim text')].some(t=>t.textContent.includes('90°')));pass('angle dimension: 90°');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
