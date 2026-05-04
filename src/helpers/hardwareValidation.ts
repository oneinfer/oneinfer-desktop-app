import type { MachineDetailsItem } from '../types';

export interface ModelRequirements {
  minVramGb: number;
  modelSizeGb: number;
}

export interface ValidationResult {
  status: 'supported' | 'warning' | 'insufficient';
  message: string;
}

export function validateHardwareSupport(
  requirements: ModelRequirements,
  machine: MachineDetailsItem | null
): ValidationResult {
  if (!machine) {
    return { status: 'warning', message: 'Machine details not synced yet. Validation skipped.' };
  }

  // Calculate total VRAM
  const totalVramGb = machine.gpus?.reduce((acc, gpu) => acc + (gpu.vramGb ?? 0), 0) ?? 0;
  const totalRamGb = machine.memory?.totalGb ?? 0;

  // 1. Check VRAM (Primary for local inference like vLLM)
  if (totalVramGb >= requirements.minVramGb) {
    // If we have 20% buffer, it's green. Otherwise yellow.
    if (totalVramGb >= requirements.minVramGb * 1.2) {
      return { status: 'supported', message: `System supports this model. (${totalVramGb}GB VRAM detected)` };
    } else {
      return { status: 'warning', message: `Tight fit: ${requirements.minVramGb}GB VRAM required, ${totalVramGb}GB available. Might be slow.` };
    }
  }

  // 2. Check RAM (If model can run on CPU, but usually we want VRAM)
  // For local servers, we usually prioritize GPU.
  if (totalVramGb < requirements.minVramGb) {
    if (totalRamGb >= requirements.modelSizeGb * 2) {
      return { status: 'warning', message: `Insufficient VRAM (${totalVramGb}GB), but system RAM (${totalRamGb}GB) might allow CPU inference (very slow).` };
    } else {
      return { status: 'insufficient', message: `Insufficient hardware. Model needs ~${requirements.minVramGb}GB VRAM. System has ${totalVramGb}GB.` };
    }
  }

  return { status: 'supported', message: 'Hardware check passed.' };
}
