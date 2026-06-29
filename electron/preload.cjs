const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopBridge', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  saveState: (payload) => ipcRenderer.invoke('app:save-state', payload),
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getUpdateStatus: () => ipcRenderer.invoke('app:get-update-status'),
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('app:install-update'),
  openExternalUrl: (payload) => ipcRenderer.invoke('app:open-external-url', payload),
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
  onQuantizationProgress: (listener) => {
    const handler = (_event, progress) => listener(progress);
    ipcRenderer.on('app:quantization-progress', handler);
    return () => ipcRenderer.removeListener('app:quantization-progress', handler);
  },
  getMachineDetails: () => ipcRenderer.invoke('app:get-machine-details'),
  syncMachineDetails: (payload) => ipcRenderer.invoke('app:sync-machine-details', payload),
  enableClaudeCode: (payload) => ipcRenderer.invoke('app:enable-claude-code', payload),
  enableOpenCode: (payload) => ipcRenderer.invoke('app:enable-opencode', payload),
  enableKiloCode: (payload) => ipcRenderer.invoke('app:enable-kilocode', payload),
  enableOpenClaw: (payload) => ipcRenderer.invoke('app:enable-openclaw', payload),
  enableCodex: (payload) => ipcRenderer.invoke('app:enable-codex', payload),
  checkLibrary: (name) => ipcRenderer.invoke('app:check-library', name),
  installLibrary: (name) => ipcRenderer.invoke('app:install-library', name),
  onLibraryInstallLog: (listener) => {
    const handler = (_event, log) => listener(log);
    ipcRenderer.on('app:library-install-log', handler);
    return () => ipcRenderer.removeListener('app:library-install-log', handler);
  },
  getLibraryError: (name) => ipcRenderer.invoke('app:get-library-error', name),
  getQuantizationTools: () => ipcRenderer.invoke('app:get-quantization-tools'),
  installVcRedist: () => ipcRenderer.invoke('app:install-vc-redist'),
  deployHfModel: (payload) => ipcRenderer.invoke('app:deploy-hf-model', payload),
  startLocalRoute: (payload) => ipcRenderer.invoke('app:start-local-route', payload),
  stopLocalRoute: (payload) => ipcRenderer.invoke('app:stop-local-route', payload),
  cancelHfDeployment: (payload) => ipcRenderer.invoke('app:cancel-hf-deployment', payload),
  deleteLocalModel: (payload) => ipcRenderer.invoke('app:delete-local-model', payload),
  getLocalModelMetrics: (payload) => ipcRenderer.invoke('app:get-local-model-metrics', payload),
  runQuantizationEval: (payload) => ipcRenderer.invoke('app:run-quantization-eval', payload),
  clearQuantizationCache: (payload) => ipcRenderer.invoke('app:clear-quantization-cache', payload),
  gitPull: () => ipcRenderer.invoke('app:git-pull'),
});
