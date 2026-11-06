// 0.9.164: the points of the active curve show as small dots; the square only on the point under the
// pointer (and while it is dragged).
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0164-curve-dots.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design'));await f.waitForFunction(()=>!!window.level7);
 await f.evaluate(()=>{const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;delete m.lineStyles;m.pieces=[];
   m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'point',id:2,x:'60',y:'120'},{op:'point',id:3,x:'150',y:'200'},{op:'point',id:4,x:'300',y:'230'},
   {op:'curve',id:5,through:[{obj:1},{obj:2},{obj:3},{obj:4}],startAngle:'',endAngle:''}];m.nextId=6;a.selectedStep=4;a.changed();a.fit();});
 const box=await page.locator('#l7-design-frame').boundingBox(),count=()=>f.evaluate(()=>({dots:document.querySelectorAll('#canvas circle.curve-dot').length,sq:document.querySelectorAll('#canvas rect.curve-pt').length}));
 await page.mouse.move(box.x+5,box.y+box.height-5);await page.waitForTimeout(150);
 assert.deepEqual(await count(),{dots:2,sq:0});pass('active curve: its 2 points show as small dots, no squares');
 const p=await f.evaluate(()=>window.level7.toScreen([60,120]));await page.mouse.move(box.x+p[0],box.y+p[1]);await page.waitForTimeout(150);
 assert.deepEqual(await count(),{dots:1,sq:1});pass('the point under the pointer gets the square');
 await page.mouse.down();await page.mouse.move(box.x+p[0]+30,box.y+p[1]-20,{steps:4});
 assert.deepEqual(await count(),{dots:1,sq:1});await page.mouse.up();
 assert.notEqual(await f.evaluate(()=>window.level7.model.steps.find(s=>s.id===2).x),'60');pass('while dragged it keeps the square and moves');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
