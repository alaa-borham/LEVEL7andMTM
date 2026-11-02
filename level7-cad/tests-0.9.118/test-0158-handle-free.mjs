// 0.9.158: a curve end handle moves freely in every direction (1°), also when the angle step of the
// line tools is 90°; Shift snaps it to 15°.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0158-handle-free.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design'));await f.waitForFunction(()=>!!window.level7);
 await f.evaluate(()=>{const a=window.level7,m=a.model;a.snapshot();a.angleStep=90;m.steps=[{op:'point',id:1,x:'0',y:'-300'},{op:'point',id:2,x:'300',y:'0'},
   {op:'curve',id:3,through:[{obj:1},{obj:2}],startAngle:'0',endAngle:'90'}];m.nextId=4;a.selectedStep=2;a.changed();a.fit();});
 const box=await page.locator('#l7-design-frame').boundingBox();
 const h=await f.evaluate(()=>window.level7.curveHandles().map(h=>({end:h.end,hs:h.hs})));
 const end=h.find(x=>x.end==='end');
 // drag the end handle sideways and up: a slanted direction, not only 90°
 await page.mouse.move(box.x+end.hs[0],box.y+end.hs[1]);await page.mouse.down();
 await page.mouse.move(box.x+end.hs[0]+37,box.y+end.hs[1]-11,{steps:6});await page.mouse.up();
 const a1=Number(await f.evaluate(()=>window.level7.model.steps[2].endAngle));
 assert(a1%45!==0,'end angle '+a1);pass(`the end handle turns freely (angle step 90° for lines): 90° → ${a1}°`);
 const st=await f.evaluate(()=>window.level7.curveHandles().find(h=>h.end==='start').hs);
 await page.mouse.move(box.x+st[0],box.y+st[1]);await page.mouse.down();await page.mouse.move(box.x+st[0]-9,box.y+st[1]+31,{steps:6});await page.mouse.up();
 const a2=Number(await f.evaluate(()=>window.level7.model.steps[2].startAngle));assert(a2%45!==0,'start angle '+a2);pass(`the start handle turns freely: 0° → ${a2}°`);
 // Shift: 15° steps
 const e2=await f.evaluate(()=>window.level7.curveHandles().find(h=>h.end==='end').hs);
 await page.keyboard.down('Shift');await page.mouse.move(box.x+e2[0],box.y+e2[1]);await page.mouse.down();await page.mouse.move(box.x+e2[0]+23,box.y+e2[1]+7,{steps:6});await page.mouse.up();await page.keyboard.up('Shift');
 const a3=Number(await f.evaluate(()=>window.level7.model.steps[2].endAngle));assert(a3%15===0,'shift angle '+a3);pass(`with Shift the handle snaps to 15°: ${a3}°`);
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
