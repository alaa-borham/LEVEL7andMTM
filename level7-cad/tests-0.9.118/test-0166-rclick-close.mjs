// 0.9.165: a right click anywhere closes the open window (Visibility …) without the × — on the drawing
// or on the program around it — and does nothing else with that click.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0166-rclick-close.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design'));await f.waitForFunction(()=>!!window.level7);
 const box=await page.locator('#l7-design-frame').boundingBox(),open=()=>f.evaluate(()=>document.querySelectorAll('.vis-win').length);
 await f.evaluate(()=>window.level7.openVisibility());assert.equal(await open(),1);
 const view0=await f.evaluate(()=>[window.level7.cx,window.level7.cy]);
 await page.mouse.click(box.x+box.width/2,box.y+box.height/2,{button:'right'});
 assert.equal(await open(),0);assert.deepEqual(await f.evaluate(()=>[window.level7.cx,window.level7.cy]),view0);
 pass('right click on the drawing closes the Visibility window (and nothing else happens)');
 await f.evaluate(()=>window.level7.openVisibility());assert.equal(await open(),1);
 const tb=await page.locator('.menubar').boundingBox();await page.mouse.click(tb.x+tb.width-40,tb.y+tb.height/2,{button:'right'});
 await f.waitForFunction(()=>!document.querySelector('.vis-win'));pass('right click on the program around the drawing closes it too');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
