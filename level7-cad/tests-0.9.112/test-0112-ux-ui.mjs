// 0.9.112 interface test: name/icon, empty-workspace commands, compact X window,
// unique option titles, single Apply in curve editing, curve point insert with
// Undo/Redo, Save As + reopen, Close. Runs the real Electron app.
import fs from'node:fs/promises';import path from'node:path';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const source=path.resolve('work/LEVEL7-CAD-0.9.111-source'),qa=await fs.mkdtemp(path.resolve('work/0112-ux-ui-')),checks=[],errors=[],pass=t=>{checks.push(t);console.log('PASS '+t);};let app,page;
const exe=process.env.L7_EXE||path.join(source,'node_modules/electron/dist/electron'),args=process.env.L7_EXE?['--no-sandbox']:['--no-sandbox',source];
try{const env={...process.env,LOCALAPPDATA:path.join(qa,'profile')};delete env.ELECTRON_RUN_AS_NODE;
app=await _electron.launch({executablePath:exe,args,env,timeout:60000});page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept().catch(()=>{}));await page.setViewportSize({width:1280,height:900});await page.locator('[data-tool-category]').first().waitFor();
await app.evaluate(({dialog})=>{global.__qa={opens:[],saves:[]};dialog.showOpenDialog=async()=>global.__qa.opens.shift()??{canceled:true};dialog.showSaveDialog=async()=>global.__qa.saves.shift()??{canceled:true};});
const saveAs=async n=>{const f=path.join(qa,n);await app.evaluate((_e,f)=>global.__qa.saves.push({canceled:false,filePath:f}),f);await page.locator('#cad-toolbox [data-action="save-as"]').click();await page.waitForFunction(n=>document.querySelector('#document-name').textContent===n,n);return f;};
const open=async f=>{await app.evaluate((_e,f)=>global.__qa.opens.push({canceled:false,filePaths:[f]}),f);await page.locator('#cad-toolbox [data-action="open"]').click();await page.waitForFunction(n=>document.querySelector('#document-name').textContent===n,path.basename(f));};
const curveD=()=>page.locator('#native-canvas [data-direct-hit]').first().getAttribute('d');
const curvePoint=f=>page.locator('#native-canvas [data-direct-hit]').first().evaluate((e,f)=>{const p=e.getPointAtLength(e.getTotalLength()*f),q=new DOMPoint(p.x,p.y).matrixTransform(e.getScreenCTM());return{x:q.x,y:q.y};},f);
const xy=async(x,y)=>{await page.locator('[data-point-position-mode="xy"]').click();await page.locator('#point-position-x').fill(String(x));await page.locator('#point-position-y').fill(String(y));await page.locator('#native-canvas').click({position:{x:350,y:400}});};

// 1 name and icon
assert.match(await page.title(),/^LEVEL7 and MTM/);assert.equal((await page.locator('.app-brand strong').textContent()).trim(),'LEVEL7 and MTM');
assert.equal(await app.evaluate(({app})=>app.getName()),'LEVEL7 and MTM');
const icon=await page.locator('.app-brand img').evaluate(i=>i.naturalWidth>0);assert(icon);pass('The program is named LEVEL7 and MTM in the window, title bar and application, with its own icon');
// 2 empty workspace
for(const id of['#menu-save','#menu-save-current','#menu-close-document'])assert.equal(await page.locator(id).isDisabled(),true,id);
assert.equal(await page.locator('#menu-redo').isDisabled(),true);pass('With no drawing open, Save, Save As, Close and Redo are disabled from the first frame');
// 3 X before drawing, compact window
await page.locator('#cad-toolbox [data-action="new-template"]').click();await page.locator('#cad-toolbox [data-action="x-values"]').click();await page.locator('#x-table-add').click();
const inp=page.locator('[data-direct-x="1"],[data-n38-inline-x="1"]');await inp.waitFor();await inp.fill('120');const old=await inp.elementHandle();await inp.press('Enter');await page.waitForFunction(e=>!e.isConnected,old);
const box=await page.locator('#x-values-dialog').boundingBox(),list=await page.locator('#x-values-dialog .x-grouped-scroll').boundingBox(),rows=await page.locator('#x-values-body tr').evaluateAll(r=>r.reduce((h,e)=>h+e.getBoundingClientRect().height,0));
assert(box.width<=762,'width '+box.width);assert(list.height-rows<=40,`list ${list.height} rows ${rows}`);
await page.locator('#x-values-dialog [data-action="close-dialog"]').first().click();pass(`X1 is added and edited before any drawing; the X window is ${Math.round(box.width)} px wide and its list leaves ${Math.round(list.height-rows)} px empty (was a fixed tall area)`);
// 4 unique titles
await page.locator('[data-tool-category="points"]').click();
const titles=await page.evaluate(()=>[...document.querySelectorAll('[data-points-menu-option]')].filter(b=>b.offsetParent!==null).map(b=>b.title));
assert(titles.length>=8);assert.equal(new Set(titles).size,titles.length,JSON.stringify(titles));pass(`All ${titles.length} visible Points and lines options have their own title`);
await page.locator('#tool-category-back').click();
// 5 curve, single Apply
await page.locator('[data-tool-category="curves"]').click();await page.locator('[data-native-curve10-create]').click();await xy(0,0);await xy(200,80);await page.locator('#line10-apply').click();await page.waitForFunction(()=>document.querySelector('#native-canvas [data-direct-hit]'));
const d0=await curveD();let p=await curvePoint(.5);await page.mouse.dblclick(p.x,p.y);await page.locator('#direct-path-editor').waitFor();
const applies=await page.evaluate(()=>[...document.querySelectorAll('#direct-path-editor button, #curve-construction-palette button')].filter(b=>b.offsetParent!==null&&/تطبيق|إلغاء/.test(b.textContent)).map(b=>b.textContent.trim()));
assert.deepEqual(applies.sort(),['إلغاء','تطبيق'].sort(),JSON.stringify(applies));pass('Double-click curve editing shows one Apply and one Cancel (the duplicated palette pair is gone)');
// 6 insert point, apply
await page.locator('[data-curve-option="insert"]').click();p=await curvePoint(.3);await page.mouse.click(p.x,p.y);await page.locator('#direct-path-apply').click();await page.locator('#direct-path-editor').waitFor({state:'hidden'});
const d1=await curveD();assert.notEqual(d1,d0);p=await curvePoint(.5);await page.mouse.dblclick(p.x,p.y);await page.locator('#direct-path-editor').waitFor();await page.locator('[data-curve-option="adjustment"]').click();
await page.screenshot({path:"/tmp/l7shots/reedit.png"});console.log("UNAVAIL",await page.locator("#curve-construction-unavailable").textContent(),"ERR",await page.locator("#direct-path-error").textContent(),"MODE",await page.locator("#direct-path-mode").inputValue(),"PAL",await page.locator("#curve-construction-palette").isVisible());console.log("HANDLES",JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll("[data-curve-handle]")].map(e=>e.dataset.curveHandle))));assert.equal(await page.locator('[data-curve-handle="helper"]').count(),1);await page.locator('#direct-path-cancel').click();pass('Insert point on the curve applies a native helper point and changes the curve');
// 7 undo/redo
await page.locator('#menu-undo').evaluate(b=>b.click());await page.waitForFunction(d=>document.querySelector('#native-canvas [data-direct-hit]')?.getAttribute('d')===d,d0);
assert.equal(await page.locator('#menu-redo').isDisabled(),false);await page.keyboard.press('Control+y');await page.waitForFunction(d=>document.querySelector('#native-canvas [data-direct-hit]')?.getAttribute('d')===d,d1);
assert.equal(await page.locator('#menu-redo').isDisabled(),true);
await page.locator('#menu-undo').evaluate(b=>b.click());await page.waitForFunction(d=>document.querySelector('#native-canvas [data-direct-hit]')?.getAttribute('d')===d,d0);await page.locator('#redo-button').click();await page.waitForFunction(d=>document.querySelector('#native-canvas [data-direct-hit]')?.getAttribute('d')===d,d1);
pass('Undo restores the curve before the inserted point; Redo (menu state, Ctrl+Y and history button) brings it back exactly');
// 8 save as + reopen
const file=await saveAs('curve-edited.mdl');await page.locator('#cad-toolbox [data-action="new-template"]').click();await open(file);await page.waitForFunction(d=>document.querySelector('#native-canvas [data-direct-hit]')?.getAttribute('d')===d,d1);
p=await curvePoint(.5);await page.mouse.dblclick(p.x,p.y);await page.locator('#direct-path-editor').waitFor();await page.locator('[data-curve-option="adjustment"]').click();assert.equal(await page.locator('[data-curve-handle="helper"]').count(),1);await page.locator('#direct-path-cancel').click();
await page.locator('#cad-toolbox [data-action="x-values"]').click();assert.equal(await page.locator('[data-direct-x="1"],[data-n38-inline-x="1"]').inputValue(),'120');await page.locator('#x-values-dialog [data-action="close-dialog"]').first().click();
pass('Save As and reopen keep the edited curve geometry, its inserted point and X1 = 120');
// 9 a new edit clears redo
await page.locator('#menu-undo').evaluate(b=>b.click()).catch(()=>{});
// 10 close
await page.keyboard.press('Control+F4');await page.waitForFunction(()=>document.querySelector('#part-count')?.textContent==='0');await page.waitForLoadState('domcontentloaded');await page.locator('[data-tool-category]').first().waitFor();
assert.equal(await page.locator('#menu-save').isDisabled(),true);assert.equal(await page.locator('#menu-save-current').isDisabled(),true);pass('After Close, Save and Save As stay disabled');
assert.deepEqual(errors,[]);
}catch(e){errors.push(e.stack??String(e));console.error(e);process.exitCode=1;}finally{await fs.writeFile('work/0112-ux-ui-tests.json',JSON.stringify({version:'0.9.112',passed:!process.exitCode&&!errors.length,checks,errors},null,2));if(app){app.process()?.kill('SIGKILL');}}
