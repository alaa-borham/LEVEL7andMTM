// 0.9.167: with no tool open, the dimension under the pointer glows itself (not the drawing line beside
// it) and a press drags the dimension.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0168-dim-hover.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design'));await f.waitForFunction(()=>!!window.level7);
 // a 230 line with its length dimension 4 mm below it (a few pixels: the line is within the glow distance)
 await f.evaluate(()=>{const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;delete m.lineStyles;m.pieces=[];a.vis.dims=true;
   m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'lineAngle',id:2,start:{obj:1},angle:'0',length:'230'},{op:'point',id:3,x:'0',y:'60'},{op:'lineAngle',id:4,start:{obj:3},angle:'0',length:'230'},
   {op:'dim',kind:'length',obj:2,offset:'-4'}];m.nextId=5;a.selectedStep=-1;a.changed();a.fit();});
 const box=await page.locator('#l7-design-frame').boundingBox();
 const p=await f.evaluate(()=>{const a=window.level7,h=a.dimHits[0].pts;let b=h[0];for(const q of h)if(Math.abs(q[0]-a.toScreen([115,0])[0])<Math.abs(b[0]-a.toScreen([115,0])[0]))b=q;return b;});
 await page.mouse.move(box.x+p[0]-30,box.y+p[1]);await page.mouse.move(box.x+p[0],box.y+p[1],{steps:3});await page.waitForTimeout(150);
 const r=await f.evaluate(()=>({near:!!window.level7.near,dh:window.level7.dimHover,glow:document.querySelectorAll('#canvas .near-glow').length}));
 assert(r.dh===4&&!r.near&&r.glow===1,JSON.stringify(r));pass('pointer on the dimension: the dimension glows, not the drawing line beside it');
 await page.mouse.down();await page.mouse.move(box.x+p[0],box.y+p[1]+40,{steps:5});await page.mouse.up();
 const off=Number(await f.evaluate(()=>window.level7.model.steps[4].offset));assert(Math.abs(off)>6,String(off));pass(`a press drags the dimension (offset -4 → ${off})`);
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
