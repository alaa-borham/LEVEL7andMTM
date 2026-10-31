LEVEL7 and MTM 0.9.113 - update files (changes against 0.9.112 only)

This is the LAST manual update. From 0.9.113 on the program updates itself:
it checks the LEVEL7 and MTM repository at start and every six hours, downloads
only changed application files, verifies them (SHA-256) and installs them after
you close the program normally. Documents and user data are never touched.

Copy these files over the 0.9.112 application folder (resources\app for the
packaged program), keeping their paths:
  desktop/remote-update.cjs   new: automatic updates
  desktop/main.cjs            starts the update check, installs on exit
  desktop/preload.cjs         update status for the window
  src/native-app.js           update status text in Arabic
  native.html                 loads the new theme and help card
  src/ui-0113.css             new interface theme
  src/ui-guide-0113.js        new: Arabic captions and the tool help card
  src/ui-0113-start.js        new: starts the help card
  package.json                version 0.9.113
  README.md                   release notes

The program folder must be writable (not Program Files) for automatic updates.
Make a backup copy of the application folder first.
