// 0.9.154: Space = zoom mode (as GRAFIS): left click zooms in, right click zooms out at the click;
// Space again or Esc leaves it. Usage: L7_SRC=<app dir> xvfb-run -a node test-0153-zoom-mode.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'zm-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');const f=page.frames().find(x=>x.url().includes('l7design'));await f.waitForFunction(()=>!!window.level7);
 await f.evaluate(()=>{const a=window.level7,m=a.model;a.snapshot();m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'lineAngle',id:2,start:{obj:1},angle:'0',length:'300'}];m.nextId=3;a.changed();a.fit();});
 const box=await page.locator('#l7-design-frame').boundingBox();
 // focus on the drawing, then Space
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await f.evaluate(()=>document.querySelector('#canvas').focus());await page.keyboard.press('Space');
 await f.waitForFunction(()=>window.level7.zoomMode===true);assert.equal(await f.evaluate(()=>getComputedStyle(document.querySelector('#canvas')).cursor),'zoom-in');
 const s0=await f.evaluate(()=>window.level7.scale);const [px,py]=[box.x+300,box.y+300];
 const w0=await f.evaluate(([x,y])=>window.level7.toWorld(x,y),[300,300]);
 await page.mouse.click(px,py);const s1=await f.evaluate(()=>window.level7.scale);const w1=await f.evaluate(([x,y])=>window.level7.toWorld(x,y),[300,300]);
 assert(Math.abs(s1/s0-1.6)<1e-6&&Math.hypot(w1[0]-w0[0],w1[1]-w0[1])<1e-6,JSON.stringify({s0,s1,w0,w1}));
 await page.mouse.click(px,py,{button:'right'});const s2=await f.evaluate(()=>window.level7.scale);assert(Math.abs(s2-s0)<1e-9,String(s2));
 assert.equal(await f.evaluate(()=>window.level7.model.steps.length),2);
 pass('Space: zoom mode (magnifier); left click ×1.6 at the click (the point under it stays), right click back; nothing drawn');
 await page.keyboard.press('Space');await f.waitForFunction(()=>window.level7.zoomMode===false);
 await page.keyboard.press('Space');await f.waitForFunction(()=>window.level7.zoomMode===true);await page.keyboard.press('Escape');await f.waitForFunction(()=>window.level7.zoomMode===false);
 pass('Space again or Esc leaves zoom mode');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
