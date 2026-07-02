import { useEffect, useMemo, useState } from 'react';
import { Boxes, RotateCcw } from 'lucide-react';

import { Panel } from '../components/Common';
import {
  loadQuantizationComparisonRuns,
  type QuantizationComparisonRun,
} from '../helpers/quantizationHistory';
import type { DashboardState } from '../types';

export function QuantizationComparePage(_props: { dashboard: DashboardState }) {
  const [runs, setRuns] = useState<QuantizationComparisonRun[]>(() => loadQuantizationComparisonRuns());
  const [selectedRunId, setSelectedRunId] = useState(runs[0]?.id || '');

  useEffect(() => {
    const refreshRuns = () => {
      const nextRuns = loadQuantizationComparisonRuns();
      setRuns(nextRuns);
      setSelectedRunId((current) => current || nextRuns[0]?.id || '');
    };

    window.addEventListener('oneinfer:quantization-runs-changed', refreshRuns);
    window.addEventListener('storage', refreshRuns);
    return () => {
      window.removeEventListener('oneinfer:quantization-runs-changed', refreshRuns);
      window.removeEventListener('storage', refreshRuns);
    };
  }, []);

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) || runs[0] || null,
    [runs, selectedRunId],
  );
  const comparisonRows = useMemo(() => selectedRun ? getComparisonRows(selectedRun) : [], [selectedRun]);

  const modelRuns = useMemo(() => runs.filter((r) => r.modelName === selectedRun?.modelName), [runs, selectedRun?.modelName]);
  const availableSchemes = useMemo(() => {
    const schemes = modelRuns.map((r) => r.scheme || r.kind.toUpperCase()).filter(Boolean);
    return Array.from(new Set(schemes));
  }, [modelRuns]);
  const [selectedSchemes, setSelectedSchemes] = useState<string[]>([]);

  useEffect(() => {
    setSelectedSchemes(availableSchemes);
  }, [availableSchemes]);

  if (!selectedRun) {
    return (
      <div className="quant-compare-page">
        <div className="quant-compare-empty glass-panel">
          <span className="eyebrow">Quantization Compare</span>
          <h2>No completed quantization run yet</h2>
          <p>Run a full ONNX eval or GGUF quantization first. Completed runs will appear here with before and after graphs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="quant-compare-page">
      <div className="quant-compare-header">
        <div>
          <span className="eyebrow">Quantization Compare</span>
          <h2>Before and after quantization</h2>
          <p>Review measured size, latency, quality, and graph changes from completed local runs.</p>
        </div>
        <div className="quant-compare-controls">
          <select value={selectedRun.id} onChange={(event) => setSelectedRunId(event.target.value)}>
            {runs.map((run) => (
              <option value={run.id} key={run.id}>
                {run.modelName} - {run.scheme || run.kind.toUpperCase()} - {formatDate(run.createdAt)}
              </option>
            ))}
          </select>
          <button className="secondary-button" type="button" onClick={() => setRuns(loadQuantizationComparisonRuns())}>
            <RotateCcw size={16} />
            Refresh
          </button>
        </div>
      </div>

      <div className="quant-compare-summary glass-panel">
        <div>
          <span className="eyebrow">{selectedRun.kind === 'onnx' ? 'ONNX model result' : 'GGUF model result'}</span>
          <h3>{selectedRun.modelName}</h3>
          <p>
            {selectedRun.scheme || selectedRun.request?.bits?.toUpperCase() || 'Quantized'} on {selectedRun.targetLabel}
            {selectedRun.dataset ? ` using ${selectedRun.dataset}` : ''}.
          </p>
        </div>
        <div className="quant-compare-summary-meta">
          <strong>{formatDate(selectedRun.createdAt)}</strong>
          <span>{selectedRun.result.evaluation?.status || selectedRun.result.evaluation?.datasetStatus || 'completed'}</span>
        </div>
      </div>

      <div className="quant-compare-metrics">
        {comparisonRows.map((row) => (
          <div className={`metric-card ${row.tone}`} key={row.label}>
            <span>{row.label}</span>
            <strong>{row.after}</strong>
            <small>{row.delta}</small>
          </div>
        ))}
      </div>

      <div className="quant-compare-scheme-selector" style={{ marginTop: '24px', marginBottom: '16px' }}>
        <span className="eyebrow" style={{ display: 'block', marginBottom: '8px' }}>Compare Schemes</span>
        <div className="quant-hf-bit-selector" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {availableSchemes.map((scheme) => {
            const active = selectedSchemes.includes(scheme);
            return (
              <button
                className={active ? 'active' : ''}
                key={scheme}
                type="button"
                onClick={() => {
                  setSelectedSchemes((current) =>
                    current.includes(scheme)
                      ? current.filter((v) => v !== scheme)
                      : [...current, scheme]
                  );
                }}
              >
                <strong>{scheme.split(' ')[0]}</strong>
                <span>{scheme}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="section-grid three-col" style={{ marginBottom: '24px' }}>
        <Panel title="Model Size" icon={Boxes} description="Before and after model file size (GB/MB).">
          <MetricProgressionChart
            title="Size"
            metricLabel="Model Size"
            formatter={formatBytes}
            selectedSchemes={selectedSchemes}
            modelRuns={modelRuns}
            valueExtractor={(run, isBaseline) => {
              const detail = getDetailResult(run);
              return isBaseline 
                ? (detail.baselineSizeBytes ?? run.result.baselineSizeBytes ?? null)
                : (detail.quantizedSizeBytes ?? run.result.quantizedSizeBytes ?? null);
            }}
          />
        </Panel>

        <Panel title="Latency" icon={Boxes} description="Before and after model latency (ms).">
          <MetricProgressionChart
            title="Latency"
            metricLabel="Latency"
            formatter={formatMilliseconds}
            selectedSchemes={selectedSchemes}
            modelRuns={modelRuns}
            valueExtractor={(run, isBaseline) => {
              const detail = getDetailResult(run);
              return isBaseline
                ? (run.kind === 'onnx' ? run.result.evaluation?.baselineLatencyMs ?? null : detail.generation?.baseline?.durationMs ?? null)
                : (run.kind === 'onnx' ? run.result.evaluation?.quantizedLatencyMs ?? null : detail.generation?.quantized?.durationMs ?? null);
            }}
          />
        </Panel>

        <Panel title="Speed" icon={Boxes} description="Before and after tokens/sec.">
          <MetricProgressionChart
            title="Speed"
            metricLabel="Tokens/sec"
            formatter={formatCompactNumber}
            selectedSchemes={selectedSchemes}
            modelRuns={modelRuns}
            valueExtractor={(run, isBaseline) => {
              const detail = getDetailResult(run);
              return isBaseline
                ? detail.generation?.baseline?.tokensPerSecond ?? null
                : detail.generation?.quantized?.tokensPerSecond ?? null;
            }}
          />
        </Panel>
      </div>





      <Panel title="Tradeoff line graph" icon={Boxes} description="Normalized score trend from baseline to quantized output.">
        <TradeoffLineGraph run={selectedRun} rows={comparisonRows} />
      </Panel>
    </div>
  );
}



function TradeoffLineGraph(props: { run: QuantizationComparisonRun; rows: ComparisonRow[] }) {
  const latencyRow = props.rows.find((row) => row.label === 'Latency');
  const speedRow = props.rows.find((row) => row.label === 'Tokens/sec');
  const sizeRow = props.rows.find((row) => row.label === 'Model size');
  const values = [
    { label: 'Size', row: sizeRow, goodWhenLower: true },
    { label: 'Latency', row: latencyRow, goodWhenLower: true },
    { label: 'Speed', row: speedRow, goodWhenLower: false },
  ].filter((item) => item.row) as Array<{ label: string; row: ComparisonRow; goodWhenLower: boolean }>;
  const points = values.map((item, index) => {
    const improvement = getImprovementPercent(item.row, item.goodWhenLower);
    const x = 96 + index * 250;
    const y = 212 - clamp((improvement + 100) / 2, 0, 100) * 1.5;
    return { ...item, x, y, improvement };
  });
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

  return (
    <div className="quant-tradeoff-line">
      <svg viewBox="0 0 720 280" role="img" aria-label="Quantization tradeoff line graph">
        {[0, 1, 2, 3].map((line) => (
          <line className="grid" x1="64" x2="676" y1={58 + line * 48} y2={58 + line * 48} key={line} />
        ))}
        <text className="axis-label" x="64" y="34">Improvement</text>
        <text className="axis-label" x="644" y="246">Metrics</text>
        {path ? <path className="tradeoff-path" d={path} /> : null}
        {points.map((point) => (
          <g key={point.label}>
            <circle className={point.improvement >= 0 ? 'good' : 'warn'} cx={point.x} cy={point.y} r="8" />
            <text className="point-label" x={point.x} y={point.y - 16} textAnchor="middle">{formatSignedPercent(point.improvement)}</text>
            <text className="tick" x={point.x} y="254" textAnchor="middle">{point.label}</text>
          </g>
        ))}
      </svg>
      <div className="quant-tradeoff-caption">
        <strong>{props.run.scheme || props.run.kind.toUpperCase()}</strong>
        <span>Line shows where quantization helped or hurt across measured metrics.</span>
      </div>
    </div>
  );
}



type ComparisonRow = NonNullable<ReturnType<typeof createCompareRow>>;

function getComparisonRows(run: QuantizationComparisonRun) {
  const detail = getDetailResult(run);
  const sizeBefore = detail.baselineSizeBytes ?? run.result.baselineSizeBytes ?? null;
  const sizeAfter = detail.quantizedSizeBytes ?? run.result.quantizedSizeBytes ?? null;
  const baselineLatency = run.kind === 'onnx'
    ? run.result.evaluation?.baselineLatencyMs ?? null
    : detail.generation?.baseline?.durationMs ?? null;
  const quantizedLatency = run.kind === 'onnx'
    ? run.result.evaluation?.quantizedLatencyMs ?? null
    : detail.generation?.quantized?.durationMs ?? null;
  const baselineSpeed = detail.generation?.baseline?.tokensPerSecond ?? null;
  const quantizedSpeed = detail.generation?.quantized?.tokensPerSecond ?? null;

  const rows = [
    createCompareRow('Model size', sizeBefore, sizeAfter, formatBytes, true, 'sky'),
    createCompareRow('Latency', baselineLatency, quantizedLatency, formatMilliseconds, true, 'sea'),
  ].filter(Boolean) as ComparisonRow[];

  if (baselineSpeed !== null || quantizedSpeed !== null) {
    const speedRow = createCompareRow('Tokens/sec', baselineSpeed, quantizedSpeed, formatCompactNumber, false, 'sea');
    if (speedRow) {
      rows.push(speedRow);
    }
  }

  return rows.length > 0 ? rows : [{
    label: 'Result',
    before: 'Baseline',
    after: 'Quantized',
    beforeValue: 1,
    afterValue: 1,
    delta: 'Completed',
    beforeWidth: 100,
    afterWidth: 100,
    tone: 'sea',
    lowerIsBetter: true,
  }];
}

function createCompareRow(
  label: string,
  beforeValue: number | null | undefined,
  afterValue: number | null | undefined,
  formatter: (value?: number | null) => string,
  lowerIsBetter: boolean,
  tone: string,
) {
  if (!isFiniteNumber(beforeValue) && !isFiniteNumber(afterValue)) {
    return null;
  }

  const max = Math.max(Number(beforeValue || 0), Number(afterValue || 0), 1);
  const delta = isFiniteNumber(beforeValue) && isFiniteNumber(afterValue) && Number(beforeValue) !== 0
    ? ((Number(afterValue) - Number(beforeValue)) / Number(beforeValue)) * 100
    : null;

  return {
    label,
    before: formatter(beforeValue),
    after: formatter(afterValue),
    beforeValue: isFiniteNumber(beforeValue) ? Number(beforeValue) : null,
    afterValue: isFiniteNumber(afterValue) ? Number(afterValue) : null,
    delta: delta === null ? 'delta not measured' : `${formatSignedPercent(delta)} ${lowerIsBetter ? 'lower' : 'higher'}`,
    beforeWidth: clamp((Number(beforeValue || 0) / max) * 100, 6, 100),
    afterWidth: clamp((Number(afterValue || 0) / max) * 100, 6, 100),
    tone: delta !== null && ((lowerIsBetter && delta <= 0) || (!lowerIsBetter && delta >= 0)) ? tone : 'gold',
    lowerIsBetter,
  };
}



function getImprovementPercent(row: ComparisonRow, lowerIsBetter: boolean) {
  if (!isFiniteNumber(row.beforeValue) || !isFiniteNumber(row.afterValue) || row.beforeValue === 0) {
    return 0;
  }

  const rawDelta = ((row.afterValue - row.beforeValue) / row.beforeValue) * 100;
  return lowerIsBetter ? -rawDelta : rawDelta;
}







function getDetailResult(run: QuantizationComparisonRun): QuantizationComparisonRun['result'] {
  const runs = run.result.runs;
  return Array.isArray(runs) && runs.length > 0 ? runs[0] : run.result;
}

function getLatencyDelta(run: QuantizationComparisonRun) {
  const detail = getDetailResult(run);
  return run.kind === 'onnx'
    ? run.result.evaluation?.latencyDeltaPercent ?? null
    : detail.generation?.latencyDeltaPercent ?? null;
}

function getBestQualityValue(run: QuantizationComparisonRun) {
  const evaluation = run.result.evaluation;
  const detail = getDetailResult(run);
  const candidates = [
    evaluation?.keypointMap5095,
    evaluation?.keypointMap50,
    evaluation?.map5095,
    evaluation?.map50,
    detail.generation?.tokenAgreement,
  ];
  const found = candidates.find(isFiniteNumber);
  if (found === undefined || found === null) {
    return null;
  }

  return Math.abs(found) <= 1 ? found * 100 : found;
}

function isFiniteNumber(value?: number | null): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatBytes(value?: number | null) {
  if (!isFiniteNumber(value) || value <= 0) {
    return 'Not measured';
  }

  const gb = value / 1024 ** 3;
  if (gb >= 1) {
    return `${gb.toFixed(2)} GB`;
  }

  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

function formatMilliseconds(value?: number | null) {
  if (!isFiniteNumber(value)) {
    return 'Not measured';
  }

  return value >= 100 ? `${Math.round(value)} ms` : `${value.toFixed(1)} ms`;
}

function formatSignedPercent(value?: number | null) {
  if (!isFiniteNumber(value)) {
    return '';
  }

  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}



function formatCompactNumber(value?: number | null) {
  if (!isFiniteNumber(value)) {
    return 'Not measured';
  }

  if (Math.abs(value) < 0.001 && value !== 0) {
    return value.toExponential(2);
  }

  return value >= 100 ? value.toFixed(1) : value.toFixed(2);
}

function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  const side = Math.max(4, Math.floor((maxLength - 3) / 2));
  return `${value.slice(0, side)}...${value.slice(-side)}`;
}

interface MetricProgressionChartProps {
  title: string;
  metricLabel: string;
  formatter: (value?: number | null) => string;
  selectedSchemes: string[];
  modelRuns: QuantizationComparisonRun[];
  valueExtractor: (run: QuantizationComparisonRun, isBaseline: boolean) => number | null;
}

function MetricProgressionChart(props: MetricProgressionChartProps) {
  const { formatter, selectedSchemes, modelRuns, valueExtractor } = props;
  const schemeColors = ['#74e3c5', '#71beff', '#ffc66d', '#ff7b72', '#d2a8ff'];

  const data = useMemo(() => {
    return selectedSchemes.map((scheme, index) => {
      const run = modelRuns.find((r) => (r.scheme || r.kind.toUpperCase()) === scheme);
      if (!run) return null;
      const before = valueExtractor(run, true);
      const after = valueExtractor(run, false);
      return {
        scheme,
        before,
        after,
        color: schemeColors[index % schemeColors.length],
      };
    }).filter(Boolean) as Array<{ scheme: string; before: number | null; after: number | null; color: string }>;
  }, [selectedSchemes, modelRuns, valueExtractor]);

  const baselineVal = useMemo(() => {
    for (const item of data) {
      if (item.before !== null && Number.isFinite(item.before)) {
        return item.before;
      }
    }
    return null;
  }, [data]);

  const allNums = useMemo(() => {
    const nums: number[] = [];
    if (baselineVal !== null) nums.push(baselineVal);
    data.forEach((item) => {
      if (item.after !== null && Number.isFinite(item.after)) {
        nums.push(item.after);
      }
    });
    return nums;
  }, [baselineVal, data]);

  const maxVal = allNums.length > 0 ? Math.max(...allNums) : 1;
  const minVal = 0;

  const getY = (val: number | null) => {
    if (val === null || !Number.isFinite(val)) return 100;
    const normalized = (val - minVal) / (maxVal - minVal || 1);
    return 150 - normalized * 110;
  };

  if (data.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>
        No schemes selected or runs found.
      </div>
    );
  }

  const beforeY = baselineVal !== null ? getY(baselineVal) : 100;

  return (
    <div className="quant-line-chart" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <svg viewBox="0 0 240 180" style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        {[0.25, 0.5, 0.75, 1.0].map((ratio) => {
          const y = 150 - ratio * 110;
          return (
            <line
              key={ratio}
              x1="30"
              y1={y}
              x2="210"
              y2={y}
              style={{ stroke: 'rgba(144, 197, 255, 0.08)', strokeWidth: 1 }}
            />
          );
        })}

        <line x1="50" y1="30" x2="50" y2="160" style={{ stroke: 'rgba(255, 255, 255, 0.1)', strokeWidth: 1.5 }} />
        <line x1="190" y1="30" x2="190" y2="160" style={{ stroke: 'rgba(255, 255, 255, 0.1)', strokeWidth: 1.5 }} />

        <text x="50" y="174" textAnchor="middle" style={{ fill: 'var(--muted)', fontSize: '0.7rem', fontWeight: 800 }}>Before</text>
        <text x="190" y="174" textAnchor="middle" style={{ fill: 'var(--muted)', fontSize: '0.7rem', fontWeight: 800 }}>After</text>

        {data.map((item) => {
          if (item.after === null) return null;
          const afterY = getY(item.after);
          return (
            <line
              key={item.scheme}
              x1="50"
              y1={beforeY}
              x2="190"
              y2={afterY}
              style={{
                stroke: item.color,
                strokeWidth: 3,
                strokeLinecap: 'round',
                opacity: 0.85,
              }}
            />
          );
        })}

        {baselineVal !== null && (
          <g>
            <circle cx="50" cy={beforeY} r="5" style={{ fill: '#8fb0cf', stroke: 'rgba(4, 10, 18, 0.8)', strokeWidth: 2 }} />
            <text
              x="42"
              y={beforeY + 4}
              textAnchor="end"
              style={{ fill: 'var(--text)', fontSize: '0.68rem', fontWeight: 800 }}
            >
              {formatter(baselineVal)}
            </text>
          </g>
        )}

        {data.map((item) => {
          if (item.after === null) return null;
          const afterY = getY(item.after);
          return (
            <g key={item.scheme}>
              <circle cx="190" cy={afterY} r="5.5" style={{ fill: item.color, stroke: 'rgba(4, 10, 18, 0.8)', strokeWidth: 2 }} />
              <text
                x="198"
                y={afterY + 4}
                textAnchor="start"
                style={{ fill: 'var(--text)', fontSize: '0.68rem', fontWeight: 800 }}
              >
                {formatter(item.after)}
              </text>
            </g>
          );
        })}
      </svg>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '0.65rem', justifyContent: 'center' }}>
        {data.map((item) => (
          <div key={item.scheme} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--muted)' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: item.color, display: 'inline-block' }} />
            <span>{item.scheme}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
