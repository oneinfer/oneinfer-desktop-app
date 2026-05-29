import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ChevronRight, Copy, LoaderCircle, Orbit, PlayCircle, Rocket, Server, SlidersHorizontal } from 'lucide-react';

import { getHfModelInfo } from '../api';
import { Modal } from '../components/Common';
import type { EndpointUsageTarget } from '../components/EndpointUsageModal';
import type { CreateInstanceFormState, DashboardState, EndpointItem, HfModelInfo, InstanceItem, ServingLibrary } from '../types';
import { formatValue } from '../utils/format';

const cloudServingLibraryOptions: Array<{ value: ServingLibrary; label: string }> = [
  { value: 'vllm', label: 'vLLM' },
  { value: 'sglang', label: 'SGLang' },
  { value: 'tensorrt', label: 'TensorRT-LLM' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'llama_cpp', label: 'llama.cpp' },
  { value: 'pytorch', label: 'PyTorch' },
  { value: 'transformers', label: 'Transformers' },
  { value: 'dynamo', label: 'Dynamo' },
];

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
  onUseEndpointInRoute: (endpointId: string, endpointName: string) => void;
  onShowUsage: (target: EndpointUsageTarget) => void;
}) {
  const [detailsGpu, setDetailsGpu] = useState<GpuCardOption | null>(null);
  const [hfAccessCheck, setHfAccessCheck] = useState<HfAccessCheckState>({ status: 'idle' });
  const [hfModelMetadata, setHfModelMetadata] = useState<HfModelInfo | null>(null);
  const [hfModelMetadataLoading, setHfModelMetadataLoading] = useState(false);
  const [hfModelMetadataError, setHfModelMetadataError] = useState<string | null>(null);
  const [providerGpuFilter, setProviderGpuFilter] = useState<GpuProviderFilter | null>(null);
  const [gpuSort, setGpuSort] = useState<GpuSortOption>('most-wanted');
  const allProviders = useMemo(() => getProviderOptions(props.dashboard.providerInfo), [props.dashboard.providerInfo]);
  const providers = useMemo(
    () => providerGpuFilter
      ? allProviders.filter((provider) => providerHasMatchingGpu(props.dashboard.providerInfo, provider.value, providerGpuFilter))
      : allProviders,
    [allProviders, props.dashboard.providerInfo, providerGpuFilter],
  );
  const validProviderName = providers.some((provider) => provider.value === props.instanceForm.provider_name)
    ? props.instanceForm.provider_name
    : (providers[0]?.value ?? '');
  const effectiveProvider = getSelectedProviderData(props.dashboard.providerInfo, validProviderName);
  const allProviderImages = effectiveProvider.images;
  const providerImages = getImagesForServingLibrary(allProviderImages, props.instanceForm.serving_library);
  const providerGpus = providerGpuFilter
    ? effectiveProvider.instances.filter((gpu) => isProviderGpuMatch(gpu, providerGpuFilter))
    : effectiveProvider.instances;
  const selectedGpu = providerGpus.find((gpu) => gpu.gpu_id === props.instanceForm.gpu_id) ?? providerGpus[0];
  const regions = selectedGpu?.regions ?? [];
  const selectedImage = providerImages.find((image) => image.image_url === props.instanceForm.image_url) ?? providerImages[0];
  const availableGpuCounts = selectedGpu
    ? Array.from({ length: Math.max(selectedGpu.gpu_num, 1) }, (_, index) => index + 1)
    : [1];
  const gpuPricePerHour = selectedGpu?.pricePerHourUsd ?? 0;
  const diskPricePerHour = calculateDiskPricePerHour(props.instanceForm.disk_size);
  const totalPricePerHour = gpuPricePerHour + diskPricePerHour;
  const cloudEndpoints = getCloudEndpointRows(props.dashboard.inferenceEndpoints, props.dashboard.instances);
  const gpuCards = useMemo(
    () => sortGpuCards(getGpuCardOptions(props.dashboard.providerInfo, props.dashboard.gpuSpecs), gpuSort),
    [props.dashboard.providerInfo, props.dashboard.gpuSpecs, gpuSort],
  );
  const modelOptions = getModelOptions(props.dashboard.models);
  const selectedModel = modelOptions.find((model) => model.value === props.instanceForm.model_id);
  const selectedModelLabel = props.instanceForm.model_source === 'huggingface'
    ? (props.instanceForm.hf_model_url || 'Not selected')
    : (selectedModel?.label ?? 'Not selected');
  const shouldShowHfTokenInput = props.instanceForm.model_source === 'huggingface'
    && hfAccessCheck.status === 'requires-token';


  useEffect(() => {
    if (!props.showCreateInstanceModal || providers.length === 0) {
      return;
    }

    const nextProviderName = validProviderName;
    const nextProvider = getSelectedProviderData(props.dashboard.providerInfo, nextProviderName);
    const nextProviderGpus = providerGpuFilter
      ? nextProvider.instances.filter((gpu) => isProviderGpuMatch(gpu, providerGpuFilter))
      : nextProvider.instances;
    const nextGpu = nextProviderGpus.find((gpu) => gpu.gpu_id === props.instanceForm.gpu_id) ?? nextProviderGpus[0];
    const nextImages = getImagesForServingLibrary(nextProvider.images, props.instanceForm.serving_library);
    const nextImage = nextImages.find((image) => image.image_url === props.instanceForm.image_url) ?? nextImages[0];
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
    providerGpuFilter,
    validProviderName,
  ]);

  useEffect(() => {
    if (!props.showCreateInstanceModal || props.instanceForm.model_source !== 'huggingface') {
      setHfAccessCheck({ status: 'idle' });
      setHfModelMetadata(null);
      setHfModelMetadataLoading(false);
      setHfModelMetadataError(null);
      return;
    }

    const rawValue = props.instanceForm.hf_model_url.trim();
    if (!rawValue) {
      setHfAccessCheck({ status: 'idle' });
      setHfModelMetadata(null);
      setHfModelMetadataLoading(false);
      setHfModelMetadataError(null);
      return;
    }

    const repoId = normalizeHfRepoId(rawValue);
    if (!repoId) {
      setHfAccessCheck({ status: 'invalid', message: 'Enter a valid Hugging Face URL or owner/model id.' });
      setHfModelMetadata(null);
      setHfModelMetadataLoading(false);
      setHfModelMetadataError(null);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setHfAccessCheck({ status: 'checking', repoId });
      setHfModelMetadataLoading(true);
      setHfModelMetadataError(null);
      try {
        const result = await checkHfModelAccess(repoId, controller.signal);
        setHfAccessCheck(result);
        if (result.status === 'requires-token' && !props.instanceForm.hf_access_token.trim()) {
          setHfModelMetadata(null);
          setHfModelMetadataError(result.message ?? 'This model requires a Hugging Face token.');
          return;
        }

        const metadata = await getHfModelInfo(repoId, props.instanceForm.hf_access_token) as HfModelInfo;
        if (!controller.signal.aborted) {
          setHfModelMetadata(metadata);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setHfModelMetadata(null);
        setHfModelMetadataError(error instanceof Error ? error.message : 'Unable to fetch Hugging Face model metadata.');
        setHfAccessCheck({
          status: 'error',
          repoId,
          message: 'Unable to check Hugging Face model access.',
        });
      } finally {
        if (!controller.signal.aborted) {
          setHfModelMetadataLoading(false);
        }
      }
    }, 500);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [
    props.instanceForm.hf_access_token,
    props.instanceForm.hf_model_url,
    props.instanceForm.model_source,
    props.showCreateInstanceModal,
  ]);

  function openCreateModal() {
    setProviderGpuFilter(null);
    props.onModalChange(true);
  }

  function openCreateModalForGpu(gpu: GpuCardOption) {
    const provider = getSelectedProviderData(props.dashboard.providerInfo, gpu.providerName);
    const nextFilter = createGpuProviderFilter(gpu);
    const availableProviders = allProviders.filter((providerOption) => providerHasMatchingGpu(props.dashboard.providerInfo, providerOption.value, nextFilter));
    const nextProviderName = availableProviders.some((providerOption) => providerOption.value === gpu.providerName)
      ? gpu.providerName
      : (availableProviders[0]?.value ?? gpu.providerName);
    const nextProvider = getSelectedProviderData(props.dashboard.providerInfo, nextProviderName);
    const matchingGpu = findMatchingProviderGpu(nextProvider.instances, nextFilter) ?? provider.instances.find((instance) => instance.gpu_id === gpu.gpuId) ?? provider.instances[0];
    const image = getImagesForServingLibrary(nextProvider.images, props.instanceForm.serving_library)[0];

    setProviderGpuFilter(nextFilter);
    props.onFormChange({
      ...props.instanceForm,
      provider_name: nextProviderName,
      gpu_id: matchingGpu?.gpu_id ?? gpu.gpuId,
      gpu_num: Math.max(Math.min(props.instanceForm.gpu_num || 1, matchingGpu?.gpu_num ?? 1), 1),
      region: matchingGpu?.regions?.[0] ?? '',
      image_url: image?.image_url ?? props.instanceForm.image_url,
      startup_script: image?.start_command ?? props.instanceForm.startup_script,
    });
    props.onModalChange(true);
  }

  return (
    <div className="flex flex-col">
      <header className="mb-5 flex shrink-0 items-start justify-between gap-4">
        <div>
          <h2 className="m-0 text-lg font-semibold leading-none">Cloud Model Hosting</h2>
          <p className="mt-2 max-w-3xl text-[0.85rem] leading-relaxed text-[var(--muted)]">
            Deploy catalog or Hugging Face models on cloud GPUs. OneInfer provisions the instance, starts the serving runtime, and registers the endpoint for routing.
          </p>
        </div>
        <button className="primary-button !h-7 !rounded-[0.625rem] !px-3 !py-0 !text-[0.8rem] !leading-none" onClick={openCreateModal} type="button">
          Deploy Model
        </button>
      </header>

      <div className="gpu-market-toolbar">
        <div className="gpu-market-count">{gpuCards.length} GPU{gpuCards.length === 1 ? '' : 's'} available</div>
        <label className="gpu-sort-control">
          <SlidersHorizontal size={15} />
          <span>Sort</span>
          <select value={gpuSort} onChange={(event) => setGpuSort(event.target.value as GpuSortOption)}>
            <option value="most-wanted">Most wanted</option>
            <option value="price-low">Price: low to high</option>
            <option value="price-high">Price: high to low</option>
            <option value="vram-high">VRAM: high to low</option>
            <option value="availability">Most regions</option>
            <option value="newest">Newest GPUs</option>
          </select>
        </label>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {gpuCards.length === 0 ? (
          <div className="glass-panel col-span-full p-6 text-[0.95rem] text-[var(--muted)]">No GPUs found.</div>
        ) : null}
        {gpuCards.map((gpu) => (
          <GpuMarketplaceCard
            gpu={gpu}
            key={gpu.cardId}
            onCreate={openCreateModalForGpu}
            onDetails={setDetailsGpu}
          />
        ))}
      </div>

      <div className="glass-panel mt-5 p-5">
        <div className="panel-header" style={{ marginBottom: '12px' }}>
          <div className="panel-title">
            <Server size={18} />
            <div>
              <h3>Cloud Endpoints</h3>
              <p className="cloud-endpoint-description">List of registered cloud model endpoints from GPU deployments. Use these endpoints as routing targets once the model server is ready.</p>
            </div>
          </div>
          <span className="status-pill soft">{cloudEndpoints.length} registered</span>
        </div>
        <div className="cloud-endpoint-list">
          {cloudEndpoints.length === 0 ? (
            <div className="empty-state">No cloud inference endpoints registered yet.</div>
          ) : null}
          {cloudEndpoints.map((endpoint) => (
            <CloudEndpointCard
              endpoint={endpoint}
              key={endpoint.endpointId}
              onUseEndpointInRoute={props.onUseEndpointInRoute}
              onShowUsage={props.onShowUsage}
            />
          ))}
        </div>
      </div>

      <Modal title={selectedGpu ? `Deploy Model on ${formatGpuDisplayName(selectedGpu.name)}` : 'Deploy Cloud Model'} isOpen={props.showCreateInstanceModal} onClose={() => props.onModalChange(false)}>
        <form className="cloud-deploy-form" onSubmit={async (event) => { const ok = await props.onCreate(event); if (ok) props.onModalChange(false); }}>
          <p className="mb-6 text-center text-[0.95rem] text-[var(--muted)]">Select a model and GPU to instantly deploy your dedicated cloud endpoint.</p>
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
                      const nextProviderGpus = providerGpuFilter
                        ? nextProvider.instances.filter((gpu) => isProviderGpuMatch(gpu, providerGpuFilter))
                        : nextProvider.instances;
                      const nextGpu = nextProviderGpus[0];
                      const nextImage = getImagesForServingLibrary(nextProvider.images, props.instanceForm.serving_library)[0];
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
                    {providers.length === 0 ? <option value="">{providerGpuFilter ? 'No providers for selected GPU' : 'Loading providers...'}</option> : null}
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
                <div className="cloud-model-panel full-span">
                  <label className="cloud-model-field">
                    <span>Model Source</span>
                    <select
                      value={props.instanceForm.model_source}
                      onChange={(event) => props.onFormChange({ ...props.instanceForm, model_source: event.target.value as CreateInstanceFormState['model_source'] })}
                    >
                      <option value="catalog">OneInfer Catalog</option>
                      <option value="huggingface">Hugging Face URL</option>
                    </select>
                  </label>
                  <label className="cloud-model-field">
                    <span>{props.instanceForm.model_source === 'catalog' ? 'Catalog Model' : 'Hugging Face Model'}</span>
                    {props.instanceForm.model_source === 'catalog' ? (
                      <select
                        value={props.instanceForm.model_id}
                        onChange={(event) => props.onFormChange({ ...props.instanceForm, model_id: event.target.value })}
                      >
                        <option value="">{modelOptions.length === 0 ? 'No catalog models loaded' : 'Select a model...'}</option>
                        {modelOptions.map((model) => (
                          <option key={model.value} value={model.value}>{model.label}</option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <input
                          value={props.instanceForm.hf_model_url}
                          onChange={(event) => props.onFormChange({ ...props.instanceForm, hf_model_url: event.target.value })}
                          placeholder="owner/model or https://huggingface.co/owner/model"
                        />
                        {hfAccessCheck.status === 'checking' ? (
                          <div className="mt-2 text-xs text-[var(--muted)] opacity-80">Checking model access...</div>
                        ) : null}
                        {hfAccessCheck.status === 'invalid' || hfAccessCheck.status === 'error' ? (
                          <div className="mt-2 text-xs text-[#fca5a5]">{hfAccessCheck.message}</div>
                        ) : null}
                      </>
                    )}
                  </label>
                  {shouldShowHfTokenInput ? (
                    <label className="cloud-model-field">
                      <span>Hugging Face Token</span>
                      <input
                        type="password"
                        value={props.instanceForm.hf_access_token}
                        onChange={(event) => props.onFormChange({ ...props.instanceForm, hf_access_token: event.target.value })}
                        placeholder="Token for gated/private models"
                      />
                      {hfAccessCheck.message ? (
                        <div className="mt-2 text-xs text-[var(--muted)] opacity-80">{hfAccessCheck.message}</div>
                      ) : null}
                    </label>
                  ) : null}
                </div>
                <label className="full-span">
                  <span>Serving Library</span>
                  <select
                    value={props.instanceForm.serving_library}
                    onChange={(event) => {
                      const nextServingLibrary = event.target.value as ServingLibrary;
                      const nextImage = getImagesForServingLibrary(allProviderImages, nextServingLibrary)[0];
                      props.onFormChange({
                        ...props.instanceForm,
                        serving_library: nextServingLibrary,
                        image_url: nextImage?.image_url ?? '',
                        startup_script: nextImage?.start_command ?? props.instanceForm.startup_script,
                      });
                    }}
                  >
                    {cloudServingLibraryOptions.map((library) => (
                      <option key={library.value} value={library.value}>
                        {library.label}
                      </option>
                    ))}
                  </select>
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
                </label>
                <label>
                  <span>Disk (GB)</span>
                  <input type="number" min={20} value={props.instanceForm.disk_size} onChange={(event) => props.onFormChange({ ...props.instanceForm, disk_size: Number(event.target.value) })} />
                </label>
              </div>

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
                  <option value="" disabled>{providerImages.length === 0 ? `No ${formatValue(props.instanceForm.serving_library)} images available` : 'Choose a container image...'}</option>
                  {providerImages.map((image) => (
                    <option key={`${image.name}-${image.image_url}`} value={image.image_url}>{image.name}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Region</span>
                <select value={props.instanceForm.region} onChange={(event) => props.onFormChange({ ...props.instanceForm, region: event.target.value })} disabled={regions.length === 0}>
                  {regions.length === 0 ? <option value="">Select a GPU first</option> : null}
                  {regions.map((region) => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Start Script</span>
                <textarea rows={5} value={props.instanceForm.startup_script} onChange={(event) => props.onFormChange({ ...props.instanceForm, startup_script: event.target.value })} placeholder="Type your script here..." />
              </label>
            </div>

            <div className="cloud-deploy-summary rounded-[1rem] border border-white/[0.06] bg-white/[0.02] p-5">
              <h4 className="mb-5 text-[1.25rem] font-semibold">Summary</h4>

              <div className="mb-6">
                <div className="mb-3 text-[0.75rem] uppercase tracking-[0.08em] text-[var(--muted)]">Specs</div>
                <div className="grid grid-cols-2 gap-4 text-[0.95rem]">
                  <div className="col-span-2">
                    <div className="text-[0.75rem] text-[var(--muted)]">Model</div>
                    <div>{selectedModelLabel}</div>
                  </div>
                  <div>
                    <div className="text-[0.75rem] text-[var(--muted)]">Serving Library</div>
                    <div>{formatCloudServingLibraryLabel(props.instanceForm.serving_library)}</div>
                  </div>
                  <div>
                    <div className="text-[0.75rem] text-[var(--muted)]">GPU</div>
                    <div>{selectedGpu ? formatGpuDisplayName(selectedGpu.name) : 'Not selected'}</div>
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

              <button className="primary-button w-full justify-center" type="submit" disabled={props.busy === 'deploy-cloud-model' || !validProviderName || !props.instanceForm.gpu_id || !props.instanceForm.region || !props.instanceForm.image_url || (props.instanceForm.model_source === 'catalog' ? !props.instanceForm.model_id : !props.instanceForm.hf_model_url)}>
                {props.busy === 'deploy-cloud-model' ? <LoaderCircle className="spin" size="1rem" /> : <Rocket size="1rem" />}
                Deploy Model
              </button>
              <p className="mt-3 text-center text-xs text-[var(--muted)]">By clicking Deploy, you agree to pay for the GPU and storage used.</p>
            </div>
          </div>
        </form>
      </Modal>

      <Modal title="Specifications" isOpen={Boolean(detailsGpu)} onClose={() => setDetailsGpu(null)}>
        {detailsGpu ? (
          <div className="gpu-spec-details-modal">
            <div className="gpu-spec-hero">
              <div className="gpu-spec-title-row">
                <div className="gpu-spec-title">
                  {detailsGpu.brand.toLowerCase().includes('nvidia') ? (
                    <img
                      alt="NVIDIA"
                      className="gpu-spec-logo"
                      src="https://i.ibb.co/fGV3cccB/nvidia-small-logo-1.png"
                    />
                  ) : null}
                  <div>
                    <div className="gpu-spec-brand">{detailsGpu.brand}</div>
                    <h3>{formatGpuDisplayName(detailsGpu.name)}</h3>
                    {detailsGpu.productCategory ? <p>{detailsGpu.productCategory}</p> : null}
                  </div>
                </div>
                <span className="status-pill soft">{detailsGpu.providerName}</span>
              </div>
              {detailsGpu.notes ? <p className="gpu-spec-note">{detailsGpu.notes}</p> : null}
            </div>

            <GpuSpecSection
              accent="blue"
              className="gpu-spec-section-wide"
              entries={detailsGpu.gpuPerformanceEntries}
              title="GPU Performance"
            />

            <div className="gpu-spec-two-col">
              <GpuSpecSection accent="green" entries={detailsGpu.memorySpecEntries} title="Memory Specs" />
              <GpuSpecSection accent="purple" entries={detailsGpu.inferencePerformanceEntries} title="Inference Performance" />
            </div>

            <GpuSpecSection
              accent="amber"
              className="gpu-spec-section-wide"
              entries={detailsGpu.technicalSpecEntries}
              title="Technical Specs"
            />

          </div>
        ) : null}
      </Modal>
    </div>
  );
}

type ProviderImageOption = {
  name: string;
  image_url: string;
  start_command: string;
  servingLibraries: ServingLibrary[];
};

interface CloudEndpointRow {
  endpointId: string;
  endpointUrl: string;
  modelId: string;
  name: string;
  provider: string;
  status: string;
  updatedAt: string;
  canUseInRoute: boolean;
}

interface ModelOption {
  value: string;
  label: string;
}



function CloudEndpointCard(props: {
  endpoint: CloudEndpointRow;
  onUseEndpointInRoute: (endpointId: string, endpointName: string) => void;
  onShowUsage: (target: EndpointUsageTarget) => void;
}) {
  return (
    <div className="cloud-endpoint-card">
      <div className="cloud-endpoint-main">
        <div style={{ minWidth: 0 }}>
          <strong>{props.endpoint.name}</strong>
          <span>{props.endpoint.provider} / {props.endpoint.modelId}</span>
          {props.endpoint.endpointUrl ? <code>{props.endpoint.endpointUrl}</code> : null}
        </div>
        <span className={`status-pill ${isActiveEndpointStatus(props.endpoint.status) ? 'active' : 'soft'}`}>{props.endpoint.status}</span>
      </div>
      <div className="cloud-endpoint-meta">
        <span>Endpoint ID: {props.endpoint.endpointId}</span>
        <span>{props.endpoint.updatedAt}</span>
      </div>
      <div className="cloud-endpoint-actions">
        <button className="ghost-button" type="button" disabled={!props.endpoint.canUseInRoute} onClick={() => props.onUseEndpointInRoute(props.endpoint.endpointId, props.endpoint.name)}>
          <Orbit size={14} />
          Use in route
        </button>
        <button
          className="ghost-button"
          type="button"
          disabled={!props.endpoint.endpointUrl || !isActiveEndpointStatus(props.endpoint.status)}
          onClick={() => props.onShowUsage({
            endpointId: props.endpoint.endpointId,
            endpointUrl: props.endpoint.endpointUrl,
            modelId: props.endpoint.modelId,
            name: props.endpoint.name,
            source: 'cloud',
          })}
        >
          <PlayCircle size={14} />
          Usage
        </button>
        <button className="ghost-button" type="button" disabled={!props.endpoint.endpointUrl} onClick={() => navigator.clipboard?.writeText(props.endpoint.endpointUrl)}>
          <Copy size={14} />
          Copy URL
        </button>
      </div>
    </div>
  );
}

function getModelOptions(models: any[]): ModelOption[] {
  const seen = new Set<string>();
  return models
    .map((model) => {
      const value = String(model.model_id ?? model.modelId ?? model.id ?? '').trim();
      const name = String(model.model_name ?? model.modelName ?? model.displayName ?? value).trim();
      return value ? { value, label: name || value } : null;
    })
    .filter((model): model is ModelOption => {
      if (!model || seen.has(model.value)) {
        return false;
      }

      seen.add(model.value);
      return true;
    });
}



function formatCloudServingLibraryLabel(library: ServingLibrary): string {
  return cloudServingLibraryOptions.find((option) => option.value === library)?.label ?? formatValue(library);
}

function getCloudEndpointRows(endpoints: EndpointItem[], instances: InstanceItem[]): CloudEndpointRow[] {
  const endpointRows = endpoints
    .filter((endpoint) => getEndpointSource(endpoint) === 'cloud')
    .map((endpoint, index) => {
      const endpointId = getEndpointId(endpoint, index);
      const modelId = String(endpoint.model_id ?? endpoint.model_name ?? endpoint.name ?? `model-${index + 1}`);
      return {
        endpointId,
        endpointUrl: String(endpoint.endpoint_url ?? ''),
        modelId,
        name: String(endpoint.name ?? endpoint.endpoint_name ?? modelId),
        provider: String(endpoint.provider ?? endpoint.endpoint_source ?? 'cloud'),
        status: String(endpoint.status ?? endpoint.creation_status ?? 'ready'),
        updatedAt: String(endpoint.updated_at ?? endpoint.created_at ?? 'Registered endpoint'),
        canUseInRoute: true,
      };
    });

  const knownInstanceIds = new Set(endpointRows.map((endpoint) => endpoint.endpointId));
  const instanceRows = instances
    .map((instance, index) => {
      const endpointId = getInstanceEndpointId(instance, index);
      const endpointUrl = getStringValue(instance.endpoint_url ?? instance.endpointUrl ?? instance.url ?? '');
      const modelId = getStringValue(instance.model_id ?? instance.modelId ?? instance.model_name ?? instance.modelName ?? instance.gpu_name ?? 'Cloud model');
      return {
        endpointId,
        endpointUrl,
        modelId,
        name: getStringValue(instance.instance_name ?? instance.name ?? endpointId) || `Cloud instance ${index + 1}`,
        provider: getStringValue(instance.provider_name ?? instance.provider ?? 'cloud') || 'cloud',
        status: getStringValue(instance.instance_status ?? instance.status ?? 'unknown') || 'unknown',
        updatedAt: getStringValue(instance.updated_at ?? instance.created_at ?? instance.region ?? 'Cloud instance') || 'Cloud instance',
        canUseInRoute: Boolean(endpointUrl || instance.inference_endpoint_id || instance.endpoint_id),
      };
    })
    .filter((instance) => !knownInstanceIds.has(instance.endpointId));

  return [...endpointRows, ...instanceRows];
}

function getEndpointId(endpoint: EndpointItem, index: number): string {
  return String(endpoint.inference_endpoint_id ?? endpoint.endpoint_id ?? endpoint.id ?? `endpoint-${index + 1}`);
}

function getInstanceEndpointId(instance: InstanceItem, index: number): string {
  return String(
    instance.inference_endpoint_id
    ?? instance.endpoint_id
    ?? instance.instance_id
    ?? instance.unique_instance_id
    ?? instance.id
    ?? `instance-${index + 1}`,
  );
}

type EndpointSource = 'local' | 'cloud' | 'openbandwidth' | 'closed_source_api';

function getEndpointSource(endpoint: EndpointItem): EndpointSource {
  const record = endpoint as Record<string, unknown>;
  const sourceText = [
    record.endpoint_source,
    record.source,
    record.endpoint_type,
    record.provider,
    record.deployment_target,
    record.endpoint_url,
    record.name,
    record.endpoint_name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (sourceText.includes('openbandwidth') || sourceText.includes('open_bandwidth') || sourceText.includes('open bandwidth')) {
    return 'openbandwidth';
  }

  if (String(record.deployment_target ?? '').toLowerCase() === 'local' || isLocalEndpointUrl(record.endpoint_url)) {
    return 'local';
  }

  if (
    sourceText.includes('closed_source_api')
    || sourceText.includes('closed source')
    || sourceText.includes('close source')
    || isClosedSourceProvider(record.provider)
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
  return endpointUrl.includes('localhost') || endpointUrl.includes('127.0.0.1') || endpointUrl.includes('0.0.0.0');
}

function isClosedSourceProvider(value: unknown): boolean {
  if (!value) {
    return false;
  }

  return ['openai', 'anthropic', 'groq', 'deepseek', 'google', 'grok', 'zai', 'minimax', 'sarvam'].includes(String(value).toLowerCase());
}

function isActiveEndpointStatus(status: string): boolean {
  const normalizedStatus = status.toLowerCase();
  return normalizedStatus === 'active' || normalizedStatus === 'running' || normalizedStatus === 'ready';
}

type ProviderGpuOption = {
  gpu_id: string;
  gpu_num: number;
  name: string;
  label: string;
  regions: string[];
  pricePerHourUsd: number;
  chipId: string;
  cpuId: string;
  brand: string;
  vram: string;
  cpuInfo: string;
  ram: string;
};

type GpuCardOption = {
  cardId: string;
  gpuId: string;
  chipId: string;
  cpuId: string;
  name: string;
  brand: string;
  providerName: string;
  bestPriceLabel: string;
  pricePerHourUsd: number | null;
  regions: string[];
  vram: string;
  cpuInfo: string;
  ram: string;
  isNew: boolean;
  productCategory: string;
  notes: string;
  gpuPerformanceEntries: SpecEntry[];
  memorySpecEntries: SpecEntry[];
  inferencePerformanceEntries: SpecEntry[];
  technicalSpecEntries: SpecEntry[];
};

type GpuProviderFilter = {
  gpuId: string;
  chipId: string;
  name: string;
};

type GpuSortOption = 'most-wanted' | 'price-low' | 'price-high' | 'vram-high' | 'availability' | 'newest';

type SpecEntry = {
  label: string;
  value: string;
};

function GpuMarketplaceCard(props: {
  gpu: GpuCardOption;
  onCreate: (gpu: GpuCardOption) => void;
  onDetails: (gpu: GpuCardOption) => void;
}) {
  return (
    <div
      className="gpu-market-card"
      onClick={() => props.onCreate(props.gpu)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          props.onCreate(props.gpu);
        }
      }}
      role="button"
      tabIndex={0}
    >
      {props.gpu.isNew ? (
        <div className="gpu-new-ribbon"><span>NEW</span></div>
      ) : null}
      <div className="gpu-card-header">
        <div className="gpu-card-title">
          <img
            alt="NVIDIA"
            className="nvidia-mark"
            src="https://i.ibb.co/fGV3cccB/nvidia-small-logo-1.png"
          />
          <h3>{formatGpuDisplayName(props.gpu.name)}</h3>
        </div>
        <button
          className="gpu-details-button"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            props.onDetails(props.gpu);
          }}
        >
          Details
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="gpu-card-regions">
        {props.gpu.regions.slice(0, 2).map((region) => (
          <span className="gpu-region-pill" key={region}>{region}</span>
        ))}
        {props.gpu.regions.length > 2 ? (
          <span className="gpu-region-pill">+{props.gpu.regions.length - 2} more</span>
        ) : null}
      </div>

      <div className="gpu-card-spacer" />

      <div className="gpu-spec-row">
        <span>VRAM</span>
        <strong>{props.gpu.vram || 'N/A'}</strong>
      </div>

      <div className="gpu-price-row">
        <span>Best Price</span>
        <strong>{props.gpu.bestPriceLabel}</strong>
      </div>
    </div>
  );
}

function DetailStat(props: { label: string; value: string }) {
  return (
    <div className="gpu-detail-stat">
      <div>{props.label}</div>
      <strong>{props.value}</strong>
    </div>
  );
}

function GpuSpecSection(props: { accent: 'blue' | 'green' | 'purple' | 'amber'; entries: SpecEntry[]; title: string; className?: string }) {
  if (props.entries.length === 0) {
    return null;
  }

  return (
    <section className={`gpu-spec-section ${props.className ?? ''}`.trim()}>
      <h4 className={`gpu-spec-section-title ${props.accent}`}>{props.title}</h4>
      <div className="gpu-spec-entry-grid">
        {props.entries.map((entry) => (
          <div className="gpu-spec-entry" key={`${props.title}-${entry.label}`}>
            <span>{entry.label}</span>
            <strong>{entry.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

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
  const rawImages = getArrayValue(rawProvider, 'images', 'container_images', 'containerImages', 'image_list', 'imageList');
  const rawInstances = getProviderInstanceRecords(rawProvider);

  const images = rawImages
    .map((image) => {
      const imageUrl = getStringValue(image.image_url ?? image.imageUrl ?? image.url ?? image.id ?? image.image_id);
      if (!imageUrl) {
        return null;
      }

      return {
        name: getStringValue(image.name ?? image.display_name ?? image.displayName ?? imageUrl) || 'Image',
        image_url: imageUrl,
        start_command: getStringValue(image.start_command ?? image.startCommand),
        servingLibraries: getImageServingLibraries(image),
      };
    })
    .filter((image): image is ProviderImageOption => Boolean(image));

  const instances = rawInstances
    .filter(isGpuInstanceRecord)
    .map((instance): Record<string, unknown> & { gpu_id: string } => ({
      ...instance,
      gpu_id: getGpuInstanceId(instance),
    }))
    .filter((instance) => instance.gpu_id.trim() !== '')
    .map((instance) => {
      const gpu = typeof instance.gpu === 'object' && instance.gpu ? instance.gpu as Record<string, unknown> : {};
      const cpu = typeof instance.cpu === 'object' && instance.cpu ? instance.cpu as Record<string, unknown> : {};
      const ram = getNestedRecord(instance, 'ram', 'RAM');
      const vram = getNestedRecord(instance, 'vram', 'VRAM');
      const regions = Array.isArray(instance.regions) ? instance.regions.filter((region): region is string => typeof region === 'string') : [];
      const gpuNum = getGpuCount(instance);
      const cpuCores = typeof cpu.number_of_cores === 'number' ? cpu.number_of_cores : null;
      const price = getPricePerHourUsd(instance);

      return {
        gpu_id: String(instance.gpu_id),
        gpu_num: gpuNum,
        name: String(instance.name ?? instance.instance_name ?? 'GPU'),
        regions,
        pricePerHourUsd: price ?? 0,
        chipId: getChipId(instance),
        cpuId: String(instance.cpu_id ?? ''),
        brand: String(instance.manufacturer ?? 'NVIDIA'),
        vram: formatGbValue(vram.size_in_gigabytes),
        cpuInfo: cpuCores ? `${cpuCores} cores` : '',
        ram: formatGbValue(ram.size_in_gigabytes),
        label: [
          String(instance.name ?? instance.instance_name ?? 'GPU'),
          `${gpuNum} GPU`,
          cpuCores ? `${cpuCores} vCPU` : null,
          price !== null ? `$${price.toFixed(2)}/hr` : null,
        ].filter(Boolean).join(' | '),
      };
    })
    .sort(compareProviderGpuValue);

  return { images, instances };
}

function getImagesForServingLibrary(images: ProviderImageOption[], servingLibrary: ServingLibrary): ProviderImageOption[] {
  return images.filter((image) => imageSupportsServingLibrary(image, servingLibrary));
}

function imageSupportsServingLibrary(image: ProviderImageOption, servingLibrary: ServingLibrary): boolean {
  if (image.servingLibraries.length > 0) {
    return image.servingLibraries.includes(servingLibrary);
  }

  const searchableText = `${image.name} ${image.image_url} ${image.start_command}`.toLowerCase();
  const supportKeywords: Record<ServingLibrary, string[]> = {
    vllm: ['vllm', 'cuda', 'pytorch', 'torch', 'nvidia'],
    transformers: ['transformers', 'huggingface', 'hf', 'cuda', 'pytorch', 'torch', 'nvidia'],
    ollama: ['ollama'],
    sglang: ['sglang', 'cuda', 'pytorch', 'torch', 'nvidia'],
    tensorrt: ['tensorrt', 'tensorrt-llm', 'trt', 'cuda', 'nvidia'],
    llama_cpp: ['llama.cpp', 'llamacpp', 'llama-cpp', 'gguf'],
    pytorch: ['pytorch', 'torch', 'cuda', 'nvidia'],
    dynamo: ['dynamo'],
  };

  return supportKeywords[servingLibrary].some((keyword) => searchableText.includes(keyword));
}

function getImageServingLibraries(image: Record<string, unknown>): ServingLibrary[] {
  return getStringArrayValue(
    image.serving_library,
    image.servingLibrary,
    image.serving_libraries,
    image.servingLibraries,
    image.supported_serving_libraries,
    image.supportedServingLibraries,
    image.runtime,
    image.runtimes,
    image.backend,
    image.backends,
  )
    .map(normalizeServingLibraryValue)
    .filter((library): library is ServingLibrary => Boolean(library));
}

function normalizeServingLibraryValue(value: string): ServingLibrary | null {
  const normalized = value.toLowerCase().replace(/[\s_-]+/g, '');
  if (normalized === 'vllm') return 'vllm';
  if (normalized === 'ollama') return 'ollama';
  if (normalized === 'transformers' || normalized === 'huggingface') return 'transformers';
  if (normalized === 'sglang') return 'sglang';
  if (normalized === 'tensorrt' || normalized === 'tensorrtllm' || normalized === 'trt') return 'tensorrt';
  if (normalized === 'llamacpp' || normalized === 'llamacppserver') return 'llama_cpp';
  if (normalized === 'pytorch' || normalized === 'torch') return 'pytorch';
  if (normalized === 'dynamo') return 'dynamo';
  return null;
}

function getStringArrayValue(...values: unknown[]): string[] {
  const value = values.find((item) => typeof item === 'string' || Array.isArray(item));
  if (typeof value === 'string') {
    return value.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
  }

  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function createGpuProviderFilter(gpu: GpuCardOption): GpuProviderFilter {
  return {
    gpuId: gpu.gpuId,
    chipId: gpu.chipId,
    name: gpu.name,
  };
}

function providerHasMatchingGpu(providerInfo: DashboardState['providerInfo'], providerName: string, filter: GpuProviderFilter): boolean {
  return getSelectedProviderData(providerInfo, providerName).instances.some((gpu) => isProviderGpuMatch(gpu, filter));
}

function findMatchingProviderGpu(gpus: ProviderGpuOption[], filter: GpuProviderFilter): ProviderGpuOption | undefined {
  return gpus.find((gpu) => isProviderGpuMatch(gpu, filter));
}

function isProviderGpuMatch(gpu: ProviderGpuOption, filter: GpuProviderFilter): boolean {
  if (filter.chipId && gpu.chipId && filter.chipId === gpu.chipId) {
    return true;
  }

  if (filter.gpuId && gpu.gpu_id && filter.gpuId === gpu.gpu_id) {
    return true;
  }

  const filterName = normalizeGpuMatchValue(filter.name);
  const gpuName = normalizeGpuMatchValue(gpu.name);
  return Boolean(filterName && gpuName && filterName === gpuName);
}

function normalizeGpuMatchValue(value: string): string {
  return value.toLowerCase().replace(/nvidia|geforce|tesla|quadro/g, '').replace(/[^a-z0-9]+/g, '');
}

function formatGpuDisplayName(value: string): string {
  return value
    .replace(/\bnvidia\b/gi, '')
    .replace(/\bgeforce\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getGpuCardOptions(providerInfo: DashboardState['providerInfo'], gpuSpecs: DashboardState['gpuSpecs']): GpuCardOption[] {
  const allGpuInstances = Object.entries(providerInfo).flatMap(([providerName, provider]) => {
    const instances = getProviderInstanceRecords(provider);
    return instances.filter(isGpuInstanceRecord).map((instance) => ({
      ...instance,
      gpu_id: getGpuInstanceId(instance),
      providerName,
    }));
  }) as Array<Record<string, unknown> & { providerName: string }>;

  const specOptions = gpuSpecs.map((spec) => {
    const specChipId = getChipId(spec);
    const matchingInstances = allGpuInstances.filter((instance) => getChipId(instance) === specChipId);
    const matchingInstance = matchingInstances.find((instance) => (getPricePerHourUsd(instance) ?? 0) > 0) ?? matchingInstances[0];
    if (!matchingInstance) {
      return createGpuCardFromSpec(spec);
    }

    return createGpuCardFromProviderInstance(matchingInstance, String(spec.modelName ?? spec.gpu_name ?? spec.display_name ?? matchingInstance.name ?? 'GPU'), spec);
  });

  const specChipIds = new Set(gpuSpecs.map(getChipId));
  const orphanOptions = allGpuInstances
    .filter((instance) => !specChipIds.has(getChipId(instance)))
    .filter((instance, index, self) => index === self.findIndex((item) => (getChipId(item) || getGpuInstanceId(item)) === (getChipId(instance) || getGpuInstanceId(instance))))
    .map((instance) => createGpuCardFromProviderInstance(instance, String(instance.name ?? 'GPU')));

  return [...specOptions, ...orphanOptions]
    .filter((gpu) => gpu.gpuId || gpu.chipId)
    .sort(compareGpuCardValue);
}

function createGpuCardFromProviderInstance(instance: Record<string, unknown>, displayName: string, spec?: Record<string, unknown>): GpuCardOption {
  const cpu = getNestedRecord(instance, 'cpu');
  const ram = getNestedRecord(instance, 'ram', 'RAM');
  const vram = getNestedRecord(instance, 'vram', 'VRAM');
  const price = getPricePerHourUsd(instance);
  const regions = Array.isArray(instance.regions) ? instance.regions.filter((region): region is string => typeof region === 'string') : [];
  const chipId = getChipId(instance);
  const gpuId = getGpuInstanceId(instance) || chipId;
  const memorySpecEntries = getMemorySpecEntries(spec);
  const specVram = memorySpecEntries.find((entry) => entry.label === 'Size')?.value?.replace(/\s+/g, '');

  return {
    cardId: `${chipId || gpuId}-${String(instance.providerName ?? 'provider')}`,
    gpuId,
    chipId,
    cpuId: String(instance.cpu_id ?? ''),
    name: displayName,
    brand: String(instance.manufacturer ?? 'NVIDIA'),
    providerName: String(instance.providerName ?? ''),
    bestPriceLabel: price !== null ? `${formatUsd(price)}/gpu/hr` : 'N/A',
    pricePerHourUsd: price,
    regions,
    vram: formatGbValue(vram.size_in_gigabytes) || specVram || '',
    cpuInfo: typeof cpu.number_of_cores === 'number' ? `${cpu.number_of_cores} cores` : '',
    ram: formatGbValue(ram.size_in_gigabytes),
    isNew: isNewGpu({ chipId, name: displayName }),
    productCategory: getStringValue(spec?.productCategory ?? spec?.product_category),
    notes: getStringValue(spec?.notes),
    gpuPerformanceEntries: getGpuPerformanceEntries(spec),
    memorySpecEntries,
    inferencePerformanceEntries: getInferencePerformanceEntries(spec),
    technicalSpecEntries: getTechnicalSpecEntries(spec),
  };
}

function createGpuCardFromSpec(spec: Record<string, unknown>): GpuCardOption {
  const chipId = getChipId(spec);
  const memorySpecs = getNestedRecord(spec, 'memory_specs');
  const name = String(spec.modelName ?? spec.gpu_name ?? spec.display_name ?? 'GPU');
  const memorySpecEntries = getMemorySpecEntries(spec);

  return {
    cardId: chipId || name,
    gpuId: chipId,
    chipId,
    cpuId: '',
    name,
    brand: String(spec.manufacturer ?? 'NVIDIA'),
    providerName: '',
    bestPriceLabel: 'N/A',
    pricePerHourUsd: null,
    regions: [],
    vram: formatGbValue(memorySpecs.size_gb) || memorySpecEntries.find((entry) => entry.label === 'Size')?.value?.replace(/\s+/g, '') || '',
    cpuInfo: '',
    ram: '',
    isNew: isNewGpu({ chipId, name, launchDate: String(spec.launchDate ?? spec.launch_date ?? '') }),
    productCategory: getStringValue(spec.productCategory ?? spec.product_category),
    notes: getStringValue(spec.notes),
    gpuPerformanceEntries: getGpuPerformanceEntries(spec),
    memorySpecEntries,
    inferencePerformanceEntries: getInferencePerformanceEntries(spec),
    technicalSpecEntries: getTechnicalSpecEntries(spec),
  };
}

function compareProviderGpuValue(left: ProviderGpuOption, right: ProviderGpuOption): number {
  return compareGpuValue(
    {
      name: left.name,
      pricePerHourUsd: left.pricePerHourUsd,
      vram: left.vram,
      regions: left.regions,
    },
    {
      name: right.name,
      pricePerHourUsd: right.pricePerHourUsd,
      vram: right.vram,
      regions: right.regions,
    },
  );
}

function compareGpuCardValue(left: GpuCardOption, right: GpuCardOption): number {
  return compareGpuValue(left, right);
}

function sortGpuCards(gpus: GpuCardOption[], sort: GpuSortOption): GpuCardOption[] {
  return [...gpus].sort((left, right) => {
    if (sort === 'price-low') {
      return compareGpuPrice(left, right, 'asc');
    }

    if (sort === 'price-high') {
      return compareGpuPrice(left, right, 'desc');
    }

    if (sort === 'vram-high') {
      return compareNumberWithFallback(parseGbValue(right.vram), parseGbValue(left.vram), left, right);
    }

    if (sort === 'availability') {
      return compareNumberWithFallback(right.regions.length, left.regions.length, left, right);
    }

    if (sort === 'newest') {
      if (left.isNew !== right.isNew) {
        return left.isNew ? -1 : 1;
      }

      return compareGpuCardValue(left, right);
    }

    return compareGpuCardValue(left, right);
  });
}

function compareGpuPrice(left: GpuCardOption, right: GpuCardOption, direction: 'asc' | 'desc'): number {
  const leftPrice = getGpuPrice(left);
  const rightPrice = getGpuPrice(right);
  const leftHasPrice = leftPrice !== null;
  const rightHasPrice = rightPrice !== null;

  if (leftHasPrice !== rightHasPrice) {
    return leftHasPrice ? -1 : 1;
  }

  if (leftPrice === null || rightPrice === null) {
    return compareGpuCardValue(left, right);
  }

  if (leftPrice !== rightPrice) {
    return direction === 'asc' ? leftPrice - rightPrice : rightPrice - leftPrice;
  }

  return compareGpuCardValue(left, right);
}

function getGpuPrice(gpu: GpuCardOption): number | null {
  return typeof gpu.pricePerHourUsd === 'number' && gpu.pricePerHourUsd > 0
    ? gpu.pricePerHourUsd
    : null;
}

function compareNumberWithFallback(
  leftValue: number,
  rightValue: number,
  left: GpuCardOption,
  right: GpuCardOption,
): number {
  if (leftValue !== rightValue) {
    return leftValue - rightValue;
  }

  return compareGpuCardValue(left, right);
}

function compareGpuValue(
  left: { name: string; pricePerHourUsd: number | null; vram: string; regions: string[] },
  right: { name: string; pricePerHourUsd: number | null; vram: string; regions: string[] },
): number {
  const leftPrice = left.pricePerHourUsd;
  const rightPrice = right.pricePerHourUsd;
  const leftHasPrice = typeof leftPrice === 'number' && leftPrice > 0;
  const rightHasPrice = typeof rightPrice === 'number' && rightPrice > 0;

  if (leftHasPrice !== rightHasPrice) {
    return leftHasPrice ? -1 : 1;
  }

  const leftVramGb = parseGbValue(left.vram);
  const rightVramGb = parseGbValue(right.vram);

  if (leftHasPrice && rightHasPrice) {
    const leftValueScore = leftVramGb > 0 ? leftPrice / leftVramGb : leftPrice;
    const rightValueScore = rightVramGb > 0 ? rightPrice / rightVramGb : rightPrice;
    if (leftValueScore !== rightValueScore) {
      return leftValueScore - rightValueScore;
    }

    if (leftPrice !== rightPrice) {
      return leftPrice - rightPrice;
    }
  }

  if (leftVramGb !== rightVramGb) {
    return rightVramGb - leftVramGb;
  }

  if (left.regions.length !== right.regions.length) {
    return right.regions.length - left.regions.length;
  }

  return left.name.localeCompare(right.name);
}

function parseGbValue(value: string): number {
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/([\d.]+)/);
  if (!match) {
    return 0;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return 0;
  }

  if (normalized.includes('tb')) {
    return amount * 1024;
  }

  if (normalized.includes('mb')) {
    return amount / 1024;
  }

  return amount;
}

function getNestedRecord(record: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  const value = keys.map((key) => record[key]).find((item) => item && typeof item === 'object' && !Array.isArray(item));
  return (value ?? {}) as Record<string, unknown>;
}

function getProviderInstanceRecords(provider: Record<string, unknown> | undefined): Array<Record<string, unknown>> {
  return getArrayValue(provider, 'instances', 'gpus', 'gpu_instances', 'gpuInstances', 'instance_types', 'instanceTypes');
}

function getArrayValue(record: Record<string, unknown> | undefined, ...keys: string[]): Array<Record<string, unknown>> {
  const value = keys.map((key) => record?.[key]).find(Array.isArray);
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : [];
}

function getGpuInstanceId(instance: Record<string, unknown>): string {
  return getStringValue(instance.gpu_id ?? instance.gpuId ?? instance.id ?? instance.instance_id ?? instance.instanceId ?? getChipId(instance));
}

function getChipId(instance: Record<string, unknown>): string {
  return getStringValue(instance.chip_id ?? instance.chipId ?? instance.gpu_chip_id ?? instance.gpuChipId ?? instance.gpu_id ?? instance.gpuId);
}

function getGpuCount(instance: Record<string, unknown>): number {
  const gpu = getNestedRecord(instance, 'gpu');
  const count = getNumberValue(
    gpu.number_of_gpus,
    gpu.numberOfGpus,
    instance.gpu_num,
    instance.gpuNum,
    instance.gpuCount,
    instance.number_of_gpus,
    instance.numberOfGpus,
  );

  return count && count > 0 ? count : 1;
}

function getPricePerHourUsd(instance: Record<string, unknown>): number | null {
  const pricing = getNestedRecord(instance, 'pricing', 'price', 'cost');
  const usdPrice = getNumberValue(
    instance.price_per_hour_usd,
    instance.pricePerHourUsd,
    instance.hourly_price_usd,
    instance.hourlyPriceUsd,
    instance.usd_per_hour,
    instance.usdPerHour,
    pricing.price_per_hour_usd,
    pricing.pricePerHourUsd,
    pricing.hourly_price_usd,
    pricing.hourlyPriceUsd,
    pricing.usd_per_hour,
    pricing.usdPerHour,
  );

  if (usdPrice !== null) {
    return usdPrice;
  }

  const centsPrice = getNumberValue(
    instance.price_per_hour,
    instance.pricePerHour,
    instance.hourly_price,
    instance.hourlyPrice,
    instance.price,
    pricing.price_per_hour,
    pricing.pricePerHour,
    pricing.hourly_price,
    pricing.hourlyPrice,
    pricing.price,
  );

  return centsPrice !== null ? centsPrice / 100 : null;
}

function isGpuInstanceRecord(instance: Record<string, unknown>): boolean {
  const gpuCount = getGpuCount(instance);
  const instanceType = getStringValue(instance.instance_type ?? instance.instanceType).toLowerCase();
  const gpuId = getGpuInstanceId(instance);
  const name = getStringValue(instance.name ?? instance.instance_name).toLowerCase();

  return gpuCount > 0
    && gpuId.length > 0
    && instanceType !== 'cpu'
    && !name.includes('cpu only');
}

function getNestedSpecRecord(spec: Record<string, unknown> | undefined, ...keys: string[]): Record<string, unknown> {
  if (!spec) {
    return {};
  }

  return getNestedRecord(spec, ...keys);
}

function getStringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function getNumberValue(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const numericValue = Number(value.trim().replace(/^\$/, ''));
      if (Number.isFinite(numericValue)) {
        return numericValue;
      }
    }
  }

  return null;
}

function formatSpecValue(value: unknown, suffix = ''): string {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  return `${value}${suffix}`;
}

function compactEntries(entries: Array<{ label: string; value: string }>): SpecEntry[] {
  return entries.filter((entry) => entry.value !== '');
}

function getGpuPerformanceEntries(spec?: Record<string, unknown>): SpecEntry[] {
  const performance = getNestedSpecRecord(spec, 'gpuPerformance', 'gpu_performance');
  return compactEntries([
    { label: 'AI TOPS', value: formatSpecValue(performance.ai_tops) },
    { label: 'FP4 TFLOPS', value: formatSpecValue(performance.fp_4_tflops) },
    { label: 'FP8 TFLOPS', value: formatSpecValue(performance.fp_8_tflops) },
    { label: 'BF16 TFLOPS', value: formatSpecValue(performance.bf_16_tflops) },
    { label: 'FP16 TFLOPS', value: formatSpecValue(performance.fp_16_tflops) },
    { label: 'FP32 TFLOPS', value: formatSpecValue(performance.fp_32_tflops) },
    { label: 'FP64 TFLOPS', value: formatSpecValue(performance.fp_64_tflops) },
    { label: 'Pixel Rate', value: formatSpecValue(performance.pixel_rate) },
    { label: 'Texture Rate', value: formatSpecValue(performance.texture_rate) },
    { label: 'INT4 TOPS', value: formatSpecValue(performance.int_4_tops) },
    { label: 'INT8 TOPS', value: formatSpecValue(performance.int_8_tops) },
    { label: 'Sparse Multiplier', value: formatSpecValue(performance.sparse_performance_multiplier) },
  ]);
}

function getMemorySpecEntries(spec?: Record<string, unknown>): SpecEntry[] {
  const memory = getNestedSpecRecord(spec, 'memory_specs', 'memorySpecs');
  return compactEntries([
    { label: 'Size', value: formatSpecValue(memory.size_gb, ' GB') },
    { label: 'Type', value: formatSpecValue(memory.type) },
    { label: 'Interface', value: formatSpecValue(memory.interface_bits, '-bit') },
    { label: 'Bandwidth', value: formatSpecValue(memory.bandwidth_gbs, ' GB/s') },
    { label: 'ECC Support', value: memory.ecc_support === undefined ? '' : formatSpecValue(Boolean(memory.ecc_support)) },
  ]);
}

function getInferencePerformanceEntries(spec?: Record<string, unknown>): SpecEntry[] {
  const inference = getNestedSpecRecord(spec, 'inference_performance', 'inferencePerformance');
  return compactEntries([
    { label: '7B Tokens/sec', value: formatSpecValue(inference.model_7b_tokens_per_sec) },
    { label: '13B Tokens/sec', value: formatSpecValue(inference.model_13b_tokens_per_sec) },
    { label: '30B Tokens/sec', value: formatSpecValue(inference.model_30b_tokens_per_sec) },
    { label: '70B Tokens/sec', value: formatSpecValue(inference.model_70b_tokens_per_sec) },
  ]);
}

function getTechnicalSpecEntries(spec?: Record<string, unknown>): SpecEntry[] {
  const technical = getNestedSpecRecord(spec, 'technical_specs', 'technicalSpecs');
  return compactEntries([
    { label: 'Die Size', value: formatSpecValue(technical.die_size_mm2, ' mm²') },
    { label: 'TDP', value: formatSpecValue(technical.tdp_watts, ' W') },
    { label: 'Transistors', value: formatSpecValue(technical.transistor_count_billion, 'B') },
    { label: 'NVLink', value: formatSpecValue(technical.nvlink_version) },
    { label: 'PCIe', value: formatSpecValue(technical.pcie_version) },
    { label: 'Process Node', value: formatSpecValue(technical.process_node_nm, ' nm') },
  ]);
}

function formatGbValue(value: unknown): string {
  return typeof value === 'number' && value > 0 ? `${value}GB` : '';
}

function isNewGpu(gpu: { chipId: string; name: string; launchDate?: string }) {
  if (gpu.launchDate && !Number.isNaN(new Date(gpu.launchDate).getTime())) {
    return new Date(gpu.launchDate) > new Date('2024-01-01');
  }

  const text = `${gpu.chipId} ${gpu.name}`.toLowerCase();
  return ['h100', 'h200', 'b200', 'mi300', 'l40s', '4090'].some((chip) => text.includes(chip));
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

function isSameInstanceForm(left: CreateInstanceFormState, right: CreateInstanceFormState) {
  return left.provider_name === right.provider_name
    && left.instance_name === right.instance_name
    && left.gpu_id === right.gpu_id
    && left.gpu_num === right.gpu_num
    && left.disk_size === right.disk_size
    && left.image_url === right.image_url
    && left.region === right.region
    && left.startup_script === right.startup_script
    && left.model_id === right.model_id
    && left.model_source === right.model_source
    && left.hf_model_url === right.hf_model_url
    && left.serving_library === right.serving_library
    && left.hf_access_token === right.hf_access_token
    && left.top_p === right.top_p
    && left.temperature === right.temperature
    && left.max_tokens === right.max_tokens;
}
