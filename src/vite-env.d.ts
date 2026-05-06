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
  claudeCodeProvider: 'oneinfer' | 'anthropic';
}

interface DesktopState {
  settings: Partial<DesktopSettings>;
  session: DesktopSession | null;
}

interface DesktopMachineDetails {
  [key: string]: unknown;
}

interface DesktopClaudeCodeResult {
  alreadyConfigured: boolean;
  apiKeyName: string | null;
  anthropicBaseUrl: string | null;
  anthropicModel: string;
  claudeCodeInstallState: 'already-installed' | 'installed' | 'not-required';
  provider: 'oneinfer' | 'anthropic';
  settingsPath: string;
}

interface DesktopOpenCodeResult {
  alreadyConfigured: boolean;
  apiBaseUrl: string;
  apiKeyName: string | null;
  configPath: string;
  model: string;
  opencodeInstallState: 'already-installed' | 'installed';
  providerId: string;
}

interface DesktopOpenClawResult {
  alreadyConfigured: boolean;
  apiKeyName: string | null;
  openclawInstallState: 'already-installed' | 'installed' | 'not-required';
  providerId: string;
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
    enableClaudeCode: (payload: {
      provider: 'oneinfer' | 'anthropic';
      apiBaseUrl?: string;
      session?: DesktopSession;
      anthropicModel?: string;
    }) => Promise<DesktopClaudeCodeResult>;
    enableOpenCode: (payload: {
      apiBaseUrl?: string;
      session?: DesktopSession;
      modelId?: string;
    }) => Promise<DesktopOpenCodeResult>;
    enableOpenClaw: (payload: {
      apiBaseUrl?: string;
      session?: DesktopSession;
    }) => Promise<DesktopOpenClawResult>;
    checkLibrary: (name: 'vllm' | 'ollama') => Promise<boolean>;
    installLibrary: (name: 'vllm' | 'ollama') => Promise<void>;
  };
}
