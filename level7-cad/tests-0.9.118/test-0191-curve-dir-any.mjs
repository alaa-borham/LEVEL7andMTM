// 0.9.191 (as GRAFIS): «تحديد اتجاه المنحنى» works at any point lying on the curve (e.g. where another line
// crosses it) and at any place on the curve itself, not only at the points the curve was drawn through.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0191-curve-dir-any.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'cd-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 const box=await page.locator('#l7-design-frame').boundingBox(),at=async(x,y)=>{const[sx,sy]=await f.evaluate(([x,y])=>window.level7.toScreen([x,y]),[x,y]);return[box.x+sx,box.y+sy];};
 // C1 (0,0) → (150,100) → (300,0); L1 the vertical x = 75 crossing it at point I (drawn after the curve)
 await f.evaluate(()=>{localStorage.removeItem('level7.barPos');const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;m.pieces=[];m.images=[];
   m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'point',id:2,x:'150',y:'100'},{op:'point',id:3,x:'300',y:'0'},{op:'curve',id:4,through:[{obj:1},{obj:2},{obj:3}],startAngle:'',endAngle:''},
   {op:'point',id:5,x:'75',y:'-50'},{op:'point',id:6,x:'75',y:'200'},{op:'line',id:7,p1:{obj:5},p2:{obj:6}},{op:'intersect',id:8,a:4,b:7,near:[75,70]}];
   m.nextId=9;m.names={4:'C1',7:'L1'};a.selectedStep=3;a.changed();
   const q=a.res.objects.get(4).pts[Math.floor(a.res.objects.get(4).pts.length*0.62)];m.steps.push({op:'point',id:9,x:String(q[0]),y:String(q[1])});m.nextId=10;a.changed();a.fit();a.render();});
 const bar=fr.locator('.curve-bar.obj-bar');await bar.waitFor();
 const crv=()=>f.evaluate(()=>{const m=window.level7.model;return m.steps.find(t=>t.op==='curve');});
 // a drawn point Q lying on the curve (made after it): it becomes one of the curve's points
 const Q=await f.evaluate(()=>window.level7.res.objects.get(9).pts[0]);
 await bar.locator('[data-cm="dir"]').click();await page.mouse.click(...await at(Q[0],Q[1]));await f.waitForFunction(()=>!!window.level7.dirPick);
 await page.mouse.click(...await at(Q[0]+60,Q[1]));
 await f.waitForFunction(()=>(window.level7.model.steps.find(t=>t.op==='curve').pointAngles??[]).some(v=>v==='0'));
 let c=await crv();
 assert(c.through.length===4&&c.through[2].obj===9&&c.pointAngles[2]==='0',JSON.stringify(c));
 const idx=await f.evaluate(()=>{const s=window.level7.model.steps;return[s.findIndex(t=>t.id===9),s.findIndex(t=>t.op==='curve'),s.findIndex(t=>t.id===8)];});
 assert(idx[0]<idx[1]&&idx[1]<idx[2],JSON.stringify(idx));
 pass('at a drawn point Q lying on the curve: Q becomes a point of C1 (Q moves before the curve, I made from the curve stays after it) with 0° there');
 // the crossing point I is made from the curve itself: a point is put at its place
 const I=await f.evaluate(()=>window.level7.res.objects.get(8).pts[0]);
 await page.mouse.click(...await at(I[0],I[1]));await f.waitForFunction(()=>!!window.level7.dirPick);
 await page.mouse.click(...await at(I[0]+60,I[1]+60));
 await f.waitForFunction(()=>(window.level7.model.steps.find(t=>t.op==='curve').pointAngles??[]).some(v=>v==='45'));
 c=await crv();const kI=c.pointAngles.indexOf('45');
 const pI=await f.evaluate(([id])=>window.level7.res.objects.get(id).pts[0],[c.through[kI].obj]);
 assert(c.through.length===5&&kI===1&&c.through[kI].obj!==8&&Math.hypot(pI[0]-I[0],pI[1]-I[1])<1,JSON.stringify([c,pI,I]));
 assert.equal(await f.evaluate(()=>window.level7.res.errors?.size??0),0);
 pass(`at the crossing point I of L1 (made from the curve itself): a point is put at its place and gets 45°, no error`);
 // any place on the curve: between (150,100) and (300,0)
 const P=await f.evaluate(()=>{const p=window.level7.res.objects.get(4).pts;return p[Math.floor(p.length*0.78)];});
 await page.mouse.click(...await at(P[0],P[1]));await f.waitForFunction(()=>!!window.level7.dirPick);
 await page.mouse.click(...await at(P[0],P[1]-60));
 await f.waitForFunction(()=>(window.level7.model.steps.find(t=>t.op==='curve').pointAngles??[]).some(v=>v==='-90'||v==='270'||v==='90'));
 c=await crv();assert(c.through.length===6,JSON.stringify(c.through));const kP=c.pointAngles.findIndex(v=>v==='-90'||v==='270'||v==='90');
 const np=await f.evaluate(([k])=>{const a=window.level7,c=a.model.steps.find(t=>t.op==='curve');return a.res.objects.get(c.through[k].obj).pts[0];},[kP]);
 assert(Math.hypot(np[0]-P[0],np[1]-P[1])<1,JSON.stringify([np,P]));
 pass(`at an empty place on the curve (${P.map(v=>v.toFixed(0))}): a point is put there and the direction set (${c.pointAngles[kP]}°)`);
 // the old way still works: a point the curve was drawn through
 const k150=(await crv()).through.findIndex(r=>r.obj===2);
 await page.mouse.click(...await at(150,100));await f.waitForFunction(()=>!!window.level7.dirPick);await page.mouse.click(...await at(210,100));
 await f.waitForFunction(([k])=>window.level7.model.steps.find(t=>t.op==='curve').pointAngles?.[k]==='0',[k150]);
 assert.equal((await crv()).through.length,6);pass('at one of its own points as before (0°), no point added');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
