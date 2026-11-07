// 0.9.141: ISO and PLT cutter files (Gerber ISO for Bullmer / FK / Yin) from a marker nested in another
// program (DXF). Usage: L7_SRC=<app dir> xvfb-run -a node test-0141-iso.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'iso-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
const g=(...kv)=>kv.map(String).join('\r\n');
const sq=(l,x0,y0,w,h)=>g(0,'LWPOLYLINE',8,l,90,4,70,1,10,x0,20,y0,10,x0+w,20,y0,10,x0+w,20,y0+h,10,x0,20,y0+h);
// a nested marker: block "FRONT" (outline, notch, drill, sewing line) placed twice, the second turned 90 degrees
const marker=g(0,'SECTION',2,'BLOCKS',0,'BLOCK',8,0,2,'FRONT',10,0,20,0,sq(1,0,0,300,500),0,'LINE',8,4,10,300,20,250,11,295,21,250,0,'POINT',8,13,10,150,20,250,sq(14,10,10,280,480),0,'ENDBLK',0,'ENDSEC',
 0,'SECTION',2,'ENTITIES',0,'INSERT',8,1,2,'FRONT',10,0,20,0,0,'INSERT',8,1,2,'FRONT',10,1000,20,0,50,90,0,'ENDSEC',0,'EOF')+'\r\n';
try{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'isof-'));await fs.chmod(dir,0o777);const inp=path.join(dir,'nested thobe.dxf'),out=path.join(dir,'nested thobe.iso');await fs.writeFile(inp,marker);
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForSelector('#tool-guide');
 await page.waitForSelector('.l7-design-cat');{const f0=page.frames().find(x=>x.url().includes('l7design'));await f0.waitForFunction(()=>!!window.level7);await f0.evaluate(()=>{const a=window.level7;a.__newDone=false;if(!a.__newWrapped){const o=a.newDesign.bind(a);a.newDesign=()=>{try{o();}finally{a.__newDone=true;}};a.__newWrapped=true;}});await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();await f0.waitForFunction(()=>window.level7.__newDone);} /* «new design» reaches the drawing by a message: wait for it before filling the model */await page.waitForSelector('.l7-design-cat');
 const fr=page.frameLocator('#l7-design-frame');
 await app.evaluate(({dialog},[i,o])=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[i]});dialog.showSaveDialog=async()=>({canceled:false,filePath:o});},[inp,out]);
 await page.locator('[data-l7d-command="iso"]').click();
 const win=fr.locator('.iso-win');await win.waitFor();const t=await win.innerText();
 assert(/القطع:\s*2/.test(t)&&t.includes('1000.0 × 500.0')&&/نوتشات: 2 · فتحات داخلية: 0 · ثقوب: 2/.test(t)&&/لا تُقص[^:]*: 2/.test(t),t);
 pass('marker DXF read: 2 pieces (one turned 90°), 1000 × 500 mm, 2 notches, 2 drill holes, 2 sewing lines not cut');
 await page.screenshot({path:'shot-0141-iso.png'});
 await win.locator('[data-iso="save"]').click();for(let k=0;k<60&&!(await fs.stat(out).catch(()=>null));k++)await page.waitForTimeout(100);
 const iso=await fs.readFile(out,'utf8'),b=iso.replace(/\r\n/g,'').split('*').filter(Boolean);
 assert.deepEqual(b.slice(0,5),['H1','M20','nested thobe/L=1000.0/W=500.0','N1','G71']);assert.equal(b.at(-1),'M0');
 assert.equal(b.filter(s=>s==='M43').length,2);assert.equal(b.filter(s=>s==='M14').length,4);assert(b.includes('X3000Y5000')&&b.includes('X10000Y0'),iso.slice(0,400));
 pass('ISO saved: H1 / M20 / N / G71 header, 2 drills (M43), 2 notch slits + 2 outlines (M14), 0.1 mm units, M0 at the end');
 const outP=path.join(dir,'nested thobe cut.plt');await app.evaluate(({dialog},o)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:o});},outP);
 await win.locator('[data-iso="plt"]').click();for(let k=0;k<60&&!(await fs.stat(outP).catch(()=>null));k++)await page.waitForTimeout(100);
 const plt=await fs.readFile(outP,'utf8');
 assert(plt.startsWith('IN;SP1;')&&plt.includes('SP2;')&&plt.trimEnd().endsWith('PU;SP0;'),plt.slice(0,200));
 assert.equal((plt.split('SP2')[0].match(/PD/g)||[]).length,4);// pen 1: 2 notch slits + 2 outlines
 pass('PLT saved from the same window: pen 1 cut lines (2 notches + 2 outlines), pen 2 sewing lines and drill crosses');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
