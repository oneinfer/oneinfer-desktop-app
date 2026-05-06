import type { FormEvent } from 'react';
import { LoaderCircle, Rocket, Server } from 'lucide-react';

import { EmptyState, Panel } from '../components/Common';
import type { CreateInstanceFormState, DashboardState } from '../types';
import { formatValue } from '../utils/format';

export function InstancesPage(props: {
  dashboard: DashboardState;
  instanceForm: CreateInstanceFormState;
  busy: string | null;
  onFormChange: (next: CreateInstanceFormState) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onAction: (action: 'start-instance' | 'stop-instance' | 'restart-instance', instanceId: string, provider: string) => void;
  onDelete: (instanceId: string, provider: string) => void;
}) {
  return (
    <div className="section-grid two-col">
      <Panel title="Create Instance" icon={Rocket}>
        <form className="stack-form dense-grid" onSubmit={props.onCreate}>
          <div className="form-hint full-span">
            Loaded {Object.keys(props.dashboard.providerInfo).length} providers and {props.dashboard.gpuSpecs.length} GPU specs for instance setup.
          </div>
          <label>
            <span>Provider</span>
            <select value={props.instanceForm.provider_name} onChange={(event) => props.onFormChange({ ...props.instanceForm, provider_name: event.target.value })}>
              <option value="runpod">runpod</option>
              <option value="vultr">vultr</option>
              <option value="novita">novita</option>
              <option value="verda">verda</option>
              <option value="vastai">vastai</option>
            </select>
          </label>
          <label>
            <span>Instance Name</span>
            <input value={props.instanceForm.instance_name} onChange={(event) => props.onFormChange({ ...props.instanceForm, instance_name: event.target.value })} />
          </label>
          <label>
            <span>GPU ID</span>
            <input value={props.instanceForm.gpu_id} onChange={(event) => props.onFormChange({ ...props.instanceForm, gpu_id: event.target.value })} placeholder="Optional provider GPU id" />
          </label>
          <label>
            <span>GPU Count</span>
            <input type="number" min={1} value={props.instanceForm.gpu_num} onChange={(event) => props.onFormChange({ ...props.instanceForm, gpu_num: Number(event.target.value) })} />
          </label>
          <label>
            <span>Disk Size</span>
            <input type="number" min={20} value={props.instanceForm.disk_size} onChange={(event) => props.onFormChange({ ...props.instanceForm, disk_size: Number(event.target.value) })} />
          </label>
          <label>
            <span>Region</span>
            <input value={props.instanceForm.region} onChange={(event) => props.onFormChange({ ...props.instanceForm, region: event.target.value })} />
          </label>
          <label className="full-span">
            <span>Image URL</span>
            <input value={props.instanceForm.image_url} onChange={(event) => props.onFormChange({ ...props.instanceForm, image_url: event.target.value })} />
          </label>
          <label className="full-span">
            <span>Startup Script</span>
            <textarea rows={5} value={props.instanceForm.startup_script} onChange={(event) => props.onFormChange({ ...props.instanceForm, startup_script: event.target.value })} />
          </label>
          <button className="primary-button full-span" type="submit" disabled={props.busy === 'create-instance'}>
            {props.busy === 'create-instance' ? <LoaderCircle className="spin" size={16} /> : <Rocket size={16} />}
            Create Instance
          </button>
        </form>
      </Panel>

      <Panel title="Live Instances" icon={Server}>
        <div className="instance-list">
          {props.dashboard.instances.length === 0 ? <EmptyState text="No instances returned yet." /> : null}
          {props.dashboard.instances.map((instance, index) => {
            const instanceId = String(instance.instance_id ?? instance.unique_instance_id ?? instance.id ?? `instance-${index}`);
            const provider = String(instance.provider_name ?? 'runpod');
            return (
              <div className="instance-card" key={instanceId}>
                <div>
                  <h4>{String(instance.instance_name ?? instanceId)}</h4>
                  <p>{provider} - {String(instance.region ?? 'unknown region')}</p>
                </div>
                <div className="pill-row">
                  <span className="status-pill">{formatValue(instance.instance_status ?? instance.status)}</span>
                  <span className="status-pill soft">{formatValue(instance.gpu_name ?? instance.gpu_id)}</span>
                </div>
                <div className="action-row">
                  <button className="ghost-button" type="button" onClick={() => props.onAction('start-instance', instanceId, provider)}>Start</button>
                  <button className="ghost-button" type="button" onClick={() => props.onAction('stop-instance', instanceId, provider)}>Stop</button>
                  <button className="ghost-button" type="button" onClick={() => props.onAction('restart-instance', instanceId, provider)}>Restart</button>
                  <button className="danger-button" type="button" onClick={() => props.onDelete(instanceId, provider)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
