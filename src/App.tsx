import { useEffect, useState, type FormEvent } from 'react';
import {
  AppWindowMac,
  Bell,
  Blocks,
  Bot,
  Download,
  Edit,
  KeyRound,
  LoaderCircle,
  LogOut,
  Menu,
  Orbit,
  Wifi,
  RefreshCw,
  RotateCcw,
  Rocket,
  Save,
  Send,
  Server,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import {
  attachEndpoint,
  createApiKey,
  createInferenceEndpoint,
  createInstance,
  createIntelligentEndpoint,
  deleteApiKey,
  deleteInstance,
  getCredits,
  getGpuSpecs,
  getProfile,
  getProviderInfo,
  getInstances,
  listApiKeys,
  listInferenceEndpoints,
  listIntelligentEndpoints,
  listModels,
  getHfModelInfo,
  loginWithOtp,
  normalizeApiBaseUrl,
  normalizeList,
  requestOtp,
  runInstanceAction,
} from './api';
import { syncLocalMachineProfile } from './helpers/machineDetails';
import { validateHardwareSupport, type ValidationResult } from './helpers/hardwareValidation';
import type {
  CreateInferenceFormState,
  CreateInstanceFormState,
  DashboardState,
  DesktopSession,
  SectionKey,
} from './types';
import oneInferLogo from './assets/oneinfer-logo.png';

const fallbackApiBaseUrl = 'https://api.oneinfer.ai/v1';
const defaultApiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_ONEINFER_API_BASE_URL || fallbackApiBaseUrl);

const defaultSettings = {
  apiBaseUrl: defaultApiBaseUrl,
};
const defaultClaudeCodeProvider: 'oneinfer' | 'anthropic' = 'anthropic';

const defaultDashboardState: DashboardState = {
  profile: null,
  credits: null,
  machineDetails: null,
  instances: [],
  apiKeys: [],
  intelligentEndpoints: [],
  inferenceEndpoints: [],
  providerInfo: {},
  gpuSpecs: [],
  models: [],
};

const defaultInstanceForm: CreateInstanceFormState = {
  provider_name: 'runpod',
  instance_name: 'oneinfer-studio',
  gpu_id: '',
  gpu_num: 1,
  disk_size: 80,
  image_url: 'vllm/vllm-openai:latest',
  region: 'US-IL-1',
  startup_script: 'echo OneInfer Desktop instance ready',
};

const defaultInferenceForm: CreateInferenceFormState = {
  name: '',
  provider: 'openai',
  model_id: '',
  deployment_target: 'cloud',
  endpoint_url: '',
  machine_id: '',
  machine_name: '',
  top_p: 0.9,
  temperature: 0.7,
  max_tokens: 4096,
};

const sections: Array<{ key: SectionKey; label: string; icon: typeof Sparkles }> = [
  { key: 'overview', label: 'Overview', icon: Sparkles },
  { key: 'selfHosting', label: 'Self-hosting', icon: Server },
  { key: 'instances', label: 'Cloud Instances', icon: Server },
  { key: 'apiKeys', label: 'API Keys', icon: KeyRound },
  { key: 'routing', label: 'Routing', icon: Orbit },
  { key: 'bandwidth', label: 'AI Bandwidth', icon: Wifi },
  { key: 'settings', label: 'Settings', icon: AppWindowMac },
];

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString() : String(value);
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}



function getBalance(credits: DashboardState['credits']): string {
  if (!credits) {
    return '—';
  }

  const possibleValues = [
    credits.credit_balance,
    credits.balance,
    credits.current_balance,
  ];

  const numeric = possibleValues.find((value) => typeof value === 'number');
  return numeric !== undefined ? `$${(Number(numeric) / 100).toFixed(2)}` : 'Available';
}

function getPlanName(profile: DashboardState['profile']) {
  if (!profile) return 'No Active plan';
  const rawProfile = typeof profile.developer === 'object' && profile.developer !== null
    ? profile.developer as Record<string, unknown>
    : profile;
  
  const rawName = rawProfile.plan_name ?? rawProfile.plan ?? (rawProfile as any).developer_plan ?? (rawProfile as any).subscription_tier;
  
  if (!rawName || String(rawName).toLowerCase() === 'free') {
    return 'No Active plan';
  }
  
  return String(rawName);
}

function getDeveloperProfileEntries(profile: DashboardState['profile']): Array<[string, unknown]> {
  if (!profile) {
    return [];
  }

  const rawProfile = typeof profile.developer === 'object' && profile.developer !== null
    ? profile.developer as Record<string, unknown>
    : profile;

  const firstName = rawProfile.first_name ?? rawProfile.firstName;
  const lastName = rawProfile.last_name ?? rawProfile.lastName;
  const organization = rawProfile.organization;
  const organizationType = rawProfile.organization_type ?? rawProfile.organizationType;
  const designation = rawProfile.designation;
  const email = rawProfile.email;

  const entries: Array<[string, unknown]> = [
    ['Name', [firstName, lastName].filter(Boolean).join(' ').trim() || '—'],
    ['Email', email],
    ['Organization', organization],
    ['Organization Type', organizationType],
    ['Designation', designation],
    ['Current Plan', getPlanName(profile)],
  ];

  return entries.filter(([, value]) => value !== undefined && value !== null && value !== '');
}

function getAvailableCreditsEntries(credits: DashboardState['credits']): Array<[string, unknown]> {
  if (!credits) {
    return [];
  }

  return [['Available Credits', getBalance(credits)]];
}

function formatMachineCapacity(value?: number, unit = 'GB'): string {
  return typeof value === 'number' ? `${value.toLocaleString()} ${unit}` : '—';
}

function getMachineSummaryEntries(machine: DashboardState['machineDetails']): Array<[string, unknown]> {
  if (!machine) {
    return [];
  }

  const cpu = machine.cpu ?? {};
  const memory = machine.memory ?? {};

  const entries: Array<[string, unknown]> = [
    ['Machine', machine.machineName ?? machine.hostname],
    ['OS', [machine.osName, machine.osRelease].filter(Boolean).join(' ') || machine.platform],
    ['Architecture', machine.architecture],
    ['CPU', cpu.brand ?? cpu.manufacturer],
    ['vCPUs', cpu.logicalCores],
    ['Physical Cores', cpu.physicalCores],
    ['RAM', formatMachineCapacity(memory.totalGb)],
    ['GPU Count', Array.isArray(machine.gpus) ? machine.gpus.length : 0],
    ['Collected', machine.collectedAt ?? machine.updated_at],
  ];

  return entries.filter(([, value]) => value !== undefined && value !== null && value !== '');
}

function getMachineGpuRows(machine: DashboardState['machineDetails']): Array<Record<string, unknown>> {
  if (!machine?.gpus || !Array.isArray(machine.gpus)) {
    return [];
  }

  return machine.gpus.map((gpu) => ({
    name: gpu.name ?? gpu.model ?? 'Unknown GPU',
    vendor: gpu.vendor ?? 'Unknown',
    vram: formatMachineCapacity(gpu.vramGb),
    utilization: typeof gpu.utilizationPercent === 'number' ? `${gpu.utilizationPercent}%` : '—',
    driver: gpu.driverVersion ?? '—',
  }));
}

function createLoadedSections() {
  return {
    overview: false,
    selfHosting: false,
    instances: false,
    apiKeys: false,
    routing: false,
    bandwidth: false,
    settings: true,
  } satisfies Record<SectionKey, boolean>;
}

function App() {
  const [booting, setBooting] = useState(true);
  const [appVersion, setAppVersion] = useState('');
  const [settingsDraft, setSettingsDraft] = useState(defaultSettings);
  const [session, setSession] = useState<DesktopSession | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>('overview');
  const [dashboard, setDashboard] = useState<DashboardState>(defaultDashboardState);
  const [message, setMessage] = useState<{ tone: 'info' | 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<DesktopUpdateStatus>({
    phase: 'idle',
    message: 'Updates are idle.',
    version: null,
    progressPercent: null,
  });
  const [loadedSections, setLoadedSections] = useState<Record<SectionKey, boolean>>(createLoadedSections);
  const [email, setEmail] = useState('');
  const [loginStep, setLoginStep] = useState<'email' | 'otp'>('email');
  const [otp, setOtp] = useState('');
  const [selfHostForm, setSelfHostForm] = useState({ 
    name: '', 
    model_id: '', 
    endpoint_url: 'http://localhost:8000/v1', // Defaulting to common vLLM port
    useHfUrl: false,
    hfUrl: ''
  });
  const [instanceForm, setInstanceForm] = useState<CreateInstanceFormState>(defaultInstanceForm);
  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeyEnvironment, setApiKeyEnvironment] = useState('production');
  const [intelligentEndpointName, setIntelligentEndpointName] = useState('');
  const [inferenceForm, setInferenceForm] = useState<CreateInferenceFormState>(defaultInferenceForm);
  const [attachForm, setAttachForm] = useState({
    intelligentEndpointId: '',
    endpointType: 'inference_api',
    endpointId: '',
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [claudeCodeProvider, setClaudeCodeProvider] = useState<'oneinfer' | 'anthropic'>(defaultClaudeCodeProvider);
  const [overviewTab, setOverviewTab] = useState<'claude-code' | 'opencode' | 'openclaw'>('claude-code');
  const [infraTab, setInfraTab] = useState<'self-hosted' | 'cloud'>('self-hosted');
  const [settingsTab, setSettingsTab] = useState<'claude-code' | 'opencode' | 'openclaw' | 'account' | 'updates'>('claude-code');
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  useEffect(() => {
    let active = true;

    async function runValidation() {
      if (!session) return;

      const targetModelId = selfHostForm.useHfUrl ? selfHostForm.hfUrl : selfHostForm.model_id;
      if (!targetModelId) {
        setValidationResult(null);
        return;
      }

      let requirements = { minVramGb: 0, modelSizeGb: 0 };

      if (selfHostForm.useHfUrl) {
        // Extract repo ID from URL
        // Format: https://huggingface.co/owner/name
        try {
          const url = new URL(targetModelId);
          const parts = url.pathname.split('/').filter(Boolean);
          if (parts.length >= 2) {
            const repoId = `${parts[0]}/${parts[1]}`;
            const info = await getHfModelInfo(repoId);
            const totalSize = (info.siblings as any[])?.reduce((acc, file) => acc + (file.size || 0), 0) ?? 0;
            const sizeGb = totalSize / (1024 ** 3);
            requirements = {
              minVramGb: Math.ceil(sizeGb * 1.2), // Assume 20% overhead
              modelSizeGb: Math.ceil(sizeGb),
            };
          }
        } catch (e) {
          // Fallback if not a valid URL yet
          setValidationResult(null);
          return;
        }
      } else {
        const catalogModel = dashboard.models.find((m: any) => (m.model_id || m.id) === targetModelId);
        if (catalogModel) {
          requirements = {
            minVramGb: Number(catalogModel.modelMinVram || catalogModel.model_min_vram || 0),
            modelSizeGb: Number(catalogModel.modelSizeGb || catalogModel.model_size_gb || 0),
          };
        }
      }

      if (active && (requirements.minVramGb > 0 || requirements.modelSizeGb > 0)) {
        const result = validateHardwareSupport(requirements, dashboard.machineDetails);
        setValidationResult(result);
      }
    }

    runValidation();
    return () => { active = false; };
  }, [selfHostForm.model_id, selfHostForm.hfUrl, selfHostForm.useHfUrl, dashboard.machineDetails, dashboard.models]);

  async function refreshMachineDetails(currentSession: DesktopSession, currentBaseUrl: string) {
    const machineDetails = await syncLocalMachineProfile(currentBaseUrl, currentSession);

    if (machineDetails) {
      setDashboard((current) => ({
        ...current,
        machineDetails,
      }));
    }

    return machineDetails;
  }

  async function persistState(
    nextSession: DesktopSession | null,
    nextApiBaseUrl: string,
    nextClaudeCodeProvider: 'oneinfer' | 'anthropic',
  ) {
    if (!window.desktopBridge) {
      return;
    }

    await window.desktopBridge.saveState({
      session: nextSession,
      settings: {
        apiBaseUrl: nextApiBaseUrl,
        claudeCodeProvider: nextClaudeCodeProvider,
      },
    });
  }

  async function handleClaudeCodeProviderChange(nextProvider: 'oneinfer' | 'anthropic') {
    setClaudeCodeProvider(nextProvider);

    await persistState(session, settingsDraft.apiBaseUrl, nextProvider).catch((error) => {
      console.error('[state] failed to persist Claude Code provider selection', error);
    });

    if (nextProvider === 'oneinfer') {
      await handleEnableClaudeCode();
    } else {
      await handleEnableClaudeCodeDirect();
    }
  }

  async function loadSectionData(
    section: SectionKey,
    currentSession: DesktopSession,
    currentBaseUrl: string,
    options?: { force?: boolean; silent?: boolean },
  ) {
    if (section === 'settings') {
      return;
    }

    const shouldForce = options?.force ?? false;
    const shouldBeSilent = options?.silent ?? false;

    if (!shouldForce && loadedSections[section]) {
      return;
    }

    setBusy(`load-${section}`);
    if (!shouldBeSilent) {
      setMessage(null);
    }

    try {
      if (section === 'overview') {
        const results = await Promise.allSettled([
          getProfile(currentBaseUrl, currentSession),
          getCredits(currentBaseUrl, currentSession),
        ]);

        setDashboard((current) => ({
          ...current,
          profile: results[0].status === 'fulfilled' ? results[0].value : current.profile,
          credits: results[1].status === 'fulfilled' ? results[1].value : current.credits,
        }));

        const failed = results.filter((result) => result.status === 'rejected').length;
        if (failed > 0) {
          setMessage({
            tone: 'error',
            text: `Overview loaded with ${failed} partial failure${failed > 1 ? 's' : ''}.`,
          });
        } else if (!shouldBeSilent) {
          setMessage({ tone: 'success', text: 'Overview synced.' });
        }
      }

      if (section === 'instances') {
        const results = await Promise.allSettled([
          getInstances(currentBaseUrl, currentSession),
          getProviderInfo(currentBaseUrl),
          getGpuSpecs(currentBaseUrl),
        ]);

        setDashboard((current) => ({
          ...current,
          instances: results[0].status === 'fulfilled' ? results[0].value : current.instances,
          providerInfo: results[1].status === 'fulfilled' ? results[1].value : current.providerInfo,
          gpuSpecs: results[2].status === 'fulfilled' ? results[2].value : current.gpuSpecs,
        }));

        const failed = results.filter((result) => result.status === 'rejected').length;
        if (failed > 0) {
          setMessage({ tone: 'error', text: `Instances loaded with ${failed} partial failure${failed > 1 ? 's' : ''}.` });
        } else if (!shouldBeSilent) {
          setMessage({ tone: 'success', text: 'Instances synced.' });
        }
      }

      if (section === 'apiKeys') {
        const apiKeys = await listApiKeys(currentBaseUrl, currentSession);
        setDashboard((current) => ({ ...current, apiKeys }));
        if (!shouldBeSilent) {
          setMessage({ tone: 'success', text: 'API keys synced.' });
        }
      }

      if (section === 'routing') {
        const results = await Promise.allSettled([
          listIntelligentEndpoints(currentBaseUrl, currentSession),
          listInferenceEndpoints(currentBaseUrl, currentSession),
        ]);

        setDashboard((current) => ({
          ...current,
          intelligentEndpoints: results[0].status === 'fulfilled' ? results[0].value : current.intelligentEndpoints,
          inferenceEndpoints: results[1].status === 'fulfilled' ? results[1].value : current.inferenceEndpoints,
        }));

        const failed = results.filter((result) => result.status === 'rejected').length;
        if (failed > 0) {
          setMessage({ tone: 'error', text: `Routing loaded with ${failed} partial failure${failed > 1 ? 's' : ''}.` });
        } else if (!shouldBeSilent) {
          setMessage({ tone: 'success', text: 'Routing synced.' });
        }
      }

      if (section === 'selfHosting') {
        const models = await listModels(currentBaseUrl);
        setDashboard((current) => ({ ...current, models }));
        if (!shouldBeSilent) {
          setMessage({ tone: 'success', text: 'Models catalog synced.' });
        }
      }

      setLoadedSections((current) => ({ ...current, [section]: true }));
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : `Failed to load ${section}.`,
      });
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const [storedState, version, initialUpdateStatus] = await Promise.all([
        window.desktopBridge?.getState?.(),
        window.desktopBridge?.getVersion?.(),
        window.desktopBridge?.getUpdateStatus?.(),
      ]);

      if (!active) {
        return;
      }

      const savedProvider = storedState?.settings?.claudeCodeProvider;
      const nextClaudeCodeProvider = (savedProvider === 'anthropic' || savedProvider === 'oneinfer') ? savedProvider : defaultClaudeCodeProvider;
      const nextBaseUrl = storedState?.settings?.apiBaseUrl || defaultSettings.apiBaseUrl;
      setSettingsDraft({ apiBaseUrl: nextBaseUrl });
      setClaudeCodeProvider(nextClaudeCodeProvider);
      setSession(storedState?.session ?? null);
      setLoadedSections(createLoadedSections());
      setEmail(storedState?.session?.email ?? '');
      setAppVersion(version ?? '');
      if (initialUpdateStatus) {
        setUpdateStatus(initialUpdateStatus);
        if (initialUpdateStatus.message) {
          setMessage({ tone: 'info', text: initialUpdateStatus.message });
        }
      }

      if (storedState?.session) {
        await loadSectionData('overview', storedState.session, nextBaseUrl, { force: true, silent: true });
      }

      setBooting(false);
    }

    bootstrap().catch((error) => {
      if (!active) {
        return;
      }

      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to bootstrap application.' });
      setBooting(false);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = window.desktopBridge?.onUpdateStatus?.((status) => {
      setUpdateStatus(status);
      if (status.message) {
        setMessage({ tone: 'info', text: status.message });
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!message) {
      return;
    }
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!session) {
      return;
    }

    loadSectionData(activeSection, session, settingsDraft.apiBaseUrl, { silent: true }).catch((error) => {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : `Failed to load ${activeSection}.` });
    });
  }, [activeSection, session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    refreshMachineDetails(session, settingsDraft.apiBaseUrl).catch((error) => {
      console.error('Machine detail sync failed from session effect.', error);
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Machine detail sync failed.',
      });
    });
  }, [session, settingsDraft.apiBaseUrl]);

  async function handleOtpRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('otp');
    setMessage(null);

    try {
      await requestOtp(settingsDraft.apiBaseUrl, email);
      setLoginStep('otp');
      setMessage({ tone: 'success', text: `OTP sent to ${email}.` });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to request OTP.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('login');
    setMessage(null);

    try {
      const nextSession = await loginWithOtp(settingsDraft.apiBaseUrl, email, otp);
      setSession(nextSession);
      setLoadedSections(createLoadedSections());
      setDashboard(defaultDashboardState);
      await persistState(nextSession, settingsDraft.apiBaseUrl, claudeCodeProvider);
      await loadSectionData('overview', nextSession, settingsDraft.apiBaseUrl, { force: true });
      setMessage({ tone: 'success', text: 'Logged in successfully.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Login failed.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleEnableClaudeCode() {
    if (!session || !window.desktopBridge?.enableClaudeCode) {
      return;
    }

    setBusy('configure-claude-code');
    setMessage(null);

    try {
      const result = await window.desktopBridge.enableClaudeCode({
        provider: 'oneinfer',
        apiBaseUrl: settingsDraft.apiBaseUrl,
        session,
      });
      const installMessage = result.claudeCodeInstallState === 'installed'
        ? ' Claude Code was installed first for this operating system.'
        : '';

      setMessage({
        tone: 'success',
        text: result.alreadyConfigured
          ? `Claude Code is already using OneInfer. Settings: ${result.settingsPath}. Model: ${result.anthropicModel}.${installMessage}`
          : `Claude Code enabled via OneInfer${result.apiKeyName ? ` with ${result.apiKeyName}` : ''}. Settings: ${result.settingsPath}. Base URL: ${result.anthropicBaseUrl}. Model: ${result.anthropicModel}.${installMessage}`,
      });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to enable Claude Code.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleEnableClaudeCodeDirect() {
    if (!window.desktopBridge?.enableClaudeCode) {
      return;
    }

    setBusy('configure-claude-code');
    setMessage(null);

    try {
      const result = await window.desktopBridge.enableClaudeCode({
        provider: 'anthropic',
      });

      setMessage({
        tone: 'success',
        text: result.alreadyConfigured
          ? `Claude Code is already reset for Anthropic. Settings: ${result.settingsPath}. Model: ${result.anthropicModel}.`
          : `Claude Code reset for Anthropic. Settings: ${result.settingsPath}. Model: ${result.anthropicModel}.`,
      });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to configure Claude Code.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleEnableOpenClaw() {
    if (!session || !window.desktopBridge?.enableOpenClaw) {
      return;
    }

    setBusy('configure-openclaw');
    setMessage(null);

    try {
      const result = await window.desktopBridge.enableOpenClaw({
        apiBaseUrl: settingsDraft.apiBaseUrl,
        session,
      });
      const installMessage = result.openclawInstallState === 'installed'
        ? ' OpenClaw was installed first for this operating system.'
        : '';

      setMessage({
        tone: 'success',
        text: result.alreadyConfigured
          ? `OpenClaw is already configured for OneInfer.${installMessage}`
          : `OpenClaw enabled via OneInfer${result.apiKeyName ? ` with ${result.apiKeyName}` : ''}.${installMessage}`,
      });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to enable OpenClaw.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleEnableOpenCode() {
    if (!session || !window.desktopBridge?.enableOpenCode) {
      return;
    }

    setBusy('configure-opencode');
    setMessage(null);

    try {
      const result = await window.desktopBridge.enableOpenCode({
        apiBaseUrl: settingsDraft.apiBaseUrl,
        session,
      });
      const installMessage = result.opencodeInstallState === 'installed'
        ? ' OpenCode was installed first for this operating system.'
        : '';

      setMessage({
        tone: 'success',
        text: result.alreadyConfigured
          ? `OpenCode is already enabled globally for OneInfer. Config: ${result.configPath}. Model: ${result.model}.${installMessage}`
          : `OpenCode enabled globally via OneInfer${result.apiKeyName ? ` with ${result.apiKeyName}` : ''}. Config: ${result.configPath}. Base URL: ${result.apiBaseUrl}. Model: ${result.model}.${installMessage}`,
      });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to enable OpenCode.' });
    } finally {
      setBusy(null);
    }
  }



  async function handleCheckForUpdates() {
    if (!window.desktopBridge?.checkForUpdates) {
      return;
    }

    setBusy('check-updates');

    try {
      const nextStatus = await window.desktopBridge.checkForUpdates();
      setUpdateStatus(nextStatus);
      setMessage({ tone: 'info', text: nextStatus.message });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to check for updates.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleInstallUpdate() {
    if (!window.desktopBridge?.installUpdate) {
      return;
    }

    setBusy('install-update');

    try {
      await window.desktopBridge.installUpdate();
      setMessage({ tone: 'info', text: 'Installer is restarting to apply the update.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to install update.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleRegisterSelfHosted(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    const detectedMachineId = typeof dashboard.machineDetails?.machineId === 'string' ? dashboard.machineDetails.machineId : '';
    const detectedMachineName = typeof dashboard.machineDetails?.machineName === 'string'
      ? dashboard.machineDetails.machineName
      : typeof dashboard.machineDetails?.hostname === 'string'
        ? dashboard.machineDetails.hostname
        : '';

    const modelId = selfHostForm.useHfUrl ? selfHostForm.hfUrl : selfHostForm.model_id;
    if (!modelId) {
      setMessage({ tone: 'error', text: selfHostForm.useHfUrl ? 'Hugging Face URL is required.' : 'Please select a model.' });
      return;
    }

    setBusy('register-self-hosted');
    try {
      await createInferenceEndpoint(settingsDraft.apiBaseUrl, session, {
        name: selfHostForm.name,
        provider: 'openai',
        model_id: modelId,
        deployment_target: 'local',
        endpoint_url: selfHostForm.endpoint_url,
        machine_id: detectedMachineId,
        machine_name: detectedMachineName,
        top_p: 0.9,
        temperature: 0.7,
        max_tokens: 4096,
      });
      setMessage({ tone: 'success', text: 'Local inference endpoint registered.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to register endpoint.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleRefreshCurrentSection() {
    if (!session) {
      return;
    }

    setBusy(`load-${activeSection === 'settings' ? 'overview' : activeSection}`);
    setMessage(null);

    try {
      await refreshMachineDetails(session, settingsDraft.apiBaseUrl);
      await loadSectionData(activeSection === 'settings' ? 'overview' : activeSection, session, settingsDraft.apiBaseUrl, { force: true });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Refresh failed.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleLogout() {
    setSession(null);
    setDashboard(defaultDashboardState);
    setLoadedSections(createLoadedSections());
    setOtp('');
    setLoginStep('email');
    await persistState(null, settingsDraft.apiBaseUrl, claudeCodeProvider);
    setMessage({ tone: 'info', text: 'Local session cleared.' });
  }

  async function handleCreateInstance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setBusy('create-instance');
    try {
      await createInstance(settingsDraft.apiBaseUrl, session, instanceForm);
      setMessage({ tone: 'success', text: 'Instance creation request submitted.' });
      await loadSectionData('instances', session, settingsDraft.apiBaseUrl, { force: true });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to create instance.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleInstanceAction(action: 'start-instance' | 'stop-instance' | 'restart-instance', instanceId: string, provider: string) {
    if (!session) {
      return;
    }

    setBusy(action);
    try {
      await runInstanceAction(settingsDraft.apiBaseUrl, session, action, instanceId, provider);
      setMessage({ tone: 'success', text: `${action} completed for ${instanceId}.` });
      await loadSectionData('instances', session, settingsDraft.apiBaseUrl, { force: true });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Instance action failed.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteInstance(instanceId: string, provider: string) {
    if (!session) {
      return;
    }

    setBusy('delete-instance');
    try {
      await deleteInstance(settingsDraft.apiBaseUrl, session, instanceId, provider);
      setMessage({ tone: 'success', text: `Deleted ${instanceId}.` });
      await loadSectionData('instances', session, settingsDraft.apiBaseUrl, { force: true });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Delete instance failed.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setBusy('create-key');
    try {
      await createApiKey(settingsDraft.apiBaseUrl, session, apiKeyName, apiKeyEnvironment);
      setMessage({ tone: 'success', text: `API key ${apiKeyName} created.` });
      await loadSectionData('apiKeys', session, settingsDraft.apiBaseUrl, { force: true });
      setApiKeyName('');
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'API key creation failed.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteApiKey(name: string) {
    if (!session) {
      return;
    }

    setBusy('delete-key');
    try {
      await deleteApiKey(settingsDraft.apiBaseUrl, session, name);
      setMessage({ tone: 'success', text: `API key ${name} deleted.` });
      await loadSectionData('apiKeys', session, settingsDraft.apiBaseUrl, { force: true });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'API key deletion failed.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateIntelligentEndpoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setBusy('create-intelligent-endpoint');
    try {
      await createIntelligentEndpoint(settingsDraft.apiBaseUrl, session, intelligentEndpointName);
      setMessage({ tone: 'success', text: 'Intelligent endpoint created.' });
      setIntelligentEndpointName('');
      await loadSectionData('routing', session, settingsDraft.apiBaseUrl, { force: true });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to create intelligent endpoint.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateInferenceEndpoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    const detectedMachineId = typeof dashboard.machineDetails?.machineId === 'string' ? dashboard.machineDetails.machineId : '';
    const detectedMachineName = typeof dashboard.machineDetails?.machineName === 'string'
      ? dashboard.machineDetails.machineName
      : typeof dashboard.machineDetails?.hostname === 'string'
        ? dashboard.machineDetails.hostname
        : '';

    const payload: CreateInferenceFormState = {
      ...inferenceForm,
      endpoint_url: inferenceForm.deployment_target === 'local' ? inferenceForm.endpoint_url.trim() : '',
      machine_id: inferenceForm.deployment_target === 'local' ? (inferenceForm.machine_id.trim() || detectedMachineId) : '',
      machine_name: inferenceForm.deployment_target === 'local' ? (inferenceForm.machine_name.trim() || detectedMachineName) : '',
    };

    if (payload.deployment_target === 'local' && !payload.endpoint_url) {
      setMessage({ tone: 'error', text: 'Local deployment URL is required.' });
      return;
    }

    setBusy('create-inference-endpoint');
    try {
      await createInferenceEndpoint(settingsDraft.apiBaseUrl, session, payload);
      setMessage({ tone: 'success', text: payload.deployment_target === 'local' ? 'Local inference endpoint registered.' : 'Inference API endpoint created.' });
      await loadSectionData('routing', session, settingsDraft.apiBaseUrl, { force: true });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to create inference endpoint.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleAttachEndpoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setBusy('attach-endpoint');
    try {
      await attachEndpoint(
        settingsDraft.apiBaseUrl,
        session,
        attachForm.intelligentEndpointId,
        attachForm.endpointType,
        attachForm.endpointId,
      );
      setMessage({ tone: 'success', text: 'Endpoint attached to routing policy.' });
      await loadSectionData('routing', session, settingsDraft.apiBaseUrl, { force: true });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Attach endpoint failed.' });
    } finally {
      setBusy(null);
    }
  }

  if (booting) {
    return (
      <div className="shell shell-center">
        <div className="loading-card">
          <LoaderCircle className="spin" />
          <h1>Booting OneInfer Desktop</h1>
          <p>Loading local session and API workspace.</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="shell auth-shell">
        <div className="auth-stage">
          <div className="auth-hero glass-panel">
            <div className="eyebrow">OneInfer Desktop</div>
            <h1>Ship GPU infrastructure and developer APIs from one native workspace.</h1>
            <p>
              This client talks directly to your existing OneInfer backend endpoints for OTP login, credits, models,
              instances, API keys, and intelligent routing.
            </p>
            <div className="hero-grid">
              <HeroChip icon={Server} title="Instance Control" text="Create, start, stop, restart, and remove GPU instances." />
              <HeroChip icon={KeyRound} title="Developer Keys" text="Generate and revoke keys without leaving the desktop app." />
              <HeroChip icon={Orbit} title="Routing Studio" text="Create inference endpoints and attach them into intelligent routing." />
            </div>
          </div>

          <div className="auth-forms glass-panel">
            <div className="panel-header">
              <div>
                <div className="eyebrow">Connect</div>
                <h2>Developer Login</h2>
              </div>
              <ShieldCheck size={20} />
            </div>

            {message ? <Banner tone={message.tone} text={message.text} /> : null}

            {loginStep === 'email' ? (
              <form className="stack-form" onSubmit={handleOtpRequest}>
                <label>
                  <span>Email</span>
                  <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="developer@oneinfer.ai" />
                </label>
                <button className="primary-button" type="submit" disabled={busy === 'otp'}>
                  {busy === 'otp' ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}
                  Request OTP
                </button>
              </form>
            ) : (
              <form className="stack-form" onSubmit={handleLogin}>
                <label>
                  <span>One-Time Password</span>
                  <input value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="Enter OTP" autoFocus />
                </label>
                <button className="secondary-button" type="submit" disabled={busy === 'login'}>
                  {busy === 'login' ? <LoaderCircle className="spin" size={16} /> : <Rocket size={16} />}
                  Enter Workspace
                </button>
                <button 
                  className="ghost-button" 
                  type="button" 
                  style={{ marginTop: '-8px' }}
                  onClick={() => setLoginStep('email')}
                >
                  Change Email
                </button>
              </form>
            )}

          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shell app-shell">
      <header className="mobile-header glass-panel">
        <div className="brand-lockup">
          <div className="brand-icon">
            <img src={oneInferLogo} alt="OneInfer logo" className="brand-image" />
          </div>
          <div>
            <div className="eyebrow">Desktop Control Plane</div>
            <h1>OneInfer</h1>
          </div>
        </div>
        <button className="ghost-button" type="button" onClick={() => setSidebarOpen(true)}>
          <Menu size={20} />
        </button>
      </header>

      <div className={`sidebar-overlay${sidebarOpen ? ' active' : ''}`} onClick={() => setSidebarOpen(false)} />

      <aside
        className={`sidebar-container glass-panel${sidebarOpen ? ' open' : ''}`}
        style={{ width: '360px', flexShrink: 0 }}
      >
        <div className="sidebar">
          <button className="ghost-button sidebar-close" type="button" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
            Close
          </button>

          <div className="brand-lockup">
            <div className="brand-icon">
              <img src={oneInferLogo} alt="OneInfer logo" className="brand-image" />
            </div>
            <div>
              <div className="eyebrow">Desktop Control Plane</div>
              <h1>OneInfer</h1>
            </div>
          </div>

          <div className="developer-pill">
            <div>
              <strong>{session.email}</strong>
            </div>
          </div>

          <nav className="nav-stack">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.key}
                  className={`nav-button ${activeSection === section.key ? 'active' : ''}`}
                  onClick={() => { setActiveSection(section.key); setSidebarOpen(false); }}
                  type="button"
                >
                  <Icon size={18} />
                  {section.label}
                </button>
              );
            })}
          </nav>

          <div className="sidebar-footer">
            <div className="version-text">Version {appVersion || 'dev'}</div>
            <button
              className="ghost-button"
              onClick={handleRefreshCurrentSection}
              type="button"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            <button className="ghost-button" onClick={handleLogout} type="button">
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </div>
      </aside>

      <main className="main-stage">
        {activeSection !== 'apiKeys' && activeSection !== 'settings' && activeSection !== 'selfHosting' && (
          <section className="hero-panel hero-panel--single glass-panel" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="eyebrow" style={{ color: 'var(--accent)', opacity: 0.9 }}>Account Subscription</div>
                <h2 style={{ fontSize: '2.25rem', margin: '4px 0' }}>
                  {(() => {
                    const name = getPlanName(dashboard.profile);
                    return name === 'No Active plan' ? name : `${name} Plan`;
                  })()}
                </h2>
                <p style={{ color: 'var(--muted)', fontSize: '1rem' }}>OneInfer Developer Platform</p>
              </div>
              {dashboard.profile && getPlanName(dashboard.profile) !== 'No Active plan' && (
                <div className="plan-badge">
                  <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Current</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>Active</div>
                </div>
              )}
            </div>
          </section>
        )}

        {message ? <Banner tone={message.tone} text={message.text} /> : null}

        {activeSection === 'overview' ? (
          <>
            <div className="settings-layout">
              <aside className="glass-panel" style={{ padding: '20px' }}>
                <div className="cc-toggle" style={{ marginBottom: '20px' }}>
                  <button
                    className={`cc-toggle-btn ${infraTab === 'self-hosted' ? 'active' : ''}`}
                    onClick={() => setInfraTab('self-hosted')}
                    type="button"
                  >
                    <Server size={14} />
                    Self-hosted
                  </button>
                  <button
                    className={`cc-toggle-btn ${infraTab === 'cloud' ? 'active' : ''}`}
                    onClick={() => setInfraTab('cloud')}
                    type="button"
                  >
                    <Server size={14} />
                    Cloud
                  </button>
                </div>

                <div className="card-stack">
                  {infraTab === 'self-hosted' && (
                    <>
                      <div className="panel-header" style={{ padding: '0 0 12px 0', justifyContent: 'flex-start', gap: '10px' }}>
                        <Server size={18} className="panel-icon" />
                        <h3 className="panel-title">Self-hosted Models</h3>
                      </div>
                      <MiniTable
                        columns={['name', 'model_id', 'endpoint_url']}
                        rows={dashboard.inferenceEndpoints.filter((e: any) => e.deployment_target === 'local')}
                        emptyText="No local models registered."
                      />
                    </>
                  )}

                  {infraTab === 'cloud' && (
                    <>
                      <div className="panel-header" style={{ padding: '0 0 12px 0', justifyContent: 'flex-start', gap: '10px' }}>
                        <Server size={18} className="panel-icon" />
                        <h3 className="panel-title">Cloud Instances</h3>
                      </div>
                      <div className="instance-list">
                        {dashboard.instances.length === 0 ? <EmptyState text="No active cloud instances." /> : null}
                        {dashboard.instances.map((instance, index) => {
                          const instanceId = String(instance.instance_id ?? instance.unique_instance_id ?? instance.id ?? `instance-${index}`);
                          return (
                            <div className="sub-card" key={instanceId} style={{ padding: '12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                <div>
                                  <h4 style={{ fontSize: '0.9rem' }}>{String(instance.instance_name ?? instanceId)}</h4>
                                  <p style={{ fontSize: '0.75rem', margin: 0 }}>{String(instance.provider_name)} · {String(instance.region)}</p>
                                </div>
                                <span className="status-pill" style={{ fontSize: '0.7rem', padding: '4px 8px' }}>
                                  {formatValue(instance.instance_status ?? instance.status)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </aside>

              <main className="glass-panel" style={{ padding: '20px' }}>
                <div className="cc-toggle" style={{ marginBottom: '20px' }}>
                  <button
                    className={`cc-toggle-btn ${overviewTab === 'claude-code' ? 'active' : ''}`}
                    onClick={() => setOverviewTab('claude-code')}
                    type="button"
                  >
                    <Bot size={14} />
                    Claude Code
                  </button>
                  <button
                    className={`cc-toggle-btn ${overviewTab === 'opencode' ? 'active' : ''}`}
                    onClick={() => setOverviewTab('opencode')}
                    type="button"
                  >
                    <Blocks size={14} />
                    OpenCode
                  </button>
                  <button
                    className={`cc-toggle-btn ${overviewTab === 'openclaw' ? 'active' : ''}`}
                    onClick={() => setOverviewTab('openclaw')}
                    type="button"
                  >
                    <Blocks size={14} />
                    OpenClaw
                  </button>
                </div>

                <div className="card-stack">
                  {overviewTab === 'claude-code' && (
                    <ClaudeCodeSetupPanel
                      provider={claudeCodeProvider}
                      onSetProvider={handleClaudeCodeProviderChange}
                      busy={busy}
                    />
                  )}

                  {overviewTab === 'opencode' && (
                    <OpenCodeSetupPanel
                      busy={busy}
                      onEnable={handleEnableOpenCode}
                    />
                  )}

                  {overviewTab === 'openclaw' && (
                    <OpenClawSetupPanel
                      busy={busy}
                      onEnable={handleEnableOpenClaw}
                    />
                  )}
                </div>
              </main>
            </div>

            <div className="section-grid dashboard-row compact-row" style={{ gridTemplateColumns: '3fr 1fr', marginTop: '20px' }}>
              <HardwareWidget machine={dashboard.machineDetails} />
              <Panel title="Credits" icon={ShieldCheck}>
                <DataList
                  entries={getAvailableCreditsEntries(dashboard.credits)}
                  emptyText="Credit data not loaded."
                />
              </Panel>
            </div>
          </>
        ) : null}

        {activeSection === 'selfHosting' ? (
          <div className="section-grid two-col">
            <Panel title="Local Hardware" icon={Server}>
              <DataList
                entries={getMachineSummaryEntries(dashboard.machineDetails)}
                emptyText="Machine profile not synced yet."
              />
              <MiniTable
                columns={['name', 'vendor', 'vram', 'utilization', 'driver']}
                rows={getMachineGpuRows(dashboard.machineDetails)}
                emptyText="No local GPU detected."
              />
            </Panel>

            <Panel title="Register Local Inference Server" icon={Rocket}>
              <form className="stack-form" onSubmit={handleRegisterSelfHosted}>
                <div className="form-hint">
                  Register this machine as a local inference provider. Start your inference server (e.g. vLLM, Ollama) before registering.
                </div>
                <label>
                  <span>Name</span>
                  <input
                    value={selfHostForm.name}
                    onChange={(event) => setSelfHostForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Local vLLM server"
                  />
                </label>

                <div className="cc-toggle" style={{ marginBottom: '8px' }}>
                  <button
                    className={`cc-toggle-btn ${!selfHostForm.useHfUrl ? 'active' : ''}`}
                    onClick={() => setSelfHostForm((c) => ({ ...c, useHfUrl: false }))}
                    type="button"
                    style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                  >
                    Select Model
                  </button>
                  <button
                    className={`cc-toggle-btn ${selfHostForm.useHfUrl ? 'active' : ''}`}
                    onClick={() => setSelfHostForm((c) => ({ ...c, useHfUrl: true }))}
                    type="button"
                    style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                  >
                    Hugging Face URL
                  </button>
                </div>

                {!selfHostForm.useHfUrl ? (
                  <label>
                    <span>Select Model</span>
                    <select
                      value={selfHostForm.model_id}
                      onChange={(event) => setSelfHostForm((current) => ({ ...current, model_id: event.target.value }))}
                    >
                      <option value="">Select a model...</option>
                      {dashboard.models.map((model: any) => (
                        <option key={model.model_id || model.id} value={model.model_id || model.id}>
                          {model.model_name || model.displayName || model.model_id}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label>
                    <span>Hugging Face URL</span>
                    <input
                      value={selfHostForm.hfUrl}
                      onChange={(event) => setSelfHostForm((current) => ({ ...current, hfUrl: event.target.value }))}
                      placeholder="https://huggingface.co/meta-llama/Meta-Llama-3-8B"
                    />
                  </label>
                )}

                {validationResult && (
                  <div className={`banner ${validationResult.status === 'insufficient' ? 'error' : validationResult.status === 'warning' ? 'info' : 'success'}`} style={{ fontSize: '0.85rem', padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                      <Sparkles size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <span>{validationResult.message}</span>
                    </div>
                  </div>
                )}

                <button className="primary-button" type="submit" disabled={busy === 'register-self-hosted'}>
                  {busy === 'register-self-hosted' ? <LoaderCircle className="spin" size={16} /> : <Rocket size={16} />}
                  Register Endpoint
                </button>
              </form>
            </Panel>
          </div>
        ) : null}

        {activeSection === 'instances' ? (
          <div className="section-grid two-col">
            <Panel title="Create Instance" icon={Rocket}>
              <form className="stack-form dense-grid" onSubmit={handleCreateInstance}>
                <div className="form-hint full-span">
                  Loaded {Object.keys(dashboard.providerInfo).length} providers and {dashboard.gpuSpecs.length} GPU specs for instance setup.
                </div>
                <label>
                  <span>Provider</span>
                  <select
                    value={instanceForm.provider_name}
                    onChange={(event) => setInstanceForm((current) => ({ ...current, provider_name: event.target.value }))}
                  >
                    <option value="runpod">runpod</option>
                    <option value="vultr">vultr</option>
                    <option value="novita">novita</option>
                    <option value="verda">verda</option>
                    <option value="vastai">vastai</option>
                  </select>
                </label>
                <label>
                  <span>Instance Name</span>
                  <input
                    value={instanceForm.instance_name}
                    onChange={(event) => setInstanceForm((current) => ({ ...current, instance_name: event.target.value }))}
                  />
                </label>
                <label>
                  <span>GPU ID</span>
                  <input
                    value={instanceForm.gpu_id}
                    onChange={(event) => setInstanceForm((current) => ({ ...current, gpu_id: event.target.value }))}
                    placeholder="Optional provider GPU id"
                  />
                </label>
                <label>
                  <span>GPU Count</span>
                  <input
                    type="number"
                    min={1}
                    value={instanceForm.gpu_num}
                    onChange={(event) => setInstanceForm((current) => ({ ...current, gpu_num: Number(event.target.value) }))}
                  />
                </label>
                <label>
                  <span>Disk Size</span>
                  <input
                    type="number"
                    min={20}
                    value={instanceForm.disk_size}
                    onChange={(event) => setInstanceForm((current) => ({ ...current, disk_size: Number(event.target.value) }))}
                  />
                </label>
                <label>
                  <span>Region</span>
                  <input
                    value={instanceForm.region}
                    onChange={(event) => setInstanceForm((current) => ({ ...current, region: event.target.value }))}
                  />
                </label>
                <label className="full-span">
                  <span>Image URL</span>
                  <input
                    value={instanceForm.image_url}
                    onChange={(event) => setInstanceForm((current) => ({ ...current, image_url: event.target.value }))}
                  />
                </label>
                <label className="full-span">
                  <span>Startup Script</span>
                  <textarea
                    rows={5}
                    value={instanceForm.startup_script}
                    onChange={(event) => setInstanceForm((current) => ({ ...current, startup_script: event.target.value }))}
                  />
                </label>
                <button className="primary-button full-span" type="submit" disabled={busy === 'create-instance'}>
                  {busy === 'create-instance' ? <LoaderCircle className="spin" size={16} /> : <Rocket size={16} />}
                  Create Instance
                </button>
              </form>
            </Panel>

            <Panel title="Live Instances" icon={Server}>
              <div className="instance-list">
                {dashboard.instances.length === 0 ? <EmptyState text="No instances returned yet." /> : null}
                {dashboard.instances.map((instance, index) => {
                  const instanceId = String(instance.instance_id ?? instance.unique_instance_id ?? instance.id ?? `instance-${index}`);
                  const provider = String(instance.provider_name ?? 'runpod');
                  return (
                    <div className="instance-card" key={instanceId}>
                      <div>
                        <h4>{String(instance.instance_name ?? instanceId)}</h4>
                        <p>{provider} · {String(instance.region ?? 'unknown region')}</p>
                      </div>
                      <div className="pill-row">
                        <span className="status-pill">{formatValue(instance.instance_status ?? instance.status)}</span>
                        <span className="status-pill soft">{formatValue(instance.gpu_name ?? instance.gpu_id)}</span>
                      </div>
                      <div className="action-row">
                        <button className="ghost-button" type="button" onClick={() => handleInstanceAction('start-instance', instanceId, provider)}>Start</button>
                        <button className="ghost-button" type="button" onClick={() => handleInstanceAction('stop-instance', instanceId, provider)}>Stop</button>
                        <button className="ghost-button" type="button" onClick={() => handleInstanceAction('restart-instance', instanceId, provider)}>Restart</button>
                        <button className="danger-button" type="button" onClick={() => handleDeleteInstance(instanceId, provider)}>Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        ) : null}

        {activeSection === 'apiKeys' ? (
          <div className="card-stack" style={{ gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>API Keys</h2>
              <button 
                className="primary-button" 
                onClick={() => setShowCreateKeyModal(true)}
                style={{ padding: '8px 16px', fontSize: '0.9rem' }}
              >
                Create New API Key
              </button>
            </div>

            <div className="glass-panel" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <KeyRound size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                <input 
                  placeholder="Search API keys..." 
                  style={{ width: '100%', padding: '10px 10px 10px 36px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', color: 'var(--text)' }}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                <input type="checkbox" style={{ accentColor: 'var(--accent)' }} />
                Show inactive keys
              </label>
            </div>

            <div className="glass-panel" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', textAlign: 'center' }}>
              {dashboard.apiKeys.length === 0 ? (
                <div style={{ maxWidth: '400px' }}>
                  <p style={{ color: 'var(--muted)', marginBottom: '20px', fontSize: '1rem' }}>No API keys found. Create a new key to get started.</p>
                  <button 
                    className="primary-button"
                    style={{ margin: '0 auto' }}
                    onClick={() => setShowCreateKeyModal(true)}
                  >
                    Create New API Key
                  </button>
                </div>
              ) : (
                <div style={{ width: '100%' }} className="card-stack">
                  {dashboard.apiKeys.map((apiKey, index) => {
                    const name = String(apiKey.api_key_name ?? apiKey.id ?? `key-${index}`);
                    return (
                      <div className="sub-card" key={name} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ textAlign: 'left' }}>
                          <h4 style={{ margin: '0 0 4px 0' }}>{name}</h4>
                          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>{formatValue(apiKey.environment)} · {formatValue(apiKey.prefix)}</p>
                        </div>
                        <button className="danger-button" type="button" onClick={() => handleDeleteApiKey(name)}>
                          Delete
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <Modal 
              title="Create New API Key" 
              isOpen={showCreateKeyModal} 
              onClose={() => setShowCreateKeyModal(false)}
            >
              <form className="stack-form" onSubmit={async (e) => { e.preventDefault(); await handleCreateApiKey(e); setShowCreateKeyModal(false); }}>
                <label>
                  <span style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '8px', display: 'block' }}>API Key Name</span>
                  <input 
                    value={apiKeyName} 
                    onChange={(event) => setApiKeyName(event.target.value)} 
                    placeholder="e.g. Production API Key"
                    autoFocus
                    style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '12px' }}
                  />
                  <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--muted)', opacity: 0.8 }}>
                    Give your API key a name to help you identify what it's used for.
                  </div>
                </label>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                  <button className="secondary-button" type="button" onClick={() => setShowCreateKeyModal(false)}>Cancel</button>
                  <button 
                    className="primary-button" 
                    type="submit" 
                    disabled={busy === 'create-key'}
                    style={{ background: 'var(--accent)', color: '#081018', fontWeight: 700 }}
                  >
                    {busy === 'create-key' ? <LoaderCircle className="spin" size={16} /> : null}
                    Create API Key
                  </button>
                </div>
              </form>
            </Modal>
          </div>
        ) : null}

        {activeSection === 'routing' ? (
          <div className="section-grid two-col">
            <Panel title="Create Intelligent Endpoint" icon={Orbit}>
              <form className="stack-form" onSubmit={handleCreateIntelligentEndpoint}>
                <label>
                  <span>Name</span>
                  <input
                    value={intelligentEndpointName}
                    onChange={(event) => setIntelligentEndpointName(event.target.value)}
                    placeholder="Primary intelligent router"
                  />
                </label>
                <button className="primary-button" type="submit" disabled={busy === 'create-intelligent-endpoint'}>
                  {busy === 'create-intelligent-endpoint' ? <LoaderCircle className="spin" size={16} /> : <Orbit size={16} />}
                  Create Intelligent Endpoint
                </button>
              </form>
            </Panel>

            <Panel title="Create Inference API Endpoint" icon={Rocket}>
              <form className="stack-form dense-grid" onSubmit={handleCreateInferenceEndpoint}>
                <label className="full-span">
                  <span>Name</span>
                  <input
                    value={inferenceForm.name}
                    onChange={(event) => setInferenceForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Primary local vLLM"
                  />
                </label>
                <label>
                  <span>Deployment Target</span>
                  <select
                    value={inferenceForm.deployment_target}
                    onChange={(event) => setInferenceForm((current) => ({ ...current, deployment_target: event.target.value as 'cloud' | 'local' }))}
                  >
                    <option value="cloud">cloud</option>
                    <option value="local">local</option>
                  </select>
                </label>
                <label>
                  <span>Provider</span>
                  <select
                    value={inferenceForm.provider}
                    onChange={(event) => setInferenceForm((current) => ({ ...current, provider: event.target.value }))}
                  >
                    <option value="openai">openai</option>
                    <option value="anthropic">anthropic</option>
                    <option value="groq">groq</option>
                    <option value="deepseek">deepseek</option>
                    <option value="google">google</option>
                    <option value="grok">grok</option>
                    <option value="novita">novita</option>
                  </select>
                </label>
                <label>
                  <span>Model ID</span>
                  <input
                    value={inferenceForm.model_id}
                    onChange={(event) => setInferenceForm((current) => ({ ...current, model_id: event.target.value }))}
                    placeholder={inferenceForm.deployment_target === 'local' ? 'Model served by the local runtime' : 'Model id from the catalog'}
                  />
                </label>
                {inferenceForm.deployment_target === 'local' ? (
                  <>
                    <label className="full-span">
                      <span>Local Endpoint URL</span>
                      <input
                        value={inferenceForm.endpoint_url}
                        onChange={(event) => setInferenceForm((current) => ({ ...current, endpoint_url: event.target.value }))}
                        placeholder="https://api.oneinfer.ai/v1"
                      />
                    </label>
                    <label>
                      <span>Machine ID</span>
                      <input
                        value={inferenceForm.machine_id}
                        onChange={(event) => setInferenceForm((current) => ({ ...current, machine_id: event.target.value }))}
                        placeholder={typeof dashboard.machineDetails?.machineId === 'string' ? dashboard.machineDetails.machineId : 'Detected machine id'}
                      />
                    </label>
                    <label>
                      <span>Machine Name</span>
                      <input
                        value={inferenceForm.machine_name}
                        onChange={(event) => setInferenceForm((current) => ({ ...current, machine_name: event.target.value }))}
                        placeholder={typeof dashboard.machineDetails?.machineName === 'string' ? dashboard.machineDetails.machineName : 'Detected machine name'}
                      />
                    </label>
                  </>
                ) : null}
                <label>
                  <span>Top P</span>
                  <input
                    type="number"
                    step="0.1"
                    value={inferenceForm.top_p}
                    onChange={(event) => setInferenceForm((current) => ({ ...current, top_p: Number(event.target.value) }))}
                  />
                </label>
                <label>
                  <span>Temperature</span>
                  <input
                    type="number"
                    step="0.1"
                    value={inferenceForm.temperature}
                    onChange={(event) => setInferenceForm((current) => ({ ...current, temperature: Number(event.target.value) }))}
                  />
                </label>
                <label className="full-span">
                  <span>Max Tokens</span>
                  <input
                    type="number"
                    value={inferenceForm.max_tokens}
                    onChange={(event) => setInferenceForm((current) => ({ ...current, max_tokens: Number(event.target.value) }))}
                  />
                </label>
                <button className="primary-button full-span" type="submit" disabled={busy === 'create-inference-endpoint'}>
                  {busy === 'create-inference-endpoint' ? <LoaderCircle className="spin" size={16} /> : <Rocket size={16} />}
                  Create Inference API Endpoint
                </button>
              </form>
            </Panel>

            <Panel title="Attach Endpoint" icon={Blocks}>
              <form className="stack-form" onSubmit={handleAttachEndpoint}>
                <label>
                  <span>Intelligent Endpoint ID</span>
                  <input
                    value={attachForm.intelligentEndpointId}
                    onChange={(event) => setAttachForm((current) => ({ ...current, intelligentEndpointId: event.target.value }))}
                  />
                </label>
                <label>
                  <span>Endpoint Type</span>
                  <select
                    value={attachForm.endpointType}
                    onChange={(event) => setAttachForm((current) => ({ ...current, endpointType: event.target.value }))}
                  >
                    <option value="inference_api">inference_api</option>
                    <option value="dedicated">dedicated</option>
                  </select>
                </label>
                <label>
                  <span>Endpoint ID</span>
                  <input
                    value={attachForm.endpointId}
                    onChange={(event) => setAttachForm((current) => ({ ...current, endpointId: event.target.value }))}
                  />
                </label>
                <button className="primary-button" type="submit" disabled={busy === 'attach-endpoint'}>
                  {busy === 'attach-endpoint' ? <LoaderCircle className="spin" size={16} /> : <Blocks size={16} />}
                  Attach
                </button>
              </form>
            </Panel>

            <Panel title="Endpoint Inventory" icon={Orbit}>
              <div className="routing-columns">
                <div>
                  <h4>Intelligent Endpoints</h4>
                  <MiniTable columns={['name', 'intelligent_endpoint_id', 'status']} rows={dashboard.intelligentEndpoints} emptyText="No intelligent endpoints." />
                </div>
                <div>
                  <h4>Inference Endpoints</h4>
              <MiniTable columns={['name', 'deployment_target', 'model_id', 'endpoint_url']} rows={dashboard.inferenceEndpoints} emptyText="No inference endpoints." />
                </div>
              </div>
            </Panel>
          </div>
        ) : null}

        {activeSection === 'bandwidth' ? (
          <div className="card-stack" style={{ gap: '24px' }}>
            <Panel title="Active Subscriptions" icon={Wifi}>
              <div style={{ marginBottom: '16px', color: 'var(--muted)', fontSize: '0.9rem' }}>
                We are supporting models <a href="#" style={{ color: 'var(--accent)', textDecoration: 'none' }}>View Models</a>
              </div>
              <div className="card-stack" style={{ gap: '16px' }}>
                {/* Starter Plan */}
                {(() => {
                  const currentPlan = getPlanName(dashboard.profile);
                  const isStarter = currentPlan.toLowerCase() === 'starter';
                  const isPro = currentPlan.toLowerCase() === 'pro';
                  const isTeam = currentPlan.toLowerCase() === 'team';
                  const isScale = currentPlan.toLowerCase() === 'scale';
                  
                  return (
                    <>
                      <div className="sub-card" style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '20px', border: isStarter ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.06)', background: isStarter ? 'rgba(116, 227, 197, 0.05)' : 'rgba(255,255,255,0.02)' }}>
                        <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: isStarter ? 'var(--accent)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isStarter ? '#081018' : 'var(--muted)' }}>
                          <Zap size={28} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Starter</h3>
                            {isStarter && <span style={{ fontSize: '0.65rem', background: 'rgba(116, 227, 197, 0.2)', color: 'var(--accent)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>Current</span>}
                          </div>
                          <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>₹499.00 <span style={{ fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 400 }}>/mo</span></div>
                        </div>
                        <div style={{ flex: 1, borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '24px' }}>
                          <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Bandwidth</div>
                          <div style={{ fontWeight: 600 }}>1 RPM <span style={{ color: 'var(--muted)', fontWeight: 400 }}>Guaranteed</span></div>
                        </div>
                        <button className="primary-button" disabled={isStarter} style={{ background: isStarter ? 'var(--accent)' : 'rgba(255,255,255,0.1)', color: isStarter ? '#081018' : 'var(--text)', border: 'none' }}>{isStarter ? 'Current Plan' : 'Upgrade'}</button>
                      </div>

                      <div className="sub-card" style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '20px', border: isPro ? '1px solid #71beff' : '1px solid rgba(255,255,255,0.06)', background: isPro ? 'rgba(113, 190, 255, 0.05)' : 'rgba(255,255,255,0.02)' }}>
                        <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: isPro ? '#71beff' : 'rgba(113, 190, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isPro ? '#081018' : '#71beff' }}>
                          <Zap size={28} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Pro</h3>
                            {isPro ? <span style={{ fontSize: '0.65rem', background: 'rgba(113, 190, 255, 0.2)', color: '#71beff', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>Current</span> : <span style={{ fontSize: '0.65rem', background: 'rgba(113, 190, 255, 0.2)', color: '#71beff', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>Popular</span>}
                          </div>
                          <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>₹1,999.00 <span style={{ fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 400 }}>/mo</span></div>
                        </div>
                        <div style={{ flex: 1, borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '24px' }}>
                          <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Bandwidth</div>
                          <div style={{ fontWeight: 600 }}>3 RPM <span style={{ color: 'var(--muted)', fontWeight: 400 }}>Guaranteed</span></div>
                        </div>
                        <button className="primary-button" disabled={isPro} style={{ background: isPro ? '#71beff' : 'rgba(255,255,255,0.1)', color: isPro ? '#081018' : 'var(--text)', border: 'none' }}>{isPro ? 'Current Plan' : 'Upgrade'}</button>
                      </div>

                      <div className="sub-card" style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '20px', border: isTeam ? '1px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.06)', background: isTeam ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)' }}>
                        <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: isTeam ? 'white' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isTeam ? '#081018' : 'var(--muted)' }}>
                          <Zap size={28} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Team</h3>
                            {isTeam && <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.2)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>Current</span>}
                          </div>
                          <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>₹3,999.00 <span style={{ fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 400 }}>/mo</span></div>
                        </div>
                        <div style={{ flex: 1, borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '24px' }}>
                          <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Bandwidth</div>
                          <div style={{ fontWeight: 600 }}>8 RPM <span style={{ color: 'var(--muted)', fontWeight: 400 }}>Guaranteed</span></div>
                        </div>
                        <button className="primary-button" disabled={isTeam} style={{ background: isTeam ? 'white' : 'rgba(255,255,255,0.1)', color: isTeam ? '#081018' : 'var(--text)', border: 'none' }}>{isTeam ? 'Current Plan' : 'Upgrade'}</button>
                      </div>

                      <div className="sub-card" style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '20px', border: isScale ? '1px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.06)', background: isScale ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)' }}>
                        <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: isScale ? 'white' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isScale ? '#081018' : 'var(--muted)' }}>
                          <Zap size={28} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Scale</h3>
                            {isScale && <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.2)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>Current</span>}
                          </div>
                          <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>₹8,999.00 <span style={{ fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 400 }}>/mo</span></div>
                        </div>
                        <div style={{ flex: 1, borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '24px' }}>
                          <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Bandwidth</div>
                          <div style={{ fontWeight: 600 }}>26 RPM <span style={{ color: 'var(--muted)', fontWeight: 400 }}>Guaranteed</span></div>
                        </div>
                        <button className="primary-button" disabled={isScale} style={{ background: isScale ? 'white' : 'rgba(255,255,255,0.1)', color: isScale ? '#081018' : 'var(--text)', border: 'none' }}>{isScale ? 'Current Plan' : 'Upgrade'}</button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </Panel>

            {/* Inference API Fallback */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
                  <Sparkles size={24} />
                </div>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem' }}>Inference API Fallback</h3>
                  <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
                    When RPM limits are reached, fallback to Standard Inference API. <a href="#" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Uses standard credits.</a>
                  </p>
                </div>
              </div>
              <label className="switch">
                <input type="checkbox" defaultChecked />
                <span className="slider round"></span>
              </label>
            </div>
          </div>
        ) : null}

        {activeSection === 'settings' ? (
          <div className="settings-modern-layout">
            <div className="settings-nav-tabs">
              <button className={`settings-tab-btn ${settingsTab === 'account' ? 'active' : ''}`} onClick={() => setSettingsTab('account')}>
                 Profile
              </button>
              <button className={`settings-tab-btn ${settingsTab === 'security' ? 'active' : ''}`} onClick={() => setSettingsTab('security')}>
                 Security
              </button>
              <button className={`settings-tab-btn ${settingsTab === 'notifications' ? 'active' : ''}`} onClick={() => setSettingsTab('notifications')}>
                 Notifications
              </button>
            </div>

            <div className="settings-main-card glass-panel">
              {settingsTab === 'account' && (
                <>
                  <div className="settings-card-header">
                    <div>
                      <h2 style={{ fontSize: '1.8rem', margin: 0 }}>Profile Settings</h2>
                      <p style={{ color: 'var(--muted)', margin: '4px 0 0 0' }}>Manage your personal information and account details</p>
                    </div>
                    <button className="primary-button ghost" style={{ borderRadius: '8px', border: '1px solid var(--accent)', color: 'var(--accent)', background: 'transparent' }}>
                      <Edit size={14} /> Edit Profile
                    </button>
                  </div>

                  <div className="profile-settings-grid">
                    {(() => {
                      const rawProfile = (dashboard.profile?.developer || dashboard.profile) as any;
                      return (
                        <>
                          <div className="form-group">
                            <label>First Name</label>
                            <input value={rawProfile?.first_name || 'Arunkumar'} readOnly />
                          </div>
                          <div className="form-group">
                            <label>Last Name</label>
                            <input value={rawProfile?.last_name || 'soundararajan'} readOnly />
                          </div>
                          <div className="form-group full-width">
                            <label>Email Address</label>
                            <input value={rawProfile?.email || 'sarunkumar1990@gmail.com'} readOnly />
                          </div>
                          <div className="form-group">
                            <label>Organization</label>
                            <input value={rawProfile?.organization || 'testingorg'} readOnly />
                          </div>
                          <div className="form-group">
                            <label>Organization Type</label>
                            <input value={rawProfile?.organization_type || 'individual'} readOnly />
                          </div>
                          <div className="form-group">
                            <label>Designation</label>
                            <input value={rawProfile?.designation || 'developer'} readOnly />
                          </div>
                          <div className="form-group">
                            <label>Date of Birth</label>
                            <input value={rawProfile?.dob || 'Not provided'} readOnly />
                          </div>
                          <div className="form-group full-width" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <label style={{ marginBottom: '8px' }}>Developer ID</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <input 
                                value={String(dashboard.profile?.developer_id || session.developerId)} 
                                readOnly 
                                style={{ flex: 1, border: 'none', background: 'transparent', padding: 0, fontSize: '0.9rem', color: 'var(--text)' }} 
                              />
                              <button className="ghost-button" style={{ fontSize: '0.7rem' }}>Copy</button>
                            </div>
                            <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>This ID cannot be changed</p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </>
              )}

              {settingsTab === 'security' && (
                <>
                  <div className="settings-card-header">
                    <div>
                      <h2 style={{ fontSize: '1.8rem', margin: 0 }}>Security Settings</h2>
                      <p style={{ color: 'var(--muted)', margin: '4px 0 0 0' }}>Manage your account security and authentication</p>
                    </div>
                  </div>

                  <div className="security-stack">
                    <div className="status-card info" style={{ background: 'rgba(37, 99, 235, 0.05)', border: '1px solid rgba(37, 99, 235, 0.1)' }}>
                      <div className="status-card-icon" style={{ background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb' }}>
                        <ShieldCheck size={20} />
                      </div>
                      <div className="status-card-content">
                        <h4 style={{ color: '#2563eb', marginBottom: '8px' }}>OTP-Based Authentication</h4>
                        <p style={{ fontSize: '0.95rem', opacity: 0.8, lineHeight: 1.5 }}>Your account is secured with OTP (One-Time Password) authentication. No password is required for login.</p>
                        
                        <div className="how-it-works" style={{ marginTop: '16px', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                          <p style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '12px' }}>How it works:</p>
                          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem', color: 'var(--muted)', listStyle: 'disc' }}>
                            <li style={{ marginBottom: '8px' }}>Enter your email address to login</li>
                            <li style={{ marginBottom: '8px' }}>Receive a secure OTP code via email</li>
                            <li style={{ marginBottom: '8px' }}>Enter the OTP to access your account</li>
                            <li>No password needed - more secure and convenient</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="status-card success" style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.1)', marginTop: '24px' }}>
                      <div className="status-card-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                        <Bell size={20} />
                      </div>
                      <div className="status-card-content">
                        <h4 style={{ color: '#10b981', marginBottom: '8px' }}>Security Notifications</h4>
                        <p style={{ fontSize: '0.95rem', opacity: 0.8 }}>Get notified about important security events on your account</p>
                        
                        <div className="checkbox-group" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <label className="checkbox-label">
                            <input type="checkbox" defaultChecked />
                            <span>Email me when someone logs into my account</span>
                          </label>
                          <label className="checkbox-label">
                            <input type="checkbox" defaultChecked />
                            <span>Email me about API key changes</span>
                          </label>
                          <label className="checkbox-label">
                            <input type="checkbox" defaultChecked />
                            <span>Email me about billing changes</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {settingsTab === 'notifications' && (
                <>
                  <div className="settings-card-header">
                    <div>
                      <h2 style={{ fontSize: '1.8rem', margin: 0 }}>Notification Preferences</h2>
                      <p style={{ color: 'var(--muted)', margin: '4px 0 0 0' }}>Choose what notifications you want to receive and how</p>
                    </div>
                  </div>

                  <div className="notifications-stack">
                    <div className="preference-section" style={{ background: 'rgba(255,255,255,0.02)', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <h4 style={{ marginBottom: '20px', color: 'var(--accent)' }}>Email Notifications</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {[
                          { title: 'Credit Balance Alerts', desc: 'Get notified when your credit balance is low', checked: true },
                          { title: 'Service Updates', desc: 'Get notified about new features and service updates', checked: true },
                          { title: 'Weekly Usage Reports', desc: 'Get a weekly summary of your API usage', checked: false },
                          { title: 'Marketing Communications', desc: 'Receive updates about new models and promotional offers', checked: false }
                        ].map((pref, i) => (
                          <div key={i} className="pref-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <div>
                              <p style={{ fontWeight: 600, margin: '0 0 4px 0' }}>{pref.title}</p>
                              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: 0 }}>{pref.desc}</p>
                            </div>
                            <input type="checkbox" defaultChecked={pref.checked} style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }} />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="preference-section" style={{ background: 'rgba(255, 255, 0, 0.02)', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255, 255, 0, 0.05)', marginTop: '24px' }}>
                      <h4 style={{ marginBottom: '20px', color: '#fbbf24', textAlign: 'left' }}>Notification Frequency</h4>
                      <div className="radio-group" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'flex-start' }}>
                        {[
                          { label: 'Real-time (immediate notifications)', value: 'realtime', checked: true },
                          { label: 'Daily digest (once per day)', value: 'daily', checked: false },
                          { label: 'Weekly summary (once per week)', value: 'weekly', checked: false }
                        ].map((freq, i) => (
                          <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', width: 'auto' }}>
                            <input type="radio" name="freq" defaultChecked={freq.checked} style={{ margin: 0, width: '18px', height: '18px', accentColor: '#fbbf24' }} />
                            <span style={{ fontSize: '0.95rem', color: 'var(--text)', whiteSpace: 'nowrap' }}>{freq.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '32px' }}>
                      <button className="primary-button" style={{ gap: '10px', padding: '12px 24px' }}>
                        <Save size={18} /> Save Notification Settings
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}

        {busy?.startsWith('load-') ? (
          <div className="floating-status">
            <LoaderCircle className="spin" size={16} />
            Syncing {busy.replace('load-', '')}
          </div>
        ) : null}
      </main>
    </div>
  );
}

function HardwareWidget(props: { machine: DashboardState['machineDetails'] }) {
  const { machine } = props;

  if (!machine) {
    return (
      <div className="hw-widget glass-panel">
        <div className="hw-widget-header">
          <Server size={15} />
          <span>Local Hardware</span>
        </div>
        <p className="hw-widget-empty">Machine profile not synced yet.</p>
      </div>
    );
  }

  const gpuCount = Array.isArray(machine.gpus) ? machine.gpus.length : 0;
  const gpuLabel = gpuCount === 0
    ? 'No GPU'
    : gpuCount === 1
      ? String(machine.gpus![0].name ?? machine.gpus![0].model ?? '1 GPU')
      : `${gpuCount} GPUs`;

  const stats: Array<{ label: string; value: string }> = [
    { label: 'Machine', value: String(machine.machineName ?? machine.hostname ?? '—') },
    { label: 'CPU', value: String(machine.cpu?.brand ?? machine.cpu?.manufacturer ?? '—') },
    { label: 'RAM', value: typeof machine.memory?.totalGb === 'number' ? `${machine.memory.totalGb} GB` : '—' },
    { label: 'GPU', value: gpuLabel },
  ];

  return (
    <div className="hw-widget glass-panel">
      <div className="hw-widget-header">
        <Server size={15} />
        <span>Local Hardware</span>
      </div>
      <div className="hw-widget-stats">
        {stats.map(({ label, value }) => (
          <div className="hw-stat" key={label}>
            <span className="hw-stat-label">{label}</span>
            <strong className="hw-stat-value">{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroChip(props: { icon: typeof Rocket; title: string; text: string }) {
  const Icon = props.icon;
  return (
    <div className="hero-chip">
      <Icon size={18} />
      <div>
        <strong>{props.title}</strong>
        <p>{props.text}</p>
      </div>
    </div>
  );
}

function Panel(props: { title: string; icon: typeof Sparkles; children: React.ReactNode }) {
  const Icon = props.icon;
  return (
    <section className="content-panel glass-panel">
      <div className="panel-header">
        <div className="panel-title">
          <Icon size={18} />
          <h3>{props.title}</h3>
        </div>
      </div>
      {props.children}
    </section>
  );
}

function Banner(props: { tone: 'info' | 'success' | 'error'; text: string }) {
  return <div className={`banner ${props.tone}`}>{props.text}</div>;
}

function DataList(props: { entries: Array<[string, unknown]>; emptyText: string }) {
  if (props.entries.length === 0) {
    return <EmptyState text={props.emptyText} />;
  }

  return (
    <div className="data-list">
      {props.entries.map(([label, value]) => (
        <div className="data-row" key={label}>
          <span>{label}</span>
          <strong>{formatValue(value)}</strong>
        </div>
      ))}
    </div>
  );
}

function MiniTable(props: { columns: string[]; rows: Array<Record<string, unknown>>; emptyText: string }) {
  if (props.rows.length === 0) {
    return <EmptyState text={props.emptyText} />;
  }

  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            {props.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, index) => (
            <tr key={`${index}-${props.columns.map((column) => formatValue(row[column])).join('-')}`}>
              {props.columns.map((column) => (
                <td key={column}>{formatValue(row[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState(props: { text: string }) {
  return <div className="empty-state">{props.text}</div>;
}

function ClaudeCodeSetupPanel(props: {
  provider: 'oneinfer' | 'anthropic';
  onSetProvider: (p: 'oneinfer' | 'anthropic') => void;
  busy: string | null;
}) {
  const isOneinfer = props.provider === 'oneinfer';
  const busyConfig = props.busy === 'configure-claude-code';

  return (
    <section className={`content-panel glass-panel cc-widget cc-widget--${props.provider}`}>
      <div className="panel-header">
        <div className="panel-title">
          <Bot size={18} />
          <h3>Claude Code Setup</h3>
        </div>
      </div>

      <div className="cc-toggle">
        <button
          className={`cc-toggle-btn${isOneinfer ? ' active' : ''}`}
          type="button"
          onClick={() => props.onSetProvider('oneinfer')}
          disabled={busyConfig}
        >
          {busyConfig && isOneinfer ? <LoaderCircle className="spin" size={14} /> : <Orbit size={14} />}
          OneInfer API
        </button>
        <button
          className={`cc-toggle-btn${!isOneinfer ? ' active' : ''}`}
          type="button"
          onClick={() => props.onSetProvider('anthropic')}
          disabled={busyConfig}
        >
          {busyConfig && !isOneinfer ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />}
          Anthropic API
        </button>
      </div>
    </section>
  );
}

function OpenCodeSetupPanel(props: {
  busy: string | null;
  onEnable: () => void;
}) {
  const busyConfig = props.busy === 'configure-opencode';

  return (
    <section className="content-panel glass-panel">
      <div className="panel-header">
        <div className="panel-title">
          <Blocks size={18} />
          <h3>OpenCode Setup</h3>
        </div>
      </div>

      <div className="stack-form">
        <div className="form-hint">
          Install OpenCode automatically if it is missing, then write a global OneInfer-backed
          configuration for this user account.
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={props.onEnable}
          disabled={busyConfig}
        >
          {busyConfig ? <LoaderCircle className="spin" size={16} /> : <Blocks size={16} />}
          Enable OpenCode Globally
        </button>
      </div>
    </section>
  );
}

function OpenClawSetupPanel(props: {
  busy: string | null;
  onEnable: () => void;
}) {
  const busyConfig = props.busy === 'configure-openclaw';

  return (
    <section className="content-panel glass-panel">
      <div className="panel-header">
        <div className="panel-title">
          <Blocks size={18} />
          <h3>OpenClaw Setup</h3>
        </div>
      </div>

      <div className="stack-form">
        <div className="form-hint">
          Install OpenClaw automatically if it is missing, then write a global OneInfer-backed
          configuration for this user account.
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={props.onEnable}
          disabled={busyConfig}
        >
          {busyConfig ? <LoaderCircle className="spin" size={16} /> : <Blocks size={16} />}
          Enable OpenClaw Globally
        </button>
      </div>
    </section>
  );
}

function Modal({ title, isOpen, onClose, children }: { title: string; isOpen: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="ghost-button" onClick={onClose} style={{ padding: '8px' }}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}

export default App;
