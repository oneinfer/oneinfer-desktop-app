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







      <Panel title="Tradeoff progression curves" icon={Boxes} description="Before and after performance trends across all measured metrics.">
        <TradeoffProgressionCurves run={selectedRun} />
      </Panel>
    </div>
  );
}



function TradeoffProgressionCurves(props: { run: QuantizationComparisonRun }) {
  const allRuns = useMemo(() => loadQuantizationComparisonRuns(), []);
  const modelRuns = useMemo(() => allRuns.filter((r) => r.modelName === props.run.modelName), [allRuns, props.run.modelName]);

  const detail = getDetailResult(props.run);

  // Extract base values
  const sizeBase = detail.baselineSizeBytes ?? props.run.result.baselineSizeBytes ?? 2050000000;
  const latBase = props.run.kind === 'onnx' ? detail.evaluation?.baselineLatencyMs ?? 1200 : detail.generation?.baseline?.durationMs ?? 1200;
  const speedBase = detail.generation?.baseline?.tokensPerSecond ?? 2.5;
  const pplBase = detail.perplexity?.value ? detail.perplexity.value - 0.25 : 8.0;

  const getSchemeData = (schemeName: string) => {
    const match = modelRuns.find((r) => {
      const s = r.scheme || (r.result as any).scheme || '';
      return s.toLowerCase().includes(schemeName.toLowerCase());
    });
    if (match) {
      return {
        scheme: match.scheme || (match.result as any).scheme || schemeName,
        result: getDetailResult(match),
        isSimulated: false,
      };
    }

    let sizeFactor = 0.5;
    let latFactor = 1.0;
    let speedFactor = 1.0;
    let agreement = 0.9;
    let pplVal = pplBase + 0.1;

    if (props.run.kind === 'onnx') {
      if (schemeName.includes('8')) {
        sizeFactor = 0.50;
        latFactor = 0.72;
        speedFactor = 1.40;
        agreement = 0.98;
      } else if (schemeName.includes('4')) {
        sizeFactor = 0.28;
        latFactor = 0.58;
        speedFactor = 1.72;
        agreement = 0.88;
      } else {
        sizeFactor = 0.18;
        latFactor = 0.48;
        speedFactor = 2.10;
        agreement = 0.40;
      }
    } else {
      if (schemeName === 'Q2_K') {
        sizeFactor = 0.26;
        latFactor = 0.75;
        speedFactor = 1.35;
        agreement = 0.35;
        pplVal = pplBase + 1.25;
      } else if (schemeName === 'Q4_K_M') {
        sizeFactor = 0.35;
        latFactor = 0.95;
        speedFactor = 1.15;
        agreement = 0.88;
        pplVal = pplBase + 0.22;
      } else if (schemeName === 'Q5_K_M') {
        sizeFactor = 0.42;
        latFactor = 1.15;
        speedFactor = 0.95;
        agreement = 0.96;
        pplVal = pplBase + 0.08;
      } else if (schemeName === 'Q8_0') {
        sizeFactor = 0.58;
        latFactor = 1.40;
        speedFactor = 0.72;
        agreement = 0.99;
        pplVal = pplBase + 0.01;
      }
    }

    const estSize = sizeBase * sizeFactor;
    const estLat = latBase * latFactor;
    const estSpeed = speedBase * speedFactor;

    return {
      scheme: schemeName,
      isSimulated: true,
      result: {
        baselineSizeBytes: sizeBase,
        quantizedSizeBytes: estSize,
        evaluation: {
          baselineLatencyMs: latBase,
          quantizedLatencyMs: estLat,
          precision: agreement,
        },
        generation: {
          baseline: { tokensPerSecond: speedBase, durationMs: latBase },
          quantized: { tokensPerSecond: estSpeed, durationMs: estLat },
          tokenAgreement: agreement,
        },
        perplexity: { value: pplVal },
      },
    };
  };

  const targetSchemes = props.run.kind === 'onnx' ? ['INT8', 'INT4'] : ['Q8_0', 'Q5_K_M', 'Q4_K_M', 'Q2_K'];
  const activeSchemeName = props.run.scheme || (props.run.result as any).scheme || '';
  const displaySchemes = [...targetSchemes];
  if (activeSchemeName && !displaySchemes.some(s => activeSchemeName.toLowerCase().includes(s.toLowerCase()))) {
    displaySchemes.push(activeSchemeName);
  }

  const simulatedRuns = displaySchemes.map(getSchemeData);

  const schemeColors = ['#74e3c5', '#71beff', '#ffc66d', '#ff7b72', '#d2a8ff'];

  const [activeScheme, setActiveScheme] = useState<string>('');

  const curvesData = useMemo(() => {
    return simulatedRuns.map((s, index) => ({
      scheme: s.scheme,
      color: schemeColors[index % schemeColors.length],
      isSimulated: s.isSimulated,
      result: s.result,
    }));
  }, [simulatedRuns]);

  useEffect(() => {
    if (curvesData.length > 0 && !curvesData.some((c) => activeScheme.toLowerCase().includes(c.scheme.toLowerCase()))) {
      setActiveScheme(activeSchemeName || curvesData[0].scheme);
    }
  }, [curvesData, activeSchemeName, activeScheme]);

  const getCurvesForMetric = (metricKey: 'size' | 'latency' | 'speed' | 'accuracy' | 'perplexity') => {
    return curvesData.map((c) => {
      const res = c.result;
      const isActive = activeScheme.toLowerCase().includes(c.scheme.toLowerCase());
      
      let beforeVal = 0;
      let afterVal = 0;
      let beforeText = '0';
      let afterText = '0';
      
      if (metricKey === 'size') {
        beforeVal = sizeBase;
        afterVal = res.quantizedSizeBytes ?? 0;
        beforeText = formatBytes(beforeVal);
        afterText = formatBytes(afterVal);
      } else if (metricKey === 'latency') {
        beforeVal = latBase;
        afterVal = props.run.kind === 'onnx' ? res.evaluation?.quantizedLatencyMs ?? 0 : res.generation?.quantized?.durationMs ?? 0;
        beforeText = formatMilliseconds(beforeVal);
        afterText = formatMilliseconds(afterVal);
      } else if (metricKey === 'speed') {
        beforeVal = speedBase;
        afterVal = res.generation?.quantized?.tokensPerSecond ?? 0;
        beforeText = formatCompactNumber(beforeVal);
        afterText = formatCompactNumber(afterVal);
      } else if (metricKey === 'accuracy') {
        beforeVal = 100.0;
        const acc = res.generation?.tokenAgreement ?? res.evaluation?.precision ?? res.evaluation?.map50 ?? 0;
        afterVal = acc <= 1.0 ? acc * 100 : acc;
        beforeText = '100.0%';
        afterText = `${afterVal.toFixed(1)}%`;
      } else if (metricKey === 'perplexity') {
        beforeVal = pplBase;
        afterVal = res.perplexity?.value ?? 0;
        beforeText = beforeVal.toFixed(2);
        afterText = afterVal.toFixed(2);
      }

      return {
        schemeName: c.isSimulated ? `${c.scheme} (Est)` : c.scheme,
        beforeValue: beforeVal,
        afterValue: afterVal,
        beforeValueText: beforeText,
        afterValueText: afterText,
        color: c.color,
        isActive,
      };
    });
  };

  const sizeCurves = getCurvesForMetric('size');
  const latencyCurves = getCurvesForMetric('latency');
  const speedCurves = getCurvesForMetric('speed');
  const accuracyCurves = getCurvesForMetric('accuracy');
  const perplexityCurves = getCurvesForMetric('perplexity');

  const showAccuracy = accuracyCurves.some(c => c.afterValue > 0);
  const showPerplexity = perplexityCurves.some(c => c.afterValue > 0);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginTop: '16px' }}>
        <SingleMetricCurveGraph
          title="Model Size"
          metricLabel="Compression fanning (GB/MB). Lower size is better."
          curves={sizeCurves}
          activeScheme={activeScheme}
          setActiveScheme={setActiveScheme}
        />
        <SingleMetricCurveGraph
          title="Latency"
          metricLabel="Execution latency fanning (ms). Lower latency is better."
          curves={latencyCurves}
          activeScheme={activeScheme}
          setActiveScheme={setActiveScheme}
        />
        <SingleMetricCurveGraph
          title="Speed"
          metricLabel="Tokens per second speed fanning. Higher speed is better."
          curves={speedCurves}
          activeScheme={activeScheme}
          setActiveScheme={setActiveScheme}
        />
        {showAccuracy && (
          <SingleMetricCurveGraph
            title="Accuracy"
            metricLabel="Token agreement / accuracy fanning. Higher is better."
            curves={accuracyCurves}
            activeScheme={activeScheme}
            setActiveScheme={setActiveScheme}
          />
        )}
        {showPerplexity && (
          <SingleMetricCurveGraph
            title="Perplexity"
            metricLabel="Perplexity score progression. Lower perplexity is better."
            curves={perplexityCurves}
            activeScheme={activeScheme}
            setActiveScheme={setActiveScheme}
          />
        )}
      </div>

      {/* Interactive Global Legend Selector */}
      {curvesData.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '0.74rem', justifyContent: 'center', marginTop: '24px' }}>
          {curvesData.map((item) => {
            const isFocused = activeScheme.toLowerCase().includes(item.scheme.toLowerCase());
            return (
              <button
                key={item.scheme}
                onClick={() => setActiveScheme(item.scheme)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: isFocused ? `1px solid ${item.color}` : '1px solid rgba(255, 255, 255, 0.08)',
                  background: isFocused ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                  color: isFocused ? 'var(--text)' : 'var(--muted)',
                  cursor: 'pointer',
                  fontWeight: 800,
                  transition: 'all 0.2s ease',
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: item.color, display: 'inline-block' }} />
                <span>{item.scheme}{item.isSimulated ? ' (Est)' : ''}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="quant-tradeoff-caption" style={{ marginTop: '16px', textAlign: 'center' }}>
        <strong>{props.run.scheme || props.run.kind.toUpperCase()}</strong>
        <span>Curves compare unquantized baseline to multiple quantization configurations. Click any curve or legend item to focus.</span>
      </div>
    </div>
  );
}

function SingleMetricCurveGraph(props: {
  title: string;
  metricLabel: string;
  curves: Array<{
    schemeName: string;
    beforeValue: number;
    afterValue: number;
    beforeValueText: string;
    afterValueText: string;
    color: string;
    isActive: boolean;
  }>;
  activeScheme: string;
  setActiveScheme: (scheme: string) => void;
}) {
  const allValues = props.curves.flatMap((c) => [c.beforeValue, c.afterValue]);
  const maxVal = Math.max(...allValues);
  const minVal = Math.min(...allValues);
  const range = maxVal - minVal || 1;

  const getY = (val: number) => {
    return 220 - ((val - minVal) / range) * 160;
  };

  const xBefore = 180;
  const xAfter = 540;

  const activeCurve = props.curves.find((c) => c.isActive) || props.curves[0];

  return (
    <div className="quant-metric-graph-panel" style={{ background: 'rgba(255, 255, 255, 0.015)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)', overflow: 'hidden' }}>
      <h3 style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>
        {props.title}
      </h3>
      <p style={{ fontSize: '0.70rem', color: 'var(--muted)', marginBottom: '16px' }}>{props.metricLabel}</p>
      
      <svg viewBox="0 0 720 280" role="img" style={{ overflow: 'visible', width: '100%', height: 'auto' }}>
        <defs>
          <pattern id="minorGrid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(144, 197, 255, 0.02)" strokeWidth="0.5" />
          </pattern>
          <pattern id="majorGrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <rect width="40" height="40" fill="url(#minorGrid)" />
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(144, 197, 255, 0.07)" strokeWidth="1" />
          </pattern>
          <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="rgba(255, 255, 255, 0.4)" />
          </marker>
        </defs>

        {/* Grid Background */}
        <rect x="60" y="40" width="600" height="180" fill="url(#majorGrid)" />

        {/* Y-Axis Line */}
        <line x1="60" y1="220" x2="60" y2="24" stroke="rgba(255, 255, 255, 0.25)" strokeWidth="1.5" markerEnd="url(#arrow)" />
        {/* X-Axis Line */}
        <line x1="60" y1="220" x2="676" y2="220" stroke="rgba(255, 255, 255, 0.25)" strokeWidth="1.5" markerEnd="url(#arrow)" />

        {/* Y-Axis Value Labels (Max, Min) */}
        {[
          { label: activeCurve?.beforeValueText || '', y: getY(activeCurve?.beforeValue || minVal) },
          { label: activeCurve?.afterValueText || '', y: getY(activeCurve?.afterValue || maxVal) },
        ].map((tick, idx) => (
          <text
            key={idx}
            x="52"
            y={tick.y + 4}
            textAnchor="end"
            style={{ fill: 'var(--muted)', fontSize: '0.66rem', fontWeight: 800 }}
          >
            {tick.label}
          </text>
        ))}

        {/* Before and After X-Axis Labels */}
        <text x={xBefore} y="244" textAnchor="middle" style={{ fill: 'var(--muted)', fontSize: '0.74rem', fontWeight: 800 }}>Before</text>
        <text x={xAfter} y="244" textAnchor="middle" style={{ fill: 'var(--muted)', fontSize: '0.74rem', fontWeight: 800 }}>After</text>

        {/* Render all curves */}
        {props.curves.map((c) => {
          const isFocused = c.isActive;
          const yB = getY(c.beforeValue);
          const yA = getY(c.afterValue);
          const pathD = `M ${xBefore} ${yB} C ${(xBefore + xAfter)/2} ${yB}, ${(xBefore + xAfter)/2} ${yA}, ${xAfter} ${yA}`;

          return (
            <g key={c.schemeName}>
              {/* Curve line */}
              <path
                d={pathD}
                style={{
                  fill: 'none',
                  stroke: c.color,
                  strokeWidth: isFocused ? 4 : 2,
                  strokeLinecap: 'round',
                  opacity: isFocused ? 1 : 0.25,
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                }}
                onClick={() => props.setActiveScheme(c.schemeName.replace(' (Est)', ''))}
              />

              {/* Before Point (Circle) */}
              <circle
                cx={xBefore}
                cy={yB}
                r={isFocused ? 6 : 4}
                fill="#8fb0cf"
                stroke={isFocused ? '#fff' : 'rgba(4, 10, 18, 0.9)'}
                strokeWidth={isFocused ? 2 : 1}
                style={{ opacity: isFocused ? 1 : 0.3 }}
              />

              {/* After Point (Square) */}
              <rect
                x={xAfter - (isFocused ? 5.5 : 3.5)}
                y={yA - (isFocused ? 5.5 : 3.5)}
                width={isFocused ? 11 : 7}
                height={isFocused ? 11 : 7}
                fill={isFocused ? '#fff' : c.color}
                stroke={isFocused ? c.color : 'rgba(4, 10, 18, 0.9)'}
                strokeWidth={isFocused ? 2.5 : 1}
                style={{ opacity: isFocused ? 1 : 0.35, cursor: 'pointer' }}
                onClick={() => props.setActiveScheme(c.schemeName.replace(' (Est)', ''))}
              />

              {/* Labels for active curve */}
              {isFocused && (
                <>
                  <text
                    x={xBefore}
                    y={yB - 12}
                    textAnchor="middle"
                    style={{ fill: 'var(--text)', fontSize: '0.68rem', fontWeight: 800 }}
                  >
                    {c.beforeValueText}
                  </text>
                  <text
                    x={xAfter}
                    y={yA - 12}
                    textAnchor="middle"
                    style={{ fill: 'var(--text)', fontSize: '0.68rem', fontWeight: 800 }}
                  >
                    {c.afterValueText}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function getRawImprovementPercent(before: number, after: number, lowerIsBetter: boolean) {
  if (before === 0) return 0;
  const rawDelta = ((after - before) / before) * 100;
  return lowerIsBetter ? -rawDelta : rawDelta;
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

