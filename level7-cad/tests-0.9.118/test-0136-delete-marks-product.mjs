// 0.9.136: delete tools (pick / frame, dependents asked), stitch lines and symbols, parts strip
// (permanent / dynamic / off) and Product info. Usage: L7_SRC=<app dir> xvfb-run -a node test-0136-delete-marks-product.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'dm-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForSelector('#tool-guide');
 await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');
 page.on('dialog',d=>d.accept());await f.evaluate(()=>{window.confirm=()=>true;});
 await f.evaluate(()=>{const a=window.level7,m=a.model;m.steps.push({op:'point',id:1,x:'200',y:'0'},{op:'point',id:2,x:'0',y:'0'},{op:'point',id:3,x:'0',y:'200'},{op:'line',id:4,p1:{obj:1},p2:{obj:2}},{op:'line',id:5,p1:{obj:3},p2:{obj:2}},{op:'point',id:6,x:'150',y:'150'},{op:'point',id:7,x:'170',y:'170'});Object.assign(m.names,{1:'P1',2:'P2',3:'P3',4:'L1',5:'L2',6:'P6',7:'P7'});m.nextId=8;a.changed();a.fit();});
 const box=await fr.locator('#canvas').boundingBox();const at=async(x,y)=>{const[sx,sy]=await f.evaluate(([x,y])=>window.level7.toScreen([x,y]),[x,y]);return[box.x+sx,box.y+sy];};
 const tool=async key=>{const b=page.locator(`[data-l7d-tool="${key}"]`);if(!await b.isVisible()){const cat=await b.evaluate(e=>e.closest('[data-l7d-cat-panel]').dataset.l7dCatPanel);await page.locator(`[data-l7d-cat="${cat}"]`).click({button:"right"});}await b.click();await page.waitForFunction(k=>document.querySelector(`[data-l7d-tool="${k}"]`).getAttribute('aria-pressed')==='true',key);};
 const has=id=>f.evaluate(id=>window.level7.res.objects.has(id),id);
 // stitch line and symbols
 await tool('stitchZigzag');await page.mouse.click(...await at(100,0.5));await fr.locator('#tool-box [data-ok]').click();
 await f.waitForFunction(()=>window.level7.model.steps.at(-1).op==='mark'&&document.querySelectorAll('#canvas g.mark polyline').length>0);
 await page.keyboard.press('Escape');await tool('symButton');await page.mouse.click(...await at(150,150));await fr.locator('#tool-box [data-ok]').click();
 await f.waitForFunction(()=>window.level7.model.steps.at(-1).kind==='button');
 await page.keyboard.press('Escape');await tool('grainLine');await page.mouse.click(...await at(0,200));await page.mouse.click(...await at(0,0));
 await f.waitForFunction(()=>window.level7.model.steps.at(-1).kind==='grain'&&document.querySelector('#canvas g.mark.grain'));
 pass('zigzag stitch along L1, a button at P6 and a grain line P3–P2 are drawn');
 await page.screenshot({path:'shot-0136-marks.png'});
 // delete in a frame: P6 and P7 go, and the button on P6 goes with it (dependent)
 await page.keyboard.press('Escape');await tool('delPointsFrame');await page.mouse.click(...await at(130,130));await page.mouse.click(...await at(185,185));
 await f.waitForFunction(()=>!window.level7.res.objects.has(6)&&!window.level7.res.objects.has(7));
 assert(!(await f.evaluate(()=>window.level7.model.steps.some(s=>s.op==='mark'&&s.kind==='button'))));pass('delete points in a frame: P6, P7 and the button that depended on P6');
 // delete a line by picking: L1 and its stitch go
 await page.keyboard.press('Escape');await tool('delLines');await page.mouse.click(...await at(100,0.3));await page.keyboard.press('Enter');
 await f.waitForFunction(()=>!window.level7.res.objects.has(4));assert(!(await f.evaluate(()=>window.level7.model.steps.some(s=>s.op==='mark'&&s.kind==='zigzag'))));
 assert(await has(5));pass('delete a line: L1 and its stitch removed, L2 kept');
 await page.keyboard.press('Escape');await fr.locator('.hist-bar [data-h="undo"]').click();await f.waitForFunction(()=>window.level7.res.objects.has(4));pass('↶ brings them back');
 // parts strip modes
 assert.equal(await fr.locator('.part-strip').getAttribute('data-mode'),'permanent');assert.equal(await fr.locator('.part-strip .ps-item').count(),1);
 await fr.locator('.part-strip [data-smode="dynamic"]').click();assert.equal(await fr.locator('.part-strip').getAttribute('data-mode'),'dynamic');
 await fr.locator('.part-strip [data-smode="off"]').click();assert(await fr.locator('.part-strip .ps-list').isHidden());await fr.locator('.part-strip [data-smode="permanent"]').click();
 await f.evaluate(()=>window.level7.addPart());await f.waitForFunction(()=>document.querySelectorAll('.part-strip .ps-item').length===2);
 await fr.locator('.part-strip [data-spart="0"]').click();await f.waitForFunction(()=>window.level7.model.activePart===0);
 pass('parts strip: thumbnails, permanent / dynamic / off, a click switches to the part');
 // product info
 await page.locator('[data-l7d-command="product"]').click();await fr.locator('.product-win').waitFor();
 await fr.locator('.product-win [data-pi="name"]').fill('ثوب سعودي');await fr.locator('.product-win [data-pi="season"]').fill('Summer');await fr.locator('.product-win [data-pi="comments"]').fill('ياقة صينية');
 await fr.locator('.product-win [data-pi-act="ok"]').click();
 const prd=await f.evaluate(()=>({p:window.level7.model.product,n:window.level7.model.name}));assert.equal(prd.p.season,'Summer');assert.equal(prd.p.comments,'ياقة صينية');assert.equal(prd.n,'ثوب سعودي');
 pass('Product info saved in the design (name, season, comments)');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
