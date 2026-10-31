// 0.9.152: as GRAFIS, Shift held near a line end snaps to it: the mark jumps onto the end and a
// click joins it (also from 40 px away). Usage: L7_SRC=<app dir> xvfb-run -a node test-0151-shift-snap.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ss-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');const f=page.frames().find(x=>x.url().includes('l7design'));await f.waitForFunction(()=>!!window.level7);
 await f.evaluate(()=>{const a=window.level7,m=a.model;a.snapshot();m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'lineAngle',id:2,start:{obj:1},angle:'90',length:'300'}];m.nextId=3;a.changed();a.fit();});
 const box=await page.locator('#l7-design-frame').boundingBox();const [ex,ey]=await f.evaluate(()=>window.level7.toScreen([0,300]));
 // the line tool, pointer 40 px beside the end
 await page.locator('[data-l7d-cat="الخطوط"]').click({button:'right'});await page.locator('[data-l7d-tool="line"]').click();
 await page.mouse.move(box.x+ex+40,box.y+ey+10);await page.waitForTimeout(100);
 const off=await f.evaluate(()=>window.level7.near);
 await page.keyboard.down('Shift');await page.waitForTimeout(100);
 const on=await f.evaluate(()=>window.level7.near);
 assert(on&&Math.abs(on.at[0])<1e-6&&Math.abs(on.at[1]-300)<1e-6&&!(off&&Math.abs(off.at[1]-300)<1e-6&&Math.abs(off.at[0])<1e-6),JSON.stringify({off,on}));
 pass('Shift held 40 px from the line end: the mark jumps onto the end (0, 300)');
 await page.mouse.click(box.x+ex+40,box.y+ey+10,{modifiers:['Shift']});await page.keyboard.up('Shift');
 await page.mouse.click(box.x+ex+200,box.y+ey+150);
 await f.waitForFunction(()=>window.level7.model.steps.some(s=>s.op==='line'));
 const ln=await f.evaluate(()=>window.level7.model.steps.find(s=>s.op==='line'));
 assert(ln.p1.obj===2&&ln.p1.end==='end',JSON.stringify(ln));
 pass('Shift + click starts the new line on that end (joined to line L1, not a loose point)');
 // a click where the near mark sits on a line (15 px beside it) starts ON that line, linked to it
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 const [mx,my]=await f.evaluate(()=>window.level7.toScreen([0,150]));
 await page.locator('[data-l7d-cat="الخطوط"]').click({button:'right'});await page.locator('[data-l7d-tool="line"]').click();
 await page.mouse.move(box.x+mx+15,box.y+my);await page.waitForTimeout(300);await page.mouse.click(box.x+mx+15,box.y+my);await page.waitForTimeout(600);await page.mouse.click(box.x+mx+220,box.y+my);
 await f.waitForFunction(()=>window.level7.model.steps.filter(s=>s.op==='line').length===2);
 const st=await f.evaluate(()=>{const m=window.level7.model,l=m.steps.filter(s=>s.op==='line')[1],p=m.steps.find(s=>s.id===l.p1.obj);return{p,start:window.level7.res.objects.get(l.p1.obj).pts[0]};});
 assert(st.p.op==='pointOn'&&st.p.on===2&&Math.abs(st.start[0])<1e-6&&Math.abs(st.start[1]-150)<2,JSON.stringify(st));
 pass('a click 15 px beside line L1 starts the new line ON L1 at the mark (point on line, linked), not a loose point');
 // a point that is only a line end is not drawn as a separate dot
 const dots=await f.evaluate(()=>[...document.querySelectorAll('#canvas circle[r="2.6"]')].length);assert.equal(dots,0);
 pass('no red dots at line ends (the start points of lines are not drawn separately)');
 // Z: formula and description columns look different
 await page.keyboard.press('Escape');await f.evaluate(()=>{const a=window.level7;a.model.variables=[{id:1,name:'وصف',expr:'X1/2'}];a.changed();});
 await page.locator('[data-l7d-command="tab-z"]').click();const fr=page.frameLocator('#l7-design-frame');await fr.locator('.ztable textarea.zdesc').waitFor();
 const z=await f.evaluate(()=>{const a=getComputedStyle(document.querySelector('.ztable .zf input')),b=getComputedStyle(document.querySelector('.ztable textarea.zdesc'));return[a.color,b.color,a.borderStyle,b.borderStyle,b.fontStyle];});
 assert(z[0]!==z[1]&&z[3]==='dashed'&&z[4]==='italic',JSON.stringify(z));
 pass('Z window: formulas in yellow on a tinted field, descriptions muted italic with a dashed frame');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
