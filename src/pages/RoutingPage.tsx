import type { FormEvent } from 'react';
import { Blocks, LoaderCircle, Orbit, Rocket } from 'lucide-react';

import { MiniTable, Panel } from '../components/Common';
import type { CreateInferenceFormState, DashboardState } from '../types';

export function RoutingPage(props: {
  dashboard: DashboardState;
  intelligentEndpointName: string;
  inferenceForm: CreateInferenceFormState;
  attachForm: { intelligentEndpointId: string; endpointType: string; endpointId: string };
  busy: string | null;
  onIntelligentEndpointNameChange: (value: string) => void;
  onInferenceFormChange: (next: CreateInferenceFormState) => void;
  onAttachFormChange: (next: { intelligentEndpointId: string; endpointType: string; endpointId: string }) => void;
  onCreateIntelligentEndpoint: (event: FormEvent<HTMLFormElement>) => void;
  onCreateInferenceEndpoint: (event: FormEvent<HTMLFormElement>) => void;
  onAttachEndpoint: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="section-grid two-col">
      <Panel title="Create Intelligent Endpoint" icon={Orbit}>
        <form className="stack-form" onSubmit={props.onCreateIntelligentEndpoint}>
          <label>
            <span>Name</span>
            <input value={props.intelligentEndpointName} onChange={(event) => props.onIntelligentEndpointNameChange(event.target.value)} placeholder="Primary intelligent router" />
          </label>
          <button className="primary-button" type="submit" disabled={props.busy === 'create-intelligent-endpoint'}>
            {props.busy === 'create-intelligent-endpoint' ? <LoaderCircle className="spin" size={16} /> : <Orbit size={16} />}
            Create Intelligent Endpoint
          </button>
        </form>
      </Panel>

      <Panel title="Create Inference API Endpoint" icon={Rocket}>
        <form className="stack-form dense-grid" onSubmit={props.onCreateInferenceEndpoint}>
          <label className="full-span">
            <span>Name</span>
            <input value={props.inferenceForm.name} onChange={(event) => props.onInferenceFormChange({ ...props.inferenceForm, name: event.target.value })} placeholder="Primary local vLLM" />
          </label>
          <label>
            <span>Deployment Target</span>
            <select value={props.inferenceForm.deployment_target} onChange={(event) => props.onInferenceFormChange({ ...props.inferenceForm, deployment_target: event.target.value as 'cloud' | 'local' })}>
              <option value="cloud">cloud</option>
              <option value="local">local</option>
            </select>
          </label>
          <label>
            <span>Provider</span>
            <select value={props.inferenceForm.provider} onChange={(event) => props.onInferenceFormChange({ ...props.inferenceForm, provider: event.target.value })}>
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
            <input value={props.inferenceForm.model_id} onChange={(event) => props.onInferenceFormChange({ ...props.inferenceForm, model_id: event.target.value })} placeholder={props.inferenceForm.deployment_target === 'local' ? 'Model served by the local runtime' : 'Model id from the catalog'} />
          </label>
          {props.inferenceForm.deployment_target === 'local' ? (
            <>
              <label className="full-span">
                <span>Local Endpoint URL</span>
                <input value={props.inferenceForm.endpoint_url} onChange={(event) => props.onInferenceFormChange({ ...props.inferenceForm, endpoint_url: event.target.value })} placeholder="https://api.oneinfer.ai/v1" />
              </label>
              <label>
                <span>Machine ID</span>
                <input value={props.inferenceForm.machine_id} onChange={(event) => props.onInferenceFormChange({ ...props.inferenceForm, machine_id: event.target.value })} placeholder={typeof props.dashboard.machineDetails?.machineId === 'string' ? props.dashboard.machineDetails.machineId : 'Detected machine id'} />
              </label>
              <label>
                <span>Machine Name</span>
                <input value={props.inferenceForm.machine_name} onChange={(event) => props.onInferenceFormChange({ ...props.inferenceForm, machine_name: event.target.value })} placeholder={typeof props.dashboard.machineDetails?.machineName === 'string' ? props.dashboard.machineDetails.machineName : 'Detected machine name'} />
              </label>
            </>
          ) : null}
          <label>
            <span>Top P</span>
            <input type="number" step="0.1" value={props.inferenceForm.top_p} onChange={(event) => props.onInferenceFormChange({ ...props.inferenceForm, top_p: Number(event.target.value) })} />
          </label>
          <label>
            <span>Temperature</span>
            <input type="number" step="0.1" value={props.inferenceForm.temperature} onChange={(event) => props.onInferenceFormChange({ ...props.inferenceForm, temperature: Number(event.target.value) })} />
          </label>
          <label className="full-span">
            <span>Max Tokens</span>
            <input type="number" value={props.inferenceForm.max_tokens} onChange={(event) => props.onInferenceFormChange({ ...props.inferenceForm, max_tokens: Number(event.target.value) })} />
          </label>
          <button className="primary-button full-span" type="submit" disabled={props.busy === 'create-inference-endpoint'}>
            {props.busy === 'create-inference-endpoint' ? <LoaderCircle className="spin" size={16} /> : <Rocket size={16} />}
            Create Inference API Endpoint
          </button>
        </form>
      </Panel>

      <Panel title="Attach Endpoint" icon={Blocks}>
        <form className="stack-form" onSubmit={props.onAttachEndpoint}>
          <label>
            <span>Intelligent Endpoint ID</span>
            <input value={props.attachForm.intelligentEndpointId} onChange={(event) => props.onAttachFormChange({ ...props.attachForm, intelligentEndpointId: event.target.value })} />
          </label>
          <label>
            <span>Endpoint Type</span>
            <select value={props.attachForm.endpointType} onChange={(event) => props.onAttachFormChange({ ...props.attachForm, endpointType: event.target.value })}>
              <option value="inference_api">inference_api</option>
              <option value="dedicated">dedicated</option>
            </select>
          </label>
          <label>
            <span>Endpoint ID</span>
            <input value={props.attachForm.endpointId} onChange={(event) => props.onAttachFormChange({ ...props.attachForm, endpointId: event.target.value })} />
          </label>
          <button className="primary-button" type="submit" disabled={props.busy === 'attach-endpoint'}>
            {props.busy === 'attach-endpoint' ? <LoaderCircle className="spin" size={16} /> : <Blocks size={16} />}
            Attach
          </button>
        </form>
      </Panel>

      <Panel title="Endpoint Inventory" icon={Orbit}>
        <div className="routing-columns">
          <div>
            <h4>Intelligent Endpoints</h4>
            <MiniTable columns={['name', 'intelligent_endpoint_id', 'status']} rows={props.dashboard.intelligentEndpoints} emptyText="No intelligent endpoints." />
          </div>
          <div>
            <h4>Inference Endpoints</h4>
            <MiniTable columns={['name', 'deployment_target', 'model_id', 'endpoint_url']} rows={props.dashboard.inferenceEndpoints} emptyText="No inference endpoints." />
          </div>
        </div>
      </Panel>
    </div>
  );
}
