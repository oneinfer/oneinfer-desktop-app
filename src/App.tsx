import { useEffect, useState, type FormEvent } from 'react';
import { LoaderCircle } from 'lucide-react';

import {
  createApiKey,
  createInferenceEndpoint,
  createInstance,
  createIntelligentEndpoint,
  deleteApiKey,
  deleteInstance,
  deleteInferenceEndpoint,
  deleteIntelligentEndpoint,
  getActiveDeveloperPlan,
  getCredits,
  getDeveloperPlans,
  getGpuSpecs,
  getHfModelInfo,
  getInstances,
  getProfile,
  getProviderInfo,
  listApiKeys,
  listInferenceEndpoints,
  listIntelligentEndpoints,
  listModels,
  loginWithOtp,
  requestOtp,
  runInstanceAction,
} from './api';
import { AppLayout } from './components/AppLayout';
import { Banner } from './components/Common';
import { HfModelDetailPanel } from './components/HfModelDetailPanel';
import {
  createLoadedSections,
  defaultClaudeCodeProvider,
  defaultDashboardState,
  defaultInstanceForm,
  defaultSettings,
} from './constants';
import { validateHardwareSupport, type ValidationResult } from './helpers/hardwareValidation';
import { syncLocalMachineProfile } from './helpers/machineDetails';
import { ApiKeysPage } from './pages/ApiKeysPage';
import { AuthPage } from './pages/AuthPage';
import { BandwidthPage } from './pages/BandwidthPage';
import { InstancesPage } from './pages/InstancesPage';
import { OverviewPage } from './pages/OverviewPage';
import { RoutingPage, type CreateRoutePayload } from './pages/RoutingPage';
import { SelfHostingPage, type SelfHostFormState } from './pages/SelfHostingPage';
import { SettingsPage, type SettingsTab } from './pages/SettingsPage';
import type {
  CreateInstanceFormState,
  DashboardState,
  DesktopSession,
  EndpointItem,
  HfModelInfo,
  InstanceItem,
  LocalModelDeployment,
  LocalModelMetrics,
  SectionKey,
} from './types';

function normalizeHfRepoId(value: string): string {
  const rawValue = value.trim();
  if (!rawValue) {
    return '';
  }

  if (rawValue.startsWith('http://') || rawValue.startsWith('https://')) {
    const url = new URL(rawValue);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : '';
  }

  return rawValue.includes('/') ? rawValue : '';
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
  const [, setUpdateStatus] = useState<DesktopUpdateStatus>({
    phase: 'idle',
    message: 'Updates are idle.',
    version: null,
    progressPercent: null,
  });
  const [loadedSections, setLoadedSections] = useState<Record<SectionKey, boolean>>(createLoadedSections);
  const [email, setEmail] = useState('');
  const [loginStep, setLoginStep] = useState<'email' | 'otp'>('email');
  const [otp, setOtp] = useState('');
  const [selfHostForm, setSelfHostForm] = useState<SelfHostFormState>({
    name: '',
    model_id: '',
    endpoint_url: 'http://localhost:8000/v1',
    useHfUrl: true,
    hfUrl: '',
  });
  const [instanceForm, setInstanceForm] = useState<CreateInstanceFormState>(defaultInstanceForm);
  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeyEnvironment] = useState('production');
  const [intelligentEndpointName, setIntelligentEndpointName] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [claudeCodeProvider, setClaudeCodeProvider] = useState<'oneinfer' | 'anthropic'>(defaultClaudeCodeProvider);
  const [overviewTab, setOverviewTab] = useState<'claude-code' | 'opencode' | 'openclaw'>('claude-code');
  const [infraTab, setInfraTab] = useState<'self-hosted' | 'cloud'>('self-hosted');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('account');
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [showCreateInstanceModal, setShowCreateInstanceModal] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [hfModelMetadata, setHfModelMetadata] = useState<HfModelInfo | null>(null);
  const [hfModelMetadataLoading, setHfModelMetadataLoading] = useState(false);
  const [hfModelMetadataError, setHfModelMetadataError] = useState<string | null>(null);
  const [libraries, setLibraries] = useState<{ vllm: boolean; ollama: boolean }>({ vllm: false, ollama: false });
  const [deploymentProgress, setDeploymentProgress] = useState<DesktopDeploymentProgress[]>([]);
  const [localDeployments, setLocalDeployments] = useState<LocalModelDeployment[]>([]);
  const [localModelMetrics, setLocalModelMetrics] = useState<Record<string, LocalModelMetrics>>({});
  const [routeInitialEndpointId, setRouteInitialEndpointId] = useState<string | null>(null);

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

      let requirements = { minVramGb: 0, modelSizeGb: 0 };
      setHfModelMetadataLoading(true);
      setHfModelMetadataError(null);

      if (selfHostForm.useHfUrl) {
        try {
          const repoId = normalizeHfRepoId(targetModelId);

          if (repoId && repoId.includes('/')) {
            const info = await getHfModelInfo(repoId) as HfModelInfo;
            if (active) {
              setHfModelMetadata(info);
            }

            const totalSizeFromSiblings = (info.siblings as any[])?.reduce((acc, file) => acc + (file.size || 0), 0) ?? 0;
            const totalSizeFromSafetensors = (info as any).safetensors?.total || 0;
            const totalSize = totalSizeFromSiblings || totalSizeFromSafetensors;
            const sizeGb = totalSize > 0 ? totalSize / (1024 ** 3) : 0;

            requirements = {
              minVramGb: sizeGb > 0 ? Math.ceil(sizeGb * 1.15) + 2 : 4,
              modelSizeGb: sizeGb > 0 ? Math.ceil(sizeGb) : 2,
            };
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

          requirements = {
            minVramGb: Number(catalogModel.modelMinVram || catalogModel.model_min_vram || 0),
            modelSizeGb: Number(catalogModel.modelSizeGb || catalogModel.model_size_gb || 0),
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
  }, [selfHostForm.model_id, selfHostForm.hfUrl, selfHostForm.useHfUrl, dashboard.machineDetails, dashboard.models, session]);

  useEffect(() => {
    async function checkLibs() {
      if (!window.desktopBridge?.checkLibrary) return;
      try {
        const vllm = await window.desktopBridge.checkLibrary('vllm');
        const ollama = await window.desktopBridge.checkLibrary('ollama');
        setLibraries({ vllm, ollama });
      } catch (error) {
        console.error('[libraries] check failed', error);
      }
    }

    if (session) {
      checkLibs();
    }
  }, [activeSection, session]);

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
          listInferenceEndpoints(currentBaseUrl, currentSession),
          getInstances(currentBaseUrl, currentSession),
          getDeveloperPlans(currentBaseUrl),
          getActiveDeveloperPlan(currentBaseUrl, currentSession),
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
        }));

        announcePartialFailures('Overview', results, shouldBeSilent);
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

        announcePartialFailures('Instances', results, shouldBeSilent);
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

        announcePartialFailures('Routing', results, shouldBeSilent);
      }

      if (section === 'selfHosting') {
        const models = await listModels(currentBaseUrl);
        setDashboard((current) => ({ ...current, models }));
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

        announcePartialFailures('Bandwidth', results, shouldBeSilent);
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

  function announcePartialFailures(label: string, results: PromiseSettledResult<unknown>[], silent: boolean) {
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed > 0) {
      setMessage({ tone: 'error', text: `${label} loaded with ${failed} partial failure${failed > 1 ? 's' : ''}.` });
    } else if (!silent) {
      setMessage({ tone: 'success', text: `${label} synced.` });
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
      await createInferenceEndpoint(settingsDraft.apiBaseUrl, session, {
        name: selfHostForm.name,
        provider: 'openai',
        model_id: modelId,
        deployment_target: 'local',
        endpoint_url: selfHostForm.endpoint_url.trim(),
        machine_id: detectedMachineId,
        machine_name: detectedMachineName,
        top_p: 0.9,
        temperature: 0.7,
        max_tokens: 4096,
      });
      setLocalDeployments((current) => {
        const nextDeployment: LocalModelDeployment = {
          endpointUrl: selfHostForm.endpoint_url.trim(),
          modelId,
          name: selfHostForm.name.trim() || modelId,
          pid: null,
          runtime: 'vllm',
          deployedAt: new Date().toISOString(),
        };

        return [
          nextDeployment,
          ...current.filter((item) => item.endpointUrl !== nextDeployment.endpointUrl && item.modelId !== nextDeployment.modelId),
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

    const localRuntime = getPreferredLocalRuntime(libraries);
    if (!localRuntime) {
      setMessage({ tone: 'error', text: 'Install Ollama on Mac or vLLM on Linux GPU before deploying a Hugging Face model locally.' });
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
      });

      setSelfHostForm((current) => ({
        ...current,
        endpoint_url: deployment.endpointUrl,
      }));
      setLocalDeployments((current) => {
        const nextDeployment: LocalModelDeployment = {
          endpointUrl: deployment.endpointUrl,
          modelId: deployment.modelId,
          name: selfHostForm.name.trim() || repoId,
          pid: deployment.pid,
          runtime: deployment.runtime,
          deployedAt: new Date().toISOString(),
        };

        return [
          nextDeployment,
          ...current.filter((item) => item.endpointUrl !== deployment.endpointUrl && item.modelId !== deployment.modelId),
        ];
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

      await createInferenceEndpoint(settingsDraft.apiBaseUrl, session, {
        name: selfHostForm.name.trim() || repoId,
        provider: 'openai',
        model_id: deployment.modelId,
        deployment_target: 'local',
        endpoint_url: deployment.endpointUrl,
        machine_id: detectedMachineId,
        machine_name: detectedMachineName,
        top_p: 0.9,
        temperature: 0.7,
        max_tokens: 4096,
      });

      const registeredProgress: DesktopDeploymentProgress = {
        id: progressId,
        stage: 'registered',
        message: 'Local endpoint registered successfully.',
        detail: deployment.endpointUrl,
        level: 'success',
        timestamp: Date.now(),
      };
      setDeploymentProgress((current) => [...current, registeredProgress].slice(-80));
      setMessage({ tone: 'success', text: `Deployed ${deployment.modelId} locally and registered ${deployment.endpointUrl}.` });
      await loadSectionData('routing', session, settingsDraft.apiBaseUrl, { force: true });
      return true;
    } catch (error) {
      const rawErrorMessage = error instanceof Error ? error.message : 'Failed to deploy Hugging Face model locally.';
      const errorMessage = rawErrorMessage.includes('Unsupported local deployment runtime: ollama')
        ? 'Ollama deploy support is not loaded in the Electron main process yet. Fully quit OneInfer Desktop, restart with npm run dev, then deploy again.'
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
      return false;
    }

    setBusy('create-instance');
    try {
      await createInstance(settingsDraft.apiBaseUrl, session, instanceForm);
      setMessage({ tone: 'success', text: 'Instance creation request submitted.' });
      await loadSectionData('instances', session, settingsDraft.apiBaseUrl, { force: true });
      return true;
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to create instance.' });
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
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Delete instance failed.';
      if (msg.toLowerCase().includes('no instance mapping found')) {
        setMessage({ tone: 'success', text: `Deleted ${instanceId}.` });
      } else {
        setMessage({ tone: 'error', text: msg });
      }
    } finally {
      await loadSectionData('instances', session, settingsDraft.apiBaseUrl, { force: true, silent: true }).catch(() => {});
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
      setMessage({ tone: 'success', text: 'API key created successfully' });
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
      setMessage({ tone: 'success', text: 'API Key removed successfully' });
      await loadSectionData('apiKeys', session, settingsDraft.apiBaseUrl, { force: true });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'API key deletion failed.' });
    } finally {
      setBusy(null);
    }
  }

  async function ensureLocalRouterDeployment(routingAlgorithm: string): Promise<{ endpointId?: string; endpointUrl: string; modelId: string }> {
    if (!session) {
      throw new Error('Sign in before deploying a local router model.');
    }

    const routerModelId = normalizeHfRepoId(routingAlgorithm);
    if (!routerModelId) {
      throw new Error('Select a valid Hugging Face router model before deploying locally.');
    }

    const existingRouterEndpoint = dashboard.inferenceEndpoints.find((endpoint, index) => {
      const record = endpoint as Record<string, unknown>;
      const endpointModelId = String(record.model_id ?? record.modelId ?? '');
      const endpointRole = String(record.endpoint_role ?? record.role ?? '').toLowerCase();
      const endpointUrl = String(record.endpoint_url ?? '').toLowerCase();
      const deploymentTarget = String(record.deployment_target ?? '').toLowerCase();
      return endpointModelId === routerModelId
        && (deploymentTarget === 'local' || endpointUrl.includes('localhost') || endpointUrl.includes('127.0.0.1'))
        && (!endpointRole || endpointRole === 'router' || String(record.name ?? '').toLowerCase().includes('router'))
        && Boolean(getInferenceEndpointIdFromRecord(endpoint, index));
    });

    if (existingRouterEndpoint) {
      const endpointRecord = existingRouterEndpoint as Record<string, unknown>;
      return {
        endpointId: getInferenceEndpointIdFromRecord(existingRouterEndpoint, dashboard.inferenceEndpoints.indexOf(existingRouterEndpoint)),
        endpointUrl: String(endpointRecord.endpoint_url ?? ''),
        modelId: routerModelId,
      };
    }

    if (!window.desktopBridge?.deployHfModel) {
      throw new Error('Local router deployment is not available in this app build.');
    }

    if (!libraries.vllm) {
      throw new Error('vLLM must be installed before deploying a router model locally.');
    }

    setMessage({ tone: 'info', text: `Deploying local router model ${routerModelId}...` });
    const deployment = await window.desktopBridge.deployHfModel({
      repoId: routerModelId,
      runtime: 'vllm',
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
    });

    setLocalDeployments((current) => {
      const nextDeployment: LocalModelDeployment = {
        endpointUrl: deployment.endpointUrl,
        modelId: deployment.modelId,
        name: `${routerModelId} router`,
        pid: deployment.pid,
        runtime: deployment.runtime,
        deployedAt: new Date().toISOString(),
      };

      return [
        nextDeployment,
        ...current.filter((item) => item.endpointUrl !== nextDeployment.endpointUrl && item.modelId !== nextDeployment.modelId),
      ];
    });

    await loadSectionData('routing', session, settingsDraft.apiBaseUrl, { force: true, silent: true }).catch(() => undefined);

    return {
      endpointId: getEndpointIdFromPayload(registeredEndpoint),
      endpointUrl: deployment.endpointUrl,
      modelId: deployment.modelId,
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
      const routerDeployment = await ensureLocalRouterDeployment(payload.routingAlgorithm);

      await createIntelligentEndpoint(settingsDraft.apiBaseUrl, session, {
        name: routeName,
        routing_config: {
          routing_algorithm: payload.routingAlgorithm,
          router_runtime: 'local',
          ...(routerDeployment?.endpointId ? { router_endpoint_id: routerDeployment.endpointId } : {}),
          ...(routerDeployment?.endpointUrl ? { router_endpoint_url: routerDeployment.endpointUrl } : {}),
          input_modality: payload.inputModality,
          candidate_models: payload.modelId ? [payload.modelId] : [],
          description: payload.description.trim() || undefined,
        },
        ...(payload.attachedEndpointIds.length > 0
          ? {
              attached_endpoints: {
                inference_api: payload.attachedEndpointIds.map((endpointId) => (
                  buildAttachedInferenceEndpointPayload(
                    endpointId,
                    routeName,
                    payload.inputModality,
                    payload.modelId,
                    dashboard.inferenceEndpoints,
                    dashboard.instances,
                    dashboard.models,
                  )
                )),
              },
            }
          : {}),
      });

      setMessage({
        tone: 'success',
        text: payload.attachedEndpointIds.length > 0 ? 'Route created with route config and inference endpoints attached.' : 'Route created with route config.',
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
      await deleteIntelligentEndpoint(settingsDraft.apiBaseUrl, session, routeId);
      setMessage({ tone: 'success', text: 'Route deleted.' });
      await loadSectionData('routing', session, settingsDraft.apiBaseUrl, { force: true });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to delete route.' });
    } finally {
      setBusy(null);
    }
  }

  function handleCopyRoute(routeId: string) {
    if (!session) {
      return;
    }

    const normalizedBaseUrl = settingsDraft.apiBaseUrl.replace(/\/+$/, '');
    const routeUrl = `${normalizedBaseUrl}/developer/${session.developerId}/intelligent-endpoints/${routeId}/chat/completions`;
    navigator.clipboard?.writeText(routeUrl);
    setMessage({ tone: 'success', text: 'Route URL copied.' });
  }

  async function handleUseEndpointInRoute(endpointId: string, endpointName: string) {
    setRouteInitialEndpointId(endpointId);
    setIntelligentEndpointName((current) => current || `${endpointName} route`);
    setActiveSection('routing');
    if (session) {
      await loadSectionData('routing', session, settingsDraft.apiBaseUrl, { force: true, silent: true }).catch(() => undefined);
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
        await deleteInferenceEndpoint(settingsDraft.apiBaseUrl, session, deployment.endpointId);
      }

      if (window.desktopBridge?.deleteLocalModel) {
        await window.desktopBridge.deleteLocalModel({
          endpointUrl: deployment.endpointUrl,
          modelId: deployment.modelId,
          runtime: deployment.runtime,
        });
      }

      setLocalDeployments((current) => current.filter((item) => item.endpointUrl !== deployment.endpointUrl && item.modelId !== deployment.modelId));
      setLocalModelMetrics((current) => {
        const next = { ...current };
        delete next[deployment.endpointUrl];
        return next;
      });
      setMessage({ tone: 'success', text: 'Local model deleted.' });
      await loadSectionData('selfHosting', session, settingsDraft.apiBaseUrl, { force: true, silent: true });
      await loadSectionData('routing', session, settingsDraft.apiBaseUrl, { force: true, silent: true });
    } catch (error) {
      const rawErrorMessage = error instanceof Error ? error.message : 'Failed to delete local model.';
      const errorMessage = rawErrorMessage.includes("No handler registered for 'app:delete-local-model'")
        ? 'Local model deletion is not loaded in the Electron main process yet. Fully quit OneInfer Desktop, restart with npm run dev, then delete again.'
        : rawErrorMessage;
      setMessage({ tone: 'error', text: errorMessage });
    } finally {
      setBusy(null);
    }
  }

  async function handleInstallLibrary(name: 'vllm' | 'ollama') {
    if (!window.desktopBridge?.installLibrary || !window.desktopBridge?.checkLibrary) return;
    setBusy(`install-${name}`);
    try {
      await window.desktopBridge.installLibrary(name);
      setMessage({ tone: 'success', text: `${name} installed successfully.` });
      const status = await window.desktopBridge.checkLibrary(name);
      setLibraries((current) => ({ ...current, [name]: status }));
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : `Failed to install ${name}.` });
      throw error;
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
      <AuthPage
        email={email}
        otp={otp}
        loginStep={loginStep}
        busy={busy}
        message={message}
        onEmailChange={setEmail}
        onOtpChange={setOtp}
        onOtpRequest={handleOtpRequest}
        onLogin={handleLogin}
        onBackToEmail={() => setLoginStep('email')}
      />
    );
  }

  return (
    <AppLayout
      appVersion={appVersion}
      activeSection={activeSection}
      dashboard={dashboard}
      sidebarOpen={sidebarOpen}
      onSidebarOpen={setSidebarOpen}
      onSectionChange={setActiveSection}
      onRefresh={handleRefreshCurrentSection}
      onLogout={handleLogout}
    >
      {message ? (
        <div style={{ padding: '20px 20px 0 20px' }}>
          <Banner tone={message.tone} text={message.text} />
        </div>
      ) : null}

      <main className="main-stage" style={{ padding: '20px' }}>
        {activeSection === 'overview' ? (
          <OverviewPage
            dashboard={dashboard}
            busy={busy}
            infraTab={infraTab}
            overviewTab={overviewTab}
            claudeCodeProvider={claudeCodeProvider}
            localDeployments={localDeployments}
            localModelMetrics={localModelMetrics}
            onInfraTabChange={setInfraTab}
            onOverviewTabChange={setOverviewTab}
            onClaudeProviderChange={handleClaudeCodeProviderChange}
            onEnableOpenCode={handleEnableOpenCode}
            onEnableOpenClaw={handleEnableOpenClaw}
            onSectionChange={setActiveSection}
          />
        ) : null}

        {activeSection === 'selfHosting' ? (
          <SelfHostingPage
            dashboard={dashboard}
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
                machine={dashboard.machineDetails}
                libraries={libraries}
                busy={busy}
                message={message}
                deploymentProgress={deploymentProgress}
                onInstall={handleInstallLibrary}
                onRegister={handleDeploySelfHostedModel}
                onCancelDeploy={handleCancelSelfHostedDeployment}
              />
            )}
            localDeployments={localDeployments}
            localModelMetrics={localModelMetrics}
            onFormChange={setSelfHostForm}
            onSubmit={handleRegisterSelfHosted}
            onUseInRoute={handleUseEndpointInRoute}
            onDeleteLocalDeployment={handleDeleteLocalDeployment}
          />
        ) : null}

        {activeSection === 'instances' ? (
          <InstancesPage
            dashboard={dashboard}
            instanceForm={instanceForm}
            busy={busy}
            showCreateInstanceModal={showCreateInstanceModal}
            onFormChange={setInstanceForm}
            onModalChange={setShowCreateInstanceModal}
            onCreate={handleCreateInstance}
            onAction={handleInstanceAction}
            onDelete={handleDeleteInstance}
            onUseEndpointInRoute={handleUseEndpointInRoute}
          />
        ) : null}

        {activeSection === 'apiKeys' ? (
          <ApiKeysPage
            dashboard={dashboard}
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
            dashboard={dashboard}
            intelligentEndpointName={intelligentEndpointName}
            busy={busy}
            onIntelligentEndpointNameChange={setIntelligentEndpointName}
            onCreateRoute={handleCreateRoute}
            onCopyRoute={handleCopyRoute}
            onDeleteRoute={handleDeleteRoute}
            onCreateSelfHosting={() => setActiveSection('selfHosting')}
            initialEndpointId={routeInitialEndpointId}
            onInitialEndpointConsumed={() => setRouteInitialEndpointId(null)}
          />
        ) : null}

        {activeSection === 'bandwidth' ? <BandwidthPage dashboard={dashboard} /> : null}

        {activeSection === 'settings' ? (
          <SettingsPage
            dashboard={dashboard}
            session={session}
            settingsTab={settingsTab}
            onSettingsTabChange={setSettingsTab}
          />
        ) : null}

        {busy?.startsWith('load-') ? (
          <div className="floating-status">
            <LoaderCircle className="spin" size={16} />
            Syncing {busy.replace('load-', '')}
          </div>
        ) : null}
      </main>
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
  const model = models.find((item) => {
    const record = item as Record<string, unknown>;
    return String(record.modelId ?? record.model_id ?? record.id ?? '') === modelId;
  });
  const endpointRecord = (endpoint ?? instance ?? {}) as Record<string, unknown>;
  const modelRecord = (model ?? {}) as Record<string, unknown>;
  const outputModalities = Array.isArray(modelRecord.outputModalities)
    ? modelRecord.outputModalities
    : Array.isArray(modelRecord.output_modalities)
      ? modelRecord.output_modalities
      : [];

  return {
    endpoint_id: endpointId,
    endpoint_name: getAttachedInferenceEndpointName(endpointRecord, routeName || endpointId),
    input_modality: inputModality,
    output_modality: String(outputModalities[0] ?? 'text'),
  };
}

function getAttachedInferenceEndpointName(endpoint: Record<string, unknown>, fallbackName: string): string {
  const explicitName = endpoint.endpoint_name ?? endpoint.name ?? endpoint.instance_name;
  if (explicitName) {
    return String(explicitName);
  }

  return fallbackName;
}

function getInferenceEndpointIdFromRecord(endpoint: EndpointItem, index: number): string {
  return String(endpoint.inference_endpoint_id ?? endpoint.endpoint_id ?? endpoint.id ?? `endpoint-${index + 1}`);
}

function getEndpointIdFromPayload(payload: Record<string, unknown>): string | undefined {
  const candidates = [
    payload.inference_endpoint_id,
    payload.endpoint_id,
    payload.id,
    typeof payload.endpoint === 'object' && payload.endpoint ? (payload.endpoint as Record<string, unknown>).endpoint_id : undefined,
    typeof payload.endpoint === 'object' && payload.endpoint ? (payload.endpoint as Record<string, unknown>).inference_endpoint_id : undefined,
  ];
  const endpointId = candidates.find((value) => typeof value === 'string' && value.trim());
  return endpointId ? String(endpointId) : undefined;
}

function getPreferredLocalRuntime(libraries: { vllm: boolean; ollama: boolean }): 'vllm' | 'ollama' | null {
  if (libraries.vllm) {
    return 'vllm';
  }

  if (libraries.ollama) {
    return 'ollama';
  }

  return null;
}

function formatLocalRuntime(runtime: 'vllm' | 'ollama'): string {
  return runtime === 'vllm' ? 'vLLM' : 'Ollama';
}

export default App;
