// 0.9.191: the double-click on a piece's outer (cut) line opens the seam allowance bar also while a drawing
// tool is active (tools stay on while working, as GRAFIS): the tool's clicks there are dropped (no window,
// no new step); a piece tool (notch) keeps its own clicks.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0191-dbl-seam.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ds-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 const box=await page.locator('#l7-design-frame').boundingBox(),at=async(x,y)=>{const[sx,sy]=await f.evaluate(([x,y])=>window.level7.toScreen([x,y]),[x,y]);return[box.x+sx,box.y+sy];};
 await f.evaluate(()=>{localStorage.removeItem('level7.barPos');const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;m.images=[];
   m.steps=[{op:'point',id:20,x:'0',y:'-300'},{op:'point',id:21,x:'200',y:'-300'},{op:'point',id:22,x:'200',y:'-150'},{op:'point',id:23,x:'0',y:'-150'},
   {op:'line',id:24,p1:{obj:20},p2:{obj:21}},{op:'line',id:25,p1:{obj:21},p2:{obj:22}},{op:'line',id:26,p1:{obj:22},p2:{obj:23}},{op:'line',id:27,p1:{obj:23},p2:{obj:20}}];m.nextId=28;
   m.pieces=[{id:1,name:'p',quantity:1,fabric:'',edges:[24,25,26,27],seam:['10','10','10','10'],notches:[],grain:'90'}];a.selectedStep=-1;a.changed();a.fit();});
 const tool=async(cat,key)=>{await page.locator(`[data-l7d-cat="${cat}"]`).click({button:'right'});await page.locator(`[data-l7d-tool="${key}"]`).click();await f.waitForFunction(k=>window.level7.tool?.key===k,key);};
 const off=()=>f.evaluate(()=>{window.level7.endSeamTool();});
 for(const[cat,key,where] of [['الخطوط','lineAngle',[100,-310]],['النقاط','point',[210,-220]],['الخطوط','line',[100,-140]]]){
  const n0=await f.evaluate(()=>window.level7.model.steps.length);
  await tool(cat,key);await page.mouse.dblclick(...await at(...where));await fr.locator('.seam-bar').waitFor();
  // 0.9.195: the window that opens is the edge's own seam allowance (not the tool's values window)
  const r=await f.evaluate(()=>({tool:window.level7.tool?.key??null,form:/مسافة خياطة/.test(document.querySelector('#tool-box h4')?.textContent||''),n:window.level7.model.steps.length}));
  assert.deepEqual(r,{tool:null,form:true,n:n0},key+' '+JSON.stringify(r));
  await f.evaluate(()=>window.level7.closeForm());
  pass(`with the «${key}» tool active, a double-click on the cut line opens the seam allowance bar and that edge's value (tool ended, no tool window, no new step)`);
  await off();
 }
 // a piece tool keeps its clicks: the notch tool on the cut line does not jump to the seam bar
 await tool('القطع','notch');const isNotch=true;
 if(isNotch){await page.mouse.dblclick(...await at(100,-310));await page.waitForTimeout(300);
  assert.equal(await fr.locator('.seam-bar').count(),0);pass('with the notch tool (a piece tool) the double-click stays with the tool');}
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
