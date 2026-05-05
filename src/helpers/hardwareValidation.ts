import type { MachineDetailsItem } from '../types';

export interface ModelRequirements {
  minVramGb: number;
  modelSizeGb: number;
}

export interface ValidationResult {
  status: 'supported' | 'warning' | 'insufficient';
  message: string;
  effectiveMinVramGb: number;
}

export function validateHardwareSupport(
  requirements: ModelRequirements,
  machine: MachineDetailsItem | null
): ValidationResult {
  if (!machine) {
    return { status: 'warning', message: 'Machine details not synced yet. Validation skipped.', effectiveMinVramGb: requirements.modelSizeGb };
  }

  // Constants for overhead
  const KV_CACHE_PERCENT = 0.15; // 15% for KV Cache
  const SERVING_LIB_VRAM_GB = 2; // ~2GB fixed overhead for vLLM/Ollama

  // Calculate total VRAM
  const totalVramGb = machine.gpus?.reduce((acc, gpu) => acc + (gpu.vramGb ?? 0), 0) ?? 0;
  const totalRamGb = machine.memory?.totalGb ?? 0;

  // Calculate Effective Requirements
  // 1. Model Weights
  // 2. KV Cache (depends on model size/architecture)
  // 3. Serving library overhead
  const effectiveMinVramGb = requirements.modelSizeGb + (requirements.modelSizeGb * KV_CACHE_PERCENT) + SERVING_LIB_VRAM_GB;

  // 1. Check VRAM (Primary for local inference like vLLM)
  if (totalVramGb >= effectiveMinVramGb) {
    // If we have 20% buffer above the effective requirement, it's green. Otherwise yellow.
    if (totalVramGb >= effectiveMinVramGb * 1.2) {
      return { status: 'supported', message: `System supports this model with full KV cache and serving overhead. (${totalVramGb}GB VRAM detected)`, effectiveMinVramGb };
    } else {
      return { status: 'warning', message: `Tight fit: ${effectiveMinVramGb.toFixed(1)}GB VRAM needed (inc. KV cache & overhead), ${totalVramGb}GB available. Performance may vary.`, effectiveMinVramGb };
    }
  }

  // 2. Check RAM (If model can run on CPU, but usually we want VRAM)
  // For local servers, we usually prioritize GPU.
  if (totalVramGb < effectiveMinVramGb) {
    if (totalRamGb >= requirements.modelSizeGb * 2) {
      return { status: 'warning', message: `Insufficient VRAM (${totalVramGb}GB for ${effectiveMinVramGb.toFixed(1)}GB req), but system RAM (${totalRamGb}GB) might allow CPU inference (very slow).`, effectiveMinVramGb };
    } else {
      return { status: 'insufficient', message: `Insufficient hardware. Model needs ~${effectiveMinVramGb.toFixed(1)}GB VRAM (Weights + KV Cache + Library). System has ${totalVramGb}GB.`, effectiveMinVramGb };
    }
  }

  return { status: 'supported', message: 'Hardware check passed.', effectiveMinVramGb };
}
