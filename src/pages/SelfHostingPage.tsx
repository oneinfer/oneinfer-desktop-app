import type { FormEvent } from 'react';
import { LoaderCircle, Rocket, Search, Server, Sparkles } from 'lucide-react';

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
  busy: string | null;
  onFormChange: (next: SelfHostFormState) => void;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void;
  onOpenModelModal: () => void;
}) {
  return (
    <div className="section-grid two-col">
      <Panel title="Local Hardware" icon={Server}>
        <DataList entries={getMachineSummaryEntries(props.dashboard.machineDetails)} emptyText="Machine profile not synced yet." />
        <MiniTable columns={['name', 'vendor', 'vram', 'utilization', 'driver']} rows={getMachineGpuRows(props.dashboard.machineDetails)} emptyText="No local GPU detected." />
      </Panel>

      <Panel title="Register Local Inference Server" icon={Rocket}>
        <form className="stack-form" onSubmit={props.onSubmit}>
          <div className="form-hint">
            Register this machine as a local inference provider. Start your inference server (e.g. vLLM, Ollama) before registering.
          </div>
          <label>
            <span>Name</span>
            <input value={props.selfHostForm.name} onChange={(event) => props.onFormChange({ ...props.selfHostForm, name: event.target.value })} placeholder="Local vLLM server" />
          </label>

          <div className="cc-toggle" style={{ marginBottom: '8px' }}>
            <button className={`cc-toggle-btn ${!props.selfHostForm.useHfUrl ? 'active' : ''}`} onClick={() => props.onFormChange({ ...props.selfHostForm, useHfUrl: false })} type="button" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
              Select Model
            </button>
            <button className={`cc-toggle-btn ${props.selfHostForm.useHfUrl ? 'active' : ''}`} onClick={() => props.onFormChange({ ...props.selfHostForm, useHfUrl: true })} type="button" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
              Hugging Face URL
            </button>
          </div>

          {!props.selfHostForm.useHfUrl ? (
            <label>
              <span>Select Model</span>
              <select value={props.selfHostForm.model_id} onChange={(event) => props.onFormChange({ ...props.selfHostForm, model_id: event.target.value })}>
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
              <span>Hugging Face URL</span>
              <input value={props.selfHostForm.hfUrl} onChange={(event) => props.onFormChange({ ...props.selfHostForm, hfUrl: event.target.value })} placeholder="https://huggingface.co/meta-llama/Meta-Llama-3-8B" />
            </label>
          )}

          {props.validationResult ? (
            <div className={`banner ${props.validationResult.status === 'insufficient' ? 'error' : props.validationResult.status === 'warning' ? 'info' : 'success'}`} style={{ fontSize: '0.85rem', padding: '10px 14px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <Sparkles size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{props.validationResult.message}</span>
              </div>
            </div>
          ) : null}

          <button
            className="primary-button"
            type={props.hfModelMetadata ? 'button' : 'submit'}
            disabled={props.busy === 'register-self-hosted'}
            onClick={props.hfModelMetadata ? props.onOpenModelModal : undefined}
          >
            {props.busy === 'register-self-hosted' ? <LoaderCircle className="spin" size={16} /> : props.hfModelMetadata ? <Search size={16} /> : <Rocket size={16} />}
            {props.hfModelMetadata ? 'View Analysis & Compatibility' : 'Register Endpoint'}
          </button>
        </form>
      </Panel>
    </div>
  );
}
