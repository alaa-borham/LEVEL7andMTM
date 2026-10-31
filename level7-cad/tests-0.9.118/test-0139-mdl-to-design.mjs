// 0.9.139: the parts of an open MDL become parts of a LEVEL7 design (stored geometry of the
// base size as fixed points / lines / curves); the MDL is not changed.
// Usage: L7_SRC=<app dir> L7_MDL=<file.mdl> xvfb-run -a node test-0139-mdl-to-design.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC,mdl=process.env.L7_MDL;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'md-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 const before=await fs.readFile(mdl);
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(60000);await page.waitForSelector('#tool-guide');
 await app.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},mdl);
 await page.locator('.empty-actions [data-action="open"]').click();await page.waitForFunction(()=>window.l7MdlBridge?.available()&&window.l7MdlBridge.parts().length>0,null,{timeout:120000});
 const nParts=await page.evaluate(()=>window.l7MdlBridge.parts().length);
 await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-from-mdl').click();
 await page.waitForSelector('#l7-design:not([hidden])');const f=page.frames().find(x=>x.url().includes('l7design'));
 await f.waitForFunction(()=>window.level7?.model?.parts?.length>1,null,{timeout:120000});
 const r=await f.evaluate(()=>{const a=window.level7;return{parts:a.model.parts.length,objs:a.model.parts.reduce((s,p)=>s+p.steps.length,0),first:a.model.parts[0].name,errors:a.res.stepErrors.size,drawn:a.res.objects.size};});
 assert(r.parts>=10&&r.objs>100&&r.errors===0&&r.drawn>0,JSON.stringify(r));
 pass(`MDL with ${nParts} parts → LEVEL7 design with ${r.parts} parts and ${r.objs} elements (first part «${r.first}», no errors)`);
 const k=await f.evaluate(()=>window.level7.model.parts.findIndex(p=>p.steps.length>20));await f.evaluate(k=>window.level7.switchPart(k),k);
 const sw=await f.evaluate(()=>({n:window.level7.res.objects.size,lines:[...window.level7.res.objects.values()].filter(o=>o.kind==='line').length}));assert(sw.n>20&&sw.lines>5);
 await page.screenshot({path:'shot-0139-mdl.png'});
 pass(`a converted part opens with ${sw.n} elements (${sw.lines} lines / curves) and can be drawn on`);
 // keep working on it: a parallel to one of its curves
 const ok=await f.evaluate(()=>{const a=window.level7,c=[...a.res.objects.values()].find(o=>o.kind==='line'&&o.pts.length>2);if(!c)return false;a.model.steps.push({op:'parallel',id:a.model.nextId++,of:c.id,dist:'10',side:1});a.changed();return !a.res.stepErrors.has(a.model.steps.length-1);});
 assert(ok);pass('LEVEL7 tools work on the converted geometry (parallel 10 mm to a GRAFIS curve)');
 assert((await fs.readFile(mdl)).equals(before));pass('the MDL file is unchanged');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
