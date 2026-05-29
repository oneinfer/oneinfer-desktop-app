export type SectionKey = 'overview' | 'selfHosting' | 'instances' | 'apiKeys' | 'routing' | 'bandwidth' | 'settings';

export interface DesktopSession {
  accessToken: string;
  refreshToken?: string;
  developerId: string;
  email: string;
}

export type AuthStep = 'email' | 'otp' | 'registration';

export type OrganizationType = 'individual' | 'business';

export type DeveloperDesignation = 'developer' | 'founder_ceo_cto' | 'manager' | 'student' | 'other';

export interface RegistrationFormState {
  firstName: string;
  lastName: string;
  organizationType: '' | OrganizationType;
  organization: string;
  designation: '' | DeveloperDesignation;
  dob: string;
  acceptedTerms: boolean;
}

export interface DesktopSettings {
  apiBaseUrl: string;
}

export type ServingLibrary = 'vllm' | 'sglang' | 'tensorrt' | 'ollama' | 'llama_cpp' | 'pytorch' | 'transformers' | 'dynamo';

export type LaunchableServingLibrary = Extract<ServingLibrary, 'vllm' | 'ollama' | 'transformers'>;

export interface MachineCpuDetails {
  brand?: string;
  manufacturer?: string;
  architecture?: string;
  physicalCores?: number;
  logicalCores?: number;
  baseSpeedGhz?: number;
  maxSpeedGhz?: number;
  temperatureC?: number;
  currentLoadPercent?: number;
  [key: string]: unknown;
}

export interface MachineMemoryDetails {
  totalBytes?: number;
  availableBytes?: number;
  usedBytes?: number;
  freeBytes?: number;
  totalGb?: number;
  availableGb?: number;
  usedGb?: number;
  [key: string]: unknown;
}

export interface MachineGpuDetails {
  name?: string;
  vendor?: string;
  model?: string;
  gpuType?: string;
  memoryKind?: 'dedicated' | 'unified' | string;
  memorySource?: string;
  vramBytes?: number;
  vramMb?: number;
  vramGb?: number;
  reportedVramMb?: number | null;
  unifiedMemoryBytes?: number | null;
  unifiedMemoryGb?: number | null;
  driverVersion?: string;
  temperatureC?: number;
  utilizationPercent?: number;
  [key: string]: unknown;
}

export interface MachineDiskDetails {
  name?: string;
  mount?: string;
  fsType?: string;
  totalBytes?: number;
  usedBytes?: number;
  freeBytes?: number;
  [key: string]: unknown;
}

export interface MachineNetworkDetails {
  name?: string;
  mac?: string;
  ipv4?: string;
  ipv6?: string;
  internal?: boolean;
  speedMbps?: number;
  [key: string]: unknown;
}

export interface MachineDetailsItem {
  machineId?: string;
  developer_id?: string;
  hostname?: string;
  machineName?: string;
  osName?: string;
  osVersion?: string;
  osRelease?: string;
  kernelVersion?: string;
  platform?: string;
  platformVersion?: string;
  architecture?: string;
  cpu?: MachineCpuDetails;
  memory?: MachineMemoryDetails;
  gpus?: MachineGpuDetails[];
  disks?: MachineDiskDetails[];
  networkInterfaces?: MachineNetworkDetails[];
  collectedAt?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface ApiKeyItem {
  api_key_name?: string;
  name?: string;
  prefix?: string;
  api_key_prefix?: string;
  environment?: string;
  created_at?: string;
  last_used?: string | number | null;
  last_used_at?: string | null;
  id?: string;
  [key: string]: unknown;
}

export interface InstanceItem {
  instance_id?: string;
  unique_instance_id?: string;
  id?: string;
  instance_name?: string;
  provider_name?: string;
  instance_status?: boolean | string;
  status?: string;
  region?: string;
  gpu_name?: string;
  public_ip?: string;
  [key: string]: unknown;
}

export interface EndpointItem {
  intelligent_endpoint_id?: string;
  inference_endpoint_id?: string;
  endpoint_id?: string;
  name?: string;
  provider?: string;
  model_id?: string;
  deployment_target?: string;
  endpoint_url?: string;
  machine_id?: string;
  machine_name?: string;
  api_format?: string;
  serving_library?: ServingLibrary | string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface GpuSpecItem {
  gpu_id?: string;
  gpu_name?: string;
  provider_name?: string;
  display_name?: string;
  [key: string]: unknown;
}

export interface GpuPricingItem {
  gpuId: string;
  providerName: string;
  gpuName: string;
  regions: string[];
  pricePerHour: number;
  gpuAvailability: string | null;
  vram?: string;
  logoUrl?: string;
}

export type ProviderInfoMap = Record<string, Record<string, unknown>>;

export interface DeveloperPlanItem {
  planId: string;
  planTier: string;
  pricing: number;
  gst: number;
  paymentGatewayFee: number;
  totalPrice: number;
  currency: string;
  ctaText: string;
  requestsPerMinute: number;
  concurrency: number;
}

export interface ActiveDeveloperPlanItem {
  planId: string;
  planTier: string;
  pricing: number;
  gst: number;
  paymentGatewayFee: number;
  totalPrice: number;
  currency: string;
  requestsPerMinute: number;
  concurrency: number;
  status?: string;
  allowInferenceFallback?: boolean;
}

export interface DashboardState {
  profile: Record<string, unknown> | null;
  credits: Record<string, unknown> | null;
  machineDetails: MachineDetailsItem | null;
  instances: InstanceItem[];
  apiKeys: ApiKeyItem[];
  intelligentEndpoints: EndpointItem[];
  inferenceEndpoints: EndpointItem[];
  providerInfo: ProviderInfoMap;
  gpuSpecs: GpuSpecItem[];
  gpuPricing: GpuPricingItem[];
  models: any[];
  developerPlans: DeveloperPlanItem[];
  activeDeveloperPlan: ActiveDeveloperPlanItem | null;
}

export interface CreateInstanceFormState {
  provider_name: string;
  instance_name: string;
  gpu_id: string;
  gpu_num: number;
  disk_size: number;
  image_url: string;
  region: string;
  startup_script: string;
  model_id: string;
  model_source: 'catalog' | 'huggingface';
  hf_model_url: string;
  serving_library: ServingLibrary;
  hf_access_token: string;
  top_p: number;
  temperature: number;
  max_tokens: number;
}

export interface CreateInferenceFormState {
  name: string;
  provider: string;
  model_id: string;
  deployment_target: 'cloud' | 'local';
  endpoint_url: string;
  machine_id: string;
  machine_name: string;
  model_description?: string;
  model_context_length?: string | number;
  model_parameters?: string | number;
  model_tags?: string[];
  model_pipeline_tag?: string;
  top_p: number;
  temperature: number;
  max_tokens: number;
  endpoint_role?: 'inference' | 'router';
  serving_library?: ServingLibrary;
}

export interface HfModelInfo {
  id: string;
  author?: string;
  lastModified?: string;
  likes?: number;
  downloads?: number;
  tags?: string[];
  pipeline_tag?: string;
  siblings?: { rfilename: string; size?: number }[];
  model_id?: string;
  [key: string]: any;
}

export interface LocalModelDeployment {
  endpointId?: string;
  endpointUrl: string;
  modelId: string;
  modelDescription?: string;
  modelContextLength?: string | number;
  modelParameters?: string | number;
  modelTags?: string[];
  modelPipelineTag?: string;
  name: string;
  pid: number | null;
  runtime: ServingLibrary;
  deployedAt: string;
}

export interface LocalModelMetrics {
  endpointUrl: string;
  healthy: boolean;
  modelCount: number;
  modelIds?: string[];
  uptimeSeconds: number | null;
  requestsRunning: number | null;
  requestsWaiting: number | null;
  requestSuccessTotal: number | null;
  promptTokensTotal: number | null;
  generationTokensTotal: number | null;
  gpuCacheUsagePercent: number | null;
  lastCheckedAt: string;
  error?: string;
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

