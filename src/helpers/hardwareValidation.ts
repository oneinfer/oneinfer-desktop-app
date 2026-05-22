import type { MachineDetailsItem } from '../types';

export interface ModelRequirements {
  minVramGb: number;
  modelSizeGb: number;
  kvCacheGb?: number;
  servingOverheadGb?: number;
}

export interface ValidationResult {
  status: 'supported' | 'warning' | 'insufficient';
  message: string;
  effectiveMinVramGb: number;
  modelWeightGb: number;
  kvCacheGb: number;
  servingOverheadGb: number;
}

export function validateHardwareSupport(
  requirements: ModelRequirements,
  machine: MachineDetailsItem | null
): ValidationResult {
  const modelWeightGb = Math.max(0, requirements.modelSizeGb);
  const kvCacheGb = Math.max(0, requirements.kvCacheGb ?? Math.max(0, requirements.minVramGb - requirements.modelSizeGb));
  const servingOverheadGb = Math.max(0, requirements.servingOverheadGb ?? 2);
  const calculatedMinVramGb = modelWeightGb + kvCacheGb + servingOverheadGb;
  const effectiveMinVramGb = Math.max(requirements.minVramGb, calculatedMinVramGb);

  if (!machine) {
    return {
      status: 'warning',
      message: 'Machine details not synced yet. Validation skipped.',
      effectiveMinVramGb,
      modelWeightGb,
      kvCacheGb,
      servingOverheadGb,
    };
  }

  // Calculate total VRAM
  const totalVramGb = machine.gpus?.reduce((acc, gpu) => acc + (gpu.vramGb ?? 0), 0) ?? 0;
  const totalRamGb = machine.memory?.totalGb ?? 0;

  const resultDetails = { effectiveMinVramGb, modelWeightGb, kvCacheGb, servingOverheadGb };

  // 1. Check VRAM (Primary for local inference like vLLM)
  if (totalVramGb >= effectiveMinVramGb) {
    // If we have 20% buffer above the effective requirement, it's green. Otherwise yellow.
    if (totalVramGb >= effectiveMinVramGb * 1.2) {
      return { status: 'supported', message: `System supports this model with model weights, KV cache, and serving overhead. (${totalVramGb}GB VRAM detected)`, ...resultDetails };
    } else {
      return { status: 'warning', message: `Tight fit: ${effectiveMinVramGb.toFixed(1)}GB VRAM needed (inc. KV cache & overhead), ${totalVramGb}GB available. Performance may vary.`, ...resultDetails };
    }
  }

  // 2. Check RAM (If model can run on CPU, but usually we want VRAM)
  // For local servers, we usually prioritize GPU.
  if (totalVramGb < effectiveMinVramGb) {
    if (totalRamGb >= requirements.modelSizeGb * 2) {
      return { status: 'warning', message: `Insufficient VRAM (${totalVramGb}GB for ${effectiveMinVramGb.toFixed(1)}GB req), but system RAM (${totalRamGb}GB) might allow CPU inference (very slow).`, ...resultDetails };
    } else {
      return { status: 'insufficient', message: `Insufficient hardware. Model needs ~${effectiveMinVramGb.toFixed(1)}GB VRAM (Weights + KV Cache + Library). System has ${totalVramGb}GB.`, ...resultDetails };
    }
  }

  return { status: 'supported', message: 'Hardware check passed.', ...resultDetails };
}
