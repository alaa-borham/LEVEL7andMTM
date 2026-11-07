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
 // after letting go of the curve point: the curve's values window shows that point's own field (value or X / Z)
 const tb=fr.locator('#tool-box');const fld=tb.locator('input[data-key="p1:dist"]');await fld.waitFor();
 assert((await tb.textContent()).includes('(المسحوبة)'));
 await f.evaluate(()=>{const a=window.level7;a.model.measurements.push({id:1,name:'w',value:90});});
 await fld.fill('X1');await tb.locator('[data-ok]').click();
 await f.waitForFunction(()=>window.level7.model.steps[3].dist==='X1'&&Math.abs(window.level7.res.objects.get(4).pts[0][0]-90)<1e-6);
 pass('after the drag the values window shows the dragged point («(المسحوبة)»): typed X1 → the point sits at X1 = 90 mm on L1');
 // a double-click on a piece's outer (cut) line opens the seam allowance bar
 await page.mouse.click(...await at(-200,-200),{button:'right'});
 await f.evaluate(()=>{const a=window.level7,m=a.model;a.snapshot();a.selectedStep=-1;
   m.steps.push({op:'point',id:20,x:'0',y:'-300'},{op:'point',id:21,x:'200',y:'-300'},{op:'point',id:22,x:'200',y:'-150'},{op:'point',id:23,x:'0',y:'-150'},
   {op:'line',id:24,p1:{obj:20},p2:{obj:21}},{op:'line',id:25,p1:{obj:21},p2:{obj:22}},{op:'line',id:26,p1:{obj:22},p2:{obj:23}},{op:'line',id:27,p1:{obj:23},p2:{obj:20}});m.nextId=28;
   m.pieces=[{id:1,name:'p',quantity:1,fabric:'',edges:[24,25,26,27],seam:['10','10','10','10'],notches:[],grain:'90'}];a.changed();a.fit();});
 await page.mouse.dblclick(...await at(100,-310));
 await fr.locator('.seam-bar').waitFor();pass('a double-click on the outer (cut) line of a piece opens the seam allowance bar');
 // inherit: a line already inherited does not take the pointer from a line right under it still to be taken
 await page.mouse.click(...await at(-200,-200),{button:'right'});await page.keyboard.press('Escape');
 await f.evaluate(()=>{const a=window.level7,m=a.model;a.snapshot();
   const p1={no:1,name:'a',steps:[{op:'point',id:1,x:'0',y:'0'},{op:'point',id:2,x:'200',y:'0'},{op:'line',id:3,p1:{obj:1},p2:{obj:2}},{op:'line',id:4,p1:{obj:1},p2:{obj:2}}],names:{3:'LA',4:'LB'},nextId:5,pieces:[],amount:1};
   const p2={no:2,name:'b',steps:[{op:'inherit',part:1,items:[{src:3,dst:1}]}],names:{1:'LA'},nextId:2,pieces:[],amount:1};
   m.parts=[p1,p2];m.activePart=1;Object.assign(m,{steps:p2.steps,names:p2.names,nextId:p2.nextId,pieces:[]});a.selectedStep=-1;a.changed();a.fit();});
 {const b=page.locator('[data-l7d-tool="inheritObjects"]');const cat=await b.evaluate(e=>e.closest('[data-l7d-cat-panel]').dataset.l7dCatPanel);await page.locator(`[data-l7d-cat="${cat}"]`).click({button:'right'});await b.click();}
 await fr.locator('.inherit-bar').waitFor();await page.mouse.move(...await at(100,0),{steps:3});await f.waitForFunction(()=>window.level7.ihHover?.id===4);
 await page.mouse.click(...await at(100,0));
 await f.waitForFunction(()=>window.level7.model.steps.filter(s=>s.op==='inherit').flatMap(s=>s.items.map(i=>i.src)).includes(4));
 pass('inherit: with LA already taken, the pointer finds LB lying right under it, and a click brings LB in (no «already inherited»)');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
