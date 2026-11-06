// 0.9.156: a curve with only its two ends is reshaped by grabbing the curve itself (a point is added
// there and dragged); a click selects the curve; a right click leaves the curve editing.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0156-curve-grab.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design'));await f.waitForFunction(()=>!!window.level7);
 await f.evaluate(()=>{const a=window.level7,m=a.model;a.snapshot();m.steps=[{op:'point',id:1,x:'0',y:'-300'},{op:'point',id:2,x:'300',y:'0'},
   {op:'curve',id:3,through:[{obj:1},{obj:2}],startAngle:'0',endAngle:'90'}];m.nextId=4;a.selectedStep=-1;a.changed();a.fit();});
 const box=await page.locator('#l7-design-frame').boundingBox();
 const mid=await f.evaluate(()=>{const o=window.level7.res.objects.get(3);return o.pts[Math.floor(o.pts.length/2)];});
 const [px,py]=await f.evaluate(p=>window.level7.toScreen(p),mid);
 // 1) 0.9.163: a single click makes nothing active; a double-click on the curve does (its handles show)
 await page.mouse.click(box.x+px,box.y+py);assert.equal(await f.evaluate(()=>window.level7.selectedStep),-1);
 await page.mouse.move(box.x+px,box.y+py);await page.waitForTimeout(150);await page.mouse.dblclick(box.x+px,box.y+py);
 assert.equal(await f.evaluate(()=>window.level7.selectedStep),2);pass('a single click makes nothing active; a double-click on the curve shows its handles');
 // 2) dragging the curve adds a point there and moves it
 const before=await f.evaluate(()=>window.level7.res.objects.get(3).pts.map(p=>p.join()).join(';'));
 await page.mouse.move(box.x+px,box.y+py);await page.mouse.down();await page.mouse.move(box.x+px-50,box.y+py-40,{steps:6});await page.mouse.up();
 const r=await f.evaluate(()=>{const a=window.level7,c=a.model.steps.find(s=>s.op==='curve');return{n:c.through.length,steps:a.model.steps.length,sel:a.selectedStep,pts:a.res.objects.get(3).pts.map(p=>p.join()).join(';'),mid:a.pointOf(c.through[1])};});
 assert(r.n===3&&r.steps===4&&r.pts!==before,JSON.stringify(r));
 const want=await f.evaluate(([x,y])=>window.level7.toWorld(x,y),[px-50,py-40]);assert(Math.hypot(r.mid[0]-want[0],r.mid[1]-want[1])<2,JSON.stringify([r.mid,want]));
 pass(`dragging the curve adds a point (through ${r.n} points) and the curve follows it`);
 // 3) one Ctrl+Z takes the added point away
 await f.evaluate(()=>window.level7.undo());assert.equal(await f.evaluate(()=>window.level7.model.steps.find(s=>s.op==='curve').through.length),2);pass('one Ctrl+Z removes the added point');
 // 4) right click (no drag) leaves the curve editing
 await f.evaluate(()=>{window.level7.selectedStep=2;window.level7.render();});
 assert(await f.evaluate(()=>!!document.querySelector('.curve-handle')));
 const dbg=await f.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y);return{tool:!!window.level7.tool,form:!!window.level7.form,el:e?.tagName+'.'+e?.className?.baseVal+e?.id};},[px+120,py+120]);await page.mouse.click(box.x+px+120,box.y+py+120,{button:'right'});
 const after=await f.evaluate(()=>({sel:window.level7.selectedStep,h:!!document.querySelector('.curve-handle')}));
 assert(after.sel===-1&&!after.h,JSON.stringify(after));pass('a right click leaves the curve editing (handles hidden)');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
