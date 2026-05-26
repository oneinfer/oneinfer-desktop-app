import type { MachineDetailsItem } from '../types';
import { DEFAULT_SERVING_LIBRARY_OVERHEAD_GIB } from './modelSizing';

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

export interface AcceleratorMemorySummary {
  totalGb: number;
  dedicatedGb: number;
  unifiedGb: number;
  label: string;
  capacityLabel: string;
  hasUnifiedMemory: boolean;
}

export function getAcceleratorMemorySummary(machine: MachineDetailsItem | null): AcceleratorMemorySummary {
  const gpus = Array.isArray(machine?.gpus) ? machine.gpus : [];
  const dedicatedGb = gpus.reduce((acc, gpu) => (
    gpu.memoryKind === 'unified' ? acc : acc + (gpu.vramGb ?? 0)
  ), 0);
  const unifiedGb = gpus.reduce((acc, gpu) => (
    gpu.memoryKind === 'unified' ? acc + (gpu.vramGb ?? gpu.unifiedMemoryGb ?? 0) : acc
  ), 0);
  const inferredAppleUnifiedGb = dedicatedGb + unifiedGb === 0 && isAppleSiliconMachine(machine)
    ? Math.max(0, (machine?.memory?.totalGb ?? 0) * 0.75)
    : 0;
  const totalUnifiedGb = unifiedGb + inferredAppleUnifiedGb;
  const totalGb = dedicatedGb + totalUnifiedGb;
  const hasUnifiedMemory = unifiedGb > 0;
  const hasAcceleratorUnifiedMemory = totalUnifiedGb > 0;
  const label = hasAcceleratorUnifiedMemory ? 'accelerator memory' : 'VRAM';
  const capacityLabel = hasAcceleratorUnifiedMemory
    ? `${formatGb(totalGb)}GB accelerator memory (${formatGb(totalUnifiedGb)}GB unified)`
    : `${formatGb(totalGb)}GB VRAM`;

  return {
    totalGb,
    dedicatedGb,
    unifiedGb: totalUnifiedGb,
    label,
    capacityLabel,
    hasUnifiedMemory: hasAcceleratorUnifiedMemory,
  };
}

export function validateHardwareSupport(
  requirements: ModelRequirements,
  machine: MachineDetailsItem | null
): ValidationResult {
  const modelWeightGb = Math.max(0, requirements.modelSizeGb);
  const kvCacheGb = Math.max(0, requirements.kvCacheGb ?? Math.max(0, requirements.minVramGb - requirements.modelSizeGb));
  const servingOverheadGb = Math.max(0, requirements.servingOverheadGb ?? DEFAULT_SERVING_LIBRARY_OVERHEAD_GIB);
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

  const acceleratorMemory = getAcceleratorMemorySummary(machine);
  const totalVramGb = acceleratorMemory.totalGb;
  const totalRamGb = machine.memory?.totalGb ?? 0;

  const resultDetails = { effectiveMinVramGb, modelWeightGb, kvCacheGb, servingOverheadGb };

  // 1. Check VRAM (Primary for local inference like vLLM)
  if (totalVramGb >= effectiveMinVramGb) {
    // If we have 20% buffer above the effective requirement, it's green. Otherwise yellow.
    if (totalVramGb >= effectiveMinVramGb * 1.2) {
      return { status: 'supported', message: `System supports this model with model weights, KV cache, and serving library overhead. (${acceleratorMemory.capacityLabel} detected)`, ...resultDetails };
    } else {
      return { status: 'warning', message: `Tight fit: ${effectiveMinVramGb.toFixed(1)}GB ${acceleratorMemory.label} needed (inc. KV cache & serving library overhead), ${formatGb(totalVramGb)}GB available. Performance may vary.`, ...resultDetails };
    }
  }

  // 2. Check RAM (If model can run on CPU, but usually we want VRAM)
  // For local servers, we usually prioritize GPU.
  if (totalVramGb < effectiveMinVramGb) {
    if (totalRamGb >= requirements.modelSizeGb * 2) {
      return { status: 'warning', message: `Insufficient ${acceleratorMemory.label} (${formatGb(totalVramGb)}GB for ${effectiveMinVramGb.toFixed(1)}GB req), but system RAM (${formatGb(totalRamGb)}GB) might allow CPU inference (very slow).`, ...resultDetails };
    } else {
      return { status: 'insufficient', message: `Insufficient hardware. Model needs ~${effectiveMinVramGb.toFixed(1)}GB ${acceleratorMemory.label} (Weights + KV Cache + Serving Library). System has ${formatGb(totalVramGb)}GB.`, ...resultDetails };
    }
  }

  return { status: 'supported', message: 'Hardware check passed.', ...resultDetails };
}

function formatGb(value: number): string {
  return Number.isFinite(value) ? Number(value.toFixed(1)).toLocaleString() : '0';
}

function isAppleSiliconMachine(machine: MachineDetailsItem | null): boolean {
  if (!machine) {
    return false;
  }

  const text = [
    machine.platform,
    machine.osName,
    machine.osRelease,
    machine.architecture,
    machine.cpu?.brand,
    machine.cpu?.manufacturer,
    machine.machineName,
  ].filter(Boolean).join(' ').toLowerCase();

  const isMac = text.includes('darwin') || text.includes('mac') || text.includes('apple');
  const isArm = text.includes('arm64') || text.includes('aarch64') || /\bm[1-4]\b/.test(text);
  return isMac && isArm && typeof machine.memory?.totalGb === 'number' && machine.memory.totalGb > 0;
}
