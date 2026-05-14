import { useState, type FormEvent } from 'react';
import { Copy, LoaderCircle, Orbit, Pencil, Play, Trash2 } from 'lucide-react';

import { Modal } from '../components/Common';
import type { DashboardState, EndpointItem } from '../types';
import { formatValue } from '../utils/format';

interface CreateRouteDetails {
  endpointSource: EndpointSource;
  routingGoal: RoutingGoal;
  modelId: string;
  attachedEndpointIds: string[];
  inputModality: string;
  routingAlgorithm: string;
  description: string;
}

type EndpointSource = 'local' | 'cloud' | 'openbandwidth' | 'closed_source_api';
type RoutingGoal = 'balanced' | 'fastest' | 'lowest_cost' | 'highest_quality' | 'reliability' | 'custom';

const defaultRouteDetails: CreateRouteDetails = {
  endpointSource: 'local',
  routingGoal: 'balanced',
  modelId: '',
  attachedEndpointIds: [],
  inputModality: 'text',
  routingAlgorithm: 'knnrouter',
  description: '',
};

export interface CreateRoutePayload extends CreateRouteDetails {
  name: string;
}

const routingAlgorithms = [
  { value: 'knnrouter', label: 'KNN Router' },
  { value: 'svmrouter', label: 'SVM Router' },
  { value: 'mlprouter', label: 'MLP Router' },
  { value: 'mfrouter', label: 'Matrix Factorization Router' },
  { value: 'elorouter', label: 'Elo Router' },
  { value: 'routerdc', label: 'RouterDC' },
  { value: 'automix', label: 'AutoMix' },
  { value: 'hybrid_llm', label: 'Hybrid LLM' },
  { value: 'graphrouter', label: 'GraphRouter' },
  { value: 'causallm_router', label: 'CausalLM Router' },
  { value: 'smallest_llm', label: 'Smallest LLM' },
  { value: 'largest_llm', label: 'Largest LLM' },
  { value: 'router_r1', label: 'Router-R1' },
  { value: 'gmtrouter', label: 'GMTRouter' },
  { value: 'personalizedrouter', label: 'PersonalizedRouter' },
  { value: 'knnmultiroundrouter', label: 'KNN Multi-Round Router' },
  { value: 'llmmultiroundrouter', label: 'LLM Multi-Round Router' },
];

const routingGoals: Array<{ value: RoutingGoal; title: string; text: string; algorithm: string }> = [
  { value: 'balanced', title: 'Balanced', text: 'Blend quality, latency, and cost for everyday requests.', algorithm: 'knnrouter' },
  { value: 'fastest', title: 'Fastest', text: 'Prefer endpoints expected to respond with the lowest latency.', algorithm: 'smallest_llm' },
  { value: 'lowest_cost', title: 'Lowest cost', text: 'Route simple work to the cheapest capable endpoint first.', algorithm: 'smallest_llm' },
  { value: 'highest_quality', title: 'Highest quality', text: 'Prefer stronger models for harder prompts and reasoning.', algorithm: 'largest_llm' },
  { value: 'reliability', title: 'Reliability', text: 'Prioritize fallback behavior and healthy endpoint coverage.', algorithm: 'hybrid_llm' },
  { value: 'custom', title: 'Custom', text: 'Pick the exact routing algorithm in advanced settings.', algorithm: 'knnrouter' },
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

export function RoutingPage(props: {
  dashboard: DashboardState;
  intelligentEndpointName: string;
  busy: string | null;
  onIntelligentEndpointNameChange: (value: string) => void;
  onCreateRoute: (payload: CreateRoutePayload) => boolean | void | Promise<boolean | void>;
  onCopyRoute: (routeId: string) => void;
  onDeleteRoute: (routeId: string, routeName: string) => void;
}) {
  const [showCreateRouteModal, setShowCreateRouteModal] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testRoute, setTestRoute] = useState<{ id: string; name: string } | null>(null);
  const [editRoute, setEditRoute] = useState<{ id: string; name: string } | null>(null);
  const [testPrompt, setTestPrompt] = useState('Explain what this route is optimized for in one sentence.');
  const [routeDetails, setRouteDetails] = useState<CreateRouteDetails>(defaultRouteDetails);
  const inferenceEndpointOptions = props.dashboard.inferenceEndpoints
    .map((endpoint, index) => ({
      id: getInferenceEndpointId(endpoint, index),
      endpointName: getInferenceEndpointName(endpoint, index),
      modelName: getInferenceEndpointModelName(endpoint, index),
      source: getEndpointSource(endpoint),
    }))
    .filter((endpoint) => endpoint.source === routeDetails.endpointSource);
  const selectedEndpointSource = endpointSources.find((source) => source.value === routeDetails.endpointSource) ?? endpointSources[0];
  const selectedEndpointOptions = inferenceEndpointOptions.filter((endpoint) => routeDetails.attachedEndpointIds.includes(endpoint.id));
  const selectedGoal = routingGoals.find((goal) => goal.value === routeDetails.routingGoal) ?? routingGoals[0];

  async function handleCreateRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = await props.onCreateRoute({
      ...routeDetails,
      name: props.intelligentEndpointName,
    });
    if (created !== false) {
      setRouteDetails(defaultRouteDetails);
      setShowCreateRouteModal(false);
    }
  }

  function updateEndpointSource(endpointSource: EndpointSource) {
    setRouteDetails((current) => ({
      ...current,
      endpointSource,
      attachedEndpointIds: [],
    }));
  }

  function updateRoutingGoal(routingGoal: RoutingGoal) {
    const goal = routingGoals.find((item) => item.value === routingGoal) ?? routingGoals[0];
    setRouteDetails((current) => ({
      ...current,
      routingGoal,
      routingAlgorithm: routingGoal === 'custom' ? current.routingAlgorithm : goal.algorithm,
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
                          <button className="ghost-button !border-0 !bg-transparent !px-2 !py-1 !text-[0.8rem]" onClick={() => props.onCopyRoute(routeId)} type="button" title="Copy route URL">
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
                    <strong>{goal.title}</strong>
                    <span>{goal.text}</span>
                  </button>
                ))}
              </div>
            </label>
            <label>
              <span>Endpoint Source</span>
              <select
                value={routeDetails.endpointSource}
                onChange={(event) => updateEndpointSource(event.target.value as EndpointSource)}
              >
                {endpointSources.map((source) => (
                  <option key={source.value} value={source.value}>{source.label}</option>
                ))}
              </select>
            </label>
            <div className="full-span">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[0.85rem] text-[var(--muted)]">Choose Endpoints</span>
                <span className="text-[0.75rem] text-[var(--muted)]">{selectedEndpointOptions.length} selected</span>
              </div>
              <div className="route-endpoint-list">
                {inferenceEndpointOptions.length === 0 ? (
                  <div className="empty-state">{selectedEndpointSource.emptyText}</div>
                ) : null}
                {inferenceEndpointOptions.map((endpoint) => {
                  const selected = routeDetails.attachedEndpointIds.includes(endpoint.id);
                  return (
                    <button
                      className={`route-endpoint-option${selected ? ' active' : ''}`}
                      key={endpoint.id}
                      onClick={() => toggleEndpoint(endpoint.id)}
                      type="button"
                    >
                      <span className="route-endpoint-check">{selected ? 'x' : ''}</span>
                      <span>
                        <strong>{endpoint.endpointName}</strong>
                        <small>{endpoint.modelName} · {formatEndpointSource(endpoint.source)} · {endpoint.id}</small>
                      </span>
                      <span className="status-pill active">ready</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="route-summary">
            <strong>{selectedGoal.title}</strong>
            <span>{selectedEndpointOptions.length === 0 ? 'Select at least two endpoints for meaningful routing.' : `${selectedEndpointOptions.length} endpoint${selectedEndpointOptions.length === 1 ? '' : 's'} selected.`}</span>
          </div>
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
                    <option key={algorithm.value} value={algorithm.value}>{algorithm.label}</option>
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
              </label>
            </div>
          ) : null}
          <label>
            <span>Description</span>
            <textarea
              rows={4}
              value={routeDetails.description}
              onChange={(event) => setRouteDetails((current) => ({ ...current, description: event.target.value }))}
              placeholder="Describe how this route should be used."
            />
          </label>
          <button className="primary-button" type="submit" disabled={props.busy === 'create-intelligent-endpoint'}>
            {props.busy === 'create-intelligent-endpoint' ? <LoaderCircle className="spin" size={16} /> : <Orbit size={16} />}
            Create Route
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
    </div>
  );
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
