// 0.9.161: double-click on a curve shows its handles (as GRAFIS), also with a point close beside it
// (the glowing element opens, not the nearest point); ✎ in the curve bar opens its values; an
// inherited curve says which part to edit it in.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0161-dblclick-curve.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 // a curve (0,0) → (200,200) and a point on a line lying 6 mm beside the curve's middle
 await f.evaluate(()=>{const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;delete m.lineStyles;m.pieces=[];
   m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'point',id:2,x:'200',y:'200'},{op:'curve',id:3,through:[{obj:1},{obj:2}],startAngle:'0',endAngle:'90'},
   {op:'point',id:4,x:'0',y:'150'},{op:'lineAngle',id:5,start:{obj:4},angle:'0',length:'300'}];m.nextId=6;a.selectedStep=-1;a.changed();a.fit();
   const o=a.res.objects.get(3),mid=o.pts[Math.floor(o.pts.length/2)];m.steps.push({op:'pointOn',id:6,on:5,dist:String(Math.round(mid[0]+6)),unit:'mm',from:'start'});m.nextId=7;a.changed();});
 const box=await page.locator('#l7-design-frame').boundingBox();
 const [cx,cy]=await f.evaluate(()=>{const a=window.level7,o=a.res.objects.get(3),L=a.res.objects.get(5).pts[0][1];let b=o.pts[0];for(const p of o.pts)if(Math.abs(p[1]-L-25)<Math.abs(b[1]-L-25))b=p;return a.toScreen(b);});
 await page.mouse.move(box.x+cx,box.y+cy);await page.waitForTimeout(150);await page.mouse.dblclick(box.x+cx,box.y+cy);await page.waitForTimeout(200);
 let r=await f.evaluate(()=>({sel:window.level7.selectedStep,form:!!window.level7.form,handles:window.level7.curveHandles().length,bar:!!document.querySelector('.curve-bar.obj-bar [data-cedit]')}));
 assert(r.sel===2&&!r.form&&r.handles===2&&r.bar,JSON.stringify(r));pass('double-click on the curve (a point lies close beside it): the curve\'s handles and bar show, no window');
 await fr.locator('.curve-bar [data-cedit]').click();await fr.locator('#tool-box input[data-key="startAngle"]').waitFor();pass('✎ in the curve bar opens its values (directions, strength)');
 await fr.locator('#tool-box [data-cancel]').click();
 // inherited curve in a new part
 await f.evaluate(()=>{const a=window.level7;a.addPart();a.snapshot();a.model.steps.push({op:'inherit',part:1,items:[{src:3,dst:a.model.nextId}]});a.model.nextId++;a.changed();});
 await page.mouse.move(box.x+cx,box.y+cy);await page.waitForTimeout(150);await page.mouse.dblclick(box.x+cx,box.y+cy);
 await f.waitForFunction(()=>/موروث من البارت 001/.test(document.querySelector('#toast')?.textContent||''));pass('an inherited curve says it follows part 001 and is edited there');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
