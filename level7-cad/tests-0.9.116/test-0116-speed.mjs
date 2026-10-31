// 0.9.116 speed check: open a large GRAFIS file, switch parts, zoom and move the mouse.
// Usage: xvfb-run -a node test-0116-speed.mjs <app-dir> <file.mdl>. Prints times in ms;
// fails if opening takes over 10 s or a part switch averages over 3 s (software rendering).
import path from'node:path';import fs from'node:fs/promises';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.argv[2],mdl=process.argv[3],qa=await fs.mkdtemp(path.join((await import('node:os')).tmpdir(),'l7speed-'));const env={...process.env,LOCALAPPDATA:path.join(qa,'profile')};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:process.env.L7_EXE||path.join(src,'node_modules/electron/dist/electron'),args:['--no-sandbox',src],env,timeout:60000});const page=await app.firstWindow();page.setDefaultTimeout(60000);await page.setViewportSize({width:1600,height:950});
await page.waitForTimeout(1500);
await app.evaluate(({dialog},f)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[f]});},mdl);
let t=Date.now();await page.locator('#cad-toolbox [data-action="open"]').click();await page.waitForFunction(()=>/\.mdl/i.test(document.querySelector('#document-name').textContent));await page.waitForTimeout(200);const open=Date.now()-t;
const items=page.locator('[data-part-id], .part-item');const n=Math.min(6,await items.count());
t=Date.now();for(let i=0;i<n;i++){await items.nth(i).click();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}const sw=Date.now()-t;
const box=await page.locator('#native-canvas').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
t=Date.now();for(let i=0;i<30;i++){await page.mouse.wheel(0,i%2?-120:120);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}const zoom=Date.now()-t;
t=Date.now();for(let i=0;i<40;i++){await page.mouse.move(box.x+100+i*10,box.y+200+i*5);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));}const move=Date.now()-t;
console.log(JSON.stringify({src:path.basename(src),open,switchParts:sw,parts:n,zoom30:zoom,mouse40:move}));await app.close();if(open>10000||sw/n>3000){console.log('FAIL too slow');process.exit(1);}console.log('PASS speed');
