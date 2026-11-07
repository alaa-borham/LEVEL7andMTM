// 0.9.130: no letters on the drawing (name on hover), right click closes a tool menu,
// curve end handles (drag sets the direction, double-click frees it), dimensions.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0130-curve-dims.mjs  (writes shot-0130.png)
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'cd-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForSelector('#tool-guide');
 await page.waitForSelector('.l7-design-cat');{const f0=page.frames().find(x=>x.url().includes('l7design'));await f0.waitForFunction(()=>!!window.level7);await f0.evaluate(()=>{const a=window.level7;a.__newDone=false;if(!a.__newWrapped){const o=a.newDesign.bind(a);a.newDesign=()=>{try{o();}finally{a.__newDone=true;}};a.__newWrapped=true;}});await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();await f0.waitForFunction(()=>window.level7.__newDone);} /* «new design» reaches the drawing by a message: wait for it before filling the model */await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');
 await f.evaluate(()=>{const a=window.level7,m=a.model;m.steps.push({op:'point',id:1,x:'200',y:'0'},{op:'point',id:2,x:'0',y:'0'},{op:'point',id:3,x:'0',y:'200'},{op:'line',id:4,p1:{obj:1},p2:{obj:2}},{op:'line',id:5,p1:{obj:3},p2:{obj:2}});Object.assign(m.names,{1:'P1',2:'P2',3:'P3',4:'L1',5:'L2'});m.nextId=6;a.changed();a.fit();});
 const box=await fr.locator('#canvas').boundingBox();const at=async(x,y)=>{const[sx,sy]=await f.evaluate(([x,y])=>window.level7.toScreen([x,y]),[x,y]);return[box.x+sx,box.y+sy];};
 const tool=async key=>{const b=page.locator(`[data-l7d-tool="${key}"]`);if(!await b.isVisible()){const cat=await b.evaluate(e=>e.closest('[data-l7d-cat-panel]').dataset.l7dCatPanel);await page.locator(`[data-l7d-cat="${cat}"]`).click({button:"right"});}await b.click();await page.waitForFunction(k=>document.querySelector(`[data-l7d-tool="${k}"]`).getAttribute('aria-pressed')==='true',key);};
 // icons of every tool are real drawings (0.9.122 regression)
 assert.equal(await page.locator('[data-l7d-tool="cornerSharp"] svg').getAttribute('data-l7-icon'),'cornerSharp');assert.equal(await page.locator('[data-l7d-tool="mirrorCopy"] svg').getAttribute('data-l7-icon'),'mirrorCopy');
 pass('sharp corner and mirror copy show their own icons again');
 // no letters, name on hover
 assert.equal(await f.evaluate(()=>[...document.querySelectorAll('#canvas text')].filter(t=>/^[PLC]\d+$/.test(t.textContent)).length),0);
 await page.mouse.move(...await at(0,200));await page.waitForTimeout(200);assert.equal(await f.evaluate(()=>document.querySelectorAll('#canvas text.name-tip').length),0);
 pass('no P/L letters on the drawing, also not under the pointer (0.9.159)');
 // right click closes an open menu (in the program and on the drawing)
 await page.locator('[data-l7d-cat="الخطوط"]').click({button:'right'});assert.equal(await page.locator('.l7-design-flyout:not([hidden])').count(),1);
 await page.mouse.click(...await at(120,120),{button:'right'});await page.waitForFunction(()=>!document.querySelector('.l7-design-flyout:not([hidden])'));
 pass('right click on the drawing closes an open tool menu');
 // curve with end handles
 await tool('curve');for(const[x,y]of[[0,200],[80,120],[200,0]])await page.mouse.click(...await at(x,y));await page.mouse.click(...await at(150,150),{button:'right'});
 await f.waitForFunction(()=>window.level7.model.steps.at(-1).op==='curve');await page.mouse.click(...await at(150,150),{button:'right'});
 await f.waitForFunction(()=>document.querySelectorAll('#canvas .curve-handle').length===2);
 const h=await f.evaluate(()=>[...document.querySelectorAll('#canvas .curve-handle')].map(c=>[+c.getAttribute('cx'),+c.getAttribute('cy')]));
 const [hx,hy]=h[0];await page.mouse.move(box.x+hx,box.y+hy);await page.mouse.down();
 // drag the start handle level with the start point: the curve leaves the start going right (0°)
 const [sx0,sy0]=await f.evaluate(()=>window.level7.toScreen([0,200]));const flip=await f.evaluate(()=>window.level7.curveHandles()[0].flip);await page.mouse.up();await page.mouse.move(box.x+hx,box.y+hy);await page.mouse.down();const tx=sx0+(flip?70:-70),ty=sy0;await page.mouse.move(box.x+tx,box.y+ty,{steps:5});await page.mouse.up();
 await f.waitForFunction(()=>window.level7.model.steps.at(-1).startAngle==='0');
 await page.screenshot({path:'shot-0130.png'});
 pass('curve: two end handles; dragging the start handle sets the start direction (0°)');
 const hh2=await f.evaluate(()=>window.level7.curveHandles()[0].hs);await page.mouse.dblclick(box.x+hh2[0],box.y+hh2[1]);await f.waitForFunction(()=>window.level7.model.steps.at(-1).startAngle==='');pass('double-click on the handle frees the direction again');
 // 0.9.131: handle distance sets the strength; the middle point of the curve can be dragged
 await f.evaluate(()=>window.level7.zoomBy(0.75)); // room below the drawing for dragging the end handle outwards
 {const h0=await f.evaluate(()=>window.level7.curveHandles()[1]);const [ex,ey]=h0.es;const ux=(h0.hs[0]-ex)/Math.hypot(h0.hs[0]-ex,h0.hs[1]-ey),uy=(h0.hs[1]-ey)/Math.hypot(h0.hs[0]-ex,h0.hs[1]-ey);
  const len0=await f.evaluate(()=>{const s=window.level7.model.steps.at(-1);const o=window.level7.res.objects.get(s.id);let L=0;for(let i=1;i<o.pts.length;i++)L+=Math.hypot(o.pts[i][0]-o.pts[i-1][0],o.pts[i][1]-o.pts[i-1][1]);return L;});
  await page.mouse.move(box.x+h0.hs[0],box.y+h0.hs[1]);await page.mouse.down();await page.mouse.move(box.x+ex+ux*140,box.y+ey+uy*140,{steps:6});await page.mouse.up();
  await f.waitForFunction(()=>Number(window.level7.model.steps.at(-1).endTension)>=180);
  pass('curve: pulling the end handle further makes the curve stronger at that end (tension '+await f.evaluate(()=>window.level7.model.steps.at(-1).endTension)+'%)');
  const pts=await f.evaluate(()=>window.level7.curvePoints());assert(pts.length>=1);const mid=pts[0];
  await page.mouse.move(box.x+mid.s[0],box.y+mid.s[1]);await page.mouse.down();await page.mouse.move(box.x+mid.s[0]+40,box.y+mid.s[1]-30,{steps:5});await page.mouse.up();
  const after=await f.evaluate(()=>window.level7.curvePoints()[0].s);assert(Math.hypot(after[0]-mid.s[0]-40,after[1]-mid.s[1]+30)<3,JSON.stringify([mid.s,after]));
  pass('curve: dragging a point the curve passes through reshapes it');}
 // a curve through a point ON A LINE: the point can be dragged in any direction, and stays tied to its line
 await page.mouse.click(...await at(150,150),{button:'right'});await page.keyboard.press('Escape');
 await f.evaluate(()=>{const a=window.level7,m=a.model;m.steps.push({op:'pointOn',id:40,on:4,dist:'50',unit:'%',from:'start'},{op:'curve',id:41,through:[{obj:3},{obj:40},{obj:2}],startAngle:'',endAngle:''});m.names[40]='P40';m.names[41]='C40';m.nextId=42;a.changed();a.selectedStep=m.steps.length-1;a.render();});
 {const p0=await f.evaluate(()=>window.level7.curvePoints()[0].s);await page.mouse.move(box.x+p0[0],box.y+p0[1]);await page.mouse.down();await page.mouse.move(box.x+p0[0]-30,box.y+p0[1]-60,{steps:5});await page.mouse.up();
  const r=await f.evaluate(()=>{const m=window.level7.model,c=m.steps.find(s=>s.id===41),o=m.steps.find(s=>s.op==='pointOffset'&&s.from.obj===40);return{through:c.through[1].obj,off:o&&{id:o.id,dx:o.dx,dy:o.dy},offIdx:m.steps.indexOf(o),curveIdx:m.steps.indexOf(c)};});
  assert(r.off&&r.through===r.off.id&&r.offIdx===r.curveIdx-1&&Number(r.off.dy)>0,JSON.stringify(r));
  pass('curve through a point on a line: dragged freely (offset '+r.off.dx+', '+r.off.dy+'), the curve now passes through the moved point');
  const p1=await f.evaluate(id=>window.level7.res.objects.get(id).pts[0],r.off.id);
  await f.evaluate(()=>{const a=window.level7;a.model.steps[0].x='300';a.changed();});
  const p2=await f.evaluate(id=>window.level7.res.objects.get(id).pts[0],r.off.id);assert(Math.abs(p2[0]-p1[0]-50)<1e-6,JSON.stringify([p1,p2]));
  pass('the moved point stays tied to its line: the line grows, the point follows (+50 mm)');}
 await f.evaluate(()=>{const a=window.level7;a.model.steps[0].x='200';a.changed();a.selectedStep=-1;a.render();});
 // dimensions
 await tool('dimH');await page.mouse.click(...await at(200,0));await page.mouse.click(...await at(0,200));await fr.locator('#tool-box [data-ok]').waitFor();
 await page.mouse.move(...await at(100,30),{steps:4});await f.waitForFunction(()=>document.querySelector('#canvas g.dim.live text')?.textContent.includes('200'));
 await page.mouse.click(...await at(100,30));await f.waitForFunction(()=>window.level7.model.steps.at(-1).op==='dim');
 assert.equal(await f.evaluate(()=>window.level7.model.steps.at(-1).kind),'h');
 // the dimension follows the pattern
 await f.evaluate(()=>{const a=window.level7;a.model.steps[0].x='260';a.changed();});
 await f.waitForFunction(()=>[...document.querySelectorAll('#canvas g.dim text')].some(t=>t.textContent.includes('260')));
 pass('horizontal dimension placed with the mouse (200 mm) and updated when the pattern changes (260 mm)');
 await page.keyboard.press('Escape');await tool('dimAngle');for(const[x,y]of[[150,0],[0,0],[0,150]])await page.mouse.click(...await at(x,y));
 await f.waitForFunction(()=>[...document.querySelectorAll('#canvas g.dim text')].some(t=>t.textContent.includes('90°')));pass('angle dimension: 90°');
 // 0.9.134: drag a dimension, text + flip by double-click, sum of lengths, inches
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 const hi=await f.evaluate(()=>{const a=window.level7,i=a.model.steps.findIndex(s=>s.op==='dim'&&s.kind==='h');const h=a.dimHits.find(x=>x.i===i);return{i,p:h.pts[0],q:h.pts[1]};});
 const mx=(hi.p[0]+hi.q[0])/2,my=(hi.p[1]+hi.q[1])/2;const off0=await f.evaluate(i=>window.level7.model.steps[i].offset,hi.i);
 await page.mouse.move(box.x+mx,box.y+my);await page.mouse.down();await page.mouse.move(box.x+mx,box.y+my-60,{steps:5});await page.mouse.up();
 const off1=await f.evaluate(i=>Number(window.level7.model.steps[i].offset),hi.i);assert(off1>Number(off0)+5,off0+' → '+off1);
 pass('dimension dragged away from the line it measures (offset '+off0+' → '+off1+' mm)');
 const hj=await f.evaluate(i=>{const h=window.level7.dimHits.find(x=>x.i===i);return[(h.pts[0][0]+h.pts[1][0])/2,(h.pts[0][1]+h.pts[1][1])/2]},hi.i);
 await page.mouse.dblclick(box.x+hj[0],box.y+hj[1]);await fr.locator('#tool-box input[data-key="text"]').waitFor();
 await fr.locator('#tool-box input[data-key="text"]').fill('عرض');await fr.locator('#tool-box select[data-key="flip"]').selectOption('1');await fr.locator('#tool-box [data-ok]').click();
 await f.waitForFunction(i=>{const s=window.level7.model.steps[i];return s.text==='عرض'&&s.flip==='1'},hi.i);
 assert(await f.evaluate(()=>[...document.querySelectorAll('#canvas g.dim text')].some(t=>t.textContent.includes('عرض')&&t.textContent.includes('260'))));
 pass('double-click: text «عرض» added to the dimension and its value turned to the other side');
 await tool('dimSum');await page.mouse.click(...await at(100,0));await page.mouse.click(...await at(0,100));await page.keyboard.press('Enter');
 await fr.locator('#tool-box [data-ok]').click();await f.waitForFunction(()=>[...document.querySelectorAll('#canvas g.dim text')].some(t=>t.textContent.includes('Σ 460')));
 pass('sum dimension: two lines (260 + 200) shown as Σ 460');
 await page.keyboard.press('Escape');await page.locator('[data-l7d-sizebtn]').click();await page.locator('.l7-size-menu [data-unit="in"]').click();
 await f.waitForFunction(()=>[...document.querySelectorAll('#canvas g.dim text')].some(t=>t.textContent.includes('18.11″')));
 pass('unit inch: Σ 460 mm shows as 18.11″');
 await page.screenshot({path:'shot-0134-dims.png'});
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
