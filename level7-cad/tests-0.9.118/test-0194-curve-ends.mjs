// 0.9.194: the start and end points of an active curve are dragged too (they were left out for the
// direction handles): an end on a line slides along it (one value), a free end moves freely; the
// direction handle beside an end still turns the end direction.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0194-curve-ends.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ce-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 const box=await page.locator('#l7-design-frame').boundingBox(),at=async(x,y)=>{const[sx,sy]=await f.evaluate(([x,y])=>window.level7.toScreen([x,y]),[x,y]);return[box.x+sx,box.y+sy];};
 const drag=async(a,b)=>{await page.mouse.move(...await at(...a));await page.mouse.down();await page.mouse.move(...await at(...b),{steps:8});await page.mouse.up();};
 // L1 vertical x = 0 (0 → 200); C1 starts at L1's end (0,200) → (100,150) → free point (200,100); end direction 0° (handle)
 await f.evaluate(()=>{localStorage.removeItem('level7.barPos');const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;m.pieces=[];m.images=[];
   m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'point',id:2,x:'0',y:'200'},{op:'line',id:3,p1:{obj:1},p2:{obj:2}},{op:'point',id:4,x:'100',y:'150'},{op:'point',id:5,x:'200',y:'100'},
   {op:'curve',id:6,through:[{obj:3,end:'end'},{obj:4},{obj:5}],startAngle:'',endAngle:'0'}];m.nextId=7;m.names={3:'L1',6:'C1'};a.selectedStep=5;a.changed();a.fit();a.render();});
 const sel=()=>f.evaluate(()=>{const a=window.level7;a.selectedStep=a.model.steps.findIndex(s=>s.op==='curve');a.render();});
 await fr.locator('.curve-bar.obj-bar').waitFor();
 // hovering the start shows its square
 await page.mouse.move(...await at(0,200));await f.waitForFunction(()=>window.level7.cpHover===0);pass('the pointer on the start point of the active curve catches it (square)');
 await page.mouse.move(...await at(-300,-300));
 // start: on L1's end → slides up L1 by 50
 await drag([0,200],[3,150]);
 let r=await f.evaluate(()=>{const a=window.level7,c=a.model.steps.find(s=>s.op==='curve'),st=a.model.steps.find(s=>s.id===c.through[0].obj);return{op:st?.op,slide:st?.slide,along:st?.along,dist:st?.dist,p:a.pointOf(c.through[0]),errs:a.res.stepErrors.size};});
 assert(r.op==='pointMove'&&r.slide&&r.along===3&&Math.abs(Number(r.dist)+50)<1.5&&Math.abs(r.p[0])<1e-6&&Math.abs(r.p[1]-150)<1.5&&!r.errs,JSON.stringify(r));
 const tb=await f.evaluate(()=>document.querySelector('#tool-box')?.textContent||'');assert(/البداية \(المسحوبة\)/.test(tb)&&/مقدار الإزاحة على الخط/.test(tb),tb.slice(0,200));
 pass(`the start (on L1) dragged: it slides along L1 (${r.dist} mm, stays on x = 0); the values window shows «البداية (المسحوبة): مقدار الإزاحة على الخط»`);
 // end: a free point → moves freely
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');await sel();await fr.locator('.curve-bar.obj-bar').waitFor();
 await drag([200,100],[230,80]);
 r=await f.evaluate(()=>{const a=window.level7,c=a.model.steps.find(s=>s.op==='curve');return a.pointOf(c.through[2]);});
 assert(Math.abs(r[0]-230)<1.5&&Math.abs(r[1]-80)<1.5,JSON.stringify(r));pass(`the free end point dragged to (${r.map(v=>v.toFixed(0))})`);
 // the end direction handle still works (it is apart from the end point)
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');await sel();await fr.locator('.curve-bar.obj-bar').waitFor();
 const h=await f.evaluate(()=>{const a=window.level7,e=document.querySelectorAll('#canvas .curve-handle');const r=document.querySelector('#canvas').getBoundingClientRect();return[...e].map(c=>[Number(c.getAttribute('cx')),Number(c.getAttribute('cy'))]);});
 assert(h.length>=1,JSON.stringify(h));const end=await at(230,80);const hh=h.map(p=>[box.x+p[0],box.y+p[1]]).sort((a,b)=>Math.hypot(a[0]-end[0],a[1]-end[1])-Math.hypot(b[0]-end[0],b[1]-end[1]))[0];
 const a0=await f.evaluate(()=>window.level7.model.steps.find(s=>s.op==='curve').endAngle);
 await page.mouse.move(...hh);await page.mouse.down();await page.mouse.move(hh[0],hh[1]-60,{steps:6});await page.mouse.up();
 const a1=await f.evaluate(()=>window.level7.model.steps.find(s=>s.op==='curve').endAngle);const p2=await f.evaluate(()=>{const a=window.level7,c=a.model.steps.find(s=>s.op==='curve');return a.pointOf(c.through[2]);});
 assert(a1!==a0&&Math.abs(p2[0]-230)<1.5,JSON.stringify([a0,a1,p2]));pass(`the end direction handle still turns the end (${a0}° → ${a1}°), the end point stays`);
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
