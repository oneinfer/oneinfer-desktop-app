import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, ChevronDown, Copy, Info, LoaderCircle, Orbit, Pencil, Play, Trash2 } from 'lucide-react';

import { Modal } from '../components/Common';
import type { DashboardState, EndpointItem, InstanceItem, LocalModelDeployment, LocalModelMetrics, ServingLibrary } from '../types';
import { formatValue } from '../utils/format';

interface CreateRouteDetails {
  endpointSources: EndpointSource[];
  routingGoal: RoutingGoal;
  modelId: string;
  attachedEndpointIds: string[];
  inputModality: string;
  routingAlgorithm: string;
  routerRuntime: RouterRuntime;
  routerServingLibrary: ServingLibrary;
  description: string;
}

type EndpointSource = 'local' | 'cloud' | 'openbandwidth' | 'closed_source_api';
type RoutingGoal = 'balanced' | 'fastest' | 'lowest_cost' | 'highest_quality' | 'reliability' | 'custom';
type RouterRuntime = 'local';

const defaultRouteDetails: CreateRouteDetails = {
  endpointSources: ['local'],
  routingGoal: 'balanced',
  modelId: '',
  attachedEndpointIds: [],
  inputModality: 'text',
  routingAlgorithm: 'https://huggingface.co/katanemo/Arch-Router-1.5B',
  routerRuntime: 'local',
  routerServingLibrary: 'transformers',
  description: '',
};

export interface CreateRoutePayload extends CreateRouteDetails {
  name: string;
}

const routingAlgorithms = [
  { value: 'https://huggingface.co/katanemo/Arch-Router-1.5B', label: 'Arch-Router 1.5B', family: 'Router Models' },
  { value: 'https://huggingface.co/routellm/bert', label: 'RouteLLM BERT', family: 'RouteLLM' },
  { value: 'https://huggingface.co/routellm/bert_gpt4_augmented', label: 'RouteLLM BERT GPT-4 Augmented', family: 'RouteLLM' },
  { value: 'https://huggingface.co/routellm/bert_mmlu_augmented', label: 'RouteLLM BERT MMLU Augmented', family: 'RouteLLM' },
  { value: 'https://huggingface.co/routellm/causal_llm', label: 'RouteLLM Causal LLM', family: 'RouteLLM' },
  { value: 'https://huggingface.co/routellm/causal_llm_gpt4_augmented', label: 'RouteLLM Causal LLM GPT-4 Augmented', family: 'RouteLLM' },
  { value: 'https://huggingface.co/routellm/causal_llm_mmlu_augmented', label: 'RouteLLM Causal LLM MMLU Augmented', family: 'RouteLLM' },
  { value: 'https://huggingface.co/routellm/mf', label: 'RouteLLM Matrix Factorization', family: 'RouteLLM' },
  { value: 'https://huggingface.co/routellm/mf_gpt4_augmented', label: 'RouteLLM Matrix Factorization GPT-4 Augmented', family: 'RouteLLM' },
  { value: 'https://huggingface.co/routellm/mf_mmlu_augmented', label: 'RouteLLM Matrix Factorization MMLU Augmented', family: 'RouteLLM' },
  { value: 'https://huggingface.co/ulab-ai/Router-R1-Qwen2.5-3B-Instruct', label: 'Router-R1 Qwen2.5 3B Instruct', family: 'Router-R1' },
  { value: 'https://huggingface.co/ulab-ai/Router-R1-Qwen2.5-3B-Instruct-Alpha0.9', label: 'Router-R1 Qwen2.5 3B Instruct Alpha 0.9', family: 'Router-R1' },
  { value: 'https://huggingface.co/ulab-ai/Router-R1-Llama-3.2-3B-Instruct', label: 'Router-R1 Llama 3.2 3B Instruct', family: 'Router-R1' },
  { value: 'https://huggingface.co/ulab-ai/Router-R1-Llama-3.2-3B-Instruct-Alpha0.9', label: 'Router-R1 Llama 3.2 3B Instruct Alpha 0.9', family: 'Router-R1' },
  { value: 'https://huggingface.co/llm-semantic-router/mmbert32k-modality-router-merged', label: 'MMBERT32K Modality Router Merged', family: 'vLLM Semantic Router / MoM' },
];

const routingGoals: Array<{ value: RoutingGoal; title: string; text: string; algorithm: string; algorithmLabel: string; explanation: string }> = [
  {
    value: 'balanced',
    title: 'Balanced',
    text: 'Blend quality, latency, and cost for everyday requests.',
    algorithm: 'https://huggingface.co/katanemo/Arch-Router-1.5B',
    algorithmLabel: 'Arch-Router 1.5B',
    explanation: 'Uses the confirmed Arch-Router model as the default general-purpose router for balancing endpoint capability, latency, and cost.',
  },
  {
    value: 'fastest',
    title: 'Fastest',
    text: 'Prefer endpoints expected to respond with the lowest latency.',
    algorithm: 'https://huggingface.co/routellm/bert',
    algorithmLabel: 'RouteLLM BERT',
    explanation: 'Uses the confirmed RouteLLM BERT router for lightweight classification when latency is the main priority.',
  },
  {
    value: 'lowest_cost',
    title: 'Lowest cost',
    text: 'Route simple work to the cheapest capable endpoint first.',
    algorithm: 'https://huggingface.co/routellm/mf',
    algorithmLabel: 'RouteLLM Matrix Factorization',
    explanation: 'Uses the confirmed RouteLLM matrix-factorization router to score candidate endpoints with a compact preference model.',
  },
  {
    value: 'highest_quality',
    title: 'Highest quality',
    text: 'Prefer stronger models for harder prompts and reasoning.',
    algorithm: 'https://huggingface.co/ulab-ai/Router-R1-Qwen2.5-3B-Instruct',
    algorithmLabel: 'Router-R1 Qwen2.5 3B Instruct',
    explanation: 'Uses the confirmed Router-R1 Qwen router for quality-sensitive routing decisions across stronger candidate endpoints.',
  },
  {
    value: 'reliability',
    title: 'Reliability',
    text: 'Prioritize fallback behavior and healthy endpoint coverage.',
    algorithm: 'https://huggingface.co/llm-semantic-router/mmbert32k-modality-router-merged',
    algorithmLabel: 'MMBERT32K Modality Router Merged',
    explanation: 'Uses the confirmed vLLM semantic-router modality model to keep routing aligned with input modality and available endpoint coverage.',
  },
  {
    value: 'custom',
    title: 'Custom',
    text: 'Pick a confirmed Hugging Face router in advanced settings.',
    algorithm: 'https://huggingface.co/katanemo/Arch-Router-1.5B',
    algorithmLabel: 'Advanced selection',
    explanation: 'Lets you manually choose from the confirmed Hugging Face router model allowlist in advanced settings.',
  },
];

const endpointSources: Array<{ value: EndpointSource; label: string; emptyText: string; selectText: string }> = [
  {
    value: 'local',
    label: 'Local',
    emptyText: 'No locally deployed model endpoints available',
    selectText: 'Select locally deployed model endpoint',
  },
  {
    value: 'cloud',
    label: 'Cloud',
    emptyText: 'No cloud endpoints available',
    selectText: 'Select cloud endpoint',
  },
  {
    value: 'openbandwidth',
    label: 'OpenBandwidth',
    emptyText: 'No OpenBandwidth endpoints available',
    selectText: 'Select OpenBandwidth endpoint',
  },
  {
    value: 'closed_source_api',
    label: 'Closed source API',
    emptyText: 'No closed source API endpoints available',
    selectText: 'Select closed source API endpoint',
  },
];

const routerServingLibraries: Array<{ value: ServingLibrary; label: string; platforms: SupportedPlatform[]; directRuntime: boolean }> = [
  { value: 'vllm', label: 'vLLM', platforms: ['linux', 'macos'], directRuntime: true },
  { value: 'sglang', label: 'SGLang', platforms: ['linux', 'macos'], directRuntime: false },
  { value: 'tensorrt', label: 'TensorRT-LLM', platforms: ['linux'], directRuntime: false },
  { value: 'ollama', label: 'Ollama', platforms: ['windows', 'macos', 'linux'], directRuntime: true },
  { value: 'llama_cpp', label: 'llama.cpp', platforms: ['windows', 'macos', 'linux'], directRuntime: false },
  { value: 'pytorch', label: 'PyTorch', platforms: ['windows', 'macos', 'linux'], directRuntime: false },
  { value: 'transformers', label: 'Transformers', platforms: ['windows', 'macos', 'linux'], directRuntime: true },
  { value: 'dynamo', label: 'Dynamo', platforms: ['linux'], directRuntime: false },
];

export function RoutingPage(props: {
  dashboard: DashboardState;
  intelligentEndpointName: string;
  busy: string | null;
  onIntelligentEndpointNameChange: (value: string) => void;
  onCreateRoute: (payload: CreateRoutePayload) => boolean | void | Promise<boolean | void>;
  onCopyRoute: (routeId: string, route?: EndpointItem) => void;
  onDeleteRoute: (routeId: string, routeName: string) => void;
  onCreateSelfHosting: () => void;
  onSetupRouterEndpoint?: (routerModelId: string) => void | Promise<void>;
  onInstallLibrary: (library: ServingLibrary) => void | Promise<void>;
  libraries: Record<ServingLibrary, boolean>;
  localDeployments?: LocalModelDeployment[];
  localModelMetrics?: Record<string, LocalModelMetrics>;
  initialEndpointId?: string | null;
  onInitialEndpointConsumed?: () => void;
}) {
  const [showCreateRouteModal, setShowCreateRouteModal] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testRoute, setTestRoute] = useState<{ id: string; name: string } | null>(null);
  const [editRoute, setEditRoute] = useState<{ id: string; name: string } | null>(null);
  const [goalInfo, setGoalInfo] = useState<(typeof routingGoals)[number] | null>(null);
  const [routerLibraryOpen, setRouterLibraryOpen] = useState(false);
  const [testPrompt, setTestPrompt] = useState('Explain what this route is optimized for in one sentence.');
  const [routeDetails, setRouteDetails] = useState<CreateRouteDetails>(defaultRouteDetails);
  const activeEndpointSources = getActiveEndpointSources(routeDetails);
  const registeredLocalEndpointKeys = new Set(
    props.dashboard.inferenceEndpoints
      .map((endpoint) => getLocalEndpointKey(String(endpoint.endpoint_url ?? '').trim(), String(endpoint.model_id ?? endpoint.name ?? '')))
      .filter(Boolean),
  );
  const localDeploymentOptions = (props.localDeployments || [])
    .filter((deployment) => !registeredLocalEndpointKeys.has(getLocalEndpointKey(deployment.endpointUrl, deployment.modelId)))
    .filter((deployment) => !isRouterEndpointLike({
      name: deployment.name,
      model_id: deployment.modelId,
      endpoint_url: deployment.endpointUrl,
    }))
    .map((deployment) => ({
      id: getLocalDeploymentEndpointId(deployment),
      endpointName: deployment.name,
      modelName: deployment.modelId,
      source: 'local' as EndpointSource,
      endpointUrl: deployment.endpointUrl,
      available: getLocalEndpointMetrics(props.localModelMetrics, deployment.endpointUrl)?.healthy !== false,
    }));
  const inferenceEndpointOptions = props.dashboard.inferenceEndpoints
    .filter((endpoint) => !isRouterEndpointLike(endpoint))
    .map((endpoint, index) => {
      const endpointUrl = String(endpoint.endpoint_url ?? '');
      const source = getEndpointSource(endpoint);
      return {
        id: getInferenceEndpointId(endpoint, index),
        endpointName: getInferenceEndpointName(endpoint, index),
        modelName: getInferenceEndpointModelName(endpoint, index),
        source,
        endpointUrl,
        available: source !== 'local' || getLocalEndpointMetrics(props.localModelMetrics, endpointUrl)?.healthy !== false,
      };
    })
    .concat(props.dashboard.instances.map((instance, index) => ({
      id: getCloudInstanceEndpointId(instance, index),
      endpointName: getCloudInstanceEndpointName(instance, index),
      modelName: getCloudInstanceModelName(instance),
      source: 'cloud' as EndpointSource,
      endpointUrl: '',
      available: true,
    })))
    .concat(localDeploymentOptions)
    .filter((endpoint) => activeEndpointSources.includes(endpoint.source));
  const selectedEndpointSourceLabels = endpointSources
    .filter((source) => activeEndpointSources.includes(source.value))
    .map((source) => source.label);
  const hasLocalEndpointSource = activeEndpointSources.includes('local');
  const localEndpointCount = props.dashboard.inferenceEndpoints.filter((endpoint) => getEndpointSource(endpoint) === 'local').length + localDeploymentOptions.length;
  const showLocalEmptyAction = hasLocalEndpointSource && localEndpointCount === 0;
  const selectedEndpointOptions = inferenceEndpointOptions.filter((endpoint) => routeDetails.attachedEndpointIds.includes(endpoint.id));
  const selectedGoal = routingGoals.find((goal) => goal.value === routeDetails.routingGoal) ?? routingGoals[0];
  const selectedAlgorithm = routingAlgorithms.find((algorithm) => algorithm.value === routeDetails.routingAlgorithm) ?? routingAlgorithms[0];
  const effectiveRouterRuntime: RouterRuntime = 'local';
  const selectedRouterModelId = normalizeHfRepoId(routeDetails.routingAlgorithm);
  const platform = getSupportedPlatform(props.dashboard.machineDetails?.platform);
  const recommendedRouterLibrary = getRecommendedRouterServingLibrary(selectedRouterModelId, platform);
  const selectedRouterLibrary = routerServingLibraries.find((library) => library.value === routeDetails.routerServingLibrary) ?? routerServingLibraries.find((library) => library.value === recommendedRouterLibrary) ?? routerServingLibraries[0];
  const selectedRouterLibrarySupported = isRouterServingLibrarySupported(selectedRouterLibrary, platform, selectedRouterModelId);
  const selectedRouterLibraryInstalled = selectedRouterLibrarySupported && props.libraries[selectedRouterLibrary.value];
  const selectedRouterLibraryBusy = props.busy === `install-${selectedRouterLibrary.value}` || props.busy === 'install-router-stack';
  const routerSetupIssue = getRouterSetupIssue(selectedRouterModelId, props.dashboard, props.localDeployments || []);

  useEffect(() => {
    if (!selectedRouterModelId) {
      return;
    }

    const currentLibrary = routerServingLibraries.find((library) => library.value === routeDetails.routerServingLibrary);
    if (!currentLibrary || !isRouterServingLibrarySupported(currentLibrary, platform, selectedRouterModelId)) {
      setRouteDetails((current) => ({ ...current, routerServingLibrary: getRecommendedRouterServingLibrary(selectedRouterModelId, platform) }));
    }
  }, [platform, selectedRouterModelId, routeDetails.routerServingLibrary]);

  useEffect(() => {
    if (!props.initialEndpointId) {
      return;
    }

    const endpoint = props.dashboard.inferenceEndpoints.find((item, index) => getInferenceEndpointId(item, index) === props.initialEndpointId);
    const localDeployment = (props.localDeployments || []).find((item) => getLocalDeploymentEndpointId(item) === props.initialEndpointId);
    const instance = props.dashboard.instances.find((item, index) => getCloudInstanceEndpointId(item, index) === props.initialEndpointId);
    if (!endpoint && !localDeployment && !instance) {
      return;
    }

    const endpointSource = endpoint ? getEndpointSource(endpoint) : localDeployment ? 'local' : 'cloud';
    setShowCreateRouteModal(true);
    setRouteDetails((current) => {
      const endpointSources = getActiveEndpointSources(current);
      return {
        ...current,
        endpointSources: endpointSources.includes(endpointSource) ? endpointSources : [...endpointSources, endpointSource],
        attachedEndpointIds: current.attachedEndpointIds.includes(props.initialEndpointId!)
          ? current.attachedEndpointIds
          : [...current.attachedEndpointIds, props.initialEndpointId!],
      };
    });
    props.onInitialEndpointConsumed?.();
  }, [props.initialEndpointId, props.dashboard.inferenceEndpoints, props.dashboard.instances, props.localDeployments, props.onInitialEndpointConsumed]);

  async function handleCreateRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = await props.onCreateRoute({
      ...routeDetails,
      routerRuntime: effectiveRouterRuntime,
      name: props.intelligentEndpointName,
    });
    if (created !== false) {
      setRouteDetails(defaultRouteDetails);
      setShowCreateRouteModal(false);
    }
  }

  function toggleEndpointSource(endpointSource: EndpointSource) {
    setRouteDetails((current) => {
      const currentEndpointSources = getActiveEndpointSources(current);
      const selected = currentEndpointSources.includes(endpointSource);
      const endpointSources = selected
        ? currentEndpointSources.filter((source) => source !== endpointSource)
        : [...currentEndpointSources, endpointSource];

      if (endpointSources.length === 0) {
        return current;
      }

      return {
        ...current,
        endpointSources,
        routerRuntime: 'local',
        attachedEndpointIds: current.attachedEndpointIds.filter((endpointId) => {
          const endpoint = props.dashboard.inferenceEndpoints.find((item, index) => getInferenceEndpointId(item, index) === endpointId);
          const instance = props.dashboard.instances.find((item, index) => getCloudInstanceEndpointId(item, index) === endpointId);
          if (endpoint) {
            return endpointSources.includes(getEndpointSource(endpoint));
          }
          return instance ? endpointSources.includes('cloud') : false;
        }),
      };
    });
  }

  function updateRoutingGoal(routingGoal: RoutingGoal) {
    const goal = routingGoals.find((item) => item.value === routingGoal) ?? routingGoals[0];
    setRouteDetails((current) => ({
      ...current,
      routingGoal,
      routingAlgorithm: routingGoal === 'custom' ? current.routingAlgorithm : goal.algorithm,
      routerServingLibrary: routingGoal === 'custom'
        ? current.routerServingLibrary
        : getRecommendedRouterServingLibrary(normalizeHfRepoId(goal.algorithm), platform),
    }));
  }

  function toggleEndpoint(endpointId: string) {
    setRouteDetails((current) => {
      const selected = current.attachedEndpointIds.includes(endpointId);
      return {
        ...current,
        attachedEndpointIds: selected
          ? current.attachedEndpointIds.filter((id) => id !== endpointId)
          : [...current.attachedEndpointIds, endpointId],
      };
    });
  }

  function handleCreateSelfHosting() {
    setShowCreateRouteModal(false);
    props.onCreateSelfHosting();
  }

  function handleSetupRouterEndpoint() {
    if (!selectedRouterModelId) {
      return;
    }

    setShowCreateRouteModal(false);
    props.onSetupRouterEndpoint?.(selectedRouterModelId);
  }

  return (
    <div className="flex flex-col">
      <header className="mb-0.5 flex h-8 shrink-0 items-center justify-between">
        <h2 className="m-0 text-lg font-semibold leading-none">Routing</h2>
        <button
          className="primary-button !h-7 !rounded-[0.625rem] !px-3 !py-0 !text-[0.8rem] !leading-none"
          onClick={() => setShowCreateRouteModal(true)}
          type="button"
        >
          Create Route
        </button>
      </header>

      <div className="glass-panel mb-5 mt-4 flex shrink-0 items-center rounded-[0.875rem] px-5 py-3 text-[0.9rem] text-[var(--muted)]">
        Loaded {props.dashboard.intelligentEndpoints.length} routes, {props.dashboard.inferenceEndpoints.length} inference endpoints, and {props.dashboard.models.length} catalog models for routing setup.
      </div>

      <div className="glass-panel w-full overflow-hidden">
        {props.dashboard.intelligentEndpoints.length === 0 ? (
          <div className="p-10 text-center">
            <p className="mb-5 text-base text-[var(--muted)]">No routes returned yet. Create a new route to get started.</p>
            <button className="primary-button mx-auto" onClick={() => setShowCreateRouteModal(true)} type="button">
              Create Route
            </button>
          </div>
        ) : (
          <div className="table-shell">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Name', 'Route ID', 'Status', 'Target', 'Updated', 'Actions'].map((heading) => (
                    <th key={heading} className={`px-4 py-3 text-[0.7rem] uppercase tracking-[0.05em] text-[var(--muted)] ${heading === 'Actions' ? 'text-right' : 'text-left'}`}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {props.dashboard.intelligentEndpoints.map((endpoint, index) => {
                  const routeId = getRouteId(endpoint, index);
                  const status = String(endpoint.status ?? endpoint.creation_status ?? 'active');
                  const routeName = String(endpoint.name ?? routeId);
                  const deleting = props.busy === `delete-route:${routeId}`;
                  return (
                    <tr key={routeId} className="border-t border-white/[0.04]">
                      <td className="px-4 py-6 font-semibold">{formatValue(routeName)}</td>
                      <td className="px-4 py-6 text-[0.85rem] text-[var(--muted)]">{routeId}</td>
                      <td className="px-4 py-6">
                        <span className={`status-pill ${isActiveStatus(status) ? 'active' : 'soft'}`}>{formatValue(status)}</span>
                      </td>
                      <td className="px-4 py-6 text-[0.85rem]">{formatValue(getRouteTarget(endpoint))}</td>
                      <td className="px-4 py-6 text-[0.85rem] text-[var(--muted)]">{formatValue(endpoint.updated_at ?? endpoint.created_at ?? 'Not available')}</td>
                      <td className="px-4 py-6 text-right">
                        <div className="flex justify-end gap-1">
                          <button className="ghost-button !border-0 !bg-transparent !px-2 !py-1 !text-[0.8rem]" onClick={() => props.onCopyRoute(routeId, endpoint)} type="button" title="Copy route URL">
                            <Copy size={14} />
                          </button>
                          <button className="ghost-button !border-0 !bg-transparent !px-2 !py-1 !text-[0.8rem]" onClick={() => setTestRoute({ id: routeId, name: routeName })} type="button" title="Test route">
                            <Play size={14} />
                          </button>
                          <button className="ghost-button !border-0 !bg-transparent !px-2 !py-1 !text-[0.8rem]" onClick={() => setEditRoute({ id: routeId, name: routeName })} type="button" title="Edit route">
                            <Pencil size={14} />
                          </button>
                          <button
                            className="ghost-button !border-0 !bg-transparent !px-2 !py-1 !text-[0.8rem] !text-[#ff7c78]"
                            disabled={deleting}
                            onClick={() => props.onDeleteRoute(routeId, routeName)}
                            type="button"
                            title="Delete route"
                          >
                            {deleting ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}
                          </button>
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

      <Modal title="Create Route" isOpen={showCreateRouteModal} onClose={() => setShowCreateRouteModal(false)}>
        <form className="stack-form" onSubmit={handleCreateRoute}>
          <label>
            <span>Route Name</span>
            <input
              autoFocus
              value={props.intelligentEndpointName}
              onChange={(event) => props.onIntelligentEndpointNameChange(event.target.value)}
              placeholder="Primary intelligent router"
            />
          </label>
          <div className="dense-grid">
            <label className="full-span">
              <span>Routing Goal</span>
              <div className="route-goal-grid">
                {routingGoals.map((goal) => (
                  <button
                    className={`route-goal-option${routeDetails.routingGoal === goal.value ? ' active' : ''}`}
                    key={goal.value}
                    onClick={() => updateRoutingGoal(goal.value)}
                    type="button"
                  >
                    <span className="route-goal-header">
                      <strong>{goal.title}</strong>
                      <span
                        className="route-goal-info"
                        onClick={(event) => {
                          event.stopPropagation();
                          setGoalInfo(goal);
                        }}
                        role="button"
                        tabIndex={0}
                        title={`About ${goal.title}`}
                      >
                        <Info size={14} />
                      </span>
                    </span>
                    <span>{goal.text}</span>
                    <small>Uses {goal.algorithmLabel}</small>
                  </button>
                ))}
              </div>
            </label>
            <div>
              <span className="field-label">Endpoint Sources</span>
              <div className="endpoint-source-options">
                {endpointSources.map((source) => {
                  const selected = activeEndpointSources.includes(source.value);
                  return (
                    <button
                      className={`endpoint-source-option${selected ? ' active' : ''}`}
                      key={source.value}
                      onClick={() => toggleEndpointSource(source.value)}
                      type="button"
                    >
                      {source.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="full-span">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[0.85rem] text-[var(--muted)]">Choose Endpoints</span>
                <span className="text-[0.75rem] text-[var(--muted)]">{selectedEndpointOptions.length} selected</span>
              </div>
              <div className="route-endpoint-list">
                {showLocalEmptyAction ? (
                  <div className="route-empty-action">
                    <span>No local endpoints available.</span>
                    <button className="secondary-button" onClick={handleCreateSelfHosting} type="button">
                      Create self hosting
                    </button>
                  </div>
                ) : null}
                {inferenceEndpointOptions.length === 0 && !showLocalEmptyAction ? (
                  <div className="empty-state">No endpoints available for {selectedEndpointSourceLabels.join(', ')}</div>
                ) : null}
                {inferenceEndpointOptions.map((endpoint) => {
                  const selected = routeDetails.attachedEndpointIds.includes(endpoint.id);
                  const statusLabel = endpoint.source === 'local'
                    ? endpoint.available ? 'online' : 'offline'
                    : 'ready';
                  return (
                    <button
                      className={`route-endpoint-option${selected ? ' active' : ''}`}
                      disabled={!endpoint.available}
                      key={endpoint.id}
                      onClick={() => toggleEndpoint(endpoint.id)}
                      type="button"
                    >
                      <span className="route-endpoint-check">{selected ? 'x' : ''}</span>
                      <span>
                        <strong>{endpoint.endpointName}</strong>
                        <small>{endpoint.modelName} · {formatEndpointSource(endpoint.source)} · {endpoint.id}</small>
                      </span>
                      <span className={`status-pill ${endpoint.available ? 'active' : 'soft'}`}>{statusLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="route-summary">
            <strong>{selectedGoal.title}</strong>
            <span>{selectedEndpointOptions.length === 0 ? 'Select at least two endpoints for meaningful routing.' : `${selectedEndpointOptions.length} endpoint${selectedEndpointOptions.length === 1 ? '' : 's'} selected.`}</span>
            <small>Algorithm: {selectedAlgorithm.family} / {selectedAlgorithm.label}</small>
            <small>Router runtime: Local</small>
            <small>Serving library: {selectedRouterLibrary.label}</small>
          </div>
          <div className="route-summary">
            <strong>Router Serving Library</strong>
            <span>Select the serving library used to host the routing algorithm model on this machine.</span>
            <RouterServingLibraryDropdown
              busy={props.busy}
              libraries={props.libraries}
              modelId={selectedRouterModelId}
              onInstall={props.onInstallLibrary}
              onOpenChange={setRouterLibraryOpen}
              onSelect={(library) => {
                setRouteDetails((current) => ({ ...current, routerServingLibrary: library }));
                setRouterLibraryOpen(false);
              }}
              open={routerLibraryOpen}
              platform={platform}
              selectedLibrary={routeDetails.routerServingLibrary}
            />
            <small>{getRouterServingLibraryHelp(selectedRouterLibrary, platform, selectedRouterModelId)}</small>
          </div>
          {routerSetupIssue ? (
            <div className="route-summary">
              <strong>Router setup required</strong>
              <span>{routerSetupIssue}</span>
              <button className="secondary-button" onClick={handleSetupRouterEndpoint} type="button">
                Set up router endpoint
              </button>
            </div>
          ) : null}
          <button className="ghost-button !justify-start !border-0 !bg-transparent !px-0 !py-1 !text-[0.85rem]" onClick={() => setShowAdvanced((open) => !open)} type="button">
            {showAdvanced ? 'Hide advanced settings' : 'Show advanced settings'}
          </button>
          {showAdvanced ? (
            <div className="dense-grid">
              <label>
                <span>Routing Algorithm</span>
                <select
                  value={routeDetails.routingAlgorithm}
                  onChange={(event) => setRouteDetails((current) => ({ ...current, routingGoal: 'custom', routingAlgorithm: event.target.value }))}
                >
                  {routingAlgorithms.map((algorithm) => (
                    <option key={algorithm.value} value={algorithm.value}>{algorithm.family} / {algorithm.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Router Runtime</span>
                <select value={effectiveRouterRuntime} disabled>
                  <option value="local">Local router</option>
                </select>
                <small className="field-help">
                  The selected routing algorithm is deployed locally. It can still choose local, cloud, OpenBandwidth, or closed-source candidate endpoints.
                </small>
              </label>
              <label>
                <span>Input Modality</span>
                <select
                  value={routeDetails.inputModality}
                  onChange={(event) => setRouteDetails((current) => ({ ...current, inputModality: event.target.value }))}
                >
                  <option value="text">Text</option>
                  <option value="image">Image</option>
                  <option value="audio">Audio</option>
                  <option value="video">Video</option>
                  <option value="multimodal">Multimodal</option>
                </select>
              </label>
            </div>
          ) : null}
          <label>
            <span>Description</span>
            <textarea
              rows={4}
              value={routeDetails.description}
              onChange={(event) => setRouteDetails((current) => ({ ...current, description: event.target.value }))}
              placeholder="Use for programming bug fixes, stack traces, dependency errors, and code repair tasks where correctness matters more than lowest latency."
            />
          </label>
          <div className="form-hint">
            Good descriptions name the domain, task/action, selection preference, and boundary. Example: Prefer local models for private drafts, simple code edits, and low-latency summaries; use cloud endpoints for complex reasoning, long-context debugging, or when local health is poor.
          </div>
          <button
            className="primary-button"
            type={routerSetupIssue ? 'button' : 'submit'}
            disabled={props.busy === 'create-intelligent-endpoint' || props.busy === 'install-router-stack' || !selectedRouterLibrarySupported}
            onClick={routerSetupIssue ? handleSetupRouterEndpoint : undefined}
          >
            {props.busy === 'create-intelligent-endpoint' || props.busy === 'install-router-stack' ? <LoaderCircle className="spin" size={16} /> : <Orbit size={16} />}
            {routerSetupIssue ? 'Set up router endpoint' : 'Create Route'}
          </button>
        </form>
      </Modal>

      <Modal title={`Test ${testRoute?.name ?? 'Route'}`} isOpen={Boolean(testRoute)} onClose={() => setTestRoute(null)}>
        <div className="stack-form">
          <label>
            <span>Prompt</span>
            <textarea rows={4} value={testPrompt} onChange={(event) => setTestPrompt(event.target.value)} />
          </label>
          <div className="route-summary">
            <strong>Backend execution hook pending</strong>
            <span>This is the UX shell for route testing. Next backend step: call `/developer/:developer_id/intelligent-endpoints/${testRoute?.id ?? 'route_id'}/chat/completions` and render selected endpoint, latency, fallback, and response.</span>
          </div>
          <button className="primary-button" type="button" disabled>
            <Play size={16} />
            Run Test
          </button>
        </div>
      </Modal>

      <Modal title={`Edit ${editRoute?.name ?? 'Route'}`} isOpen={Boolean(editRoute)} onClose={() => setEditRoute(null)}>
        <div className="stack-form">
          <div className="route-summary">
            <strong>Edit route UX placeholder</strong>
            <span>Next backend step: load route details, allow editing name, goal, advanced algorithm, and attached endpoints, then call the update route endpoint.</span>
          </div>
          <button className="secondary-button" type="button" onClick={() => setEditRoute(null)}>Close</button>
        </div>
      </Modal>

      <Modal title={goalInfo ? `${goalInfo.title} Routing` : 'Routing Goal'} isOpen={Boolean(goalInfo)} onClose={() => setGoalInfo(null)}>
        {goalInfo ? (
          <div className="stack-form">
            <div className="route-summary">
              <strong>Algorithm: {goalInfo.algorithmLabel}</strong>
              <span>Payload value: {goalInfo.algorithm}</span>
            </div>
            <div className="route-summary">
              <strong>How it works</strong>
              <span>{goalInfo.explanation}</span>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

type SupportedPlatform = 'windows' | 'macos' | 'linux' | 'unknown';

function getRouterSetupIssue(routerModelId: string, dashboard: DashboardState, localDeployments: LocalModelDeployment[]): string | null {
  void routerModelId;
  void dashboard;
  void localDeployments;
  if (!routerModelId || hasLocalRouterEndpoint(routerModelId, dashboard, localDeployments)) {
    return null;
  }

  return null;
}

function hasLocalRouterEndpoint(routerModelId: string, dashboard: DashboardState, localDeployments: LocalModelDeployment[]): boolean {
  return dashboard.inferenceEndpoints.some((endpoint) => {
    const record = endpoint as Record<string, unknown>;
    const endpointModelId = String(record.model_id ?? record.modelId ?? '');
    const endpointUrl = String(record.endpoint_url ?? '').toLowerCase();
    const deploymentTarget = String(record.deployment_target ?? '').toLowerCase();
    return endpointModelId === routerModelId
      && (deploymentTarget === 'local' || endpointUrl.includes('localhost') || endpointUrl.includes('127.0.0.1'));
  }) || localDeployments.some((deployment) => deployment.modelId === routerModelId);
}

function normalizeHfRepoId(value: string): string {
  const rawValue = value.trim();
  if (!rawValue) {
    return '';
  }

  if (rawValue.startsWith('http://') || rawValue.startsWith('https://')) {
    try {
      const url = new URL(rawValue);
      const parts = url.pathname.split('/').filter(Boolean);
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : '';
    } catch {
      return '';
    }
  }

  return rawValue.includes('/') ? rawValue : '';
}

function isOllamaCompatibleModelId(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return normalized.includes('gguf') || normalized.includes('ggml') || normalized.includes('llama.cpp') || normalized.includes('llamacpp');
}

function getSupportedPlatform(value: unknown): SupportedPlatform {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized.includes('win')) return 'windows';
  if (normalized.includes('darwin') || normalized.includes('mac')) return 'macos';
  if (normalized.includes('linux')) return 'linux';
  if (typeof navigator !== 'undefined') {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('windows')) return 'windows';
    if (userAgent.includes('mac')) return 'macos';
    if (userAgent.includes('linux')) return 'linux';
  }
  return 'unknown';
}

function RouterServingLibraryDropdown(props: {
  busy: string | null;
  libraries: Record<ServingLibrary, boolean>;
  modelId: string;
  onInstall: (library: ServingLibrary) => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  onSelect: (library: ServingLibrary) => void;
  open: boolean;
  platform: SupportedPlatform;
  selectedLibrary: ServingLibrary;
}) {
  const selectedOption = routerServingLibraries.find((option) => option.value === props.selectedLibrary) ?? routerServingLibraries[0];
  const selectedSupported = isRouterServingLibrarySupported(selectedOption, props.platform, props.modelId);
  const selectedInstalled = selectedSupported && props.libraries[selectedOption.value];

  return (
    <div className="serving-library-dropdown">
      <button
        aria-expanded={props.open}
        className={`serving-library-trigger ${selectedInstalled ? 'installed' : selectedSupported ? 'missing' : 'unsupported'}`}
        onClick={() => props.onOpenChange(!props.open)}
        type="button"
      >
        <span className="serving-library-trigger-main">
          <span />
          <strong>{selectedOption.label}</strong>
        </span>
        <span className="serving-library-trigger-meta">
          {selectedInstalled ? 'Installed' : selectedSupported ? 'Install available' : 'Unsupported'}
          <ChevronDown size={16} />
        </span>
      </button>
      {props.open ? (
        <div className="serving-library-menu">
          {routerServingLibraries.map((option) => {
            const supported = isRouterServingLibrarySupported(option, props.platform, props.modelId);
            const installed = supported && props.libraries[option.value];
            const optionBusy = props.busy === `install-${option.value}` || (option.value === 'transformers' && props.busy === 'install-router-stack');
            const selected = option.value === props.selectedLibrary;
            return (
              <div className={`serving-library-option ${selected ? 'selected' : ''} ${installed ? 'installed' : supported ? 'missing' : 'unsupported'}`} key={option.value}>
                <button
                  className="serving-library-option-select"
                  disabled={!supported}
                  onClick={() => props.onSelect(option.value)}
                  type="button"
                >
                  <span />
                  <strong>{option.label}</strong>
                  <small>{installed ? 'Installed' : supported ? 'Not installed' : 'Unsupported'}</small>
                </button>
                {!installed ? (
                  <button
                    className="serving-library-option-install"
                    disabled={!supported || optionBusy}
                    onClick={() => props.onInstall(option.value)}
                    type="button"
                  >
                    {optionBusy ? <LoaderCircle className="spin" size={12} /> : supported ? 'Install' : 'Unsupported'}
                  </button>
                ) : (
                  <span className="serving-library-option-installed"><CheckCircle2 size={14} /> Installed</span>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function getRecommendedRouterServingLibrary(modelId: string, platform: SupportedPlatform): ServingLibrary {
  if (isOllamaCompatibleModelId(modelId)) {
    return 'ollama';
  }

  return platform === 'windows' ? 'transformers' : 'vllm';
}

function isRouterServingLibrarySupported(
  library: { value: ServingLibrary; platforms: SupportedPlatform[]; directRuntime: boolean },
  platform: SupportedPlatform,
  modelId: string,
): boolean {
  const osSupported = platform === 'unknown' || library.platforms.includes(platform);
  if (!osSupported || !library.directRuntime) {
    return false;
  }

  const gguf = isOllamaCompatibleModelId(modelId);
  if (library.value === 'ollama') {
    return gguf;
  }

  if (library.value === 'vllm' || library.value === 'transformers') {
    return !gguf;
  }

  return false;
}

function getRouterServingLibraryHelp(
  library: { value: ServingLibrary; label: string; platforms: SupportedPlatform[]; directRuntime: boolean },
  platform: SupportedPlatform,
  modelId: string,
): string {
  const osSupported = platform === 'unknown' || library.platforms.includes(platform);
  if (!osSupported) {
    return `${library.label} is not supported on this OS for local routing.`;
  }

  if (!library.directRuntime) {
    return `${library.label} can be installed or checked, but route auto-hosting currently supports vLLM, Transformers, and Ollama.`;
  }

  const gguf = isOllamaCompatibleModelId(modelId);
  if (library.value === 'ollama') {
    return gguf ? 'Ollama can host GGUF/llama.cpp router models.' : 'Ollama only supports GGUF/llama.cpp router models.';
  }

  if (library.value === 'transformers') {
    return gguf ? 'Transformers is for Hugging Face Transformers-format router models, not GGUF.' : 'Transformers installs/uses PyTorch and can host Hugging Face router models locally.';
  }

  if (library.value === 'vllm') {
    return platform === 'windows'
      ? 'vLLM routing auto-hosting is not available on Windows in this app flow.'
      : 'vLLM can host supported Hugging Face router models on Linux/macOS.';
  }

  return '';
}

function getRouteId(endpoint: EndpointItem, index: number): string {
  return String(endpoint.intelligent_endpoint_id ?? endpoint.endpoint_id ?? endpoint.id ?? `route-${index + 1}`);
}

function getInferenceEndpointId(endpoint: EndpointItem, index: number): string {
  return String(endpoint.inference_endpoint_id ?? endpoint.endpoint_id ?? endpoint.id ?? `endpoint-${index + 1}`);
}

function getInferenceEndpointName(endpoint: EndpointItem, index: number): string {
  const explicitName = endpoint.name ?? endpoint.endpoint_name;
  if (explicitName) {
    return String(explicitName);
  }

  return `Unnamed endpoint ${index + 1}`;
}

function getInferenceEndpointModelName(endpoint: EndpointItem, index: number): string {
  return String(endpoint.model_id ?? endpoint.model_name ?? endpoint.name ?? `Model ${index + 1}`);
}

function getLocalDeploymentEndpointId(deployment: LocalModelDeployment): string {
  return `local:${deployment.endpointUrl}::${deployment.modelId}`;
}

function getLocalEndpointKey(endpointUrl: string, modelId: string): string {
  return `${endpointUrl}::${modelId}`;
}

function getLocalEndpointMetrics(metricsMap: Record<string, LocalModelMetrics> | undefined, endpointUrl: string): LocalModelMetrics | undefined {
  if (!metricsMap || !endpointUrl) {
    return undefined;
  }

  const normalizedEndpointUrl = normalizeLocalEndpointUrl(endpointUrl);
  return metricsMap[endpointUrl] ?? metricsMap[normalizedEndpointUrl];
}

function normalizeLocalEndpointUrl(endpointUrl: string): string {
  return endpointUrl.trim().replace('://localhost', '://127.0.0.1').replace('://0.0.0.0', '://127.0.0.1').replace(/\/+$/, '');
}

function getCloudInstanceEndpointId(instance: InstanceItem, index: number): string {
  return String(instance.inference_endpoint_id ?? instance.endpoint_id ?? instance.instance_id ?? instance.unique_instance_id ?? instance.id ?? `cloud-instance-${index + 1}`);
}

function getCloudInstanceEndpointName(instance: InstanceItem, index: number): string {
  return String(instance.instance_name ?? instance.name ?? instance.instance_id ?? `Cloud instance ${index + 1}`);
}

function getCloudInstanceModelName(instance: InstanceItem): string {
  return String(instance.model_id ?? instance.model_name ?? instance.gpu_name ?? instance.provider_name ?? 'Cloud instance');
}

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

function isRouterEndpointLike(endpoint: Record<string, unknown>): boolean {
  const role = String(endpoint.endpoint_role ?? endpoint.role ?? '').toLowerCase();
  if (role === 'router') {
    return true;
  }

  const text = [
    endpoint.name,
    endpoint.endpoint_name,
    endpoint.model_id,
    endpoint.modelId,
  ].filter(Boolean).join(' ').toLowerCase();

  return text.includes(' router') || text.endsWith('router') || routingAlgorithms.some((algorithm) => normalizeHfRepoId(algorithm.value).toLowerCase() === String(endpoint.model_id ?? endpoint.modelId ?? '').toLowerCase());
}

function getActiveEndpointSources(routeDetails: CreateRouteDetails): EndpointSource[] {
  if (Array.isArray(routeDetails.endpointSources) && routeDetails.endpointSources.length > 0) {
    return routeDetails.endpointSources;
  }

  const legacySource = (routeDetails as Partial<CreateRouteDetails> & { endpointSource?: EndpointSource }).endpointSource;
  return legacySource ? [legacySource] : defaultRouteDetails.endpointSources;
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

function formatEndpointSource(source: EndpointSource): string {
  if (source === 'closed_source_api') {
    return 'Closed source API';
  }
  if (source === 'openbandwidth') {
    return 'OpenBandwidth';
  }
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function getRouteTarget(endpoint: EndpointItem): unknown {
  const attachedEndpointName = getAttachedEndpointName(endpoint);
  return attachedEndpointName
    ?? endpoint.name
    ?? endpoint.model_id
    ?? endpoint.provider
    ?? endpoint.endpoint_url
    ?? endpoint.inference_endpoint_id
    ?? endpoint.endpoint_id
    ?? 'Not attached';
}

function getAttachedEndpointName(endpoint: EndpointItem): string | undefined {
  const attachedEndpoints = endpoint.attached_endpoints;
  if (!attachedEndpoints || typeof attachedEndpoints !== 'object') {
    return undefined;
  }

  const endpointGroups = attachedEndpoints as Record<string, unknown>;
  const attachedEndpoint = endpointGroups.inference_api ?? endpointGroups.dedicated;
  const firstEndpoint = Array.isArray(attachedEndpoint) ? attachedEndpoint[0] : attachedEndpoint;
  const routeName = typeof endpoint.name === 'string' ? endpoint.name : undefined;
  if (!firstEndpoint || typeof firstEndpoint !== 'object') {
    return typeof firstEndpoint === 'string' ? routeName : undefined;
  }

  const record = firstEndpoint as Record<string, unknown>;
  return String(record.endpoint_name ?? record.name ?? routeName ?? '') || undefined;
}

function isActiveStatus(status: string): boolean {
  const normalizedStatus = status.toLowerCase();
  return normalizedStatus === 'active' || normalizedStatus === 'running' || normalizedStatus === 'ready';
}
