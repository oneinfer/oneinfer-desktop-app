const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopBridge', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  saveState: (payload) => ipcRenderer.invoke('app:save-state', payload),
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getUpdateStatus: () => ipcRenderer.invoke('app:get-update-status'),
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('app:install-update'),
  onUpdateStatus: (listener) => {
    const handler = (_event, status) => listener(status);
    ipcRenderer.on('app:update-status', handler);
    return () => ipcRenderer.removeListener('app:update-status', handler);
  },
  onDeploymentProgress: (listener) => {
    const handler = (_event, progress) => listener(progress);
    ipcRenderer.on('app:deployment-progress', handler);
    return () => ipcRenderer.removeListener('app:deployment-progress', handler);
  },
  getMachineDetails: () => ipcRenderer.invoke('app:get-machine-details'),
  syncMachineDetails: (payload) => ipcRenderer.invoke('app:sync-machine-details', payload),
  enableClaudeCode: (payload) => ipcRenderer.invoke('app:enable-claude-code', payload),
  enableOpenCode: (payload) => ipcRenderer.invoke('app:enable-opencode', payload),
  enableOpenClaw: (payload) => ipcRenderer.invoke('app:enable-openclaw', payload),
  checkLibrary: (name) => ipcRenderer.invoke('app:check-library', name),
  installLibrary: (name) => ipcRenderer.invoke('app:install-library', name),
  deployHfModel: (payload) => ipcRenderer.invoke('app:deploy-hf-model', payload),
  cancelHfDeployment: (payload) => ipcRenderer.invoke('app:cancel-hf-deployment', payload),
  getLocalModelMetrics: (payload) => ipcRenderer.invoke('app:get-local-model-metrics', payload),
});
