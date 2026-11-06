// 0.9.176: a double-click on a curve shows its bar and handles together with its values window; the
// window minimizes to its title (▁) and stays so; dragging a handle with the window open updates its values.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0176-edit-both.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 await f.evaluate(()=>{localStorage.removeItem('level7.formMini');const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;delete m.lineStyles;m.pieces=[];
   m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'point',id:2,x:'200',y:'200'},{op:'curve',id:3,through:[{obj:1},{obj:2}],startAngle:'0',endAngle:'90'}];m.nextId=4;a.selectedStep=-1;a.changed();a.fit();});
 const box=await page.locator('#l7-design-frame').boundingBox();
 const q=await f.evaluate(()=>{const o=window.level7.res.objects.get(3);return window.level7.toScreen(o.pts[Math.floor(o.pts.length/2)]);});
 await page.mouse.move(box.x+q[0],box.y+q[1]);await page.waitForTimeout(150);await page.mouse.dblclick(box.x+q[0],box.y+q[1]);
 const tb=fr.locator('#tool-box');await tb.waitFor();
 assert(await fr.locator('.curve-bar.obj-bar').isVisible()&&(await f.evaluate(()=>window.level7.curveHandles().length))===2);pass('double-click: the curve bar, its handles and its values window together');
 await tb.locator('.form-min').click();assert(!(await tb.locator('[data-ok]').isVisible())&&await tb.locator('h4').isVisible());pass('▁ minimizes the window to its title');
 // drag the end handle with the window open: its value follows
 const h=await f.evaluate(()=>window.level7.curveHandles().find(h=>h.end==='end').hs);
 await page.mouse.move(box.x+h[0],box.y+h[1]);await page.mouse.down();await page.mouse.move(box.x+h[0]+40,box.y+h[1]+5,{steps:5});await page.mouse.up();await page.waitForTimeout(150);
 await tb.locator('.form-min').click();const v=await tb.locator('input[data-key="endAngle"]').inputValue();const m=await f.evaluate(()=>window.level7.model.steps[2].endAngle);
 assert(v===m&&v!=='90',JSON.stringify({v,m}));pass(`dragging the handle with the window open: the window shows the new angle (${v}°)`);
 // minimized state is remembered for the next window
 await tb.locator('.form-min').click();await tb.locator('[data-cancel]').click().catch(()=>{});
 await f.evaluate(()=>window.level7.editStep(2));assert(await f.evaluate(()=>document.querySelector('#tool-box').classList.contains('mini')));pass('the next values window opens minimized (remembered)');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
