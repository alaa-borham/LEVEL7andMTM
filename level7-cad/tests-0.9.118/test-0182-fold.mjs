// 0.9.182: folded piece (as GRAFIS mirrored piece): the fold is chosen on the pieces page, there is no
// seam allowance on it, the cut line is opened out about it (also in the AAMA export), the sewing line is
// shown on the drawn half with the fold dash-dotted; pieces in GRAFIS colours (blue cut line, sewing line,
// red notches, no fill).
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0182-fold.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 await f.evaluate(()=>{localStorage.removeItem('level7.barPos');localStorage.removeItem('level7.formMini');const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;delete m.lineStyles;m.images=[];
   m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'point',id:2,x:'100',y:'0'},{op:'point',id:3,x:'100',y:'200'},{op:'point',id:4,x:'0',y:'200'},
   {op:'line',id:5,p1:{obj:1},p2:{obj:2}},{op:'line',id:6,p1:{obj:2},p2:{obj:3}},{op:'line',id:7,p1:{obj:3},p2:{obj:4}},{op:'line',id:8,p1:{obj:4},p2:{obj:1}}];
   m.nextId=9;m.names={6:'CF'};m.pieces=[{id:1,name:'p',quantity:1,fabric:'',edges:[5,6,7,8],seam:['10','10','10','10'],notches:[{obj:4}],grain:'90'}];a.selectedStep=-1;a.changed();a.fit();});
 // colours as GRAFIS
 const look=await f.evaluate(()=>{const p=[...document.querySelectorAll('#canvas > polygon')];const cs=getComputedStyle(document.body);return{n:p.length,cut:p[0]?.getAttribute('stroke'),sew:p[1]?.getAttribute('stroke'),dash:p[1]?.getAttribute('stroke-dasharray'),fill:cs.getPropertyValue('--piece-fill').trim(),notch:document.querySelector('#canvas > polyline[stroke="var(--piece-notch)"]')?1:0};});
 assert(look.n===2&&look.cut==='var(--piece-cut)'&&look.sew==='var(--piece-sew)'&&look.dash===null&&look.fill==='transparent'&&look.notch===1,JSON.stringify(look));
 pass('pieces in GRAFIS colours: blue cut line, solid sewing line, red notch, no fill');
 // fold on the pieces page
 await page.locator('[data-l7d-command="tab-pieces"]').click();const sel=fr.locator('.piece-card select[data-pfold]');await sel.waitFor();
 assert.equal(await sel.locator('option').count(),5);await sel.selectOption('6');
 await f.waitForFunction(()=>window.level7.model.pieces[0].fold===6);
 const g=await f.evaluate(()=>{const g=window.level7.res.pieces.get(1);return{xs:g.cut.map(p=>p[0]),notches:g.notches.length,half:Math.max(...g.fold.halfSew.map(p=>p[0])),fold:!!document.querySelector('#canvas > polyline[stroke-dasharray="14 4 2 4"]')};});
 assert(Math.abs(Math.min(...g.xs)+10)<1e-6&&Math.abs(Math.max(...g.xs)-210)<1e-6&&g.notches===2&&g.half===100&&g.fold,JSON.stringify(g));
 pass('fold «CF» chosen on the pieces page: cut line opened out (−10 … 210), notch mirrored, sewing line on the drawn half, fold dash-dotted');
 // the export takes the opened-out piece: the AAMA boundary spans the whole width
 const w=await f.evaluate(()=>{const g=window.level7.res.pieces.get(1);const xs=g.cut.map(p=>p[0]);return Math.max(...xs)-Math.min(...xs);});
 assert(Math.abs(w-220)<1e-6);pass('the piece is cut / exported whole: 220 mm wide (2 × 100 + 2 × 10)');
 await sel.selectOption('');await f.waitForFunction(()=>window.level7.model.pieces[0].fold===undefined);
 const mx=await f.evaluate(()=>Math.max(...window.level7.res.pieces.get(1).cut.map(p=>p[0])));assert(Math.abs(mx-110)<1e-6,String(mx));pass('fold «— بدون —»: back to the plain piece');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
