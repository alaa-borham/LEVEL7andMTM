// 0.9.127: curve tool confirms in one go with a live rubber curve; GRAFIS-style point panel
// (free, on line, intersection, %, mm, x/y offset, raster). Usage: L7_SRC=<app dir> xvfb-run -a node test-0127-points-curve.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'pc-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForSelector('#tool-guide');
 await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),frame=page.frameLocator('#l7-design-frame');
 await f.evaluate(()=>{const a=window.level7,m=a.model;m.steps.push({op:'point',id:1,x:'200',y:'0'},{op:'point',id:2,x:'0',y:'0'},{op:'point',id:3,x:'0',y:'200'},{op:'line',id:4,p1:{obj:1},p2:{obj:2}},{op:'line',id:5,p1:{obj:3},p2:{obj:2}});Object.assign(m.names,{1:'P1',2:'P2',3:'P3',4:'L1',5:'L2'});m.nextId=6;a.changed();a.fit();});
 const box=await frame.locator('#canvas').boundingBox();const at=async(x,y)=>{const[sx,sy]=await f.evaluate(([x,y])=>window.level7.toScreen([x,y]),[x,y]);return[box.x+sx,box.y+sy];};
 const tool=async key=>{const b=page.locator(`[data-l7d-tool="${key}"]`);if(!await b.isVisible()){const cat=await b.evaluate(e=>e.closest('[data-l7d-cat-panel]').dataset.l7dCatPanel);await page.locator(`[data-l7d-cat="${cat}"]`).click({button:"right"});}await b.click();await page.waitForFunction(k=>document.querySelector(`[data-l7d-tool="${k}"]`).getAttribute('aria-pressed')==='true',key);};
 const ops=()=>f.evaluate(()=>window.level7.model.steps.map(s=>s.op));
 // curve: three clicks in empty space, rubber curve, right click creates it
 await tool('curve');for(const[x,y]of[[60,60],[110,130],[170,90]])await page.mouse.click(...await at(x,y));
 await page.mouse.move(...await at(185,40),{steps:3});await f.waitForFunction(()=>document.querySelectorAll('#canvas [stroke="var(--live)"]').length>0);
 await page.mouse.click(...await at(185,40),{button:'right'});await f.waitForFunction(()=>window.level7.model.steps.at(-1).op==='curve');
 assert.equal((await f.evaluate(()=>window.level7.model.steps.at(-1).through.length)),3);assert(await frame.locator('#tool-box').isHidden());
 pass('curve: points by clicks, live rubber curve, right click creates it at once (no second box)');
 await page.mouse.click(...await at(185,40),{button:'right'});
 // point panel only while a point is expected
 await tool('line');assert(await frame.locator('.pt-modes').isVisible());
 // % on L1 (50 % from the nearer end), then intersection at the corner
 await frame.locator('.pt-modes [data-pv="ptPct"]').fill('50');await frame.locator('.pt-modes [data-pm="pct"]').click();
 await page.mouse.click(...await at(150,0));await frame.locator('.pt-modes [data-pm="intersect"]').click();await page.mouse.click(...await at(2,2));
 await f.waitForFunction(()=>window.level7.model.steps.at(-1).op==='line');
 const s=await f.evaluate(()=>window.level7.model.steps.slice(-3));assert.equal(s[0].op,'pointOn');assert.equal(s[0].unit,'%');assert.equal(s[0].dist,'50');assert.equal(s[1].op,'intersect');
 const L=await f.evaluate(id=>{const o=window.level7.res.objects.get(id);return o.pts.map(p=>p.map(v=>Math.round(v*10)/10));},s[2].id);assert.deepEqual(L,[[100,0],[0,0]]);
 pass('point panel: % (50 % of L1) and intersection points start and end a line: (100,0)-(0,0)');
 // x/y offset from P3 and mm along L2
 await frame.locator('.pt-modes [data-pv="ptDx"]').fill('10');await frame.locator('.pt-modes [data-pv="ptDy"]').fill('-20');await frame.locator('.pt-modes [data-pm="xy"]').click();
 await page.mouse.click(...await at(0,200));await frame.locator('.pt-modes [data-pv="ptMm"]').fill('X1+5');await f.evaluate(()=>{const a=window.level7;a.model.measurements.push({id:1,name:'',value:45});a.changed();});
 await frame.locator('.pt-modes [data-pm="mm"]').click();await page.mouse.click(...await at(0,30));
 await f.waitForFunction(()=>window.level7.model.steps.at(-1).op==='line');
 const t=await f.evaluate(()=>{const a=window.level7,st=a.model.steps.slice(-3);return{ops:st.map(x=>x.op),dist:st[1].dist,pts:a.res.objects.get(st[2].id).pts.map(p=>p.map(v=>Math.round(v*10)/10))};});
 assert.deepEqual(t.ops,['pointOffset','pointOn','line']);assert.equal(t.dist,'X1+5');assert.deepEqual(t.pts,[[10,180],[0,50]]);
 pass('point panel: x/y offset (P3 + 10, −20) and mm along a line (X1+5 = 50 mm from the nearer end), linked to X');
 // X / Z list in the point panel
 await frame.locator('.pt-modes [data-pm-row="pct"] .pt-ref').focus();await frame.locator('.pt-modes [data-pm-row="pct"] .pt-ref').selectOption('X1');
 assert.equal(await frame.locator('.pt-modes [data-pv="ptPct"]').inputValue(),'X1');pass('point panel: X / Z list fills the value (X1)');
 await frame.locator('.pt-modes [data-pm="free"]').click();await page.mouse.click(...await at(0,0),{button:'right'});
 assert(await frame.locator('.pt-modes').isHidden());pass('point panel hides when no point is expected');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
