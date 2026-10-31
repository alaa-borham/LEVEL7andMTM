# LEVEL7 and MTM 0.9.112: handoff for Codex

> **للمستخدم:** هذا الملف موجّه لـ Codex، وفيه كل اللي تغيّر من 0.9.111 إلى 0.9.112 وتأكدنا إنه صحيح، مع طريقة التحقق.
> - **القسم 1 إلى 4:** ينفذها Codex على نسخة برنامجك.
> - **القسم 5:** الملفات والاختبارات اللي نحتاج Codex يجهزها لنا.
> - **القسم 6:** ملفات جرافس اللي لازم تسويها أنت، لأنها تحتاج برنامج جرافس نفسه.

Repository: `alaa-borham/LEVEL7andMTM`, branch `claude/tender-pasteur-bwjzzi`, folder `level7-cad/`.
Base: the owner's `LEVEL7-CAD-0.9.111-Claude-complete-source.zip` (repository root).

## Rules (from the owner)

- Never modify the owner's original files. Work on a copy.
- Never detach part links or flatten linked geometry.
- Never enable a button that is not implemented and tested.
- Never claim GRAFIS parity from icons. Claim it only from comparison with GRAFIS-saved MDL files.
- Do not run the 0.9.111 updater script: it contains machine-specific paths.
- The `.mdl` files are the owner's data. Do not commit them to the public repository.

## 1. Fastest way to apply

The complete 0.9.112 tree is `level7-cad/source-0.9.112/`. Only these files differ from 0.9.111; copy them over a copy of 0.9.111, keeping paths:

| File | Change |
|---|---|
| `src/part-history-engine.mjs` | Engine fix A: tapered parallel on a curve |
| `src/round-corner-kernel.mjs` | Engine fix B: round corner, ALAA2026 part 65 |
| `native.html` | Name, Redo buttons, document commands start disabled, links `src/ux-0112.css` |
| `src/native-app.js` | Redo stack and shortcuts, `redo` capability, per-option titles, window title |
| `src/ux-0112.css` | New file: compact X window, single Apply/Cancel, mirrored Redo icon |
| `desktop/main.cjs` | Display name `LEVEL7 and MTM`. The data folder stays `LEVEL7 CAD` |
| `package.json` | Version 0.9.112, productName `LEVEL7 and MTM` |
| `assets/icon.svg`, `assets/icon.png`, `assets/icon.ico` | New icon |
| `README.md` | Release notes |

- **Full unified diff:** `level7-cad/0.9.111-to-0.9.112.diff`.
- **Line endings:** some files mix CRLF and LF. Keep the original bytes of every unchanged line; do not normalise them.

The same files, ready to copy, are in `level7-cad/LEVEL7-and-MTM-0.9.112-update.zip` (see `UPDATE-README.txt` inside).

## 2. Engine fixes (verified against GRAFIS-stored geometry)

GRAFIS stores its own computed geometry in each `.mdl` (cache preview). The app replays the construction history without using that cache, and we compare the two. Verification tool: `level7-cad/verify/compare-with-grafis.mjs`.

### Fix A: tapered parallel on a sampled curve (`src/part-history-engine.mjs`)

**Bug:** for a parallel with two different distances (start ≠ end) on a curve, GRAFIS applies the first value at the **end** of the source path. The engine applied it at the start.

**Evidence:** `ALAA2026.mdl` part 7 (front1), allowances 9→11 mm and 10→12 mm.
- Before: up to 2.5 mm off, in 13 objects (the error carried into reflections and notches).
- After: all 29 objects within 0.0064 mm.

**Scope:** straight sources keep the old mapping, because no evidence exists for them.

```diff
-import {applyParallelPath} from './parallel-path-kernel.mjs';
+import {applyParallelPath,constructionPoints} from './parallel-path-kernel.mjs';
@@ paired parallel branch (op%100===97 && h[2]===402)
-    const result=applyParallelPath({source,id,record:record+2,start:compact?end.value:start.value,end:compact?start.value:end.value, ...
+    const swap=compact||(!compact&&start.value!==end.value&&constructionPoints(source).length>2);
+    const result=applyParallelPath({source,id,record:record+2,start:swap?end.value:start.value,end:swap?start.value:end.value, ...
```

Test: `level7-cad/tests-0.9.112/test-0112-tapered-parallel.mjs`.

### Fix B: round corner EK_c004_02 (`src/round-corner-kernel.mjs`)

Two changes:

1. **Trim range raised from ≤30 mm to ≤40 mm** (both trims still equal).
   - Evidence: the owner's GRAFIS test file `10-20-30-40` has four right-angle corners with trims 10, 20, 30 and 40 mm.
   - Result: split point within 0.008 mm, curve within 0.08 mm, for all four corners.
2. **Split point on curved sources.** GRAFIS splits the rounded curve on the ray from the **intersection of the source tangents at the two trim points** (the apex) towards the midpoint of the trim points. The old code started the ray at the shared corner point.
   - For straight sources the apex *is* the corner, so the result does not change (verified on ALAA2026 parts 3 and 47).
   - On curved sources (ALAA2026 part 65: side seam and hem) the split error fell from 0.57 mm to 0.13 mm.
   - If the tangents are parallel, or the apex is more than 4×trim away, the code falls back to the corner.

```diff
- need(radii.every(r=>r>=10&&r<=30)&& ...
+ need(radii.every(r=>r>=10&&r<=40)&& ...
- const ray=trimPoints[0].map((x,k)=>x+trimPoints[1][k]-2*corner[k]),cross=(a,b)=>a[0]*b[1]-a[1]*b[0],hits=[];
+ const cross=(a,b)=>a[0]*b[1]-a[1]*b[0],tangent=directions.map(a=>unit(a*Math.PI/180)),den=cross(tangent[0],tangent[1]),
+   offset=trimPoints[1].map((x,k)=>x-trimPoints[0][k]),along=Math.abs(den)>1e-9?cross(offset,tangent[1])/den:NaN,
+   apex=Number.isFinite(along)&&Math.abs(along)<=4*radii[0]?trimPoints[0].map((x,k)=>x+along*tangent[0][k]):corner,
+   ray=trimPoints[0].map((x,k)=>x+trimPoints[1][k]-2*apex[k]),hits=[];
-  ... a=p.map((x,k)=>x-corner[k]) ...
+  ... a=p.map((x,k)=>x-apex[k]) ...
```

`directions` are the tangents of the trimmed source paths at the trim points, **without** the Ri1/Ri2 adjustments.

Test: `level7-cad/tests-0.9.112/test-0112-round-corner.mjs <source-dir> <ALAA2026.mdl> [10-20-30-40.mdl]`.

### Result on ALAA2026.mdl (base size `__HN40_0`)

| Difference from GRAFIS | 0.9.111 | 0.9.112 |
|---|---|---|
| < 0.01 mm | 1136 / 1293 | 1149 / 1299 |
| < 0.1 mm | 1271 / 1293 | 1291 / 1299 |
| > 0.2 mm | 18 | **0** |

Part 65 now replays fully, so 1299 objects are computed instead of 1293. Per-part results: `level7-cad/verify/ALAA2026-0.9.112-comparison.json`.

## 3. UI changes (0.9.112)

- **Name and icon:** product name `LEVEL7 and MTM` with a new icon. The user-data folder keeps the old name, so existing profiles still work.
- **Redo:** in the Edit menu, the command bar and the history panel, and with Ctrl+Y / Ctrl+Shift+Z. It uses the same part-link guard as Undo, and any new edit clears it.
- **Empty workspace:** Save, Save As, Close, X/Z and the part views start `disabled`, so an empty workspace (or the state right after Close) never offers Save.
- **X window:** at most 760 px wide (`min(760px,96vw)`), and the list grows with its rows instead of reserving empty space.
- **Double-click curve editing:** one Apply/Cancel pair. The duplicate `#curve-construction-apply/cancel` buttons are hidden.
- **Drawing options:** each Points-and-lines option has its own title.

## 4. Tests and expected results

Run on a copy. Electron refuses to run as root with the sandbox enabled, so on Linux use a normal user and `xvfb-run`. The setup is in `tests-0.9.112/run-tests-0112.sh`.

| Test | Expected |
|---|---|
| Kernel tests (`work/test-0111-*.mjs`, see `kernel-regressions.txt`) | 39/39 pass |
| `test-0111-x-anytime-ui` | 7/7 |
| `test-0111-workspace-ui` | 11/11 |
| `test-0111-x-immediate-ui` | 8/8 |
| `test-0112-ux-ui` (source and packaged) | 9/9 |
| `test-0112-tapered-parallel` | pass |
| `test-0112-round-corner` | 7/7 |
| `verify/compare-with-grafis.mjs ALAA2026.mdl` | 0 objects > 0.2 mm |

## 5. What we need from Codex (please prepare and send back)

### 5.1 Files the archived 0.9.111 tests need

36 kernel tests could not run because their input files are not in the archive. Please collect these from the original machine (`C:/Users/Borham/...` and the 0.9.110/0.9.111 work folders), and send them in a **private** location (not the public repository):

- `work/0997-symbol-v-edited-native.mdl`: bartack10, buttonhole 10/20/40, seam, seam40, seam50, pattern-seam, perforation10 tests
- `work/0986-corner-base.mdl`: computed-corner, direct-corner, circular-author, direction-guard, reflection tests
- `work/0989-circular-corner-native.mdl`
- `work/0971-parameter-picker-source.mdl`: corner-bindings
- `work/0983-assistant-candidate.mdl`: assistant-individual, standard-regression
- `work/0994-point-move-edited.mdl`, `work/0994-point-transform-base.mdl`
- `work/0995-reflection-native-replayed.mdl`, `work/0995-point-mirror-edited-native-replayed.mdl`
- `work/0110-seam50-native.mdl`
- `work/level7-084-research/AX_BASE.mdl`: existing-round-regression, parallel-options
- `C:/Users/Borham/Documents/Codex/G48QA/P91B.mdl`, `P91C.mdl`, `P92A.mdl`, `P92D.mdl`: xz-drawing, scalar-links, drawing-bindings, z-links
- The source folder `LEVEL7-CAD-0.9.110-source/` (used by `test-0111-first-x.mjs`)

### 5.2 Runs only Codex can do on the Windows machine

1. Run all `work/test-0111-*.mjs` tests (all 75) against 0.9.112, with the files above. Send the full log and the pass/fail count for each test.
2. Run the 4 UI tests against the **Windows** build (`LEVEL7 and MTM.exe`). They have been run on Linux only.
3. Set the exe file icon to `assets/icon.ico` with `rcedit` (this needs Windows). Today the exe keeps Electron's default icon.
4. Open `ALAA2026.mdl` in 0.9.112 on Windows, do Save As to a new file, and check that it opens again with the same geometry (round trip).

### 5.3 Do not change

- The MDL write format and the part-link guards.
- The 22 Grafis option groups still pending: keep them disabled until each one has a GRAFIS-saved test file.

## 6. What the owner needs to make in GRAFIS (Codex cannot)

These need GRAFIS itself. Save each as a small `.mdl`:

1. **Round corner (Corner 40) with unequal trims:** for example Ru1=20, Ru2=40. Also a corner with trims 50 and 60 mm.
2. **Round corner on a non-right angle:** for example 85° or 100°, with trims of 40 mm.
3. **Seam-allowance corners:** Corner 10 (mirror), Corner 20 (mitred) and Corner 30 (vent), each on a simple rectangle **built with plain lines** (Line 10 with typed values). The current test file builds the rectangle with Parallel 100 and Line 10 picks that the engine cannot replay yet.
4. **ALAA2026.mdl saved in 2–3 other sizes or customers**, to check grading and MTM. Today it is verified in the base size only.
5. **Any missing tool:** its GRAFIS name, a screenshot of its options window, and a small `.mdl` that uses it two or three times with different values.

## 7. 0.9.113 (automatic updates and new interface)

Report: `level7-cad/REPORT-0.9.113.md`. Source: `level7-cad/source-0.9.113/`. Diff against 0.9.112: `level7-cad/0.9.112-to-0.9.113.diff`. Update files: `level7-cad/LEVEL7-and-MTM-0.9.113-update.zip`.

### Automatic updates

- **Code:** `desktop/remote-update.cjs`. It is wired in `desktop/main.cjs`:
  - it uses a dedicated session `level7-updates`, because the default session blocks all non-local requests;
  - IPC channels `update:status` and `update:check`;
  - it installs on `will-quit`.
- **Renderer bridge:** `desktop/preload.cjs` exposes `getLocalUpdateStatus`, `checkLocalUpdates` and `onLocalUpdateStatus`. The 0.9.111 renderer already had matching UI for these.
- **Manifest:** `level7-cad/releases/latest.json` on branch `main`, with a fallback to branch `claude/tender-pasteur-bwjzzi`. The files are in `level7-cad/releases/app/`.
- **Publishing a release:** run `node level7-cad/tools/make-release.mjs <source> level7-cad/releases "<notes>"`, then commit.
- **Rules:**
  - Only an allow-list of paths can be updated: `src/`, `desktop/`, `assets/`, `examples/`, `native.html`, `index.html`, `package.json` and `README*.md`.
  - Every file is verified by size and SHA-256 at download and again at install.
  - The previous files are backed up; a failed copy restores them.
  - A read-only program folder reports an error and installs nothing.
- **Testing:** set the environment variable `L7_UPDATE_MANIFEST_URL` to point at a local server. The tests are in `level7-cad/tests-0.9.113/`.

### Interface

- **Theme:** `src/ui-0113.css` (presentation only).
- **Captions and help card:** `src/ui-guide-0113.js`, started by `src/ui-0113-start.js`. It adds `data-caption` (Arabic) to icon-only `.grafis-icon-option` buttons, and a `#tool-guide` card that describes the tool under the pointer. Disabled tools stay disabled and are described as unavailable.

### Please run on Windows

1. All UI tests, plus `tests-0.9.113/test-0113-ui.mjs`, against `LEVEL7 and MTM.exe`.
2. The packaged update test, with a local server (`tests-0.9.113/test-update-packaged.mjs`), on Windows.

## 8. 0.9.118 (مُتحقق منه)
- الملفات الجديدة:
  - `src/l7-design-mode.js`
  - `src/ui-design-0118.css`
  - `assets/l7design/` (يُبنى بأمر `tools/build-design-engine.mjs`)
- `desktop/main.cjs`:
  - صيغتان جديدتان في `FORMATS`: `design` و`rul`.
  - خيار `design:true` في `pattern:open-file`.
  - `designFrameUrl` للسماح بإطار المحرك فقط.
- `src/grouped-tool-palette.js`: إضافة `export toolIcon(name)`.
- حد X في N38 أصبح ±10000. الملفات: `native-n38-ui.js` و`native-n38-tables.js` و`native-n38-parametric-engine.js`.
- `native-line10-lengths.mjs`: الدالة `line10UnusableX` لعرض قيم X غير الصالحة رمادية مع السبب.
- المطلوب على Windows: فتح «تصميم LEVEL7 جديد»، ورسم نقطتين وخط، ثم الحفظ وإعادة الفتح، ثم تصدير AAMA/PLT وفتحهما في برنامج التعشيق.
