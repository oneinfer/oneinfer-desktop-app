import type { HfModelInfo } from '../types';

const BYTES_PER_GIB = 1024 ** 3;
const DEFAULT_CONTEXT_LENGTH = 4096;
const DEFAULT_KV_CACHE_GIB = 1;
const DEFAULT_ACTIVATION_OVERHEAD_GIB = 2;

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
  options: { modelWeightGb?: number; contextLength?: number; servingOverheadGb?: number } = {},
): ModelMemoryBreakdown {
  const modelWeightGb = Math.max(0, options.modelWeightGb ?? bytesToGiB(getModelWeightBytes(model)));
  const contextLength = Math.max(1, options.contextLength ?? getContextLength(model));
  const servingOverheadGb = Math.max(0, options.servingOverheadGb ?? DEFAULT_ACTIVATION_OVERHEAD_GIB);
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
  const layerCount = readNumber(config, ['num_hidden_layers', 'n_layer', 'num_layers', 'n_layers']);
  const hiddenSize = readNumber(config, ['hidden_size', 'n_embd', 'd_model']);
  const attentionHeads = readNumber(config, ['num_attention_heads', 'n_head', 'num_heads']);
  const keyValueHeads = readNumber(config, ['num_key_value_heads', 'n_head_kv', 'num_kv_heads']) ?? attentionHeads;

  if (!layerCount || !hiddenSize || !attentionHeads || !keyValueHeads) {
    return DEFAULT_KV_CACHE_GIB;
  }

  const headDim = hiddenSize / attentionHeads;
  const bytesPerElement = getKvCacheBytesPerElement(config);
  const kvBytes = 2 * layerCount * keyValueHeads * headDim * contextLength * bytesPerElement;
  return bytesToGiB(kvBytes);
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
  ]) ?? DEFAULT_CONTEXT_LENGTH;
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
  const quantization = String(config.quantization_config ?? '').toLowerCase();
  const dtype = String(config.torch_dtype ?? config.dtype ?? '').toLowerCase();
  if (quantization.includes('int8') || dtype.includes('int8')) {
    return 1;
  }

  if (dtype.includes('float32') || dtype.includes('fp32')) {
    return 4;
  }

  return 2;
}
