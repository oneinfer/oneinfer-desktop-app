import { Blocks, Bot, Orbit, Server, Zap } from 'lucide-react';

import { EmptyState } from '../components/Common';
import { HardwareWidget } from '../components/HardwareWidget';
import { ClaudeCodeSetupPanel, KiloCodeSetupPanel, OpenClawSetupPanel, OpenCodeSetupPanel } from '../components/SetupPanels';
import type { ActiveDeveloperPlanItem, DashboardState, DeveloperPlanItem, EndpointItem, LocalModelDeployment, LocalModelMetrics, SectionKey, ServingLibrary } from '../types';
import { formatValue } from '../utils/format';

export function OverviewPage(props: {
  dashboard: DashboardState;
  busy: string | null;
  infraTab: 'self-hosted' | 'cloud';
  overviewTab: 'claude-code' | 'opencode' | 'kilocode' | 'openclaw';
  claudeCodeProvider: 'oneinfer' | 'anthropic';
  localDeployments: LocalModelDeployment[];
  localModelMetrics: Record<string, LocalModelMetrics>;
  onInfraTabChange: (tab: 'self-hosted' | 'cloud') => void;
  onOverviewTabChange: (tab: 'claude-code' | 'opencode' | 'kilocode' | 'openclaw') => void;
  onClaudeProviderChange: (provider: 'oneinfer' | 'anthropic') => void;
  onEnableOpenCode: () => void;
  onEnableKiloCode: () => void;
  onEnableOpenClaw: () => void;
  onSectionChange: (section: SectionKey) => void;
  onOpenRoute: (routeId: string) => void;
}) {
  const localEndpoints = props.dashboard.inferenceEndpoints.filter((endpoint) => getEndpointSource(endpoint) === 'local' && !isRouterEndpoint(endpoint));
  const cloudEndpoints = props.dashboard.inferenceEndpoints.filter((endpoint) => getEndpointSource(endpoint) === 'cloud' && !isRouterEndpoint(endpoint));
  const validLocalDeployments = props.localDeployments.filter((deployment) => isVisibleLocalDeployment(deployment, props.localModelMetrics));
  const localDeploymentKeys = new Set(validLocalDeployments.map((deployment) => getLocalDeploymentKey(deployment.endpointUrl, deployment.modelId)));
  const visibleLocalDeployments = [
    ...validLocalDeployments.map((deployment) => ({
      ...deployment,
      endpointUrl: normalizeLocalEndpointUrl(deployment.endpointUrl),
    })),
    ...localEndpoints.map((endpoint, index) => ({
      endpointUrl: normalizeLocalEndpointUrl(String(endpoint.endpoint_url ?? '')),
      modelId: String(endpoint.model_id ?? `local-model-${index}`),
      name: String(endpoint.name ?? endpoint.model_id ?? `Local model ${index + 1}`),
      pid: null,
      runtime: normalizeServingLibrary(endpoint.serving_library, String(endpoint.endpoint_url ?? '')),
      deployedAt: String(endpoint.created_at ?? endpoint.updated_at ?? new Date().toISOString()),
    })).filter((deployment) => deployment.endpointUrl && !localDeploymentKeys.has(getLocalDeploymentKey(deployment.endpointUrl, deployment.modelId)) && isVisibleLocalDeployment(deployment, props.localModelMetrics)),
  ];
  const activePlan = props.dashboard.activeDeveloperPlan
    ? props.dashboard.developerPlans.find((plan) => plan.planId === props.dashboard.activeDeveloperPlan?.planId) ?? {
        ...props.dashboard.activeDeveloperPlan,
        ctaText: 'Current Plan',
      }
    : null;

  return (
    <div className="overview-page">
      <div className="overview-two-column">
        <aside className="glass-panel overview-feature-card" style={{ padding: '20px' }}>
            <div className="cc-toggle" style={{ marginBottom: '20px' }}>
              <button className={`cc-toggle-btn ${props.infraTab === 'self-hosted' ? 'active' : ''}`} onClick={() => props.onInfraTabChange('self-hosted')} type="button">
                <Server size={14} />
                Self Hosting
              </button>
              <button className={`cc-toggle-btn ${props.infraTab === 'cloud' ? 'active' : ''}`} onClick={() => props.onInfraTabChange('cloud')} type="button">
                <Server size={14} />
                Cloud
              </button>
            </div>

            <div className="card-stack">
              {props.infraTab === 'self-hosted' ? (
                <>
                  <div className="panel-header" style={{ padding: '0 0 12px 0', justifyContent: 'flex-start', gap: '10px' }}>
                    <Server size={18} className="panel-icon" />
                    <h3 className="panel-title">Self Hosting</h3>
                  </div>
                  <div className="instance-list">
                    {visibleLocalDeployments.length === 0 ? <EmptyState text="No local models registered." /> : null}
                    {visibleLocalDeployments.map((deployment) => {
                      const metrics = props.localModelMetrics[deployment.endpointUrl];
                      return (
                        <LocalDeploymentSummary key={`${deployment.modelId}-${deployment.endpointUrl}`} deployment={deployment} metrics={metrics} />
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <div className="panel-header" style={{ padding: '0 0 12px 0', justifyContent: 'flex-start', gap: '10px' }}>
                    <Server size={18} className="panel-icon" />
                    <h3 className="panel-title">Cloud Instances</h3>
                  </div>
                  <div className="instance-list">
                    {props.dashboard.instances.length === 0 ? <EmptyState text="No active cloud instances." /> : null}
                    {props.dashboard.instances.map((instance, index) => {
                      const instanceId = String(instance.instance_id ?? instance.unique_instance_id ?? instance.id ?? `instance-${index}`);
                      return (
                        <div className="sub-card" key={instanceId} style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <div>
                              <h4 style={{ fontSize: '0.9rem' }}>{String(instance.instance_name ?? instanceId)}</h4>
                              <p style={{ fontSize: '0.75rem', margin: 0 }}>{String(instance.provider_name)} - {String(instance.region)}</p>
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

        <main className="glass-panel overview-feature-card" style={{ padding: '20px' }}>
          <h3 className="overview-settings-heading">AI Coding Tool</h3>
          <div className="cc-toggle" style={{ marginBottom: '20px' }}>
            <button className={`cc-toggle-btn ${props.overviewTab === 'claude-code' ? 'active' : ''}`} onClick={() => props.onOverviewTabChange('claude-code')} type="button">
              <Bot size={14} />
              Claude Code
            </button>
            <button className={`cc-toggle-btn ${props.overviewTab === 'opencode' ? 'active' : ''}`} onClick={() => props.onOverviewTabChange('opencode')} type="button">
              <Blocks size={14} />
              OpenCode
            </button>
            <button className={`cc-toggle-btn ${props.overviewTab === 'kilocode' ? 'active' : ''}`} onClick={() => props.onOverviewTabChange('kilocode')} type="button">
              <Blocks size={14} />
              Kilo Code
            </button>
            <button className={`cc-toggle-btn ${props.overviewTab === 'openclaw' ? 'active' : ''}`} onClick={() => props.onOverviewTabChange('openclaw')} type="button">
              <Blocks size={14} />
              OpenClaw
            </button>
          </div>

          <div className="card-stack">
            {localEndpoints.length > 0 && (
              <div className="status-card success" style={{ marginBottom: '16px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                <div className="status-card-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                  <Zap size={20} />
                </div>
                <div className="status-card-content" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <div style={{ textAlign: 'left' }}>
                    <h4 style={{ color: '#10b981', margin: '0 0 4px 0' }}>Local Models Active</h4>
                    <p style={{ fontSize: '0.85rem', opacity: 0.8, margin: 0 }}>{localEndpoints.length} local inference server(s) registered and ready.</p>
                  </div>
                  <button className="ghost-button" onClick={() => props.onSectionChange('routing')} style={{ fontSize: '0.75rem' }} type="button">Manage Routing</button>
                </div>
              </div>
            )} 

            {props.overviewTab === 'claude-code' ? <ClaudeCodeSetupPanel provider={props.claudeCodeProvider} onSetProvider={props.onClaudeProviderChange} busy={props.busy} /> : null}
            {props.overviewTab === 'opencode' ? <OpenCodeSetupPanel busy={props.busy} onEnable={props.onEnableOpenCode} /> : null}
            {props.overviewTab === 'kilocode' ? <KiloCodeSetupPanel busy={props.busy} onEnable={props.onEnableKiloCode} /> : null}
            {props.overviewTab === 'openclaw' ? <OpenClawSetupPanel busy={props.busy} onEnable={props.onEnableOpenClaw} /> : null}
          </div>
        </main>

        <RoutingSummaryCard
          routes={props.dashboard.intelligentEndpoints}
          routeCount={props.dashboard.intelligentEndpoints.length}
          localTargetCount={visibleLocalDeployments.length}
          cloudTargetCount={cloudEndpoints.length}
          onManage={() => props.onSectionChange('routing')}
          onOpenRoute={props.onOpenRoute}
        />

        <section className="overview-standalone-section">
          <div className="panel-header" style={{ padding: 0, justifyContent: 'flex-start', gap: '10px' }}>
            <Zap size={18} className="panel-icon" />
            <h3 className="panel-title">Active Plans</h3>
          </div>
          <ActivePlansCard activePlan={activePlan} />
        </section>
      </div>

      <div className="section-grid dashboard-row compact-row hardware-full-row overview-hardware-row">
        <HardwareWidget machine={props.dashboard.machineDetails} />
      </div>
    </div>
  );
}

function ActivePlansCard(props: { activePlan: DeveloperPlanItem | ActiveDeveloperPlanItem | null }) {
  if (!props.activePlan) {
    return (
      <div className="sub-card" style={{ padding: '16px', color: 'var(--muted)', fontSize: '0.88rem' }}>
        No active plan found.
      </div>
    );
  }

  const planName = normalizePlanName(props.activePlan.planTier);
  const status = 'status' in props.activePlan ? props.activePlan.status : undefined;

  return (
    <div className="sub-card" style={{ alignItems: 'stretch', display: 'grid', gap: '14px', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', minWidth: 0 }}>
          <span className="settings-list-icon" style={{ flexShrink: 0 }}>
            <Zap size={16} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: '0.95rem', margin: '0 0 4px' }}>{planName}</h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.78rem', margin: 0 }}>
              {formatPlanPrice(props.activePlan.pricing, props.activePlan.currency)} /mo
            </p>
          </div>
        </div>
        <span className="status-pill active" style={{ whiteSpace: 'nowrap' }}>
          {formatValue(status ?? 'Current')}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
        <MetricChip label="Bandwidth" value={`${formatMetric(props.activePlan.requestsPerMinute)} RPM`} />
        <MetricChip label="Concurrency" value={formatMetric(props.activePlan.concurrency)} />
      </div>
    </div>
  );
}

function RoutingSummaryCard(props: {
  routes: EndpointItem[];
  routeCount: number;
  localTargetCount: number;
  cloudTargetCount: number;
  onManage: () => void;
  onOpenRoute: (routeId: string) => void;
}) {
  const targetCount = props.localTargetCount + props.cloudTargetCount;
  const previewRoutes = props.routes.slice(0, 3);

  return (
    <section className="sub-card" style={{ alignItems: 'stretch', display: 'grid', gap: '14px', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', minWidth: 0 }}>
          <span className="status-card-icon" style={{ background: 'rgba(116, 227, 197, 0.1)', color: 'var(--accent)', height: '38px', width: '38px' }}>
            <Orbit size={18} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: '0.95rem', margin: '0 0 4px' }}>Routing</h3>
            <p style={{ fontSize: '0.78rem', margin: 0 }}>Route requests across self-hosted and cloud targets.</p>
          </div>
        </div>
        <span className={`status-pill ${props.routeCount > 0 ? 'active' : ''}`} style={{ whiteSpace: 'nowrap' }}>
          {props.routeCount} route{props.routeCount === 1 ? '' : 's'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
        <MetricChip label="Targets" value={formatMetric(targetCount)} />
        <MetricChip label="Local" value={formatMetric(props.localTargetCount)} />
        <MetricChip label="Cloud" value={formatMetric(props.cloudTargetCount)} />
      </div>

      {previewRoutes.length > 0 ? (
        <div style={{ display: 'grid', gap: '8px' }}>
          {previewRoutes.map((route, index) => {
            const routeId = getRouteId(route, index);
            const routeName = String(route.name ?? route.endpoint_name ?? routeId);
            const status = String(route.status ?? route.creation_status ?? 'active');
            return (
              <button
                className="overview-router-row"
                key={routeId}
                onClick={() => props.onOpenRoute(routeId)}
                type="button"
              >
                <span>
                  <strong>{routeName}</strong>
                  <small>{routeId}</small>
                </span>
                <span className={`status-pill ${isActiveStatus(status) ? 'active' : 'soft'}`}>
                  {formatValue(status)}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
          No routers created yet.
        </div>
      )}

      <button className="ghost-button" onClick={props.onManage} style={{ fontSize: '0.8rem', justifySelf: 'flex-start', minHeight: '36px', padding: '8px 12px' }} type="button">
        <Orbit size={14} />
        Manage Routing
      </button>
    </section>
  );
}

function getRouteId(endpoint: EndpointItem, index: number): string {
  return String(endpoint.intelligent_endpoint_id ?? endpoint.endpoint_id ?? endpoint.id ?? `route-${index + 1}`);
}

function isActiveStatus(status: string): boolean {
  const normalizedStatus = status.toLowerCase();
  return normalizedStatus === 'active' || normalizedStatus === 'running' || normalizedStatus === 'ready';
}

function LocalDeploymentSummary(props: { deployment: LocalModelDeployment; metrics?: LocalModelMetrics }) {
  const healthy = props.metrics?.healthy;
  return (
    <div className="sub-card" style={{ padding: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h4 style={{ fontSize: '0.9rem', marginBottom: '4px' }}>{props.deployment.name}</h4>
          <p style={{ fontSize: '0.75rem', margin: 0, color: 'var(--muted)', wordBreak: 'break-word' }}>{props.deployment.modelId}</p>
          <p style={{ fontSize: '0.72rem', margin: '6px 0 0', fontFamily: 'monospace', color: 'var(--accent)', wordBreak: 'break-all' }}>{props.deployment.endpointUrl}</p>
        </div>
        <span className={`status-pill ${healthy ? 'active' : ''}`} style={{ fontSize: '0.7rem', padding: '4px 8px', whiteSpace: 'nowrap' }}>
          {healthy === undefined ? 'registered' : healthy ? 'online' : 'offline'}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginTop: '12px' }}>
        <MetricChip label="Requests" value={formatMetric(props.metrics?.requestSuccessTotal)} />
        <MetricChip label="Running" value={formatMetric(props.metrics?.requestsRunning)} />
        <MetricChip label="GPU Cache" value={formatPercent(props.metrics?.gpuCacheUsagePercent)} />
      </div>
    </div>
  );
}

function getLocalDeploymentKey(endpointUrl: string, modelId: string): string {
  return `${normalizeLocalEndpointUrl(endpointUrl)}::${modelId}`;
}

function isVisibleLocalDeployment(deployment: Pick<LocalModelDeployment, 'endpointId' | 'endpointUrl' | 'modelId' | 'name'>, metricsMap: Record<string, LocalModelMetrics>): boolean {
  if (isRouterText(deployment.name, deployment.modelId)) {
    return false;
  }

  if (deployment.endpointId) {
    return true;
  }

  const metrics = metricsMap[deployment.endpointUrl] ?? metricsMap[normalizeLocalEndpointUrl(deployment.endpointUrl)];
  if (metrics?.healthy && Array.isArray(metrics.modelIds) && metrics.modelIds.length > 0) {
    return metrics.modelIds.some((modelId) => isSameLocalModelId(modelId, deployment.modelId));
  }

  return true;
}

function isRouterEndpoint(endpoint: Record<string, unknown>): boolean {
  const role = String(endpoint.endpoint_role ?? endpoint.role ?? '').toLowerCase();
  return role === 'router' || isRouterText(String(endpoint.name ?? ''), String(endpoint.model_id ?? endpoint.modelId ?? ''));
}

function isRouterText(name: string, modelId: string): boolean {
  const text = `${name} ${modelId}`.toLowerCase();
  return text.includes(' router') || text.endsWith('router') || text.includes('arch-router') || text.includes('routellm') || text.includes('router-r1');
}

type EndpointSource = 'local' | 'cloud' | 'openbandwidth' | 'closed_source_api';

function getEndpointSource(endpoint: Record<string, unknown>): EndpointSource {
  const sourceText = [
    endpoint.endpoint_source,
    endpoint.source,
    endpoint.endpoint_type,
    endpoint.provider,
    endpoint.deployment_target,
    endpoint.endpoint_url,
    endpoint.name,
    endpoint.endpoint_name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (sourceText.includes('openbandwidth') || sourceText.includes('open_bandwidth') || sourceText.includes('open bandwidth')) {
    return 'openbandwidth';
  }

  if (String(endpoint.deployment_target ?? '').toLowerCase() === 'local' || isLocalEndpointUrl(endpoint.endpoint_url)) {
    return 'local';
  }

  if (
    sourceText.includes('closed_source_api')
    || sourceText.includes('closed source')
    || sourceText.includes('close source')
    || isClosedSourceProvider(endpoint.provider)
  ) {
    return 'closed_source_api';
  }

  return 'cloud';
}

function isLocalEndpointUrl(value: unknown): boolean {
  if (!value) {
    return false;
  }

  const endpointUrl = String(value).toLowerCase();
  return endpointUrl.includes('localhost')
    || endpointUrl.includes('127.0.0.1')
    || endpointUrl.includes('0.0.0.0');
}

function isClosedSourceProvider(value: unknown): boolean {
  const provider = String(value ?? '').toLowerCase();
  return ['openai', 'anthropic', 'gemini', 'google', 'groq', 'cohere', 'mistral'].some((item) => provider.includes(item));
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

function normalizeServingLibrary(value: unknown, endpointUrl = ''): ServingLibrary {
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
  return aliases[normalized] ?? (endpointUrl.includes(':11434') ? 'ollama' : 'vllm');
}

function MetricChip(props: { label: string; value: string }) {
  return (
    <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)' }}>
      <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase' }}>{props.label}</div>
      <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{props.value}</div>
    </div>
  );
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <div className="metric-card" style={{ minHeight: '5rem', padding: '12px' }}>
      <span>{props.label}</span>
      <strong style={{ fontSize: '1.1rem' }}>{props.value}</strong>
    </div>
  );
}

function formatMetric(value?: number | null) {
  return typeof value === 'number' ? value.toLocaleString() : '-';
}

function formatPercent(value?: number | null) {
  return typeof value === 'number' ? `${Math.max(0, Math.min(100, value)).toFixed(1)}%` : '-';
}

function formatDuration(value?: number | null) {
  if (typeof value !== 'number') {
    return '-';
  }

  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function normalizePlanName(value: string): string {
  return value.replace(/\s+plan$/i, '').trim() || 'Plan';
}

function formatPlanPrice(value: number, currency: string): string {
  const normalizedCurrency = currency === 'INR' ? 'INR' : 'USD';
  const locale = normalizedCurrency === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: normalizedCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
