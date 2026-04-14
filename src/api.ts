import type {
  ApiKeyItem,
  CreateInferenceFormState,
  CreateInstanceFormState,
  DesktopSession,
  EndpointItem,
  GpuSpecItem,
  InstanceItem,
  MachineDetailsItem,
  ModelItem,
  ProviderInfoMap,
} from './types';

type AnyRecord = Record<string, unknown>;

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

  const response = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

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

    const detail = extractResponseData(payload);
    const message = typeof detail === 'string'
      ? detail
      : (detail as AnyRecord)?.message ?? (detail as AnyRecord)?.detail ?? response.statusText;
    throw new Error(String(message));
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

export async function getModels(baseUrl: string): Promise<ModelItem[]> {
  const data = await request<unknown>({
    baseUrl,
    path: '/developer/get-all-models',
  });
  return normalizeList<ModelItem>(data);
}

export async function getModelPricing(baseUrl: string): Promise<Array<Record<string, unknown>>> {
  const data = await request<unknown>({
    baseUrl,
    path: '/developer/get-model-pricing',
  });
  return normalizeList<Record<string, unknown>>(data);
}

export async function getProviderInfo(baseUrl: string): Promise<ProviderInfoMap> {
  const data = await request<unknown>({
    baseUrl,
    path: '/developer/get-provider-info',
    query: { provider: 'all' },
  });

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as ProviderInfoMap;
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
  return normalizeList<InstanceItem>(data);
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
  return normalizeList<ApiKeyItem>(data);
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
  name: string,
): Promise<AnyRecord> {
  return request<AnyRecord>({
    baseUrl,
    path: `/developer/${session.developerId}/create-intelligent-endpoint`,
    method: 'POST',
    token: session.accessToken,
    query: { name },
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

export async function attachEndpoint(
  baseUrl: string,
  session: DesktopSession,
  intelligentEndpointId: string,
  endpointType: string,
  endpointId: string,
): Promise<AnyRecord> {
  return request<AnyRecord>({
    baseUrl,
    path: `/developer/${session.developerId}/attach-endpoint`,
    method: 'POST',
    token: session.accessToken,
    query: {
      intelligent_endpoint_id: intelligentEndpointId,
      endpoint_type: endpointType,
      endpoint_id: endpointId,
    },
  });
}