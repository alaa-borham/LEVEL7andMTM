// 0.9.180 audit fixes: deleting a part drops its line styles (a later part with the same number does not
// inherit them); a note set from the dimension bar while its values window is open survives the window's OK;
// digit tool shortcuts work with an Arabic keyboard (key ٧, place Digit7).
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0178-audit.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.accept());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 await f.evaluate(()=>{localStorage.removeItem('level7.formMini');window.level7.formMini=false;const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;m.lineStyles={};m.pieces=[];a.vis.dims=true;
   m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'lineAngle',id:2,start:{obj:1},angle:'0',length:'230'},{op:'dim',kind:'length',obj:2,offset:'-20'}];m.nextId=3;a.selectedStep=-1;a.changed();a.fit();});
 // 1) part 002 gets a red line, is deleted; the next new part (number 2 again) has no style
 const r1=await f.evaluate(()=>{const a=window.level7;a.addPart();a.model.lineStyles['2:5']={color:'#ff0000'};a.deletePart(1);a.addPart();return{no:a.model.parts.at(-1).no,keys:Object.keys(a.model.lineStyles)};});
 assert(r1.no===2&&!r1.keys.some(k=>k.startsWith('2:')),JSON.stringify(r1));pass('deleting part 002 drops its line styles; the new part 002 starts plain');
 await f.evaluate(()=>window.level7.switchPart(0));
 // 2) dimension values window open + a note from the bar, then OK: the note stays
 await f.evaluate(()=>window.level7.editStep(2));const bar=fr.locator('.curve-bar.dim-bar');await bar.waitFor();
 await bar.locator('input[data-dk="text"]').fill('صدر');await bar.locator('input[data-dk="text"]').press('Enter');
 await fr.locator('#tool-box [data-ok]').click();
 assert.equal(await f.evaluate(()=>window.level7.model.steps[2].text),'صدر');pass('a note set from the bar while the values window is open survives its OK');
 // 3) digit shortcut with an Arabic keyboard: ٧ on the place of 7 → «قص / تمديد لحد»
 await f.evaluate(()=>{window.level7.cancelTool();document.querySelector('#canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'٧',code:'Digit7',bubbles:true}));});
 await f.waitForFunction(()=>window.level7.tool?.key==='trim',null,{timeout:5000});pass('digit shortcut 7 with an Arabic keyboard (٧) opens «قص / تمديد لحد»');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
