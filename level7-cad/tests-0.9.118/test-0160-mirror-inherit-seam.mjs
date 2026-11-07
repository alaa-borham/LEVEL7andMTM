// 0.9.160 (as GRAFIS): mirror: axis, then copy / move, then each click mirrors at once, right click ends;
// inherit by clicking: the earlier parts show, the element under the pointer lights up, a click brings it
// (linked); seam allowance tool: standard / distance / unparallel / none per clicked edge.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0160-mirror-inherit-seam.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.accept());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 const box=await page.locator('#l7-design-frame').boundingBox(),at=async(x,y)=>{const[sx,sy]=await f.evaluate(([x,y])=>window.level7.toScreen([x,y]),[x,y]);return[box.x+sx,box.y+sy];};
 const open=async key=>{const b=page.locator(`[data-l7d-tool="${key}"]`);if(!await b.isVisible()){const cat=await b.evaluate(e=>e.closest('[data-l7d-cat-panel]').dataset.l7dCatPanel);await page.locator(`[data-l7d-cat="${cat}"]`).click({button:"right"});}await b.click();if(!['inheritObjects','seamAllowance'].includes(key))await page.waitForFunction(k=>document.querySelector(`[data-l7d-tool="${k}"]`).getAttribute('aria-pressed')==='true',key);};
 // axis: vertical line x = 0 (id 2); elements right of it: line 4 and line 6
 await f.evaluate(()=>{const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;delete m.lineStyles;m.pieces=[];m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'lineAngle',id:2,start:{obj:1},angle:'90',length:'300'},
   {op:'point',id:3,x:'50',y:'50'},{op:'lineAngle',id:4,start:{obj:3},angle:'0',length:'100'},{op:'point',id:5,x:'60',y:'200'},{op:'lineAngle',id:6,start:{obj:5},angle:'30',length:'80'}];
   m.names={2:'L1',4:'L2',6:'L3'};m.nextId=7;a.selectedStep=-1;a.changed();a.fit();});
 // 1) mirror point to point: axis, choose «نقل», then two clicks = two mirrors, right click ends
 await open('mirrorPts');await page.mouse.click(...await at(0,0));await page.mouse.click(...await at(0,300));
 const tb=fr.locator('#tool-box');await f.waitForFunction(()=>window.level7.collecting);
 // 0.9.183: «نقل» is chosen in the mirror bar (as GRAFIS: the options show with the tool)
 const sb=fr.locator('.sel-bar');await sb.waitFor();await sb.locator('[data-sel="copy"]').click();await f.waitForFunction(()=>document.querySelector('.sel-bar [data-sel="copy"]')?.textContent.includes('نقل'));
 await page.mouse.click(...await at(100,50));
 let r=await f.evaluate(()=>({n:window.level7.model.steps.filter(s=>s.op==='mirror').length,x:window.level7.res.objects.get(4).pts.map(p=>Math.round(p[0]))}));
 assert(r.n===1&&r.x.every(x=>x<=0),JSON.stringify(r));
 await page.mouse.click(...await at(90,215));
 r=await f.evaluate(()=>({n:window.level7.model.steps.filter(s=>s.op==='mirror').length,tool:!!window.level7.tool}));assert(r.n===2&&r.tool,JSON.stringify(r));
 await page.mouse.click(...await at(200,100),{button:'right'});assert.equal(await f.evaluate(()=>!!window.level7.tool),false);
 pass('mirror: axis → «نقل» → each click flips that element at once (2 mirrors), right click ends the tool');
 // 2) inherit by clicking: part 001 has the lines; a new part 002 picks L1 then L2
 await f.evaluate(()=>window.level7.addPart());await open('inheritObjects');await fr.locator('.inherit-bar').waitFor();
 await page.mouse.move(...await at(0,150));await page.waitForTimeout(150);
 const lit=await f.evaluate(()=>document.querySelectorAll('#canvas .ih-hover').length);assert.equal(lit,1);
 await page.mouse.click(...await at(0,150));
 const l2=await f.evaluate(()=>{const o=window.level7.partResult(0).objects.get(4).pts;return[(o[0][0]+o[1][0])/2,o[0][1]];});
 await page.mouse.click(...await at(...l2));
 r=await f.evaluate(()=>{const a=window.level7,s=a.model.steps.filter(s=>s.op==='inherit');return{steps:s.length,items:s.flatMap(x=>x.items.map(i=>i.src)),names:Object.values(a.model.names)};});
 assert(r.steps===1&&r.items.join()==='2,4'&&r.names.includes('L1'),JSON.stringify(r));
 // linked: changing part 001 moves the inherited line
 await f.evaluate(()=>{const a=window.level7;a.model.parts[0].steps.find(s=>s.id===2).length='500';a.changed();});
 const len=await f.evaluate(()=>{const a=window.level7,it=a.model.steps.find(s=>s.op==='inherit').items[0];const p=a.res.objects.get(it.dst).pts;return Math.round(Math.hypot(p[1][0]-p[0][0],p[1][1]-p[0][1]));});
 assert.equal(len,500);await page.mouse.click(...await at(300,300),{button:'right'});assert.equal(await f.evaluate(()=>!!window.level7.inheritPick),false);
 pass('inherit: the line under the pointer lights up; two clicks bring L1 and L2 into part 002, still linked (L1 300 → 500 follows); right click ends');
 // 3) seam allowance: a rectangle piece in part 002
 await f.evaluate(()=>{const a=window.level7,m=a.model;a.snapshot();const b=m.nextId;m.steps.push({op:'point',id:b,x:'0',y:'0'},{op:'point',id:b+1,x:'100',y:'0'},{op:'point',id:b+2,x:'100',y:'200'},{op:'point',id:b+3,x:'0',y:'200'},
   {op:'line',id:b+4,p1:{obj:b},p2:{obj:b+1}},{op:'line',id:b+5,p1:{obj:b+1},p2:{obj:b+2}},{op:'line',id:b+6,p1:{obj:b+2},p2:{obj:b+3}},{op:'line',id:b+7,p1:{obj:b+3},p2:{obj:b}});
   m.nextId=b+8;m.pieces=[{id:1,name:'p',quantity:1,fabric:'',edges:[b+4,b+5,b+6,b+7],seam:['0','0','0','0'],notches:[],grain:'90'}];a.changed();a.fit();});
 await open('seamAllowance');await fr.locator('.seam-bar').waitFor();
 await fr.locator('.seam-bar [data-sv="std"]').fill('11');await fr.locator('.seam-bar [data-sall]').click();
 r=await f.evaluate(()=>window.level7.model.pieces[0].seam.join());assert.equal(r,'11,11,11,11');
 // distance 40 on the bottom edge, none on the left edge, unparallel 10 / 20 on the right edge clicked near its lower end
 await fr.locator('.seam-bar [data-sv="v2"]').click();await fr.locator('.seam-bar [data-sv="v2"]').fill('40');await page.mouse.click(...await at(50,0));
 await fr.locator('.seam-bar [data-sm="none"]').click();await page.mouse.click(...await at(0,100));
 await fr.locator('.seam-bar [data-sm="unpar"] [data-sv="ua"]').click();await page.mouse.click(...await at(100,30));
 r=await f.evaluate(()=>{const a=window.level7,pc=a.model.pieces[0],g=a.res.pieces.get(1);const xr=y=>Math.max(...g.cut.filter(p=>Math.abs(p[1]-y)<1).map(p=>p[0]));return{seam:pc.seam.join(),end:(pc.seamEnd??[]).join(),minY:Math.round(Math.min(...g.cut.map(p=>p[1]))),minX:Math.round(Math.min(...g.cut.map(p=>p[0]))),labels:[...document.querySelectorAll('#canvas text.seam-label')].map(t=>t.textContent.replace(/[⁦-⁩]/g,''))};});
 assert(r.seam==='40,10,11,0'&&r.end===',20,,'&&r.minY===-40&&r.minX===0,JSON.stringify(r));
 assert(r.labels.includes('10 / 20')&&r.labels.includes('40')&&r.labels.includes('0'),JSON.stringify(r.labels));
 pass(`seam allowance: standard 11 on all → 40 on the bottom, none on the left, unparallel 10/20 on the right (labels ${r.labels.join(' | ')})`);
 await page.mouse.click(...await at(300,300),{button:'right'});assert.equal(await f.evaluate(()=>!!window.level7.seamTool),false);pass('right click ends the seam allowance tool');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
