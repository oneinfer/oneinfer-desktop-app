import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Copy, Download, LoaderCircle, Orbit, PlayCircle, Power, Rocket, Search, Server, Settings2, Trash2, XCircle } from 'lucide-react';

import { DataList, MiniTable, Panel } from '../components/Common';
import type { EndpointUsageTarget } from '../components/EndpointUsageModal';
import type { ValidationResult } from '../helpers/hardwareValidation';
import { getServingLibraryCompatibility } from '../helpers/servingCompatibility';
import type { DashboardState, EndpointItem, HfModelInfo, LocalModelDeployment, LocalModelMetrics, ServingLibrary } from '../types';
import { getMachineGpuRows, getMachineSummaryEntries } from '../utils/format';

export interface SelfHostFormState {
  name: string;
  model_id: string;
  endpoint_url: string;
  serving_library: ServingLibrary;
  useHfUrl: boolean;
  hfUrl: string;
  hfAccessToken: string;
}

type SupportedPlatform = 'windows' | 'macos' | 'linux' | 'unknown';

const servingLibraryOptions: Array<{ value: ServingLibrary; label: string; platforms: SupportedPlatform[]; installable: boolean }> = [
  { value: 'vllm', label: 'vLLM', platforms: ['linux', 'macos'], installable: true },
  { value: 'sglang', label: 'SGLang', platforms: ['linux', 'macos'], installable: true },
  { value: 'tensorrt', label: 'TensorRT-LLM', platforms: ['linux'], installable: true },
  { value: 'ollama', label: 'Ollama', platforms: ['windows', 'macos', 'linux'], installable: true },
  { value: 'llama_cpp', label: 'llama.cpp', platforms: ['windows', 'macos', 'linux'], installable: true },
  { value: 'pytorch', label: 'PyTorch (via Transformers)', platforms: ['windows', 'macos', 'linux'], installable: true },
  { value: 'transformers', label: 'Transformers', platforms: ['windows', 'macos', 'linux'], installable: true },
  { value: 'dynamo', label: 'Dynamo', platforms: ['linux'], installable: true },
];

export function SelfHostingPage(props: {
  dashboard: DashboardState;
  selfHostForm: SelfHostFormState;
  validationResult: ValidationResult | null;
  hfModelMetadata: HfModelInfo | null;
  hfModelMetadataLoading: boolean;
  hfModelMetadataError: string | null;
  libraries: Record<ServingLibrary, boolean>;
  busy: string | null;
  analysisPanel: ReactNode;
  localDeployments: LocalModelDeployment[];
  localModelMetrics: Record<string, LocalModelMetrics>;
  onFormChange: (next: SelfHostFormState) => void;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => Promise<boolean | void> | boolean | void;
  onInstallLibrary: (library: ServingLibrary) => Promise<void>;
  onStartLocalDeployment: (deployment: LocalDeploymentRow) => Promise<void>;
  onUseInRoute: (endpointId: string, endpointName: string) => void;
  onShowUsage: (target: EndpointUsageTarget) => void;
  onDeleteLocalDeployment: (deployment: LocalDeploymentRow) => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [hfAccessCheck, setHfAccessCheck] = useState<HfAccessCheckState>({ status: 'idle' });
  const analysisRef = useRef<HTMLDivElement | null>(null);
  const canShowAnalysis = Boolean(props.hfModelMetadata);
  const selectedModelValue = props.selfHostForm.useHfUrl ? props.selfHostForm.hfUrl : props.selfHostForm.model_id;
  const hasModelInput = selectedModelValue.trim().length > 0;
  const platform = getSupportedPlatform(props.dashboard.machineDetails?.platform);
  const hasLocalRuntime = servingLibraryOptions.some((library) => props.libraries[library.value] && isServingLibrarySupported(library, platform, props.hfModelMetadata));
  const selectedLibrary = servingLibraryOptions.find((library) => library.value === props.selfHostForm.serving_library) ?? servingLibraryOptions[0];
  const selectedLibraryStatus = getServingLibraryStatus(selectedLibrary, platform, props.hfModelMetadata);
  const selectedLibrarySupported = selectedLibraryStatus.supported;
  const selectedLibraryInstalled = selectedLibrarySupported && props.libraries[selectedLibrary.value];
  const selectedLibraryLaunchable = isOneClickLaunchable(selectedLibrary.value);
  const selectedLibraryBusy = props.busy === `install-${selectedLibrary.value}`;
  const canInstallSelectedLibrary = selectedLibrarySupported && selectedLibrary.installable && !selectedLibraryInstalled;
  const isDeployable = props.validationResult?.status !== 'insufficient' && Boolean(props.hfModelMetadata) && hasLocalRuntime;
  const localDeploymentRows = getLocalDeploymentRows(props.dashboard.inferenceEndpoints, props.localDeployments, props.localModelMetrics);
  const showHfAccessTokenInput = props.selfHostForm.useHfUrl
    && hasModelInput
    && (
      Boolean(props.selfHostForm.hfAccessToken)
      || hfAccessCheck.status === 'requires-token'
      || isHfAuthMetadataError(props.hfModelMetadataError)
    );

  useEffect(() => {
    if (!props.selfHostForm.useHfUrl) {
      setHfAccessCheck({ status: 'idle' });
      return;
    }

    const rawValue = props.selfHostForm.hfUrl.trim();
    if (!rawValue) {
      setHfAccessCheck({ status: 'idle' });
      return;
    }

    const repoId = normalizeHfRepoId(rawValue);
    if (!repoId) {
      setHfAccessCheck({ status: 'invalid', message: 'Enter a valid Hugging Face URL or owner/model id.' });
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setHfAccessCheck({ status: 'checking', repoId });
      try {
        const result = await checkHfModelAccess(repoId, controller.signal);
        setHfAccessCheck(result);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setHfAccessCheck({
          status: 'error',
          repoId,
          message: 'Unable to check Hugging Face model access.',
        });
      }
    }, 500);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [props.selfHostForm.hfUrl, props.selfHostForm.useHfUrl]);
  const ctaLabel = props.busy === 'register-self-hosted'
    ? 'Deploying...'
    : props.hfModelMetadata
      ? selectedLibraryLaunchable ? 'Review & Deploy' : 'Review Manual Setup'
      : props.hfModelMetadataLoading
        ? 'Checking Model...'
        : hasModelInput
          ? 'Check Deployability'
          : 'Enter a Model';

  function getRepoName(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    try {
      const parsedUrl = new URL(trimmed);
      const parts = parsedUrl.pathname.split('/').filter(Boolean);
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : trimmed;
    } catch {
      return trimmed;
    }
  }

  function updateModel(next: Partial<SelfHostFormState>) {
    const oldCandidate = props.selfHostForm.useHfUrl ? props.selfHostForm.hfUrl : props.selfHostForm.model_id;
    const oldRepoName = getRepoName(oldCandidate);

    const nextHfUrl = next.hfUrl !== undefined ? next.hfUrl : props.selfHostForm.hfUrl;
    const nextModelId = next.model_id !== undefined ? next.model_id : props.selfHostForm.model_id;
    const nextUseHfUrl = next.useHfUrl !== undefined ? next.useHfUrl : props.selfHostForm.useHfUrl;
    const nextCandidate = nextUseHfUrl ? nextHfUrl : nextModelId;
    const nextRepoName = getRepoName(nextCandidate);

    const currentName = props.selfHostForm.name.trim();
    const shouldUpdateName = !currentName || currentName === oldRepoName;

    props.onFormChange({
      ...props.selfHostForm,
      ...next,
      name: shouldUpdateName ? nextRepoName : props.selfHostForm.name,
    });
  }

  function scrollToAnalysis() {
    requestAnimationFrame(() => {
      analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function handleReviewAndDeployClick() {
    if (canShowAnalysis) {
      scrollToAnalysis();
      return;
    }

    props.onSubmit();
  }

  return (
    <div className="card-stack" style={{ gap: '16px' }}>
      <div className="section-grid two-col">
        <Panel title="Deploy a Local Model" icon={Rocket}>
          <form className="stack-form" onSubmit={props.onSubmit}>
            <div className="form-hint">
              Run a Hugging Face or catalog model on this machine, then register the verified local endpoint with OneInfer.
            </div>

            <div className="cc-toggle" style={{ marginBottom: '8px' }}>
              <button className={`cc-toggle-btn ${props.selfHostForm.useHfUrl ? 'active' : ''}`} onClick={() => updateModel({ useHfUrl: true })} type="button" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                Hugging Face
              </button>
              <button className={`cc-toggle-btn ${!props.selfHostForm.useHfUrl ? 'active' : ''}`} onClick={() => updateModel({ useHfUrl: false })} type="button" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                OneInfer Catalog
              </button>
            </div>

            {!props.selfHostForm.useHfUrl ? (
              <label>
                <span>Model</span>
                <select value={props.selfHostForm.model_id} onChange={(event) => updateModel({ model_id: event.target.value })}>
                  <option value="">Select a model...</option>
                  {getCatalogModelOptions(props.dashboard.models).map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label>
                  <span>Model</span>
                  <input value={props.selfHostForm.hfUrl} onChange={(event) => updateModel({ hfUrl: event.target.value })} placeholder="owner/model or Hugging Face URL" />
                </label>
                {showHfAccessTokenInput ? (
                  <label>
                    <span>Hugging Face Access Token</span>
                    <input
                      type="password"
                      value={props.selfHostForm.hfAccessToken}
                      onChange={(event) => props.onFormChange({ ...props.selfHostForm, hfAccessToken: event.target.value })}
                      placeholder="hf_..."
                      autoComplete="off"
                    />
                    <small className="field-help">{hfAccessCheck.message || 'Required for private or gated Hugging Face repositories.'}</small>
                  </label>
                ) : null}
              </>
            )}

            <label>
              <span>Deployment Name</span>
              <input value={props.selfHostForm.name} onChange={(event) => props.onFormChange({ ...props.selfHostForm, name: event.target.value })} placeholder="nvidia/parakeet-tdt-0.6b-v3" />
            </label>

            <button className="ghost-button" onClick={() => setAdvancedOpen((open) => !open)} style={{ justifyContent: 'flex-start', padding: '8px 0', background: 'transparent', fontSize: '0.85rem', color: 'var(--muted)' }} type="button">
              {advancedOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <Settings2 size={16} />
              Local API Settings
            </button>

            {advancedOpen ? (
              <>
                <label>
                  <span>Serving Library</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '8px', alignItems: 'center' }}>
                    <select value={props.selfHostForm.serving_library} onChange={(event) => props.onFormChange({ ...props.selfHostForm, serving_library: event.target.value as ServingLibrary })}>
                      {servingLibraryOptions.map((library) => {
                        const status = getServingLibraryStatus(library, platform, props.hfModelMetadata);
                        const installed = status.supported && props.libraries[library.value];
                        return (
                          <option key={library.value} value={library.value} disabled={!status.supported}>
                            {library.label}{status.supported ? installed ? ' - installed' : '' : ` - ${status.shortLabel}`}
                          </option>
                        );
                      })}
                    </select>
                    {canInstallSelectedLibrary ? (
                      <button className="ghost-button" type="button" onClick={() => props.onInstallLibrary(selectedLibrary.value)} disabled={selectedLibraryBusy} style={{ whiteSpace: 'nowrap' }}>
                        {selectedLibraryBusy ? <LoaderCircle className="spin" size={14} /> : <Download size={14} />}
                        Install
                      </button>
                    ) : null}
                  </div>
                  <small className="field-help" style={{ color: selectedLibrarySupported ? 'var(--muted)' : 'var(--danger)' }}>
                    {selectedLibrarySupported
                      ? selectedLibraryInstalled
                        ? `${selectedLibrary.label} is installed on this machine.`
                        : `${selectedLibrary.label} is supported but is not installed.`
                      : selectedLibraryStatus.detail}
                  </small>
                </label>
                <label>
                  <span>Local API URL</span>
                  <input
                    value={selectedLibraryLaunchable ? 'Auto assigned when the model starts' : props.selfHostForm.endpoint_url}
                    onChange={(event) => props.onFormChange({ ...props.selfHostForm, endpoint_url: event.target.value })}
                    placeholder="http://127.0.0.1:8000/v1"
                    disabled={selectedLibraryLaunchable}
                  />
                </label>
              </>
            ) : null}

            <DeployabilityChecklist
              hasModelInput={hasModelInput}
              metadataLoading={props.hfModelMetadataLoading}
              metadataReady={Boolean(props.hfModelMetadata)}
              metadataError={props.hfModelMetadataError}
              validationResult={props.validationResult}
              libraries={props.libraries}
              platform={platform}
              model={props.hfModelMetadata}
              selectedLibrary={selectedLibrary}
              selectedLibraryInstalled={selectedLibraryInstalled}
              selectedLibraryLaunchable={selectedLibraryLaunchable}
            />

            <button
              className="primary-button"
              type="button"
              disabled={props.busy === 'register-self-hosted' || props.hfModelMetadataLoading || !props.hfModelMetadata}
              onClick={handleReviewAndDeployClick}
            >
              {props.busy === 'register-self-hosted' ? <LoaderCircle className="spin" size={16} /> : props.hfModelMetadata ? <Search size={16} /> : <Rocket size={16} />}
              {ctaLabel}
            </button>
            {!isDeployable && props.hfModelMetadata ? (
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                Review the readiness checks before deploying. You can still open the analysis for details when available.
              </div>
            ) : null}
          </form>
        </Panel>

        <Panel title="Local Hardware" icon={Server}>
          <DataList entries={getMachineSummaryEntries(props.dashboard.machineDetails)} emptyText="Machine profile not synced yet." />
          <MiniTable columns={['name', 'vendor', 'vram', 'utilization', 'driver']} rows={getMachineGpuRows(props.dashboard.machineDetails)} emptyText="No local GPU detected." />
        </Panel>
      </div>

      {canShowAnalysis ? (
        <div ref={analysisRef} id="self-hosting-analysis" className="glass-panel" style={{ overflow: 'hidden', minWidth: 0, maxWidth: '100%', scrollMarginTop: '16px' }}>
          {props.analysisPanel}
        </div>
      ) : null}

      <Panel
        title="Local Deployments"
        icon={Server}
        description="List of registered local model endpoints from self-hosted deployments. Use these endpoints as routing targets once the model server is ready."
      >
        <div className="local-deployment-list">
          {localDeploymentRows.length === 0 ? (
            <div className="empty-state">No local deployments registered yet.</div>
          ) : null}
          {localDeploymentRows.map((deployment) => (
            <LocalDeploymentCard
              key={`${deployment.endpointId}-${deployment.endpointUrl}`}
              deployment={deployment}
              metrics={props.localModelMetrics[deployment.endpointUrl]}
              busy={props.busy}
              onStart={props.onStartLocalDeployment}
              onUseInRoute={props.onUseInRoute}
              onShowUsage={props.onShowUsage}
              onDelete={props.onDeleteLocalDeployment}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function isHfAuthMetadataError(value: string | null) {
  return /401|403|private|gated|restricted|auth|token|permission/i.test(value || '');
}

function getCatalogModelOptions(models: any[]): Array<{ value: string; label: string }> {
  const seen = new Set<string>();
  return models
    .map((model) => {
      const value = String(model.model_id ?? model.modelId ?? model.id ?? '').trim();
      const label = String(model.model_name ?? model.modelName ?? model.displayName ?? value).trim();
      return value ? { value, label: label || value } : null;
    })
    .filter((model): model is { value: string; label: string } => {
      if (!model || seen.has(model.value)) {
        return false;
      }

      seen.add(model.value);
      return true;
    });
}

type HfAccessCheckState = {
  status: 'idle' | 'checking' | 'open' | 'requires-token' | 'invalid' | 'error';
  repoId?: string;
  message?: string;
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
    try {
      const url = new URL(rawValue);
      const parts = url.pathname.split('/').filter(Boolean);
      return normalizeOwnerModel(parts.join('/'));
    } catch {
      return '';
    }
  }

  return normalizeOwnerModel(rawValue);
}

async function checkHfModelAccess(repoId: string, signal: AbortSignal): Promise<HfAccessCheckState> {
  const encodedRepoId = repoId.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`https://huggingface.co/api/models/${encodedRepoId}`, { signal });

  if (response.status === 401 || response.status === 403 || response.status === 404) {
    return {
      status: 'requires-token',
      repoId,
      message: 'This model requires a Hugging Face token.',
    };
  }

  if (!response.ok) {
    return {
      status: 'error',
      repoId,
      message: `Hugging Face returned HTTP ${response.status}.`,
    };
  }

  const metadata = await response.json() as { gated?: unknown; private?: unknown };
  const isGated = metadata.gated !== undefined && metadata.gated !== false && metadata.gated !== 'false';
  const isPrivate = metadata.private === true || metadata.private === 'true';

  if (isGated || isPrivate) {
    return {
      status: 'requires-token',
      repoId,
      message: 'This model requires a Hugging Face token.',
    };
  }

  return { status: 'open', repoId };
}

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

function formatPlatformLabel(platform: SupportedPlatform): string {
  const labels: Record<SupportedPlatform, string> = {
    windows: 'Windows',
    macos: 'macOS',
    linux: 'Linux',
    unknown: 'Unknown OS',
  };
  return labels[platform] ?? platform;
}

function isServingLibrarySupported(library: { value: ServingLibrary; label: string; platforms: SupportedPlatform[] }, platform: SupportedPlatform, model: HfModelInfo | null): boolean {
  return getServingLibraryStatus(library, platform, model).supported;
}

function getServingLibraryStatus(
  library: { value: ServingLibrary; label: string; platforms: SupportedPlatform[] },
  platform: SupportedPlatform,
  model: HfModelInfo | null,
): { supported: boolean; shortLabel: string; detail: string } {
  const osSupported = platform === 'unknown' || library.platforms.includes(platform);
  if (!osSupported) {
    const supportedOs = library.platforms.map(formatPlatformLabel).join(', ');
    return {
      supported: false,
      shortLabel: 'OS not supported',
      detail: `${library.label} is not supported on this OS. Supported OS: ${supportedOs}.`,
    };
  }

  if (model) {
    const compatibility = getServingLibraryCompatibility(library.value, model);
    if (!compatibility.supported) {
      return {
        supported: false,
        shortLabel: 'Model not supported',
        detail: compatibility.reason || `${library.label} does not support this model.`,
      };
    }
  }

  return {
    supported: true,
    shortLabel: 'Supported',
    detail: `${library.label} supports this OS${model ? ' and model' : ''}.`,
  };
}

interface LocalDeploymentRow {
  endpointId: string;
  endpointUrl: string;
  modelId: string;
  name: string;
  runtime: string;
  deployedAt: string;
  registered: boolean;
  pid: number | null;
}

function LocalDeploymentCard(props: {
  deployment: LocalDeploymentRow;
  metrics?: LocalModelMetrics;
  busy: string | null;
  onStart: (deployment: LocalDeploymentRow) => Promise<void>;
  onUseInRoute: (endpointId: string, endpointName: string) => void;
  onShowUsage: (target: EndpointUsageTarget) => void;
  onDelete: (deployment: LocalDeploymentRow) => void;
}) {
  const healthLabel = props.metrics?.healthy === undefined
    ? props.deployment.registered ? 'registered' : 'local'
    : props.metrics.healthy ? 'online' : 'offline';
  const curlBase = props.deployment.endpointUrl.replace(/\/+$/, '');
  const startBusy = props.busy === `start-local:${props.deployment.endpointUrl}`;
  const canStart = props.metrics?.healthy !== true;

  return (
    <div className="local-deployment-card">
      <div className="local-deployment-main">
        <div style={{ minWidth: 0 }}>
          <strong>{props.deployment.name}</strong>
          <span>{props.deployment.modelId}</span>
          <code>{props.deployment.endpointUrl}</code>
        </div>
        <span className={`status-pill ${props.metrics?.healthy ? 'active' : 'soft'}`}>{healthLabel}</span>
      </div>
      <div className="local-deployment-meta">
        <span>Runtime: {props.deployment.runtime}</span>
        <span>{props.deployment.pid ? `PID: ${props.deployment.pid}` : 'Backend registered'}</span>
        <span>{props.deployment.deployedAt}</span>
      </div>
      <div className="local-deployment-actions">
        {canStart ? (
          <button className="ghost-button" type="button" disabled={startBusy} onClick={() => props.onStart(props.deployment)}>
            {startBusy ? <LoaderCircle className="spin" size={14} /> : <Power size={14} />}
            Start
          </button>
        ) : null}
        <button className="ghost-button" type="button" disabled={!props.deployment.registered} onClick={() => props.onUseInRoute(props.deployment.endpointId, props.deployment.name)}>
          <Orbit size={14} />
          Use in route
        </button>
        <button
          className="ghost-button"
          type="button"
          disabled={!props.deployment.endpointUrl}
          onClick={() => props.onShowUsage({
            endpointId: props.deployment.endpointId,
            endpointUrl: props.deployment.endpointUrl,
            modelId: props.deployment.modelId,
            name: props.deployment.name,
            source: 'local',
          })}
        >
          <PlayCircle size={14} />
          Usage
        </button>
        <button className="ghost-button" type="button" onClick={() => navigator.clipboard?.writeText(curlBase)}>
          <Copy size={14} />
          Copy URL
        </button>
        <button className="ghost-button !text-[#ff7c78]" type="button" onClick={() => props.onDelete(props.deployment)}>
          <Trash2 size={14} />
          Delete
        </button>
      </div>
    </div>
  );
}

function getLocalDeploymentRows(endpoints: EndpointItem[], deployments: LocalModelDeployment[], metricsMap: Record<string, LocalModelMetrics>): LocalDeploymentRow[] {
  const rows = new Map<string, LocalDeploymentRow>();

  endpoints
    .filter((endpoint) => isLocalEndpoint(endpoint))
    .filter((endpoint) => !isRouterEndpoint(endpoint))
    .forEach((endpoint, index) => {
      const endpointUrl = String(endpoint.endpoint_url ?? '');
      if (!endpointUrl) {
        return;
      }

      const endpointId = getEndpointId(endpoint, index);
      const modelId = String(endpoint.model_id ?? endpoint.name ?? `local-model-${index + 1}`);
      const rowKey = getLocalDeploymentRowKey(endpointUrl, modelId);

      rows.set(rowKey, {
        endpointId,
        endpointUrl: normalizeLocalEndpointUrl(endpointUrl),
        modelId,
        name: String(endpoint.name ?? endpoint.model_id ?? `Local model ${index + 1}`),
        runtime: normalizeServingLibrary(endpoint.serving_library, endpointUrl),
        deployedAt: String(endpoint.created_at ?? endpoint.updated_at ?? 'Registered endpoint'),
        registered: true,
        pid: null,
      });
    });

  deployments.filter((deployment) => !isRouterDeployment(deployment) && isVisibleLocalDeployment(deployment, metricsMap)).forEach((deployment, index) => {
    const rowKey = getLocalDeploymentRowKey(deployment.endpointUrl, deployment.modelId);
    const existing = rows.get(rowKey);
    rows.set(rowKey, {
      endpointId: existing?.endpointId ?? deployment.endpointId ?? `local-deployment-${index + 1}`,
      endpointUrl: normalizeLocalEndpointUrl(deployment.endpointUrl),
      modelId: deployment.modelId,
      name: deployment.name,
      runtime: deployment.runtime,
      deployedAt: deployment.deployedAt,
      registered: Boolean(existing?.registered || deployment.endpointId),
      pid: deployment.pid,
    });
  });

  return Array.from(rows.values());
}

function isRouterEndpoint(endpoint: EndpointItem): boolean {
  const role = String((endpoint as Record<string, unknown>).endpoint_role ?? (endpoint as Record<string, unknown>).role ?? '').toLowerCase();
  if (role === 'router') {
    return true;
  }

  return isRouterText(String(endpoint.name ?? ''), String(endpoint.model_id ?? ''));
}

function isRouterDeployment(deployment: LocalModelDeployment): boolean {
  return isRouterText(deployment.name, deployment.modelId);
}

function isVisibleLocalDeployment(deployment: Pick<LocalModelDeployment, 'endpointId' | 'endpointUrl' | 'modelId' | 'name'>, metricsMap: Record<string, LocalModelMetrics>): boolean {
  if (deployment.endpointId) {
    return true;
  }

  const metrics = metricsMap[deployment.endpointUrl] ?? metricsMap[normalizeLocalEndpointUrl(deployment.endpointUrl)];
  if (metrics?.healthy && Array.isArray(metrics.modelIds) && metrics.modelIds.length > 0) {
    return metrics.modelIds.some((modelId) => isSameLocalModelId(modelId, deployment.modelId));
  }

  return true;
}

function isRouterText(name: string, modelId: string): boolean {
  const text = `${name} ${modelId}`.toLowerCase();
  return text.includes(' router') || text.endsWith('router') || text.includes('arch-router') || text.includes('routellm') || text.includes('router-r1');
}

function getLocalDeploymentRowKey(endpointUrl: string, modelId: string): string {
  return `${normalizeLocalEndpointUrl(endpointUrl)}::${modelId}`;
}

function normalizeLocalEndpointUrl(endpointUrl: string): string {
  return endpointUrl.trim().replace('://localhost', '://127.0.0.1').replace('://0.0.0.0', '://127.0.0.1').replace(/\/+$/, '');
}

function isSameLocalModelId(left: string, right: string): boolean {
  const leftAliases = getLocalModelIdAliases(left);
  const rightAliases = getLocalModelIdAliases(right);
  return leftAliases.some((alias) => rightAliases.includes(alias));
}

function getLocalModelIdAliases(value: string): string[] {
  const rawValue = value.trim();
  const normalized = rawValue.toLowerCase();
  const withoutHfPrefix = normalized.startsWith('hf.co/') ? normalized.slice('hf.co/'.length) : normalized;
  const withHfPrefix = normalized.includes('/') && !normalized.startsWith('hf.co/') ? `hf.co/${normalized}` : normalized;
  return Array.from(new Set([normalized, withoutHfPrefix, withHfPrefix].filter(Boolean)));
}

function getEndpointId(endpoint: EndpointItem, index: number): string {
  const record = endpoint as Record<string, unknown>;
  return String(
    endpoint.inference_endpoint_id
    ?? record.inference_api_id
    ?? record.inference_api_endpoint_id
    ?? record.inferenceApiId
    ?? record.inferenceApiEndpointId
    ?? endpoint.endpoint_id
    ?? endpoint.id
    ?? `endpoint-${index + 1}`,
  );
}

function isLocalEndpoint(endpoint: EndpointItem): boolean {
  const endpointUrl = String(endpoint.endpoint_url ?? '').toLowerCase();
  return String(endpoint.deployment_target ?? '').toLowerCase() === 'local'
    || endpointUrl.includes('localhost')
    || endpointUrl.includes('127.0.0.1')
    || endpointUrl.includes('0.0.0.0');
}

function DeployabilityChecklist(props: {
  hasModelInput: boolean;
  metadataLoading: boolean;
  metadataReady: boolean;
  metadataError: string | null;
  validationResult: ValidationResult | null;
  libraries: Record<ServingLibrary, boolean>;
  platform: SupportedPlatform;
  model: HfModelInfo | null;
  selectedLibrary: { value: ServingLibrary; label: string };
  selectedLibraryInstalled: boolean;
  selectedLibraryLaunchable: boolean;
}) {
  const supportedInstalledLibraries = servingLibraryOptions
    .filter((library) => props.libraries[library.value] && isServingLibrarySupported(library, props.platform, props.model))
    .map((library) => library.label);
  const runtimeInstalled = supportedInstalledLibraries.length > 0;
  const runtimeLabel = props.selectedLibraryInstalled
    ? `Supported serving libraries: ${props.selectedLibrary.label}`
    : runtimeInstalled
      ? `Supported serving libraries: ${supportedInstalledLibraries.join(', ')}`
      : 'Supported serving libraries required';
  const runtimeDetail = props.selectedLibraryInstalled
    ? props.selectedLibraryLaunchable
      ? `${props.selectedLibrary.label} can be launched automatically for this model.`
      : `${props.selectedLibrary.label} can be registered after you start an OpenAI-compatible local server. One-click launch is currently available for vLLM and Ollama.`
    : runtimeInstalled
      ? 'Select a supported serving library, or install the selected serving library before deployment.'
    : 'Install or start a supported local serving library before deployment.';

  return (
    <div style={{ display: 'grid', gap: '8px', padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <ReadinessRow
        ok={props.metadataReady}
        pending={props.metadataLoading}
        label={props.metadataLoading ? 'Fetching model metadata' : props.metadataReady ? 'Model metadata found' : props.hasModelInput ? 'Model metadata needed' : 'Choose a model'}
        detail={props.metadataError || undefined}
      />
      <ReadinessRow
        ok={props.validationResult?.status === 'supported' || props.validationResult?.status === 'warning'}
        warning={props.validationResult?.status === 'warning'}
        label={props.validationResult ? props.validationResult.status === 'insufficient' ? 'Hardware not deployable' : props.validationResult.status === 'warning' ? 'Hardware warning' : 'Hardware can run this model' : 'Hardware check pending'}
        detail={props.validationResult?.message}
      />
      <ReadinessRow
        ok={runtimeInstalled}
        label={runtimeLabel}
        detail={runtimeDetail}
      />
    </div>
  );
}

function isOneClickLaunchable(library: ServingLibrary): boolean {
  return library === 'vllm' || library === 'ollama' || library === 'transformers' || library === 'pytorch';
}

function normalizeServingLibrary(value: unknown, endpointUrl = ''): ServingLibrary {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  const aliases: Record<string, ServingLibrary> = {
    vllm: 'vllm',
    sglang: 'sglang',
    tensor_rt: 'tensorrt',
    tensorrt: 'tensorrt',
    tensorrt_llm: 'tensorrt',
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
  return aliases[normalized] ?? (endpointUrl.includes(':11434') ? 'ollama' : 'vllm');
}

function ReadinessRow(props: { ok: boolean; warning?: boolean; pending?: boolean; label: string; detail?: string }) {
  const color = props.pending ? 'var(--muted)' : props.warning ? '#f59e0b' : props.ok ? 'var(--accent)' : 'var(--danger)';
  const Icon = props.pending ? LoaderCircle : props.ok || props.warning ? CheckCircle2 : XCircle;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.8rem', lineHeight: 1.4 }}>
      <Icon className={props.pending ? 'spin' : undefined} size={16} style={{ color, flexShrink: 0, marginTop: '1px' }} />
      <div>
        <strong style={{ color: 'var(--text)', display: 'block' }}>{props.label}</strong>
        {props.detail ? <span style={{ color: 'var(--muted)' }}>{props.detail}</span> : null}
      </div>
    </div>
  );
}
