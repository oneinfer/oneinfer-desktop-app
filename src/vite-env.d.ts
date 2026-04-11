/// <reference types="vite/client" />

interface DesktopSession {
  accessToken: string;
  developerId: string;
  email: string;
}

interface DesktopSettings {
  apiBaseUrl: string;
}

interface DesktopState {
  settings: Partial<DesktopSettings>;
  session: DesktopSession | null;
}

interface DesktopMachineDetails {
  [key: string]: unknown;
}

interface DesktopClaudeCodeResult {
  apiKeyName: string;
  anthropicBaseUrl: string;
  anthropicModel: string;
  settingsPath: string;
}

interface Window {
  desktopBridge: {
    getState: () => Promise<DesktopState>;
    saveState: (payload: DesktopState) => Promise<DesktopState>;
    getVersion: () => Promise<string>;
    getMachineDetails: () => Promise<DesktopMachineDetails>;
    syncMachineDetails: (payload: { baseUrl: string; session: DesktopSession }) => Promise<DesktopMachineDetails>;
    enableClaudeCode: (payload: { apiBaseUrl: string; session: DesktopSession }) => Promise<DesktopClaudeCodeResult>;
  };
}