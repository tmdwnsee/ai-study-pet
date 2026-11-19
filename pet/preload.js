const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  ask: (text) => ipcRenderer.invoke('ask', text),
  trends: () => ipcRenderer.invoke('trends'),
  setOpen: (open) => ipcRenderer.invoke('set-open', open),
  reset: () => ipcRenderer.invoke('reset'),
  quit: () => ipcRenderer.invoke('quit'),
  openLink: (url) => ipcRenderer.invoke('open-link', url),
  alertsSeen: () => ipcRenderer.invoke('alerts-seen'),
  // 진행 상황({type:'status'})과 답 글자({type:'delta'})를 생기는 대로 받는다.
  onProgress: (callback) => ipcRenderer.on('progress', (_e, event) => callback(event)),
  // 펭집사가 먼저 알려 줄 것들 [{kind, text}]
  onAlerts: (callback) => ipcRenderer.on('alerts', (_e, items) => callback(items)),
});
