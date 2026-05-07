import { Server } from 'lucide-react';

import type { DashboardState } from '../types';

export function HardwareWidget(props: { machine: DashboardState['machineDetails'] }) {
  const { machine } = props;

  if (!machine) {
    return (
      <div className="hw-widget glass-panel" style={{ height: '145px' }}>
        <div className="hw-widget-header">
          <Server size={15} />
          <span>Local Hardware</span>
        </div>
        <p className="hw-widget-empty">Machine profile not synced yet.</p>
      </div>
    );
  }

  const gpuCount = Array.isArray(machine.gpus) ? machine.gpus.length : 0;
  const gpuLabel = gpuCount === 0
    ? 'No GPU'
    : gpuCount === 1
      ? String(machine.gpus![0].name ?? machine.gpus![0].model ?? '1 GPU')
      : `${gpuCount} GPUs`;

  const stats: Array<{ label: string; value: string }> = [
    { label: 'Machine', value: String(machine.machineName ?? machine.hostname ?? '-') },
    { label: 'CPU', value: String(machine.cpu?.brand ?? machine.cpu?.manufacturer ?? '-') },
    { label: 'RAM', value: typeof machine.memory?.totalGb === 'number' ? `${machine.memory.totalGb} GB` : '-' },
    { label: 'GPU', value: gpuLabel },
  ];

  return (
    <div className="hw-widget glass-panel" style={{ height: '145px' }}>
      <div className="hw-widget-header">
        <Server size={15} />
        <span>Local Hardware</span>
      </div>
      <div className="hw-widget-stats">
        {stats.map(({ label, value }) => (
          <div className="hw-stat" key={label}>
            <span className="hw-stat-label">{label}</span>
            <strong className="hw-stat-value">{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
