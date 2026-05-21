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
  localDeployments?: DesktopLocalModelDeployment[];
}

interface DesktopLocalModelDeployment {
  endpointId?: string;
  endpointUrl: string;
  modelId: string;
  name: string;
  pid: number | null;
  runtime: 'vllm' | 'ollama';
  deployedAt: string;
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

interface DesktopHfDeploymentResult {
  endpointUrl: string;
  modelId: string;
  pid: number | null;
  runtime: 'vllm' | 'ollama';
}

interface DesktopLocalModelMetrics {
  endpointUrl: string;
  healthy: boolean;
  modelCount: number;
  modelIds?: string[];
  uptimeSeconds: number | null;
  requestsRunning: number | null;
  requestsWaiting: number | null;
  requestSuccessTotal: number | null;
  promptTokensTotal: number | null;
  generationTokensTotal: number | null;
  gpuCacheUsagePercent: number | null;
  lastCheckedAt: string;
  error?: string;
}

interface DesktopDeploymentProgress {
  id: string;
  stage: 'preparing' | 'starting' | 'loading' | 'health-check' | 'ready' | 'registering' | 'registered' | 'cancelled' | 'error';
  message: string;
  detail?: string;
  level: 'info' | 'success' | 'error';
  timestamp: number;
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
    onDeploymentProgress: (listener: (progress: DesktopDeploymentProgress) => void) => () => void;
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
    deployHfModel: (payload: {
      repoId: string;
      port?: number;
      runtime?: 'vllm' | 'ollama';
      healthTimeoutMs?: number;
      progressId?: string;
    }) => Promise<DesktopHfDeploymentResult>;
    cancelHfDeployment: (payload: {
      repoId: string;
    }) => Promise<{ cancelled: boolean; message: string }>;
    deleteLocalModel: (payload: {
      endpointUrl: string;
      modelId?: string;
      runtime?: 'vllm' | 'ollama' | string;
    }) => Promise<{ deleted: boolean; message: string }>;
    getLocalModelMetrics: (payload: {
      endpointUrl: string;
    }) => Promise<DesktopLocalModelMetrics>;
  };
}
