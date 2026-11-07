// 0.9.191 (as GRAFIS): a curve point tied to lines (here an intersection) slides along the line it is dragged
// along, also past its end; its value is one number, how far it moved on the line («مقدار الإزاحة على الخط»),
// no س / ص. A point already moved by س / ص (earlier versions) slides too on its next drag. Alt: free.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0191-point-slide.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ps-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 const box=await page.locator('#l7-design-frame').boundingBox(),at=async(x,y)=>{const[sx,sy]=await f.evaluate(([x,y])=>window.level7.toScreen([x,y]),[x,y]);return[box.x+sx,box.y+sy];};
 const drag=async(a,b)=>{await page.mouse.move(...await at(...a));await page.mouse.down();await page.mouse.move(...await at(...b),{steps:8});await page.mouse.up();};
 // L1 y=100 (0→300), L2 x=150 (50→200), I = their crossing; C1 (0,0) → I → (300,0)
 // C2 (400,0) → offset point 7 / 1 from L1's end (300,100) → (400,200): as made by a drag in 0.9.190
 const setup=()=>f.evaluate(()=>{localStorage.removeItem('level7.barPos');const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;m.pieces=[];m.images=[];
   m.steps=[{op:'point',id:1,x:'0',y:'100'},{op:'point',id:2,x:'300',y:'100'},{op:'line',id:3,p1:{obj:1},p2:{obj:2}},
   {op:'point',id:4,x:'150',y:'50'},{op:'point',id:5,x:'150',y:'200'},{op:'line',id:6,p1:{obj:4},p2:{obj:5}},{op:'intersect',id:7,a:3,b:6,near:[150,100]},
   {op:'point',id:8,x:'0',y:'0'},{op:'point',id:9,x:'300',y:'0'},{op:'curve',id:10,through:[{obj:8},{obj:7},{obj:9}],startAngle:'',endAngle:''},
   {op:'point',id:11,x:'400',y:'0'},{op:'point',id:12,x:'400',y:'200'},{op:'pointOffset',id:13,from:{obj:2},dx:'7',dy:'1'},{op:'curve',id:14,through:[{obj:11},{obj:13},{obj:12}],startAngle:'',endAngle:''}];
   m.nextId=15;m.names={3:'L1',6:'L2',10:'C1',14:'C2'};a.selectedStep=9;a.changed();a.fit();a.render();});
 await setup();await fr.locator('.curve-bar.obj-bar').waitFor();
 // drag I down along L2 (and a little off it) → slides on L2
 await page.mouse.move(...await at(150,100));await page.mouse.down();await page.mouse.move(...await at(153,140),{steps:8});
 await f.waitForFunction(()=>[...document.querySelectorAll('#canvas .live-label')].some(t=>/40(\.\d)? mm/.test(t.textContent)));await page.mouse.up();
 const s=await f.evaluate(()=>{const m=window.level7.model,k=m.steps.findIndex(t=>t.op==='curve'&&t.id===10),c=m.steps[k],p=m.steps.find(t=>t.id===c.through[1].obj);return{op:p.op,slide:p.slide,along:p.along,dist:p.dist,pt:window.level7.res.objects.get(p.id).pts[0]};});
 assert(s.op==='pointMove'&&s.slide&&s.along===6&&Math.abs(Number(s.dist)-40)<1.5&&Math.abs(s.pt[0]-150)<1e-6,JSON.stringify(s));
 pass(`the crossing point dragged down slides on L2 (the line of the drag, not L1), its distance shown while dragging: ${s.dist} mm, stays on x = 150`);
 const tb=fr.locator('#tool-box');await tb.locator('input[data-key="p1:dist"]').waitFor();const txt=await tb.textContent();
 assert(txt.includes('مقدار الإزاحة على الخط')&&!/إزاحة س|إزاحة ص/.test(txt),txt);
 await tb.locator('input[data-key="p1:dist"]').fill('25');await tb.locator('[data-ok]').click();
 await f.waitForFunction(()=>{const o=[...window.level7.res.objects.values()].find(o=>o.name!=='L2'&&o.kind==='point'&&Math.abs(o.pts[0][1]-125)<1e-6&&Math.abs(o.pts[0][0]-150)<1e-6);return !!o;});
 pass('the values window has one field «مقدار الإزاحة على الخط» (no س / ص): typed 25 → the point is 25 mm down L2');
 // drag it again: it goes on sliding on L2
 await drag([150,125],[150,170]);
 const s2=await f.evaluate(()=>{const m=window.level7.model;return m.steps.filter(t=>t.op==='pointMove').map(t=>[t.along,t.dist]);});
 assert(s2.length===1&&s2[0][0]===6&&Math.abs(Number(s2[0][1])-70)<1.5,JSON.stringify(s2));pass(`dragged again: the same point slides on (${s2[0][1]} mm), no second point`);
 // the old 7 / 1 offset of C2: select C2, drag the point past L1's end → it slides on L1's extension
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');await f.evaluate(()=>{const a=window.level7;a.closeForm?.();a.selectedStep=a.model.steps.findIndex(t=>t.id===14);a.changed();a.render();});
 await fr.locator('.curve-bar.obj-bar').waitFor();await drag([307,101],[340,110]);
 const s3=await f.evaluate(()=>{const t=window.level7.model.steps.find(t=>t.id===13);return{op:t.op,along:t.along,dist:t.dist,pt:window.level7.res.objects.get(13).pts[0]};});
 assert(s3.op==='pointMove'&&s3.along===3&&Math.abs(Number(s3.dist)-40)<1.5&&Math.abs(s3.pt[1]-100)<1e-6&&s3.pt[0]>330,JSON.stringify(s3));
 pass(`a point moved by س 7 / ص 1 (0.9.190) dragged again slides on L1, past its end: ${s3.dist} mm, at x ${s3.pt[0].toFixed(1)} on y = 100`);
 // Alt: free (an offset with س / ص, as before)
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');await f.evaluate(()=>window.level7.closeForm?.());
 await setup();await fr.locator('.curve-bar.obj-bar').waitFor();
 await page.keyboard.down('Alt');await drag([150,100],[170,130]);await page.keyboard.up('Alt');
 const s4=await f.evaluate(()=>window.level7.model.steps.filter(t=>t.op==='pointOffset'&&t.from.obj===7).map(t=>[t.dx,t.dy]));
 assert(s4.length===1&&Math.abs(Number(s4[0][0])-20)<1.5&&Math.abs(Number(s4[0][1])-30)<1.5,JSON.stringify(s4));pass('with Alt the point still moves freely (س 20 / ص 30)');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
