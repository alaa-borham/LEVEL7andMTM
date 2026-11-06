// 0.9.165: «قياس طول بنقرة واحدة»: each click on a line or curve writes its length at once on the clicked
// side (no second click, no window); the tool stays for the next one; right click ends.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0165-length-one-click.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design'));await f.waitForFunction(()=>!!window.level7);
 await f.evaluate(()=>{const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;delete m.lineStyles;m.pieces=[];
   m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'lineAngle',id:2,start:{obj:1},angle:'0',length:'240'},{op:'point',id:3,x:'0',y:'-100'},{op:'point',id:4,x:'200',y:'-200'},
   {op:'curve',id:5,through:[{obj:3},{obj:4}],startAngle:'0',endAngle:'0'}];m.nextId=6;a.selectedStep=-1;a.changed();a.fit();});
 const box=await page.locator('#l7-design-frame').boundingBox(),at=async(x,y)=>{const[sx,sy]=await f.evaluate(([x,y])=>window.level7.toScreen([x,y]),[x,y]);return[box.x+sx,box.y+sy];};
 const b=page.locator('[data-l7d-tool="dimLengthQuick"]');if(!await b.isVisible())await page.locator('[data-l7d-cat="الأبعاد"]').click({button:'right'});await b.click();
 await page.waitForFunction(()=>document.querySelector('[data-l7d-tool="dimLengthQuick"]').getAttribute('aria-pressed')==='true');
 await page.mouse.click(...await at(120,2));
 let r=await f.evaluate(()=>{const a=window.level7,d=a.model.steps.filter(s=>s.op==='dim');return{n:d.length,obj:d[0]?.obj,off:d[0]?.offset,form:!!a.form,tool:a.tool?.key,txt:[...document.querySelectorAll('#canvas text')].map(t=>t.textContent).filter(t=>/240/.test(t))};});
 assert(r.n===1&&r.obj===2&&r.off==='8'&&!r.form&&r.tool==='dimLengthQuick'&&r.txt.length,JSON.stringify(r));
 pass(`one click on the line writes its length (240) at once, on the clicked side (offset ${r.off}); no window, the tool stays`);
 const cm=await f.evaluate(()=>{const o=window.level7.res.objects.get(5);return o.pts[Math.floor(o.pts.length/2)];});await page.mouse.click(...await at(cm[0],cm[1]));
 r=await f.evaluate(()=>window.level7.model.steps.filter(s=>s.op==='dim').map(d=>d.obj));assert.deepEqual(r,[2,5]);pass('a click on the curve writes its length too');
 await page.mouse.click(...await at(400,300),{button:'right'});assert.equal(await f.evaluate(()=>!!window.level7.tool),false);pass('right click ends the tool');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
