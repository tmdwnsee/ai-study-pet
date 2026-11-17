const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  ask: (text) => ipcRenderer.invoke('ask', text),
  setOpen: (open) => ipcRenderer.invoke('set-open', open),
  reset: () => ipcRenderer.invoke('reset'),
  quit: () => ipcRenderer.invoke('quit'),
});
