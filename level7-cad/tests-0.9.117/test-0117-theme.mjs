// 0.9.117 dark theme: dark by default, View menu switches to light and back, the choice
// is remembered after a restart, and the X window is readable (dark background, light text).
// Usage: L7_SRC=<app dir> [L7_EXE=<packaged exe>] xvfb-run -a node test-0117-theme.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC,exe=process.env.L7_EXE||path.join(src,'node_modules/electron/dist/electron'),args=process.env.L7_EXE?['--no-sandbox']:['--no-sandbox',src];
const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'l7theme-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0;
const launch=async()=>{const app=await _electron.launch({executablePath:exe,args,env,timeout:60000});const page=await app.firstWindow();page.setDefaultTimeout(20000);await page.waitForSelector('#tool-guide');await page.waitForSelector('.l7-design-cat');await page.locator('[data-l7d="close"]').click();await page.waitForFunction(()=>!document.body.classList.contains('l7-design-on')); /* 0.9.148: the program starts in LEVEL7 design; these steps test the MDL workspace */return{app,page};};
const lum=c=>{const m=c.match(/\d+(\.\d+)?/g).map(Number);return(0.2126*m[0]+0.7152*m[1]+0.0722*m[2])/255;};
const toggle=async page=>{await page.locator('.menubar summary',{hasText:'View'}).click();await page.locator('#menu-theme-toggle').click();};
try{
 let {app,page}=await launch();
 // Reset to the default (dark) whatever an earlier run left behind.
 await page.evaluate(()=>{try{localStorage.removeItem('level7.theme')}catch{}});await app.close();({app,page}=await launch());
 assert(await page.evaluate(()=>document.body.classList.contains('ui-dark')));assert(lum(await page.evaluate(()=>getComputedStyle(document.querySelector('aside.command-panel')).backgroundColor))<0.2);pass('dark theme by default');
 await page.locator('#cad-toolbox [data-action="new-template"]').click();await page.locator('#cad-toolbox [data-action="x-values"]').click();
 const bg=await page.evaluate(()=>getComputedStyle(document.querySelector('#x-values-dialog')).backgroundColor),fg=await page.evaluate(()=>getComputedStyle(document.querySelector('#x-values-dialog .dialog-body')).color);
 assert(lum(bg)<0.25&&lum(fg)>0.6,bg+' '+fg);pass('X window is dark with light text');await page.locator('#x-values-dialog [data-action="close-dialog"]').first().click();
 await toggle(page);assert(!await page.evaluate(()=>document.body.classList.contains('ui-dark')));pass('View menu switches to light');
 await app.close();({app,page}=await launch());assert(!await page.evaluate(()=>document.body.classList.contains('ui-dark')));pass('light choice is remembered after restart');
 await toggle(page);assert(await page.evaluate(()=>document.body.classList.contains('ui-dark')));pass('View menu switches back to dark');await app.close();
}catch(e){failed=1;console.error(e);}
process.exit(failed);
