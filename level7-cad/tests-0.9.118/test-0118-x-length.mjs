// 0.9.118: an X value above 1000 mm (N38 template) is accepted and appears in the Line 10 length source list;
// a zero X is listed greyed out with the reason. Usage: L7_SRC=<app dir> xvfb-run -a node test-0118-x-length.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC||'/home/user/work/dev';const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'rx-'))};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForSelector('#tool-guide');await page.waitForSelector('.l7-design-cat');await page.evaluate(()=>window.l7ShowMdlWorkspace());await page.waitForFunction(()=>!document.body.classList.contains('l7-design-on')); /* 0.9.148: the program starts in LEVEL7 design; these steps test the MDL workspace */
page.on('pageerror',e=>console.log('ERR',e.message));
await page.locator('#cad-toolbox [data-action="new-template"]').click();
await page.locator('#cad-toolbox [data-action="x-values"]').click();
await page.locator('#x-table-add').click().catch(e=>console.log('noadd',e.message));
await page.waitForTimeout(500);
page.on('dialog',d=>{console.log('DIALOG',d.message());d.dismiss().catch(()=>{})});
await page.getByText('Edit X1…').click();await page.waitForTimeout(300);
console.log(await page.evaluate(()=>[...document.querySelectorAll('#x-values-dialog input')].filter(b=>b.offsetParent).map(b=>b.id+'|'+b.className+'|'+b.value).join('\n')));
const inp=page.locator('#x-values-dialog tr input, #x-values-dialog .x-entry input').last();
await page.keyboard.press('Control+A');await page.keyboard.type(process.env.X_VALUE||'1500');

const ap=page.getByRole('button',{name:'Apply',exact:true});console.log('apply',await ap.count());if(await ap.count())await ap.first().click();else await page.keyboard.press('Enter');
await page.waitForTimeout(800);
console.log('status',await page.evaluate(()=>document.querySelector('#status-text')?.textContent));
await page.locator('#x-values-dialog [data-action="close-dialog"]').last().click();
await page.locator('[data-tool-category="points"]').click();await page.waitForTimeout(300);
await page.locator('[data-tool-category-panel="points"] [data-points-menu-option="line10"]').click();await page.waitForTimeout(300);
const c=await page.locator('#canvas-frame svg').first().boundingBox();await page.mouse.click(c.x+c.width/2,c.y+c.height/2);await page.waitForTimeout(800);
console.log('OPTIONS',await page.evaluate(()=>[...document.querySelectorAll('#line10-length-source option')].map(o=>o.textContent+(o.disabled?' [disabled]':'')).join(' | ')));

console.log(await page.evaluate(()=>[...document.querySelectorAll('[data-tool-category-panel="points"] button')].filter(b=>b.offsetParent).map(b=>(b.dataset.action||b.dataset.pointsMenuOption||'')+'|'+b.title+'|'+b.disabled).join('\n')));
const opts=await page.evaluate(()=>[...document.querySelectorAll('#line10-length-source option')].map(o=>o.textContent+(o.disabled?' [disabled]':'')));
const want=(process.env.X_VALUE||'1500')==='0'?'X1 = 0 · أدخل قيمة أكبر من صفر [disabled]':'X1 = 1500 mm';
await app.close();if(!opts.includes(want)){console.error('FAIL',opts);process.exit(1);}console.log('PASS Line 10 length list shows',want);process.exit(0); // nothing may keep node waiting after the app closed
