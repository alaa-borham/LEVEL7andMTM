// 0.9.167: the curve bar (and the other tool bars) is moved anywhere by its grip, turned vertical /
// horizontal with ⇅, remembered; a double-click on the grip puts it back.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0167-bar-move.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 await f.evaluate(()=>{localStorage.removeItem('level7.barPos');const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;delete m.lineStyles;m.pieces=[];
   m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'point',id:2,x:'200',y:'200'},{op:'curve',id:3,through:[{obj:1},{obj:2}],startAngle:'0',endAngle:'90'}];m.nextId=4;a.selectedStep=2;a.changed();a.fit();});
 const bar=fr.locator('.curve-bar.obj-bar');await bar.waitFor();const b0=await bar.boundingBox();
 const g=await fr.locator('.curve-bar.obj-bar .bar-grip').boundingBox();
 await page.mouse.move(g.x+g.width/2,g.y+g.height/2);await page.mouse.down();await page.mouse.move(g.x-150,g.y+300,{steps:6});await page.mouse.up();
 const b1=await bar.boundingBox();assert(Math.abs(b1.x-(b0.x-150-g.width/2+ (g.x-b0.x)+g.width/2))<30&&b1.y>b0.y+250,JSON.stringify({b0,b1}));
 // stays there when the bar is drawn again
 await f.evaluate(()=>{window.level7.selectedStep=-1;window.level7.render();window.level7.selectedStep=2;window.level7.render();});
 const b2=await bar.boundingBox();assert(Math.abs(b2.x-b1.x)<2&&Math.abs(b2.y-b1.y)<2,JSON.stringify({b1,b2}));
 pass(`dragged by its grip to another place on the drawing (${Math.round(b0.x)},${Math.round(b0.y)} → ${Math.round(b2.x)},${Math.round(b2.y)}) and it stays there`);
 await fr.locator('.curve-bar.obj-bar .bar-turn').click();
 const v=await f.evaluate(()=>{const b=document.querySelector('.curve-bar.obj-bar');return{c:b.classList.contains('vert'),dir:getComputedStyle(b).flexDirection};});
 const bv=await bar.boundingBox();assert(v.c&&v.dir==='column'&&bv.height>bv.width,JSON.stringify({v,bv}));pass('⇅ stands it up (icons one under the other)');
 await fr.locator('.curve-bar.obj-bar .bar-turn').click();assert.equal(await f.evaluate(()=>document.querySelector('.curve-bar.obj-bar').classList.contains('vert')),false);pass('⇅ again lays it down');
 const g2=await fr.locator('.curve-bar.obj-bar .bar-grip').boundingBox();await page.mouse.dblclick(g2.x+g2.width/2,g2.y+g2.height/2);
 const b3=await bar.boundingBox();assert(Math.abs(b3.y-b0.y)<2,JSON.stringify({b0,b3}));pass('double-click on the grip puts it back in its place');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
