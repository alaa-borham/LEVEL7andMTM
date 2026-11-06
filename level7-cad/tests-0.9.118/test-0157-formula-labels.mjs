// 0.9.157: a click on a line / curve selects it and writes on the drawing the formulas it is built on
// (as GRAFIS): at the start the distance on the line it starts from and its angle, at the end its length;
// a click on empty space clears it.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0157-formula-labels.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 await f.evaluate(()=>{const a=window.level7,m=a.model;a.snapshot();m.variables=[{id:9,name:'الكتف',expr:'225'},{id:17,name:'نزول',expr:'65'}];
   m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'lineAngle',id:2,start:{obj:1},angle:'-90',length:'500'},{op:'pointOn',id:3,on:2,dist:'Z17',unit:'mm',from:'start'},
   {op:'lineAngle',id:4,start:{obj:3},angle:'0',length:'Z9'},{op:'point',id:5,x:'0',y:'-300'},{op:'pointOn',id:6,on:4,dist:'100',unit:'mm',from:'start'},{op:'curve',id:7,through:[{obj:5},{obj:6}],startAngle:'0',endAngle:'90'}];
   m.nextId=8;a.selectedStep=-1;a.changed();a.fit();});
 const box=await page.locator('#l7-design-frame').boundingBox();
 const labels=()=>f.evaluate(()=>[...document.querySelectorAll('text.formula-label')].map(t=>t.textContent.replace(/[\u2066-\u2069]/g,'')));
 assert.equal((await labels()).length,0);
 // 1) click on line 4 (horizontal, y = -65), away from the curve
 const [lx,ly]=await f.evaluate(()=>window.level7.toScreen([180,-65]));await page.mouse.click(box.x+lx,box.y+ly);
 assert.equal((await labels()).length,0); // 0.9.163: a single click makes nothing active
 await page.mouse.move(box.x+lx,box.y+ly);await page.waitForTimeout(150);await page.mouse.dblclick(box.x+lx,box.y+ly);await fr.locator('#tool-box [data-cancel]').click();
 let l=await labels();assert.equal(await f.evaluate(()=>window.level7.selectedStep),3);
 assert(l.includes('Z17 نزول=65')&&l.includes('Z9 الكتف=225')&&l.some(t=>/^∠ 0°$/.test(t)),JSON.stringify(l));
 const order=await f.evaluate(()=>{const t=[...document.querySelectorAll('text.formula-label')].find(x=>x.textContent.includes('الكتف'));const s=t.textContent,x=i=>t.getStartPositionOfChar(i).x;return[x(s.indexOf('Z')),x(s.indexOf('ا')),x(s.indexOf('ف')),x(s.lastIndexOf('5'))];});
 assert(order[0]<order[2]&&order[2]<order[1]&&order[1]<order[3],'reads Z9 الكتف=225 from left to right: '+order);
 pass(`a double-click on the line shows its formulas on the drawing: ${l.join(' | ')}`);
 // 2) click on empty space clears them
 const [ex,ey]=await f.evaluate(()=>window.level7.toScreen([150,-250]));await page.mouse.click(box.x+ex,box.y+ey);
 assert.equal((await labels()).length,0);pass('a click on empty space clears the selection and its formulas');
 // 3) the curve: its end on line 4 shows "100"
 const mid=await f.evaluate(()=>{const o=window.level7.res.objects.get(7);return window.level7.toScreen(o.pts[Math.floor(o.pts.length/2)]);});
 await page.mouse.move(box.x+mid[0],box.y+mid[1]);await page.waitForTimeout(150);await page.mouse.dblclick(box.x+mid[0],box.y+mid[1]);l=await labels();
 assert(await f.evaluate(()=>window.level7.selectedStep)===6&&l.includes('100'),JSON.stringify(l));pass(`a double-click on the curve shows the formula of its end: ${l.join(' | ')}`);
 // 4) while the step window is open (double-click edit) the formulas stay on the drawing
 await f.evaluate(()=>window.level7.editStep(3));l=await labels();assert(l.includes('Z9 الكتف=225'),JSON.stringify(l));pass('the formulas also show while the step is being edited');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
