// 0.9.159: no handle / length / name labels standing on the drawing; parts visible unless hidden, show / hide
// all; curve bar (as GRAFIS): bind a point (line end / on a line), unbind, delete, end angle on a line;
// line type and colour per line.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0159-curve-bar.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 // vertical line L(0,0)-(0,-400) id 2, horizontal line (0,-300)-(300,-300) id 4, a slanted line id 6 ending at (200,-100); curve 9 from (0,-300) to (300,0)
 await f.evaluate(()=>{const a=window.level7,m=a.model;a.snapshot();m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'lineAngle',id:2,start:{obj:1},angle:'-90',length:'400'},
   {op:'point',id:3,x:'0',y:'-300'},{op:'lineAngle',id:4,start:{obj:3},angle:'0',length:'300'},{op:'point',id:5,x:'120',y:'-40'},{op:'lineAngle',id:6,start:{obj:5},angle:'-30',length:'90'},
   {op:'point',id:7,x:'300',y:'0'},{op:'curve',id:9,through:[{obj:3},{obj:7}],startAngle:'0',endAngle:'90'}];m.nextId=10;a.selectedStep=7;a.changed();a.fit();});
 const box=await page.locator('#l7-design-frame').boundingBox(),S=async p=>{const q=await f.evaluate(p=>window.level7.toScreen(p),p);return[box.x+q[0],box.y+q[1]];};
 // 1) labels: none standing; the angle shows only while a handle is dragged
 let n=await f.evaluate(()=>[...document.querySelectorAll('#canvas text.live-label')].map(t=>t.textContent));assert.equal(n.length,0,JSON.stringify(n));
 const h=await f.evaluate(()=>window.level7.curveHandles().find(h=>h.end==='end').hs);await page.mouse.move(box.x+h[0],box.y+h[1]);await page.mouse.down();await page.mouse.move(box.x+h[0]+8,box.y+h[1]-3,{steps:3});
 n=await f.evaluate(()=>[...document.querySelectorAll('#canvas text.live-label')].length);await page.mouse.up();assert.equal(n,1);
 assert.equal(await f.evaluate(()=>document.querySelectorAll('#canvas text.live-label').length),0);
 await f.evaluate(()=>{window.level7.selectedStep=-1;window.level7.render();});await page.mouse.move(...await S([0,-200]));await page.waitForTimeout(150);
 assert.equal(await f.evaluate(()=>document.querySelectorAll('#canvas text.name-tip').length),0);
 pass('no angle / % / length / name labels on the drawing; the angle shows only while a handle is dragged');
 // 2) curve bar: bind the end of the slanted line (200 ... ) to the curve
 await f.evaluate(()=>{window.level7.selectedStep=7;window.level7.render();});await fr.locator('.curve-bar').waitFor();
 await fr.locator('.curve-bar [data-cm="bind"]').click();
 const e6=await f.evaluate(()=>window.level7.res.objects.get(6).pts.at(-1));await page.mouse.click(...await S(e6));
 let c=await f.evaluate(()=>{const a=window.level7,c=a.model.steps.find(s=>s.op==='curve');const o=a.res.objects.get(9);return{th:c.through,near:Math.min(...o.pts.map(p=>Math.hypot(p[0]-a.res.objects.get(6).pts.at(-1)[0],p[1]-a.res.objects.get(6).pts.at(-1)[1])))};});
 assert(c.th.length===3&&c.th[1].obj===6&&c.th[1].end==='end'&&c.near<0.5,JSON.stringify(c));
 // the line moves: the curve follows
 await f.evaluate(()=>{const a=window.level7;a.model.steps.find(s=>s.id===6).length='110';a.changed();});
 c=await f.evaluate(()=>{const a=window.level7,o=a.res.objects.get(9),e=a.res.objects.get(6).pts.at(-1);return Math.min(...o.pts.map(p=>Math.hypot(p[0]-e[0],p[1]-e[1])));});assert(c<0.5,String(c));
 pass('📌 bind: a click on another line\'s end ties the curve to it; lengthening that line moves the curve with it');
 // bind on a line (no end there): on the vertical line? use the horizontal line 4 at x=150 → a point on line 4
 await page.mouse.click(...await S([150,-300]));
 c=await f.evaluate(()=>{const a=window.level7,cv=a.model.steps.find(s=>s.op==='curve'),r=cv.through.find(r=>{const t=a.model.steps.find(s=>s.id===r.obj);return t?.op==='pointOn'&&t.on===4;});return{n:cv.through.length,r:!!r};});
 assert(c.n===4&&c.r,JSON.stringify(c));pass('📌 bind on a line: a point on that line is made where clicked and the curve passes through it');
 // 3) unbind: the line-end point becomes free
 await fr.locator('.curve-bar [data-cm="unbind"]').click();const e6b=await f.evaluate(()=>window.level7.res.objects.get(6).pts.at(-1));await page.mouse.click(...await S(e6b));
 c=await f.evaluate(()=>{const a=window.level7,cv=a.model.steps.find(s=>s.op==='curve');return cv.through.map(r=>a.model.steps.find(s=>s.id===r.obj)?.op+(r.end?':'+r.end:''));});
 assert(!c.some(x=>/lineAngle/.test(x))&&c.filter(x=>x==='point').length>=3,JSON.stringify(c));pass(`📍✕ unbind: the point is free in its place (${c.join(', ')})`);
 // 4) delete a point
 const before=await f.evaluate(()=>window.level7.model.steps.find(s=>s.op==='curve').through.length);
 await fr.locator('.curve-bar [data-cm="del"]').click();const p1=await f.evaluate(()=>{const a=window.level7,cv=a.model.steps.find(s=>s.op==='curve');return a.pointOf(cv.through[1]);});await page.mouse.click(...await S(p1));
 assert.equal(await f.evaluate(()=>window.level7.model.steps.find(s=>s.op==='curve').through.length),before-1);pass('•✕ delete: the point is taken out of the curve');
 // 5) angle on a line: start 90° to the vertical line 2
 await fr.locator('.curve-bar [data-cm="rel"]').click();await page.mouse.click(...await S([0,-370]));
 const tb=fr.locator('#tool-box');await tb.waitFor();await tb.locator('select[data-key="end"]').selectOption('start');await tb.locator('input[data-key="angle"]').fill('90');await tb.locator('[data-ok]').click();
 c=await f.evaluate(()=>{const a=window.level7,cv=a.model.steps.find(s=>s.op==='curve'),o=a.res.objects.get(9);const d=[o.pts[1][0]-o.pts[0][0],o.pts[1][1]-o.pts[0][1]];return{rel:cv.startRel,ang:cv.startAngle,deg:Math.round(Math.atan2(d[1],d[0])*180/Math.PI)};});
 assert(c.rel===2&&c.ang==='90'&&Math.abs(Math.abs(c.deg)-0)<=3,JSON.stringify(c));
 // rotate the vertical line: the curve end stays square to it
 await f.evaluate(()=>{const a=window.level7;a.model.steps.find(s=>s.id===2).angle='-60';a.model.steps.find(s=>s.id===3).x='0';a.changed();});
 c=await f.evaluate(()=>{const a=window.level7,o=a.res.objects.get(9),L=a.res.objects.get(2).pts;const d=[o.pts[1][0]-o.pts[0][0],o.pts[1][1]-o.pts[0][1]],l=[L[1][0]-L[0][0],L[1][1]-L[0][1]];return Math.round(Math.acos((d[0]*l[0]+d[1]*l[1])/Math.hypot(...d)/Math.hypot(...l))*180/Math.PI);});
 assert(Math.abs(c-90)<=3,'angle to the line '+c);
 pass(`∠⟂ the curve start is set to 90° on the line L2 (tangent ${c}° to the line after it turned)`);
 // 6) line type and colour
 await f.evaluate(()=>{window.level7.selectedStep=3;window.level7.render();});await fr.locator('.curve-bar select[data-dash]').selectOption('dashed');
 await f.evaluate(()=>{const i=document.querySelector('.curve-bar input[data-color]');i.value='#e53935';i.dispatchEvent(new Event('change',{bubbles:true}));});
 const st=await f.evaluate(()=>{const a=window.level7;a.selectedStep=-1;a.render();const pl=[...document.querySelectorAll('#canvas polyline')].find(p=>p.getAttribute('stroke')==='#e53935');return{s:JSON.stringify(a.model.lineStyles),dash:pl?.getAttribute('stroke-dasharray')};});
 assert(st.dash==='8 5'&&/"dashed"/.test(st.s),JSON.stringify(st));pass('line type «متقطع» and a red colour stay on the line L4 ('+st.s+')');
 // 7) parts: a new part leaves the others visible; hide all / show all
 await f.evaluate(()=>window.level7.addPart());const g1=await f.evaluate(()=>window.level7.ghosts.length);
 await fr.locator('.part-strip [data-sall="0"]').click();const g0=await f.evaluate(()=>window.level7.ghosts.length);
 await fr.locator('.part-strip [data-sall="1"]').click();const g2=await f.evaluate(()=>window.level7.ghosts.length);
 assert(g1===1&&g0===0&&g2===1,[g1,g0,g2].join());pass('a new part: part 001 stays visible behind it; 🚫 hides all parts, 👁 shows all again');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
