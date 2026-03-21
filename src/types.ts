export type SectionKey = 'overview' | 'models' | 'instances' | 'apiKeys' | 'routing' | 'settings';

export interface DesktopSession {
  accessToken: string;
  developerId: string;
  email: string;
}

export interface DesktopSettings {
  apiBaseUrl: string;
}

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
  vramBytes?: number;
  vramMb?: number;
  vramGb?: number;
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
  prefix?: string;
  environment?: string;
  created_at?: string;
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

export interface ModelItem {
  model_id?: string;
  model_name?: string;
  provider_name?: string;
  model_type?: string;
  context_length?: number;
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

export type ProviderInfoMap = Record<string, Record<string, unknown>>;

export interface DashboardState {
  profile: Record<string, unknown> | null;
  credits: Record<string, unknown> | null;
  machineDetails: MachineDetailsItem | null;
  models: ModelItem[];
  pricing: Array<Record<string, unknown>>;
  instances: InstanceItem[];
  apiKeys: ApiKeyItem[];
  intelligentEndpoints: EndpointItem[];
  inferenceEndpoints: EndpointItem[];
  providerInfo: ProviderInfoMap;
  gpuSpecs: GpuSpecItem[];
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
}

export interface CreateInferenceFormState {
  name: string;
  provider: string;
  model_id: string;
  deployment_target: 'cloud' | 'local';
  endpoint_url: string;
  machine_id: string;
  machine_name: string;
  top_p: number;
  temperature: number;
  max_tokens: number;
}