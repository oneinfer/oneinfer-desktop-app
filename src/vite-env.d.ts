/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ONEINFER_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

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

type DesktopUpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

interface DesktopUpdateStatus {
  phase: DesktopUpdatePhase;
  message: string;
  version: string | null;
  progressPercent: number | null;
}

interface Window {
  desktopBridge: {
    getState: () => Promise<DesktopState>;
    saveState: (payload: DesktopState) => Promise<DesktopState>;
    getVersion: () => Promise<string>;
    getUpdateStatus: () => Promise<DesktopUpdateStatus>;
    checkForUpdates: () => Promise<DesktopUpdateStatus>;
    installUpdate: () => Promise<DesktopUpdateStatus>;
    onUpdateStatus: (listener: (status: DesktopUpdateStatus) => void) => () => void;
    getMachineDetails: () => Promise<DesktopMachineDetails>;
    syncMachineDetails: (payload: { baseUrl: string; session: DesktopSession }) => Promise<DesktopMachineDetails>;
    enableClaudeCode: (payload: { apiBaseUrl: string; session: DesktopSession }) => Promise<DesktopClaudeCodeResult>;
  };
}