import { Blocks, Bot, Server, ShieldCheck, Zap } from 'lucide-react';

import { EmptyState, MiniTable, Panel } from '../components/Common';
import { HardwareWidget } from '../components/HardwareWidget';
import { ClaudeCodeSetupPanel, OpenClawSetupPanel, OpenCodeSetupPanel } from '../components/SetupPanels';
import type { DashboardState, SectionKey } from '../types';
import { formatValue, getBalance } from '../utils/format';

export function OverviewPage(props: {
  dashboard: DashboardState;
  busy: string | null;
  infraTab: 'self-hosted' | 'cloud';
  overviewTab: 'claude-code' | 'opencode' | 'openclaw';
  claudeCodeProvider: 'oneinfer' | 'anthropic';
  onInfraTabChange: (tab: 'self-hosted' | 'cloud') => void;
  onOverviewTabChange: (tab: 'claude-code' | 'opencode' | 'openclaw') => void;
  onClaudeProviderChange: (provider: 'oneinfer' | 'anthropic') => void;
  onEnableOpenCode: () => void;
  onEnableOpenClaw: () => void;
  onSectionChange: (section: SectionKey) => void;
}) {
  const localEndpoints = props.dashboard.inferenceEndpoints.filter((endpoint) => String(endpoint.deployment_target).toLowerCase() === 'local');

  return (
    <>
      <div className="settings-layout">
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
                <MiniTable columns={['name', 'model_id', 'endpoint_url', 'status']} rows={localEndpoints} emptyText="No local models registered." />
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
            {props.overviewTab === 'openclaw' ? <OpenClawSetupPanel busy={props.busy} onEnable={props.onEnableOpenClaw} /> : null}
          </div>
        </main>
      </div>

      <div className="section-grid dashboard-row compact-row" style={{ gridTemplateColumns: '3fr 1fr', marginTop: '20px' }}>
        <HardwareWidget machine={props.dashboard.machineDetails} />
        <Panel title="Credits" icon={ShieldCheck}>
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
