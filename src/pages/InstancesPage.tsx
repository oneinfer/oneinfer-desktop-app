import { useEffect, type FormEvent } from 'react';
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
  onCreate: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  onAction: (action: 'start-instance' | 'stop-instance' | 'restart-instance', instanceId: string, provider: string) => void;
  onDelete: (instanceId: string, provider: string) => void;
}) {
  const providers = getProviderOptions(props.dashboard.providerInfo);
  const validProviderName = providers.some((provider) => provider.value === props.instanceForm.provider_name)
    ? props.instanceForm.provider_name
    : (providers[0]?.value ?? '');
  const effectiveProvider = getSelectedProviderData(props.dashboard.providerInfo, validProviderName);
  const providerImages = effectiveProvider.images;
  const providerGpus = effectiveProvider.instances;
  const selectedGpu = providerGpus.find((gpu) => gpu.gpu_id === props.instanceForm.gpu_id) ?? providerGpus[0];
  const regions = selectedGpu?.regions ?? [];
  const selectedImage = providerImages.find((image) => image.image_url === props.instanceForm.image_url) ?? providerImages[0];
  const availableGpuCounts = selectedGpu
    ? Array.from({ length: Math.max(selectedGpu.gpu_num, 1) }, (_, index) => index + 1)
    : [1];
  const gpuPricePerHour = selectedGpu?.pricePerHourUsd ?? 0;
  const diskPricePerHour = calculateDiskPricePerHour(props.instanceForm.disk_size);
  const totalPricePerHour = gpuPricePerHour + diskPricePerHour;

  useEffect(() => {
    if (!props.showCreateInstanceModal || providers.length === 0) {
      return;
    }

    const nextProviderName = validProviderName;
    const nextProvider = getSelectedProviderData(props.dashboard.providerInfo, nextProviderName);
    const nextGpu = nextProvider.instances.find((gpu) => gpu.gpu_id === props.instanceForm.gpu_id) ?? nextProvider.instances[0];
    const nextImage = nextProvider.images.find((image) => image.image_url === props.instanceForm.image_url) ?? nextProvider.images[0];
    const nextRegions = nextGpu?.regions ?? [];
    const nextRegion = nextRegions.includes(props.instanceForm.region) ? props.instanceForm.region : (nextRegions[0] ?? '');
    const nextGpuCount = nextGpu
      ? Math.min(Math.max(props.instanceForm.gpu_num, 1), Math.max(nextGpu.gpu_num, 1))
      : 1;
    const shouldReplaceStartupScript = !props.instanceForm.startup_script
      || (props.instanceForm.image_url !== (nextImage?.image_url ?? '') && !!nextImage?.start_command);
    const nextStartupScript = shouldReplaceStartupScript
      ? (nextImage?.start_command ?? props.instanceForm.startup_script)
      : props.instanceForm.startup_script;

    const nextForm: CreateInstanceFormState = {
      ...props.instanceForm,
      provider_name: nextProviderName,
      gpu_id: nextGpu?.gpu_id ?? '',
      gpu_num: nextGpuCount,
      region: nextRegion,
      image_url: nextImage?.image_url ?? '',
      startup_script: nextStartupScript,
    };

    if (!isSameInstanceForm(props.instanceForm, nextForm)) {
      props.onFormChange(nextForm);
    }
  }, [
    props.dashboard.providerInfo,
    props.instanceForm,
    props.onFormChange,
    props.showCreateInstanceModal,
    providers,
    validProviderName,
  ]);

  function openCreateModal() {
    props.onModalChange(true);
  }

  return (
    <div className="flex flex-col">
      <header className="mb-0.5 flex h-8 shrink-0 items-center justify-between">
        <h2 className="m-0 text-lg font-semibold leading-none">Cloud Instances</h2>
        <button className="primary-button !h-7 !rounded-[0.625rem] !px-3 !py-0 !text-[0.8rem] !leading-none" onClick={openCreateModal} type="button">
          Create Instance
        </button>
      </header>

      <div className="glass-panel mb-5 mt-4 flex shrink-0 items-center rounded-[0.875rem] px-5 py-3 text-[0.9rem] text-[var(--muted)]">
        Loaded {providers.length} providers and {props.dashboard.gpuSpecs.length} GPU specs for instance setup.
      </div>

      <div className="glass-panel w-full overflow-hidden">
        {props.dashboard.instances.length === 0 ? (
          <div className="p-10 text-center">
            <p className="mb-5 text-base text-[var(--muted)]">No instances returned yet. Create a new instance to get started.</p>
            <button className="primary-button mx-auto" onClick={openCreateModal} type="button">
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
                      <td className="px-4 py-6">
                        <span className={`status-pill ${
                          status.toLowerCase() === 'running' || status.toLowerCase() === 'active' || status.toLowerCase() === 'deploying' ? 'active' : ''
                        }`.trim()}>{status}</span>
                      </td>
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

      <Modal title={selectedGpu ? `Deploy ${selectedGpu.name} Instance` : 'Create Instance'} isOpen={props.showCreateInstanceModal} onClose={() => props.onModalChange(false)}>
        <form onSubmit={async (event) => { const ok = await props.onCreate(event); if (ok) props.onModalChange(false); }}>
          <p className="mb-6 text-center text-[0.95rem] text-[var(--muted)]">Fill in the details below to launch your instance.</p>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label>
                  <span>Provider</span>
                  <select
                    value={validProviderName}
                    disabled={providers.length === 0}
                    onChange={(event) => {
                      const nextProviderName = event.target.value;
                      const nextProvider = getSelectedProviderData(props.dashboard.providerInfo, nextProviderName);
                      const nextGpu = nextProvider.instances[0];
                      const nextImage = nextProvider.images[0];
                      props.onFormChange({
                        ...props.instanceForm,
                        provider_name: nextProviderName,
                        gpu_id: nextGpu?.gpu_id ?? '',
                        gpu_num: nextGpu?.gpu_num ?? 1,
                        region: nextGpu?.regions?.[0] ?? '',
                        image_url: nextImage?.image_url ?? '',
                        startup_script: nextImage?.start_command ?? '',
                      });
                    }}
                  >
                    {providers.length === 0 ? <option value="">Loading providers...</option> : null}
                    {providers.map((provider) => (
                      <option key={provider.value} value={provider.value}>{provider.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Instance Name</span>
                  <input value={props.instanceForm.instance_name} onChange={(event) => props.onFormChange({ ...props.instanceForm, instance_name: event.target.value })} placeholder="Instance name" />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label>
                  <span># of GPUs</span>
                  <select
                    value={props.instanceForm.gpu_num}
                    disabled={!selectedGpu}
                    onChange={(event) => props.onFormChange({ ...props.instanceForm, gpu_num: Number(event.target.value) })}
                  >
                    {availableGpuCounts.map((count) => (
                      <option key={count} value={count}>{count} {count === 1 ? 'GPU' : 'GPUs'}</option>
                    ))}
                  </select>
                  <div className="mt-2 text-xs text-[var(--muted)] opacity-80">Select number of GPUs to deploy.</div>
                </label>
                <label>
                  <span>Disk (GB)</span>
                  <input type="number" min={20} value={props.instanceForm.disk_size} onChange={(event) => props.onFormChange({ ...props.instanceForm, disk_size: Number(event.target.value) })} />
                  <div className="mt-2 text-xs text-[var(--muted)] opacity-80">Disk space per instance.</div>
                </label>
              </div>

              <label>
                <span>GPU</span>
                <select
                  value={props.instanceForm.gpu_id}
                  disabled={providerGpus.length === 0}
                  onChange={(event) => {
                    const nextGpu = providerGpus.find((gpu) => gpu.gpu_id === event.target.value);
                    props.onFormChange({
                      ...props.instanceForm,
                      gpu_id: event.target.value,
                      gpu_num: Math.min(props.instanceForm.gpu_num, Math.max(nextGpu?.gpu_num ?? 1, 1)),
                      region: nextGpu?.regions?.[0] ?? '',
                    });
                  }}
                >
                  <option value="" disabled>{providerGpus.length === 0 ? 'Loading GPUs...' : 'Select a GPU'}</option>
                  {providerGpus.map((gpu) => (
                    <option key={gpu.gpu_id} value={gpu.gpu_id}>{gpu.label}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Image</span>
                <select
                  value={selectedImage?.image_url ?? ''}
                  disabled={providerImages.length === 0}
                  onChange={(event) => {
                    const nextImage = providerImages.find((image) => image.image_url === event.target.value);
                    props.onFormChange({
                      ...props.instanceForm,
                      image_url: event.target.value,
                      startup_script: nextImage?.start_command ?? props.instanceForm.startup_script,
                    });
                  }}
                >
                  <option value="" disabled>{providerImages.length === 0 ? 'Loading images...' : 'Choose a container image...'}</option>
                  {providerImages.map((image) => (
                    <option key={`${image.name}-${image.image_url}`} value={image.image_url}>{image.name}</option>
                  ))}
                </select>
                <div className="mt-2 text-xs text-[var(--muted)] opacity-80">Image to initialize the instance.</div>
              </label>

              <label>
                <span>Region</span>
                <select value={props.instanceForm.region} onChange={(event) => props.onFormChange({ ...props.instanceForm, region: event.target.value })} disabled={regions.length === 0}>
                  {regions.length === 0 ? <option value="">Select a GPU first</option> : null}
                  {regions.map((region) => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
                <div className="mt-2 text-xs text-[var(--muted)] opacity-80">Select the deployment region.</div>
              </label>

              <label>
                <span>Start Script</span>
                <textarea rows={5} value={props.instanceForm.startup_script} onChange={(event) => props.onFormChange({ ...props.instanceForm, startup_script: event.target.value })} placeholder="Type your script here..." />
              </label>
            </div>

            <div className="rounded-[1rem] border border-white/[0.06] bg-white/[0.02] p-5">
              <h4 className="mb-5 text-[1.25rem] font-semibold">Summary</h4>

              <div className="mb-6">
                <div className="mb-3 text-[0.75rem] uppercase tracking-[0.08em] text-[var(--muted)]">Specs</div>
                <div className="grid grid-cols-2 gap-4 text-[0.95rem]">
                  <div>
                    <div className="text-[0.75rem] text-[var(--muted)]">GPU</div>
                    <div>{selectedGpu?.name ?? 'Not selected'}</div>
                  </div>
                  <div>
                    <div className="text-[0.75rem] text-[var(--muted)]"># of GPUs</div>
                    <div>{props.instanceForm.gpu_num}</div>
                  </div>
                  <div>
                    <div className="text-[0.75rem] text-[var(--muted)]">Disk</div>
                    <div>{props.instanceForm.disk_size} GB</div>
                  </div>
                  <div>
                    <div className="text-[0.75rem] text-[var(--muted)]">Region</div>
                    <div>{props.instanceForm.region || 'Not selected'}</div>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <div className="mb-3 text-[0.75rem] uppercase tracking-[0.08em] text-[var(--muted)]">Pricing</div>
                <div className="space-y-3 text-[0.95rem]">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--muted)]">GPU price</span>
                    <span>{formatUsd(gpuPricePerHour)}/hour</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--muted)]">Disk price</span>
                    <span>{formatUsd(diskPricePerHour)}/hour</span>
                  </div>
                  <div className="flex items-center justify-between font-semibold">
                    <span>Total price</span>
                    <span>{formatUsd(totalPricePerHour)}/hour</span>
                  </div>
                </div>
                <p className="mt-4 text-xs text-[var(--muted)]">Total cost is calculated from the selected GPU and disk size.</p>
              </div>

              <button className="primary-button w-full justify-center" type="submit" disabled={props.busy === 'create-instance' || !validProviderName || !props.instanceForm.gpu_id || !props.instanceForm.region || !props.instanceForm.image_url}>
                {props.busy === 'create-instance' ? <LoaderCircle className="spin" size="1rem" /> : <Rocket size="1rem" />}
                Deploy Instance
              </button>
              <p className="mt-3 text-center text-xs text-[var(--muted)]">By clicking Deploy, you agree to pay for the resources used.</p>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}

type ProviderImageOption = {
  name: string;
  image_url: string;
  start_command: string;
};

type ProviderGpuOption = {
  gpu_id: string;
  gpu_num: number;
  name: string;
  label: string;
  regions: string[];
  pricePerHourUsd: number;
};

function getProviderOptions(providerInfo: DashboardState['providerInfo']) {
  return Object.keys(providerInfo).map((key) => ({
    value: key,
    label: key.replace(/_/g, ' '),
  }));
}

function getSelectedProviderData(providerInfo: DashboardState['providerInfo'], providerName: string): {
  images: ProviderImageOption[];
  instances: ProviderGpuOption[];
} {
  const rawProvider = providerInfo[providerName] as Record<string, unknown> | undefined;
  const rawImages = Array.isArray(rawProvider?.images) ? rawProvider.images as Array<Record<string, unknown>> : [];
  const rawInstances = Array.isArray(rawProvider?.instances) ? rawProvider.instances as Array<Record<string, unknown>> : [];

  const images = rawImages
    .filter((image) => typeof image.image_url === 'string' && image.image_url.trim() !== '')
    .map((image) => ({
      name: String(image.name ?? image.image_url ?? 'Image'),
      image_url: String(image.image_url),
      start_command: typeof image.start_command === 'string' ? image.start_command : '',
    }));

  const instances = rawInstances
    .filter((instance) => typeof instance.gpu_id === 'string' && instance.gpu_id.trim() !== '')
    .map((instance) => {
      const gpu = typeof instance.gpu === 'object' && instance.gpu ? instance.gpu as Record<string, unknown> : {};
      const cpu = typeof instance.cpu === 'object' && instance.cpu ? instance.cpu as Record<string, unknown> : {};
      const regions = Array.isArray(instance.regions) ? instance.regions.filter((region): region is string => typeof region === 'string') : [];
      const gpuNum = typeof gpu.number_of_gpus === 'number' ? gpu.number_of_gpus : 1;
      const cpuCores = typeof cpu.number_of_cores === 'number' ? cpu.number_of_cores : null;
      const price = typeof instance.price_per_hour === 'number' ? instance.price_per_hour : null;

      return {
        gpu_id: String(instance.gpu_id),
        gpu_num: gpuNum,
        name: String(instance.name ?? instance.instance_name ?? 'GPU'),
        regions,
        pricePerHourUsd: price !== null ? price / 100 : 0,
        label: [
          String(instance.name ?? instance.instance_name ?? 'GPU'),
          `${gpuNum} GPU`,
          cpuCores ? `${cpuCores} vCPU` : null,
          price !== null ? `$${(price / 100).toFixed(2)}/hr` : null,
        ].filter(Boolean).join(' | '),
      };
    });

  return { images, instances };
}

function calculateDiskPricePerHour(diskSize: number) {
  const monthlyRatePerGb = 0.15;
  return (Math.max(diskSize, 0) * monthlyRatePerGb) / (30 * 24);
}

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function isSameInstanceForm(left: CreateInstanceFormState, right: CreateInstanceFormState) {
  return left.provider_name === right.provider_name
    && left.instance_name === right.instance_name
    && left.gpu_id === right.gpu_id
    && left.gpu_num === right.gpu_num
    && left.disk_size === right.disk_size
    && left.image_url === right.image_url
    && left.region === right.region
    && left.startup_script === right.startup_script;
}
