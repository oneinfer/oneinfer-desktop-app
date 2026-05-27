import type {
  ActiveDeveloperPlanItem,
  ApiKeyItem,
  CreateInferenceFormState,
  CreateInstanceFormState,
  DeveloperPlanItem,
  DesktopSession,
  EndpointItem,
  GpuSpecItem,
  InstanceItem,
  MachineDetailsItem,
  ProviderInfoMap,
  ServingLibrary,
} from './types';

type AnyRecord = Record<string, unknown>;

export interface AttachedInferenceEndpointPayload {
  endpoint_id: string;
  endpoint_name: string;
  input_modality: string;
  output_modality: string;
}

export interface CreateIntelligentEndpointPayload {
  name: string;
  routing_config: {
    routing_algorithm: string;
    router_runtime?: 'local';
    router_endpoint_id?: string;
    router_endpoint_url?: string;
    serving_library?: ServingLibrary;
    input_modality: string;
    candidate_models: string[];
    description?: string;
  };
  attached_endpoints?: {
    inference_api: AttachedInferenceEndpointPayload[];
  };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isHtmlPayload(value: unknown): value is string {
  return typeof value === 'string' && /<!doctype html|<html/i.test(value);
}

export function normalizeApiBaseUrl(value: string): string {
  const trimmedValue = trimTrailingSlash(value.trim());
  if (!trimmedValue) {
    return trimmedValue;
  }

  try {
    const parsedUrl = new URL(trimmedValue);
    const normalizedHostname = parsedUrl.hostname.replace(/^www\./i, '').toLowerCase();
    const normalizedPathname = parsedUrl.pathname.replace(/\/+$/, '');

    if (normalizedHostname === 'oneinfer.ai') {
      parsedUrl.hostname = 'api.oneinfer.ai';
    }

    if (!normalizedPathname || normalizedPathname === '/') {
      parsedUrl.pathname = '/v1';
    }

    parsedUrl.search = '';
    parsedUrl.hash = '';
    return trimTrailingSlash(parsedUrl.toString());
  } catch {
    return trimmedValue;
  }
}

function extractResponseData(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const typedPayload = payload as AnyRecord;
  if (typedPayload.dataResponse !== undefined) {
    return typedPayload.dataResponse;
  }

  if (typedPayload.data !== undefined) {
    return typedPayload.data;
  }

  return typedPayload;
}

function toQueryString(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) {
    return '';
  }

  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  });

  const raw = query.toString();
  return raw ? `?${raw}` : '';
}

async function request<T>(options: {
  baseUrl: string;
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  token?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}): Promise<T> {
  const { baseUrl, path, method = 'GET', token, query, body } = options;
  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
  const url = `${normalizedBaseUrl}${path}${toQueryString(query)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new Error(`Network error: ${error instanceof Error ? error.message : String(error)} (URL: ${url})`);
  }

  let payload: unknown = null;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    payload = await response.json();
  } else {
    payload = await response.text();
  }

  if (!response.ok) {
    if (isHtmlPayload(payload)) {
      throw new Error('Received the OneInfer website HTML instead of an API response. The app is now configured to use the API backend automatically; restart the app and try again.');
    }

    let rawPayload = payload;
    if (typeof rawPayload === 'string' && rawPayload.trim().startsWith('{')) {
      try {
        rawPayload = JSON.parse(rawPayload);
      } catch {}
    }

    let message: unknown;
    if (typeof rawPayload === 'object' && rawPayload !== null) {
      const typedPayload = rawPayload as AnyRecord;
      const errorObj = typeof typedPayload.error === 'object' && typedPayload.error !== null ? (typedPayload.error as AnyRecord) : null;
      const apiDetailsObj = typeof typedPayload.api_details === 'object' && typedPayload.api_details !== null ? (typedPayload.api_details as AnyRecord) : null;
      
      message = 
        errorObj?.error_description ??
        errorObj?.message ??
        (typeof typedPayload.error === 'string' ? typedPayload.error : undefined) ??
        apiDetailsObj?.api_message ??
        typedPayload.message ??
        typedPayload.detail ??
        response.statusText;
    } else {
      message = rawPayload || response.statusText;
    }

    if (typeof message === 'object' && message !== null) {
      try {
        message = JSON.stringify(message);
      } catch {
        message = String(message);
      }
    }

    throw new Error(`${message} (URL: ${url})`);
  }

  return extractResponseData(payload) as T;
}

export function normalizeList<T extends AnyRecord>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (value && typeof value === 'object') {
    const typedValue = value as AnyRecord;
    const nestedArray = Object.values(typedValue).find((item) => Array.isArray(item));
    if (Array.isArray(nestedArray)) {
      return nestedArray as T[];
    }

    return Object.values(typedValue).filter((item): item is T => Boolean(item && typeof item === 'object'));
  }

  return [];
}

function normalizeCurrency(value: unknown): 'INR' | 'USD' {
  return String(value ?? '').toUpperCase() === 'INR' ? 'INR' : 'USD';
}

function getCountryId(): 'in' | 'usa' {
  if (typeof window === 'undefined') {
    return 'usa';
  }

  const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const languages = typeof navigator !== 'undefined'
    ? [navigator.language, ...(navigator.languages || [])]
    : [];

  const hasIndiaLocale = [locale, ...languages].some((entry) => {
    const parts = entry?.split('-');
    return parts?.[1]?.toUpperCase() === 'IN';
  });

  return hasIndiaLocale || timezone === 'Asia/Kolkata' || timezone === 'Asia/Calcutta' ? 'in' : 'usa';
}

function normalizeApiKeyItem(item: ApiKeyItem): ApiKeyItem {
  const lastUsedCandidate = item.last_used
    ?? item.last_used_at
    ?? item.lastUsed
    ?? item.lastUsedAt;

  return {
    ...item,
    api_key_name: String(item.api_key_name ?? item.name ?? item.id ?? ''),
    prefix: String(
      item.prefix
      ?? item.api_key_prefix
      ?? item.key_prefix
      ?? item.apiKeyPrefix
      ?? '',
    ),
    last_used:
      typeof lastUsedCandidate === 'string'
      || typeof lastUsedCandidate === 'number'
      || lastUsedCandidate === null
      || lastUsedCandidate === undefined
        ? lastUsedCandidate ?? null
        : null,
  };
}

function normalizeDeveloperPlan(item: AnyRecord): DeveloperPlanItem {
  return {
    planId: String(item.plan_id ?? item.planId ?? ''),
    planTier: String(item.plan_tier ?? item.planTier ?? ''),
    pricing: Number(item.pricing ?? 0),
    gst: Number(item.gst ?? 0),
    paymentGatewayFee: Number(item.payment_gateway_fee ?? item.paymentGatewayFee ?? 0),
    totalPrice: Number(item.total_price ?? item.totalPrice ?? 0),
    currency: normalizeCurrency(item.currency),
    ctaText: String(item.cta_text ?? item.ctaText ?? 'Subscribe'),
    requestsPerMinute: Number((item.usage as AnyRecord | undefined)?.requests_per_minute ?? item.requests_per_minute ?? 0),
    concurrency: Number((item.usage as AnyRecord | undefined)?.concurrency ?? item.concurrency ?? 0),
  };
}

function normalizeActiveDeveloperPlan(item: AnyRecord): ActiveDeveloperPlanItem {
  return {
    planId: String(item.plan_id ?? item.planId ?? ''),
    planTier: String(item.plan_tier ?? item.planTier ?? ''),
    pricing: Number(item.pricing ?? 0),
    gst: Number(item.gst ?? 0),
    paymentGatewayFee: Number(item.payment_gateway_fee ?? item.paymentGatewayFee ?? 0),
    totalPrice: Number(item.total_price ?? item.totalPrice ?? 0),
    currency: normalizeCurrency(item.currency),
    requestsPerMinute: Number(
      (item.usage as AnyRecord | undefined)?.requests_per_minute
      ?? (item.usage_limits as AnyRecord | undefined)?.requests_per_minute
      ?? item.requests_per_minute
      ?? 0,
    ),
    concurrency: Number(
      (item.usage as AnyRecord | undefined)?.concurrency
      ?? (item.usage_limits as AnyRecord | undefined)?.concurrency
      ?? item.concurrency
      ?? 0,
    ),
    status: item.status ? String(item.status) : undefined,
    allowInferenceFallback: Boolean(item.allow_inference_fallback ?? item.allowInferenceFallback),
  };
}

function normalizeInstanceItem(item: InstanceItem): InstanceItem {
  return {
    ...item,
    developer_id: typeof (item.developer_id ?? item.developerId) === 'string' ? String(item.developer_id ?? item.developerId) : undefined,
    provider_name: String(item.provider_name ?? item.provider ?? ''),
    instance_id: String(item.instance_id ?? item.unique_instance_id ?? item.id ?? ''),
    instance_name: String(item.instance_name ?? item.name ?? item.id ?? ''),
    image_url: typeof (item.image_url ?? item.imageUrl) === 'string' ? String(item.image_url ?? item.imageUrl) : undefined,
    ram: typeof (item.ram ?? item.memory) === 'number' ? Number(item.ram ?? item.memory) : undefined,
    gpu_num: typeof (item.gpu_num ?? item.gpuCount) === 'number' ? Number(item.gpu_num ?? item.gpuCount) : undefined,
    disk_size: typeof (item.disk_size ?? item.diskSize) === 'number' ? Number(item.disk_size ?? item.diskSize) : undefined,
    region: String(item.region ?? ''),
    status: String(item.status ?? item.instance_status ?? ''),
    instance_status: String(item.instance_status ?? item.status ?? ''),
    ssh_command: typeof (item.ssh_command ?? item.sshCommand) === 'string' ? String(item.ssh_command ?? item.sshCommand) : undefined,
    ssh_password: typeof (item.ssh_password ?? item.sshPassword) === 'string' ? String(item.ssh_password ?? item.sshPassword) : undefined,
    ip_address: typeof (item.ip_address ?? item.public_ip ?? item.ipAddress) === 'string' ? String(item.ip_address ?? item.public_ip ?? item.ipAddress) : undefined,
    gpu_name: typeof (item.gpu_name ?? item.gpu) === 'string' ? String(item.gpu_name ?? item.gpu) : undefined,
    gpu_vram: typeof (item.gpu_vram ?? item.gpuVram) === 'number' ? Number(item.gpu_vram ?? item.gpuVram) : undefined,
  };
}

export async function requestOtp(baseUrl: string, email: string): Promise<AnyRecord> {
  return request<AnyRecord>({
    baseUrl,
    path: '/developer/generate-and-send-otp-to-email',
    method: 'POST',
    query: { email },
  });
}

export async function loginWithOtp(baseUrl: string, email: string, otp: string): Promise<DesktopSession> {
  const data = await request<AnyRecord>({
    baseUrl,
    path: '/developer/login',
    method: 'POST',
    body: {
      email,
      otp,
    },
  });

  const accessToken = String(data.access_token ?? '');
  const developerId = String(data.developer_id ?? '');
  if (!accessToken || !developerId) {
    throw new Error('Login response did not include access_token or developer_id.');
  }

  return {
    accessToken,
    developerId,
    email: String(data.email ?? email),
  };
}

export async function loginWithGoogle(
  baseUrl: string,
  payload: {
    clientId: string;
    credential: AnyRecord;
    selectBy?: string | null;
    email?: string;
  },
): Promise<DesktopSession> {
  const data = await request<AnyRecord>({
    baseUrl,
    path: '/developer/google-login',
    method: 'POST',
    body: {
      client_id: payload.clientId,
      credential: payload.credential,
      select_by: payload.selectBy ?? '',
    },
  });

  const accessToken = String(data.access_token ?? '');
  const developerId = String(data.developer_id ?? '');
  if (!accessToken || !developerId) {
    throw new Error('Google login response did not include access_token or developer_id.');
  }

  return {
    accessToken,
    developerId,
    email: String(data.email ?? payload.email ?? payload.credential.email ?? ''),
  };
}

export async function getProfile(baseUrl: string, session: DesktopSession): Promise<AnyRecord> {
  return request<AnyRecord>({
    baseUrl,
    path: `/developer/${session.developerId}/get-details`,
    token: session.accessToken,
  });
}

export async function saveMachineDetails(
  baseUrl: string,
  session: DesktopSession,
  payload: Record<string, unknown>,
): Promise<MachineDetailsItem> {
  const data = await request<unknown>({
    baseUrl,
    path: `/developer/${session.developerId}/machine-details`,
    method: 'PUT',
    token: session.accessToken,
    body: payload,
  });

  if (data && typeof data === 'object' && 'machine' in (data as AnyRecord)) {
    return ((data as AnyRecord).machine ?? null) as MachineDetailsItem;
  }

  return data as MachineDetailsItem;
}

export async function getMachineDetails(baseUrl: string, session: DesktopSession): Promise<MachineDetailsItem> {
  const data = await request<unknown>({
    baseUrl,
    path: `/developer/${session.developerId}/machine-details`,
    token: session.accessToken,
  });

  if (data && typeof data === 'object' && 'machine' in (data as AnyRecord)) {
    return ((data as AnyRecord).machine ?? null) as MachineDetailsItem;
  }

  return data as MachineDetailsItem;
}

export async function getCredits(baseUrl: string, session: DesktopSession): Promise<AnyRecord> {
  return request<AnyRecord>({
    baseUrl,
    path: `/developer/${session.developerId}/get-credits`,
    token: session.accessToken,
  });
}

export async function getProviderInfo(baseUrl: string): Promise<ProviderInfoMap> {
  const data = await request<unknown>({
    baseUrl,
    path: '/developer/get-provider-info',
    query: { provider: 'all' },
  });

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const typedData = data as AnyRecord;
    if (typedData.provider_info && typeof typedData.provider_info === 'object' && !Array.isArray(typedData.provider_info)) {
      return typedData.provider_info as ProviderInfoMap;
    }

    return typedData as ProviderInfoMap;
  }

  return {};
}

export async function getGpuSpecs(baseUrl: string): Promise<GpuSpecItem[]> {
  const data = await request<unknown>({
    baseUrl,
    path: '/gpu-specs',
  });
  return normalizeList<GpuSpecItem>(data);
}

export async function getInstances(baseUrl: string, session: DesktopSession): Promise<InstanceItem[]> {
  const data = await request<unknown>({
    baseUrl,
    path: `/developer/${session.developerId}/get-instances`,
    token: session.accessToken,
    query: { provider_name: 'all' },
  });
  return normalizeList<InstanceItem>(data).map(normalizeInstanceItem);
}

export async function createInstance(
  baseUrl: string,
  session: DesktopSession,
  payload: CreateInstanceFormState,
): Promise<AnyRecord> {
  return request<AnyRecord>({
    baseUrl,
    path: `/developer/${session.developerId}/create-instance`,
    method: 'POST',
    token: session.accessToken,
    body: payload,
  });
}

export async function deployCloudModel(
  baseUrl: string,
  session: DesktopSession,
  payload: CreateInstanceFormState,
): Promise<AnyRecord> {
  return request<AnyRecord>({
    baseUrl,
    path: `/developer/${session.developerId}/deploy-cloud-model`,
    method: 'POST',
    token: session.accessToken,
    body: {
      provider_name: payload.provider_name,
      instance_name: payload.instance_name,
      gpu_id: payload.gpu_id,
      gpu_num: payload.gpu_num,
      disk_size: payload.disk_size,
      image_url: payload.image_url,
      region: payload.region,
      startup_script: payload.startup_script,
      model_id: payload.model_id,
      serving_library: payload.serving_library,
      hf_access_token: payload.hf_access_token,
      top_p: payload.top_p,
      temperature: payload.temperature,
      max_tokens: payload.max_tokens,
    },
  });
}

export async function runInstanceAction(
  baseUrl: string,
  session: DesktopSession,
  action: 'start-instance' | 'stop-instance' | 'restart-instance',
  instanceId: string,
  provider: string,
): Promise<AnyRecord> {
  return request<AnyRecord>({
    baseUrl,
    path: `/developer/${session.developerId}/${action}`,
    method: 'POST',
    token: session.accessToken,
    query: {
      instance_id: instanceId,
      provider,
    },
  });
}

export async function deleteInstance(
  baseUrl: string,
  session: DesktopSession,
  instanceId: string,
  provider: string,
): Promise<AnyRecord> {
  return request<AnyRecord>({
    baseUrl,
    path: `/developer/${session.developerId}/delete-instance`,
    method: 'DELETE',
    token: session.accessToken,
    query: {
      instance_id: instanceId,
      provider,
    },
  });
}

export async function listApiKeys(baseUrl: string, session: DesktopSession): Promise<ApiKeyItem[]> {
  const data = await request<unknown>({
    baseUrl,
    path: `/developer/${session.developerId}/get-api-keys`,
    token: session.accessToken,
  });
  return normalizeList<ApiKeyItem>(data).map(normalizeApiKeyItem);
}

export async function getDeveloperPlans(baseUrl: string): Promise<DeveloperPlanItem[]> {
  const data = await request<unknown>({
    baseUrl,
    path: '/developer/get-plans',
    query: { country_id: getCountryId() },
  });

  return normalizeList<AnyRecord>(data).map(normalizeDeveloperPlan);
}

export async function getActiveDeveloperPlan(baseUrl: string, session: DesktopSession): Promise<ActiveDeveloperPlanItem | null> {
  const data = await request<unknown>({
    baseUrl,
    path: `/developer/${session.developerId}/get-plan/active`,
    token: session.accessToken,
  });

  const candidate = data && typeof data === 'object'
    ? ((data as AnyRecord).active_plan && typeof (data as AnyRecord).active_plan === 'object'
      ? (data as AnyRecord).active_plan as AnyRecord
      : data as AnyRecord)
    : null;

  if (!candidate) {
    return null;
  }

  const normalized = normalizeActiveDeveloperPlan(candidate);
  return normalized.planId ? normalized : null;
}

export async function createApiKey(
  baseUrl: string,
  session: DesktopSession,
  apiKeyName: string,
  environment: string,
): Promise<AnyRecord> {
  return request<AnyRecord>({
    baseUrl,
    path: `/developer/${session.developerId}/create-api-key`,
    method: 'POST',
    token: session.accessToken,
    query: {
      api_key_name: apiKeyName,
      environment,
    },
  });
}

export async function deleteApiKey(
  baseUrl: string,
  session: DesktopSession,
  apiKeyName: string,
): Promise<AnyRecord> {
  return request<AnyRecord>({
    baseUrl,
    path: `/developer/${session.developerId}/delete-api-key`,
    method: 'DELETE',
    token: session.accessToken,
    query: { api_key_name: apiKeyName },
  });
}

export async function listIntelligentEndpoints(baseUrl: string, session: DesktopSession): Promise<EndpointItem[]> {
  const data = await request<unknown>({
    baseUrl,
    path: `/developer/${session.developerId}/list-intelligent-endpoints`,
    token: session.accessToken,
  });
  return normalizeList<EndpointItem>(data);
}

export async function createIntelligentEndpoint(
  baseUrl: string,
  session: DesktopSession,
  payload: CreateIntelligentEndpointPayload,
): Promise<AnyRecord> {
  return request<AnyRecord>({
    baseUrl,
    path: `/developer/${session.developerId}/create-intelligent-endpoint`,
    method: 'POST',
    token: session.accessToken,
    body: payload,
  });
}

export async function deleteIntelligentEndpoint(
  baseUrl: string,
  session: DesktopSession,
  intelligentEndpointId: string,
): Promise<AnyRecord> {
  return request<AnyRecord>({
    baseUrl,
    path: `/developer/${session.developerId}/delete-intelligent-endpoint`,
    method: 'DELETE',
    token: session.accessToken,
    query: { intelligent_endpoint_id: intelligentEndpointId },
  });
}

export async function listInferenceEndpoints(baseUrl: string, session: DesktopSession): Promise<EndpointItem[]> {
  const data = await request<unknown>({
    baseUrl,
    path: `/developer/${session.developerId}/list-inference-api-endpoints`,
    token: session.accessToken,
  });
  return normalizeList<EndpointItem>(data);
}

export async function createInferenceEndpoint(
  baseUrl: string,
  session: DesktopSession,
  payload: CreateInferenceFormState,
): Promise<AnyRecord> {
  return request<AnyRecord>({
    baseUrl,
    path: `/developer/${session.developerId}/inference-api-endpoint`,
    method: 'POST',
    token: session.accessToken,
    body: payload,
  });
}

export async function deleteInferenceEndpoint(
  baseUrl: string,
  session: DesktopSession,
  inferenceEndpointId: string,
  intelligentEndpointId = '',
): Promise<AnyRecord> {
  const endpointId = inferenceEndpointId.trim();
  return request<AnyRecord>({
    baseUrl,
    path: `/developer/${session.developerId}/delete-inference-api-endpoint`,
    method: 'DELETE',
    token: session.accessToken,
    query: {
      intelligent_endpoint_id: intelligentEndpointId,
      inference_endpoint_id: endpointId,
      inference_api_id: endpointId,
      inference_api_endpoint_id: endpointId,
      endpoint_id: endpointId,
    },
  });
}

export async function attachEndpoint(
  baseUrl: string,
  session: DesktopSession,
  intelligentEndpointId: string,
  endpointType: string,
  endpoint: string | AttachedInferenceEndpointPayload,
): Promise<AnyRecord> {
  const isEndpointObject = typeof endpoint === 'object';

  return request<AnyRecord>({
    baseUrl,
    path: `/developer/${session.developerId}/attach-endpoint`,
    method: 'POST',
    token: session.accessToken,
    body: {
      intelligent_endpoint_id: intelligentEndpointId,
      endpoint_type: endpointType,
      ...(isEndpointObject ? { endpoint } : { endpoint_id: endpoint }),
    },
  });
}

export async function listModels(baseUrl: string): Promise<AnyRecord[]> {
  const data = await request<unknown>({
    baseUrl,
    path: '/developer/get-all-models',
  });
  return normalizeList<AnyRecord>(data).map(normalizeModelItem);
}

function normalizeModelItem(item: AnyRecord): AnyRecord {
  return {
    ...item,
    id: item._id ?? item.id ?? '',
    modelSizeGb: item.model_size_gb ?? item.modelSizeGb ?? '',
    modelQuantization: item.model_quantization ?? item.modelQuantization ?? '',
    modelParameters: item.model_parameters ?? item.modelParameters ?? '',
    modelName: item.model_name ?? item.modelName ?? '',
    modelMinVram: item.model_min_vram ?? item.modelMinVram ?? '',
    modelId: item.model_id ?? item.modelId ?? '',
    modelContextLength: item.model_context_length ?? item.modelContextLength ?? '',
    modelKnowledgeCutOff: item.knowledge_cutoff ?? item.modelKnowledgeCutOff ?? '',
    callingEnabled: item.is_tool_calling_enabled ?? item.callingEnabled ?? '',
    inputModalities: Array.isArray(item.input_modalities)
      ? item.input_modalities
      : Array.isArray(item.inputModalities)
        ? item.inputModalities
        : [],
    outputModalities: Array.isArray(item.output_modalities)
      ? item.output_modalities
      : Array.isArray(item.outputModalities)
        ? item.outputModalities
        : [],
    benchmarkInfo: item.benchmark_info ?? item.benchmarkInfo ?? {},
    Description: item.description ?? item.Description ?? '',
    displayName: item.display_name ?? item.displayName ?? null,
    displayOrder: item.display_order ?? item.displayOrder ?? null,
    displayTags: Array.isArray(item.display_tags)
      ? item.display_tags
      : Array.isArray(item.displayTags)
        ? item.displayTags
        : [],
  };
}

export async function getHfModelInfo(repoId: string, accessToken?: string): Promise<AnyRecord> {
  const url = `https://huggingface.co/api/models/${repoId}?blobs=true`;
  const token = accessToken?.trim();
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Hugging Face returned HTTP ${response.status} for ${repoId}. Enter a Hugging Face access token for private or gated repositories.`);
    }

    throw new Error(`Failed to fetch Hugging Face model info for ${repoId} (HTTP ${response.status}).`);
  }
  return await response.json() as AnyRecord;
}
