import type { DashboardState } from '../types';

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString() : String(value);
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

export function getBalance(credits: DashboardState['credits']): string {
  if (!credits) {
    return '-';
  }

  const possibleValues = [
    credits.credit_balance,
    credits.balance,
    credits.current_balance,
  ];

  const numeric = possibleValues.find((value) => typeof value === 'number');
  return numeric !== undefined ? `$${(Number(numeric) / 100).toFixed(2)}` : 'Available';
}

export function getPlanName(profile: DashboardState['profile']) {
  if (!profile) return 'No Active plan';
  const rawProfile = typeof profile.developer === 'object' && profile.developer !== null
    ? profile.developer as Record<string, unknown>
    : profile;

  const rawName = rawProfile.plan_name ?? rawProfile.plan ?? (rawProfile as any).developer_plan ?? (rawProfile as any).subscription_tier;

  if (!rawName || String(rawName).toLowerCase() === 'free') {
    return 'No Active plan';
  }

  return String(rawName);
}

export function formatMachineCapacity(value?: number, unit = 'GB'): string {
  return typeof value === 'number' ? `${value.toLocaleString()} ${unit}` : '-';
}

export function getMachineSummaryEntries(machine: DashboardState['machineDetails']): Array<[string, unknown]> {
  if (!machine) {
    return [];
  }

  const cpu = machine.cpu ?? {};
  const memory = machine.memory ?? {};

  const entries: Array<[string, unknown]> = [
    ['Machine', machine.machineName ?? machine.hostname],
    ['OS', [machine.osName, machine.osRelease].filter(Boolean).join(' ') || machine.platform],
    ['Architecture', machine.architecture],
    ['CPU', cpu.brand ?? cpu.manufacturer],
    ['vCPUs', cpu.logicalCores],
    ['Physical Cores', cpu.physicalCores],
    ['RAM', formatMachineCapacity(memory.totalGb)],
    ['GPU Count', Array.isArray(machine.gpus) ? machine.gpus.length : 0],
    ['Collected', machine.collectedAt ?? machine.updated_at],
  ];

  return entries.filter(([, value]) => value !== undefined && value !== null && value !== '');
}

export function getMachineGpuRows(machine: DashboardState['machineDetails']): Array<Record<string, unknown>> {
  if (!machine?.gpus || !Array.isArray(machine.gpus)) {
    return [];
  }

  return machine.gpus.map((gpu) => ({
    name: gpu.name ?? gpu.model ?? 'Unknown GPU',
    vendor: gpu.vendor ?? 'Unknown',
    vram: formatMachineCapacity(gpu.vramGb),
    utilization: typeof gpu.utilizationPercent === 'number' ? `${gpu.utilizationPercent}%` : '-',
    driver: gpu.driverVersion ?? '-',
  }));
}

export function formatNumber(num?: number): string {
  if (num === undefined || num === null) return '-';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
}
