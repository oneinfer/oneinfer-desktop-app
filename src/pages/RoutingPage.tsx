import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { CheckCircle2, ChevronDown, Cloud, Copy, Cpu, Info, LoaderCircle, Orbit, Pencil, Play, Plus, Trash2 } from 'lucide-react';

import { Modal } from '../components/Common';
import oneInferLogo from '../assets/oneinfer-logo.png';
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
type RouteBuilderStep = 'goal' | 'inputs' | 'blueprint';

const defaultRoutingAlgorithm = 'https://huggingface.co/katanemo/Arch-Router-1.5B';

const routingAlgorithmDescriptions: Record<string, string> = {
  'https://huggingface.co/katanemo/Arch-Router-1.5B': 'Use for balanced production routing across mixed endpoint pools where prompt complexity, expected quality, latency, and cost all need to be considered before selecting the best model.',
  'https://huggingface.co/routellm/bert': 'Use for low-latency text routing when requests need a lightweight classifier to choose between faster and stronger endpoints with minimal router overhead.',
  'https://huggingface.co/routellm/bert_gpt4_augmented': 'Use for quality-aware text routing with BERT scoring tuned from GPT-4 preference signals, especially when separating simple prompts from prompts that need a stronger model.',
  'https://huggingface.co/routellm/bert_mmlu_augmented': 'Use for academic, factual, and knowledge-heavy prompts where BERT routing should favor endpoints that perform better on MMLU-style reasoning and evaluation tasks.',
  'https://huggingface.co/routellm/causal_llm': 'Use for flexible prompt-aware routing when a generative router should inspect the request more deeply before choosing the most suitable endpoint.',
  'https://huggingface.co/routellm/causal_llm_gpt4_augmented': 'Use for complex instruction routing where GPT-4-augmented preferences help decide when to escalate from efficient endpoints to stronger reasoning models.',
  'https://huggingface.co/routellm/causal_llm_mmlu_augmented': 'Use for complex knowledge, benchmark-style, and reasoning prompts where a causal router should favor endpoints with stronger MMLU-style capability.',
  'https://huggingface.co/routellm/mf': 'Use for cost-sensitive routing across known model pairs where matrix factorization can efficiently rank endpoint preferences and send simple work to cheaper capable models.',
  'https://huggingface.co/routellm/mf_gpt4_augmented': 'Use for cost and quality tradeoffs where GPT-4-augmented preference data helps the route choose affordable endpoints for simple tasks and stronger endpoints for difficult prompts.',
  'https://huggingface.co/routellm/mf_mmlu_augmented': 'Use for factual and reasoning workloads where matrix factorization should account for MMLU-style performance while still keeping routing lightweight and cost aware.',
  'https://huggingface.co/ulab-ai/Router-R1-Qwen2.5-3B-Instruct': 'Use for quality-sensitive instruction routing where a Qwen-based router should direct harder prompts to stronger models and keep simpler prompts on efficient endpoints.',
  'https://huggingface.co/ulab-ai/Router-R1-Qwen2.5-3B-Instruct-Alpha0.9': 'Use for Qwen-based Router-R1 routing with a stronger preference toward high-quality endpoints, suitable when correctness matters more than minimizing cost or latency.',
  'https://huggingface.co/ulab-ai/Router-R1-Llama-3.2-3B-Instruct': 'Use for instruction-following route decisions with a Llama-based router that balances endpoint capability, prompt difficulty, and response quality.',
  'https://huggingface.co/ulab-ai/Router-R1-Llama-3.2-3B-Instruct-Alpha0.9': 'Use for Llama-based Router-R1 routing with a higher quality bias, suitable for support, coding, and reasoning workflows that should avoid underpowered endpoints.',
  'https://huggingface.co/llm-semantic-router/mmbert32k-modality-router-merged': 'Use for semantic and modality-aware routing across text and multimodal endpoint pools, especially when requests should be matched by input type before model quality or cost.',
};

const defaultRouteDetails: CreateRouteDetails = {
  endpointSources: ['local'],
  routingGoal: 'balanced',
  modelId: '',
  attachedEndpointIds: [],
  inputModality: 'text',
  routingAlgorithm: defaultRoutingAlgorithm,
  routerRuntime: 'local',
  routerServingLibrary: 'transformers',
  description: routingAlgorithmDescriptions[defaultRoutingAlgorithm],
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
].map((algorithm) => ({
  ...algorithm,
  description: routingAlgorithmDescriptions[algorithm.value],
}));

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
  initialRouteId?: string | null;
  onInitialRouteConsumed?: () => void;
}) {
  const [showCreateRouteModal, setShowCreateRouteModal] = useState(false);
  const [routeBuilderStep, setRouteBuilderStep] = useState<RouteBuilderStep>('goal');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [blueprintMenuOpen, setBlueprintMenuOpen] = useState(false);
  const [blueprintGoalOpen, setBlueprintGoalOpen] = useState(false);
  const [testRoute, setTestRoute] = useState<{ id: string; name: string } | null>(null);
  const [editRoute, setEditRoute] = useState<{ id: string; name: string } | null>(null);
  const [blueprintRoute, setBlueprintRoute] = useState<EndpointItem | null>(null);
  const [goalInfo, setGoalInfo] = useState<(typeof routingGoals)[number] | null>(null);
  const [routerLibraryOpen, setRouterLibraryOpen] = useState(false);
  const [testPrompt, setTestPrompt] = useState('Explain what this route is optimized for in one sentence.');
  const [routeBuilderError, setRouteBuilderError] = useState('');
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
  const canContinueToBlueprint = props.intelligentEndpointName.trim().length > 0 && routeDetails.attachedEndpointIds.length > 0;

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
    setRouteBuilderStep('goal');
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

  useEffect(() => {
    if (!props.initialRouteId) {
      return;
    }

    const route = props.dashboard.intelligentEndpoints.find((item, index) => getRouteId(item, index) === props.initialRouteId);
    if (!route) {
      return;
    }

    setBlueprintRoute(route);
    props.onInitialRouteConsumed?.();
  }, [props.initialRouteId, props.dashboard.intelligentEndpoints, props.onInitialRouteConsumed]);

  async function handleCreateRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (routeBuilderStep !== 'blueprint') {
      if (routeBuilderStep === 'goal') {
        setRouteBuilderError('');
        setRouteBuilderStep('inputs');
        return;
      }

      previewBlueprint();
      return;
    }

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

  function openCreateRouteModal() {
    setRouteBuilderError('');
    setRouteBuilderStep('goal');
    setShowCreateRouteModal(true);
  }

  function closeCreateRouteModal() {
    setShowCreateRouteModal(false);
    setBlueprintMenuOpen(false);
    setBlueprintGoalOpen(false);
    setRouterLibraryOpen(false);
    setShowAdvanced(false);
    setRouteBuilderError('');
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
          const localDeployment = (props.localDeployments || []).find((item) => getLocalDeploymentEndpointId(item) === endpointId);
          if (endpoint) {
            return endpointSources.includes(getEndpointSource(endpoint));
          }
          if (localDeployment) {
            return endpointSources.includes('local');
          }
          return instance ? endpointSources.includes('cloud') : false;
        }),
      };
    });
  }

  function updateRoutingGoal(routingGoal: RoutingGoal) {
    const goal = routingGoals.find((item) => item.value === routingGoal) ?? routingGoals[0];
    setRouteDetails((current) => {
      const routingAlgorithm = routingGoal === 'custom' ? current.routingAlgorithm : goal.algorithm;
      return {
        ...current,
        routingGoal,
        routingAlgorithm,
        routerServingLibrary: routingGoal === 'custom'
          ? current.routerServingLibrary
          : getRecommendedRouterServingLibrary(normalizeHfRepoId(routingAlgorithm), platform),
        description: routingAlgorithmDescriptions[routingAlgorithm] ?? current.description,
      };
    });
  }

  function updateRoutingAlgorithm(routingAlgorithm: string) {
    setRouteDetails((current) => ({
      ...current,
      routingGoal: 'custom',
      routingAlgorithm,
      routerServingLibrary: getRecommendedRouterServingLibrary(normalizeHfRepoId(routingAlgorithm), platform),
      description: routingAlgorithmDescriptions[routingAlgorithm] ?? current.description,
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
    setRouteBuilderError('');
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

  function goToRouteBuilderStep(step: RouteBuilderStep) {
    if (step === 'blueprint') {
      previewBlueprint();
      return;
    }

    setRouteBuilderError('');
    setRouteBuilderStep(step);
  }

  function previewBlueprint() {
    if (!props.intelligentEndpointName.trim()) {
      setRouteBuilderError('Name the router before previewing the blueprint.');
      setRouteBuilderStep('inputs');
      return;
    }

    if (routeDetails.attachedEndpointIds.length === 0) {
      setRouteBuilderError('Select at least one routing target before previewing the blueprint.');
      setRouteBuilderStep('inputs');
      return;
    }

    setRouteBuilderError('');
    setRouteBuilderStep('blueprint');
  }

  return (
    <div className="flex flex-col">
      <header className="mb-5 flex h-8 shrink-0 items-center justify-between">
        <h2 className="m-0 text-lg font-semibold leading-none">Routing</h2>
        <button
          className="primary-button !h-7 !rounded-[0.625rem] !px-3 !py-0 !text-[0.8rem] !leading-none"
          onClick={openCreateRouteModal}
          type="button"
        >
          Create Router
        </button>
      </header>

      <div className="glass-panel w-full overflow-hidden">
        {props.dashboard.intelligentEndpoints.length === 0 ? (
          <div className="p-10 text-center">
            <p className="mb-5 text-base text-[var(--muted)]">No routers returned yet. Create a new router to get started.</p>
            <button className="primary-button mx-auto" onClick={openCreateRouteModal} type="button">
              Create Router
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
                    <tr
                      key={routeId}
                      className="cursor-pointer border-t border-white/[0.04]"
                      onClick={() => setBlueprintRoute(endpoint)}
                      title="Open router blueprint"
                    >
                      <td className="px-4 py-6 font-semibold">{formatValue(routeName)}</td>
                      <td className="px-4 py-6 text-[0.85rem] text-[var(--muted)]">{routeId}</td>
                      <td className="px-4 py-6">
                        <span className={`status-pill ${isActiveStatus(status) ? 'active' : 'soft'}`}>{formatValue(status)}</span>
                      </td>
                      <td className="px-4 py-6 text-[0.85rem]">{formatValue(getRouteTarget(endpoint))}</td>
                      <td className="px-4 py-6 text-[0.85rem] text-[var(--muted)]">{formatValue(endpoint.updated_at ?? endpoint.created_at ?? 'Not available')}</td>
                      <td className="px-4 py-6 text-right">
                        <div className="flex justify-end gap-1">
                          <button className="ghost-button !border-0 !bg-transparent !px-2 !py-1 !text-[0.8rem]" onClick={(event) => { event.stopPropagation(); props.onCopyRoute(routeId, endpoint); }} type="button" title="Copy route URL">
                            <Copy size={14} />
                          </button>
                          <button className="ghost-button !border-0 !bg-transparent !px-2 !py-1 !text-[0.8rem]" onClick={(event) => { event.stopPropagation(); setTestRoute({ id: routeId, name: routeName }); }} type="button" title="Test route">
                            <Play size={14} />
                          </button>
                          <button className="ghost-button !border-0 !bg-transparent !px-2 !py-1 !text-[0.8rem]" onClick={(event) => { event.stopPropagation(); setEditRoute({ id: routeId, name: routeName }); }} type="button" title="Edit route">
                            <Pencil size={14} />
                          </button>
                          <button
                            className="ghost-button !border-0 !bg-transparent !px-2 !py-1 !text-[0.8rem] !text-[#ff7c78]"
                            disabled={deleting}
                            onClick={(event) => { event.stopPropagation(); props.onDeleteRoute(routeId, routeName); }}
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

      <Modal title="Create Router" isOpen={showCreateRouteModal} onClose={closeCreateRouteModal}>
        <form className="stack-form route-blueprint-modal" onSubmit={handleCreateRoute}>
          <div className="route-builder-tabs">
            <button className={routeBuilderStep === 'goal' ? 'active' : ''} onClick={() => goToRouteBuilderStep('goal')} type="button">1. Goal</button>
            <button className={routeBuilderStep === 'inputs' ? 'active' : ''} onClick={() => goToRouteBuilderStep('inputs')} type="button">2. Router Details</button>
            <button className={routeBuilderStep === 'blueprint' ? 'active' : ''} disabled={!canContinueToBlueprint} onClick={() => goToRouteBuilderStep('blueprint')} type="button">3. Blueprint</button>
          </div>

          {routeBuilderStep === 'goal' ? (
            <div className="route-step-panel">
              <div className="route-step-heading">
                <strong>What should this router optimize for?</strong>
                <span>The goal chooses a recommended routing algorithm. You can still adjust it later in review.</span>
              </div>
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
              <div className="route-step-actions">
                <button className="primary-button" onClick={() => setRouteBuilderStep('inputs')} type="button">
                  Continue to router details
                </button>
              </div>
            </div>
          ) : null}

          {routeBuilderStep === 'inputs' ? (
            <div className="route-step-panel">
              <div className="route-step-heading">
                <strong>Add the router details</strong>
                <span>Name the router and choose the endpoints it can send traffic to.</span>
              </div>
              <label>
                <span>Router Name</span>
                <input
                  autoFocus
                  value={props.intelligentEndpointName}
                  onChange={(event) => {
                    props.onIntelligentEndpointNameChange(event.target.value);
                    setRouteBuilderError('');
                  }}
                  placeholder="Primary intelligent router"
                />
              </label>
              <div className="dense-grid">
                <div className="full-span">
                  <span className="field-label">Routing Sources</span>
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
                    <span className="text-[0.85rem] text-[var(--muted)]">Choose Routing Targets</span>
                    <span className="text-[0.75rem] text-[var(--muted)]">{selectedEndpointOptions.length} selected</span>
                  </div>
                  <div className="route-endpoint-list">
                    {showLocalEmptyAction ? (
                      <div className="route-empty-action">
                        <span>No local routing targets available.</span>
                        <button className="secondary-button" onClick={handleCreateSelfHosting} type="button">
                          Create self hosting
                        </button>
                      </div>
                    ) : null}
                    {inferenceEndpointOptions.length === 0 && !showLocalEmptyAction ? (
                      <div className="empty-state">No routing targets available for {selectedEndpointSourceLabels.join(', ')}</div>
                    ) : null}
                    {inferenceEndpointOptions.map((endpoint) => {
                      const selected = routeDetails.attachedEndpointIds.includes(endpoint.id);
                      const statusLabel = endpoint.source === 'local'
                        ? endpoint.available ? 'online' : 'offline'
                        : 'ready';
                      return (
                        <label
                          className={`route-endpoint-option${selected ? ' active' : ''}`}
                          key={endpoint.id}
                        >
                          <input
                            checked={selected}
                            className="route-endpoint-checkbox"
                            disabled={!endpoint.available}
                            onChange={() => toggleEndpoint(endpoint.id)}
                            type="checkbox"
                          />
                          <span className="route-endpoint-check">
                            {selected ? <CheckCircle2 size={15} /> : null}
                          </span>
                          <span>
                            <strong>{endpoint.endpointName}</strong>
                            <small>{endpoint.modelName} · {formatEndpointSource(endpoint.source)} · {endpoint.id}</small>
                          </span>
                          <span className={`status-pill ${endpoint.available ? 'active' : 'soft'}`}>{statusLabel}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
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
              {routeBuilderError ? (
                <div className="route-step-warning">{routeBuilderError}</div>
              ) : null}
              <div className="route-step-actions">
                <button className="secondary-button" onClick={() => setRouteBuilderStep('goal')} type="button">
                  Back
                </button>
                <button className="primary-button" onClick={previewBlueprint} type="button">
                  Preview blueprint
                </button>
              </div>
            </div>
          ) : null}

          {routeBuilderStep === 'blueprint' ? (
            <div className="route-step-panel">
              <div className="route-step-heading">
                <strong>Review the router blueprint</strong>
                <span>Confirm how requests will move through the router before creating it.</span>
              </div>
              <RouteBlueprintDiagram
                activeEndpointSources={activeEndpointSources}
                blueprintMenuOpen={blueprintMenuOpen}
                endpointSources={endpointSources}
                interactive={false}
                onAddTarget={() => setRouteBuilderStep('inputs')}
                onMenuChange={setBlueprintMenuOpen}
                goalMenuOpen={blueprintGoalOpen}
                onRoutingAlgorithmChange={updateRoutingAlgorithm}
                onRoutingGoalChange={updateRoutingGoal}
                onGoalMenuChange={setBlueprintGoalOpen}
                onToggleEndpointSource={toggleEndpointSource}
                routeName={props.intelligentEndpointName}
                routingAlgorithms={routingAlgorithms}
                routingGoals={routingGoals}
                selectedAlgorithm={selectedAlgorithm}
                selectedEndpoints={selectedEndpointOptions}
                selectedGoal={selectedGoal}
              />
              <div className="route-summary">
                <strong>{selectedGoal.title}</strong>
                <span>{selectedEndpointOptions.length === 0 ? 'Select at least one routing target.' : `${selectedEndpointOptions.length} routing target${selectedEndpointOptions.length === 1 ? '' : 's'} selected.`}</span>
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
                      onChange={(event) => updateRoutingAlgorithm(event.target.value)}
                    >
                      {routingAlgorithms.map((algorithm) => (
                        <option key={algorithm.value} value={algorithm.value}>{algorithm.family} / {algorithm.label}</option>
                      ))}
                    </select>
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
                    <small className="field-help">
                      Most routers should stay on Text. Change this only for image, audio, video, or mixed-modality endpoint pools.
                    </small>
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
                </div>
              ) : null}
              <div className="route-step-actions">
                <button className="secondary-button" onClick={() => setRouteBuilderStep('inputs')} type="button">
                  Back
                </button>
                <button
                  className="primary-button"
                  type={routerSetupIssue ? 'button' : 'submit'}
                  disabled={props.busy === 'create-intelligent-endpoint' || props.busy === 'install-router-stack' || !selectedRouterLibrarySupported}
                  onClick={routerSetupIssue ? handleSetupRouterEndpoint : undefined}
                >
                  {props.busy === 'create-intelligent-endpoint' || props.busy === 'install-router-stack' ? <LoaderCircle className="spin" size={16} /> : <Orbit size={16} />}
                  {routerSetupIssue ? 'Set up router endpoint' : 'Create Router'}
                </button>
              </div>
            </div>
          ) : null}
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

      <Modal title={`${getBlueprintRouteName(blueprintRoute) || 'Router'} Blueprint`} isOpen={Boolean(blueprintRoute)} onClose={() => setBlueprintRoute(null)}>
        {blueprintRoute ? (
          <div className="stack-form route-blueprint-modal">
            <RouteBlueprintDiagram
              activeEndpointSources={getBlueprintEndpointSources(blueprintRoute)}
              blueprintMenuOpen={false}
              endpointSources={endpointSources}
              interactive={false}
              goalMenuOpen={false}
              onGoalMenuChange={() => {}}
              onMenuChange={() => {}}
              onRoutingAlgorithmChange={() => {}}
              onRoutingGoalChange={() => {}}
              onToggleEndpointSource={() => {}}
              routeName={getBlueprintRouteName(blueprintRoute)}
              routingAlgorithms={routingAlgorithms}
              routingGoals={routingGoals}
              selectedAlgorithm={getBlueprintSelectedAlgorithm(blueprintRoute)}
              selectedEndpoints={getBlueprintRouteEndpoints(blueprintRoute)}
              selectedGoal={getBlueprintSelectedGoal(blueprintRoute)}
            />
            <div className="route-summary">
              <strong>{getBlueprintSelectedGoal(blueprintRoute).title}</strong>
              <span>{getBlueprintRouteEndpoints(blueprintRoute).length} routing target{getBlueprintRouteEndpoints(blueprintRoute).length === 1 ? '' : 's'} attached.</span>
              <small>Algorithm: {getBlueprintSelectedAlgorithm(blueprintRoute).family} / {getBlueprintSelectedAlgorithm(blueprintRoute).label}</small>
              <small>Status: {formatValue(blueprintRoute.status ?? blueprintRoute.creation_status ?? 'active')}</small>
            </div>
          </div>
        ) : null}
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

type RouteEndpointOption = {
  id: string;
  endpointName: string;
  modelName: string;
  source: EndpointSource;
  endpointUrl: string;
  available: boolean;
};

function RouteBlueprintDiagram(props: {
  activeEndpointSources: EndpointSource[];
  blueprintMenuOpen: boolean;
  endpointSources: typeof endpointSources;
  interactive?: boolean;
  goalMenuOpen: boolean;
  onAddTarget?: () => void;
  onGoalMenuChange: (open: boolean) => void;
  onMenuChange: (open: boolean) => void;
  onRoutingAlgorithmChange: (algorithm: string) => void;
  onRoutingGoalChange: (goal: RoutingGoal) => void;
  onToggleEndpointSource: (source: EndpointSource) => void;
  routeName: string;
  routingAlgorithms: typeof routingAlgorithms;
  routingGoals: typeof routingGoals;
  selectedAlgorithm: (typeof routingAlgorithms)[number];
  selectedEndpoints: RouteEndpointOption[];
  selectedGoal: (typeof routingGoals)[number];
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const visibleEndpoints = props.selectedEndpoints.length > 0
    ? props.selectedEndpoints
    : [{
      id: 'candidate-endpoint',
      endpointName: 'Routing Target',
      modelName: 'Select routing targets below',
      source: 'cloud' as EndpointSource,
      endpointUrl: '',
      available: true,
    }];
  const endpointPreview = visibleEndpoints.slice(0, 5);
  const overflowCount = Math.max(0, visibleEndpoints.length - endpointPreview.length);
  const nodeIds = ['source', 'engine', ...endpointPreview.map((endpoint) => `target:${endpoint.id}`)];
  const positions = Object.fromEntries(nodeIds.map((nodeId, index) => [nodeId, nodePositions[nodeId] ?? getDefaultBlueprintNodePosition(nodeId, index, endpointPreview.length)]));

  useEffect(() => {
    setNodePositions((current) => {
      const next: Record<string, { x: number; y: number }> = {};
      nodeIds.forEach((nodeId, index) => {
        next[nodeId] = current[nodeId] ?? getDefaultBlueprintNodePosition(nodeId, index, endpointPreview.length);
      });
      return next;
    });
  }, [props.routeName, endpointPreview.map((endpoint) => endpoint.id).join('|')]);

  function beginDrag(nodeId: string, event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = canvas.getBoundingClientRect();
    const currentPosition = positions[nodeId] ?? getDefaultBlueprintNodePosition(nodeId, 0, endpointPreview.length);
    const startPointer = { x: event.clientX, y: event.clientY };
    const startPosition = { x: (currentPosition.x / 100) * rect.width, y: (currentPosition.y / 100) * rect.height };

    function handlePointerMove(moveEvent: PointerEvent) {
      const nextX = ((startPosition.x + moveEvent.clientX - startPointer.x) / rect.width) * 100;
      const nextY = ((startPosition.y + moveEvent.clientY - startPointer.y) / rect.height) * 100;
      setNodePositions((current) => ({
        ...current,
        [nodeId]: {
          x: clamp(nextX, 2, 82),
          y: clamp(nextY, 8, 82),
        },
      }));
    }

    function handlePointerUp() {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  return (
    <div className="route-blueprint-shell">
      <div className="route-flow-canvas route-flow-canvas-freeform" ref={canvasRef}>
        <BlueprintConnector
          from={positions.source}
          to={positions.engine}
        />
        {endpointPreview.map((endpoint) => (
          <BlueprintConnector
            from={positions.engine}
            key={`connector:${endpoint.id}`}
            to={positions[`target:${endpoint.id}`]}
          />
        ))}
        <BlueprintNode
          kind="main"
          nodeId="source"
          onPointerDown={beginDrag}
          position={positions.source}
          subtitle="Intelligent Router"
          title={props.routeName || 'My Router'}
        />
        <div
          className="route-engine-node-wrap route-blueprint-free-node"
          onPointerDown={(event) => beginDrag('engine', event)}
          style={{ left: `${positions.engine.x}%`, top: `${positions.engine.y}%` }}
        >
          <BlueprintNodeContent
            image={oneInferLogo}
            kind="engine"
            onClick={props.interactive ? () => props.onGoalMenuChange(!props.goalMenuOpen) : undefined}
            subtitle={`${props.selectedGoal.title} / ${props.selectedAlgorithm.label}`}
            title="OneInfer Engine"
          />
          {props.interactive && props.goalMenuOpen ? (
            <div className="route-goal-menu">
              {props.routingGoals.map((goal) => (
                <button
                  className={props.selectedGoal.value === goal.value ? 'active' : ''}
                  key={goal.value}
                  onClick={() => {
                    props.onRoutingGoalChange(goal.value);
                    props.onGoalMenuChange(false);
                  }}
                  type="button"
                >
                  <strong>{goal.title}</strong>
                  <span>{goal.algorithmLabel}</span>
                </button>
              ))}
            </div>
          ) : null}
          {props.interactive ? (
            <div className="route-engine-controls">
              <label>
                <span>Routing Algorithm</span>
                <select value={props.selectedAlgorithm.value} onChange={(event) => props.onRoutingAlgorithmChange(event.target.value)}>
                  {props.routingAlgorithms.map((algorithm) => (
                    <option key={algorithm.value} value={algorithm.value}>{algorithm.family} / {algorithm.label}</option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          {props.interactive ? (
            <button
              className="route-engine-add"
              onClick={() => props.onMenuChange(!props.blueprintMenuOpen)}
              onPointerDown={(event) => event.stopPropagation()}
              type="button"
              title="Add routing target"
            >
              <Plus size={18} />
            </button>
          ) : null}
          {!props.interactive && props.onAddTarget ? (
            <button
              className="route-engine-add route-engine-add-review"
              onClick={props.onAddTarget}
              onPointerDown={(event) => event.stopPropagation()}
              type="button"
              title="Add routing target"
            >
              <Plus size={18} />
            </button>
          ) : null}
          {props.interactive && props.blueprintMenuOpen ? (
            <div className="route-engine-menu">
              {props.endpointSources.map((source) => {
                const selected = props.activeEndpointSources.includes(source.value);
                return (
                  <button
                    className={selected ? 'active' : ''}
                    key={source.value}
                    onClick={() => props.onToggleEndpointSource(source.value)}
                    type="button"
                  >
                    {source.value === 'local' ? <Cpu size={14} /> : <Cloud size={14} />}
                    <span>{source.label}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        {endpointPreview.map((endpoint) => (
          <BlueprintNode
            key={endpoint.id}
            kind="candidate"
            nodeId={`target:${endpoint.id}`}
            onPointerDown={beginDrag}
            position={positions[`target:${endpoint.id}`]}
            subtitle={`${formatEndpointSource(endpoint.source)} / ${endpoint.modelName}`}
            title={endpoint.endpointName}
          />
        ))}
        {overflowCount > 0 ? (
          <div className="route-blueprint-more route-blueprint-free-more">+{overflowCount} more</div>
        ) : null}
      </div>
    </div>
  );
}

function BlueprintNode(props: {
  image?: string;
  kind: 'main' | 'engine' | 'candidate';
  nodeId: string;
  onClick?: () => void;
  onPointerDown: (nodeId: string, event: ReactPointerEvent<HTMLDivElement>) => void;
  position: { x: number; y: number };
  subtitle: string;
  title: string;
}) {
  return (
    <div
      className={`route-blueprint-free-node route-blueprint-node ${props.kind}`}
      onPointerDown={(event) => props.onPointerDown(props.nodeId, event)}
      style={{ left: `${props.position.x}%`, top: `${props.position.y}%` }}
    >
      <BlueprintNodeContent {...props} />
    </div>
  );
}

function BlueprintNodeContent(props: {
  image?: string;
  kind: 'main' | 'engine' | 'candidate';
  onClick?: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <button className="route-blueprint-node-content" onClick={props.onClick} type="button">
      {props.image ? (
        <img alt="" src={props.image} />
      ) : (
        <span className="route-blueprint-node-icon">
          {props.kind === 'main' ? <Orbit size={20} /> : <Cloud size={18} />}
        </span>
      )}
      <strong>{props.title}</strong>
      <small>{props.subtitle}</small>
    </button>
  );
}

function BlueprintConnector(props: { from: { x: number; y: number }; to: { x: number; y: number } }) {
  return (
    <svg className="route-blueprint-svg" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <marker id="route-arrowhead" markerHeight="6" markerWidth="6" orient="auto" refX="5" refY="3">
          <path d="M0,0 L6,3 L0,6 Z" />
        </marker>
      </defs>
      <path
        d={getBlueprintConnectorPath(props.from, props.to)}
        markerEnd="url(#route-arrowhead)"
      />
    </svg>
  );
}

function getDefaultBlueprintNodePosition(nodeId: string, index: number, endpointCount: number): { x: number; y: number } {
  if (nodeId === 'source') {
    return { x: 8, y: 42 };
  }

  if (nodeId === 'engine') {
    return { x: 42, y: 36 };
  }

  const targetIndex = Math.max(0, index - 2);
  const spacing = endpointCount <= 1 ? 0 : Math.min(18, 58 / Math.max(1, endpointCount - 1));
  const startY = 42 - (spacing * (endpointCount - 1)) / 2;
  return {
    x: 72,
    y: clamp(startY + targetIndex * spacing, 10, 78),
  };
}

function getBlueprintConnectorPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const fromX = from.x + 15;
  const fromY = from.y + 9;
  const toX = to.x;
  const toY = to.y + 9;
  const controlOffset = Math.max(8, Math.abs(toX - fromX) * 0.42);
  return `M ${fromX} ${fromY} C ${fromX + controlOffset} ${fromY}, ${toX - controlOffset} ${toY}, ${toX} ${toY}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

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

function getBlueprintRouteName(route: EndpointItem | null): string {
  if (!route) {
    return '';
  }

  return String(route.name ?? route.endpoint_name ?? route.intelligent_endpoint_id ?? route.endpoint_id ?? route.id ?? 'Router');
}

function getBlueprintSelectedAlgorithm(route: EndpointItem): (typeof routingAlgorithms)[number] {
  const routingConfig = getBlueprintRoutingConfig(route);
  const rawAlgorithm = String(routingConfig.routing_algorithm ?? route.routing_algorithm ?? defaultRoutingAlgorithm);
  const normalizedAlgorithm = normalizeHfRepoId(rawAlgorithm);
  return routingAlgorithms.find((algorithm) => {
    return algorithm.value === rawAlgorithm || normalizeHfRepoId(algorithm.value) === normalizedAlgorithm;
  }) ?? {
    value: rawAlgorithm || defaultRoutingAlgorithm,
    label: normalizedAlgorithm || rawAlgorithm || 'Custom router',
    family: 'Custom',
    description: String(routingConfig.description ?? route.description ?? ''),
  };
}

function getBlueprintSelectedGoal(route: EndpointItem): (typeof routingGoals)[number] {
  const selectedAlgorithm = getBlueprintSelectedAlgorithm(route);
  const normalizedAlgorithm = normalizeHfRepoId(selectedAlgorithm.value);
  return routingGoals.find((goal) => normalizeHfRepoId(goal.algorithm) === normalizedAlgorithm)
    ?? routingGoals.find((goal) => goal.value === 'custom')
    ?? routingGoals[0];
}

function getBlueprintRouteEndpoints(route: EndpointItem): RouteEndpointOption[] {
  const candidates = getBlueprintAttachedCandidates(route);
  if (candidates.length === 0) {
    const target = getRouteTarget(route);
    return target && target !== 'Not attached' ? [{
      id: String(route.inference_endpoint_id ?? route.endpoint_id ?? route.id ?? 'attached-target'),
      endpointName: String(target),
      modelName: String(route.model_id ?? route.model_name ?? 'Attached model'),
      source: getEndpointSource(route),
      endpointUrl: String(route.endpoint_url ?? ''),
      available: true,
    }] : [];
  }

  return candidates.map((candidate, index) => {
    const source = getEndpointSource(candidate as EndpointItem);
    return {
      id: String(candidate.endpoint_id ?? candidate.inference_endpoint_id ?? candidate.id ?? candidate.endpoint_url ?? `attached-target-${index + 1}`),
      endpointName: String(candidate.endpoint_name ?? candidate.name ?? candidate.model_id ?? `Target ${index + 1}`),
      modelName: String(candidate.model_id ?? candidate.model_name ?? candidate.modelId ?? 'Attached model'),
      source,
      endpointUrl: String(candidate.endpoint_url ?? candidate.endpointUrl ?? ''),
      available: true,
    };
  });
}

function getBlueprintEndpointSources(route: EndpointItem): EndpointSource[] {
  const sources = Array.from(new Set(getBlueprintRouteEndpoints(route).map((endpoint) => endpoint.source)));
  return sources.length > 0 ? sources : ['local'];
}

function getBlueprintRoutingConfig(route: EndpointItem): Record<string, unknown> {
  const record = route as Record<string, unknown>;
  const routingConfig = record.routing_config ?? record.route_config ?? record.config;
  if (routingConfig && typeof routingConfig === 'object') {
    return routingConfig as Record<string, unknown>;
  }

  return {};
}

function getBlueprintAttachedCandidates(route: EndpointItem): Record<string, unknown>[] {
  const record = route as Record<string, unknown>;
  const attachedEndpoints = record.attached_endpoints ?? record.attachedEndpoints;
  if (!attachedEndpoints || typeof attachedEndpoints !== 'object') {
    return [];
  }

  const groups = attachedEndpoints as Record<string, unknown>;
  return [
    groups.inference_api,
    groups.inferenceApi,
    groups.dedicated,
    groups.local,
  ]
    .filter(Boolean)
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value): value is Record<string, unknown> => typeof value === 'object' && value !== null);
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
