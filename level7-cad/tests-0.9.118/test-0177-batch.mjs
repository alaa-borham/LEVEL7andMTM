// 0.9.176: Ctrl+Z works with an Arabic keyboard (key «ئ», place KeyZ); the dimension bar keeps its
// unit / ×2 buttons when vertical; the strip icon's tip names its tool; seam allowance and notch with no
// piece start the piece tool and come back; grain line as GRAFIS (start, direction in 90° steps, length).
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0177-batch.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 const box=await page.locator('#l7-design-frame').boundingBox(),at=async(x,y)=>{const[sx,sy]=await f.evaluate(([x,y])=>window.level7.toScreen([x,y]),[x,y]);return[box.x+sx,box.y+sy];};
 const open=async key=>{const b=page.locator(`[data-l7d-tool="${key}"]`);if(!await b.isVisible()){const cat=await b.evaluate(e=>e.closest('[data-l7d-cat-panel]').dataset.l7dCatPanel);await page.locator(`[data-l7d-cat="${cat}"]`).click({button:"right"});}await b.click();};
 await f.evaluate(()=>{localStorage.removeItem('level7.barPos');const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;delete m.lineStyles;m.pieces=[];a.vis.dims=true;
   m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'point',id:2,x:'200',y:'0'},{op:'point',id:3,x:'200',y:'300'},{op:'point',id:4,x:'0',y:'300'},
   {op:'line',id:5,p1:{obj:1},p2:{obj:2}},{op:'line',id:6,p1:{obj:2},p2:{obj:3}},{op:'line',id:7,p1:{obj:3},p2:{obj:4}},{op:'line',id:8,p1:{obj:4},p2:{obj:1}},
   {op:'dim',kind:'length',obj:5,offset:'-20'}];m.nextId=9;a.selectedStep=-1;a.changed();a.fit();});
 // 1) Ctrl+Z with an Arabic keyboard: the engine and the program read the key's place
 await f.evaluate(()=>{const a=window.level7;a.snapshot();a.model.steps.push({op:'point',id:99,x:'50',y:'50'});a.changed();});
 const n0=await f.evaluate(()=>window.level7.model.steps.length);
 await f.evaluate(()=>document.querySelector('#canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'ئ',code:'KeyZ',ctrlKey:true,bubbles:true})));
 await f.waitForFunction(n=>window.level7.model.steps.length===n-1,n0,{timeout:5000});pass('Ctrl+Z with an Arabic keyboard (key «ئ», place Z) undoes');
 // 2) the dimension bar, vertical: unit and ×2 buttons stay
 await f.evaluate(()=>{localStorage.setItem('level7.barPos',JSON.stringify({vert:true}));window.level7.selectedStep=8;window.level7.render();});
 const bar=fr.locator('.curve-bar.dim-bar');await bar.waitFor();
 assert(await bar.locator('[data-du="in"]').isVisible()&&await bar.locator('[data-dm="4"]').isVisible());pass('vertical dimension bar still shows مم / سم / بوصة and ×1 / ×2 / ×4');
 await f.evaluate(()=>{localStorage.removeItem('level7.barPos');window.level7.selectedStep=-1;window.level7.render();});
 // 3) the strip icon's tip names its tool
 const tip=await page.locator('[data-l7d-cat="الأبعاد"]').getAttribute('title');const shown=await page.locator('[data-l7d-cat="الأبعاد"] svg').getAttribute('data-l7-icon');
 const first=await page.locator(`[data-l7d-cat-panel="الأبعاد"] [data-l7d-tool="${shown}"] span`).textContent();
 assert(tip===first,tip);pass(`0.9.178: the strip icon's tip is the tool's name only: «${tip.split('\n')[0]}»`);
 // 4) seam allowance with no piece: the piece tool starts, and the seam bar comes after the piece
 await open('seamAllowance');
 await f.waitForFunction(()=>window.level7.tool?.key==='piece',null,{timeout:5000});
 for(const [x,y] of [[100,0],[200,150],[100,300],[0,150]])await page.mouse.click(...await at(x,y));
 await page.keyboard.press('Enter');const tb=fr.locator('#tool-box');await tb.locator('[data-ok]').waitFor();await tb.locator('[data-ok]').click();
 await fr.locator('.seam-bar').waitFor();assert.equal(await f.evaluate(()=>window.level7.model.pieces.length),1);
 pass('seam allowance with no piece: «قطعة من الحدود» starts; after the outline + Enter the seam bar opens');
 await page.mouse.click(...await at(400,150),{button:'right'});
 // 5) grain line as GRAFIS: start point, then the mouse gives the direction (90° steps) and length, a click sets it
 await page.keyboard.press('Escape');await open('grainLine');await page.waitForFunction(()=>document.querySelector('[data-l7d-tool="grainLine"]').getAttribute('aria-pressed')==='true');
 await page.mouse.click(...await at(100,250));await tb.locator('input[data-key="angle"]').waitFor();
 await page.mouse.move(...await at(104,90),{steps:4});await page.mouse.click(...await at(104,90));
 const g=await f.evaluate(()=>window.level7.model.steps.at(-1));
 assert(g.kind==='grain'&&!g.b&&g.angle==='-90'&&Math.abs(Number(g.size)-160)<3,JSON.stringify(g));
 assert(await f.evaluate(()=>!!document.querySelector('#canvas g.mark.grain')));pass(`grain line: start, direction snapped to -90°, length ${g.size}, drawn with one arrowhead`);
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
