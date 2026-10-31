// 0.9.147: linen+CAD icons; undo / the history count are the drawing only (X / Z untouched);
// separate X and Z lists beside values; size on/off ticks; Run (test run / grade, Ctrl+6);
// measurement library (copy into the design, edits stay in the file, update only on request).
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0147-library-run.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'lr-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForSelector('#tool-guide');
 page.on('dialog',d=>/استرجاع|حفظ التصميم/.test(d.message())?d.dismiss():d.accept()); // library questions yes; old unsaved work no
 await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 await f.evaluate(()=>localStorage.removeItem('level7.mlib')); // the library of earlier runs
 const strip=await page.evaluate(()=>[...document.querySelectorAll('.l7-design-cat')].every(b=>b.querySelector('svg.l7i'))&&getComputedStyle(document.querySelector('.l7-design-cat')).backgroundColor);
 assert.equal(strip,'rgb(236, 230, 216)');pass('every strip button has its «linen + CAD» icon on a linen tile');
 // undo is the drawing only
 await f.evaluate(()=>{const a=window.level7,m=a.model;m.measurements=[{id:1,name:'w',value:100},{id:2,name:'h',value:50}];m.variables=[{id:1,name:'half',expr:'X1/2'}];m.sizes=[{name:'L',step:1,values:{1:120}}];a.changed();
  a.snapshot();m.steps.push({op:'point',id:1,x:'0',y:'0'},{op:'point',id:2,x:'X1',y:'0'},{op:'line',id:3,p1:{obj:1},p2:{obj:2}});m.nextId=4;a.changed();});
 const n0=await f.evaluate(()=>window.level7.undoStack.length);
 await page.locator('[data-l7d-command="tab-x"]').click();const v=fr.locator('.xgrid tr[data-row="0"] td.xv input').first();await v.fill('130');await v.press('Enter');
 await f.waitForFunction(()=>window.level7.model.measurements[0].value===130);
 const n1=await f.evaluate(()=>window.level7.undoStack.length);assert.equal(n1,n0,JSON.stringify([n0,n1]));
 await f.evaluate(()=>window.level7.undo());const after=await f.evaluate(()=>({steps:window.level7.model.steps.length,x1:window.level7.model.measurements[0].value,z:window.level7.model.variables.length}));
 assert.deepEqual(after,{steps:0,x1:130,z:1});await f.evaluate(()=>window.level7.redo());
 pass(`editing X adds nothing to the history (${n0} → ${n1}); undo removes the line and keeps X1 = 130 and Z1`);
 await page.locator('[data-l7d-command="tab-x"]').click();
 // separate X and Z lists (the X window is closed again first)
 await f.waitForFunction(()=>!document.querySelector('.panel.open'));
 const tl=await page.locator('[data-l7d-tool="lineAngle"]');await page.locator('[data-l7d-cat="الخطوط"]').click({button:'right'});await tl.click();
 const cb0=await page.locator('#l7-design-frame').boundingBox();await page.mouse.click(cb0.x+cb0.width*0.4,cb0.y+cb0.height*0.5);
 await fr.locator('#tool-box .ref-x').first().waitFor();
 const xs=await fr.locator('#tool-box .ref-x').first().locator('option').allTextContents(),zs=await fr.locator('#tool-box .ref-z').first().locator('option').allTextContents();
 assert(xs.every(o=>!o.startsWith('Z'))&&xs.some(o=>o.startsWith('X1 ='))&&zs.every(o=>!o.startsWith('X'))&&zs.some(o=>o.startsWith('Z1')),JSON.stringify([xs,zs]));
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');await f.evaluate(()=>{const a=window.level7;if(a.model.steps.length>3){a.model.steps.length=3;a.changed();}});pass('beside each value: an X list with only X and a Z list with only Z');
 // size on / off
 await page.locator('[data-l7d-command="tab-x"]').click();await fr.locator('.xgrid input[data-son="0"]').uncheck();
 await f.waitForFunction(()=>window.level7.model.sizes[0].off===true);assert(await fr.locator('.xgrid th.sz-off').count()>=1);
 await fr.locator('.xgrid input[data-son="0"]').check();await f.waitForFunction(()=>!window.level7.model.sizes[0].off);
 pass('the tick above size L switches it off (faded, left out of the marker) and on again');
 // Run: grade all parts finds the broken part; Ctrl+6 does the same
 await f.evaluate(()=>{const a=window.level7,m=a.model;a.syncPart();m.parts=m.parts?.length?m.parts:[{no:1,name:'front',steps:m.steps,names:m.names,nextId:m.nextId,pieces:[]}];
  m.parts.push({no:2,name:'back',steps:[{op:'point',id:1,x:'X9',y:'0'}],names:{},nextId:2,pieces:[]});a.changed();});
 await page.locator('[data-l7d-runbtn]').click();await page.locator('.l7-run-menu [data-l7d-command="gradeAll"]').click();
 const win=fr.locator('.check-win');await win.waitFor();const wt=await win.innerText();assert(/002 back/.test(wt)&&/X9/.test(wt)&&/\bL\b/.test(wt),wt);
 await win.locator('[data-ck="close"]').click();
 await page.locator('#l7-design-frame').focus();await f.evaluate(()=>document.querySelector('#canvas').focus());await page.keyboard.press('Control+6');await win.waitFor();
 pass('Run → «Grade all parts» (and Ctrl+6) lists part 002 with X9 missing, in each active size');
 await win.locator('[data-ck="close"]').click();
 // measurement library
 await page.locator('[data-l7d-command="tab-x"]').isVisible();await fr.locator('[data-xa="mlib"]').first().click();
 const ml=fr.locator('.mlib-win');await ml.waitFor();await ml.locator('[data-ml="name"]').fill('thobe ALAA');await ml.locator('[data-ml="save"]').click();
 await f.waitForFunction(()=>JSON.parse(localStorage.getItem('level7.mlib')||'[]').length===1);await ml.locator('[data-ml="close"]').click();
 await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();
 await ml.waitFor();await ml.locator('li[data-id] [data-ml="use"]').click();
 await f.waitForFunction(()=>window.level7.model.measurements.length===2&&window.level7.model.mlibFrom?.name==='thobe ALAA');
 await f.evaluate(()=>{const a=window.level7;a.model.measurements[0].value=999;a.changed();});
 const libv=await f.evaluate(()=>JSON.parse(localStorage.getItem('level7.mlib'))[0].measurements[0].value);assert.equal(libv,130);
 pass('a new design opens the library; «استخدام» copies «thobe ALAA» into it; editing X1 to 999 leaves the library at 130');
 if(!await fr.locator('.panel.open [data-xa="mlib"]').count())await page.locator('[data-l7d-command="tab-x"]').click();await fr.locator('.panel.open [data-xa="mlib"]').first().click();await ml.waitFor();
 await ml.locator('li[data-id] [data-ml="update"]').click();await f.waitForFunction(()=>JSON.parse(localStorage.getItem('level7.mlib'))[0].measurements[0].value===999);
 pass('«تحديث المكتبة» (asked for) writes the design\'s table into the library');
 await f.evaluate(()=>localStorage.removeItem('level7.mlib')); // leave no library for other tests
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
