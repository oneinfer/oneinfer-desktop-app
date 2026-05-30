import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Info, LoaderCircle, Plus, Terminal } from 'lucide-react';

import {
  createApiKey,
  createInferenceEndpoint,
  createIntelligentEndpoint,
  deleteApiKey,
  deleteInstance,
  deleteInferenceEndpoint,
  deleteIntelligentEndpoint,
  deployCloudModel,
  getActiveDeveloperPlan,
  getCredits,
  getDeveloperPlans,
  getGpuPricing,
  getGpuSpecs,
  getHfModelInfo,
  getInstances,
  getProfile,
  getProviderInfo,
  listApiKeys,
  listInferenceEndpoints,
  listIntelligentEndpoints,
  listModels,
  registerDeveloper,
  requestOtp,
  runInstanceAction,
  submitDeveloperConsent,
  verifyEmail,
  verifyRegistration,
} from './api';
import { AppLayout } from './components/AppLayout';
import { EndpointUsageModal, type EndpointUsageTarget } from './components/EndpointUsageModal';
import { HfModelDetailPanel } from './components/HfModelDetailPanel';
import {
  createLoadedSections,
  defaultClaudeCodeProvider,
  defaultDashboardState,
  defaultInstanceForm,
  defaultSettings,
} from './constants';
import { getAcceleratorMemorySummary, validateHardwareSupport, type ModelRequirements, type ValidationResult } from './helpers/hardwareValidation';
import { syncLocalMachineProfile } from './helpers/machineDetails';
import { getModelMemoryBreakdown } from './helpers/modelSizing';
import { getServingLibraryCompatibility } from './helpers/servingCompatibility';
import { ApiKeysPage } from './pages/ApiKeysPage';
import { AuthPage } from './pages/AuthPage';
import { BandwidthPage } from './pages/BandwidthPage';
import { InstancesPage } from './pages/InstancesPage';
import { OverviewPage } from './pages/OverviewPage';
import { RoutingPage, type CreateRoutePayload } from './pages/RoutingPage';
import { SelfHostingPage, type SelfHostFormState } from './pages/SelfHostingPage';
import { SettingsPage, type SettingsTab } from './pages/SettingsPage';
import type {
  CreateInferenceFormState,
  CreateInstanceFormState,
  AuthStep,
  DashboardState,
  DesktopSession,
  EndpointItem,
  HfModelInfo,
  InstanceItem,
  LocalModelDeployment,
  LocalModelMetrics,
  RegistrationFormState,
  SectionKey,
  ServingLibrary,
  Notification,
} from './types';
import { getBalance } from './utils/format';

const servingLibraries: ServingLibrary[] = ['vllm', 'sglang', 'tensorrt', 'ollama', 'llama_cpp', 'pytorch', 'transformers', 'dynamo'];
const ONEINFER_CREDITS_URL = 'https://oneinfer.ai/console/credits';
const DEV_UPDATE_DISABLED_MESSAGE = 'Auto-update is disabled in development mode.';

const defaultRegistrationForm: RegistrationFormState = {
  firstName: '',
  lastName: '',
  organizationType: '',
  organization: '',
  designation: '',
  dob: '',
  acceptedTerms: false,
};

const initialLibraryStatus: Record<ServingLibrary, boolean> = {
  vllm: false,
  sglang: false,
  tensorrt: false,
  ollama: false,
  llama_cpp: false,
  pytorch: false,
  transformers: false,
  dynamo: false,
};

function normalizeHfRepoId(value: string): string {
  const rawValue = value.trim();
  if (!rawValue) {
    return '';
  }

  const normalizeOwnerModel = (candidate: string) => {
    const parts = candidate.split('/').filter(Boolean);
    if (parts.length < 2) {
      return '';
    }

    const owner = parts[0];
    let model = parts[1];
    const repeatedOwnerIndex = model.indexOf(owner);
    if (repeatedOwnerIndex > 0) {
      model = model.slice(0, repeatedOwnerIndex);
    }

    const repoId = `${owner}/${model}`;
    return repoId.length % 2 === 0 && repoId.slice(0, repoId.length / 2) === repoId.slice(repoId.length / 2)
      ? repoId.slice(0, repoId.length / 2)
      : repoId;
  };

  if (rawValue.startsWith('http://') || rawValue.startsWith('https://')) {
    const url = new URL(rawValue);
    const parts = url.pathname.split('/').filter(Boolean);
    return normalizeOwnerModel(parts.join('/'));
  }

  return rawValue.includes('/') ? normalizeOwnerModel(rawValue) : '';
}

function normalizeLocalModelId(value: string): string {
  const rawValue = value.trim();
  if (!rawValue) {
    return '';
  }

  if (rawValue.startsWith('hf.co/')) {
    return rawValue;
  }

  return normalizeHfRepoId(rawValue) || rawValue;
}

function calculateAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age;
}

function formatDateForApi(dateString: string): string {
  if (!dateString) {
    return '';
  }

  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
}

function validateRegistrationForm(form: RegistrationFormState): string | null {
  if (form.firstName.trim().length < 2) {
    return 'First name must be at least 2 characters.';
  }

  if (form.lastName.trim().length < 2) {
    return 'Last name must be at least 2 characters.';
  }

  if (!form.dob) {
    return 'Date of birth is required.';
  }

  if (calculateAge(form.dob) < 18) {
    return 'You must be at least 18 years old to register.';
  }

  if (form.organizationType !== 'individual' && form.organizationType !== 'business') {
    return 'Please select an organization type.';
  }

  if (form.organizationType === 'business' && form.organization.trim().length < 2) {
    return 'Organization name must be at least 2 characters.';
  }

  if (!form.designation) {
    return 'Please select your designation.';
  }

  if (!form.acceptedTerms) {
    return 'You must accept the Terms and Privacy Policy.';
  }

  return null;
}

function App() {
  const [booting, setBooting] = useState(true);
  const [appVersion, setAppVersion] = useState('');
  const [settingsDraft, setSettingsDraft] = useState(defaultSettings);
  const [session, setSession] = useState<DesktopSession | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>('overview');
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    try {
      const saved = localStorage.getItem('oneinfer_notifications');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('oneinfer_notifications', JSON.stringify(notifications));
    } catch (err) {
      console.warn('Failed to save notifications:', err);
    }
  }, [notifications]);

  const addNotification = useCallback((type: Notification['type'], title: string, message: string) => {
    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}`,
        type,
        title,
        message,
        timestamp: 'Just now',
        read: false,
      },
      ...prev,
    ]);
  }, []);

  const handleMarkAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const handleClearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const handleToggleNotificationRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: !n.read } : n))
    );
  }, []);

  const handleDeleteNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const [enabledTools, setEnabledTools] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('oneinfer_enabled_tools');
      return saved ? JSON.parse(saved) : { opencode: false, kilocode: false, openclaw: false, codex: false };
    } catch {
      return { opencode: false, kilocode: false, openclaw: false, codex: false };
    }
  });

  const setToolEnabled = useCallback((tool: string, enabled: boolean) => {
    setEnabledTools((prev) => {
      const next = { ...prev, [tool]: enabled };
      try {
        localStorage.setItem('oneinfer_enabled_tools', JSON.stringify(next));
      } catch (err) {
        console.warn('Failed to save enabled tools:', err);
      }
      return next;
    });
  }, []);

  const [dashboard, setDashboard] = useState<DashboardState>(defaultDashboardState);
  const [message, setMessage] = useState<{ tone: 'info' | 'success' | 'error'; text: string } | null>(null);
  const [usageTarget, setUsageTarget] = useState<EndpointUsageTarget | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [libraryInstallLog, setLibraryInstallLog] = useState<{ name: string; text: string; isError?: boolean }[]>([]);
  const [isInstallLogOpen, setIsInstallLogOpen] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [libraryErrors, setLibraryErrors] = useState<Record<string, string | null>>({});
  const [, setUpdateStatus] = useState<DesktopUpdateStatus>({
    phase: 'idle',
    message: 'Updates are idle.',
    version: null,
    progressPercent: null,
  });
  const [loadedSections, setLoadedSections] = useState<Record<SectionKey, boolean>>(createLoadedSections);
  const [email, setEmail] = useState('');
  const [loginStep, setLoginStep] = useState<AuthStep>('email');
  const [otp, setOtp] = useState('');
  const [registrationForm, setRegistrationForm] = useState<RegistrationFormState>(defaultRegistrationForm);
  const [selfHostForm, setSelfHostForm] = useState<SelfHostFormState>({
    name: '',
    model_id: '',
    endpoint_url: 'http://127.0.0.1:8001/v1',
    serving_library: 'vllm',
    useHfUrl: true,
    hfUrl: '',
    hfAccessToken: '',
  });
  const [instanceForm, setInstanceForm] = useState<CreateInstanceFormState>(defaultInstanceForm);
  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeyEnvironment] = useState('production');
  const [intelligentEndpointName, setIntelligentEndpointName] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [claudeCodeProvider, setClaudeCodeProvider] = useState<'oneinfer' | 'anthropic'>(defaultClaudeCodeProvider);
  const [toolProviders, setToolProviders] = useState<Record<string, 'oneinfer' | 'tool'>>(() => {
    try {
      const saved = localStorage.getItem('oneinfer_tool_providers');
      return saved ? JSON.parse(saved) : { opencode: 'oneinfer', kilocode: 'oneinfer', openclaw: 'oneinfer', codex: 'oneinfer' };
    } catch {
      return { opencode: 'oneinfer', kilocode: 'oneinfer', openclaw: 'oneinfer', codex: 'oneinfer' };
    }
  });

  const handleToolProviderChange = useCallback((tool: string, provider: 'oneinfer' | 'tool') => {
    setToolProviders((prev) => {
      const next = { ...prev, [tool]: provider };
      try {
        localStorage.setItem('oneinfer_tool_providers', JSON.stringify(next));
      } catch (err) {
        console.warn('Failed to save tool providers:', err);
      }
      return next;
    });
  }, []);

  const [overviewTab, setOverviewTab] = useState<'claude-code' | 'opencode' | 'kilocode' | 'openclaw' | 'codex'>('claude-code');
  const [infraTab, setInfraTab] = useState<'self-hosted' | 'cloud'>('self-hosted');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('account');
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [showCreateInstanceModal, setShowCreateInstanceModal] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [hfModelMetadata, setHfModelMetadata] = useState<HfModelInfo | null>(null);
  const [hfModelMetadataLoading, setHfModelMetadataLoading] = useState(false);
  const [hfModelMetadataError, setHfModelMetadataError] = useState<string | null>(null);
  const [libraries, setLibraries] = useState<Record<ServingLibrary, boolean>>(initialLibraryStatus);
  const [deploymentProgress, setDeploymentProgress] = useState<DesktopDeploymentProgress[]>([]);
  const [localDeployments, setLocalDeployments] = useState<LocalModelDeployment[]>([]);
  const [deletedLocalEndpointKeys, setDeletedLocalEndpointKeys] = useState<string[]>([]);
  const [localRouteUrls, setLocalRouteUrls] = useState<Record<string, string>>({});
  const [localModelMetrics, setLocalModelMetrics] = useState<Record<string, LocalModelMetrics>>({});
  const [routeInitialEndpointId, setRouteInitialEndpointId] = useState<string | null>(null);
  const [routeInitialViewId, setRouteInitialViewId] = useState<string | null>(null);
  const deletedLocalEndpointKeySet = useMemo(() => new Set(deletedLocalEndpointKeys), [deletedLocalEndpointKeys]);
  const visibleLocalDeployments = useMemo(
    () => localDeployments.filter((deployment) => !isDeletedLocalDeployment(deployment, deletedLocalEndpointKeySet)),
    [deletedLocalEndpointKeySet, localDeployments],
  );
  const visibleDashboard = useMemo(() => ({
    ...dashboard,
    inferenceEndpoints: dashboard.inferenceEndpoints.filter((endpoint, index) => !isDeletedLocalInferenceEndpoint(endpoint, deletedLocalEndpointKeySet, index)),
  }), [dashboard, deletedLocalEndpointKeySet]);

  useEffect(() => {
    let active = true;

    async function runValidation() {
      if (!session) return;

      const targetModelId = selfHostForm.useHfUrl ? selfHostForm.hfUrl : selfHostForm.model_id;
      if (!targetModelId) {
        setValidationResult(null);
        setHfModelMetadata(null);
        setHfModelMetadataLoading(false);
        setHfModelMetadataError(null);
        return;
      }

      let requirements: ModelRequirements = { minVramGb: 0, modelSizeGb: 0 };
      setHfModelMetadataLoading(true);
      setHfModelMetadataError(null);

      if (selfHostForm.useHfUrl) {
        try {
          const repoId = normalizeHfRepoId(targetModelId);

          if (repoId && repoId.includes('/')) {
            const info = await getHfModelInfo(repoId, selfHostForm.hfAccessToken) as HfModelInfo;
            if (active) {
              setHfModelMetadata(info);
            }

            const memoryBreakdown = getModelMemoryBreakdown(info, {
              servingLibrary: selfHostForm.serving_library,
            });
            const sizeGb = memoryBreakdown.modelWeightGb;

            if (sizeGb > 0) {
              requirements = {
                minVramGb: memoryBreakdown.totalVramGb,
                modelSizeGb: sizeGb,
                kvCacheGb: memoryBreakdown.kvCacheGb,
                servingOverheadGb: memoryBreakdown.servingOverheadGb,
              };
            } else if (active) {
              setValidationResult(null);
              setHfModelMetadataError('Hugging Face did not return model weight sizes, so local deployability cannot be estimated for this repo.');
            }
          } else if (active) {
            setHfModelMetadata(null);
            setValidationResult(null);
            setHfModelMetadataError('Enter a Hugging Face URL or repo id in owner/model format.');
          }
        } catch (error) {
          if (active) {
            setValidationResult(null);
            setHfModelMetadata(null);
            setHfModelMetadataError(error instanceof Error ? error.message : 'Unable to fetch Hugging Face model metadata.');
          }
          return;
        }
      } else {
        const catalogModel = dashboard.models.find((model: any) => (model.model_id || model.id) === targetModelId);
        if (active && catalogModel) {
          const virtualMetadata: HfModelInfo = {
            id: catalogModel.model_id || catalogModel.id,
            author: catalogModel.author || 'OneInfer Catalog',
            lastModified: catalogModel.updated_at || catalogModel.last_modified,
            pipeline_tag: catalogModel.pipeline_tag || 'text-generation',
            tags: catalogModel.tags || [],
            downloads: catalogModel.downloads || 0,
            likes: catalogModel.likes || 0,
            siblings: [{ rfilename: 'weights.bin', size: (catalogModel.model_size_gb || catalogModel.modelSizeGb || 0) * (1024 ** 3) }],
          };
          setHfModelMetadata(virtualMetadata);

          const catalogModelWeightGb = Number(catalogModel.modelSizeGb || catalogModel.model_size_gb || 0);
          const catalogContextLength = Number(catalogModel.modelContextLength || catalogModel.model_context_length || 0);
          const catalogMemoryBreakdown = getModelMemoryBreakdown(virtualMetadata, {
            modelWeightGb: catalogModelWeightGb,
            contextLength: catalogContextLength || undefined,
            servingLibrary: selfHostForm.serving_library,
          });
          const catalogMinVramGb = Number(catalogModel.modelMinVram || catalogModel.model_min_vram || 0);

          requirements = {
            minVramGb: catalogMinVramGb || catalogMemoryBreakdown.totalVramGb,
            modelSizeGb: catalogMemoryBreakdown.modelWeightGb,
            kvCacheGb: catalogMemoryBreakdown.kvCacheGb,
            servingOverheadGb: catalogMemoryBreakdown.servingOverheadGb,
          };
        } else if (active) {
          setHfModelMetadata(null);
          setValidationResult(null);
          setHfModelMetadataError('Select a model to check local deployability.');
        }
      }

      if (active && (requirements.minVramGb > 0 || requirements.modelSizeGb > 0)) {
        setValidationResult(validateHardwareSupport(requirements, dashboard.machineDetails));
      }

      if (active) {
        setHfModelMetadataLoading(false);
      }
    }

    runValidation().finally(() => {
      if (active) {
        setHfModelMetadataLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [selfHostForm.model_id, selfHostForm.hfUrl, selfHostForm.hfAccessToken, selfHostForm.useHfUrl, selfHostForm.serving_library, dashboard.machineDetails, dashboard.models, session]);

  useEffect(() => {
    async function checkLibs() {
      if (!window.desktopBridge?.checkLibrary) return;
      try {
        const statuses = await Promise.all(servingLibraries.map(async (library) => [library, await window.desktopBridge.checkLibrary(library)] as const));
        setLibraries({
          ...initialLibraryStatus,
          ...Object.fromEntries(statuses),
        });

        if (window.desktopBridge.getLibraryError) {
          const errors = await Promise.all(
            servingLibraries.map(async (library) => {
              const isInstalled = statuses.find(([lib]) => lib === library)?.[1];
              const err = !isInstalled ? await window.desktopBridge.getLibraryError(library) : null;
              return [library, err] as const;
            })
          );
          setLibraryErrors(Object.fromEntries(errors));
        }
      } catch (error) {
        console.error('[libraries] check failed', error);
      }
    }

    if (session) {
      checkLibs();
    }
  }, [activeSection, session]);

  useEffect(() => {
    if (!window.desktopBridge?.onLibraryInstallLog) return;
    return window.desktopBridge.onLibraryInstallLog((log) => {
      setLibraryInstallLog((prev) => [...prev, log]);
      setIsInstallLogOpen(true);
    });
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [libraryInstallLog]);

  useEffect(() => {
    if (booting || !session) {
      return;
    }

    persistState(session, settingsDraft.apiBaseUrl, claudeCodeProvider, localDeployments, deletedLocalEndpointKeys).catch((error) => {
      console.error('[state] failed to persist local deployments', error);
    });
  }, [booting, session, settingsDraft.apiBaseUrl, claudeCodeProvider, localDeployments, deletedLocalEndpointKeys]);

  useEffect(() => {
    if (!window.desktopBridge?.onDeploymentProgress) {
      return undefined;
    }

    return window.desktopBridge.onDeploymentProgress((progress) => {
      setDeploymentProgress((current) => [...current, progress].slice(-80));
    });
  }, []);

  useEffect(() => {
    if (!window.desktopBridge?.getLocalModelMetrics || localDeployments.length === 0) {
      return undefined;
    }

    let cancelled = false;
    async function refreshMetrics() {
      const results = await Promise.all(localDeployments.map(async (deployment) => {
        try {
          return await window.desktopBridge.getLocalModelMetrics({ endpointUrl: deployment.endpointUrl });
        } catch (error) {
          return {
            endpointUrl: deployment.endpointUrl,
            healthy: false,
            modelCount: 0,
            modelIds: [],
            uptimeSeconds: null,
            requestsRunning: null,
            requestsWaiting: null,
            requestSuccessTotal: null,
            promptTokensTotal: null,
            generationTokensTotal: null,
            gpuCacheUsagePercent: null,
            lastCheckedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Failed to load local model metrics.',
          } satisfies LocalModelMetrics;
        }
      }));

      if (!cancelled) {
        setLocalModelMetrics((current) => {
          const next = { ...current };
          results.forEach((metrics) => {
            next[metrics.endpointUrl] = metrics;
          });
          return next;
        });
      }
    }

    refreshMetrics();
    const intervalId = window.setInterval(refreshMetrics, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [localDeployments]);

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
    nextLocalDeployments: LocalModelDeployment[] = localDeployments,
    nextDeletedLocalEndpointKeys: string[] = deletedLocalEndpointKeys,
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
      localDeployments: nextLocalDeployments,
      deletedLocalEndpointKeys: nextDeletedLocalEndpointKeys,
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
          listInferenceEndpoints(currentBaseUrl, currentSession),
          getInstances(currentBaseUrl, currentSession),
          getDeveloperPlans(currentBaseUrl),
          getActiveDeveloperPlan(currentBaseUrl, currentSession),
          listIntelligentEndpoints(currentBaseUrl, currentSession),
        ]);

        setDashboard((current) => ({
          ...current,
          profile: results[0].status === 'fulfilled' ? results[0].value : current.profile,
          credits: results[1].status === 'fulfilled' ? results[1].value : current.credits,
          inferenceEndpoints: results[2].status === 'fulfilled' ? results[2].value : current.inferenceEndpoints,
          instances: (results[3].status === 'fulfilled' ? results[3].value : current.instances).filter(i => {
            const status = String(i.instance_status ?? i.status).toLowerCase();
            return status !== 'deleted' && status !== 'terminated';
          }),
          developerPlans: results[4].status === 'fulfilled' ? results[4].value : current.developerPlans,
          activeDeveloperPlan: results[5].status === 'fulfilled' ? results[5].value : current.activeDeveloperPlan,
          intelligentEndpoints: results[6].status === 'fulfilled' ? results[6].value : current.intelligentEndpoints,
        }));

        announcePartialFailures('Overview', results, shouldBeSilent, [
          'profile',
          'credits',
          'inference endpoints',
          'instances',
          'developer plans',
          'active developer plan',
          'routes',
        ]);
      }

      if (section === 'instances') {
        const results = await Promise.allSettled([
          getInstances(currentBaseUrl, currentSession),
          getProviderInfo(currentBaseUrl),
          getGpuSpecs(currentBaseUrl),
          getGpuPricing(currentBaseUrl, currentSession),
          listModels(currentBaseUrl),
          listInferenceEndpoints(currentBaseUrl, currentSession),
        ]);

        setDashboard((current) => ({
          ...current,
          instances: (results[0].status === 'fulfilled' ? results[0].value : current.instances).filter(i => {
            const status = String(i.instance_status ?? i.status).toLowerCase();
            return status !== 'deleted' && status !== 'terminated';
          }),
          providerInfo: results[1].status === 'fulfilled' ? results[1].value : current.providerInfo,
          gpuSpecs: results[2].status === 'fulfilled' ? results[2].value : current.gpuSpecs,
          gpuPricing: results[3].status === 'fulfilled' ? results[3].value : current.gpuPricing,
          models: results[4].status === 'fulfilled' ? results[4].value : current.models,
          inferenceEndpoints: results[5].status === 'fulfilled' ? results[5].value : current.inferenceEndpoints,
        }));

        announcePartialFailures('Instances', results, shouldBeSilent, ['instances', 'provider info', 'GPU specs', 'GPU pricing', 'models', 'inference endpoints']);
      }

      if (section === 'apiKeys') {
        const apiKeys = await listApiKeys(currentBaseUrl, currentSession);
        setDashboard((current) => ({ ...current, apiKeys }));
      }

      if (section === 'routing') {
        const results = await Promise.allSettled([
          listIntelligentEndpoints(currentBaseUrl, currentSession),
          listInferenceEndpoints(currentBaseUrl, currentSession),
          listModels(currentBaseUrl),
        ]);

        setDashboard((current) => ({
          ...current,
          intelligentEndpoints: results[0].status === 'fulfilled' ? results[0].value : current.intelligentEndpoints,
          inferenceEndpoints: results[1].status === 'fulfilled' ? results[1].value : current.inferenceEndpoints,
          models: results[2].status === 'fulfilled' ? results[2].value : current.models,
        }));

        announcePartialFailures('Routing', results, shouldBeSilent, ['routes', 'inference endpoints', 'models']);
      }

      if (section === 'selfHosting') {
        const results = await Promise.allSettled([
          listModels(currentBaseUrl),
          listInferenceEndpoints(currentBaseUrl, currentSession),
        ]);

        setDashboard((current) => ({
          ...current,
          models: results[0].status === 'fulfilled' ? results[0].value : current.models,
          inferenceEndpoints: results[1].status === 'fulfilled' ? results[1].value : current.inferenceEndpoints,
        }));

        announcePartialFailures('Self Hosting', results, shouldBeSilent, ['models', 'inference endpoints']);
        if (!shouldBeSilent) {
          setMessage({ tone: 'success', text: 'Models catalog synced.' });
        }
      }

      if (section === 'bandwidth') {
        const results = await Promise.allSettled([
          getDeveloperPlans(currentBaseUrl),
          getActiveDeveloperPlan(currentBaseUrl, currentSession),
        ]);

        setDashboard((current) => ({
          ...current,
          developerPlans: results[0].status === 'fulfilled' ? results[0].value : current.developerPlans,
          activeDeveloperPlan: results[1].status === 'fulfilled' ? results[1].value : current.activeDeveloperPlan,
        }));

        announcePartialFailures('Bandwidth', results, shouldBeSilent, ['developer plans', 'active developer plan']);
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

  function announcePartialFailures(label: string, results: PromiseSettledResult<unknown>[], silent: boolean, names: string[] = []) {
    const failures = results
      .map((result, index) => ({ result, name: names[index] || `request ${index + 1}` }))
      .filter((item): item is { result: PromiseRejectedResult; name: string } => item.result.status === 'rejected');
    const failed = failures.length;
    if (failed > 0) {
      console.warn(`[${label}] partial load failure`, failures.map((failure) => ({
        name: failure.name,
        reason: failure.result.reason instanceof Error ? failure.result.reason.message : String(failure.result.reason),
      })));
      if (!silent) {
        setMessage({ tone: 'error', text: `${label} loaded with ${failed} partial failure${failed > 1 ? 's' : ''}: ${failures.map((failure) => failure.name).join(', ')}.` });
      }
    } else if (!silent) {
      setMessage({ tone: 'success', text: `${label} synced.` });
    }
  }

  async function triggerAutoUpdate() {
    if (!window.desktopBridge?.gitPull) return;
    try {
      setMessage({ tone: 'info', text: 'Auto-updating: Checking for latest Git pull...' });
      const result = await window.desktopBridge.gitPull();
      if (result.success) {
        setMessage({ tone: 'success', text: result.message || 'Auto-update complete. The application will hot-reload if changed.' });
      } else {
        setMessage({ tone: 'error', text: `Auto-update failed: ${result.error}` });
      }
    } catch (error: any) {
      console.error('Auto git pull failed:', error);
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
      if (Array.isArray(storedState?.localDeployments)) {
        setLocalDeployments(storedState.localDeployments.filter(isValidLocalDeployment));
      }
      if (Array.isArray(storedState?.deletedLocalEndpointKeys)) {
        setDeletedLocalEndpointKeys(uniqueStrings(storedState.deletedLocalEndpointKeys));
      }
      setLoadedSections(createLoadedSections());
      setEmail(storedState?.session?.email ?? '');
      setAppVersion(version ?? '');
      if (initialUpdateStatus) {
        setUpdateStatus(initialUpdateStatus);
        if (initialUpdateStatus.message && initialUpdateStatus.message !== DEV_UPDATE_DISABLED_MESSAGE) {
          setMessage({ tone: 'info', text: initialUpdateStatus.message });
        }
      }

      if (storedState?.session) {
        await loadSectionData('overview', storedState.session, nextBaseUrl, { force: true, silent: true });
      }

      // Daily auto-update check
      try {
        const today = new Date().toDateString();
        const lastPullDate = localStorage.getItem('lastAutoPullDate');
        if (lastPullDate !== today && typeof window.desktopBridge?.gitPull === 'function') {
          localStorage.setItem('lastAutoPullDate', today);
          void triggerAutoUpdate();
        }
      } catch (err) {
        console.warn('Failed to check daily auto update:', err);
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
      if (status.message && status.message !== DEV_UPDATE_DISABLED_MESSAGE) {
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
      const trimmedEmail = email.trim();
      await requestOtp(settingsDraft.apiBaseUrl, trimmedEmail);
      setEmail(trimmedEmail);
      setLoginStep('otp');
      setOtp('');
      setMessage({ tone: 'success', text: `OTP sent to ${trimmedEmail}.` });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to request OTP.' });
    } finally {
      setBusy(null);
    }
  }

  async function completeAuth(nextSession: DesktopSession, successMessage: string) {
    setSession(nextSession);
    setLoadedSections(createLoadedSections());
    setDashboard(defaultDashboardState);
    await persistState(nextSession, settingsDraft.apiBaseUrl, claudeCodeProvider);
    await loadSectionData('overview', nextSession, settingsDraft.apiBaseUrl, { force: true });
    setMessage({ tone: 'success', text: successMessage });
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('login');
    setMessage(null);

    try {
      const trimmedEmail = email.trim();
      const trimmedOtp = otp.trim();
      if (trimmedOtp.length !== 6) {
        throw new Error('Please enter the 6-digit OTP.');
      }

      await verifyEmail(settingsDraft.apiBaseUrl, trimmedEmail, trimmedOtp);
      const registration = await verifyRegistration(settingsDraft.apiBaseUrl, trimmedEmail);

      if (!registration.isRegistered) {
        setLoginStep('registration');
        setRegistrationForm((current) => ({ ...current }));
        setMessage({ tone: 'info', text: 'Email verified. Complete your profile to finish registration.' });
        return;
      }

      if (!registration.session) {
        throw new Error('Registration check did not return a session.');
      }

      await completeAuth(registration.session, 'Logged in successfully.');
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Login failed.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('registration');
    setMessage(null);

    try {
      const validationError = validateRegistrationForm(registrationForm);
      if (validationError) {
        throw new Error(validationError);
      }

      const trimmedEmail = email.trim();
      await submitDeveloperConsent(settingsDraft.apiBaseUrl, trimmedEmail, true);
      const nextSession = await registerDeveloper(settingsDraft.apiBaseUrl, {
        email: trimmedEmail,
        firstName: registrationForm.firstName.trim(),
        lastName: registrationForm.lastName.trim(),
        organizationType: registrationForm.organizationType || 'individual',
        organization: registrationForm.organizationType === 'business' ? registrationForm.organization.trim() : null,
        designation: registrationForm.designation || 'developer',
        dob: formatDateForApi(registrationForm.dob),
      });

      setRegistrationForm(defaultRegistrationForm);
      await completeAuth(nextSession, 'Registration completed successfully.');
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Registration failed.' });
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

      setToolEnabled('openclaw', true);
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

  async function handleEnableCodex() {
    if (!session || !window.desktopBridge?.enableCodex) {
      return;
    }

    setBusy('configure-codex');
    setMessage(null);

    try {
      const result = await window.desktopBridge.enableCodex({
        apiBaseUrl: settingsDraft.apiBaseUrl,
        session,
      });
      const installMessage = result.codexInstallState === 'installed'
        ? ' Codex was installed first for this operating system.'
        : '';

      setToolEnabled('codex', true);
      setMessage({
        tone: 'success',
        text: result.alreadyConfigured
          ? `Codex is already enabled globally for OneInfer. Config: ${result.configPath}. Model: ${result.model}.${installMessage}`
          : `Codex enabled globally via OneInfer${result.apiKeyName ? ` with ${result.apiKeyName}` : ''}. Config: ${result.configPath}. Model: ${result.model}.${installMessage}`,
      });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to enable Codex.' });
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

      setToolEnabled('opencode', true);
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

  async function handleEnableKiloCode() {
    if (!session || !window.desktopBridge?.enableKiloCode) {
      return;
    }

    setBusy('configure-kilocode');
    setMessage(null);

    try {
      const result = await window.desktopBridge.enableKiloCode({
        apiBaseUrl: settingsDraft.apiBaseUrl,
        session,
      });
      const installMessage = result.kilocodeInstallState === 'installed'
        ? ' Kilo Code was installed first for this operating system.'
        : '';

      setToolEnabled('kilocode', true);
      setMessage({
        tone: 'success',
        text: result.alreadyConfigured
          ? `Kilo Code is already enabled globally for OneInfer. Config: ${result.configPath}. Model: ${result.model}.${installMessage}`
          : `Kilo Code enabled globally via OneInfer${result.apiKeyName ? ` with ${result.apiKeyName}` : ''}. Config: ${result.configPath}. Base URL: ${result.apiBaseUrl}. Model: ${result.model}.${installMessage}`,
      });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to enable Kilo Code.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleRegisterSelfHosted(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!session) {
      return;
    }

    const detectedMachineId = typeof dashboard.machineDetails?.machineId === 'string' ? dashboard.machineDetails.machineId : '';
    const detectedMachineName = typeof dashboard.machineDetails?.machineName === 'string'
      ? dashboard.machineDetails.machineName
      : typeof dashboard.machineDetails?.hostname === 'string'
        ? dashboard.machineDetails.hostname
        : '';

    const modelId = selfHostForm.useHfUrl ? normalizeHfRepoId(selfHostForm.hfUrl) : selfHostForm.model_id;
    if (!modelId) {
      setMessage({ tone: 'error', text: selfHostForm.useHfUrl ? 'Hugging Face URL is required.' : 'Please select a model.' });
      return;
    }

    if (!selfHostForm.endpoint_url.trim()) {
      setMessage({ tone: 'error', text: 'Local endpoint URL is required.' });
      return;
    }

    setBusy('register-self-hosted');
    try {
      const manualRuntime = selfHostForm.serving_library || getLocalRuntimeFromEndpointUrl(selfHostForm.endpoint_url);
      const routingMetadata = buildHfRoutingMetadata(hfModelMetadata);
      await validateSelfHostedEndpointRegistration(selfHostForm.endpoint_url.trim(), modelId, selfHostForm.name.trim() || modelId);
      const registeredEndpoint = await createInferenceEndpoint(settingsDraft.apiBaseUrl, session, {
        name: selfHostForm.name,
        provider: 'openai',
        model_id: modelId,
        deployment_target: 'local',
        endpoint_url: selfHostForm.endpoint_url.trim(),
        machine_id: detectedMachineId,
        machine_name: detectedMachineName,
        ...routingMetadata.endpointFields,
        top_p: 0.9,
        temperature: 0.7,
        max_tokens: 4096,
        serving_library: manualRuntime,
      });
      setLocalDeployments((current) => {
        const nextDeployment: LocalModelDeployment = {
          endpointId: getEndpointIdFromPayload(registeredEndpoint),
          endpointUrl: selfHostForm.endpoint_url.trim(),
          modelId,
          ...routingMetadata.deploymentFields,
          name: selfHostForm.name.trim() || modelId,
          pid: null,
          runtime: manualRuntime,
          deployedAt: new Date().toISOString(),
        };

        return [
          nextDeployment,
          ...current.filter((item) => !isSameLocalDeployment(item, nextDeployment)),
        ];
      });
      setMessage({ tone: 'success', text: 'Local inference endpoint registered.' });
      await loadSectionData('routing', session, settingsDraft.apiBaseUrl, { force: true });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to register endpoint.' });
      throw error;
    } finally {
      setBusy(null);
    }
  }

  async function handleDeploySelfHostedModel() {
    if (!session) {
      return false;
    }

    if (!selfHostForm.useHfUrl) {
      await handleRegisterSelfHosted();
      return true;
    }

    if (!window.desktopBridge?.deployHfModel) {
      setMessage({ tone: 'error', text: 'Local model deployment is not available in this app build.' });
      return false;
    }

    const repoId = normalizeHfRepoId(selfHostForm.hfUrl);
    if (!repoId) {
      setMessage({ tone: 'error', text: 'Enter a valid Hugging Face model URL or owner/model id.' });
      return false;
    }

    if (validationResult?.status === 'insufficient') {
      setMessage({ tone: 'error', text: 'This local GPU does not have enough VRAM for the selected model.' });
      return false;
    }

    const selectedRuntime = selfHostForm.serving_library;
    const requestedRuntime = selectedRuntime === 'pytorch' ? 'transformers' : selectedRuntime;
    if (!isLaunchableLocalRuntime(requestedRuntime)) {
      if (!libraries[selectedRuntime]) {
        setMessage({ tone: 'error', text: `Install ${formatLocalRuntime(selectedRuntime)} before registering this local endpoint.` });
        return false;
      }

      await handleRegisterSelfHosted();
      return true;
    }

    const isOllamaCompatibleRepo = isOllamaCompatibleModelId(repoId);
    const localRuntime = requestedRuntime;
    if (!libraries[localRuntime]) {
      const errorText = selectedRuntime === 'pytorch'
        ? 'Install both PyTorch and Transformers before deploying this model locally. OneInfer uses PyTorch as the hardware-accelerated backend framework and the Transformers serving library to expose an OpenAI-compatible local server.'
        : `Install ${formatLocalRuntime(localRuntime)} before deploying this model locally.`;
      setMessage({ tone: 'error', text: errorText });
      return false;
    }

    if (localRuntime === 'ollama' && !isOllamaCompatibleRepo) {
      setMessage({ tone: 'error', text: `${repoId} is not a GGUF/llama.cpp model, so Ollama cannot deploy it. Select vLLM for one-click Transformers deployment, or choose a GGUF model for Ollama.` });
      return false;
    }

    if (hfModelMetadata) {
      const compatibility = getServingLibraryCompatibility(localRuntime, hfModelMetadata);
      if (!compatibility.supported) {
        setMessage({
          tone: 'error',
          text: `${repoId} cannot be deployed with ${formatLocalRuntime(localRuntime)}. ${compatibility.reason ?? 'Select a compatible serving library for this model.'}`,
        });
        return false;
      }
    }

    const hardwareBlockReason = getLocalDeploymentHardwareBlockReason(localRuntime, validationResult, dashboard.machineDetails);
    if (hardwareBlockReason) {
      setMessage({ tone: 'error', text: hardwareBlockReason });
      return false;
    }

    const detectedMachineId = typeof dashboard.machineDetails?.machineId === 'string' ? dashboard.machineDetails.machineId : '';
    const detectedMachineName = typeof dashboard.machineDetails?.machineName === 'string'
      ? dashboard.machineDetails.machineName
      : typeof dashboard.machineDetails?.hostname === 'string'
        ? dashboard.machineDetails.hostname
        : '';

    setBusy('register-self-hosted');
    try {
      const progressId = `${repoId}-${Date.now()}`;
      setDeploymentProgress([{
        id: progressId,
        stage: 'preparing',
        message: `Preparing to deploy ${repoId}.`,
        detail: `Checking runtime, choosing a port, then starting ${formatLocalRuntime(localRuntime)}.`,
        level: 'info',
        timestamp: Date.now(),
      }]);
      setMessage({ tone: 'info', text: `Starting ${repoId} with ${formatLocalRuntime(localRuntime)} on this machine...` });
      const deployment = await window.desktopBridge.deployHfModel({
        repoId,
        runtime: localRuntime,
        progressId,
        hfAccessToken: selfHostForm.hfAccessToken.trim() || undefined,
      });

      setSelfHostForm((current) => ({
        ...current,
        endpoint_url: deployment.endpointUrl,
      }));
      const deployedAt = new Date().toISOString();
      const routingMetadata = buildHfRoutingMetadata(hfModelMetadata);
      const localDeploymentRecord: LocalModelDeployment = {
        endpointUrl: deployment.endpointUrl,
        modelId: deployment.modelId,
        ...routingMetadata.deploymentFields,
        name: selfHostForm.name.trim() || repoId,
        pid: deployment.pid,
        runtime: deployment.runtime,
        deployedAt,
      };
      let nextDeletedLocalEndpointKeys = deletedLocalEndpointKeys.filter((key) => !getLocalEndpointDeletionKeys(localDeploymentRecord).includes(key));
      setDeletedLocalEndpointKeys(nextDeletedLocalEndpointKeys);
      let nextLocalDeployments = upsertLocalDeployment(localDeployments, localDeploymentRecord);
      setLocalDeployments((current) => {
        nextLocalDeployments = upsertLocalDeployment(current, localDeploymentRecord);
        return nextLocalDeployments;
      });

      const registeringProgress: DesktopDeploymentProgress = {
        id: progressId,
        stage: 'registering',
        message: 'Registering verified local endpoint with OneInfer...',
        detail: deployment.endpointUrl,
        level: 'info',
        timestamp: Date.now(),
      };
      setDeploymentProgress((current) => [...current, registeringProgress].slice(-80));

      const registeredEndpoint = await createInferenceEndpoint(settingsDraft.apiBaseUrl, session, {
        name: selfHostForm.name.trim() || repoId,
        provider: 'openai',
        model_id: deployment.modelId,
        deployment_target: 'local',
        endpoint_url: deployment.endpointUrl,
        machine_id: detectedMachineId,
        machine_name: detectedMachineName,
        ...routingMetadata.endpointFields,
        top_p: 0.9,
        temperature: 0.7,
        max_tokens: 4096,
        serving_library: deployment.runtime,
      });

      const registeredEndpointId = getEndpointIdFromPayload(registeredEndpoint);
      if (registeredEndpointId) {
        nextLocalDeployments = nextLocalDeployments.map((item) => (
          item.endpointUrl === deployment.endpointUrl && item.modelId === deployment.modelId
            ? { ...item, endpointId: registeredEndpointId }
            : item
        ));
        setLocalDeployments((current) => current.map((item) => (
          item.endpointUrl === deployment.endpointUrl && item.modelId === deployment.modelId
            ? { ...item, endpointId: registeredEndpointId }
            : item
        )));
        nextDeletedLocalEndpointKeys = nextDeletedLocalEndpointKeys.filter((key) => !getLocalEndpointDeletionKeys({
          ...localDeploymentRecord,
          endpointId: registeredEndpointId,
        }).includes(key));
        setDeletedLocalEndpointKeys(nextDeletedLocalEndpointKeys);
      }
      await persistState(session, settingsDraft.apiBaseUrl, claudeCodeProvider, nextLocalDeployments, nextDeletedLocalEndpointKeys);

      const registeredProgress: DesktopDeploymentProgress = {
        id: progressId,
        stage: 'registered',
        message: 'Local endpoint registered successfully.',
        detail: deployment.endpointUrl,
        level: 'success',
        timestamp: Date.now(),
      };
      setDeploymentProgress((current) => [...current, registeredProgress].slice(-80));
      addNotification('success', 'Local Deployment Succeeded', `Successfully deployed model "${deployment.modelId}" locally on ${deployment.endpointUrl}.`);
      setMessage({ tone: 'success', text: `Deployed ${deployment.modelId} locally and registered ${deployment.endpointUrl}.` });
      await loadSectionData('selfHosting', session, settingsDraft.apiBaseUrl, { force: true, silent: true });
      await loadSectionData('routing', session, settingsDraft.apiBaseUrl, { force: true });
      return true;
    } catch (error) {
      const rawErrorMessage = error instanceof Error ? error.message : 'Failed to deploy Hugging Face model locally.';
      const errorMessage = rawErrorMessage.includes('Unsupported local deployment runtime: ollama')
        ? 'Ollama deploy support is not loaded in the Electron main process yet. Fully quit OneInfer Edge, restart with npm run dev, then deploy again.'
        : rawErrorMessage;
      const errorProgress: DesktopDeploymentProgress = {
        id: `${repoId}-${Date.now()}`,
        stage: 'error',
        message: 'Deployment flow stopped.',
        detail: errorMessage,
        level: 'error',
        timestamp: Date.now(),
      };
      setDeploymentProgress((current) => [...current, errorProgress].slice(-80));
      addNotification('error', 'Local Deployment Failed', `Failed to deploy model "${repoId}" locally: ${errorMessage}`);
      setMessage({ tone: 'error', text: errorMessage });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function handleCancelSelfHostedDeployment() {
    const repoId = normalizeHfRepoId(selfHostForm.hfUrl);
    if (!repoId) {
      setMessage({ tone: 'error', text: 'No Hugging Face deployment is active.' });
      return false;
    }

    if (!window.desktopBridge?.cancelHfDeployment) {
      setMessage({ tone: 'error', text: 'Deployment cancellation is not available in this app build.' });
      return false;
    }

    try {
      const result = await window.desktopBridge.cancelHfDeployment({ repoId });
      setMessage({ tone: result.cancelled ? 'info' : 'error', text: result.message });
      if (result.cancelled) {
        setBusy(null);
      }
      return result.cancelled;
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to cancel deployment.' });
      return false;
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

  async function handleGitPull() {
    if (!window.desktopBridge?.gitPull) {
      setMessage({ tone: 'error', text: 'Update is not supported in this environment.' });
      return;
    }

    setBusy('git-pull');
    setMessage({ tone: 'info', text: 'Checking for updates...' });
    try {
      const result = await window.desktopBridge.gitPull();
      if (result.success) {
        setMessage({ tone: 'success', text: result.message || 'Update completed successfully. The application will hot-reload if changed.' });
      } else {
        setMessage({ tone: 'error', text: `Update failed: ${result.error}` });
      }
    } catch (error: any) {
      setMessage({ tone: 'error', text: error.message || 'Update failed.' });
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

  async function handleDeployCloudModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return false;
    }

    const rawModelInput = instanceForm.model_source === 'huggingface'
      ? instanceForm.hf_model_url
      : instanceForm.model_id;
    const normalizedModelId = resolveCloudModelId(rawModelInput, dashboard.models);
    if (!normalizedModelId) {
      setMessage({ tone: 'error', text: 'Select a model before deploying to a cloud GPU.' });
      return false;
    }

    const providerInstances = dashboard.providerInfo[instanceForm.provider_name]?.instances;
    const selectedProviderInstance = Array.isArray(providerInstances)
      ? providerInstances.find((item) => {
          const record = item as Record<string, unknown>;
          return String(record.gpu_id ?? record.gpuId ?? '') === instanceForm.gpu_id;
        }) as Record<string, unknown> | undefined
      : undefined;
    const selectedGpu = selectedProviderInstance && typeof selectedProviderInstance.gpu === 'object' && selectedProviderInstance.gpu
      ? selectedProviderInstance.gpu as Record<string, unknown>
      : {};
    if (selectedProviderInstance && Number(selectedGpu.number_of_gpus ?? 0) <= 0) {
      setMessage({ tone: 'error', text: 'Select a GPU instance before deploying a cloud model.' });
      return false;
    }

    setBusy('deploy-cloud-model');
    try {
      await deployCloudModel(settingsDraft.apiBaseUrl, session, {
        ...instanceForm,
        model_id: normalizedModelId,
      });
      addNotification('success', 'Deployment Request Submitted', `Cloud deployment for model "${normalizedModelId}" on GPU "${instanceForm.gpu_id}" is initializing.`);
      setMessage({ tone: 'success', text: 'Cloud model deployment request submitted.' });
      loadSectionData('instances', session, settingsDraft.apiBaseUrl, { force: true }).catch((error) => {
        setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Cloud deployment submitted, but refresh failed.' });
      });
      loadSectionData('routing', session, settingsDraft.apiBaseUrl, { force: true, silent: true }).catch(() => {});
      return true;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Failed to deploy cloud model.';
      addNotification('error', 'Deployment Failed', `Failed to initialize cloud model deployment: ${errMsg}`);
      setMessage({ tone: 'error', text: errMsg });
      return false;
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
      const actionLabel = action === 'start-instance' ? 'Start' : action === 'stop-instance' ? 'Stop' : 'Restart';
      addNotification('success', `Instance Action Succeeded`, `Successfully executed "${actionLabel}" for cloud instance "${instanceId}".`);
      setMessage({ tone: 'success', text: `${action} completed for ${instanceId}.` });
      await loadSectionData('instances', session, settingsDraft.apiBaseUrl, { force: true });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Instance action failed.';
      addNotification('error', `Instance Action Failed`, `Failed to run action "${action}" on instance "${instanceId}": ${errMsg}`);
      setMessage({ tone: 'error', text: errMsg });
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
      addNotification('info', 'Instance Deleted', `Cloud instance "${instanceId}" was deleted successfully.`);
      setMessage({ tone: 'success', text: `Deleted ${instanceId}.` });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Delete instance failed.';
      if (msg.toLowerCase().includes('no instance mapping found')) {
        addNotification('info', 'Instance Deleted', `Cloud instance "${instanceId}" was deleted successfully.`);
        setMessage({ tone: 'success', text: `Deleted ${instanceId}.` });
      } else {
        addNotification('error', 'Instance Deletion Failed', `Failed to delete instance "${instanceId}": ${msg}`);
        setMessage({ tone: 'error', text: msg });
      }
    } finally {
      await loadSectionData('instances', session, settingsDraft.apiBaseUrl, { force: true, silent: true }).catch(() => {});
      setBusy(null);
    }
  }

  async function handleDeleteEndpoint(endpointId: string) {
    if (!session) {
      return;
    }

    setBusy('delete-endpoint');
    try {
      await deleteInferenceEndpoint(settingsDraft.apiBaseUrl, session, endpointId);
      addNotification('info', 'Endpoint Deleted', `Inference endpoint "${endpointId}" was deleted successfully.`);
      setMessage({ tone: 'success', text: `Deleted endpoint ${endpointId}.` });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Delete endpoint failed.';
      addNotification('error', 'Endpoint Deletion Failed', `Failed to delete endpoint "${endpointId}": ${msg}`);
      setMessage({ tone: 'error', text: msg });
    } finally {
      await loadSectionData('instances', session, settingsDraft.apiBaseUrl, { force: true, silent: true }).catch(() => {});
      await loadSectionData('overview', session, settingsDraft.apiBaseUrl, { force: true, silent: true }).catch(() => {});
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
      addNotification('success', 'API Key Created', `API key "${apiKeyName}" was created successfully.`);
      setMessage({ tone: 'success', text: 'API key created successfully' });
      await loadSectionData('apiKeys', session, settingsDraft.apiBaseUrl, { force: true });
      setApiKeyName('');
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'API key creation failed.';
      addNotification('error', 'API Key Creation Failed', errMsg);
      setMessage({ tone: 'error', text: errMsg });
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
      addNotification('info', 'API Key Deleted', `API key "${name}" was successfully removed.`);
      setMessage({ tone: 'success', text: 'API Key removed successfully' });
      await loadSectionData('apiKeys', session, settingsDraft.apiBaseUrl, { force: true });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'API key deletion failed.';
      addNotification('error', 'API Key Deletion Failed', errMsg);
      setMessage({ tone: 'error', text: errMsg });
    } finally {
      setBusy(null);
    }
  }

  async function ensureLocalRouterDeployment(routingAlgorithm: string, requestedServingLibrary?: ServingLibrary): Promise<{ endpointId?: string; endpointUrl: string; modelId: string; runtime: ServingLibrary }> {
    if (!session) {
      throw new Error('Sign in before deploying a local router model.');
    }

    const routerModelId = normalizeLocalModelId(routingAlgorithm);
    if (!routerModelId) {
      throw new Error('Select a valid local router model before deploying locally.');
    }

    const existingRouterEndpoint = dashboard.inferenceEndpoints.find((endpoint, index) => {
      const record = endpoint as Record<string, unknown>;
      const deploymentTarget = String(record.deployment_target ?? '').toLowerCase();
      if (deploymentTarget === 'cloud' || deploymentTarget === 'closed_source_api') {
        return false;
      }
      const endpointModelId = String(record.model_id ?? record.modelId ?? '');
      const endpointRole = String(record.endpoint_role ?? record.role ?? '').toLowerCase();
      const endpointUrl = String(record.endpoint_url ?? '').toLowerCase();
      return endpointModelId === routerModelId
        && (deploymentTarget === 'local' || endpointUrl.includes('localhost') || endpointUrl.includes('127.0.0.1'))
        && (!endpointRole || endpointRole === 'router' || endpointRole === 'model' || String(record.name ?? '').toLowerCase().includes('router'))
        && Boolean(getInferenceEndpointIdFromRecord(endpoint, index));
    });

    if (existingRouterEndpoint) {
      const endpointRecord = existingRouterEndpoint as Record<string, unknown>;
      const endpointUrl = String(endpointRecord.endpoint_url ?? '');
      const existingRuntime = normalizeServingLibrary(endpointRecord.serving_library, getLocalRuntimeFromEndpointUrl(endpointUrl));
      if (existingRuntime === 'ollama' && !isOllamaCompatibleModelId(routerModelId)) {
        throw new Error(`${routerModelId} is not a GGUF/llama.cpp router model, so Ollama cannot host it. Select Transformers or vLLM.`);
      }

      return {
        endpointId: getInferenceEndpointIdFromRecord(existingRouterEndpoint, dashboard.inferenceEndpoints.indexOf(existingRouterEndpoint)),
        endpointUrl,
        modelId: routerModelId,
        runtime: existingRuntime,
      };
    }

    if (!window.desktopBridge?.deployHfModel) {
      throw new Error('Local router deployment is not available in this app build.');
    }

    const routerPlatform = getSupportedPlatform(dashboard.machineDetails?.platform);
    const routerRuntime = requestedServingLibrary || getRequiredRouterRuntime(routerModelId, routerPlatform);
    const unsupportedReason = getRouterRuntimeUnsupportedReason(routerRuntime, routerPlatform, routerModelId);
    if (unsupportedReason) {
      throw new Error(unsupportedReason);
    }

    if (!libraries[routerRuntime]) {
      await ensureServingLibraryInstalled(routerRuntime, `${formatLocalRuntime(routerRuntime)} is required for the selected router model.`);
    }

    setMessage({ tone: 'info', text: `Deploying local router model ${routerModelId} with ${formatLocalRuntime(routerRuntime)}...` });
    const launchRuntime = routerRuntime as 'vllm' | 'ollama' | 'transformers';
    const deployment = await window.desktopBridge.deployHfModel({
      repoId: routerModelId,
      runtime: launchRuntime,
      role: 'router',
      progressId: `${routerModelId}-router-${Date.now()}`,
    });

    const detectedMachineId = typeof dashboard.machineDetails?.machineId === 'string' ? dashboard.machineDetails.machineId : '';
    const detectedMachineName = typeof dashboard.machineDetails?.machineName === 'string'
      ? dashboard.machineDetails.machineName
      : typeof dashboard.machineDetails?.hostname === 'string'
        ? dashboard.machineDetails.hostname
        : '';

    const registeredEndpoint = await createInferenceEndpoint(settingsDraft.apiBaseUrl, session, {
      name: `${routerModelId} router`,
      provider: 'openai',
      model_id: deployment.modelId,
      deployment_target: 'local',
      endpoint_url: deployment.endpointUrl,
      machine_id: detectedMachineId,
      machine_name: detectedMachineName,
      top_p: 0.9,
      temperature: 0.1,
      max_tokens: 1024,
      endpoint_role: 'router',
      serving_library: routerRuntime,
    });

    await loadSectionData('routing', session, settingsDraft.apiBaseUrl, { force: true, silent: true }).catch(() => undefined);

    return {
      endpointId: getEndpointIdFromPayload(registeredEndpoint),
      endpointUrl: deployment.endpointUrl,
      modelId: deployment.modelId,
      runtime: deployment.runtime,
    };
  }

  async function handleCreateRoute(payload: CreateRoutePayload) {
    if (!session) {
      return false;
    }

    const routeName = payload.name.trim();
    if (!routeName) {
      setMessage({ tone: 'error', text: 'Route name is required.' });
      return false;
    }

    if (payload.attachedEndpointIds.length === 0) {
      setMessage({ tone: 'error', text: 'Select at least one endpoint for this route.' });
      return false;
    }

    setBusy('create-intelligent-endpoint');
    try {
      const routerDeployment = await ensureLocalRouterDeployment(payload.routingAlgorithm, payload.routerServingLibrary);
      const registeredLocalDeployments = await ensureSelectedLocalDeploymentsRegistered(payload.attachedEndpointIds);
      const attachedEndpointIds = payload.attachedEndpointIds.map((endpointId) => {
        const localDeployment = registeredLocalDeployments.find((deployment) => getLocalDeploymentSelectionId(deployment) === endpointId);
        return localDeployment?.endpointId || endpointId;
      });
      const attachedInferenceEndpoints = attachedEndpointIds.map((endpointId) => (
        buildAttachedInferenceEndpointPayload(
          endpointId,
          routeName,
          payload.inputModality,
          payload.modelId,
          dashboard.inferenceEndpoints,
          dashboard.instances,
          localDeployments,
          dashboard.models,
        )
      ));
      const localRouteCandidates = payload.attachedEndpointIds.map((endpointId) => (
        buildAttachedInferenceEndpointPayload(
          endpointId,
          routeName,
          payload.inputModality,
          payload.modelId,
          dashboard.inferenceEndpoints,
          dashboard.instances,
          localDeployments,
          dashboard.models,
        )
      ));
      await validateLocalRouteCandidates(routerDeployment.endpointUrl, localRouteCandidates);

      const createdRoute = await createIntelligentEndpoint(settingsDraft.apiBaseUrl, session, {
        name: routeName,
        routing_config: {
          routing_algorithm: payload.routingAlgorithm,
          router_runtime: 'local',
          ...(routerDeployment?.endpointId ? { router_endpoint_id: routerDeployment.endpointId } : {}),
          ...(routerDeployment?.endpointUrl ? { router_endpoint_url: routerDeployment.endpointUrl } : {}),
          serving_library: routerDeployment.runtime,
          input_modality: payload.inputModality,
          candidate_models: payload.modelId ? [payload.modelId] : [],
          description: payload.description.trim() || undefined,
        },
        ...(attachedEndpointIds.length > 0
          ? {
              attached_endpoints: {
                inference_api: attachedInferenceEndpoints,
              },
            }
          : {}),
      });
      const createdRouteId = getEndpointIdFromPayload(createdRoute) || routeName;
      if (window.desktopBridge?.startLocalRoute) {
        try {
          const localRoute = await window.desktopBridge.startLocalRoute({
            routeId: createdRouteId,
            name: routeName,
            description: payload.description,
            routerEndpointUrl: routerDeployment.endpointUrl,
            routerModelId: routerDeployment.modelId,
            candidates: localRouteCandidates,
          });
          setLocalRouteUrls((current) => ({ ...current, [createdRouteId]: localRoute.endpointUrl }));
        } catch (error) {
          setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Route created, but local route server could not start.' });
          return false;
        }
      }

      setMessage({
        tone: 'success',
        text: attachedEndpointIds.length > 0 ? 'Local route created with router and inference endpoints attached.' : 'Route created with route config.',
      });
      setIntelligentEndpointName('');
      await loadSectionData('routing', session, settingsDraft.apiBaseUrl, { force: true });
      return true;
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to create route.' });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function handleSetupRouterEndpoint(routerModelId: string) {
    const normalizedRouterModelId = normalizeLocalModelId(routerModelId);
    if (!normalizedRouterModelId) {
      setMessage({ tone: 'error', text: 'Select a valid router model before setup.' });
      return;
    }

    setBusy('install-router-stack');
    try {
      await ensureTransformerRouterStackInstalled();
      setSelfHostForm((current) => ({
        ...current,
        name: `${normalizedRouterModelId} router`,
        model_id: '',
        useHfUrl: true,
        hfUrl: `https://huggingface.co/${normalizedRouterModelId}`,
        serving_library: 'transformers',
        endpoint_url: current.endpoint_url || 'http://localhost:8000/v1',
      }));
      setInfraTab('self-hosted');
      setActiveSection('selfHosting');
      setMessage({
        tone: 'info',
        text: 'PyTorch and Transformers are ready. Router model loaded in Self Hosting; start/register the local endpoint, then return to Routing to create the route.',
      });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to install the PyTorch/Transformers router stack.' });
    } finally {
      setBusy(null);
    }
  }

  async function ensureTransformerRouterStackInstalled(): Promise<void> {
    if (!window.desktopBridge?.installLibrary || !window.desktopBridge?.checkLibrary) {
      throw new Error('Automatic PyTorch/Transformers installation is not available in this app build.');
    }

    const currentPyTorch = libraries.pytorch || (await window.desktopBridge.checkLibrary('pytorch'));
    const currentTransformers = libraries.transformers || (await window.desktopBridge.checkLibrary('transformers'));
    if (!currentPyTorch || !currentTransformers) {
      setMessage({ tone: 'info', text: 'Installing PyTorch and Transformers for the local router endpoint...' });
      setLibraryInstallLog([]);
      setIsInstallLogOpen(true);
      await window.desktopBridge.installLibrary('transformers');
    }

    let pytorchInstalled = await window.desktopBridge.checkLibrary('pytorch');
    let transformersInstalled = await window.desktopBridge.checkLibrary('transformers');
    if (!pytorchInstalled) {
      setLibraryInstallLog([]);
      setIsInstallLogOpen(true);
      await window.desktopBridge.installLibrary('pytorch');
      pytorchInstalled = await window.desktopBridge.checkLibrary('pytorch');
    }

    if (!transformersInstalled || !pytorchInstalled) {
      transformersInstalled = await window.desktopBridge.checkLibrary('transformers');
      pytorchInstalled = await window.desktopBridge.checkLibrary('pytorch');
    }

    setLibraries((current) => ({
      ...current,
      pytorch: pytorchInstalled,
      transformers: transformersInstalled,
    }));

    if (!pytorchInstalled || !transformersInstalled) {
      throw new Error('PyTorch and Transformers installation finished, but the app could not import both packages. Restart OneInfer Edge or check your Python environment.');
    }
  }

  async function ensureServingLibraryInstalled(library: ServingLibrary, reason: string): Promise<void> {
    if (library === 'transformers') {
      await ensureTransformerRouterStackInstalled();
      return;
    }

    if (libraries[library]) {
      return;
    }

    if (!window.desktopBridge?.installLibrary || !window.desktopBridge?.checkLibrary) {
      throw new Error(`${formatLocalRuntime(library)} is required, but automatic installation is not available in this app build.`);
    }

    setMessage({ tone: 'info', text: `${reason} Installing ${formatLocalRuntime(library)} before creating the route...` });
    setLibraryInstallLog([]);
    setIsInstallLogOpen(true);
    await window.desktopBridge.installLibrary(library);
    const installed = await window.desktopBridge.checkLibrary(library);
    setLibraries((current) => ({ ...current, [library]: installed }));
    if (!installed) {
      throw new Error(`${formatLocalRuntime(library)} installation finished, but the app could not verify it on this machine.`);
    }
  }

  async function ensureSelectedLocalDeploymentsRegistered(endpointIds: string[]): Promise<LocalModelDeployment[]> {
    if (!session) {
      return [];
    }

    const selectedLocalDeployments = visibleLocalDeployments.filter((deployment) => endpointIds.includes(getLocalDeploymentSelectionId(deployment)));
    if (selectedLocalDeployments.length === 0) {
      return [];
    }

    const detectedMachineId = typeof dashboard.machineDetails?.machineId === 'string' ? dashboard.machineDetails.machineId : '';
    const detectedMachineName = typeof dashboard.machineDetails?.machineName === 'string'
      ? dashboard.machineDetails.machineName
      : typeof dashboard.machineDetails?.hostname === 'string'
        ? dashboard.machineDetails.hostname
        : '';

    const registeredDeployments: LocalModelDeployment[] = [];
    for (const deployment of selectedLocalDeployments) {
      if (deployment.endpointId) {
        registeredDeployments.push(deployment);
        continue;
      }

      const existingEndpoint = dashboard.inferenceEndpoints.find((endpoint) => {
        const endpointUrl = String(endpoint.endpoint_url ?? '');
        return endpointUrl === deployment.endpointUrl;
      });
      const existingEndpointId = existingEndpoint ? getInferenceEndpointIdFromRecord(existingEndpoint, dashboard.inferenceEndpoints.indexOf(existingEndpoint)) : '';
      if (existingEndpointId) {
        const nextDeployment = { ...deployment, endpointId: existingEndpointId };
        registeredDeployments.push(nextDeployment);
        continue;
      }

      const registeredEndpoint = await createInferenceEndpoint(settingsDraft.apiBaseUrl, session, {
        name: deployment.name,
        provider: 'openai',
        model_id: deployment.modelId,
        deployment_target: 'local',
        endpoint_url: deployment.endpointUrl,
        machine_id: detectedMachineId,
        machine_name: detectedMachineName,
        model_description: deployment.modelDescription,
        model_context_length: deployment.modelContextLength,
        model_parameters: deployment.modelParameters,
        model_tags: deployment.modelTags,
        model_pipeline_tag: deployment.modelPipelineTag,
        top_p: 0.9,
        temperature: 0.7,
        max_tokens: 4096,
        serving_library: deployment.runtime,
      });
      const endpointId = getEndpointIdFromPayload(registeredEndpoint);
      registeredDeployments.push(endpointId ? { ...deployment, endpointId } : deployment);
    }

    if (registeredDeployments.some((deployment) => deployment.endpointId)) {
      setLocalDeployments((current) => current.map((deployment) => {
        const registeredDeployment = registeredDeployments.find((item) => item.endpointUrl === deployment.endpointUrl);
        return registeredDeployment?.endpointId ? { ...deployment, endpointId: registeredDeployment.endpointId } : deployment;
      }));
      await loadSectionData('routing', session, settingsDraft.apiBaseUrl, { force: true, silent: true }).catch(() => undefined);
    }

    return registeredDeployments;
  }

  async function handleDeleteRoute(routeId: string, routeName: string) {
    if (!session) {
      return;
    }

    const confirmed = window.confirm(`Delete route "${routeName}"?`);
    if (!confirmed) {
      return;
    }

    setBusy(`delete-route:${routeId}`);
    try {
      await window.desktopBridge?.stopLocalRoute?.({ routeId }).catch(() => undefined);
      setLocalRouteUrls((current) => {
        const next = { ...current };
        delete next[routeId];
        return next;
      });
      await deleteIntelligentEndpoint(settingsDraft.apiBaseUrl, session, routeId);
      setMessage({ tone: 'success', text: 'Route deleted.' });
      await loadSectionData('routing', session, settingsDraft.apiBaseUrl, { force: true });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to delete route.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleCopyRoute(routeId: string, route?: EndpointItem) {
    if (!session) {
      return;
    }

    let localRouteUrl = localRouteUrls[routeId] ? toOpenAiChatCompletionsUrl(localRouteUrls[routeId]) : null;
    if (!localRouteUrl && route) {
      try {
        const startedRoute = await startLocalRouteFromRecord(routeId, route);
        localRouteUrl = toOpenAiChatCompletionsUrl(startedRoute.endpointUrl);
        setLocalRouteUrls((current) => ({ ...current, [routeId]: startedRoute.endpointUrl }));
      } catch {
        localRouteUrl = getLocalRouteChatUrl(route);
      }
    }

    const normalizedBaseUrl = settingsDraft.apiBaseUrl.replace(/\/+$/, '');
    const routeUrl = localRouteUrl || `${normalizedBaseUrl}/developer/${session.developerId}/intelligent-endpoints/${routeId}/chat/completions`;
    navigator.clipboard?.writeText(routeUrl);
    setMessage({ tone: 'success', text: localRouteUrl ? 'Local route URL copied.' : 'Route URL copied.' });
  }

  async function startLocalRouteFromRecord(routeId: string, route: EndpointItem): Promise<{ endpointUrl: string; port: number; routeId: string }> {
    if (!window.desktopBridge?.startLocalRoute) {
      throw new Error('Local route server is not available in this app build.');
    }

    const record = route as Record<string, unknown>;
    const routingConfig = getRouteRoutingConfig(route);
    const candidates = getRouteAttachedCandidates(route);
    const routerEndpointUrl = String(routingConfig.router_endpoint_url ?? record.router_endpoint_url ?? '').trim();
    if (!routerEndpointUrl) {
      throw new Error('This route does not include a local router endpoint URL.');
    }

    if (candidates.length === 0) {
      throw new Error('This route does not include attached endpoint URLs for local routing.');
    }

    return window.desktopBridge.startLocalRoute({
      routeId,
      name: String(record.name ?? routeId),
      description: String(routingConfig.description ?? record.description ?? ''),
      routerEndpointUrl,
      routerModelId: String(routingConfig.routing_algorithm ?? ''),
      candidates,
    });
  }

function normalizeModelIdForMatch(modelId: string): string {
  let normalized = modelId.trim().toLowerCase();
  normalized = normalized.split(':')[0]; // remove :latest or tag suffix
  if (normalized.startsWith('hf.co/')) {
    normalized = normalized.slice(6); // remove hf.co/ prefix
  }
  if (normalized.endsWith('-gguf')) {
    normalized = normalized.slice(0, -5); // remove -gguf suffix
  }
  return normalized;
}

function isSameLocalModelId(left: string, right: string): boolean {
  return normalizeModelIdForMatch(left) === normalizeModelIdForMatch(right);
}

  async function validateLocalRouteCandidates(routerEndpointUrl: string, candidates: Record<string, unknown>[]) {
    if (!window.desktopBridge?.getLocalModelMetrics) {
      return;
    }

    const normalizedRouterUrl = normalizeLocalEndpointUrl(routerEndpointUrl);
    for (const candidate of candidates) {
      const endpointUrl = String(candidate.endpoint_url ?? candidate.endpointUrl ?? '').trim();
      const modelId = String(candidate.model_id ?? candidate.modelId ?? '').trim();
      const name = String(candidate.endpoint_name ?? candidate.name ?? modelId ?? 'candidate');

      // Only validate local endpoints! External/cloud endpoints do not run locally and do not need to be verified against local Ollama/model-server metrics.
      if (!isLocalEndpoint(candidate as any)) {
        continue;
      }

      if (!endpointUrl) {
        throw new Error(`${name} does not have a local endpoint URL. Deploy/register the model before attaching it to a local route.`);
      }

      if (normalizeLocalEndpointUrl(endpointUrl) === normalizedRouterUrl) {
        throw new Error(`${name} points to the router URL (${endpointUrl}). Attach the actual model server URL, not the router model URL.`);
      }

      const metrics = await window.desktopBridge.getLocalModelMetrics({ endpointUrl });
      if (!metrics.healthy) {
        throw new Error(`${name} is not reachable at ${endpointUrl}. Start/deploy that model before creating the local route.`);
      }

      if (modelId && Array.isArray(metrics.modelIds) && metrics.modelIds.length > 0 && !metrics.modelIds.some((id) => isSameLocalModelId(id, modelId))) {
        throw new Error(`${name} is registered as ${modelId}, but ${endpointUrl} reports: ${metrics.modelIds.join(', ')}. Update the endpoint URL or redeploy the model.`);
      }
    }
  }

  async function validateSelfHostedEndpointRegistration(endpointUrl: string, modelId: string, name: string) {
    if (!window.desktopBridge?.getLocalModelMetrics || !isLocalEndpointUrl(endpointUrl)) {
      return;
    }

    const metrics = await window.desktopBridge.getLocalModelMetrics({ endpointUrl });
    if (!metrics.healthy) {
      throw new Error(`${name} is not reachable at ${endpointUrl}. Start the model server first, then register the URL.`);
    }

    if (Array.isArray(metrics.modelIds) && metrics.modelIds.length > 0) {
      if (!metrics.modelIds.some((id) => isSameLocalModelId(id, modelId))) {
        throw new Error(`${name} is registered as ${modelId}, but ${endpointUrl} is serving: ${metrics.modelIds.join(', ')}. Use the actual server URL for ${modelId}; do not reuse the router URL.`);
      }
    }
  }

  async function handleUseEndpointInRoute(endpointId: string, endpointName: string) {
    setRouteInitialEndpointId(endpointId);
    setIntelligentEndpointName((current) => current || `${endpointName} route`);
    setActiveSection('routing');
    if (session) {
      await loadSectionData('routing', session, settingsDraft.apiBaseUrl, { force: true, silent: true }).catch(() => undefined);
    }
  }

  async function handleStartLocalDeployment(deployment: {
    endpointId: string;
    endpointUrl: string;
    modelId: string;
    name: string;
    runtime: string;
  }) {
    if (!window.desktopBridge?.deployHfModel) {
      setMessage({ tone: 'error', text: 'Local model start is not available in this app build.' });
      return;
    }

    const runtime = deployment.runtime as ServingLibrary;
    if (!isLaunchableLocalRuntime(runtime)) {
      setMessage({ tone: 'error', text: `${formatLocalRuntime(runtime)} endpoints must be started manually, then registered with their OpenAI-compatible URL.` });
      return;
    }

    if (!libraries[runtime]) {
      setMessage({ tone: 'error', text: `Install ${formatLocalRuntime(runtime)} before starting this local endpoint.` });
      return;
    }

    const port = getPortFromLocalEndpointUrl(deployment.endpointUrl);
    if (runtime !== 'ollama' && !port) {
      setMessage({ tone: 'error', text: `Could not read a local port from ${deployment.endpointUrl}. Update the endpoint URL, then try again.` });
      return;
    }

    const progressId = `${deployment.modelId}-${Date.now()}`;
    setBusy(`start-local:${deployment.endpointUrl}`);
    setDeploymentProgress([{
      id: progressId,
      stage: 'starting',
      message: `Starting ${deployment.name}.`,
      detail: deployment.endpointUrl,
      level: 'info',
      timestamp: Date.now(),
    }]);

    try {
      const started = await window.desktopBridge.deployHfModel({
        repoId: deployment.modelId,
        runtime,
        port: runtime === 'ollama' ? undefined : port,
        exactPort: runtime !== 'ollama',
        progressId,
      });
      const nextDeployment: LocalModelDeployment = {
        endpointId: deployment.endpointId,
        endpointUrl: deployment.endpointUrl,
        modelId: started.modelId || deployment.modelId,
        name: deployment.name,
        pid: started.pid,
        runtime: started.runtime,
        deployedAt: new Date().toISOString(),
      };
      let nextLocalDeployments: LocalModelDeployment[] = [];
      setLocalDeployments((current) => {
        nextLocalDeployments = [
          nextDeployment,
          ...current.filter((item) => !isSameLocalDeploymentByKey(item, nextDeployment)),
        ];
        return nextLocalDeployments;
      });

      if (window.desktopBridge.getLocalModelMetrics) {
        const metrics = await window.desktopBridge.getLocalModelMetrics({ endpointUrl: deployment.endpointUrl });
        setLocalModelMetrics((current) => ({
          ...current,
          [deployment.endpointUrl]: metrics,
          [normalizeLocalEndpointUrl(deployment.endpointUrl)]: metrics,
        }));
      }

      await persistState(session, settingsDraft.apiBaseUrl, claudeCodeProvider, nextLocalDeployments);
      setMessage({ tone: 'success', text: `${deployment.name} is online.` });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start local model.';
      setMessage({ tone: 'error', text: errorMessage });
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteLocalDeployment(deployment: {
    endpointId: string;
    endpointUrl: string;
    modelId: string;
    name: string;
    runtime: string;
    registered: boolean;
  }) {
    if (!session) {
      return;
    }

    const confirmed = window.confirm(`Delete local model "${deployment.name}"?`);
    if (!confirmed) {
      return;
    }

    setBusy(`delete-local:${deployment.endpointUrl}`);
    try {
      if (deployment.registered) {
        console.info('[local-delete] Deleting registered inference endpoint', {
          endpointId: deployment.endpointId,
          endpointUrl: deployment.endpointUrl,
          modelId: deployment.modelId,
          runtime: deployment.runtime,
        });
        try {
          const deleteResult = await deleteInferenceEndpoint(settingsDraft.apiBaseUrl, session, deployment.endpointId);
          console.info('[local-delete] Backend delete result', deleteResult);
        } catch (error) {
          console.warn('[local-delete] Backend delete failed; hiding local endpoint in desktop state.', error);
        }
      }

      if (window.desktopBridge?.deleteLocalModel) {
        try {
          await window.desktopBridge.deleteLocalModel({
            endpointUrl: deployment.endpointUrl,
            modelId: deployment.modelId,
            runtime: deployment.runtime,
          });
        } catch (error) {
          console.warn('[local-delete] Local runtime cleanup failed after registration delete.', error);
        }
      }

      const nextDeletedLocalEndpointKeys = uniqueStrings([
        ...deletedLocalEndpointKeys,
        ...getLocalEndpointDeletionKeys(deployment),
      ]);
      const nextLocalDeployments = localDeployments.filter((item) => !isSameLocalDeploymentByKey(item, deployment));
      setDeletedLocalEndpointKeys(nextDeletedLocalEndpointKeys);
      setLocalDeployments(nextLocalDeployments);
      setLocalModelMetrics((current) => {
        const next = { ...current };
        delete next[deployment.endpointUrl];
        delete next[normalizeLocalEndpointUrl(deployment.endpointUrl)];
        return next;
      });
      await persistState(session, settingsDraft.apiBaseUrl, claudeCodeProvider, nextLocalDeployments, nextDeletedLocalEndpointKeys);
      setMessage({ tone: 'success', text: 'Local model deleted.' });
      await loadSectionData('selfHosting', session, settingsDraft.apiBaseUrl, { force: true, silent: true });
      await loadSectionData('routing', session, settingsDraft.apiBaseUrl, { force: true, silent: true });
    } catch (error) {
      const rawErrorMessage = error instanceof Error ? error.message : 'Failed to delete local model.';
      const errorMessage = rawErrorMessage.includes("No handler registered for 'app:delete-local-model'")
        ? 'Local model deletion is not loaded in the Electron main process yet. Fully quit OneInfer Edge, restart with npm run dev, then delete again.'
        : rawErrorMessage;
      setMessage({ tone: 'error', text: errorMessage });
    } finally {
      setBusy(null);
    }
  }

  async function handleInstallLibrary(name: ServingLibrary) {
    if (!window.desktopBridge?.installLibrary || !window.desktopBridge?.checkLibrary) return;
    setBusy(`install-${name}`);
    setLibraryInstallLog([]);
    setIsInstallLogOpen(true);
    try {
      await window.desktopBridge.installLibrary(name);
      const status = await window.desktopBridge.checkLibrary(name);
      if (name === 'transformers') {
        const pytorchStatus = await window.desktopBridge.checkLibrary('pytorch');
        setLibraries((current) => ({ ...current, transformers: status, pytorch: pytorchStatus }));
        setMessage({ tone: 'success', text: 'Transformers and PyTorch installed successfully.' });
      } else {
        setLibraries((current) => ({ ...current, [name]: status }));
        setMessage({ tone: 'success', text: `${formatLocalRuntime(name)} installed successfully.` });
      }
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : `Failed to install ${name}.` });
      throw error;
    } finally {
      setBusy(null);
    }
  }

  async function handleAddCredits() {
    try {
      if (window.desktopBridge?.openExternalUrl) {
        await window.desktopBridge.openExternalUrl({ url: ONEINFER_CREDITS_URL });
        return;
      }

      window.open(ONEINFER_CREDITS_URL, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to open credits page.' });
    }
  }

  if (booting) {
    return (
      <div className="shell shell-center">
        <div className="loading-card">
          <LoaderCircle className="spin" />
          <h1>Booting OneInfer Edge</h1>
          <p>Loading local session and API workspace.</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <AuthPage
        email={email}
        otp={otp}
        loginStep={loginStep}
        busy={busy}
        message={message}
        registrationForm={registrationForm}
        onEmailChange={setEmail}
        onOtpChange={setOtp}
        onRegistrationChange={setRegistrationForm}
        onOtpRequest={handleOtpRequest}
        onLogin={handleLogin}
        onRegistration={handleRegistration}
        onBackToEmail={() => {
          setLoginStep('email');
          setOtp('');
        }}
      />
    );
  }

  return (
    <AppLayout
      appVersion={appVersion}
      activeSection={activeSection}
      dashboard={visibleDashboard}
      sidebarOpen={sidebarOpen}
      onSidebarOpen={setSidebarOpen}
      onSectionChange={setActiveSection}
      onAddCredits={handleAddCredits}
      onRefresh={handleRefreshCurrentSection}
      onGitPull={handleGitPull}
      onLogout={handleLogout}
      notifications={notifications}
      onMarkAllRead={handleMarkAllNotificationsRead}
      onClearAll={handleClearAllNotifications}
      onToggleRead={handleToggleNotificationRead}
      onDeleteNotification={handleDeleteNotification}
    >
      {message ? (
        <div
          className={`auth-notice ${message.tone}`}
          role="status"
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: 99999,
            minWidth: '320px',
            maxWidth: '480px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            animation: 'slideIn 0.2s ease-out'
          }}
        >
          {message.tone === 'success' ? (
            <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
          ) : message.tone === 'error' ? (
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
          ) : (
            <Info size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
          )}
          <span style={{ flex: 1 }}>{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            type="button"
            style={{
              background: 'none',
              border: 'none',
              color: 'currentColor',
              cursor: 'pointer',
              fontSize: '18px',
              fontWeight: 'bold',
              padding: '0 4px',
              opacity: 0.7,
              lineHeight: 1,
              marginTop: '-2px'
            }}
          >
            &times;
          </button>
        </div>
      ) : null}
      {isInstallLogOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            width: '460px',
            height: '360px',
            backgroundColor: 'rgba(9, 16, 26, 0.95)',
            border: message?.tone === 'error' && busy === null ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(0, 112, 243, 0.3)',
            boxShadow: message?.tone === 'error' && busy === null ? '0 12px 40px rgba(239, 68, 68, 0.25)' : '0 12px 40px rgba(0, 112, 243, 0.2)',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 99998,
            overflow: 'hidden',
            fontFamily: 'monospace',
            color: '#e2e8f0',
            backdropFilter: 'blur(16px)',
            transition: 'all 0.3s ease-out'
          }}
        >
          <div
            style={{
              padding: '10px 16px',
              background: 'rgba(15, 27, 43, 0.9)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
              <Terminal size={14} style={{ color: busy ? '#38bdf8' : (message?.tone === 'error' ? '#ef4444' : '#10b981') }} />
              <span style={{ fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.5px', textTransform: 'uppercase', color: '#94a3b8' }}>
                {busy ? 'Installing Environment' : (message?.tone === 'error' ? 'Installation Failed' : 'Installation Output')}
              </span>
            </div>
            <button
              onClick={() => setIsInstallLogOpen(false)}
              type="button"
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '18px',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 0.2s',
                opacity: 0.8
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
            >
              &times;
            </button>
          </div>
          <div
            style={{
              flex: 1,
              padding: '12px 16px',
              overflowY: 'auto',
              fontSize: '10px',
              lineHeight: '1.6',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              backgroundColor: '#050a12',
              color: '#38bdf8'
            }}
          >
            {libraryInstallLog.length === 0 ? (
              <div style={{ color: '#64748b', fontStyle: 'italic', padding: '12px 0' }}>
                Waiting for installation output...
              </div>
            ) : (
              libraryInstallLog.map((log, idx) => (
                <div key={idx} style={{ whiteSpace: 'pre-wrap', color: log.isError ? '#f87171' : '#38bdf8' }}>
                  {log.text}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
          {message?.tone === 'error' && busy === null && (
            <div
              style={{
                padding: '10px 16px',
                background: 'rgba(239, 68, 68, 0.1)',
                borderTop: '1px solid rgba(239, 68, 68, 0.2)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <span style={{ fontSize: '11px', color: '#f87171', fontWeight: 'bold' }}>
                An error occurred during pip execution.
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(libraryInstallLog.map(l => l.text).join(''));
                  setMessage({ tone: 'success', text: 'Installation logs copied to clipboard!' });
                }}
                style={{
                  fontSize: '10px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Copy Logs
              </button>
            </div>
          )}
        </div>
      )}
      {activeSection === 'overview' ? (
        <div className="app-topbar">
          <div className="welcome-copy">
            <strong>Welcome</strong>
            <span>{getGreeting()}, {getWelcomeName(session, visibleDashboard.profile)}</span>
          </div>
          <div className="top-credit-pill">
            <div className="top-credit-copy">
              <span>Available Credits</span>
              <strong>{getBalance(visibleDashboard.credits)}</strong>
            </div>
            <button className="top-credit-action" type="button" onClick={handleAddCredits}>
              <Plus size={13} />
              Add credits
            </button>
          </div>
        </div>
      ) : null}

      <main className="main-stage" style={{ padding: '20px' }}>
        {activeSection === 'overview' ? (
          <OverviewPage
            dashboard={visibleDashboard}
            busy={busy}
            infraTab={infraTab}
            overviewTab={overviewTab}
            claudeCodeProvider={claudeCodeProvider}
            localDeployments={visibleLocalDeployments}
            localModelMetrics={localModelMetrics}
            onInfraTabChange={setInfraTab}
            onOverviewTabChange={setOverviewTab}
            onClaudeProviderChange={handleClaudeCodeProviderChange}
            onEnableOpenCode={handleEnableOpenCode}
            onEnableKiloCode={handleEnableKiloCode}
            onEnableOpenClaw={handleEnableOpenClaw}
            onEnableCodex={handleEnableCodex}
            enabledTools={enabledTools}
            toolProviders={toolProviders}
            onToolProviderChange={handleToolProviderChange}
            onSectionChange={setActiveSection}
            onOpenRoute={(routeId) => {
              setRouteInitialViewId(routeId);
              setActiveSection('routing');
            }}
          />
        ) : null}

        {activeSection === 'selfHosting' ? (
          <>
            {(() => {
              const activeLibrary = selfHostForm.serving_library;
              const activeError = libraryErrors[activeLibrary] || (activeLibrary === 'transformers' ? (libraryErrors.pytorch || libraryErrors.transformers) : null);
              if (!libraries[activeLibrary] && activeError) {
                const isVcRedistError = activeError.toLowerCase().includes('dll load failed') || 
                                        activeError.toLowerCase().includes('visual c++') || 
                                        activeError.toLowerCase().includes('vcruntime') || 
                                        activeError.toLowerCase().includes('msvcp');
                return (
                  <div
                    style={{
                      margin: '0 0 20px 0',
                      padding: '16px',
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      borderRadius: '8px',
                      color: '#ef4444',
                      fontSize: '13px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                      <AlertCircle size={16} />
                      <span>Python Environment Diagnostic Warning</span>
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: '11px', backgroundColor: 'rgba(0, 0, 0, 0.2)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.05)', color: '#f87171', whiteSpace: 'pre-wrap', maxHeight: '100px', overflowY: 'auto' }}>
                      {activeError}
                    </div>
                    {isVcRedistError ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
                        <span style={{ color: '#94a3b8', fontSize: '12px', flex: 1 }}>
                          OneInfer Edge detected that Microsoft Visual C++ Runtime is missing on your Windows machine, which prevents PyTorch from loading.
                        </span>
                        <button
                          type="button"
                          disabled={busy === 'install-vc-redist'}
                          onClick={async () => {
                            setBusy('install-vc-redist');
                            setMessage({ tone: 'info', text: 'Installing Microsoft Visual C++ Redistributable silently. Please wait...' });
                            try {
                              await window.desktopBridge.installVcRedist();
                              setMessage({ tone: 'success', text: 'Visual C++ Redistributable installed successfully!' });
                              if (window.desktopBridge?.checkLibrary) {
                                await window.desktopBridge.checkLibrary(activeLibrary);
                              }
                            } catch (err: any) {
                              setMessage({ tone: 'error', text: `VC++ Runtime Auto-Installation failed: ${err.message || String(err)}` });
                            } finally {
                              setBusy(null);
                            }
                          }}
                          style={{
                            background: 'rgba(0, 112, 243, 0.15)',
                            border: '1px solid rgba(0, 112, 243, 0.3)',
                            color: '#38bdf8',
                            borderRadius: '4px',
                            padding: '6px 12px',
                            fontWeight: 'bold',
                            fontSize: '11px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {busy === 'install-vc-redist' ? 'Installing VC++...' : 'Auto-Install VC++ Runtime'}
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ color: '#94a3b8', fontSize: '11px' }}>
                          Tip: If PyTorch or Transformers are installed on your machine but failing to import, ensure you have a 64-bit Python installation and its PATH is added to Windows Environment Variables.
                        </span>
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })()}
            <SelfHostingPage
            dashboard={visibleDashboard}
            selfHostForm={selfHostForm}
            validationResult={validationResult}
            hfModelMetadata={hfModelMetadata}
            hfModelMetadataLoading={hfModelMetadataLoading}
            hfModelMetadataError={hfModelMetadataError}
            libraries={libraries}
            busy={busy}
            analysisPanel={(
              <HfModelDetailPanel
                model={hfModelMetadata}
                validation={validationResult}
                machine={visibleDashboard.machineDetails}
                libraries={libraries}
                selectedLibrary={selfHostForm.serving_library}
                busy={busy}
                message={message}
                deploymentProgress={deploymentProgress}
                onSelectLibrary={(servingLibrary) => setSelfHostForm((current) => ({ ...current, serving_library: servingLibrary }))}
                onInstall={handleInstallLibrary}
                onRegister={handleDeploySelfHostedModel}
                onCancelDeploy={handleCancelSelfHostedDeployment}
              />
            )}
            localDeployments={visibleLocalDeployments}
            localModelMetrics={localModelMetrics}
            onFormChange={setSelfHostForm}
            onSubmit={(event) => {
              event?.preventDefault();
              return handleDeploySelfHostedModel();
            }}
            onInstallLibrary={handleInstallLibrary}
            onStartLocalDeployment={handleStartLocalDeployment}
            onUseInRoute={handleUseEndpointInRoute}
            onShowUsage={setUsageTarget}
            onDeleteLocalDeployment={handleDeleteLocalDeployment}
          />
          </>
        ) : null}

        {activeSection === 'instances' ? (
          <InstancesPage
            dashboard={visibleDashboard}
            instanceForm={instanceForm}
            busy={busy}
            showCreateInstanceModal={showCreateInstanceModal}
            onFormChange={setInstanceForm}
            onModalChange={setShowCreateInstanceModal}
            onCreate={handleDeployCloudModel}
            onAction={handleInstanceAction}
            onDelete={handleDeleteInstance}
            onUseEndpointInRoute={handleUseEndpointInRoute}
            onShowUsage={setUsageTarget}
            onDeleteEndpoint={handleDeleteEndpoint}
          />
        ) : null}

        {activeSection === 'apiKeys' ? (
          <ApiKeysPage
            dashboard={visibleDashboard}
            apiKeyName={apiKeyName}
            busy={busy}
            showCreateKeyModal={showCreateKeyModal}
            onApiKeyNameChange={setApiKeyName}
            onModalChange={setShowCreateKeyModal}
            onCreate={handleCreateApiKey}
            onDelete={handleDeleteApiKey}
          />
        ) : null}

        {activeSection === 'routing' ? (
          <RoutingPage
            dashboard={visibleDashboard}
            intelligentEndpointName={intelligentEndpointName}
            busy={busy}
            onIntelligentEndpointNameChange={setIntelligentEndpointName}
            onCreateRoute={handleCreateRoute}
            onCopyRoute={handleCopyRoute}
            onDeleteRoute={handleDeleteRoute}
            onCreateSelfHosting={() => setActiveSection('selfHosting')}
            onSetupRouterEndpoint={handleSetupRouterEndpoint}
            onInstallLibrary={handleInstallLibrary}
            libraries={libraries}
            localDeployments={visibleLocalDeployments}
            localModelMetrics={localModelMetrics}
            initialEndpointId={routeInitialEndpointId}
            onInitialEndpointConsumed={() => setRouteInitialEndpointId(null)}
            initialRouteId={routeInitialViewId}
            onInitialRouteConsumed={() => setRouteInitialViewId(null)}
          />
        ) : null}

        {activeSection === 'bandwidth' ? <BandwidthPage dashboard={visibleDashboard} /> : null}

        {activeSection === 'settings' ? (
          <SettingsPage
            dashboard={visibleDashboard}
            session={session}
            settingsTab={settingsTab}
            onSettingsTabChange={setSettingsTab}
          />
        ) : null}

      </main>

      <EndpointUsageModal
        target={usageTarget}
        session={session}
        onClose={() => setUsageTarget(null)}
        onError={(text) => setMessage({ tone: 'error', text })}
      />

      {busy?.startsWith('load-') ? (
        <div className="sync-status-overlay" role="status" aria-live="polite">
          <div className="sync-status-card">
            <LoaderCircle className="spin" size={20} />
            <span>Syncing {busy.replace('load-', '')}</span>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}

function buildAttachedInferenceEndpointPayload(
  endpointId: string,
  routeName: string,
  inputModality: string,
  modelId: string,
  inferenceEndpoints: EndpointItem[],
  instances: InstanceItem[],
  localDeployments: LocalModelDeployment[],
  models: Record<string, unknown>[],
) {
  const endpoint = inferenceEndpoints.find((item) => {
    const record = item as Record<string, unknown>;
    return String(record.inference_endpoint_id ?? record.endpoint_id ?? record.id ?? '') === endpointId;
  });
  const instance = instances.find((item) => {
    const record = item as Record<string, unknown>;
    return String(record.inference_endpoint_id ?? record.endpoint_id ?? record.instance_id ?? record.unique_instance_id ?? record.id ?? '') === endpointId;
  });
  const localDeployment = localDeployments.find((item) => getLocalDeploymentSelectionId(item) === endpointId);
  const endpointRecord = (endpoint ?? instance ?? (localDeployment ? {
    name: localDeployment.name,
    model_id: localDeployment.modelId,
    endpoint_url: localDeployment.endpointUrl,
    model_description: localDeployment.modelDescription,
    model_context_length: localDeployment.modelContextLength,
    model_parameters: localDeployment.modelParameters,
    model_tags: localDeployment.modelTags,
    model_pipeline_tag: localDeployment.modelPipelineTag,
  } : {})) as Record<string, unknown>;
  const endpointModelId = String(endpointRecord.model_id ?? endpointRecord.modelId ?? localDeployment?.modelId ?? modelId ?? '');
  const model = findModelMetadata(models, endpointModelId || modelId);
  const modelRecord = (model ?? {}) as Record<string, unknown>;
  const outputModalities = Array.isArray(modelRecord.outputModalities)
    ? modelRecord.outputModalities
    : Array.isArray(modelRecord.output_modalities)
      ? modelRecord.output_modalities
      : [];

  return {
    endpoint_id: endpoint ? endpointId : localDeployment ? getLocalDeploymentSelectionId(localDeployment) : endpointId,
    endpoint_name: getAttachedInferenceEndpointName(endpointRecord, routeName || endpointId),
    endpoint_url: String(endpointRecord.endpoint_url ?? localDeployment?.endpointUrl ?? ''),
    deployment_target: endpointRecord.deployment_target ?? endpointRecord.deploymentTarget ?? (localDeployment ? 'local' : undefined),
    model_id: endpointModelId,
    model_description: getModelRoutingDescription(endpointRecord, modelRecord),
    model_context_length: getFirstStringValue(modelRecord.modelContextLength, modelRecord.model_context_length, endpointRecord.model_context_length, endpointRecord.modelContextLength),
    model_parameters: getFirstStringValue(modelRecord.modelParameters, modelRecord.model_parameters, endpointRecord.model_parameters, endpointRecord.modelParameters),
    model_tags: getStringArrayValue(modelRecord.displayTags, modelRecord.display_tags, modelRecord.tags, endpointRecord.model_tags, endpointRecord.tags),
    benchmark_info: typeof modelRecord.benchmarkInfo === 'object' && modelRecord.benchmarkInfo
      ? modelRecord.benchmarkInfo
      : typeof modelRecord.benchmark_info === 'object' && modelRecord.benchmark_info
        ? modelRecord.benchmark_info
        : undefined,
    input_modality: inputModality,
    output_modality: String(outputModalities[0] ?? 'text'),
  };
}

function findModelMetadata(models: Record<string, unknown>[], modelId: string): Record<string, unknown> | undefined {
  const normalizedModelId = normalizeModelLookupValue(modelId);
  if (!normalizedModelId) {
    return undefined;
  }

  return models.find((item) => {
    const record = item as Record<string, unknown>;
    return [
      record.modelId,
      record.model_id,
      record.id,
      record.modelName,
      record.model_name,
      record.displayName,
      record.display_name,
    ].some((value) => normalizeModelLookupValue(value) === normalizedModelId);
  }) as Record<string, unknown> | undefined;
}

function getModelRoutingDescription(endpointRecord: Record<string, unknown>, modelRecord: Record<string, unknown>): string {
  const description = getFirstStringValue(
    modelRecord.Description,
    modelRecord.description,
    modelRecord.model_description,
    modelRecord.modelDescription,
    endpointRecord.model_description,
    endpointRecord.modelDescription,
    endpointRecord.description,
  );
  const tags = getStringArrayValue(modelRecord.displayTags, modelRecord.display_tags, modelRecord.tags, endpointRecord.model_tags, endpointRecord.tags);
  const contextLength = getFirstStringValue(modelRecord.modelContextLength, modelRecord.model_context_length, endpointRecord.model_context_length, endpointRecord.modelContextLength);
  const parameters = getFirstStringValue(modelRecord.modelParameters, modelRecord.model_parameters, endpointRecord.model_parameters, endpointRecord.modelParameters);
  const modalities = [
    ...getStringArrayValue(modelRecord.inputModalities, modelRecord.input_modalities),
    ...getStringArrayValue(modelRecord.outputModalities, modelRecord.output_modalities),
  ];
  const hints = [
    description,
    tags.length ? `Tags: ${tags.join(', ')}` : '',
    parameters ? `Parameters: ${parameters}` : '',
    contextLength ? `Context length: ${contextLength}` : '',
    modalities.length ? `Modalities: ${Array.from(new Set(modalities)).join(', ')}` : '',
  ].filter(Boolean);

  return hints.join(' ');
}

function buildHfRoutingMetadata(model: HfModelInfo | null): {
  deploymentFields: Partial<LocalModelDeployment>;
  endpointFields: Partial<CreateInferenceFormState>;
} {
  if (!model) {
    return { deploymentFields: {}, endpointFields: {} };
  }

  const tags = getStringArrayValue(model.tags);
  const cardData = typeof model.cardData === 'object' && model.cardData ? model.cardData as Record<string, unknown> : {};
  const config = typeof model.config === 'object' && model.config ? model.config as Record<string, unknown> : {};
  const description = [
    getFirstStringValue(
      model.description,
      model.model_description,
      model.summary,
      cardData.description,
      cardData.summary,
    ),
    summarizeHfReadme(model.readme),
    model.pipeline_tag ? `Pipeline: ${model.pipeline_tag}` : '',
    tags.length ? `Tags: ${tags.slice(0, 16).join(', ')}` : '',
    typeof model.downloads === 'number' ? `Downloads: ${model.downloads}` : '',
    typeof model.likes === 'number' ? `Likes: ${model.likes}` : '',
    model.lastModified ? `Last modified: ${model.lastModified}` : '',
  ].filter(Boolean).join(' ');
  const contextLength = getFirstStringValue(
    model.model_context_length,
    model.context_length,
    model.max_position_embeddings,
    config.max_position_embeddings,
    config.max_sequence_length,
    config.seq_length,
  );
  const parameters = getFirstStringValue(
    model.model_parameters,
    model.parameters,
    model.parameter_count,
    cardData.parameters,
  );

  return {
    deploymentFields: {
      modelDescription: description,
      modelContextLength: contextLength,
      modelParameters: parameters,
      modelTags: tags,
      modelPipelineTag: model.pipeline_tag,
    },
    endpointFields: {
      model_description: description,
      model_context_length: contextLength,
      model_parameters: parameters,
      model_tags: tags,
      model_pipeline_tag: model.pipeline_tag,
    },
  };
}

function summarizeHfReadme(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/^---[\s\S]*?---/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .filter((line) => line && !line.startsWith('![') && !line.startsWith('|') && !line.includes('license:'))
    .slice(0, 8)
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 1200)
    .trim();
}

function getFirstStringValue(...values: unknown[]): string {
  const value = values.find((item) => typeof item === 'string' || typeof item === 'number');
  return value === undefined ? '' : String(value).trim();
}

function getStringArrayValue(...values: unknown[]): string[] {
  const value = values.find((item) => Array.isArray(item)) as unknown[] | undefined;
  return value ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function normalizeModelLookupValue(value: unknown): string {
  const rawValue = String(value ?? '').trim().toLowerCase();
  if (!rawValue) {
    return '';
  }

  if (rawValue.startsWith('http://') || rawValue.startsWith('https://')) {
    try {
      const url = new URL(rawValue);
      const parts = url.pathname.split('/').filter(Boolean);
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}`.toLowerCase() : rawValue;
    } catch {
      return rawValue;
    }
  }

  return rawValue;
}

function getAttachedInferenceEndpointName(endpoint: Record<string, unknown>, fallbackName: string): string {
  const explicitName = endpoint.endpoint_name ?? endpoint.name ?? endpoint.instance_name;
  if (explicitName) {
    return String(explicitName);
  }

  return fallbackName;
}

function getLocalDeploymentSelectionId(deployment: LocalModelDeployment): string {
  return `local:${deployment.endpointUrl}::${deployment.modelId}`;
}

function getInferenceEndpointIdFromRecord(endpoint: EndpointItem, index: number): string {
  return String(endpoint.inference_endpoint_id ?? endpoint.endpoint_id ?? endpoint.id ?? `endpoint-${index + 1}`);
}

function getEndpointIdFromPayload(payload: Record<string, unknown>): string | undefined {
  const candidates = [
    payload.intelligent_endpoint_id,
    payload.inference_endpoint_id,
    payload.endpoint_id,
    payload.id,
    typeof payload.intelligent_endpoint === 'object' && payload.intelligent_endpoint ? (payload.intelligent_endpoint as Record<string, unknown>).intelligent_endpoint_id : undefined,
    typeof payload.intelligent_endpoint === 'object' && payload.intelligent_endpoint ? (payload.intelligent_endpoint as Record<string, unknown>).endpoint_id : undefined,
    typeof payload.endpoint === 'object' && payload.endpoint ? (payload.endpoint as Record<string, unknown>).endpoint_id : undefined,
    typeof payload.endpoint === 'object' && payload.endpoint ? (payload.endpoint as Record<string, unknown>).intelligent_endpoint_id : undefined,
    typeof payload.endpoint === 'object' && payload.endpoint ? (payload.endpoint as Record<string, unknown>).inference_endpoint_id : undefined,
  ];
  const endpointId = candidates.find((value) => typeof value === 'string' && value.trim());
  return endpointId ? String(endpointId) : undefined;
}

function getLocalRouteChatUrl(route?: EndpointItem): string | null {
  if (!route) {
    return null;
  }

  const record = route as Record<string, unknown>;
  const routingConfig = getRouteRoutingConfig(route);
  const candidates = [
    routingConfig.local_route_endpoint_url,
    record.router_endpoint_url,
    record.local_route_endpoint_url,
  ];
  const localEndpointUrl = candidates.find((value) => typeof value === 'string' && isLocalEndpointUrl(value));
  if (!localEndpointUrl) {
    return null;
  }

  return toOpenAiChatCompletionsUrl(String(localEndpointUrl));
}

function getRouteRoutingConfig(route: EndpointItem): Record<string, unknown> {
  const record = route as Record<string, unknown>;
  const routingConfig = record.routing_config ?? record.route_config ?? record.config;
  if (typeof routingConfig === 'object' && routingConfig) {
    return routingConfig as Record<string, unknown>;
  }

  return {};
}

function getRouteAttachedCandidates(route: EndpointItem): Record<string, unknown>[] {
  const record = route as Record<string, unknown>;
  const attachedEndpoints = record.attached_endpoints ?? record.attachedEndpoints;
  if (!attachedEndpoints || typeof attachedEndpoints !== 'object') {
    return [];
  }

  const groups = attachedEndpoints as Record<string, unknown>;
  const values = [
    groups.inference_api,
    groups.inferenceApi,
    groups.dedicated,
    groups.local,
  ].filter(Boolean);

  return values.flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value): value is Record<string, unknown> => typeof value === 'object' && value !== null)
    .filter((candidate) => typeof (candidate.endpoint_url ?? candidate.endpointUrl) === 'string');
}

function toOpenAiChatCompletionsUrl(endpointUrl: string): string {
  const normalized = endpointUrl.trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(normalized)) {
    return normalized;
  }

  if (/\/v1$/i.test(normalized)) {
    return `${normalized}/chat/completions`;
  }

  return `${normalized}/v1/chat/completions`;
}

function isLocalEndpoint(endpoint: Record<string, unknown> | EndpointItem): boolean {
  const target = String(endpoint.deployment_target ?? endpoint.deploymentTarget ?? '').toLowerCase();
  if (target === 'cloud' || target === 'closed_source_api') {
    return false;
  }
  const endpointUrl = String(endpoint.endpoint_url ?? endpoint.endpointUrl ?? '').toLowerCase();
  return target === 'local'
    || endpointUrl.includes('localhost')
    || endpointUrl.includes('127.0.0.1')
    || endpointUrl.includes('0.0.0.0');
}

function isLocalEndpointUrl(value: unknown): boolean {
  if (!value) {
    return false;
  }

  const endpointUrl = String(value).toLowerCase();
  return endpointUrl.includes('localhost') || endpointUrl.includes('127.0.0.1') || endpointUrl.includes('0.0.0.0');
}

function getPreferredLocalRuntime(libraries: Record<ServingLibrary, boolean>): 'vllm' | 'ollama' | null {
  if (libraries.vllm) {
    return 'vllm';
  }

  if (libraries.ollama) {
    return 'ollama';
  }

  return null;
}

type SupportedPlatform = 'windows' | 'macos' | 'linux' | 'unknown';

function getSupportedPlatform(value: unknown): SupportedPlatform {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized.includes('win')) return 'windows';
  if (normalized.includes('darwin') || normalized.includes('mac')) return 'macos';
  if (normalized.includes('linux')) return 'linux';
  if (typeof navigator !== 'undefined') {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('windows')) return 'windows';
    if (userAgent.includes('mac')) return 'macos';
    if (userAgent.includes('linux')) return 'linux';
  }
  return 'unknown';
}

function getRouterRuntimeUnsupportedReason(runtime: ServingLibrary, platform: SupportedPlatform, routerModelId: string): string | null {
  const gguf = isOllamaCompatibleModelId(routerModelId);

  if (!['vllm', 'ollama', 'transformers'].includes(runtime)) {
    return `${formatLocalRuntime(runtime)} can be installed for local model work, but routing auto-hosting currently supports vLLM, Transformers, and Ollama. Select Transformers for Hugging Face router models or Ollama for GGUF router models.`;
  }

  if (runtime === 'ollama') {
    return gguf ? null : `${routerModelId} is not a GGUF/llama.cpp router model, so Ollama cannot host it. Select Transformers or vLLM.`;
  }

  if (runtime === 'transformers') {
    return gguf ? `${routerModelId} is a GGUF/llama.cpp router model. Select Ollama for this model format.` : null;
  }

  if (gguf) {
    return `${routerModelId} is a GGUF/llama.cpp router model. Select Ollama for this model format.`;
  }

  if (runtime === 'vllm' && platform === 'windows') {
    return `${routerModelId} is a Hugging Face Transformers router model. One-click router deployment with vLLM is not supported on this OS. Select Transformers for Windows.`;
  }

  return null;
}

function getRequiredRouterRuntime(routerModelId: string, platform: SupportedPlatform): 'vllm' | 'ollama' | 'transformers' {
  if (isOllamaCompatibleModelId(routerModelId)) {
    return 'ollama';
  }

  return platform === 'windows' ? 'transformers' : 'vllm';
}

function isLaunchableLocalRuntime(runtime: ServingLibrary): runtime is 'vllm' | 'ollama' | 'transformers' {
  return runtime === 'vllm' || runtime === 'ollama' || runtime === 'transformers';
}

function formatLocalRuntime(runtime: ServingLibrary): string {
  const labels: Record<ServingLibrary, string> = {
    vllm: 'vLLM',
    sglang: 'SGLang',
    tensorrt: 'TensorRT-LLM',
    ollama: 'Ollama',
    llama_cpp: 'llama.cpp',
    pytorch: 'PyTorch (via Transformers)',
    transformers: 'Transformers',
    dynamo: 'Dynamo',
  };
  return labels[runtime] ?? runtime;
}

function getLocalDeploymentHardwareBlockReason(
  runtime: ServingLibrary,
  validation: ValidationResult | null,
  machine: DashboardState['machineDetails']
): string | null {
  if (!validation || validation.status !== 'warning') {
    return null;
  }

  const acceleratorMemory = getAcceleratorMemorySummary(machine);
  const totalVramGb = acceleratorMemory.totalGb;
  const totalRamGb = machine?.memory?.totalGb ?? 0;
  const hasInsufficientVram = totalVramGb < validation.effectiveMinVramGb;

  if (!hasInsufficientVram) {
    return null;
  }

  if ((runtime === 'vllm' || runtime === 'sglang' || runtime === 'dynamo') && totalVramGb < validation.effectiveMinVramGb) {
    return `${formatLocalRuntime(runtime)} needs enough GPU ${acceleratorMemory.label} for this model. Required: ${validation.effectiveMinVramGb.toFixed(1)}GB, available: ${totalVramGb.toFixed(1)}GB.`;
  }

  if (runtime === 'transformers') {
    const cpuUnsafe = validation.modelWeightGb >= 8 || (totalRamGb > 0 && validation.modelWeightGb > totalRamGb * 0.45);
    if (cpuUnsafe) {
      return `This model is too large for reliable one-click CPU Transformers hosting on this machine. Required: about ${validation.effectiveMinVramGb.toFixed(1)}GB ${acceleratorMemory.label}, available: ${totalVramGb.toFixed(1)}GB, system RAM: ${totalRamGb.toFixed(1)}GB. Choose a smaller model, a quantized/GGUF model, or a machine with more accelerator memory.`;
    }
  }

  return null;
}

function getLocalRuntimeFromEndpointUrl(endpointUrl: string): ServingLibrary {
  try {
    return new URL(endpointUrl).port === '11434' ? 'ollama' : 'vllm';
  } catch {
    return endpointUrl.includes(':11434') ? 'ollama' : 'vllm';
  }
}

function normalizeServingLibrary(value: unknown, fallback: ServingLibrary = 'vllm'): ServingLibrary {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  const aliases: Record<string, ServingLibrary> = {
    vllm: 'vllm',
    sglang: 'sglang',
    tensorrt: 'tensorrt',
    tensorrt_llm: 'tensorrt',
    tensor_rt: 'tensorrt',
    tensor_rt_llm: 'tensorrt',
    ollama: 'ollama',
    llama_cpp: 'llama_cpp',
    llama_cpp_python: 'llama_cpp',
    llamacpp: 'llama_cpp',
    llama: 'llama_cpp',
    pytorch: 'pytorch',
    torch: 'pytorch',
    transformers: 'transformers',
    transformer: 'transformers',
    dynamo: 'dynamo',
  };

  return aliases[normalized] ?? fallback;
}

function isOllamaCompatibleModelId(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  return normalized.includes('gguf')
    || normalized.endsWith('.gguf')
    || normalized.startsWith('hf.co/')
    || !normalized.includes('/');
}

function isValidLocalDeployment(value: unknown): value is LocalModelDeployment {
  const record = value as Partial<LocalModelDeployment> | null;
  return Boolean(record)
    && typeof record?.endpointUrl === 'string'
    && record.endpointUrl.trim().length > 0
    && typeof record.modelId === 'string'
    && record.modelId.trim().length > 0
    && typeof record.name === 'string'
    && servingLibraries.includes(record.runtime as ServingLibrary)
    && typeof record.deployedAt === 'string';
}

function isSameLocalDeployment(left: Pick<LocalModelDeployment, 'endpointUrl' | 'modelId'>, right: Pick<LocalModelDeployment, 'endpointUrl' | 'modelId'>): boolean {
  return left.endpointUrl === right.endpointUrl && left.modelId === right.modelId;
}

function upsertLocalDeployment(current: LocalModelDeployment[], nextDeployment: LocalModelDeployment): LocalModelDeployment[] {
  return [
    nextDeployment,
    ...current.filter((item) => !isSameLocalDeployment(item, nextDeployment)),
  ];
}

function isSameLocalDeploymentByKey(left: Pick<LocalModelDeployment, 'endpointUrl' | 'modelId'>, right: Pick<LocalModelDeployment, 'endpointUrl' | 'modelId'>): boolean {
  return getLocalDeploymentIdentityKey(left) === getLocalDeploymentIdentityKey(right);
}

function getLocalDeploymentIdentityKey(deployment: Pick<LocalModelDeployment, 'endpointUrl' | 'modelId'>): string {
  return `${normalizeLocalEndpointUrl(deployment.endpointUrl)}::${normalizeLocalModelKey(deployment.modelId)}`;
}

function isDeletedLocalDeployment(deployment: Pick<LocalModelDeployment, 'endpointId' | 'endpointUrl' | 'modelId'>, deletedKeys: Set<string>): boolean {
  return getLocalEndpointDeletionKeys(deployment).some((key) => deletedKeys.has(key));
}

function isDeletedLocalInferenceEndpoint(endpoint: EndpointItem, deletedKeys: Set<string>, index: number): boolean {
  if (!isLocalInferenceEndpoint(endpoint)) {
    return false;
  }

  const endpointId = getInferenceEndpointIdFromRecord(endpoint, index);
  const modelId = String(endpoint.model_id ?? endpoint.name ?? '');
  const endpointUrl = String(endpoint.endpoint_url ?? '');
  return getLocalEndpointDeletionKeys({ endpointId, endpointUrl, modelId }).some((key) => deletedKeys.has(key));
}

function isLocalInferenceEndpoint(endpoint: EndpointItem): boolean {
  const target = String(endpoint.deployment_target ?? '').toLowerCase();
  if (target === 'cloud' || target === 'closed_source_api') {
    return false;
  }
  const endpointUrl = String(endpoint.endpoint_url ?? '').toLowerCase();
  return target === 'local'
    || endpointUrl.includes('localhost')
    || endpointUrl.includes('127.0.0.1')
    || endpointUrl.includes('0.0.0.0');
}

function getLocalEndpointDeletionKeys(deployment: { endpointId?: string; endpointUrl?: string; modelId?: string }): string[] {
  return uniqueStrings([
    deployment.endpointId ? `id:${deployment.endpointId.trim()}` : '',
    deployment.endpointUrl && deployment.modelId
      ? `local:${normalizeLocalEndpointUrl(deployment.endpointUrl)}::${normalizeLocalModelKey(deployment.modelId)}`
      : '',
  ]);
}

function normalizeLocalModelKey(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim())));
}

function normalizeLocalEndpointUrl(endpointUrl: string): string {
  return endpointUrl.trim().replace('://localhost', '://127.0.0.1').replace('://0.0.0.0', '://127.0.0.1').replace(/\/+$/, '');
}

function getPortFromLocalEndpointUrl(endpointUrl: string): number | undefined {
  try {
    const parsedUrl = new URL(normalizeLocalEndpointUrl(endpointUrl));
    const port = Number(parsedUrl.port);
    return Number.isInteger(port) && port > 0 ? port : undefined;
  } catch {
    return undefined;
  }
}

function resolveCloudModelId(input: string, models: any[]): string {
  const rawInput = input.trim();
  if (!rawInput) {
    return '';
  }

  const hfRepoId = normalizeHfRepoId(rawInput);
  if (hfRepoId) {
    return hfRepoId;
  }

  const matchingModel = models.find((model: any) => {
    const modelName = String(model.model_name ?? model.modelName ?? model.displayName ?? '').trim();
    const modelId = String(model.model_id ?? model.modelId ?? model.id ?? '').trim();
    return modelName === rawInput || modelId === rawInput;
  });

  return String(matchingModel?.model_id ?? matchingModel?.modelId ?? matchingModel?.id ?? rawInput).trim();
}

function getWelcomeName(session: DesktopSession, profile: Record<string, unknown> | null): string {
  const rawProfile = (profile?.developer || profile || {}) as Record<string, unknown>;
  const profileName = [
    rawProfile.first_name,
    rawProfile.firstName,
    rawProfile.name,
    rawProfile.full_name,
    rawProfile.fullName,
  ].find((value) => typeof value === 'string' && value.trim().length > 0);
  const emailName = session.email?.split('@')[0]?.trim();
  const candidateName = String(profileName || emailName || '').trim();
  const firstName = candidateName.split(/[\s._-]+/).find(Boolean);
  return firstName || 'back';
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'good morning';
  if (hour < 17) return 'good afternoon';
  return 'good evening';
}

export default App;
