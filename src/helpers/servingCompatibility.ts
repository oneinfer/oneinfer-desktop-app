import type { HfModelInfo, ServingLibrary } from '../types';

export interface ServingLibraryCompatibility {
  supported: boolean;
  reason?: string;
}

const TRANSFORMERS_MODEL_TYPES = new Set([
  'bert',
  'bloom',
  'codegen',
  'deberta',
  'deberta-v2',
  'distilbert',
  'falcon',
  'gemma',
  'gemma2',
  'gpt2',
  'gpt_bigcode',
  'gpt_neox',
  'gptj',
  'granite',
  'hrm_text',
  'llama',
  'mistral',
  'mixtral',
  'mpt',
  'opt',
  'phi',
  'phi3',
  'qwen2',
  'qwen3',
  'roberta',
  'starcoder2',
  't5',
]);

const VLLM_MODEL_TYPES = new Set([
  'bloom',
  'falcon',
  'gemma',
  'gemma2',
  'gpt2',
  'gpt_bigcode',
  'gpt_neox',
  'gptj',
  'granite',
  'llama',
  'mistral',
  'mixtral',
  'mpt',
  'opt',
  'phi',
  'phi3',
  'qwen2',
  'qwen3',
  'starcoder2',
]);

export function getServingLibraryCompatibility(library: ServingLibrary, model: HfModelInfo): ServingLibraryCompatibility {
  const gguf = isGgufModel(model);
  if (library === 'ollama' || library === 'llama_cpp') {
    return gguf
      ? { supported: true }
      : { supported: false, reason: 'This is not a GGUF/llama.cpp model.' };
  }

  if (library === 'tensorrt') {
    return hasAnyFileExtension(model, ['.engine', '.plan'])
      ? { supported: true }
      : { supported: false, reason: 'TensorRT-LLM needs a TensorRT engine or plan artifact.' };
  }

  if (gguf) {
    return { supported: false, reason: 'GGUF models should use Ollama or llama.cpp.' };
  }

  const modelType = getModelType(model);
  if (library === 'transformers') {
    if (!modelType || TRANSFORMERS_MODEL_TYPES.has(modelType)) {
      return { supported: true };
    }

    return {
      supported: false,
      reason: `Transformers does not recognize model type "${modelType}" in this app runtime.`,
    };
  }

  if (library === 'vllm' || library === 'sglang' || library === 'dynamo') {
    if (!modelType || VLLM_MODEL_TYPES.has(modelType)) {
      return { supported: true };
    }

    return {
      supported: false,
      reason: `${formatServingLibraryName(library)} does not support model type "${modelType}" for one-click deployment.`,
    };
  }

  if (library === 'pytorch') {
    const modelType = getModelType(model);
    if (!modelType || TRANSFORMERS_MODEL_TYPES.has(modelType)) {
      return { supported: true, reason: 'PyTorch is available through the Transformers serving runtime for this model.' };
    }

    return {
      supported: false,
      reason: `PyTorch alone is not an OpenAI-compatible serving server for model type "${modelType}". Select Transformers when available.`,
    };
  }

  return { supported: true };
}

export function isServingLibraryCompatibleWithModel(library: ServingLibrary, model: HfModelInfo): boolean {
  return getServingLibraryCompatibility(library, model).supported;
}

export function isGgufModel(model: HfModelInfo): boolean {
  const id = String(model.id ?? '').toLowerCase();
  const tags = (model.tags || []).map((tag) => String(tag).toLowerCase());
  return id.includes('gguf')
    || tags.some((tag) => tag.includes('gguf') || tag.includes('llama.cpp') || tag.includes('llamacpp'))
    || hasAnyFileExtension(model, ['.gguf', '.ggml']);
}

export function hasAnyFileExtension(model: HfModelInfo, extensions: string[]): boolean {
  return Array.isArray(model.siblings)
    && model.siblings.some((file) => {
      const filename = String(file.rfilename ?? '').toLowerCase();
      return extensions.some((extension) => filename.endsWith(extension));
    });
}

function getModelType(model: HfModelInfo): string {
  const config = model.config && typeof model.config === 'object' && !Array.isArray(model.config)
    ? model.config as Record<string, unknown>
    : {};
  return String(config.model_type ?? '').trim().toLowerCase();
}

function formatServingLibraryName(library: ServingLibrary): string {
  const labels: Record<ServingLibrary, string> = {
    vllm: 'vLLM',
    sglang: 'SGLang',
    tensorrt: 'TensorRT-LLM',
    ollama: 'Ollama',
    llama_cpp: 'llama.cpp',
    pytorch: 'PyTorch',
    transformers: 'Transformers',
    dynamo: 'Dynamo',
  };
  return labels[library] ?? library;
}
