import { useState, type FormEvent, type ReactNode } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, LoaderCircle, Rocket, Search, Server, Settings2, XCircle } from 'lucide-react';

import { DataList, MiniTable, Panel } from '../components/Common';
import type { ValidationResult } from '../helpers/hardwareValidation';
import type { DashboardState, HfModelInfo } from '../types';
import { getMachineGpuRows, getMachineSummaryEntries } from '../utils/format';

export interface SelfHostFormState {
  name: string;
  model_id: string;
  endpoint_url: string;
  useHfUrl: boolean;
  hfUrl: string;
}

export function SelfHostingPage(props: {
  dashboard: DashboardState;
  selfHostForm: SelfHostFormState;
  validationResult: ValidationResult | null;
  hfModelMetadata: HfModelInfo | null;
  hfModelMetadataLoading: boolean;
  hfModelMetadataError: string | null;
  libraries: { vllm: boolean; ollama: boolean };
  busy: string | null;
  analysisPanel: ReactNode;
  onFormChange: (next: SelfHostFormState) => void;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const canShowAnalysis = Boolean(props.hfModelMetadata);
  const selectedModelValue = props.selfHostForm.useHfUrl ? props.selfHostForm.hfUrl : props.selfHostForm.model_id;
  const hasModelInput = selectedModelValue.trim().length > 0;
  const isDeployable = props.validationResult?.status !== 'insufficient' && Boolean(props.hfModelMetadata) && props.libraries.vllm;
  const ctaLabel = props.busy === 'register-self-hosted'
    ? 'Deploying...'
    : props.hfModelMetadata
      ? 'Review & Deploy'
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
    const candidate = next.hfUrl ?? next.model_id ?? '';
    props.onFormChange({
      ...props.selfHostForm,
      ...next,
      name: props.selfHostForm.name || getRepoName(candidate),
    });
  }

  return (
    <div className="card-stack" style={{ gap: '16px' }}>
      <div className="section-grid two-col">
        <Panel title="Deploy a Local Model" icon={Rocket}>
          <form className="stack-form" onSubmit={props.onSubmit}>
            <div className="form-hint">
              Run a Hugging Face or catalog model on this machine with vLLM, then register the verified local endpoint with OneInfer.
            </div>

            <div className="cc-toggle" style={{ marginBottom: '8px' }}>
              <button className={`cc-toggle-btn ${props.selfHostForm.useHfUrl ? 'active' : ''}`} onClick={() => props.onFormChange({ ...props.selfHostForm, useHfUrl: true })} type="button" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                Hugging Face
              </button>
              <button className={`cc-toggle-btn ${!props.selfHostForm.useHfUrl ? 'active' : ''}`} onClick={() => props.onFormChange({ ...props.selfHostForm, useHfUrl: false })} type="button" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                OneInfer Catalog
              </button>
            </div>

            {!props.selfHostForm.useHfUrl ? (
              <label>
                <span>Model</span>
                <select value={props.selfHostForm.model_id} onChange={(event) => updateModel({ model_id: event.target.value })}>
                  <option value="">Select a model...</option>
                  {props.dashboard.models.map((model: any) => (
                    <option key={model.model_id || model.id} value={model.model_id || model.id}>
                      {model.model_name || model.displayName || model.model_id}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                <span>Model</span>
                <input value={props.selfHostForm.hfUrl} onChange={(event) => updateModel({ hfUrl: event.target.value })} placeholder="owner/model or Hugging Face URL" />
              </label>
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
              <label>
                <span>Local API URL</span>
                <input value={props.selfHostForm.endpoint_url} onChange={(event) => props.onFormChange({ ...props.selfHostForm, endpoint_url: event.target.value })} placeholder="http://127.0.0.1:8000/v1" />
              </label>
            ) : null}

            <DeployabilityChecklist
              hasModelInput={hasModelInput}
              metadataLoading={props.hfModelMetadataLoading}
              metadataReady={Boolean(props.hfModelMetadata)}
              metadataError={props.hfModelMetadataError}
              validationResult={props.validationResult}
              vllmInstalled={props.libraries.vllm}
            />

            <button
              className="primary-button"
              type="button"
              disabled={props.busy === 'register-self-hosted' || props.hfModelMetadataLoading || !props.hfModelMetadata}
              onClick={() => {
                if (canShowAnalysis) {
                  document.getElementById('self-hosting-analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
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
        <div id="self-hosting-analysis" className="glass-panel" style={{ overflow: 'hidden', minWidth: 0, maxWidth: '100%' }}>
          {props.analysisPanel}
        </div>
      ) : null}
    </div>
  );
}

function DeployabilityChecklist(props: {
  hasModelInput: boolean;
  metadataLoading: boolean;
  metadataReady: boolean;
  metadataError: string | null;
  validationResult: ValidationResult | null;
  vllmInstalled: boolean;
}) {
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
        label={props.validationResult ? props.validationResult.status === 'insufficient' ? 'Hardware not deployable' : 'Hardware can run this model' : 'Hardware check pending'}
        detail={props.validationResult?.message}
      />
      <ReadinessRow
        ok={props.vllmInstalled}
        label={props.vllmInstalled ? 'vLLM installed' : 'vLLM required'}
        detail={props.vllmInstalled ? 'Ready to launch an OpenAI-compatible local server.' : 'Install vLLM from the analysis panel before deployment.'}
      />
    </div>
  );
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
