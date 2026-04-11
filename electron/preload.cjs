const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopBridge', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  saveState: (payload) => ipcRenderer.invoke('app:save-state', payload),
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getMachineDetails: () => ipcRenderer.invoke('app:get-machine-details'),
  syncMachineDetails: (payload) => ipcRenderer.invoke('app:sync-machine-details', payload),
  enableClaudeCode: (payload) => ipcRenderer.invoke('app:enable-claude-code', payload),
});