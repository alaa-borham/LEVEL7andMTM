// 0.9.184: the test run warns (⚠, not an error) where a piece's seam allowance cannot come out clean: a
// curve end bending tighter than the allowance towards the cut side; a click shows the curve.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0184-warnings.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 const load=(ang,ten,rel)=>f.evaluate(([ang,ten,rel])=>{const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;m.images=[];
   m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'point',id:2,x:'160',y:'0'},{op:'point',id:3,x:'160',y:'-40'},{op:'point',id:4,x:'40',y:'-150'},{op:'point',id:5,x:'0',y:'-150'},
   {op:'line',id:6,p1:{obj:1},p2:{obj:2}},{op:'line',id:7,p1:{obj:2},p2:{obj:3}},{op:'line',id:9,p1:{obj:4},p2:{obj:5}},{op:'curve',id:8,through:[{obj:3},{obj:4}],startAngle:'',endAngle:ang,endTension:ten,...(rel?{endRel:rel}:{})},
   {op:'line',id:10,p1:{obj:5},p2:{obj:1}}];
   m.names={8:'C1',9:'L12'};m.nextId=11;m.pieces=[{id:1,name:'p',quantity:1,fabric:'',edges:[6,7,8,9,10],seam:['10','10','10','10','10'],notches:[],grain:'90'}];a.selectedStep=-1;a.changed();a.fit();},[ang,ten,rel]);
 await load('120','15');await f.evaluate(()=>window.level7.runCheck(false,false));
 const win=fr.locator('.check-win');await win.waitFor();
 const w=win.locator('.ck-warn');assert.equal(await w.count(),1);const txt=await w.textContent();assert(/⚠/.test(txt)&&/طرف C1 ينحني/.test(txt),txt);
 assert((await win.locator('.za-head b').textContent()).includes('بلا أخطاء'));
 pass(`test run: no error, one warning «${txt.slice(0,60)}…»`);
 await w.click();await f.waitForFunction(()=>window.level7.selectedStep===8);
 // 0.9.185: the circle is on the bending end of the curve (40, -150), not in the middle of what its step made
 const fl=await f.evaluate(()=>window.level7.flash);assert(fl&&Math.hypot(fl[0]-40,fl[1]+150)<1e-6,JSON.stringify(fl));
 pass('a click on the warning shows the curve C1 and circles its bending end');
 await win.locator('[data-ck="close"]').click();
 await load('90','100',9);await f.evaluate(()=>window.level7.runCheck(false,false));
 await f.waitForFunction(()=>/بلا أخطاء ولا تنبيهات/.test(document.querySelector('#toast')?.textContent||''));
 assert.equal(await fr.locator('.check-win').count(),0);pass('with the curve meeting L12 at 90° the test run is clean: no window, «بلا أخطاء ولا تنبيهات»');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
