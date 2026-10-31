import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src='/home/user/work/dev';const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'sh-'))};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();await page.waitForSelector('#tool-guide');
await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setMinimumSize(800,600);w.setSize(1280,720);});await page.waitForTimeout(500);
await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();await page.waitForSelector('.l7-design-cat');
const f=page.frames().find(x=>x.url().includes('l7design'));await f.evaluate(()=>document.querySelector('.actions [data-action="demo"]').click());await page.waitForTimeout(800);
await page.locator('[data-l7d-cat="الزوايا"]').click();await page.waitForTimeout(300);
console.log(await page.evaluate(()=>{const t=document.querySelector('.l7-design-tools');return{scroll:t.scrollHeight,client:t.clientHeight,card:getComputedStyle(document.querySelector('#l7-design')).getPropertyValue('--l7d-card')}}));
await page.screenshot({path:'shot-0118-design-720.png'});await app.close();
