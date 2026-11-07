// 0.9.191: a size column is deleted from the X table itself (✕ on its header, asks first); the active size
// follows (deleting a size before it keeps the drawing on the same size); like all X / Z edits it is not in the drawing's undo.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0191-size-del.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'sd-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 let answer=true;const asked=[];page.on('dialog',d=>{if(/حذف/.test(d.message())){asked.push(d.message());answer?d.accept():d.dismiss();}else d.dismiss();});
 await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 await f.evaluate(()=>{const a=window.level7,m=a.model;m.measurements=[{id:1,name:'w',value:100}];m.sizes=[{name:'S2',step:1,values:{1:110}},{name:'S3',step:2,values:{1:120}},{name:'S4',step:3,values:{1:130}}];m.activeSize=2;a.changed();});
 await page.locator('[data-l7d-command="tab-x"]').click();await fr.locator('.xgrid th.sz').first().waitFor();
 assert.equal(await fr.locator('.xgrid th.sz .sz-del').count(),3);assert.equal(await fr.locator('.xgrid th.xv .sz-del').count(),0);
 pass('every size column header has a ✕; the base column has none');
 // cancel keeps it
 answer=false;await fr.locator('.xgrid th.sz').nth(0).hover();await fr.locator('.xgrid [data-sdel-x="0"]').click();
 assert.equal(await f.evaluate(()=>window.level7.model.sizes.length),3);assert(/S2/.test(asked[0]));pass('it asks first (naming S2); «cancel» keeps the column');
 // delete S2 (before the active S4): the drawing stays on S4
 answer=true;await fr.locator('.xgrid th.sz').nth(0).hover();await fr.locator('.xgrid [data-sdel-x="0"]').click();
 await f.waitForFunction(()=>window.level7.model.sizes.length===2);
 const r=await f.evaluate(()=>{const m=window.level7.model;return{names:m.sizes.map(s=>s.name),act:m.sizes[m.activeSize]?.name};});
 assert.deepEqual(r,{names:['S3','S4'],act:'S4'});assert.equal(await fr.locator('.xgrid th.sz').count(),2);
 pass('S2 deleted: the table shows S3 S4 and the drawing stays on S4');
 // deleting the active size goes back to the base
 await fr.locator('.xgrid th.sz').nth(1).hover();await fr.locator('.xgrid [data-sdel-x="1"]').click();
 await f.waitForFunction(()=>window.level7.model.sizes.length===1);assert.equal(await f.evaluate(()=>window.level7.model.activeSize??-1),-1);
 pass('deleting the active size S4 goes back to the base size');
 const n=await f.evaluate(()=>window.level7.undoStack.length);assert.equal(n,0);pass('nothing added to the drawing undo history (X / Z are not undone)');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
