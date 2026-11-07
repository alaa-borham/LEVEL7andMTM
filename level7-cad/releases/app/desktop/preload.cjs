'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Purpose-built local file operations; no arbitrary paths or Node API in the renderer.
contextBridge.exposeInMainWorld('desktop', Object.freeze({
  onSaveBeforeClose: handler => {
    if (typeof handler !== 'function') throw new Error('A save handler is required.');
    const listener = (_event, request) => {
      if (!/^[a-f0-9]{32}$/.test(request?.token || '')) return;
      Promise.resolve().then(() => handler(request.token)).catch(() => ipcRenderer.invoke('pattern:finish-close', { token: request.token, saved: false }).catch(() => {}));
    };
    ipcRenderer.on('pattern:save-before-close', listener);
    return () => ipcRenderer.removeListener('pattern:save-before-close', listener);
  },
  finishClose: (token, saved) => ipcRenderer.invoke('pattern:finish-close', { token, saved: saved === true }),
  requestClose:()=>ipcRenderer.invoke('pattern:request-close'),
  getLocalUpdateStatus: () => ipcRenderer.invoke('update:status'),
  checkLocalUpdates: () => ipcRenderer.invoke('update:check'),
  onLocalUpdateStatus: handler => { if (typeof handler !== 'function') throw new Error('A status handler is required.'); const listener = (_event, state) => handler(state); ipcRenderer.on('update:status', listener); return () => ipcRenderer.removeListener('update:status', listener); },
  openMdl: () => ipcRenderer.invoke('pattern:open-mdl'),
  // 0.9.148: a design file the program was started with (double-click), and later ones
  takeOpenDesign: () => ipcRenderer.invoke('pattern:take-open-design'),
  onOpenDesign: handler => { if (typeof handler !== 'function') throw new Error('A handler is required.'); const listener = (_event, d) => handler(d); ipcRenderer.on('pattern:open-design', listener); return () => ipcRenderer.removeListener('pattern:open-design', listener); },
  copyText: text => ipcRenderer.invoke('pattern:copy-text', {text}),
  saveMdl: options => ipcRenderer.invoke('pattern:save-mdl', {
    bytes: options?.bytes,
    filename: options?.filename,
    saveToken:options?.saveToken
  }),
  exportXZToMdl: options => ipcRenderer.invoke('pattern:transfer-xz-mdl', {
    bytes: options?.bytes,
    filename: options?.filename,
    xOverrides: options?.xOverrides,
    zOverrides: options?.zOverrides
  }),
  exportParametersToMdl: options => ipcRenderer.invoke('pattern:transfer-parameters-mdl', {bytes:options?.bytes,filename:options?.filename,edits:options?.edits}),
  openFile: options => ipcRenderer.invoke('pattern:open-file', { measurements: options?.measurements === true, design: options?.design === true, table: options?.table === true, marker: options?.marker === true }),
  saveFile: options => ipcRenderer.invoke('pattern:save-file', {
    text: options?.text,
    filename: options?.filename,
    kind: options?.kind,
    inPlace: options?.inPlace === true
  }),
  forgetDesign: () => ipcRenderer.invoke('pattern:forget-design'),
  printPdf: options => ipcRenderer.invoke('pattern:print-pdf', {
    html: options?.html,
    filename: options?.filename
  })
}));
