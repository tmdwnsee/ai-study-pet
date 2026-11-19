const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  ask: (text) => ipcRenderer.invoke('ask', text),
  trends: () => ipcRenderer.invoke('trends'),
  setOpen: (open) => ipcRenderer.invoke('set-open', open),
  reset: () => ipcRenderer.invoke('reset'),
  quit: () => ipcRenderer.invoke('quit'),
  // 진행 상황({type:'status'})과 답 글자({type:'delta'})를 생기는 대로 받는다.
  onProgress: (callback) => ipcRenderer.on('progress', (_e, event) => callback(event)),
});
