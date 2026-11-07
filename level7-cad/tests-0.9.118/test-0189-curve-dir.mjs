// 0.9.189 (as GRAFIS): on an active curve, «تحديد اتجاه» at any of its points (the next click gives the
// direction, a dashed line follows the mouse), «حذف الاتجاه»; a curve point that sits on a line slides
// along that line when dragged, its distance shown.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0189-curve-dir.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 const box=await page.locator('#l7-design-frame').boundingBox(),at=async(x,y)=>{const[sx,sy]=await f.evaluate(([x,y])=>window.level7.toScreen([x,y]),[x,y]);return[box.x+sx,box.y+sy];};
 // a line y = 100 from x 0 to 300; a curve from (0,0) through a point ON that line (at 150 mm) to (300,0)
 await f.evaluate(()=>{localStorage.removeItem('level7.barPos');const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;m.pieces=[];m.images=[];
   m.steps=[{op:'point',id:1,x:'0',y:'100'},{op:'point',id:2,x:'300',y:'100'},{op:'line',id:3,p1:{obj:1},p2:{obj:2}},{op:'pointOn',id:4,on:3,dist:'150',unit:'mm',from:'start'},
   {op:'point',id:5,x:'0',y:'0'},{op:'point',id:6,x:'300',y:'0'},{op:'curve',id:7,through:[{obj:5},{obj:4},{obj:6}],startAngle:'',endAngle:''}];
   m.nextId=8;m.names={3:'L1',7:'C1'};a.selectedStep=6;a.changed();a.fit();a.render();});
 const bar=fr.locator('.curve-bar.obj-bar');await bar.waitFor();
 assert(await bar.locator('[data-cm="dir"]').isVisible()&&await bar.locator('[data-cm="undir"]').isVisible());
 // set direction at the middle point: click it, move away (a dashed line follows), click → 45°
 await bar.locator('[data-cm="dir"]').click();await page.mouse.click(...await at(150,100));
 await page.mouse.move(...await at(200,150),{steps:4});await f.waitForFunction(()=>!!document.querySelector('#canvas .curve-dir.live'));
 await page.mouse.click(...await at(200,150));
 await f.waitForFunction(()=>window.level7.model.steps[6].pointAngles?.[1]==='45');
 assert(await f.evaluate(()=>!!document.querySelector('#canvas .curve-dir:not(.live)')));
 pass('«تحديد اتجاه» at the middle point: a dashed line follows the mouse, the click sets 45°, shown as a dashed line');
 // the curve passes the middle point at about 45° (it was level before)
 const ang=await f.evaluate(()=>{const p=window.level7.res.objects.get(7).pts,k=p.findIndex(q=>Math.hypot(q[0]-150,q[1]-100)<1e-6);return Math.atan2(p[k+1][1]-p[k-1][1],p[k+1][0]-p[k-1][0])*180/Math.PI;});
 assert(Math.abs(ang-45)<4,String(ang));pass(`the curve now runs through the point at ${Math.round(ang)}°`);
 // set the direction at an end: the end angle
 await page.mouse.click(...await at(300,0));await page.mouse.click(...await at(300,-80));
 await f.waitForFunction(()=>window.level7.model.steps[6].endAngle==='-90'||window.level7.model.steps[6].endAngle==='270');pass('at an end point it sets the end angle (−90°)');
 // delete direction
 await bar.locator('[data-cm="undir"]').click();await page.mouse.click(...await at(150,100));
 await f.waitForFunction(()=>!window.level7.model.steps[6].pointAngles);pass('«حذف الاتجاه» frees the point again');
 // slide the point on L1: drag it from x 150 to x 220 (and a bit off the line): it stays on L1 at 220
 await bar.locator('[data-cm="undir"]').click();
 const p0=await at(150,100),p1=await at(220,130);await page.mouse.move(...p0);await page.mouse.down();await page.mouse.move(...p1,{steps:6});
 await f.waitForFunction(()=>[...document.querySelectorAll('#canvas .live-label')].some(t=>/mm/.test(t.textContent)));
 await page.mouse.up();
 const st=await f.evaluate(()=>({d:window.level7.model.steps[3].dist,p:window.level7.res.objects.get(4).pts[0],through:window.level7.model.steps[6].through[1].obj}));
 assert(Math.abs(Number(st.d)-220)<1.5&&Math.abs(st.p[1]-100)<1e-6&&st.through===4,JSON.stringify(st));
 pass(`a curve point on a line slides along it: dragged to x 220 (and off the line) → on L1 at ${st.d} mm, still the same point`);
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
