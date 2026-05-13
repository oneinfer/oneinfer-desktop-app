import { Blocks, Bot, Copy, Server, ShieldCheck, Terminal, Zap } from 'lucide-react';

import { EmptyState, MiniTable, Panel } from '../components/Common';
import { HardwareWidget } from '../components/HardwareWidget';
import { ClaudeCodeSetupPanel, KiloCodeSetupPanel, OpenClawSetupPanel, OpenCodeSetupPanel } from '../components/SetupPanels';
import type { DashboardState, LocalModelDeployment, LocalModelMetrics, SectionKey } from '../types';
import { formatValue, getBalance } from '../utils/format';
import { PlanRow } from './BandwidthPage';

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
}) {
  const localEndpoints = props.dashboard.inferenceEndpoints.filter((endpoint) => String(endpoint.deployment_target).toLowerCase() === 'local');
  const visibleLocalDeployments = props.localDeployments.length > 0
    ? props.localDeployments
    : localEndpoints.map((endpoint, index) => ({
      endpointUrl: String(endpoint.endpoint_url ?? ''),
      modelId: String(endpoint.model_id ?? `local-model-${index}`),
      name: String(endpoint.name ?? endpoint.model_id ?? `Local model ${index + 1}`),
      pid: null,
      runtime: 'vllm' as const,
      deployedAt: String(endpoint.created_at ?? endpoint.updated_at ?? new Date().toISOString()),
    })).filter((deployment) => deployment.endpointUrl);

  const activePlanId = props.dashboard.activeDeveloperPlan?.planId ?? null;
  const activePlan = props.dashboard.developerPlans?.find((p) => p.planId === activePlanId);

  return (
    <>
      {activePlan ? (
        <div style={{ marginBottom: '20px' }}>
          <PlanRow plan={activePlan} isCurrent={true} />
        </div>
      ) : null}

      <div className="settings-layout" style={{ gridTemplateColumns: '1fr' }}>
        <aside className="glass-panel" style={{ padding: '20px' }}>
          <div className="cc-toggle" style={{ marginBottom: '20px' }}>
            <button className={`cc-toggle-btn ${props.infraTab === 'self-hosted' ? 'active' : ''}`} onClick={() => props.onInfraTabChange('self-hosted')} type="button">
              <Server size={14} />
              Self-hosted
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
                  <h3 className="panel-title">Self-hosted Models</h3>
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

        <main className="glass-panel" style={{ padding: '20px' }}>
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
            {props.infraTab === 'self-hosted' && visibleLocalDeployments.length > 0 ? (
              <LocalAccessPanel deployment={visibleLocalDeployments[0]} metrics={props.localModelMetrics[visibleLocalDeployments[0].endpointUrl]} />
            ) : null}

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
      </div>

      <div className="section-grid dashboard-row compact-row" style={{ gridTemplateColumns: '3fr 1fr', marginTop: '20px' }}>
        <HardwareWidget machine={props.dashboard.machineDetails} />
        <Panel title="Credits" icon={ShieldCheck} style={{ height: '145px' }}>
          <div style={{ padding: '8px 4px' }}>
            {props.dashboard.credits ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                  {getBalance(props.dashboard.credits)}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Available Credits
                </div>
              </div>
            ) : (
              <EmptyState text="Credit data not loaded." />
            )}
          </div>
        </Panel>
      </div>
    </>
  );
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

function LocalAccessPanel(props: { deployment: LocalModelDeployment; metrics?: LocalModelMetrics }) {
  const curlExample = `curl ${props.deployment.endpointUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
  -d "{\\"model\\":\\"${props.deployment.modelId}\\",\\"messages\\":[{\\"role\\":\\"user\\",\\"content\\":\\"Hello\\"}]}"`;

  return (
    <section className="content-panel glass-panel" style={{ padding: '18px', marginBottom: '16px' }}>
      <div className="panel-header" style={{ marginBottom: '14px' }}>
        <div className="panel-title">
          <Terminal size={18} />
          <h3>Access Local Model</h3>
        </div>
        <span className={`status-pill ${props.metrics?.healthy ? 'active' : ''}`}>
          {props.metrics?.healthy ? 'online' : 'checking'}
        </span>
      </div>

      <div style={{ display: 'grid', gap: '12px' }}>
        <div className="data-row" style={{ padding: '10px 0' }}>
          <span>Base URL</span>
          <strong style={{ fontFamily: 'monospace', color: 'var(--accent)', wordBreak: 'break-all' }}>{props.deployment.endpointUrl}</strong>
        </div>
        <div className="data-row" style={{ padding: '10px 0' }}>
          <span>Model</span>
          <strong>{props.deployment.modelId}</strong>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px' }}>
          <MetricCard label="Requests" value={formatMetric(props.metrics?.requestSuccessTotal)} />
          <MetricCard label="Running" value={formatMetric(props.metrics?.requestsRunning)} />
          <MetricCard label="Waiting" value={formatMetric(props.metrics?.requestsWaiting)} />
          <MetricCard label="Uptime" value={formatDuration(props.metrics?.uptimeSeconds)} />
        </div>
        <pre style={{ margin: 0, padding: '12px', overflowX: 'auto', borderRadius: '10px', background: 'rgba(0,0,0,0.24)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text)', fontSize: '0.75rem' }}>{curlExample}</pre>
        <button className="ghost-button" onClick={() => navigator.clipboard?.writeText(curlExample)} style={{ justifySelf: 'flex-start', fontSize: '0.8rem' }} type="button">
          <Copy size={14} />
          Copy curl
        </button>
      </div>
    </section>
  );
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
