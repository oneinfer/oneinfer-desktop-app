import type { FormEvent } from 'react';
import { LoaderCircle, Rocket, Server } from 'lucide-react';

import { Modal } from '../components/Common';
import type { CreateInstanceFormState, DashboardState } from '../types';
import { formatValue } from '../utils/format';

export function InstancesPage(props: {
  dashboard: DashboardState;
  instanceForm: CreateInstanceFormState;
  busy: string | null;
  showCreateInstanceModal: boolean;
  onFormChange: (next: CreateInstanceFormState) => void;
  onModalChange: (open: boolean) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onAction: (action: 'start-instance' | 'stop-instance' | 'restart-instance', instanceId: string, provider: string) => void;
  onDelete: (instanceId: string, provider: string) => void;
}) {
  return (
    <div className="flex flex-col">
      <header className="mb-0.5 flex h-8 shrink-0 items-center justify-between">
        <h2 className="m-0 text-lg font-semibold leading-none">Cloud Instances</h2>
        <button className="primary-button !h-7 !rounded-[0.625rem] !px-3 !py-0 !text-[0.8rem] !leading-none" onClick={() => props.onModalChange(true)} type="button">
          Create Instance
        </button>
      </header>

      <div className="glass-panel mb-5 mt-4 flex shrink-0 items-center rounded-[0.875rem] px-5 py-3 text-[0.9rem] text-[var(--muted)]">
        Loaded {Object.keys(props.dashboard.providerInfo).length} providers and {props.dashboard.gpuSpecs.length} GPU specs for instance setup.
      </div>

      <div className="glass-panel w-full overflow-hidden">
        {props.dashboard.instances.length === 0 ? (
          <div className="p-10 text-center">
            <p className="mb-5 text-base text-[var(--muted)]">No instances returned yet. Create a new instance to get started.</p>
            <button className="primary-button mx-auto" onClick={() => props.onModalChange(true)} type="button">
              Create Instance
            </button>
          </div>
        ) : (
          <div className="table-shell">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Name', 'Provider', 'Region', 'Status', 'GPU', 'Actions'].map((heading) => (
                    <th key={heading} className={`px-4 py-3 text-[0.7rem] uppercase tracking-[0.05em] text-[var(--muted)] ${heading === 'Actions' ? 'text-right' : 'text-left'}`}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {props.dashboard.instances.map((instance, index) => {
                  const instanceId = String(instance.instance_id ?? instance.unique_instance_id ?? instance.id ?? `instance-${index}`);
                  const provider = String(instance.provider_name ?? 'runpod');
                  const status = formatValue(instance.instance_status ?? instance.status);
                  return (
                    <tr key={instanceId} className="border-t border-white/[0.04]">
                      <td className="px-4 py-6 font-semibold">{String(instance.instance_name ?? instanceId)}</td>
                      <td className="px-4 py-6 text-[0.85rem]">{provider}</td>
                      <td className="px-4 py-6 text-[0.85rem]">{String(instance.region ?? 'unknown region')}</td>
                      <td className="px-4 py-6"><span className="status-pill active">{status}</span></td>
                      <td className="px-4 py-6 text-[0.85rem] text-[var(--muted)]">{formatValue(instance.gpu_name ?? instance.gpu_id)}</td>
                      <td className="px-4 py-6 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-2">
                          <button className="ghost-button !border-0 !bg-transparent !px-2 !py-1 !text-[0.8rem]" type="button" onClick={() => props.onAction('start-instance', instanceId, provider)}>Start</button>
                          <button className="ghost-button !border-0 !bg-transparent !px-2 !py-1 !text-[0.8rem]" type="button" onClick={() => props.onAction('stop-instance', instanceId, provider)}>Stop</button>
                          <button className="ghost-button !border-0 !bg-transparent !px-2 !py-1 !text-[0.8rem]" type="button" onClick={() => props.onAction('restart-instance', instanceId, provider)}>Restart</button>
                          <button className="ghost-button !border-0 !bg-transparent !px-2 !py-1 !text-[0.8rem] !text-[#818cf8]" type="button" onClick={() => props.onDelete(instanceId, provider)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal title="Create Instance" isOpen={props.showCreateInstanceModal} onClose={() => props.onModalChange(false)}>
        <form className="stack-form dense-grid" onSubmit={async (event) => { await props.onCreate(event); props.onModalChange(false); }}>
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
          <div className="mt-6 flex justify-end gap-3 full-span">
            <button className="secondary-button" type="button" onClick={() => props.onModalChange(false)}>Cancel</button>
            <button className="primary-button" type="submit" disabled={props.busy === 'create-instance'}>
              {props.busy === 'create-instance' ? <LoaderCircle className="spin" size="1rem" /> : <Rocket size="1rem" />}
              Create Instance
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
