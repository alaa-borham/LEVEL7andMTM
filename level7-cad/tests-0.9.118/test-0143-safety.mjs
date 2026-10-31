// 0.9.143: the design is not lost: unsaved work survives a restart and is offered back before
// "New" replaces it; undo copies do not repeat picture data; deleting a used X asks first.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0143-safety.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'sf-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
const start=async()=>{app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForSelector('#tool-guide');return page;};
const newDesign=async page=>{await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();await page.waitForSelector('.l7-design-cat');const f=page.frames().find(x=>x.url().includes('l7design'));await f.waitForFunction(()=>!!window.level7);return f;};
try{
 let page=await start();let f=await newDesign(page);
 await f.evaluate(()=>{const a=window.level7,m=a.model;m.name='work';m.measurements.push({id:1,name:'chest',value:100});m.steps.push({op:'point',id:1,x:'X1',y:'0'},{op:'point',id:2,x:'0',y:'50'});m.nextId=3;a.changed();});
 await page.waitForTimeout(300);await app.close();
 // restart: the first "New" offers the unsaved design back
 page=await start();const msgs=[];page.on('dialog',d=>{msgs.push(d.message());d.message().includes('استرجاعه')?d.accept():d.dismiss();});
 f=await newDesign(page);await page.waitForTimeout(300);
 const kept=await f.evaluate(()=>({name:window.level7.model.name,steps:window.level7.model.steps.length}));
 assert(msgs.some(m=>m.includes('«work»')&&m.includes('استرجاعه')),JSON.stringify(msgs));assert.deepEqual(kept,{name:'work',steps:2});
 pass('after a restart, "New" offers the unsaved design «work» back; accepted → its 2 steps are still there');
 // the next "New" asks to save first; dismissed → continues with an empty design
 msgs.length=0;await newDesign(page);await page.waitForTimeout(300);
 assert(msgs.some(m=>m.includes('حفظ التصميم «work»')),JSON.stringify(msgs));assert.equal(await f.evaluate(()=>window.level7.model.steps.length),0);
 pass('"New" with unsaved work asks to save it first; "continue without saving" → empty design (Ctrl+Z brings it back)');
 // undo copies keep one copy of a 3 MB picture
 const sizes=await f.evaluate(()=>{const a=window.level7,big='data:image/png;base64,'+'A'.repeat(3e6);a.snapshot();a.model.images=[{id:1,name:'scan',data:big,x:0,y:0,w:100,h:100,opacity:.5,visible:true}];a.changed();
  for(let k=0;k<30;k++){a.snapshot();a.model.steps.push({op:'point',id:k+1,x:String(k),y:'0'});a.model.nextId=k+2;a.changed();}
  const total=a.undoStack.reduce((s,x)=>s+x.length,0);for(let k=0;k<30;k++)a.undo();return{total,img:a.model.images?.[0]?.data.length,steps:a.model.steps.length};});
 assert(sizes.total<2e5&&sizes.img===3e6+22&&sizes.steps===0,JSON.stringify(sizes));
 pass(`30 undo copies with a 3 MB picture take ${Math.round(sizes.total/1000)} KB (not 90 MB); undo brings the picture back intact`);
 // deleting an X that a formula uses asks first
 await f.evaluate(()=>{const a=window.level7;a.model.images=[];a.model.measurements=[{id:1,name:'chest',value:100}];a.model.steps=[{op:'point',id:1,x:'X1/2',y:'0'}];a.model.nextId=2;a.changed();});
 await page.locator('[data-l7d-command="tab-x"]').click();const fr=page.frameLocator('#l7-design-frame');await fr.locator('[data-xa="del"]').first().waitFor();
 
 msgs.length=0;await fr.locator('tr[data-row="0"] input').first().focus();await fr.locator('[data-xa="del"]').first().click();await page.waitForTimeout(200);
 assert(msgs.some(m=>m.includes('X1')&&m.includes('مستخدمة في 1')),JSON.stringify(msgs));assert.equal(await f.evaluate(()=>window.level7.model.measurements.length),1);
 pass('deleting X1 used by a formula asks first (cancel keeps it)');
 // a design saved to a file: "New" no longer asks
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sfs-'));await fs.chmod(dir,0o777);const out=path.join(dir,'work.level7.json');
 await app.evaluate(({dialog},o)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:o});},out);
 await page.locator('.l7-design-bar [data-l7d-command="save"]').click();for(let k=0;k<60&&!(await fs.stat(out).catch(()=>null));k++)await page.waitForTimeout(100);
 await page.waitForTimeout(300);msgs.length=0;await newDesign(page);await page.waitForTimeout(300);
 assert.equal(msgs.length,0,JSON.stringify(msgs));assert.equal(JSON.parse(await fs.readFile(out,'utf8')).steps.length,1);
 pass('after the program confirms the file was written (Ctrl+S), "New" does not ask again');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
