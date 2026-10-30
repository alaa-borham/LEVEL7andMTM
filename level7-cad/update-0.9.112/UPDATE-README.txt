LEVEL7 and MTM 0.9.112 - update files (changes against 0.9.111 only)

Copy these files over the 0.9.111 application folder, keeping their paths:
  assets/icon.ico, assets/icon.png, assets/icon.svg   new icon
  desktop/main.cjs                                     display name; data folder unchanged
  native.html                                          name, Redo buttons, initial disabled commands
  package.json                                         version 0.9.112, productName
  src/native-app.js                                    Redo, option titles, window title
  src/ux-0112.css                                      compact X window, single Apply, Redo icon
  src/part-history-engine.mjs                          tapered curve allowance direction (part 7 fix)
  src/round-corner-kernel.mjs                          round corners up to 40 mm, split on curved sources (part 65 fix)
  README.md                                            release notes

Make a backup copy of the application folder first. User data (LOCALAPPDATA\LEVEL7 CAD)
is not touched. Do not use the 0.9.111 updater script: it contains machine paths.
For an installed (packaged) program the files live in resources\app.
