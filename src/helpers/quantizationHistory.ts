export type QuantizationComparisonKind = 'onnx' | 'gguf';

export interface QuantizationComparisonRun {
  id: string;
  kind: QuantizationComparisonKind;
  createdAt: string;
  modelName: string;
  targetLabel: string;
  dataset?: string;
  scheme?: string;
  request?: {
    bits?: string;
    selection?: {
      id?: string;
      label?: string;
      kind?: string;
      opType?: string;
      count?: number;
    };
  };
  result: {
    runnerVersion?: number;
    artifactKind?: string;
    repoId?: string;
    graphFile?: string;
    outputPath?: string;
    reportPath?: string;
    baselineSizeBytes?: number | null;
    quantizedSizeBytes?: number | null;
    opTypesQuantized?: string[];
    nodesQuantized?: string[];
    evaluation?: {
      status?: string;
      baselineLatencyMs?: number | null;
      quantizedLatencyMs?: number | null;
      latencyDeltaPercent?: number | null;
      meanAbsDelta?: number | null;
      maxAbsDelta?: number | null;
      comparableOutputs?: number;
      outputCount?: number;
      dataset?: string;
      datasetStatus?: string;
      datasetError?: string;
      task?: string;
      map50?: number | null;
      map5095?: number | null;
      precision?: number | null;
      recall?: number | null;
      keypointMap50?: number | null;
      keypointMap5095?: number | null;
      imagesEvaluated?: number | null;
      error?: string;
    };
    generation?: {
      baseline?: { tokensPerSecond?: number | null; durationMs?: number | null };
      quantized?: { tokensPerSecond?: number | null; durationMs?: number | null };
      tokenAgreement?: number | null;
      latencyDeltaPercent?: number | null;
    };
    perplexity?: { value?: number | null } | null;
    runs?: QuantizationComparisonRun['result'][];
  };
}

const QUANTIZATION_HISTORY_KEY = 'oneinfer_quantization_compare_runs';
const MAX_QUANTIZATION_HISTORY = 12;

export function loadQuantizationComparisonRuns(): QuantizationComparisonRun[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(QUANTIZATION_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isQuantizationComparisonRun) : [];
  } catch {
    return [];
  }
}

export function saveQuantizationComparisonRun(run: QuantizationComparisonRun) {
  if (typeof window === 'undefined') {
    return;
  }

  const current = loadQuantizationComparisonRuns();
  const next = [
    run,
    ...current.filter((item) => item.id !== run.id),
  ].slice(0, MAX_QUANTIZATION_HISTORY);

  window.localStorage.setItem(QUANTIZATION_HISTORY_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('oneinfer:quantization-runs-changed'));
}

function isQuantizationComparisonRun(value: unknown): value is QuantizationComparisonRun {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<QuantizationComparisonRun>;
  return Boolean(candidate.id && candidate.createdAt && candidate.modelName && candidate.result);
}
