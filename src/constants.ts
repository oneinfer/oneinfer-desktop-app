import {
  AppWindowMac,
  KeyRound,
  Orbit,
  Server,
  Sparkles,
  Wifi,
} from 'lucide-react';

import { normalizeApiBaseUrl } from './api';
import type { CreateInferenceFormState, CreateInstanceFormState, DashboardState, SectionKey } from './types';

export const fallbackApiBaseUrl = 'https://api.oneinfer.ai/v1';
export const defaultApiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_ONEINFER_API_BASE_URL || fallbackApiBaseUrl);

export const defaultSettings = {
  apiBaseUrl: defaultApiBaseUrl,
};

export const defaultClaudeCodeProvider: 'oneinfer' | 'anthropic' = 'anthropic';

export const defaultDashboardState: DashboardState = {
  profile: null,
  credits: null,
  machineDetails: null,
  instances: [],
  apiKeys: [],
  intelligentEndpoints: [],
  inferenceEndpoints: [],
  providerInfo: {},
  gpuSpecs: [],
  models: [],
  developerPlans: [],
  activeDeveloperPlan: null,
};

export const defaultInstanceForm: CreateInstanceFormState = {
  provider_name: 'runpod',
  instance_name: '',
  gpu_id: '',
  gpu_num: 1,
  disk_size: 80,
  image_url: 'vllm/vllm-openai:latest',
  region: 'US-IL-1',
  startup_script: 'echo OneInfer Desktop instance ready',
  model_id: '',
  model_source: 'catalog',
  hf_model_url: '',
  serving_library: 'vllm',
  hf_access_token: '',
  top_p: 0.9,
  temperature: 0.7,
  max_tokens: 4096,
};

export const defaultInferenceForm: CreateInferenceFormState = {
  name: '',
  provider: 'openai',
  model_id: '',
  deployment_target: 'cloud',
  endpoint_url: '',
  machine_id: '',
  machine_name: '',
  top_p: 0.9,
  temperature: 0.7,
  max_tokens: 4096,
  serving_library: 'vllm',
};

export const sections: Array<{ key: SectionKey; label: string; icon: typeof Sparkles }> = [
  { key: 'overview', label: 'Overview', icon: Sparkles },
  { key: 'selfHosting', label: 'Self Hosting', icon: Server },
  { key: 'instances', label: 'Cloud Hosting', icon: Server },
  { key: 'apiKeys', label: 'API Keys', icon: KeyRound },
  { key: 'routing', label: 'Routing', icon: Orbit },
  { key: 'bandwidth', label: 'AI Bandwidth', icon: Wifi },
  { key: 'settings', label: 'Settings', icon: AppWindowMac },
];

export function createLoadedSections() {
  return {
    overview: false,
    selfHosting: false,
    instances: false,
    apiKeys: false,
    routing: false,
    bandwidth: false,
    settings: true,
  } satisfies Record<SectionKey, boolean>;
}
