import type { HfModelInfo } from '../types';

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

export function getModelWeightBytes(model: HfModelInfo | null): number {
  if (!model) {
    return 0;
  }

  const safetensorsTotal = Number((model as any).safetensors?.total ?? 0);
  const siblingWeightTotal = Array.isArray(model.siblings)
    ? model.siblings.reduce((acc, file) => {
        const filename = String(file.rfilename ?? '').toLowerCase();
        const size = Number(file.size ?? 0);
        if (!size || excludedWeightFragments.some((fragment) => filename.includes(fragment))) {
          return acc;
        }

        return modelWeightExtensions.some((extension) => filename.endsWith(extension))
          ? acc + size
          : acc;
      }, 0)
    : 0;

  return siblingWeightTotal || safetensorsTotal || Number((model as any).usedStorage ?? 0);
}

export function bytesToGiB(bytes: number): number {
  return bytes > 0 ? bytes / (1024 ** 3) : 0;
}
