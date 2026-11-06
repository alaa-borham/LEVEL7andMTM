// 0.9.169: in the test-run window a click on an error shows where it is: its part becomes active, the
// step is selected, the drawing zooms to it (or to what it is built on when it could not be drawn) and
// a red ring marks it; a Z error opens the Z table.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0170-error-goto.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 // part 001 fine; part 002: a point far away, a line from it whose length uses X99 (missing) and a Z that fails
 await f.evaluate(()=>{const a=window.level7,m=a.model;a.snapshot();delete m.lineStyles;m.pieces=[];m.sizes=[];m.activeSize=-1;
   m.variables=[{id:7,name:'bad',expr:'X99*2'}];
   m.parts=[{no:1,name:'ok',steps:[{op:'point',id:1,x:'0',y:'0'},{op:'lineAngle',id:2,start:{obj:1},angle:'0',length:'100'}],names:{},nextId:3,pieces:[],amount:1},
     {no:2,name:'bad',steps:[{op:'point',id:1,x:'2000',y:'1500'},{op:'lineAngle',id:2,start:{obj:1},angle:'0',length:'X99'},{op:'point',id:3,x:'Z7',y:'0'}],names:{},nextId:4,pieces:[],amount:1}];
   m.activePart=0;const p=m.parts[0];m.steps=p.steps;m.names=p.names;m.nextId=p.nextId;a.selectedStep=-1;a.changed();a.fit();a.runCheck(true,false);});
 const w=fr.locator('.check-win');await w.waitFor();const items=w.locator('li.ck-go');
 assert.equal(await items.count(),3);
 await items.nth(0).click();
 const r=await f.evaluate(()=>{const a=window.level7,c=a.toScreen([2000,1500]),b=document.querySelector('#canvas').getBoundingClientRect();return{act:a.model.activePart,sel:a.selectedStep,ring:document.querySelectorAll('#canvas circle.err-flash').length,inView:c[0]>0&&c[0]<b.width&&c[1]>0&&c[1]<b.height};});
 assert(r.act===1&&r.sel===1&&r.ring===1&&r.inView,JSON.stringify(r));
 pass('a click on «خطوة 2» (X99 missing) makes part 002 active, selects the step and shows its start point (far away) with a red ring');
 await items.nth(2).click();await page.waitForTimeout(300);
 assert(await f.evaluate(()=>!!document.querySelector('.zwin.open')),'Z table open');pass('a click on the Z7 error opens the Z table');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
