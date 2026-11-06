// 0.9.174: the curve end handle under the pointer (and while dragged) stands out from the other one.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0174-handle-hot.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design'));await f.waitForFunction(()=>!!window.level7);
 await f.evaluate(()=>{const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;delete m.lineStyles;m.pieces=[];
   m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'point',id:2,x:'200',y:'200'},{op:'curve',id:3,through:[{obj:1},{obj:2}],startAngle:'0',endAngle:'90'}];m.nextId=4;a.selectedStep=2;a.changed();a.fit();});
 const box=await page.locator('#l7-design-frame').boundingBox(),hot=()=>f.evaluate(()=>[...document.querySelectorAll('#canvas circle.curve-handle')].map(c=>c.classList.contains('hot')));
 await page.mouse.move(box.x+5,box.y+box.height-5);assert.deepEqual(await hot(),[false,false]);
 const h=await f.evaluate(()=>window.level7.curveHandles().find(h=>h.end==='end').hs);await page.mouse.move(box.x+h[0],box.y+h[1]);await page.waitForTimeout(150);
 const r=await f.evaluate(()=>[...document.querySelectorAll('#canvas circle.curve-handle')].map(c=>[c.classList.contains('hot'),c.getAttribute('r')]));
 assert(r.filter(x=>x[0]).length===1&&r.find(x=>x[0])[1]==='9',JSON.stringify(r));pass('the handle under the pointer stands out (larger, filled); the other stays plain');
 await page.mouse.down();await page.mouse.move(box.x+h[0]+30,box.y+h[1]-10,{steps:4});
 assert.equal((await hot()).filter(Boolean).length,1);await page.mouse.up();pass('it stays marked while dragged');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
