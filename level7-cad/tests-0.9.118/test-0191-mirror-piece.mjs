// 0.9.191: the mirror tools see a piece's outer (cut) line: it lights up under the pointer and a click on it
// mirrors the whole piece; a copy is a new piece with the same seam allowance, notches and a mirrored grain
// line (as GRAFIS); «move» moves the piece itself, allowance and all.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0191-mirror-piece.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'mp-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 const box=await page.locator('#l7-design-frame').boundingBox(),at=async(x,y)=>{const[sx,sy]=await f.evaluate(([x,y])=>window.level7.toScreen([x,y]),[x,y]);return[box.x+sx,box.y+sy];};
 // a piece 200 × 150 at x 0..200, seam 10 (top 20), a notch at (200,75), grain 60°; the axis is its left edge (x = 0)
 const setup=()=>f.evaluate(()=>{localStorage.removeItem('level7.barPos');const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;m.images=[];
   m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'point',id:2,x:'200',y:'0'},{op:'point',id:3,x:'200',y:'150'},{op:'point',id:4,x:'0',y:'150'},
   {op:'line',id:5,p1:{obj:1},p2:{obj:2}},{op:'line',id:6,p1:{obj:2},p2:{obj:3}},{op:'line',id:7,p1:{obj:3},p2:{obj:4}},{op:'line',id:8,p1:{obj:4},p2:{obj:1}},{op:'point',id:9,x:'200',y:'75'}];m.nextId=10;
   m.names={5:'L1',6:'L2',7:'L3',8:'L4'};
   m.pieces=[{id:1,name:'front',quantity:1,fabric:'',edges:[5,6,7,8],seam:['20','10','10','10'],notches:[{obj:9}],notchTypes:['t'],notchLen:['6'],grain:'60'}];a.selectedStep=-1;a.changed();a.fit();a.zoomAt?.(0,0,1);});
 await setup();
 const mb=page.locator('[data-l7d-tool="mirrorPts"]');const mcat=await mb.evaluate(e=>e.closest('[data-l7d-cat-panel]').dataset.l7dCatPanel);
 await page.locator(`[data-l7d-cat="${mcat}"]`).click({button:'right'});await mb.click();await f.waitForFunction(()=>window.level7.tool?.key==='mirrorPts');
 await page.mouse.click(...await at(0,0));await page.mouse.click(...await at(0,150));await f.waitForFunction(()=>window.level7.collecting);
 // single mode (default): the pointer on the top cut line (y = -20, no drawn line there) lights up the piece
 await page.mouse.move(...await at(120,-20));await f.waitForFunction(()=>!!document.querySelector('#canvas .piece-hover'));
 pass('with the mirror tool, the outer (cut) line of the piece lights up the whole piece under the pointer');
 await page.mouse.click(...await at(120,-20));
 await f.waitForFunction(()=>window.level7.model.pieces.length===2);
 const r=await f.evaluate(()=>{const a=window.level7,p=a.model.pieces[1],g=a.res.pieces.get(p.id),xs=g.cut.map(q=>q[0]),ys=g.cut.map(q=>q[1]);
   return{name:p.name,seam:p.seam,grain:p.grain,nt:p.notchTypes,nl:p.notchLen,minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),notch:g.notches[0]?.at,err:g.error??null,orig:a.model.pieces[0].edges};});
 assert(r.err===null&&Math.abs(r.minX+210)<0.5&&Math.abs(r.maxX-10)<0.5&&Math.abs(r.minY+20)<0.5,JSON.stringify(r));
 assert(JSON.stringify(r.seam)==='["20","10","10","10"]'&&r.grain==='120'&&r.nt[0]==='t'&&r.nl[0]==='6'&&Math.abs(r.notch[0]+210)<0.5&&Math.abs(r.notch[1]-75)<0.5,JSON.stringify(r));
 assert.deepEqual(r.orig,[5,6,7,8]);
 pass(`a click on the cut line copies the whole piece to the other side: «${r.name}» with the same seam allowance (top 20, others 10), its T notch (6 mm) at x −210, grain 60° → 120°`);
 // «piece» mode + move: a click inside the original piece moves it (allowance and all)
 const sb=fr.locator('.sel-bar');await sb.locator('[data-sel="piece"]').click();await sb.locator('[data-sel="copy"]').click();
 await f.evaluate(()=>{const a=window.level7;a.model.pieces.pop();a.changed();});
 await page.mouse.move(...await at(100,75));await f.waitForFunction(()=>!!document.querySelector('#canvas .piece-hover'));
 await page.mouse.click(...await at(100,75));
 await f.waitForFunction(()=>{const g=window.level7.res.pieces.get(1);return g&&Math.max(...g.cut.map(q=>q[0]))<11;});
 const mv=await f.evaluate(()=>({n:window.level7.model.pieces.length,grain:window.level7.model.pieces[0].grain,minX:Math.min(...window.level7.res.pieces.get(1).cut.map(q=>q[0]))}));
 assert(mv.n===1&&mv.grain==='120'&&Math.abs(mv.minX+210)<0.5,JSON.stringify(mv));pass('«قطعة كاملة» + «نقل»: a click inside the piece moves it across (allowance, notch and grain with it)');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
