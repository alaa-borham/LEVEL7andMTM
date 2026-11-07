// 0.9.146: grading view (as GRAFIS): command-bar button "Grading": all sizes stacked → side by
// side in rows and columns with name and measures → off. Usage: L7_SRC=<app dir> xvfb-run -a node test-0146-grading.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'gr-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForSelector('#tool-guide');
 await page.waitForSelector('.l7-design-cat');{const f0=page.frames().find(x=>x.url().includes('l7design'));await f0.waitForFunction(()=>!!window.level7);await f0.evaluate(()=>{const a=window.level7;a.__newDone=false;if(!a.__newWrapped){const o=a.newDesign.bind(a);a.newDesign=()=>{try{o();}finally{a.__newDone=true;}};a.__newWrapped=true;}});await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();await f0.waitForFunction(()=>window.level7.__newDone);} /* «new design» reaches the drawing by a message: wait for it before filling the model */await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design'));await f.waitForFunction(()=>!!window.level7);
 await f.evaluate(()=>{const a=window.level7,m=a.model;m.measurements=[{id:1,name:'w',value:390},{id:2,name:'h',value:300}];m.sizes=[350,375,370,360,380,385,395,400,410].map((v,k)=>({name:(52+k)+'-S',step:k+1,values:{1:v,2:280+k*5}}));
  m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'point',id:2,x:'X1',y:'0'},{op:'point',id:3,x:'X1',y:'X2'},{op:'point',id:4,x:'0',y:'X2'},{op:'line',id:5,p1:{obj:1},p2:{obj:2}},{op:'line',id:6,p1:{obj:2},p2:{obj:3}},{op:'line',id:7,p1:{obj:3},p2:{obj:4}},{op:'line',id:8,p1:{obj:4},p2:{obj:1}}];m.nextId=9;a.changed();a.fit();});
 const g=page.locator('[data-l7d-command="gradeview"]');
 await g.click();await f.waitForFunction(()=>window.level7.gradeView==='stack');
 const stackLines=await f.evaluate(()=>document.querySelectorAll('#canvas polyline[stroke]').length);assert(stackLines>=40,String(stackLines));
 pass(`click 1: all 10 sizes stacked on each other (${stackLines} coloured lines)`);
 await g.click();await f.waitForFunction(()=>window.level7.gradeView==='side');
 const side=await f.evaluate(()=>{const t=[...document.querySelectorAll('#canvas text')].map(x=>x.textContent);const sh=window.level7.sideShifts();return{t,rows:new Set(sh.map(p=>p[1])).size,cols:new Set(sh.map(p=>p[0])).size};});
 assert(side.t.some(s=>s.includes('52-S'))&&side.t.some(s=>s.includes('60-S'))&&side.t.some(s=>s.includes('410.0 × 320.0'))&&side.rows>1,JSON.stringify(side));
 pass(`click 2: side by side in ${side.rows} rows × ${side.cols} columns, each with its name and measures (60-S: 410.0 × 320.0)`);
 await g.click();await f.waitForFunction(()=>window.level7.gradeView==='off');assert.equal(await f.evaluate(()=>document.querySelectorAll('#canvas polyline[stroke][opacity]').length),0);
 pass('click 3: back to the current size only');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
