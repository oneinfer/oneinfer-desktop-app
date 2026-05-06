import { useEffect, useState, type FormEvent } from 'react';
import { LoaderCircle } from 'lucide-react';

import {
  attachEndpoint,
  createApiKey,
  createInferenceEndpoint,
  createInstance,
  createIntelligentEndpoint,
  deleteApiKey,
  deleteInstance,
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
import { Banner, Modal } from './components/Common';
import { HfModelDetailPanel } from './components/HfModelDetailPanel';
import {
  createLoadedSections,
  defaultClaudeCodeProvider,
  defaultDashboardState,
  defaultInferenceForm,
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
import { RoutingPage } from './pages/RoutingPage';
import { SelfHostingPage, type SelfHostFormState } from './pages/SelfHostingPage';
import { SettingsPage, type SettingsTab } from './pages/SettingsPage';
import type {
  CreateInferenceFormState,
  CreateInstanceFormState,
  DashboardState,
  DesktopSession,
  HfModelInfo,
  SectionKey,
} from './types';

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
    useHfUrl: false,
    hfUrl: '',
  });
  const [instanceForm, setInstanceForm] = useState<CreateInstanceFormState>(defaultInstanceForm);
  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeyEnvironment] = useState('production');
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
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('account');
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [showCreateInstanceModal, setShowCreateInstanceModal] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [hfModelMetadata, setHfModelMetadata] = useState<HfModelInfo | null>(null);
  const [libraries, setLibraries] = useState<{ vllm: boolean; ollama: boolean }>({ vllm: false, ollama: false });
  const [isHfModelModalOpen, setIsHfModelModalOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function runValidation() {
      if (!session) return;

      const targetModelId = selfHostForm.useHfUrl ? selfHostForm.hfUrl : selfHostForm.model_id;
      if (!targetModelId) {
        setValidationResult(null);
        setHfModelMetadata(null);
        return;
      }

      let requirements = { minVramGb: 0, modelSizeGb: 0 };

      if (selfHostForm.useHfUrl) {
        try {
          let repoId = targetModelId.trim();
          if (repoId.startsWith('http://') || repoId.startsWith('https://')) {
            const url = new URL(repoId);
            const parts = url.pathname.split('/').filter(Boolean);
            if (parts.length >= 2) {
              repoId = `${parts[0]}/${parts[1]}`;
            } else {
              throw new Error('Invalid HF URL');
            }
          }

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
          }
        } catch {
          if (active) {
            setValidationResult(null);
            setHfModelMetadata(null);
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
        }
      }

      if (active && (requirements.minVramGb > 0 || requirements.modelSizeGb > 0)) {
        setValidationResult(validateHardwareSupport(requirements, dashboard.machineDetails));
      }
    }

    runValidation();
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
        ]);

        setDashboard((current) => ({
          ...current,
          profile: results[0].status === 'fulfilled' ? results[0].value : current.profile,
          credits: results[1].status === 'fulfilled' ? results[1].value : current.credits,
          inferenceEndpoints: results[2].status === 'fulfilled' ? results[2].value : current.inferenceEndpoints,
          instances: results[3].status === 'fulfilled' ? results[3].value : current.instances,
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
        ]);

        setDashboard((current) => ({
          ...current,
          intelligentEndpoints: results[0].status === 'fulfilled' ? results[0].value : current.intelligentEndpoints,
          inferenceEndpoints: results[1].status === 'fulfilled' ? results[1].value : current.inferenceEndpoints,
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
      throw error;
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
            busy={busy}
            onFormChange={setSelfHostForm}
            onSubmit={handleRegisterSelfHosted}
            onOpenModelModal={() => setIsHfModelModalOpen(true)}
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

        <Modal title="Model Analysis & Hardware Check" isOpen={isHfModelModalOpen && !!hfModelMetadata} onClose={() => setIsHfModelModalOpen(false)}>
          <div style={{ margin: '-24px' }}>
            <HfModelDetailPanel
              model={hfModelMetadata}
              validation={validationResult}
              machine={dashboard.machineDetails}
              libraries={libraries}
              busy={busy}
              message={message}
              onInstall={handleInstallLibrary}
              onRegister={() => handleRegisterSelfHosted()}
            />
          </div>
        </Modal>

        {activeSection === 'routing' ? (
          <RoutingPage
            dashboard={dashboard}
            intelligentEndpointName={intelligentEndpointName}
            inferenceForm={inferenceForm}
            attachForm={attachForm}
            busy={busy}
            onIntelligentEndpointNameChange={setIntelligentEndpointName}
            onInferenceFormChange={setInferenceForm}
            onAttachFormChange={setAttachForm}
            onCreateIntelligentEndpoint={handleCreateIntelligentEndpoint}
            onCreateInferenceEndpoint={handleCreateInferenceEndpoint}
            onAttachEndpoint={handleAttachEndpoint}
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

export default App;
