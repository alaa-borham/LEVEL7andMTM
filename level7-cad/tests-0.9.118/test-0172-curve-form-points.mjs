// 0.9.170: the values window of a curve (✎) also shows the points it passes through, with the Z values
// they were made with (e.g. its start on a line at Z14), and which line an end direction is measured from.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0172-curve-form-points.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 await f.evaluate(()=>{const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;delete m.lineStyles;m.pieces=[];
   m.variables=[{id:14,name:'فتحة الرقبة خلف',expr:'55'},{id:15,name:'أخرى',expr:'70'}];
   m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'lineAngle',id:2,start:{obj:1},angle:'90',length:'300'},{op:'pointOn',id:3,on:2,dist:'Z14',unit:'mm',from:'start'},
   {op:'point',id:4,x:'200',y:'-50'},{op:'curve',id:5,through:[{obj:3},{obj:4}],startAngle:'93',endAngle:'178',startRel:2}];m.names={2:'L14'};m.nextId=6;a.selectedStep=4;a.changed();a.fit();});
 await fr.locator('.curve-bar [data-cedit]').click();const tb=fr.locator('#tool-box');await tb.waitFor();
 const labels=await tb.locator('.field > span').allTextContents();
 // 0.9.173: only what was set with X / Z / a formula: the start distance Z14; no plain end coordinates, no unit / measured-from
 assert(labels.some(l=>/^البداية: المسافة/.test(l))&&labels.some(l=>/اتجاه البداية.*\(من L14\)/.test(l)),labels.join('|'));
 assert.equal(await tb.locator('input[data-key="p0:dist"]').inputValue(),'Z14');
 const keys=await tb.locator('[data-key]').evaluateAll(es=>es.map(e=>e.dataset.key));assert.deepEqual(keys,['startAngle','endAngle','startTension','endTension','p0:dist']);
 pass(`✎ of the curve is short: its 4 values and «البداية: المسافة = Z14» only (${keys.length} fields; the end with plain x / y is left out)`);
 await tb.locator('input[data-key="p0:dist"]').fill('Z15');await tb.locator('[data-ok]').click();
 const r=await f.evaluate(()=>{const a=window.level7;return{d:a.model.steps[2].dist,y:Math.round(a.res.objects.get(5).pts[0][1])};});
 assert(r.d==='Z15'&&r.y===70,JSON.stringify(r));pass('changing it to Z15 moves the curve start to 70 on the line');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
