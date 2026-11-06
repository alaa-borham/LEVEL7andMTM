// 0.9.148: the program starts in LEVEL7 design; the GRAFIS (MDL) commands are one button in the
// design command bar. Usage: L7_SRC=<app dir> xvfb-run -a node test-0148-start.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'st-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 await page.waitForFunction(()=>{const h=document.querySelector('.l7-design-cat');return h&&h.offsetParent!==null;});
 assert(await page.evaluate(()=>document.body.classList.contains('l7-design-on')));
 pass('the program opens straight into LEVEL7 design (no click)');
 // 0.9.177: the old MDL workspace is hidden: GRAFIS has one command (open a GRAFIS file and convert it), the
 // MDL-only File commands and the × are gone, and the design stays on
 await page.locator('[data-l7d-mdlbtn]').click();
 assert.deepEqual(await page.locator('.l7-mdl-menu [data-mdl-act]').evaluateAll(b=>b.map(x=>x.dataset.mdlAct)),['open']);await page.keyboard.press('Escape');await page.mouse.click(600,500);
 assert(await page.locator('[data-l7d="close"]').isHidden());
 assert(await page.evaluate(()=>['new-template','open-parametric-example'].every(a=>[...document.querySelectorAll(`[data-action="${a}"]`)].filter(b=>!b.closest('#cad-toolbox')).every(b=>b.hidden))));
 assert(await page.evaluate(()=>['menu-l7-design-show','menu-l7-design-from-mdl'].every(id=>document.getElementById(id)?.hidden!==false)));
 assert(await page.evaluate(()=>document.body.classList.contains('l7-design-on')));
 pass('GRAFIS → one command «فتح ملف GRAFIS وتحويله»; no × and no MDL-only File commands; the design stays on');
 // Export: one button with every export; the size page has no export buttons any more
 await page.locator('[data-l7d-expbtn]').click();const ex=await page.locator('.l7-exp-menu [data-l7d-command]').evaluateAll(b=>b.map(x=>x.dataset.l7dCommand));
 assert.deepEqual(ex,['aama','aamaAll','aamaGraded','plt','pltAll','dxf']);await page.keyboard.press('Escape');await page.mouse.click(600,500);
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');
 await page.locator('[data-l7d-command="tab-sizes"]').click();await fr.locator('[data-sizes-mlib]').waitFor();assert.equal(await fr.locator('[data-xall],[data-graded]').count(),0);
 pass('«Export» holds AAMA / PLT (current, all sizes), AAMA + RUL and DXF; the size page only has «مكتبة القياسات»');
 // the library: a new product with its measurements, made in the library itself
 await f.evaluate(()=>localStorage.removeItem('level7.mlib'));page.on('dialog',d=>d.accept());
 await fr.locator('[data-sizes-mlib]').click();const ml=fr.locator('.mlib-win');await ml.waitFor();await ml.locator('[data-ml="new"]').click();
 const me=fr.locator('.mlib-edit');await me.waitFor();await me.locator('[data-me="name"]').fill('ثوب سعودي كلاسيك');await me.locator('[data-me="base"]').fill('54');
 await me.locator('[data-me="addrow"]').click();await me.locator('[data-mn="0"]').fill('chest');await me.locator('[data-mv="0"]').fill('600');
 await me.locator('[data-me="addrow"]').click();await me.locator('[data-mn="1"]').fill('length');await me.locator('[data-mv="1"]').fill('1500');
 await me.locator('[data-me="addsize"]').click();await me.locator('[data-sn="0"]').fill('56');await me.locator('[data-sv="0:1"]').fill('620');
 await me.locator('[data-me="save"]').click();
 const lib=await f.evaluate(()=>JSON.parse(localStorage.getItem('level7.mlib')));
 assert(lib.length===1&&lib[0].name==='ثوب سعودي كلاسيك'&&lib[0].size==='54'&&lib[0].measurements.length===2&&lib[0].sizes[0].name==='56'&&lib[0].sizes[0].values[1]===620&&lib[0].sizes[0].values[2]===undefined,JSON.stringify(lib));
 pass('library: «منتج جديد» with 2 measurements and size 56 (chest 620, length = base) saved in the library only');
 await ml.locator('li[data-id] [data-ml="edit"]').click();await me.waitFor();await me.locator('[data-mv="1"]').fill('1520');await me.locator('[data-me="save"]').click();
 await f.waitForFunction(()=>JSON.parse(localStorage.getItem('level7.mlib'))[0].measurements[1].value===1520);
 await ml.locator('li[data-id] [data-ml="use"]').click();await f.waitForFunction(()=>window.level7.model.mlibFrom?.name==='ثوب سعودي كلاسيك'&&window.level7.model.measurements[1].value===1520);
 await f.evaluate(()=>localStorage.removeItem('level7.mlib'));
 pass('«✎ تعديل» changes a library product (length 1520); «استخدام» copies it into the design');
 await app.close();
 // a .level7 file given at start (as Windows does on a double-click) opens in the design
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dc-'));await fs.chmod(dir,0o777);const file=path.join(dir,'ثوب تجربة.level7');
 await fs.writeFile(file,JSON.stringify({version:1,name:'ثوب تجربة',measurements:[{id:1,name:'w',value:100}],variables:[],steps:[{op:'point',id:1,x:'0',y:'0'},{op:'point',id:2,x:'X1',y:'0'},{op:'line',id:3,p1:{obj:1},p2:{obj:2}}],nextId:4,names:{}}));await fs.chmod(file,0o666);
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src,file],env});const p2=await app.firstWindow();p2.setDefaultTimeout(15000);
 p2.on('dialog',d=>d.dismiss());await p2.waitForSelector('.l7-design-cat');const f2=p2.frames().find(x=>x.url().includes('l7design'));await f2.waitForFunction(()=>window.level7?.model?.name==='ثوب تجربة'&&window.level7.model.steps.length===3);
 pass('a «.level7» file passed to the program at start (double-click) opens directly in the design');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
