// 0.9.155: the step window also edits where a line starts on the line it was drawn from; a curve's
// point is dragged directly (no selection first); Record "back to here" removes the later steps.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0155-edit-start-curve.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>/الرجوع إلى الخطوة/.test(d.message())?d.accept():d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 await f.evaluate(()=>{const a=window.level7,m=a.model;a.snapshot();m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'lineAngle',id:2,start:{obj:1},angle:'-90',length:'500'},{op:'pointOn',id:3,on:2,dist:'150',unit:'mm',from:'start'},{op:'lineAngle',id:4,start:{obj:3},angle:'0',length:'220'},
   {op:'point',id:5,x:'0',y:'-300'},{op:'point',id:6,x:'90',y:'-360'},{op:'point',id:7,x:'200',y:'-400'},{op:'curve',id:8,through:[{obj:5},{obj:6},{obj:7}],startAngle:'',endAngle:''}];m.nextId=9;a.changed();a.fit();});
 // 1) edit step 4: its start is a point on line 2, 150 mm down
 await f.evaluate(()=>window.level7.editStep(3));const tb=fr.locator('#tool-box');await tb.waitFor();
 const labels=await tb.locator('.field > span, label > span').allTextContents();assert(labels.some(l=>/البداية على الخط: المسافة/.test(l)),labels.join('|'));
 await tb.locator('input[data-key="s:dist"]').fill('200');await tb.locator('[data-ok]').click();
 const p3=await f.evaluate(()=>({dist:window.level7.model.steps[2].dist,y:window.level7.res.objects.get(4).pts[0][1]}));assert(p3.dist==='200'&&Math.abs(p3.y+200)<1e-6,JSON.stringify(p3));
 pass('editing the line: «البداية على الخط: المسافة» 150 → 200 moves where it starts down the vertical line');
 // 2) drag the curve's middle point without selecting the curve first
 await f.evaluate(()=>{window.level7.selectedStep=-1;window.level7.render();});const box=await page.locator('#l7-design-frame').boundingBox();
 const [px,py]=await f.evaluate(()=>window.level7.toScreen([90,-360]));await page.mouse.move(box.x+px+2,box.y+py+2);await page.waitForTimeout(150);
 // 0.9.163: nothing reacts before a double-click: the drag leaves the point where it is
 await page.mouse.down();await page.mouse.move(box.x+px+40,box.y+py-30,{steps:5});await page.mouse.up();
 assert.deepEqual(await f.evaluate(()=>{const st=window.level7.model.steps.find(s=>s.id===6);return[st.x,st.y];}),['90','-360']);
 // double-click on the curve (away from its point) makes it active; now its point is dragged
 const q=await f.evaluate(()=>{const o=window.level7.res.objects.get(8);return window.level7.toScreen(o.pts[Math.floor(o.pts.length*0.8)]);});
 await page.mouse.move(box.x+q[0],box.y+q[1]);await page.waitForTimeout(150);await page.mouse.dblclick(box.x+q[0],box.y+q[1]);
 await page.mouse.move(box.x+px+2,box.y+py+2);await page.mouse.down();await page.mouse.move(box.x+px+40,box.y+py-30,{steps:5});await page.mouse.up();
 const moved=await f.evaluate(()=>{const o=window.level7.res.objects.get(6)??null;const st=window.level7.model.steps.find(s=>s.id===6);return{x:Number(st.x),y:Number(st.y)};});
 assert(moved.x>95&&moved.y>-355,JSON.stringify(moved));pass(`before a double-click the curve's point does not move; after a double-click on the curve it is dragged (90, -360 → ${moved.x}, ${moved.y})`);
 // 3) Record: back to step 2
 const n0=await f.evaluate(()=>window.level7.model.steps.length);await f.evaluate(()=>window.level7.backTo(1));
 assert.equal(await f.evaluate(()=>window.level7.model.steps.length),2);await f.evaluate(()=>window.level7.undo());assert.equal(await f.evaluate(()=>window.level7.model.steps.length),n0);
 pass(`Record «⤺ الرجوع إلى هنا» on step 2 removes the ${n0-2} later steps; one Ctrl+Z brings them back`);
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
