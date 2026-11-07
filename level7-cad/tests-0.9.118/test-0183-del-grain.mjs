// 0.9.183: a mirror tool mirrors a notch too (a new notch on the other side, same shape / length);
// «حذف خط اتجاه القماش» in the delete menu: a click on a grain line drawn with the grain tool
// deletes it (undo brings it back); a click on the piece's automatic grain line says where it is set.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0183-del-grain.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 const box=await page.locator('#l7-design-frame').boundingBox(),at=async(x,y)=>{const[sx,sy]=await f.evaluate(([x,y])=>window.level7.toScreen([x,y]),[x,y]);return[box.x+sx,box.y+sy];};
 await f.evaluate(()=>{localStorage.removeItem('level7.barPos');localStorage.removeItem('level7.formMini');const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;delete m.lineStyles;m.images=[];
   m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'point',id:2,x:'200',y:'0'},{op:'point',id:3,x:'200',y:'300'},{op:'point',id:4,x:'0',y:'300'},
   {op:'line',id:5,p1:{obj:1},p2:{obj:2}},{op:'line',id:6,p1:{obj:2},p2:{obj:3}},{op:'line',id:7,p1:{obj:3},p2:{obj:4}},{op:'line',id:8,p1:{obj:4},p2:{obj:1}},
   {op:'point',id:9,x:'60',y:'250'},{op:'mark',kind:'grain',a:{obj:9},angle:'-90',size:'150'}];
   m.nextId=10;m.pieces=[{id:1,name:'p',quantity:1,fabric:'',edges:[5,6,7,8],seam:['10','10','10','10'],notches:[],grain:'90'}];a.selectedStep=-1;a.changed();a.fit();});
 // the delete menu shows the new entry with its icon
 const b=page.locator('[data-l7d-tool="delGrain"]');const cat=await b.evaluate(e=>e.closest('[data-l7d-cat-panel]').dataset.l7dCatPanel);
 await page.locator(`[data-l7d-cat="${cat}"]`).click({button:'right'});assert(await b.isVisible());
 assert.equal((await b.textContent()).trim(),'حذف خط اتجاه القماش');assert(await b.locator('svg').count()===1);await b.click();
 await f.waitForFunction(()=>window.level7.tool?.key==='delGrain');pass(`«حذف خط اتجاه القماش» in the menu «${cat}», with its icon`);
 // a click on the drawn grain line deletes it
 await page.mouse.click(...await at(62,180));
 await f.waitForFunction(()=>!window.level7.model.steps.some(s=>s.op==='mark'&&s.kind==='grain'));pass('a click on the grain line deletes it');
 await f.evaluate(()=>window.level7.undo());await f.waitForFunction(()=>window.level7.model.steps.some(s=>s.op==='mark'&&s.kind==='grain'));pass('undo brings it back');
 // the automatic grain line (once the drawn one is gone) is not deleted; the message says where it is set
 await f.evaluate(()=>{const a=window.level7;a.snapshot();a.model.steps=a.model.steps.filter(s=>!(s.op==='mark'&&s.kind==='grain'));a.changed();});
 const g=await f.evaluate(()=>window.level7.res.pieces.get(1).grain);
 await page.locator(`[data-l7d-cat="${cat}"]`).click({button:'right'});await b.click();await f.waitForFunction(()=>window.level7.tool?.key==='delGrain');
 await page.mouse.click(...await at((g[0][0]+g[1][0])/2,(g[0][1]+g[1][1])/2));
 await f.waitForFunction(()=>/صفحة القطع/.test(document.querySelector('#toast')?.textContent||''));pass('a click on the automatic grain line says it is set on the pieces page');
 // mirror a notch: axis = the middle line x = 100, then a click on the notch at the right edge
 await page.keyboard.press('Escape');
 await f.evaluate(()=>{const a=window.level7,m=a.model;a.snapshot();m.steps.push({op:'point',id:12,x:'200',y:'100'},{op:'point',id:13,x:'100',y:'0'},{op:'point',id:14,x:'100',y:'300'},{op:'line',id:15,p1:{obj:13},p2:{obj:14}});m.nextId=16;
   m.pieces[0].notches=[{obj:12}];m.pieces[0].notchTypes=['t'];m.pieces[0].notchLen=['8'];a.changed();a.fit();});
 const mb=page.locator('[data-l7d-tool="mirrorCopy"]');const mcat=await mb.evaluate(e=>e.closest('[data-l7d-cat-panel]').dataset.l7dCatPanel);
 await page.locator(`[data-l7d-cat="${mcat}"]`).click({button:'right'});await mb.click();await f.waitForFunction(()=>window.level7.tool?.key==='mirrorCopy');
 await page.mouse.click(...await at(100,150));await f.waitForFunction(()=>window.level7.collecting);
 const n0=await f.evaluate(()=>window.level7.res.pieces.get(1).notches[0]);
 await page.mouse.click(...await at((n0.at[0]+n0.to[0])/2,(n0.at[1]+n0.to[1])/2));
 await f.waitForFunction(()=>window.level7.model.pieces[0].notches.length===2);
 const nn=await f.evaluate(()=>({pc:window.level7.model.pieces[0],g:window.level7.res.pieces.get(1).notches[1],lines:window.level7.model.steps.filter(s=>s.op==='line').length}));
 assert(Math.abs(nn.g.at[0]+10)<1e-6&&Math.abs(nn.g.at[1]-100)<1e-6&&nn.g.type==='t'&&nn.pc.notchLen[1]==='8'&&nn.lines===5,JSON.stringify(nn));
 pass('mirror (copy) about the middle line: a click on the notch puts a T notch, 8 mm, at the same place on the other side; no line is copied');
 // the mirror bar (as GRAFIS): shown with the tool; frame of lines; a whole piece; copy / move
 const sb=fr.locator('.sel-bar');await sb.waitFor();assert.equal(await sb.locator('button[data-sel]').count(),8);
 await sb.locator('[data-sel="frameLines"]').click();
 await page.mouse.click(...await at(-5,-5));await page.mouse.click(...await at(5,305));
 await f.waitForFunction(()=>{const s=window.level7.model.steps.at(-1);return s.op==='mirror'&&s.items.length===1&&s.items[0].src===8&&!!s.items[0].dst;});
 pass('mirror bar «الخطوط داخل إطار»: a frame round the left edge copies only that line to the other side');
 await sb.locator('[data-sel="piece"]').click();const nBefore=await f.evaluate(()=>window.level7.model.pieces[0].notches.length);
 await page.mouse.click(...await at(50,60));
 await f.waitForFunction(n=>{const s=window.level7.model.steps.filter(x=>x.op==='mirror'&&x.items.length===4);return s.length===1&&window.level7.model.pieces[0].notches.length===2*n;},nBefore);
 pass(`mirror bar «قطعة كاملة»: a click in the piece copies its 4 edges and its ${nBefore} notches`);
 await sb.locator('[data-sel="copy"]').click();assert((await sb.locator('[data-sel="copy"]').textContent()).includes('نقل'));
 await sb.locator('[data-sel="single"]').click();const before=await f.evaluate(()=>window.level7.model.steps.length);
 await page.mouse.click(...await at(200,150));
 await f.waitForFunction(b=>{const s=window.level7.model.steps.at(-1);return window.level7.model.steps.length===b+1&&s.op==='mirror'&&s.items.length===1&&s.items[0].src===6&&!s.items[0].dst;},before);
 pass('mirror bar «نقل» + «عناصر مفردة»: a click moves that line (no copy)');
 // 0.9.186: a notch lights up under the pointer; «النوتشات فقط» + a frame round the red marks (on the cut line)
 await sb.locator('[data-sel="copy"]').click();await sb.locator('[data-sel="notches"]').click();
 const nm=await f.evaluate(()=>{const n=window.level7.res.pieces.get(1).notches[0];return{at:n.at,to:n.to};});
 const mid=[(nm.at[0]+nm.to[0])/2,(nm.at[1]+nm.to[1])/2];
 await page.mouse.move(...await at(mid[0],mid[1]),{steps:3});await f.waitForFunction(()=>!!document.querySelector('#canvas .notch-hover'));
 pass('a notch under the pointer lights up while a mirror tool is on');
 const n1=await f.evaluate(()=>window.level7.model.pieces[0].notches.length);
 // a frame round the red mark only (its point on the sewing line stays outside the frame)
 const x0=Math.min(nm.at[0],nm.to[0])-0.5,x1=Math.max(nm.at[0],nm.to[0])+0.5,y0=Math.min(nm.at[1],nm.to[1])-0.5,y1=Math.max(nm.at[1],nm.to[1])+0.5;
 await page.mouse.click(...await at(x0,y0-3));await page.mouse.click(...await at(x1,y1+3));
 await f.waitForFunction(n=>window.level7.model.pieces[0].notches.length>n,n1);
 const added=await f.evaluate(n=>window.level7.model.pieces[0].notches.length-n,n1);
 pass(`«النوتشات فقط»: a frame round the red marks on the cut line copies ${added} notch(es) to the other side`);
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
