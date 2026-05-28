import type { HfModelInfo, ServingLibrary } from '../types';

const BYTES_PER_GIB = 1024 ** 3;
const DEFAULT_CONTEXT_LENGTH = 4096;
const DEFAULT_KV_CACHE_GIB = 1;
export const DEFAULT_SERVING_LIBRARY_OVERHEAD_GIB = 2;
const DEFAULT_KV_CACHE_DTYPE_BYTES = 2;

const modelWeightExtensions = [
  '.safetensors',
  '.bin',
  '.gguf',
  '.ggml',
  '.pt',
  '.pth',
  '.ckpt',
  '.onnx',
  '.engine',
];

const excludedWeightFragments = [
  'optimizer',
  'scheduler',
  'training_args',
  'trainer_state',
  'rng_state',
];

const preferredWeightExtensions = [
  '.safetensors',
  '.gguf',
  '.ggml',
  '.bin',
  '.pt',
  '.pth',
  '.ckpt',
  '.onnx',
  '.engine',
];

export interface ModelMemoryBreakdown {
  modelWeightGb: number;
  kvCacheGb: number;
  servingOverheadGb: number;
  totalVramGb: number;
  contextLength: number;
}

export function getModelWeightBytes(model: HfModelInfo | null): number {
  if (!model) {
    return 0;
  }

  const safetensorsTotal = Number((model as any).safetensors?.total ?? 0);
  if (safetensorsTotal > 0) {
    return safetensorsTotal;
  }

  const files = getWeightFiles(model);
  if (files.length === 0) {
    return Number((model as any).usedStorage ?? 0);
  }

  for (const extension of preferredWeightExtensions) {
    const matchingFiles = files.filter((file) => file.filename.endsWith(extension));
    if (matchingFiles.length === 0) {
      continue;
    }

    if (extension === '.gguf' || extension === '.ggml') {
      return Math.max(...matchingFiles.map((file) => file.size));
    }

    return matchingFiles.reduce((acc, file) => acc + file.size, 0);
  }

  return Math.max(...files.map((file) => file.size));
}

export function bytesToGiB(bytes: number): number {
  return bytes > 0 ? bytes / BYTES_PER_GIB : 0;
}

export function getModelMemoryBreakdown(
  model: HfModelInfo | null,
  options: { modelWeightGb?: number; contextLength?: number; servingLibrary?: ServingLibrary; servingOverheadGb?: number } = {},
): ModelMemoryBreakdown {
  const modelWeightGb = Math.max(0, options.modelWeightGb ?? bytesToGiB(getModelWeightBytes(model)));
  const contextLength = Math.max(1, options.contextLength ?? getContextLength(model));
  const servingOverheadGb = Math.max(0, options.servingOverheadGb ?? estimateServingLibraryOverheadGb(options.servingLibrary, modelWeightGb));
  const kvCacheGb = Math.max(0, estimateKvCacheGb(model, contextLength));

  return {
    modelWeightGb,
    kvCacheGb,
    servingOverheadGb,
    totalVramGb: modelWeightGb + kvCacheGb + servingOverheadGb,
    contextLength,
  };
}

function getWeightFiles(model: HfModelInfo): Array<{ filename: string; size: number }> {
  if (!Array.isArray(model.siblings)) {
    return [];
  }

  return model.siblings.reduce<Array<{ filename: string; size: number }>>((acc, file) => {
    const filename = String(file.rfilename ?? '').toLowerCase();
    const size = Number(file.size ?? 0);
    if (!size || excludedWeightFragments.some((fragment) => filename.includes(fragment))) {
      return acc;
    }

    if (modelWeightExtensions.some((extension) => filename.endsWith(extension))) {
      acc.push({ filename, size });
    }

    return acc;
  }, []);
}

function estimateKvCacheGb(model: HfModelInfo | null, contextLength: number): number {
  const config = getModelConfig(model);
  const architecture = getModelArchitecture(model);
  const layerCount = architecture.layerCount;
  const hiddenSize = architecture.hiddenSize;
  const attentionHeads = architecture.attentionHeads;
  const keyValueHeads = architecture.keyValueHeads ?? attentionHeads;

  if (!layerCount || !hiddenSize || !attentionHeads || !keyValueHeads) {
    return DEFAULT_KV_CACHE_GIB;
  }

  const headDim = hiddenSize / attentionHeads;
  const bytesPerElement = getKvCacheBytesPerElement(config);
  const kvBytes = 2 * layerCount * keyValueHeads * headDim * contextLength * bytesPerElement;
  return bytesToGiB(kvBytes);
}

function estimateServingLibraryOverheadGb(library: ServingLibrary | undefined, modelWeightGb: number): number {
  const runtime = library ?? 'vllm';
  const weightGb = Math.max(0, modelWeightGb);
  const overheadByRuntime: Record<ServingLibrary, { baseGb: number; weightRatio: number; minGb: number; maxGb: number }> = {
    vllm: { baseGb: 0.75, weightRatio: 0.12, minGb: 0.9, maxGb: 6 },
    sglang: { baseGb: 0.9, weightRatio: 0.12, minGb: 1, maxGb: 6 },
    tensorrt: { baseGb: 0.5, weightRatio: 0.08, minGb: 0.75, maxGb: 4 },
    ollama: { baseGb: 0.25, weightRatio: 0.06, minGb: 0.35, maxGb: 3 },
    llama_cpp: { baseGb: 0.2, weightRatio: 0.05, minGb: 0.3, maxGb: 2.5 },
    pytorch: { baseGb: 0.8, weightRatio: 0.15, minGb: 1, maxGb: 8 },
    transformers: { baseGb: 0.85, weightRatio: 0.15, minGb: 1, maxGb: 8 },
    dynamo: { baseGb: 1.25, weightRatio: 0.12, minGb: 1.5, maxGb: 7 },
  };
  const estimate = overheadByRuntime[runtime] ?? overheadByRuntime.vllm;
  return Math.min(estimate.maxGb, Math.max(estimate.minGb, estimate.baseGb + weightGb * estimate.weightRatio));
}

function getContextLength(model: HfModelInfo | null): number {
  const config = getModelConfig(model);
  return readNumber(config, [
    'max_position_embeddings',
    'model_max_length',
    'max_sequence_length',
    'seq_length',
    'n_positions',
    'max_seq_len',
    'context_length',
  ]) ?? getInferredContextLength(model) ?? DEFAULT_CONTEXT_LENGTH;
}

function getModelConfig(model: HfModelInfo | null): Record<string, unknown> {
  const config = model?.config;
  return config && typeof config === 'object' && !Array.isArray(config) ? config : {};
}

function readNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return null;
}

function getKvCacheBytesPerElement(config: Record<string, unknown>): number {
  const quantization = stringifyConfigValue(config.quantization_config).toLowerCase();
  const dtype = String(config.torch_dtype ?? config.dtype ?? '').toLowerCase();
  const quantizationBits = readNumberValue((config.quantization_config as Record<string, unknown> | undefined)?.bits);
  if (quantizationBits && quantizationBits <= 8) {
    return 1;
  }

  if (quantization.includes('int8') || quantization.includes('8bit') || dtype.includes('int8')) {
    return 1;
  }

  if (dtype.includes('float32') || dtype.includes('fp32')) {
    return 4;
  }

  return DEFAULT_KV_CACHE_DTYPE_BYTES;
}

function getModelArchitecture(model: HfModelInfo | null): {
  layerCount: number | null;
  hiddenSize: number | null;
  attentionHeads: number | null;
  keyValueHeads: number | null;
} {
  const config = getModelConfig(model);
  const configArchitecture = {
    layerCount: readNumber(config, ['num_hidden_layers', 'n_layer', 'num_layers', 'n_layers']),
    hiddenSize: readNumber(config, ['hidden_size', 'n_embd', 'd_model']),
    attentionHeads: readNumber(config, ['num_attention_heads', 'n_head', 'num_heads']),
    keyValueHeads: readNumber(config, ['num_key_value_heads', 'n_head_kv', 'num_kv_heads']),
  };

  if (configArchitecture.layerCount && configArchitecture.hiddenSize && configArchitecture.attentionHeads) {
    return configArchitecture;
  }

  return inferModelArchitecture(model, configArchitecture);
}

function inferModelArchitecture(
  model: HfModelInfo | null,
  known: ReturnType<typeof getModelArchitecture>,
): ReturnType<typeof getModelArchitecture> {
  const text = getModelSearchText(model);
  const parameterCountB = getModelParameterCountB(model);
  const preset = getArchitecturePreset(text, parameterCountB);
  if (preset) {
    return {
      layerCount: known.layerCount ?? preset.layerCount,
      hiddenSize: known.hiddenSize ?? preset.hiddenSize,
      attentionHeads: known.attentionHeads ?? preset.attentionHeads,
      keyValueHeads: known.keyValueHeads ?? preset.keyValueHeads,
    };
  }

  if (!parameterCountB) {
    return known;
  }

  const hiddenSize = known.hiddenSize ?? Math.max(512, Math.round(Math.sqrt(parameterCountB * 1_000_000_000 / 12) / 64) * 64);
  const layerCount = known.layerCount ?? Math.max(12, Math.round(parameterCountB <= 2 ? 18 + parameterCountB * 6 : 24 + parameterCountB * 2));
  const attentionHeads = known.attentionHeads ?? Math.max(8, Math.round(hiddenSize / 128));
  return {
    layerCount,
    hiddenSize,
    attentionHeads,
    keyValueHeads: known.keyValueHeads ?? attentionHeads,
  };
}

function getArchitecturePreset(text: string, parameterCountB: number | null) {
  if (text.includes('qwen2.5') || text.includes('qwen2-5') || text.includes('qwen3') || text.includes('qwen2')) {
    if (parameterCountB && parameterCountB <= 0.75) return { layerCount: 24, hiddenSize: 896, attentionHeads: 14, keyValueHeads: 2 };
    if (parameterCountB && parameterCountB <= 2) return { layerCount: 28, hiddenSize: 1536, attentionHeads: 12, keyValueHeads: 2 };
    if (parameterCountB && parameterCountB <= 4) return { layerCount: 36, hiddenSize: 2048, attentionHeads: 16, keyValueHeads: 2 };
    if (parameterCountB && parameterCountB <= 8) return { layerCount: 28, hiddenSize: 3584, attentionHeads: 28, keyValueHeads: 4 };
    if (parameterCountB && parameterCountB <= 16) return { layerCount: 48, hiddenSize: 5120, attentionHeads: 40, keyValueHeads: 8 };
    if (parameterCountB && parameterCountB <= 40) return { layerCount: 64, hiddenSize: 5120, attentionHeads: 40, keyValueHeads: 8 };
    if (parameterCountB && parameterCountB <= 80) return { layerCount: 80, hiddenSize: 8192, attentionHeads: 64, keyValueHeads: 8 };
  }

  if (text.includes('llama-3') || text.includes('llama3')) {
    if (parameterCountB && parameterCountB <= 10) return { layerCount: 32, hiddenSize: 4096, attentionHeads: 32, keyValueHeads: 8 };
    if (parameterCountB && parameterCountB <= 15) return { layerCount: 40, hiddenSize: 5120, attentionHeads: 40, keyValueHeads: 8 };
    if (parameterCountB && parameterCountB <= 80) return { layerCount: 80, hiddenSize: 8192, attentionHeads: 64, keyValueHeads: 8 };
  }

  if (text.includes('mistral')) {
    return { layerCount: 32, hiddenSize: 4096, attentionHeads: 32, keyValueHeads: 8 };
  }

  if (text.includes('gemma-2') || text.includes('gemma2')) {
    if (parameterCountB && parameterCountB <= 3) return { layerCount: 26, hiddenSize: 2304, attentionHeads: 8, keyValueHeads: 4 };
    if (parameterCountB && parameterCountB <= 12) return { layerCount: 42, hiddenSize: 3584, attentionHeads: 16, keyValueHeads: 8 };
    return { layerCount: 46, hiddenSize: 4608, attentionHeads: 16, keyValueHeads: 8 };
  }

  if (text.includes('phi-3') || text.includes('phi3')) {
    if (parameterCountB && parameterCountB <= 5) return { layerCount: 32, hiddenSize: 3072, attentionHeads: 32, keyValueHeads: 32 };
    return { layerCount: 40, hiddenSize: 5120, attentionHeads: 40, keyValueHeads: 40 };
  }

  return null;
}

function getInferredContextLength(model: HfModelInfo | null): number | null {
  const text = getModelSearchText(model);
  if (text.includes('qwen2.5') || text.includes('qwen2-5') || text.includes('qwen3')) return 32768;
  if (text.includes('llama-3.1') || text.includes('llama3.1') || text.includes('llama-3.2') || text.includes('llama3.2')) return 131072;
  if (text.includes('llama-3') || text.includes('llama3')) return 8192;
  if (text.includes('mistral')) return 32768;
  if (text.includes('gemma-2') || text.includes('gemma2')) return 8192;
  if (text.includes('phi-3') || text.includes('phi3')) return 4096;
  return null;
}

function getModelParameterCountB(model: HfModelInfo | null): number | null {
  const config = getModelConfig(model);
  const explicit = readNumber(config, ['num_parameters', 'parameter_count', 'parameters']);
  if (explicit) {
    return explicit > 1_000_000 ? explicit / 1_000_000_000 : explicit;
  }

  const text = getModelSearchText(model);
  const match = text.match(/(?:^|[-_/])(\d+(?:\.\d+)?)\s*([bBmM])(?:[-_/]|$)/);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return match[2].toLowerCase() === 'm' ? value / 1000 : value;
}

function getModelSearchText(model: HfModelInfo | null): string {
  if (!model) {
    return '';
  }

  const values = [
    model.id,
    model.model_id,
    model.pipeline_tag,
    ...(Array.isArray(model.tags) ? model.tags : []),
    ...getStringValues(getModelConfig(model), ['model_type', 'architectures', 'base_model']),
  ];
  return values.filter(Boolean).join(' ').toLowerCase();
}

function getStringValues(source: Record<string, unknown>, keys: string[]): string[] {
  return keys.flatMap((key) => {
    const value = source[key];
    if (Array.isArray(value)) {
      return value.map((item) => String(item));
    }
    return value ? [String(value)] : [];
  });
}

function readNumberValue(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function stringifyConfigValue(value: unknown): string {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
