// 0.9.169: a click on a dimension makes it active and shows its bar: a note before the value, the
// text on the other side, text size, unit (mm / cm / inch), ×2 / ×4.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0171-dim-bar.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 await f.evaluate(()=>{const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;delete m.lineStyles;m.pieces=[];a.vis.dims=true;m.unit='mm';
   m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'lineAngle',id:2,start:{obj:1},angle:'0',length:'230'},{op:'dim',kind:'length',obj:2,offset:'-30'}];m.nextId=3;a.selectedStep=-1;a.changed();a.fit();});
 const box=await page.locator('#l7-design-frame').boundingBox();
 const p=await f.evaluate(()=>{const a=window.level7,h=a.dimHits[0].pts;return h[Math.floor(h.length/2)]??h[0];});
 const q=await f.evaluate(()=>{const a=window.level7,h=a.dimHits[0].pts;return[(h[0][0]+h[h.length-1][0])/2,(h[0][1]+h[h.length-1][1])/2];});
 await page.mouse.move(box.x+q[0],box.y+q[1]);await page.mouse.click(box.x+q[0],box.y+q[1]);
 const bar=fr.locator('.curve-bar.dim-bar');await bar.waitFor();assert.equal(await f.evaluate(()=>window.level7.selectedStep),2);
 pass('a click on the dimension (without dragging) makes it active and shows its bar');
 const txt=()=>f.evaluate(()=>document.querySelector('#canvas .dim-text')?.textContent.replace(/[⁦-⁩]/g,''));
 await bar.locator('input[data-dk="text"]').fill('الصدر');await bar.locator('input[data-dk="text"]').press('Enter');
 await bar.locator('select[data-dk="unit"]').selectOption('cm');await bar.locator('select[data-dk="mult"]').selectOption('2');await bar.locator('select[data-dk="size"]').selectOption('18');
 let t=await txt();assert.equal(t,'الصدر 46 cm (×2)');
 const fsz=await f.evaluate(()=>getComputedStyle(document.querySelector('#canvas .dim-text')).fontSize);assert.equal(fsz,'18px');
 pass(`note «الصدر», unit cm, ×2, size 18: the dimension reads «${t}» at 18px`);
 await bar.locator('[data-da="flip"]').click();assert.equal(await f.evaluate(()=>window.level7.model.steps[2].flip),'1');pass('⇵ puts the text on the other side');
 await bar.locator('select[data-dk="unit"]').selectOption('in');t=await txt();assert(/″ \(×2\)$/.test(t),t);pass(`inch: «${t}»`);
 await f.evaluate(()=>window.level7.undo());assert.equal(await f.evaluate(()=>window.level7.model.steps[2].unit),'cm');pass('each option is one undo step');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
