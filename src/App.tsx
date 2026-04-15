import { useEffect, useState, type FormEvent } from 'react';
import {
  AppWindowMac,
  Blocks,
  Bot,
  Download,
  KeyRound,
  LoaderCircle,
  LogOut,
  Menu,
  Orbit,
  Wifi,
  RefreshCw,
  RotateCcw,
  Rocket,
  Send,
  Server,
  ShieldCheck,
  Sparkles,
  X,
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
  loginWithOtp,
  normalizeApiBaseUrl,
  normalizeList,
  requestOtp,
  runInstanceAction,
} from './api';
import { syncLocalMachineProfile } from './helpers/machineDetails';
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
  const [otp, setOtp] = useState('');
  const [selfHostForm, setSelfHostForm] = useState({ name: '', model_id: '', endpoint_url: 'http://127.0.0.1:8000/v1' });
  const [instanceForm, setInstanceForm] = useState<CreateInstanceFormState>(defaultInstanceForm);
  const [apiKeyName, setApiKeyName] = useState('Desktop Key');
  const [apiKeyEnvironment, setApiKeyEnvironment] = useState('production');
  const [intelligentEndpointName, setIntelligentEndpointName] = useState('');
  const [inferenceForm, setInferenceForm] = useState<CreateInferenceFormState>(defaultInferenceForm);
  const [attachForm, setAttachForm] = useState({
    intelligentEndpointId: '',
    endpointType: 'inference_api',
    endpointId: '',
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  async function persistState(nextSession: DesktopSession | null, nextApiBaseUrl: string) {
    if (!window.desktopBridge) {
      return;
    }

    await window.desktopBridge.saveState({
      session: nextSession,
      settings: { apiBaseUrl: nextApiBaseUrl },
    });
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

      const nextBaseUrl = defaultSettings.apiBaseUrl;
      setSettingsDraft({ apiBaseUrl: nextBaseUrl });
      setSession(storedState?.session ?? null);
      setLoadedSections(createLoadedSections());
      setEmail(storedState?.session?.email ?? '');
      setAppVersion(version ?? '');
      if (initialUpdateStatus) {
        setUpdateStatus(initialUpdateStatus);
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
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

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
      await persistState(nextSession, settingsDraft.apiBaseUrl);
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
        apiBaseUrl: settingsDraft.apiBaseUrl,
        session,
      });

      setMessage({
        tone: 'success',
        text: `Claude Code enabled with ${result.apiKeyName}. Base URL: ${result.anthropicBaseUrl}. Model: ${result.anthropicModel}`,
      });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to enable Claude Code.' });
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

    if (!selfHostForm.endpoint_url) {
      setMessage({ tone: 'error', text: 'Local endpoint URL is required.' });
      return;
    }

    const detectedMachineId = typeof dashboard.machineDetails?.machineId === 'string' ? dashboard.machineDetails.machineId : '';
    const detectedMachineName = typeof dashboard.machineDetails?.machineName === 'string'
      ? dashboard.machineDetails.machineName
      : typeof dashboard.machineDetails?.hostname === 'string'
        ? dashboard.machineDetails.hostname
        : '';

    setBusy('register-self-hosted');
    try {
      await createInferenceEndpoint(settingsDraft.apiBaseUrl, session, {
        name: selfHostForm.name,
        provider: 'openai',
        model_id: selfHostForm.model_id,
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

  function handleClaudeCodeLoginHint() {
    setMessage({
      tone: 'info',
      text: 'Log in first, then use the Enable Claude Code button from Overview or Settings.',
    });
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
    await persistState(null, settingsDraft.apiBaseUrl);
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

            <form className="stack-form" onSubmit={handleLogin}>
              <label>
                <span>One-Time Password</span>
                <input value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="Enter OTP" />
              </label>
              <button className="secondary-button" type="submit" disabled={busy === 'login'}>
                {busy === 'login' ? <LoaderCircle className="spin" size={16} /> : <Rocket size={16} />}
                Enter Workspace
              </button>
            </form>

            <div className="stack-form">
              <div className="form-hint">
                Claude Code setup becomes available right after login. The desktop app will create a OneInfer API key for this device and update your Claude Code user settings automatically.
              </div>
              <button className="ghost-button" type="button" onClick={handleClaudeCodeLoginHint}>
                <Bot size={16} />
                Enable Claude Code
              </button>
            </div>
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

      <aside className={`sidebar glass-panel${sidebarOpen ? ' open' : ''}`}>
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
      </aside>

      <main className="main-stage">
        <section className="hero-panel hero-panel--single glass-panel">
          <div>
            <div className="eyebrow">Unified API + Infrastructure Desktop</div>
            <h2>Operate your developer platform without living in raw HTTP requests.</h2>
            <p>
              This app targets Windows, Linux, and macOS with native installers per operating system and connects to
              the OneInfer API service by default.
            </p>
          </div>
        </section>

        {message ? <Banner tone={message.tone} text={message.text} /> : null}

        {activeSection === 'overview' ? (
          <div className="section-grid">
            <Panel title="Claude Code Setup" icon={Bot}>
              <div className="stack-form">
                <div className="form-hint">
                  Configure Claude Code for this machine using your current OneInfer session. This writes your user-level Claude Code settings file with the OneInfer Anthropic-compatible gateway.
                </div>
                <button
                  className="primary-button"
                  type="button"
                  onClick={handleEnableClaudeCode}
                  disabled={busy === 'configure-claude-code'}
                >
                  {busy === 'configure-claude-code' ? <LoaderCircle className="spin" size={16} /> : <Bot size={16} />}
                  Enable Claude Code
                </button>
              </div>
            </Panel>

            <Panel title="Credits" icon={ShieldCheck}>
              <DataList
                entries={getAvailableCreditsEntries(dashboard.credits)}
                emptyText="Credit data not loaded."
              />
            </Panel>

            <HardwareWidget machine={dashboard.machineDetails} />
          </div>
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
                <label>
                  <span>Endpoint URL</span>
                  <input
                    value={selfHostForm.endpoint_url}
                    onChange={(event) => setSelfHostForm((current) => ({ ...current, endpoint_url: event.target.value }))}
                    placeholder="http://127.0.0.1:8000/v1"
                  />
                </label>
                <label>
                  <span>Model ID</span>
                  <input
                    value={selfHostForm.model_id}
                    onChange={(event) => setSelfHostForm((current) => ({ ...current, model_id: event.target.value }))}
                    placeholder="meta-llama/Meta-Llama-3-8B-Instruct"
                  />
                </label>
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
          <div className="section-grid two-col">
            <Panel title="Create API Key" icon={KeyRound}>
              <form className="stack-form" onSubmit={handleCreateApiKey}>
                <label>
                  <span>Name</span>
                  <input value={apiKeyName} onChange={(event) => setApiKeyName(event.target.value)} />
                </label>
                <label>
                  <span>Environment</span>
                  <select value={apiKeyEnvironment} onChange={(event) => setApiKeyEnvironment(event.target.value)}>
                    <option value="production">production</option>
                    <option value="sandbox">sandbox</option>
                  </select>
                </label>
                <button className="primary-button" type="submit" disabled={busy === 'create-key'}>
                  {busy === 'create-key' ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}
                  Create Key
                </button>
              </form>
            </Panel>

            <Panel title="Existing Keys" icon={ShieldCheck}>
              <div className="card-stack">
                {dashboard.apiKeys.length === 0 ? <EmptyState text="No API keys returned yet." /> : null}
                {dashboard.apiKeys.map((apiKey, index) => {
                  const name = String(apiKey.api_key_name ?? apiKey.id ?? `key-${index}`);
                  return (
                    <div className="sub-card" key={name}>
                      <div>
                        <h4>{name}</h4>
                        <p>{formatValue(apiKey.environment)} · {formatValue(apiKey.prefix)}</p>
                      </div>
                      <button className="danger-button" type="button" onClick={() => handleDeleteApiKey(name)}>
                        Delete
                      </button>
                    </div>
                  );
                })}
              </div>
            </Panel>
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
                        placeholder="http://127.0.0.1:8000/v1"
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
          <div className="section-grid two-col">
            <Panel title="Active Subscriptions" icon={Wifi}>
              <div className="card-stack">
                <EmptyState text="No bandwidth subscriptions found." />
              </div>
            </Panel>

            <Panel title="Subscription Summary" icon={Wifi}>
              <div className="stack-form">
                <div className="form-hint">
                  Bandwidth subscriptions control the egress and throughput limits associated with your OneInfer account. Manage plans and usage caps from this panel.
                </div>
                <DataList
                  entries={[
                    ['plan', '—'],
                    ['used', '—'],
                    ['limit', '—'],
                    ['renews', '—'],
                  ]}
                  emptyText="No subscription data available."
                />
              </div>
            </Panel>
          </div>
        ) : null}

        {activeSection === 'settings' ? (
          <div className="section-grid two-col">
            <Panel title="Claude Code" icon={Bot}>
              <div className="stack-form">
                <div className="form-hint">
                  Create a OneInfer API key for this device and merge your user-level Claude Code settings so the CLI routes through the Anthropic-compatible OneInfer gateway automatically.
                </div>
                <button
                  className="primary-button"
                  type="button"
                  onClick={handleEnableClaudeCode}
                  disabled={busy === 'configure-claude-code'}
                >
                  {busy === 'configure-claude-code' ? <LoaderCircle className="spin" size={16} /> : <Bot size={16} />}
                  Enable Claude Code
                </button>
              </div>
            </Panel>

            <Panel title="App Updates" icon={Download}>
              <div className="stack-form">
                <div className="form-hint">{updateStatus.message}</div>
                <DataList
                  entries={[
                    ['status', updateStatus.phase],
                    ['version', updateStatus.version || appVersion || 'unknown'],
                    ['download', updateStatus.progressPercent === null ? '—' : `${updateStatus.progressPercent}%`],
                  ]}
                  emptyText="No update status available."
                />
                <button
                  className="secondary-button"
                  type="button"
                  onClick={handleCheckForUpdates}
                  disabled={busy === 'check-updates' || busy === 'install-update'}
                >
                  {busy === 'check-updates' ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
                  Check for Updates
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={handleInstallUpdate}
                  disabled={updateStatus.phase !== 'downloaded' || busy === 'check-updates' || busy === 'install-update'}
                >
                  {busy === 'install-update' ? <LoaderCircle className="spin" size={16} /> : <RotateCcw size={16} />}
                  Restart to Install Update
                </button>
              </div>
            </Panel>

            <Panel title="Developer Profile" icon={ShieldCheck}>
              <DataList
                entries={getDeveloperProfileEntries(dashboard.profile)}
                emptyText="Profile data not loaded."
              />
            </Panel>

            <Panel title="Session" icon={ShieldCheck}>
              <DataList
                entries={[
                  ['email', session.email],
                  ['developerId', session.developerId],
                  ['token', `${session.accessToken.slice(0, 12)}...`],
                ]}
                emptyText="No session data."
              />
            </Panel>
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

export default App;