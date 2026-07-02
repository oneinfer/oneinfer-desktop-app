import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, WheelEvent } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Cpu,
  Download,
  FileJson,
  Gauge,
  Layers3,
  Maximize2,
  Info,
  Minus,
  Play,
  Plus,
  Rocket,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Trash2,
} from 'lucide-react';

import { Modal, Panel } from '../components/Common';
import { saveQuantizationComparisonRun } from '../helpers/quantizationHistory';
import type { DashboardState, ServingLibrary } from '../types';

type PlaygroundStep = 'configure' | 'evaluate' | 'analyze' | 'deploy';
type EvalStatus = 'idle' | 'running' | 'complete';
type ModelSource = 'huggingface' | 'catalog' | 'local';
type EvaluationModality = 'text' | 'image' | 'video' | 'audio' | 'multimodal' | 'unknown';

interface QuantizationProgress {
  id?: string;
  stage?: string;
  message?: string;
  detail?: string;
  level?: string;
  timestamp?: number;
}

interface QuantizationResult {
  jobId?: string;
  scheme?: string;
  quantizedPath?: string;
  reportPath?: string;
  recommendedScheme?: string;
  runs?: QuantizationResult[];
  timings?: Record<string, number>;
  unsupportedBenchmarks?: Array<{ name: string; reason: string }>;
  baselineSizeBytes?: number;
  quantizedSizeBytes?: number;
  compressionRatio?: number | null;
  perplexity?: { value?: number | null; raw?: string; error?: string } | null;
  generation?: {
    baseline?: { output?: string; tokensPerSecond?: number | null; durationMs?: number | null };
    quantized?: { output?: string; tokensPerSecond?: number | null; durationMs?: number | null };
    tokenAgreement?: number | null;
    latencyDeltaPercent?: number | null;
    status?: 'success' | 'failed';
    error?: string;
  } | null;
}

interface QuantizationTools {
  quantize: boolean;
  cli: boolean;
  perplexity: boolean;
  paths?: {
    quantize?: string | null;
    cli?: string | null;
    perplexity?: string | null;
  };
}

interface HuggingFaceInspection {
  repoId: string;
  requestedFilePath?: string;
  access?: 'public' | 'gated' | 'private' | 'unknown';
  gated?: boolean;
  accessError?: string;
  name: string;
  author?: string;
  pipelineTag?: string;
  libraryName?: string;
  license?: string;
  tags: string[];
  likes?: number | null;
  downloads?: number | null;
  formats: string[];
  availableSchemes: string[];
  baselineFile?: string;
  localQuantizationStatus: 'supported' | 'conversion-required' | 'unsupported';
  localQuantizationSupported: boolean;
  fileSummary: {
    total: number;
    gguf: number;
    safetensors: number;
    onnx: number;
    pytorch: number;
  };
  files: Array<{
    name: string;
    size?: number | null;
    format: string;
    role: string;
    quantization?: string | null;
  }>;
  graph?: HfModelGraph | null;
  warnings: string[];
}

interface HfModelGraph {
  status: 'ready' | 'error';
  error?: string;
  file?: string;
  name?: string;
  nodeCount?: number;
  opTypeCount?: number;
  opCounts?: Record<string, number>;
  inputs?: Array<{ name: string; dims: Array<string | number> }>;
  outputs?: Array<{ name: string; dims: Array<string | number> }>;
  nodes?: Array<{
    id: string;
    name: string;
    opType: string;
    inputs: string[];
    outputs: string[];
    attributeCount: number;
    repeat?: number;
  }>;
  blockGraph?: {
    blocks: Array<{
      id: string;
      label: string;
      description: string;
      opTypes: string[];
      count: number;
    }>;
  };
}

interface HfGraphSelection {
  id: string;
  label: string;
  kind: 'section' | 'layer' | 'block';
  opType: string;
  count: number;
  description?: string;
}

type SelectiveQuantizationBits = 'int8' | 'int4' | 'fp16';

interface SelectiveQuantizationRequest {
  bits: SelectiveQuantizationBits;
  selection: HfGraphSelection;
  repoId?: string;
  graphFile?: string;
  dataset?: string;
}

interface SelectiveOnnxQuantizationResult {
  runnerVersion?: number;
  artifactKind?: string;
  repoId?: string;
  graphFile?: string;
  outputPath?: string;
  reportPath?: string;
  baselineSizeBytes?: number;
  quantizedSizeBytes?: number;
  opTypesQuantized?: string[];
  nodesQuantized?: string[];
  evaluation?: {
    status?: 'success' | 'failed' | 'not-run';
    baselineLatencyMs?: number | null;
    quantizedLatencyMs?: number | null;
    latencyDeltaPercent?: number | null;
    meanAbsDelta?: number | null;
    maxAbsDelta?: number | null;
    comparableOutputs?: number;
    outputCount?: number;
    dataset?: string;
    datasetStatus?: 'success' | 'failed' | 'skipped';
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
}

interface SelectiveOnnxRun {
  request: SelectiveQuantizationRequest;
  result: SelectiveOnnxQuantizationResult;
}

const selectiveQuantizationBitOptions: Array<{
  value: SelectiveQuantizationBits;
  label: string;
  scheme: string;
  description: string;
}> = [
  {
    value: 'int8',
    label: 'INT8',
    scheme: 'INT8',
    description: 'Balanced accuracy and size for most Conv-heavy regions.',
  },
  {
    value: 'int4',
    label: 'INT4',
    scheme: 'INT4 AWQ',
    description: 'Smaller output with higher calibration risk.',
  },
  {
    value: 'fp16',
    label: 'FP16',
    scheme: 'FP16 baseline',
    description: 'Keep this region high precision while rebuilding the model.',
  },
];

interface QuantizationForm {
  modelSource: ModelSource;
  model: string;
  hfRepo: string;
  localPath: string;
  targetDevice: string;
  dataset: string;
  scheme: string;
  calibrationSamples: number;
  maxPerplexityDelta: number;
  minTokenAgreement: number;
  minTokensPerSecond: number;
  benchmarks: {
    tokenAccuracy: boolean;
    perplexity: boolean;
    mmlu: boolean;
    hellaswag: boolean;
    truthfulqa: boolean;
    arcChallenge: boolean;
    winogrande: boolean;
    gsm8k: boolean;
    humaneval: boolean;
    rouge: boolean;
    bertScore: boolean;
    exactMatch: boolean;
    map50: boolean;
    map5095: boolean;
    precisionRecall: boolean;
    keypointMap: boolean;
    miou: boolean;
    top1Accuracy: boolean;
    wer: boolean;
    cer: boolean;
    audioSnr: boolean;
    clipScore: boolean;
    frameMap: boolean;
    temporalConsistency: boolean;
    latencyMemory: boolean;
    ttft: boolean;
    peakMemory: boolean;
  };
}

type BenchmarkKey = keyof QuantizationForm['benchmarks'];

interface EvaluationProfile {
  id: EvaluationModality;
  label: string;
  description: string;
  datasetOptions: string[];
  defaultDataset: string;
  benchmarks: QuantizationForm['benchmarks'];
  groups: Array<{
    title: string;
    items: Array<[BenchmarkKey, string]>;
  }>;
}

const defaultTextDatasetOptions = [
  'wikitext2',
  'c4 small',
  'pile validation',
  'ptb',
  'openwebtext sample',
  'chat prompts',
  'coding prompts',
  'reasoning prompts',
  'summarization prompts',
  'custom eval set',
];

const defaultBenchmarkState: QuantizationForm['benchmarks'] = {
  tokenAccuracy: false,
  perplexity: false,
  mmlu: false,
  hellaswag: false,
  truthfulqa: false,
  arcChallenge: false,
  winogrande: false,
  gsm8k: false,
  humaneval: false,
  rouge: false,
  bertScore: false,
  exactMatch: false,
  map50: false,
  map5095: false,
  precisionRecall: false,
  keypointMap: false,
  miou: false,
  top1Accuracy: false,
  wer: false,
  cer: false,
  audioSnr: false,
  clipScore: false,
  frameMap: false,
  temporalConsistency: false,
  latencyMemory: false,
  ttft: false,
  peakMemory: false,
};

const textBenchmarks: QuantizationForm['benchmarks'] = {
  ...defaultBenchmarkState,
  tokenAccuracy: true,
  perplexity: true,
  rouge: true,
  latencyMemory: true,
  ttft: true,
  peakMemory: true,
};

const imageBenchmarks: QuantizationForm['benchmarks'] = {
  ...defaultBenchmarkState,
  map50: true,
  map5095: true,
  precisionRecall: true,
  keypointMap: true,
  miou: true,
  top1Accuracy: true,
  latencyMemory: true,
  peakMemory: true,
};

const videoBenchmarks: QuantizationForm['benchmarks'] = {
  ...defaultBenchmarkState,
  map50: true,
  map5095: true,
  frameMap: true,
  temporalConsistency: true,
  latencyMemory: true,
  peakMemory: true,
};

const audioBenchmarks: QuantizationForm['benchmarks'] = {
  ...defaultBenchmarkState,
  wer: true,
  cer: true,
  audioSnr: true,
  latencyMemory: true,
  peakMemory: true,
};

const multimodalBenchmarks: QuantizationForm['benchmarks'] = {
  ...defaultBenchmarkState,
  clipScore: true,
  exactMatch: true,
  rouge: true,
  latencyMemory: true,
  peakMemory: true,
};

const textBenchmarkGroups: EvaluationProfile['groups'] = [
  {
    title: 'Core quality',
    items: [
      ['tokenAccuracy', 'Token accuracy'],
      ['perplexity', 'Perplexity'],
    ],
  },
  {
    title: 'Task benchmarks',
    items: [
      ['mmlu', 'MMLU'],
      ['hellaswag', 'HellaSwag'],
      ['truthfulqa', 'TruthfulQA'],
      ['arcChallenge', 'ARC-Challenge'],
      ['winogrande', 'WinoGrande'],
      ['gsm8k', 'GSM8K'],
      ['humaneval', 'HumanEval'],
    ],
  },
  {
    title: 'Generation quality',
    items: [
      ['rouge', 'ROUGE-style prompt similarity'],
      ['bertScore', 'BERTScore'],
      ['exactMatch', 'Exact match'],
    ],
  },
  {
    title: 'Edge performance',
    items: [
      ['latencyMemory', 'Tokens/sec'],
      ['ttft', 'TTFT'],
      ['peakMemory', 'Peak memory'],
    ],
  },
];

const imageBenchmarkGroups: EvaluationProfile['groups'] = [
  {
    title: 'Core quality',
    items: [
      ['map50', 'mAP@50'],
      ['map5095', 'mAP@50-95'],
      ['precisionRecall', 'Precision / recall'],
    ],
  },
  {
    title: 'Vision task metrics',
    items: [
      ['keypointMap', 'Keypoint mAP / OKS'],
      ['miou', 'Mask mIoU'],
      ['top1Accuracy', 'Top-1 accuracy'],
    ],
  },
  {
    title: 'Edge performance',
    items: [
      ['latencyMemory', 'Images/sec'],
      ['peakMemory', 'Peak memory'],
    ],
  },
];

const videoBenchmarkGroups: EvaluationProfile['groups'] = [
  {
    title: 'Core quality',
    items: [
      ['map50', 'mAP@50'],
      ['map5095', 'mAP@50-95'],
      ['frameMap', 'Frame-level mAP'],
      ['temporalConsistency', 'Temporal consistency'],
    ],
  },
  {
    title: 'Edge performance',
    items: [
      ['latencyMemory', 'Frames/sec'],
      ['peakMemory', 'Peak memory'],
    ],
  },
];

const audioBenchmarkGroups: EvaluationProfile['groups'] = [
  {
    title: 'Core quality',
    items: [
      ['wer', 'Word error rate'],
      ['cer', 'Character error rate'],
      ['audioSnr', 'Signal/noise delta'],
    ],
  },
  {
    title: 'Edge performance',
    items: [
      ['latencyMemory', 'Audio/sec'],
      ['peakMemory', 'Peak memory'],
    ],
  },
];

const multimodalBenchmarkGroups: EvaluationProfile['groups'] = [
  {
    title: 'Core quality',
    items: [
      ['clipScore', 'CLIPScore'],
      ['exactMatch', 'Exact match'],
      ['rouge', 'Text similarity'],
    ],
  },
  {
    title: 'Edge performance',
    items: [
      ['latencyMemory', 'Samples/sec'],
      ['peakMemory', 'Peak memory'],
    ],
  },
];

const evaluationProfiles: Record<EvaluationModality, EvaluationProfile> = {
  text: {
    id: 'text',
    label: 'Text / language model',
    description: 'Text datasets and language-model metrics are available for GGUF/llama.cpp evaluation.',
    datasetOptions: defaultTextDatasetOptions,
    defaultDataset: 'wikitext2',
    benchmarks: textBenchmarks,
    groups: textBenchmarkGroups,
  },
  image: {
    id: 'image',
    label: 'Image / vision model',
    description: 'Use image datasets with labels or annotations for real accuracy. COCO val2017 full downloads the official validation images before reporting dataset metrics.',
    datasetOptions: ['ONNX smoke test only', 'COCO val2017 full', 'COCO keypoints val2017 full', 'ImageNet validation', 'VOC validation', 'custom image dataset'],
    defaultDataset: 'ONNX smoke test only',
    benchmarks: imageBenchmarks,
    groups: imageBenchmarkGroups,
  },
  video: {
    id: 'video',
    label: 'Video model',
    description: 'Use video/frame datasets for real video quality. Current local ONNX path only smoke-tests model execution.',
    datasetOptions: ['Kinetics validation', 'ActivityNet validation', 'COCO frame sample', 'custom video dataset'],
    defaultDataset: 'Kinetics validation',
    benchmarks: videoBenchmarks,
    groups: videoBenchmarkGroups,
  },
  audio: {
    id: 'audio',
    label: 'Audio / speech model',
    description: 'Use labeled audio clips for quality metrics such as WER/CER. Current local ONNX path only smoke-tests model execution.',
    datasetOptions: ['LibriSpeech test-clean', 'Common Voice validation', 'AudioSet eval', 'custom audio dataset'],
    defaultDataset: 'LibriSpeech test-clean',
    benchmarks: audioBenchmarks,
    groups: audioBenchmarkGroups,
  },
  multimodal: {
    id: 'multimodal',
    label: 'Multimodal model',
    description: 'Use paired image/text, audio/text, or video/text datasets that match the model inputs.',
    datasetOptions: ['COCO captions validation', 'VQAv2 validation', 'Flickr30k validation', 'custom multimodal dataset'],
    defaultDataset: 'COCO captions validation',
    benchmarks: multimodalBenchmarks,
    groups: multimodalBenchmarkGroups,
  },
  unknown: {
    id: 'unknown',
    label: 'Unknown model type',
    description: 'Model type is not clear yet. Choose a dataset that matches the model inputs once inspection completes.',
    datasetOptions: ['custom eval set'],
    defaultDataset: 'custom eval set',
    benchmarks: { ...defaultBenchmarkState, latencyMemory: true, peakMemory: true },
    groups: [
      {
        title: 'Edge performance',
        items: [
          ['latencyMemory', 'Samples/sec'],
          ['peakMemory', 'Peak memory'],
        ],
      },
    ],
  },
};
const schemeOptions = [
  'Q2_K',
  'Q3_K_S',
  'Q3_K_M',
  'Q3_K_L',
  'Q4_0',
  'Q4_1',
  'Q4_K_S',
  'Q4_K_M',
  'Q5_0',
  'Q5_1',
  'Q5_K_S',
  'Q5_K_M',
  'Q6_K',
  'Q8_0',
  'INT4 AWQ',
  'INT4 GPTQ',
  'INT8',
  'FP16 baseline',
  'Compare all',
];

const defaultForm: QuantizationForm = {
  modelSource: 'huggingface',
  model: '',
  hfRepo: 'meta-llama/Llama-3.2-3B',
  localPath: '',
  targetDevice: 'local',
  dataset: 'wikitext2',
  scheme: 'Q4_K_M',
  calibrationSamples: 512,
  maxPerplexityDelta: 3,
  minTokenAgreement: 94,
  minTokensPerSecond: 30,
  benchmarks: textBenchmarks,
};

const baseRunStages = [
  { key: 'quantize', title: 'Quantize model', detail: 'Create selected quantized artifact or batch of schemes' },
  { key: 'calibration', title: 'Load calibration data', detail: 'Prepare built-in or custom evaluation text' },
  { key: 'tokenAccuracy', title: 'Token agreement evaluation', detail: 'Compare generated tokens against baseline output' },
  { key: 'perplexity', title: 'Perplexity evaluation', detail: 'Run held-out corpus perplexity when llama-perplexity is available' },
  { key: 'latencyMemory', title: 'Latency and memory benchmark', detail: 'Measure prompt latency, tokens/sec, size, and compression' },
];

const onnxRunStages = [
  { key: 'preparing', title: 'Prepare ONNX graph', detail: 'Resolve the selected Hugging Face ONNX artifact and graph region' },
  { key: 'quantize', title: 'Quantize ONNX model', detail: 'Rebuild the full ONNX model with the requested graph region quantized' },
  { key: 'benchmark', title: 'Run full model', detail: 'Run baseline and rebuilt ONNX models end-to-end with ONNX Runtime' },
  { key: 'complete', title: 'Collect results', detail: 'Compare latency, size, and output deltas for the rebuilt model' },
];

const headlineMetrics = [
  { label: 'Token agreement', value: '94.7%', delta: '+0.7 above threshold', tone: 'sea' },
  { label: 'Perplexity', value: '8.24', delta: '+0.31 vs FP16', tone: 'gold' },
  { label: 'Model size', value: '1.2 GB', delta: '43% smaller', tone: 'sky' },
  { label: 'Tokens/sec', value: '38.2', delta: '+12% vs FP16', tone: 'sea' },
];

const tokenMetrics = [
  ['Top-1 token match', '94.7%'],
  ['Top-3 agreement', '98.1%'],
  ['Top-5 agreement', '99.0%'],
  ['First divergence', 'token 37'],
  ['Avg logprob drift', '0.08'],
];

const benchmarkRows = [
  { name: 'MMLU 5-shot', baseline: '62.2%', quantized: '61.8%', delta: '-0.4%' },
  { name: 'HellaSwag', baseline: '79.1%', quantized: '78.7%', delta: '-0.4%' },
  { name: 'TruthfulQA', baseline: '46.4%', quantized: '46.1%', delta: '-0.3%' },
  { name: 'ROUGE-L prompts', baseline: '0.426', quantized: '0.419', delta: '-0.007' },
];

const layerRows = [
  { label: 'layers 0-3', value: 'Delta PPL +0.02, low sensitivity', width: '42%', tone: 'low' },
  { label: 'layers 4-8', value: 'Delta PPL +0.04', width: '50%', tone: 'low' },
  { label: 'layers 9-16', value: 'Delta PPL +0.12, moderate', width: '68%', tone: 'mid' },
  { label: 'layers 17-22', value: 'Delta PPL +0.28, high sensitivity', width: '88%', tone: 'high' },
  { label: 'lm_head', value: 'FP16 preserved', width: '58%', tone: 'kept' },
];

const paretoPoints = [
  { label: 'Q8_0', size: '1.8 GB', quality: '99.1%', speed: '32.4 tok/s' },
  { label: 'Q5_K_M', size: '1.4 GB', quality: '97.8%', speed: '35.1 tok/s' },
  { label: 'Q4_K_M', size: '1.2 GB', quality: '94.7%', speed: '38.2 tok/s' },
  { label: 'Q4_K_S', size: '1.0 GB', quality: '91.6%', speed: '41.8 tok/s' },
];

export function QuantizationPage(props: {
  dashboard: DashboardState;
  libraries?: Partial<Record<ServingLibrary, boolean>>;
  busy?: string | null;
  onCreateCloudMachine?: () => void;
  onInstallLibrary?: (library: ServingLibrary) => Promise<void>;
  onNavigateToCompare?: () => void;
}) {
  const [form, setForm] = useState(defaultForm);
  const [step, setStep] = useState<PlaygroundStep>('configure');
  const [status, setStatus] = useState<EvalStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [prompt, setPrompt] = useState('Explain gradient descent in one paragraph.');
  const [progressEvents, setProgressEvents] = useState<QuantizationProgress[]>([]);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [evalResult, setEvalResult] = useState<QuantizationResult | null>(null);
  const [selectiveOnnxRun, setSelectiveOnnxRun] = useState<SelectiveOnnxRun | null>(null);
  const [runMode, setRunMode] = useState<'gguf' | 'onnx'>('gguf');
  const [tools, setTools] = useState<QuantizationTools | null>(null);
  const [cacheClearStatus, setCacheClearStatus] = useState<string | null>(null);
  const [cacheClearing, setCacheClearing] = useState(false);
  const [hfInspection, setHfInspection] = useState<HuggingFaceInspection | null>(null);
  const [hfInspectionStatus, setHfInspectionStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [hfInspectionError, setHfInspectionError] = useState<string | null>(null);
  const [hfGraphGranularity, setHfGraphGranularity] = useState<'block' | 'node'>('block');
  const appliedEvaluationProfile = useRef<EvaluationModality>('text');

  const runStages = useMemo(() => runMode === 'onnx' ? onnxRunStages : getRunStages(form), [form, runMode]);
  const runStepIndex = status === 'complete' ? runStages.length : Math.min(runStages.length - 1, Math.floor(progress / Math.max(1, 100 / runStages.length)));
  const machineLabel = useMemo(() => {
    const machine = props.dashboard.machineDetails;
    const os = machine?.osName || machine?.platform || 'Local machine';
    const memory = machine?.memory?.totalGb ? `${Math.round(machine.memory.totalGb)} GB RAM` : 'hardware profile pending';
    return `${os} - ${memory}`;
  }, [props.dashboard.machineDetails]);
  const targetOptions = useMemo(() => {
    const cloudTargets = props.dashboard.instances
      .filter((instance) => {
        const status = String(instance.instance_status ?? instance.status ?? '').toLowerCase();
        return status !== 'deleted' && status !== 'terminated';
      })
      .map((instance) => {
        const id = String(instance.unique_instance_id ?? instance.instance_id ?? instance.id ?? instance.instance_name ?? '').trim();
        const fallbackName = id || 'Cloud machine';
        const name = String(instance.instance_name ?? instance.gpu_name ?? fallbackName).trim();
        const gpu = String(instance.gpu_name ?? '').trim();
        const provider = String(instance.provider_name ?? '').trim();
        return {
          value: `cloud:${id || name}`,
          label: gpu ? `${name} - ${gpu}` : name,
          meta: [provider, instance.region].filter(Boolean).join(' - ') || 'OneInfer cloud machine',
        };
      });

    return [
      { value: 'local', label: 'Local machine', meta: machineLabel },
      ...(cloudTargets.length > 0 ? cloudTargets : [{ value: 'cloud', label: 'Cloud machine', meta: 'Select or create a OneInfer cloud instance', requiresInstance: true }]),
    ];
  }, [machineLabel, props.dashboard.instances]);

  const selectedTarget = targetOptions.find((target) => target.value === form.targetDevice) ?? targetOptions[0];
  const targetNeedsInstance = Boolean(selectedTarget.requiresInstance);
  const catalogModels = useMemo(() => getCatalogModelOptions(props.dashboard.models), [props.dashboard.models]);
  const selectedModelName = getSelectedModelName(form);
  const evaluationProfile = useMemo(
    () => getEvaluationProfile(form, hfInspection),
    [form.modelSource, form.model, form.hfRepo, form.localPath, hfInspection],
  );
  const hfHasGgufArtifact = Boolean(hfInspection && (hfInspection.fileSummary.gguf > 0 || hfInspection.formats.includes('GGUF')));
  const hfIsOnnxWithoutGguf = Boolean(hfInspection && !hfHasGgufArtifact && (hfInspection.fileSummary.onnx > 0 || hfInspection.formats.includes('ONNX')));
  const hfAccessBlocked = form.modelSource === 'huggingface'
    && (Boolean(hfInspection?.gated) || (hfInspectionStatus === 'error' && isHuggingFaceAccessError(hfInspectionError)));
  const hfLocalGgufBlockReason = hfIsOnnxWithoutGguf
    ? 'This Hugging Face repo contains ONNX graph artifacts, not GGUF language-model artifacts. Use Run full eval for whole-model ONNX evaluation, or select a graph block for selective quantization.'
    : hfInspection?.warnings[0] || 'This Hugging Face repo is not supported by the local GGUF quantization runner.';
  const hfUnsupportedForLocal = form.modelSource === 'huggingface'
    && selectedTarget.value === 'local'
    && Boolean(hfInspection)
    && (hfInspection?.localQuantizationStatus === 'unsupported' || hfIsOnnxWithoutGguf);
  const canRunGgufEval = selectedTarget.value === 'local'
    && !hfAccessBlocked
    && !hfUnsupportedForLocal
    && (form.modelSource === 'huggingface' ? !hfIsOnnxWithoutGguf : true)
    && (form.modelSource === 'local' ? /\.gguf$/i.test(form.localPath) : true)
    && selectedModelName.trim().length > 0;
  const canRunOnnxEval = selectedTarget.value === 'local'
    && !hfAccessBlocked
    && form.modelSource === 'huggingface'
    && hfIsOnnxWithoutGguf
    && Boolean(hfInspection?.fileSummary.onnx || hfInspection?.formats.includes('ONNX'))
    && selectedModelName.trim().length > 0;
  const canRunEval = canRunGgufEval || canRunOnnxEval;
  const quickEvalLabel = canRunOnnxEval ? 'Run full eval' : 'Run quick eval';
  const needsLocalGguf = form.modelSource === 'catalog' && selectedTarget.value === 'local';
  const localQuantizationTarget = selectedTarget.value === 'local';
  const quantizeInstalled = Boolean(tools?.quantize);
  const installingLlamaCpp = props.busy === 'install-llama_cpp';
  const analyzedMetrics = useMemo(() => getAnalyzedMetrics(evalResult), [evalResult]);
  const analyzedTokenMetrics = useMemo(() => getAnalyzedTokenMetrics(evalResult), [evalResult]);
  const primaryRun = useMemo(() => evalResult ? getPrimaryRun(evalResult) : null, [evalResult]);
  const analysisFailed = Boolean(primaryRun && hasQuantizationRunFailed(primaryRun));
  const analysisFailureMessage = getQuantizationRunFailureMessage(primaryRun);
  const analysisMissingMetrics = getMissingQuantizationMetrics(primaryRun, form);
  const analysisIncomplete = Boolean(!analysisFailed && primaryRun && analysisMissingMetrics.length > 0);
  const recommendationState = analysisFailed ? 'failed' : analysisIncomplete ? 'incomplete' : 'ready';
  const recommendationMessage = analysisFailed
    ? analysisFailureMessage
    : analysisIncomplete
      ? `Need ${analysisMissingMetrics.join(', ')} before this profile is deployment-ready.`
      : 'Passes token agreement, speed, and size thresholds with measured quality signals.';
  const baselineDiffText = getDiffOutputText(primaryRun?.generation?.baseline?.output, primaryRun, 'baseline');
  const quantizedDiffText = getDiffOutputText(primaryRun?.generation?.quantized?.output, primaryRun, 'quantized');

  useEffect(() => {
    if (!window.desktopBridge?.onQuantizationProgress) {
      return undefined;
    }

    return window.desktopBridge.onQuantizationProgress((event) => {
      setProgressEvents((current) => [...current, event].slice(-12));
      setProgress(getProgressForStage(event.stage));
    });
  }, []);

  useEffect(() => {
    if (!window.desktopBridge?.getQuantizationTools) {
      return;
    }

    window.desktopBridge.getQuantizationTools()
      .then(setTools)
      .catch(() => setTools(null));
  }, [props.busy]);

  useEffect(() => {
    if (appliedEvaluationProfile.current === evaluationProfile.id) {
      return;
    }

    appliedEvaluationProfile.current = evaluationProfile.id;
    setForm((current) => ({
      ...current,
      dataset: evaluationProfile.datasetOptions.includes(current.dataset) ? current.dataset : evaluationProfile.defaultDataset,
      benchmarks: evaluationProfile.benchmarks,
    }));
  }, [evaluationProfile]);

  useEffect(() => {
    if (step === 'evaluate' && status === 'complete' && (evalResult || selectiveOnnxRun)) {
      setStep('analyze');
    }
  }, [evalResult, selectiveOnnxRun, status, step]);

  useEffect(() => {
    if (form.modelSource !== 'huggingface') {
      setHfInspection(null);
      setHfInspectionStatus('idle');
      setHfInspectionError(null);
      return undefined;
    }

    const repo = form.hfRepo.trim();
    if (!repo || repo.split('/').filter(Boolean).length < 2) {
      setHfInspection(null);
      setHfInspectionStatus('idle');
      setHfInspectionError(null);
      return undefined;
    }

    if (!window.desktopBridge?.inspectHfModel) {
      setHfInspection(null);
      setHfInspectionStatus('error');
      setHfInspectionError('Hugging Face inspection is not available in this app build. Restart Electron after updating the app.');
      return undefined;
    }

    let cancelled = false;
    setHfInspectionStatus('loading');
    setHfInspectionError(null);

    const timeoutId = window.setTimeout(() => {
      window.desktopBridge.inspectHfModel({ repo })
        .then((inspection) => {
          if (cancelled) {
            return;
          }
          setHfInspection(inspection as HuggingFaceInspection);
          setHfInspectionStatus('ready');
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }
          setHfInspection(null);
          setHfInspectionStatus('error');
          setHfInspectionError(formatHuggingFaceInspectionError(error, repo));
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [form.hfRepo, form.modelSource]);

  function updateForm(next: Partial<QuantizationForm>) {
    setForm((current) => ({ ...current, ...next }));
  }

  async function runEvaluation(selectiveQuantization?: SelectiveQuantizationRequest) {
    const canRunRequestedEval = selectiveQuantization
      ? !targetNeedsInstance && selectedModelName.trim().length > 0
      : canRunGgufEval;
    if (!canRunRequestedEval) {
      if (!selectiveQuantization && hfAccessBlocked) {
        setEvalError(hfInspectionError);
      }
      if (!selectiveQuantization && hfUnsupportedForLocal) {
        setEvalError(hfLocalGgufBlockReason);
      }
      return;
    }

    setStep('evaluate');
    setRunMode('gguf');
    setStatus('running');
    setProgress(5);
    setEvalError(null);
    setEvalResult(null);
    setSelectiveOnnxRun(null);
    setProgressEvents([]);

    if (!window.desktopBridge?.runQuantizationEval) {
      setStatus('idle');
      setEvalError('Quantization evaluation is not available in this app build. Restart Electron after updating the app.');
      return;
    }

    try {
      const selectedBitOption = selectiveQuantization
        ? selectiveQuantizationBitOptions.find((option) => option.value === selectiveQuantization.bits)
        : null;
      const result = await window.desktopBridge.runQuantizationEval({
        jobId: `quant-${Date.now()}`,
        target: selectedTarget.value,
        modelSource: form.modelSource,
        modelId: form.model,
        hfRepo: form.hfRepo,
        localPath: form.localPath,
        format: getInferredModelFormat(form),
        scheme: selectedBitOption?.scheme || form.scheme,
        dataset: form.dataset,
        calibrationSamples: form.calibrationSamples,
        benchmarks: form.benchmarks,
        prompt,
        selectiveQuantization,
      }) as QuantizationResult;
      setEvalResult(result);
      saveQuantizationComparisonRun({
        id: result.jobId || `gguf-${Date.now()}`,
        kind: 'gguf',
        createdAt: new Date().toISOString(),
        modelName: selectedModelName || form.hfRepo || form.model || 'Selected model',
        targetLabel: selectedTarget.label,
        dataset: form.dataset,
        scheme: selectedBitOption?.scheme || form.scheme,
        result,
      });
      setStatus('complete');
      setProgress(100);
      setStep('analyze');
    } catch (error) {
      setStatus('idle');
      setEvalError(formatQuantizationEvaluationError(error, form.hfRepo));
    }
  }

  async function runQuickEvaluation() {
    if (hfAccessBlocked) {
      setEvalError(hfInspectionError);
      return;
    }

    if (canRunOnnxEval && hfInspection) {
      await runSelectiveOnnxQuantization({
        bits: 'int8',
        repoId: form.hfRepo,
        graphFile: hfInspection.graph?.file,
        dataset: form.dataset,
        selection: createFullOnnxGraphSelection(hfInspection),
      }).catch(() => undefined);
      return;
    }

    await runEvaluation();
  }

  async function runSelectiveOnnxQuantization(request: SelectiveQuantizationRequest) {
    if (hfAccessBlocked) {
      const message = hfInspectionError || formatGatedHuggingFaceMessage(request.repoId || form.hfRepo);
      setEvalError(message);
      throw new Error(message);
    }

    if (!window.desktopBridge?.runSelectiveOnnxQuantization) {
      throw new Error('Selective ONNX quantization is not available in this app build. Restart Electron after updating the app.');
    }

    setRunMode('onnx');
    setStep('evaluate');
    setStatus('running');
    setProgress(5);
    setEvalError(null);
    setEvalResult(null);
    setSelectiveOnnxRun(null);
    setProgressEvents([]);

    try {
      const result = await window.desktopBridge.runSelectiveOnnxQuantization({
        jobId: `onnx-selective-${Date.now()}`,
        repoId: request.repoId || form.hfRepo,
        graphFile: request.graphFile,
        bits: request.bits,
        dataset: form.dataset,
        selection: request.selection,
      }) as SelectiveOnnxQuantizationResult;
      setSelectiveOnnxRun({ request, result });
      saveQuantizationComparisonRun({
        id: `onnx-${Date.now()}`,
        kind: 'onnx',
        createdAt: new Date().toISOString(),
        modelName: selectedModelName || request.repoId || form.hfRepo || 'Selected ONNX model',
        targetLabel: selectedTarget.label,
        dataset: result.evaluation?.dataset || request.dataset || form.dataset,
        scheme: request.bits.toUpperCase(),
        request,
        result,
      });
      setStatus('complete');
      setProgress(100);
      setStep('analyze');
    } catch (error) {
      setStatus('idle');
      setEvalError(formatSelectiveOnnxQuantizationError(error));
      throw new Error(formatSelectiveOnnxQuantizationError(error));
    }
  }

  async function clearDownloadedModels() {
    if (!window.desktopBridge?.clearQuantizationCache) {
      setCacheClearStatus('Cache cleanup is not available in this app build. Restart Electron after updating the app.');
      return;
    }

    const confirmed = window.confirm('Delete downloaded Hugging Face models, converted GGUF files, quantized artifacts, and quantization reports? The next eval will download models again.');
    if (!confirmed) {
      return;
    }

    setCacheClearing(true);
    setCacheClearStatus(null);
    try {
      const result = await window.desktopBridge.clearQuantizationCache({ includeRuns: true });
      setEvalResult(null);
      setProgressEvents([]);
      setProgress(0);
      setStatus('idle');
      setStep('configure');
      setCacheClearStatus(result.message);
    } catch (error) {
      setCacheClearStatus(error instanceof Error ? error.message : 'Failed to delete downloaded models.');
    } finally {
      setCacheClearing(false);
    }
  }

  function completeEvaluation() {
    setStatus('complete');
    setProgress(100);
    setStep('analyze');
  }

  return (
    <div className="quant-page card-stack">
      <div className="quant-header">
        <div>
          <span className="eyebrow">oneinfer-edge</span>
          <h2>Quantization Playground</h2>
          <p>Measure quality loss, token agreement, size, speed, and deployment readiness before shipping a model to edge hardware.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => runQuickEvaluation()} disabled={!canRunEval || status === 'running'}>
          <Play size={16} />
          {quickEvalLabel}
        </button>
      </div>

      <div className="quant-steps">
        {[
          ['configure', 'Configure'],
          ['evaluate', 'Evaluate'],
          ['analyze', 'Analyze'],
          ['deploy', 'Deploy'],
        ].map(([key, label], index) => (
          <button
            key={key}
            className={`quant-step ${step === key ? 'active' : ''} ${isStepComplete(step, key as PlaygroundStep) ? 'done' : ''}`}
            type="button"
            onClick={() => setStep(key as PlaygroundStep)}
          >
            <span>{isStepComplete(step, key as PlaygroundStep) ? <CheckCircle2 size={15} /> : index + 1}</span>
            {label}
          </button>
        ))}
      </div>

      {step === 'configure' ? (
        <>
          {hfIsOnnxWithoutGguf ? (
            <div className="banner info" style={{ marginBottom: '18px', gap: '10px', padding: '12px 16px', borderRadius: '12px' }}>
              <Info size={16} style={{ flexShrink: 0, color: '#71beff' }} />
              <span>
                <strong>ONNX model detected:</strong> Click <em>Run full eval</em> to quantize supported ONNX ops across the full graph and run the rebuilt model end-to-end, or select a specific block below for selective quantization.
              </span>
            </div>
          ) : null}
          <div className="section-grid two-col">
            <Panel title="Model" icon={Sparkles} description="Choose a baseline model and the edge target you want to optimize for.">
              <div className="stack-form">
                <div className="quant-source-tabs">
                  {[
                    ['huggingface', 'Hugging Face'],
                    ['catalog', 'OneInfer catalog'],
                    ['local', 'Local file'],
                  ].map(([source, label]) => (
                    <button
                      className={`quant-source-tab ${form.modelSource === source ? 'active' : ''}`}
                      key={source}
                      type="button"
                      onClick={() => updateForm({
                        modelSource: source as ModelSource,
                      })}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {form.modelSource === 'huggingface' ? (
                  <>
                    <label>
                      <span>Hugging Face repo</span>
                      <input
                        placeholder="owner/model-name"
                        value={form.hfRepo}
                        onChange={(event) => updateForm({ hfRepo: event.target.value })}
                      />
                    </label>
                    <HuggingFacePreview
                      error={hfInspectionError}
                      graphGranularity={hfGraphGranularity}
                      inspection={hfInspection}
                      onGraphGranularityChange={setHfGraphGranularity}
                      onSelectiveQuantization={runSelectiveOnnxQuantization}
                      status={hfInspectionStatus}
                    />
                  </>
                ) : null}

                {form.modelSource === 'catalog' ? (
                  <label>
                    <span>Catalog model</span>
                    <select value={form.model} onChange={(event) => updateForm({ model: event.target.value })}>
                      <option value="">Select a catalog model...</option>
                      {catalogModels.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                ) : null}

                {form.modelSource === 'local' ? (
                  <label>
                    <span>Local model path</span>
                    <input
                      placeholder="/path/to/model.gguf"
                      value={form.localPath}
                      onChange={(event) => updateForm({ localPath: event.target.value })}
                    />
                  </label>
                ) : null}

                <label>
                  <span>Target machine</span>
                  <select value={form.targetDevice} onChange={(event) => updateForm({ targetDevice: event.target.value })}>
                    {targetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <div className="quant-machine">
                  <Cpu size={16} />
                  <span>{selectedTarget.label}: {selectedTarget.meta}</span>
                </div>
                {targetNeedsInstance ? (
                  <div className="quant-target-warning">
                    <span>Cloud evaluation needs an active OneInfer cloud machine before it can run.</span>
                    {props.onCreateCloudMachine ? (
                      <button className="secondary-button" type="button" onClick={props.onCreateCloudMachine}>
                        Open GPU list
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {needsLocalGguf ? (
                  <div className="quant-target-warning">
                    <span>Local Hugging Face quantization works when the repo contains a GGUF artifact. Transformers/safetensors repos still need conversion to GGUF before local quantization can run.</span>
                  </div>
                ) : null}
                {localQuantizationTarget && !quantizeInstalled ? (
                  <div className="quant-install-card">
                    <div>
                      <strong>llama.cpp tools required</strong>
                      <span>Install llama.cpp to enable local GGUF quantization with llama-quantize. Perplexity and prompt checks use llama-perplexity and llama-completion when available.</span>
                    </div>
                    {props.onInstallLibrary ? (
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={installingLlamaCpp}
                        onClick={() => props.onInstallLibrary?.('llama_cpp')}
                      >
                        {installingLlamaCpp ? 'Installing...' : 'Install llama.cpp'}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {localQuantizationTarget && quantizeInstalled ? (
                  <div className="quant-tool-status">
                    <span>llama-quantize ready</span>
                    <span>{tools?.cli ? 'llama-completion ready' : 'llama-completion missing'}</span>
                    <span>{tools?.perplexity ? 'llama-perplexity ready' : 'llama-perplexity missing'}</span>
                  </div>
                ) : null}
                <div className="quant-cache-actions">
                  <button className="secondary-button" type="button" onClick={clearDownloadedModels} disabled={cacheClearing || status === 'running'}>
                    <Trash2 size={15} />
                    {cacheClearing ? 'Deleting...' : 'Delete downloaded models'}
                  </button>
                  <span>Clears Hugging Face cache, converted GGUF files, quantized artifacts, and run reports.</span>
                </div>
                {cacheClearStatus ? <div className="quant-cache-message">{cacheClearStatus}</div> : null}
              </div>
            </Panel>

            <Panel title="Evaluation" icon={Gauge} description="Keep calibration and evaluation data separate so results stay honest.">
              <div className="stack-form">
                <div className="banner info" style={{ gap: '10px', padding: '12px 14px', borderRadius: '12px' }}>
                  <Info size={16} style={{ flexShrink: 0, color: '#71beff' }} />
                  <span>
                    <strong>{evaluationProfile.label}:</strong> {evaluationProfile.description}
                  </span>
                </div>
                <label>
                  <span>Evaluation dataset</span>
                  <select value={form.dataset} onChange={(event) => updateForm({ dataset: event.target.value })}>
                    {evaluationProfile.datasetOptions.map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
                <div className="quant-toggle-list">
                  {evaluationProfile.groups.map((group) => (
                    <div className="quant-check-group" key={group.title}>
                      <strong>{group.title}</strong>
                      <div>
                        {group.items.map(([key, label]) => (
                          <label className="quant-check" key={key}>
                            <input
                              type="checkbox"
                              checked={form.benchmarks[key]}
                              onChange={(event) => updateForm({
                                benchmarks: {
                                  ...form.benchmarks,
                                  [key]: event.target.checked,
                                },
                              })}
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </div>

          <Panel title="Quantization scheme" icon={SlidersHorizontal} description="Start with a preset, then open advanced controls for layer-level tuning.">
            <div className="quant-scheme-grid">
              {schemeOptions.map((scheme) => (
                <button className={`quant-choice ${form.scheme === scheme ? 'active' : ''}`} key={scheme} type="button" onClick={() => updateForm({ scheme })}>
                  {scheme}
                </button>
              ))}
            </div>
            <button className="quant-advanced-toggle" type="button" onClick={() => setAdvancedOpen((current) => !current)}>
              <SlidersHorizontal size={15} />
              Advanced per-layer controls
            </button>
            {advancedOpen ? (
              <div className="quant-advanced-grid">
                <label>
                  <span>Calibration samples</span>
                  <input type="number" value={form.calibrationSamples} onChange={(event) => updateForm({ calibrationSamples: Number(event.target.value) })} />
                </label>
                <label>
                  <span>Max perplexity increase (%)</span>
                  <input type="number" value={form.maxPerplexityDelta} onChange={(event) => updateForm({ maxPerplexityDelta: Number(event.target.value) })} />
                </label>
                <label>
                  <span>Minimum token agreement (%)</span>
                  <input type="number" value={form.minTokenAgreement} onChange={(event) => updateForm({ minTokenAgreement: Number(event.target.value) })} />
                </label>
                <label>
                  <span>Minimum tokens/sec</span>
                  <input type="number" value={form.minTokensPerSecond} onChange={(event) => updateForm({ minTokensPerSecond: Number(event.target.value) })} />
                </label>
              </div>
            ) : null}
          </Panel>
        </>
      ) : null}

      {step === 'evaluate' ? (
        <Panel
          title={runMode === 'onnx' ? `${selectedModelName || 'Selected model'} - selective ONNX ${selectiveOnnxRun?.request.bits.toUpperCase() || 'INT8'}` : `${selectedModelName || 'Selected model'} - ${form.scheme}`}
          icon={Gauge}
          description={runMode === 'onnx' ? `Full rebuilt ONNX evaluation on ${selectedTarget.label}` : `${form.dataset} eval on ${selectedTarget.label}`}
        >
          <div className="quant-run-status">
            <span className={`status-pill ${status === 'complete' ? 'active' : ''}`}>{evalError ? 'Failed' : status === 'complete' ? 'Complete' : 'Running'}</span>
            <div className="quant-progress-track">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
          {evalError ? <div className="banner error">{evalError}</div> : null}
          <div className="quant-run-list">
            {runStages.map((stage, index) => (
              <div className={`quant-run-item ${index < runStepIndex || status === 'complete' ? 'done' : index === runStepIndex ? 'active' : ''}`} key={stage.title}>
                <span className="quant-run-dot">{index < runStepIndex || status === 'complete' ? <CheckCircle2 size={16} /> : index + 1}</span>
                <div>
                  <strong>{stage.title}</strong>
                  <p>{stage.detail}</p>
                </div>
              </div>
            ))}
          </div>
          {progressEvents.length > 0 ? (
            <div className="quant-progress-log">
              {progressEvents.map((event, index) => (
                <div className={`quant-progress-line ${event.level || ''}`} key={`${event.timestamp || index}-${index}`}>
                  <strong>{event.stage || 'job'}</strong>
                  <span>{event.message || event.detail || 'Working...'}</span>
                  {event.detail ? <code>{event.detail}</code> : null}
                </div>
              ))}
            </div>
          ) : null}
          {status === 'complete' && (evalResult || selectiveOnnxRun) ? (
            <div className="quant-result-ready">
              <strong>Results are ready.</strong>
              <span>Opening the analysis view with measured size, quality, and speed values.</span>
            </div>
          ) : null}
          <div className="action-row" style={{ marginTop: '18px' }}>
            <button className="secondary-button" type="button" onClick={() => setStep('configure')}>Back</button>
            <button className="primary-button" type="button" onClick={completeEvaluation} disabled={!evalResult && !selectiveOnnxRun}>
              <BarChart3 size={16} />
              View results
            </button>
          </div>
        </Panel>
      ) : null}

      {step === 'analyze' ? (
        selectiveOnnxRun ? (
          <SelectiveOnnxAnalyze
            modelName={selectedModelName || 'Selected ONNX model'}
            run={selectiveOnnxRun}
            targetLabel={selectedTarget.label}
            onNavigateToDeploy={() => setStep('deploy')}
            onNavigateToCompare={props.onNavigateToCompare}
          />
        ) : (
        <>
          <div className={`quant-recommendation glass-panel ${recommendationState}`}>
            <div>
              <span className="eyebrow">{analysisFailed ? 'Evaluation failed' : analysisIncomplete ? 'Evaluation incomplete' : 'Recommendation'}</span>
              <h3>{analysisFailed ? 'Fix the evaluation before deploy' : analysisIncomplete ? 'Measure missing metrics before deploy' : `Use ${form.scheme} for ${selectedTarget.label}`}</h3>
              <p>{recommendationMessage}</p>
            </div>
            <button className="primary-button" type="button" onClick={() => setStep('deploy')} disabled={analysisFailed || analysisIncomplete}>
              <Rocket size={16} />
              Prepare deploy
            </button>
          </div>

          <div className="quant-metrics-grid">
            {analyzedMetrics.map((metric) => (
              <div className={`metric-card ${metric.tone}`} key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.delta}</small>
              </div>
            ))}
          </div>

          <Panel title="Output diff" icon={Layers3} description="Compare baseline and quantized responses on prompts that matter to your workload.">
            <div className="quant-prompt-row">
              <input value={prompt} onChange={(event) => setPrompt(event.target.value)} />
              <button className="secondary-button" type="button" onClick={() => runEvaluation()} disabled={!canRunEval || status === 'running'}>Run</button>
            </div>
            <div className="quant-diff-grid">
              <DiffCard title="Baseline" tag="reference" text={baselineDiffText} />
              <DiffCard title={`${form.scheme} quantized`} tag={formatBytes(primaryRun?.quantizedSizeBytes) || 'pending'} text={quantizedDiffText} compareText={baselineDiffText} />
            </div>
          </Panel>

          <div className="section-grid two-col">
            <Panel title="Token accuracy" icon={Gauge}>
              <div className="data-list">
                {analyzedTokenMetrics.map(([label, value, title]) => (
                  <div className="data-row" key={label}>
                    <span>{label}</span>
                    <strong className={title ? 'path-value' : undefined} title={title || value}>{value}</strong>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Benchmarks" icon={BarChart3}>
              <div className="quant-table">
                {getBenchmarkRows(evalResult).map((row) => (
                  <div className="quant-table-row" key={row.name}>
                    <strong>{row.name}</strong>
                    <span>{row.baseline}</span>
                    <span>{row.quantized}</span>
                    <span>{row.delta}</span>
                  </div>
                ))}
              </div>
              {evalResult?.unsupportedBenchmarks?.length ? (
                <div className="quant-unsupported-list">
                  {evalResult.unsupportedBenchmarks.map((item) => (
                    <div key={item.name}>
                      <strong>{item.name}</strong>
                      <span>{item.reason}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </Panel>
          </div>

          <div className="section-grid two-col">
            <Panel title="Layer sensitivity heatmap" icon={Layers3}>
              <div className="quant-heatmap">
                {layerRows.map((row) => (
                  <div className="quant-layer-row" key={row.label}>
                    <span>{row.label}</span>
                    <div className={`quant-layer-bar ${row.tone}`}>
                      <strong style={{ width: row.width }}>{row.value}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Pareto frontier" icon={BarChart3}>
              <div className="quant-pareto">
                {getParetoPoints(evalResult, form.scheme).map((point) => (
                  <div className={`quant-pareto-point ${point.label === (evalResult?.recommendedScheme || form.scheme) ? 'active' : ''}`} key={point.label}>
                    <strong>{point.label}</strong>
                    <span>{point.quality}</span>
                    <small>{point.size} - {point.speed}</small>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </>
        )
      ) : null}

      {step === 'deploy' ? (
        <Panel title="Deploy quantized model" icon={Rocket} description="Export the artifact, config, and command needed to run this profile with oneinfer-edge.">
          <div className="quant-deploy-grid">
            <div className="quant-command">
              <Terminal size={16} />
              <code>
                {runMode === 'onnx'
                  ? `oneinfer-edge deploy ${slugifyModelName(selectedModelName)}-selective-onnx-${selectiveOnnxRun?.request.bits.toLowerCase() || 'int8'} --target "${selectedTarget.value}"`
                  : `oneinfer-edge deploy ${slugifyModelName(selectedModelName)}-${form.scheme.toLowerCase()} --target "${selectedTarget.value}"`
                }
              </code>
            </div>
            <div className="quant-export-actions">
              <button className="secondary-button" type="button">
                <Download size={16} />
                Export artifact
              </button>
              <button className="secondary-button" type="button">
                <FileJson size={16} />
                Export JSON report
              </button>
              <button className="primary-button" type="button">
                <Rocket size={16} />
                Save deployment profile
              </button>
            </div>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function SelectiveOnnxAnalyze(props: {
  modelName: string;
  run: SelectiveOnnxRun;
  targetLabel: string;
  onNavigateToDeploy: () => void;
  onNavigateToCompare?: () => void;
}) {
  const { request, result } = props.run;
  const evaluation = result.evaluation;
  const latencyDelta = evaluation?.latencyDeltaPercent ?? null;
  const requestedDataset = evaluation?.dataset || request.dataset || '';
  const datasetRequested = Boolean(requestedDataset && /coco/i.test(requestedDataset));
  const datasetReady = !datasetRequested || evaluation?.datasetStatus === 'success';
  const sizeReduction = getSizeReductionPercent(result.baselineSizeBytes, result.quantizedSizeBytes);
  const quantizedScope = result.nodesQuantized?.length
    ? `${result.nodesQuantized.length} ONNX node${result.nodesQuantized.length === 1 ? '' : 's'}`
    : result.opTypesQuantized?.length
      ? `${result.opTypesQuantized.join(', ')} op${result.opTypesQuantized.length === 1 ? '' : 's'}`
      : request.selection.label;
  const selectedQuantizedScope = `${request.selection.label} (${quantizedScope})`;
  const evaluationReady = result.runnerVersion === 2 && evaluation?.status === 'success' && datasetReady;
  const evaluationMessage = result.runnerVersion !== 2
    ? 'This artifact was created by an older Electron handler. Restart Electron and run the selection again to get full-model evaluation.'
    : evaluation?.status === 'failed'
      ? `Artifact created, but full-model evaluation failed: ${evaluation.error || 'unknown error'}`
      : datasetRequested && evaluation?.datasetStatus === 'failed'
        ? `Artifact created, but COCO validation failed: ${evaluation.datasetError || 'unknown error'}`
        : datasetRequested && evaluation?.datasetStatus !== 'success'
          ? `${requestedDataset} was selected, but dataset validation did not run. Restart Electron so the updated backend can return real COCO metrics.`
        : datasetRequested && evaluation?.datasetStatus === 'success'
          ? `The rebuilt ONNX model ran end-to-end and was evaluated on ${requestedDataset}.`
      : evaluationReady
        ? 'The rebuilt ONNX model ran end-to-end and was compared with the baseline model.'
        : 'Artifact created, but full-model evaluation did not report metrics.';

  const qualityMetrics = getOnnxQualityMetrics(evaluation);
  const metrics = datasetRequested && qualityMetrics.length === 0 ? [
    {
      label: 'Full model size',
      value: formatBytes(result.quantizedSizeBytes) || 'Not measured',
      delta: sizeReduction === null ? 'baseline unavailable' : `${sizeReduction.toFixed(1)}% smaller`,
      tone: 'sky',
    },
    {
      label: 'Latency',
      value: formatMilliseconds(evaluation?.quantizedLatencyMs),
      delta: latencyDelta === null || latencyDelta === undefined ? 'not measured' : `${formatSignedPercent(latencyDelta)} vs baseline`,
      tone: latencyDelta !== null && latencyDelta !== undefined && latencyDelta <= 0 ? 'sea' : 'gold',
    },
    {
      label: 'COCO status',
      value: evaluation?.datasetStatus || 'Not run',
      delta: requestedDataset,
      tone: evaluation?.datasetStatus === 'failed' ? 'rose' : 'gold',
    },
    {
      label: 'Images evaluated',
      value: formatOptionalInteger(evaluation?.imagesEvaluated),
      delta: 'real dataset metric pending',
      tone: 'gold',
    },
  ] : qualityMetrics.length > 0 ? [
    {
      label: 'Full model size',
      value: formatBytes(result.quantizedSizeBytes) || 'Not measured',
      delta: sizeReduction === null ? 'baseline unavailable' : `${sizeReduction.toFixed(1)}% smaller`,
      tone: 'sky',
    },
    {
      label: 'Latency',
      value: formatMilliseconds(evaluation?.quantizedLatencyMs),
      delta: latencyDelta === null || latencyDelta === undefined ? 'not measured' : `${formatSignedPercent(latencyDelta)} vs baseline`,
      tone: latencyDelta !== null && latencyDelta !== undefined && latencyDelta <= 0 ? 'sea' : 'gold',
    },
    ...qualityMetrics,
  ] : [
    {
      label: 'Full model size',
      value: formatBytes(result.quantizedSizeBytes) || 'Not measured',
      delta: sizeReduction === null ? 'baseline unavailable' : `${sizeReduction.toFixed(1)}% smaller`,
      tone: 'sky',
    },
    {
      label: 'Latency',
      value: formatMilliseconds(evaluation?.quantizedLatencyMs),
      delta: latencyDelta === null || latencyDelta === undefined ? 'not measured' : `${formatSignedPercent(latencyDelta)} vs baseline`,
      tone: latencyDelta !== null && latencyDelta !== undefined && latencyDelta <= 0 ? 'sea' : 'gold',
    },
    {
      label: 'Output mean delta',
      value: formatCompactNumber(evaluation?.meanAbsDelta),
      delta: `${evaluation?.comparableOutputs || 0} comparable output${evaluation?.comparableOutputs === 1 ? '' : 's'}`,
      tone: 'gold',
    },
    {
      label: 'Output max delta',
      value: formatCompactNumber(evaluation?.maxAbsDelta),
      delta: 'baseline vs rebuilt ONNX',
      tone: 'rose',
    },
  ];

  return (
    <>
      <div className={`quant-recommendation glass-panel ${evaluationReady ? 'ready' : 'incomplete'}`}>
        <div>
          <span className="eyebrow">Full ONNX model result</span>
          <h3>{request.bits.toUpperCase()} full model with {request.selection.label} quantized</h3>
          <p>{evaluationMessage}</p>
        </div>
        <div className="quant-recommendation-actions">
          {props.onNavigateToCompare ? (
            <button className="secondary-button" type="button" onClick={props.onNavigateToCompare}>
              <BarChart3 size={16} />
              Compare
            </button>
          ) : null}
          <button className="primary-button" type="button" onClick={props.onNavigateToDeploy} disabled={!evaluationReady}>
            <Rocket size={16} />
            Prepare deploy
          </button>
        </div>
      </div>

      <div className="quant-metrics-grid">
        {metrics.map((metric) => (
          <div className={`metric-card ${metric.tone}`} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.delta}</small>
          </div>
        ))}
      </div>

      <div className="section-grid two-col">
        <Panel title="Full model run" icon={Gauge} description={`ONNX Runtime evaluation on ${props.targetLabel}`}>
          <div className="data-list">
            <div className="data-row">
              <span>Baseline latency</span>
              <strong>{formatMilliseconds(evaluation?.baselineLatencyMs)}</strong>
            </div>
            <div className="data-row">
              <span>Quantized latency</span>
              <strong>{formatMilliseconds(evaluation?.quantizedLatencyMs)}</strong>
            </div>
            <div className="data-row">
              <span>Latency delta</span>
              <strong>{formatSignedPercent(evaluation?.latencyDeltaPercent) || 'Not measured'}</strong>
            </div>
            <div className="data-row">
              <span>Outputs compared</span>
              <strong>{evaluation?.comparableOutputs ?? 0} / {evaluation?.outputCount ?? 0}</strong>
            </div>
            {datasetRequested ? (
              <>
                <div className="data-row">
                  <span>Evaluation dataset</span>
                  <strong>{requestedDataset || 'COCO'}</strong>
                </div>
                <div className="data-row">
                  <span>Dataset status</span>
                  <strong>{evaluation?.datasetStatus || 'not run'}</strong>
                </div>
                <div className="data-row">
                  <span>Images evaluated</span>
                  <strong>{formatOptionalInteger(evaluation?.imagesEvaluated)}</strong>
                </div>
                {evaluation?.datasetError ? (
                  <div className="data-row">
                    <span>Dataset error</span>
                    <strong title={evaluation.datasetError}>{truncateMiddle(evaluation.datasetError, 52)}</strong>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </Panel>

        <Panel title="Full rebuilt model artifact" icon={FileJson} description={`${props.modelName} rebuilt as a complete ONNX model with the selected region quantized`}>
          <div className="data-list">
            <div className="data-row">
              <span>Full model</span>
              <strong>{props.modelName}</strong>
            </div>
            <div className="data-row">
              <span>Quantized selected part</span>
              <strong>{request.selection.label}</strong>
            </div>
            <div className="data-row">
              <span>Quantized operators in part</span>
              <strong>{selectedQuantizedScope}</strong>
            </div>
            <div className="data-row">
              <span>Baseline full model size</span>
              <strong>{formatBytes(result.baselineSizeBytes) || 'Not measured'}</strong>
            </div>
            <div className="data-row">
              <span>Rebuilt full model size</span>
              <strong>{formatBytes(result.quantizedSizeBytes) || 'Not measured'}</strong>
            </div>
            <div className="data-row">
              <span>Full model artifact path</span>
              <strong className="path-value" title={result.outputPath || ''}>{result.outputPath || 'Not created'}</strong>
            </div>
            <div className="data-row">
              <span>Report path</span>
              <strong className="path-value" title={result.reportPath || ''}>{result.reportPath || 'Not created'}</strong>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}

function DiffCard(props: { title: string; tag: string; text: string; compareText?: string }) {
  const words = tokenizeDisplayText(props.text);
  const compareWords = tokenizeDisplayText(props.compareText || '');
  return (
    <div className="quant-diff-card">
      <div className="quant-diff-title">
        <strong>{props.title}</strong>
        <span>{props.tag}</span>
      </div>
      <p>
        {words.map((word, index) => {
          const shouldHighlight = Boolean(props.compareText) && normalizeDiffToken(word) !== normalizeDiffToken(compareWords[index] || '');
          return (
            <span className={shouldHighlight ? 'diff-token' : ''} key={`${word}-${index}`}>
              {word}{' '}
            </span>
          );
        })}
      </p>
    </div>
  );
}

function HuggingFacePreview(props: {
  inspection: HuggingFaceInspection | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  graphGranularity: 'block' | 'node';
  onGraphGranularityChange: (value: 'block' | 'node') => void;
  onSelectiveQuantization: (request: SelectiveQuantizationRequest) => Promise<void>;
}) {
  const [graphExpanded, setGraphExpanded] = useState(false);

  useEffect(() => {
    setGraphExpanded(false);
  }, [props.inspection?.repoId, props.status]);

  if (props.status === 'loading') {
    return (
      <div className="quant-hf-status-row">
        <span className="quant-hf-status-dot loading" />
        <span>Checking Hugging Face repo...</span>
      </div>
    );
  }

  if (props.status === 'error') {
    return (
      <div className="quant-hf-status-row warning">
        <AlertTriangle size={15} />
        <span>{props.error || 'Could not inspect Hugging Face repo.'}</span>
      </div>
    );
  }

  const inspection = props.inspection;
  if (!inspection) {
    return null;
  }

  const graph = getHfViewerGraph(inspection);
  const accessWarning = inspection.gated
    ? formatGatedHuggingFaceMessage(inspection.repoId)
    : inspection.accessError || '';

  return (
    <>
      {accessWarning ? (
        <div className="quant-hf-status-row warning">
          <AlertTriangle size={15} />
          <span>{accessWarning}</span>
        </div>
      ) : null}
      <HfInteractiveGraph
        graph={graph}
        granularity={props.graphGranularity}
        onGranularityChange={props.onGraphGranularityChange}
        onSelectiveQuantization={async (request) => {
          setGraphExpanded(false);
          await props.onSelectiveQuantization(request);
        }}
        onViewGraph={() => {
          props.onGraphGranularityChange('node');
          setGraphExpanded(true);
        }}
        repoId={inspection.repoId}
      />
      <Modal title={`${inspection.repoId} Graph`} isOpen={graphExpanded} onClose={() => setGraphExpanded(false)}>
        <div className="quant-hf-graph-modal">
          {graphExpanded ? (
            <HfInteractiveGraph
              graph={graph}
              granularity={props.graphGranularity}
              onGranularityChange={props.onGraphGranularityChange}
              onSelectiveQuantization={async (request) => {
                setGraphExpanded(false);
                await props.onSelectiveQuantization(request);
              }}
              repoId={inspection.repoId}
              size="large"
            />
          ) : null}
        </div>
      </Modal>
    </>
  );
}

function getHfViewerGraph(inspection: HuggingFaceInspection) {
  if (isYoloHfModel(inspection)) {
    return buildHfOnnxArchitectureGraph(inspection, inspection.graph?.status === 'error' ? inspection.graph.error : undefined);
  }

  if (inspection.graph?.status === 'ready') {
    return inspection.graph;
  }

  if (inspection.formats.includes('ONNX')) {
    return buildHfOnnxArchitectureGraph(inspection, inspection.graph?.error);
  }

  const isGguf = inspection.files.some((file) => file.format === 'GGUF') || /gguf/i.test(inspection.repoId);
  if (isGguf) {
    return buildHfGgufArchitectureGraph(inspection, inspection.graph?.error);
  }

  return buildHfArtifactGraph(inspection, inspection.graph?.error);
}

function buildHfOnnxArchitectureGraph(inspection: HuggingFaceInspection, graphError?: string): HfModelGraph {
  if (!isYoloHfModel(inspection)) {
    return buildGenericOnnxArchitectureGraph(inspection, graphError);
  }

  const layerPlan: Array<[string, string, string, number?]> = [
    ['input', 'input', 'image tensor'],
    ['resize/rescale', 'Resize', 'preprocess'],
    ['YOLOv8 CSP backbone', 'Group', 'backbone'],
    ['Conv', 'Conv', 'backbone'],
    ['Conv', 'Conv', 'backbone'],
    ['C2f', 'C2f', 'backbone'],
    ['Conv', 'Conv', 'backbone'],
    ['C2f', 'C2f', 'backbone', 2],
    ['Conv', 'Conv', 'backbone'],
    ['C2f', 'C2f', 'backbone', 2],
    ['Conv', 'Conv', 'backbone'],
    ['C2f', 'C2f', 'backbone'],
    ['SPPF', 'SPPF', 'backbone'],
    ['YOLOv8 PAN-FPN neck', 'Group', 'neck'],
    ['Upsample', 'Resize', 'neck'],
    ['Concat', 'Concat', 'neck'],
    ['C2f', 'C2f', 'neck'],
    ['Upsample', 'Resize', 'neck'],
    ['Concat', 'Concat', 'neck'],
    ['C2f', 'C2f', 'neck'],
    ['Conv', 'Conv', 'neck'],
    ['Concat', 'Concat', 'neck'],
    ['C2f', 'C2f', 'neck'],
    ['Conv', 'Conv', 'neck'],
    ['Concat', 'Concat', 'neck'],
    ['C2f', 'C2f', 'neck'],
    ['YOLOv8 pose detection head', 'Group', 'head'],
    ['P3 box Conv', 'Conv', 'head'],
    ['P3 pose Conv', 'Conv', 'head'],
    ['P4 box Conv', 'Conv', 'head'],
    ['P4 pose Conv', 'Conv', 'head'],
    ['P5 box Conv', 'Conv', 'head'],
    ['P5 pose Conv', 'Conv', 'head'],
    ['P3 logits', 'Logits', 'head'],
    ['P4 logits', 'Logits', 'head'],
    ['P5 logits', 'Logits', 'head'],
    ['8400 candidates', 'Candidates', 'head'],
    ['DFL', 'DFL', 'head'],
    ['person score', 'Score', 'head'],
    ['17 keypoints', 'Keypoints', 'head'],
    ['56 x 8400', 'Tensor', 'head'],
    ['NMS', 'NonMaxSuppression', 'head'],
    ['person poses', 'output', 'head'],
  ];
  const nodes = layerPlan.map(([name, opType, section, repeat], index) => ({
    id: `${section}-${index}`,
    name,
    opType,
    inputs: index === 0 ? [] : [`layer_${index - 1}`],
    outputs: [`layer_${index}`],
    attributeCount: section === 'input' || section === 'output' ? 0 : 1,
    repeat,
  }));
  const opCounts = nodes.reduce<Record<string, number>>((accumulator, node) => {
    accumulator[node.opType] = (accumulator[node.opType] || 0) + 1;
    return accumulator;
  }, {});

  return {
    status: 'ready',
    file: inspection.files.find((file) => file.format === 'ONNX')?.name || 'onnx/model.onnx',
    name: graphError ? 'YOLO architecture view' : inspection.name,
    nodeCount: nodes.length,
    opTypeCount: Object.keys(opCounts).length,
    opCounts,
    inputs: [{ name: 'input', dims: [1, 3, 640, 640] }],
    outputs: [{ name: 'person poses', dims: ['boxes', 'keypoints', 'scores'] }],
    nodes,
    blockGraph: {
      blocks: [
        { id: 'input', label: 'image', description: 'RGB image input', opTypes: ['input'], count: 1 },
        { id: 'preprocess', label: 'resize / rescale', description: 'Input normalization', opTypes: ['Resize'], count: 1 },
        { id: 'backbone', label: 'YOLOv8 CSP backbone', description: 'Feature extraction', opTypes: ['Conv', 'C2f', 'SPPF'], count: 11 },
        { id: 'neck', label: 'YOLOv8 PAN-FPN neck', description: 'Feature fusion', opTypes: ['Resize', 'Concat', 'C2f', 'Conv'], count: 12 },
        { id: 'head', label: 'YOLOv8 pose detection head', description: 'Pose prediction, keypoints, and NMS', opTypes: ['Conv', 'Logits', 'DFL', 'NonMaxSuppression'], count: 15 },
      ],
    },
    error: graphError,
  };
}

function buildHfGgufArchitectureGraph(inspection: HuggingFaceInspection, graphError?: string): HfModelGraph {
  const repoLower = inspection.repoId.toLowerCase();
  const nameLower = inspection.name.toLowerCase();
  const searchStr = `${repoLower} ${nameLower}`.toLowerCase();

  // 1. Detect architecture family
  let arch = 'Llama';
  let decoderLayerName = 'LlamaDecoderLayer';
  let attentionName = 'LlamaAttention';
  let mlpName = 'LlamaMLP';
  let vocabSize = 128256;

  if (searchStr.includes('qwen')) {
    arch = 'Qwen';
    decoderLayerName = 'Qwen2DecoderLayer';
    attentionName = 'Qwen2Attention';
    mlpName = 'Qwen2MLP';
    vocabSize = 151936;
  } else if (searchStr.includes('mistral') || searchStr.includes('mixtral')) {
    arch = 'Mistral';
    decoderLayerName = 'MistralDecoderLayer';
    attentionName = 'MistralAttention';
    mlpName = 'MistralMLP';
    vocabSize = 32000;
  } else if (searchStr.includes('gemma')) {
    arch = 'Gemma';
    decoderLayerName = 'GemmaDecoderLayer';
    attentionName = 'GemmaAttention';
    mlpName = 'GemmaMLP';
    vocabSize = 256000;
  } else if (searchStr.includes('phi')) {
    arch = 'Phi';
    decoderLayerName = 'Phi3DecoderLayer';
    attentionName = 'Phi3Attention';
    mlpName = 'Phi3MLP';
    vocabSize = 32064;
  }

  // 2. Estimate layer/block count based on model parameter size in name
  let blockCount = 32; // Default fallback (e.g. Llama 7B/8B has 32 layers)
  if (searchStr.includes('0.5b') || searchStr.includes('500m')) {
    blockCount = 24; // e.g. Qwen2.5-0.5B
  } else if (searchStr.includes('1.5b') || searchStr.includes('1b') || searchStr.includes('2b')) {
    blockCount = 28; // e.g. Qwen2.5-1.5B or Gemma-2B
  } else if (searchStr.includes('3b')) {
    blockCount = 32; // e.g. Qwen2.5-3B or Llama3.2-3B
  } else if (searchStr.includes('7b') || searchStr.includes('8b') || searchStr.includes('9b')) {
    blockCount = 32; // e.g. Llama-8B
  } else if (searchStr.includes('14b') || searchStr.includes('13b')) {
    blockCount = 40; // e.g. Qwen-14B
  } else if (searchStr.includes('70b') || searchStr.includes('72b')) {
    blockCount = 80; // e.g. Llama-70B or Qwen-72B
  }

  const layerPlan: Array<[string, string, string, number?]> = [
    ['input', 'input', 'input'],
    ['Text embeddings', 'Embedding', 'embeddings'],
    [decoderLayerName, 'Group', 'backbone', blockCount],
    ['Input RMSNorm', 'RMSNorm', 'attention'],
    ['Linear Q/K/V projections', 'Linear', 'attention', 3],
    [attentionName, 'Attention', 'attention'],
    ['Linear O projection', 'Linear', 'attention'],
    ['Add residual', 'Add', 'attention'],
    ['Post Attention RMSNorm', 'RMSNorm', 'mlp'],
    [mlpName, 'MLP', 'mlp'],
    ['Linear gate/up projections', 'Linear', 'mlp', 2],
    ['Activation (SiLU)', 'Activation', 'mlp'],
    ['Mul gate', 'Mul', 'mlp'],
    ['Linear down projection', 'Linear', 'mlp'],
    ['Add residual', 'Add', 'mlp'],
    ['Output RMSNorm', 'RMSNorm', 'output'],
    ['Output head (Linear)', 'Linear', 'output'],
    ['Output logits', 'output', 'output'],
  ];

  const nodes = layerPlan.map(([name, opType, section, repeat], index) => ({
    id: `${section}-${index}`,
    name,
    opType,
    inputs: index === 0 ? [] : [`layer_${index - 1}`],
    outputs: [`layer_${index}`],
    attributeCount: section === 'input' || section === 'output' ? 0 : 1,
    repeat,
  }));

  const opCounts: Record<string, number> = {
    input: 1,
    Embedding: 1,
    RMSNorm: 1 + blockCount * 2,
    Linear: 1 + blockCount * 4,
    Attention: blockCount,
    MLP: blockCount,
    Activation: blockCount,
    Add: blockCount * 2,
    Mul: blockCount,
    output: 1,
  };

  return {
    status: 'ready',
    file: inspection.baselineFile || inspection.files.find((f) => f.format === 'GGUF')?.name || '',
    name: graphError ? `${arch} architecture view` : `${inspection.name} (${arch} arch)`,
    nodeCount: 3 + blockCount * 12,
    opTypeCount: Object.keys(opCounts).length,
    opCounts,
    inputs: [{ name: 'input_ids', dims: [1, 'seq_len'] }],
    outputs: [{ name: 'logits', dims: [1, 'seq_len', vocabSize] }],
    nodes,
    blockGraph: {
      blocks: [
        { id: 'input', label: 'input', description: 'Tokenized text inputs', opTypes: ['input'], count: 1 },
        { id: 'embeddings', label: 'Text embeddings', description: 'Token and position embeddings', opTypes: ['Embedding'], count: 1 },
        { id: 'attention', label: `${arch} Attention`, description: 'Multi-head self-attention layers', opTypes: ['RMSNorm', 'Linear', 'Attention', 'Add'], count: 5 },
        { id: 'mlp', label: `${arch} MLP`, description: 'SwiGLU feed-forward layer network', opTypes: ['RMSNorm', 'MLP', 'Linear', 'Activation', 'Mul', 'Add'], count: 7 },
        { id: 'output', label: 'Output head', description: 'Final vocab projection layers', opTypes: ['RMSNorm', 'Linear', 'output'], count: 3 },
      ],
    },
    error: graphError,
  };
}

function isYoloHfModel(inspection: HuggingFaceInspection) {
  return /yolo/i.test(`${inspection.repoId} ${inspection.name} ${inspection.pipelineTag || ''} ${inspection.libraryName || ''} ${inspection.tags.join(' ')}`);
}

function buildGenericOnnxArchitectureGraph(inspection: HuggingFaceInspection, graphError?: string): HfModelGraph {
  const onnxFiles = inspection.files.filter((file) => file.format === 'ONNX');
  const nodes = [
    { id: 'input', name: 'input', opType: 'input', inputs: [], outputs: ['input'], attributeCount: 0 },
    { id: 'onnx-model', name: 'ONNX model graph', opType: 'ONNX', inputs: ['input'], outputs: ['features'], attributeCount: onnxFiles.length },
    { id: 'output', name: 'output', opType: 'output', inputs: ['features'], outputs: [], attributeCount: 0 },
  ];

  return {
    status: 'ready',
    file: onnxFiles[0]?.name || '',
    name: graphError ? 'ONNX architecture view' : inspection.name,
    nodeCount: nodes.length,
    opTypeCount: 3,
    opCounts: { input: 1, ONNX: 1, output: 1 },
    inputs: [{ name: inspection.repoId, dims: [inspection.pipelineTag || 'unknown task'] }],
    outputs: [{ name: 'model output', dims: ['ONNX'] }],
    nodes,
    blockGraph: {
      blocks: [
        { id: 'input', label: 'Input', description: 'Model inputs', opTypes: ['input'], count: 1 },
        { id: 'graph', label: 'ONNX graph', description: graphError ? 'Parser unavailable; showing architecture placeholder' : 'Model graph', opTypes: ['ONNX'], count: 1 },
        { id: 'output', label: 'Output', description: 'Model outputs', opTypes: ['output'], count: 1 },
      ],
    },
    error: graphError,
  };
}

function buildHfArtifactGraph(inspection: HuggingFaceInspection, graphError?: string): HfModelGraph {
  const statusText = getHfCompactStatus(inspection);
  const files = inspection.files.slice(0, 28);
  const formatCounts = files.reduce<Record<string, number>>((accumulator, file) => {
    accumulator[file.format] = (accumulator[file.format] || 0) + 1;
    return accumulator;
  }, {});
  const supported = inspection.localQuantizationStatus === 'supported';
  const conversionRequired = inspection.localQuantizationStatus === 'conversion-required';
  const blocks = [
    {
      id: 'repo',
      label: 'Hugging Face repo',
      description: inspection.repoId,
      opTypes: [],
      count: 0,
    },
    {
      id: 'artifacts',
      label: supported ? 'GGUF artifacts' : conversionRequired ? 'Transformers weights' : 'Model artifacts',
      description: `${inspection.fileSummary.total} files`,
      opTypes: Object.keys(formatCounts),
      count: inspection.fileSummary.total,
    },
    {
      id: 'quantization',
      label: supported ? 'Quantization ready' : conversionRequired ? 'Conversion needed' : 'Unsupported locally',
      description: statusText,
      opTypes: [],
      count: inspection.availableSchemes.length,
    },
    {
      id: 'evaluation',
      label: supported ? 'Run eval' : 'Review target',
      description: supported ? 'Download/cache, then measure quality and speed' : 'Local runner currently expects GGUF language models',
      opTypes: [],
      count: 0,
    },
  ];

  return {
    status: 'ready',
    file: inspection.baselineFile || inspection.files[0]?.name || '',
    name: graphError ? 'Repository artifact view' : inspection.name,
    nodeCount: files.length,
    opTypeCount: Object.keys(formatCounts).length,
    opCounts: formatCounts,
    inputs: [{ name: inspection.repoId, dims: [inspection.pipelineTag || 'unknown task'] }],
    outputs: [{ name: supported ? 'local GGUF evaluation' : 'inspection result', dims: [inspection.localQuantizationStatus] }],
    nodes: files.map((file, index) => ({
      id: `${file.name}-${index}`,
      name: formatHfFileName(file.name),
      opType: file.format,
      inputs: [],
      outputs: [],
      attributeCount: file.quantization ? 1 : 0,
    })),
    blockGraph: { blocks },
    error: graphError,
  };
}

function getHfCompactStatus(inspection: HuggingFaceInspection) {
  if (inspection.localQuantizationStatus === 'supported') {
    const schemeText = inspection.availableSchemes.length > 0
      ? `${inspection.availableSchemes.slice(0, 4).join(', ')}${inspection.availableSchemes.length > 4 ? '...' : ''}`
      : 'GGUF';
    return `GGUF repo ready. Available schemes: ${schemeText}. Click Run quick eval to download/cache and evaluate.`;
  }

  if (inspection.localQuantizationStatus === 'conversion-required') {
    return 'Repo inspected. No GGUF artifact found; local eval will need HF download and GGUF conversion first.';
  }

  return inspection.warnings[0] || `Repo inspected. Found ${inspection.formats.join(', ') || 'no supported'} files, but local quantization supports GGUF language models.`;
}

function HfInteractiveGraph(props: {
  graph: HfModelGraph;
  granularity: 'block' | 'node';
  onGranularityChange: (value: 'block' | 'node') => void;
  onSelectiveQuantization: (request: SelectiveQuantizationRequest) => Promise<void>;
  onViewGraph?: () => void;
  repoId: string;
  size?: 'embedded' | 'large';
}) {
  const [selection, setSelection] = useState<HfGraphSelection | null>(null);
  const [selectionAction, setSelectionAction] = useState<string | null>(null);
  const [selectionActionState, setSelectionActionState] = useState<'idle' | 'success' | 'error'>('idle');
  const [selectionQuantizing, setSelectionQuantizing] = useState(false);
  const [selectionBits, setSelectionBits] = useState<SelectiveQuantizationBits>('int8');
  const defaultZoom = props.size === 'large' ? 0.42 : 1;
  const [graphZoom, setGraphZoom] = useState(defaultZoom);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const nodes = props.graph.status === 'ready' ? props.graph.nodes || [] : [];
  const blocks = props.graph.status === 'ready' ? props.graph.blockGraph?.blocks || [] : [];
  const size = props.size || 'embedded';
  const isFineMode = props.granularity === 'node';

  useEffect(() => {
    setSelection(null);
    setSelectionAction(null);
    setSelectionActionState('idle');
    setSelectionQuantizing(false);
    setGraphZoom(defaultZoom);
  }, [defaultZoom, props.graph.name, props.repoId, props.size]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || props.size !== 'large') {
      return;
    }
    requestAnimationFrame(() => {
      canvas.scrollTo({ left: 0, top: 0 });
    });
  }, [props.granularity, props.graph.name, props.repoId, props.size]);

  function updateGraphZoom(nextZoom: number) {
    setGraphZoom(Math.min(1.25, Math.max(0.25, Number(nextZoom.toFixed(2)))));
  }

  function handleGraphWheel(event: WheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    updateGraphZoom(graphZoom + direction * 0.06);
  }

  if (props.graph.status === 'error') {
    return (
      <div className="quant-hf-graph-error">
        <AlertTriangle size={15} />
        <span>Graph inspection failed: {props.graph.error || 'Unable to read ONNX graph.'}</span>
      </div>
    );
  }

  return (
    <div className={`quant-hf-graph ${size}`}>
      <div className="quant-hf-graph-title">
        <div>
          <span className="eyebrow">Interactive model view</span>
          <strong>{props.repoId}</strong>
          <small>{formatHfFileName(props.graph.file || '') || props.graph.name || 'ONNX graph'}</small>
        </div>
        <div className="quant-hf-graph-toggle" role="group" aria-label="Model graph granularity">
          {(['block', 'node'] as const).map((value) => (
            <button
              className={props.granularity === value ? 'active' : ''}
              key={value}
              type="button"
              onClick={() => props.onGranularityChange(value)}
            >
              {value === 'block' ? 'Block' : 'Fine'}
            </button>
          ))}
        </div>
        {props.onViewGraph ? (
          <button className="secondary-button quant-hf-view-graph" type="button" onClick={props.onViewGraph}>
            <Maximize2 size={15} />
            View graph
          </button>
        ) : null}
      </div>

      <div className="quant-hf-graph-shell">
        <div className="quant-hf-graph-canvas" onWheel={handleGraphWheel} ref={canvasRef}>
          <div className="quant-hf-window-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="quant-hf-zoom-controls" aria-label="Graph zoom controls" role="group">
            <button type="button" onClick={() => updateGraphZoom(graphZoom - 0.08)} aria-label="Zoom out">
              <Minus size={14} />
            </button>
            <button type="button" onClick={() => updateGraphZoom(defaultZoom)} aria-label="Reset graph zoom">
              {Math.round(graphZoom * 100)}%
            </button>
            <button type="button" onClick={() => updateGraphZoom(graphZoom + 0.08)} aria-label="Zoom in">
              <Plus size={14} />
            </button>
          </div>
          {isFineMode ? (
            <HfLayerFlow nodes={nodes} onSelect={setSelection} selectedId={selection?.id || ''} size={size} zoom={graphZoom} />
          ) : (
            <HfBlockGraph blocks={blocks} onSelect={setSelection} selectedId={selection?.id || ''} />
          )}
        </div>
        <HfGraphSidebar
          graph={props.graph}
          onQuantizeSelection={async () => {
            if (!selection) {
              return;
            }
            const selectedBitOption = selectiveQuantizationBitOptions.find((option) => option.value === selectionBits);
            setSelectionQuantizing(true);
            setSelectionActionState('idle');
            setSelectionAction(`Submitting ${selection.label} (${selection.count} ${selection.count === 1 ? 'layer' : 'layers'}) for ${selectedBitOption?.label || selectionBits.toUpperCase()} selective quantization.`);
            try {
              await props.onSelectiveQuantization({
                bits: selectionBits,
                selection,
                repoId: props.repoId,
                graphFile: props.graph.file,
              });
              setSelectionAction('Selective ONNX job started. Results will open in the Analyze tab.');
              setSelectionActionState('success');
            } catch (error) {
              setSelectionAction(error instanceof Error ? error.message : 'Selective ONNX quantization failed.');
              setSelectionActionState('error');
            } finally {
              setSelectionQuantizing(false);
            }
          }}
          onSelectionBitsChange={setSelectionBits}
          selection={selection}
          selectionAction={selectionAction}
          selectionActionState={selectionActionState}
          selectionBits={selectionBits}
          selectionQuantizing={selectionQuantizing}
        />
      </div>
    </div>
  );
}

function HfBlockGraph(props: {
  blocks: NonNullable<HfModelGraph['blockGraph']>['blocks'];
  onSelect: (selection: HfGraphSelection) => void;
  selectedId: string;
}) {
  const blocks = props.blocks.length > 0 ? props.blocks : [
    { id: 'input', label: 'Input', description: 'Model inputs', opTypes: [], count: 0 },
    { id: 'graph', label: 'ONNX graph', description: 'Operations extracted from model file', opTypes: [], count: 0 },
    { id: 'output', label: 'Output', description: 'Model outputs', opTypes: [], count: 0 },
  ];

  return (
    <div className="quant-hf-block-stack">
      {blocks.map((block, index) => (
        <button
          className={`quant-hf-block-node tone-${index % 6} ${props.selectedId === block.id ? 'selected' : ''}`}
          key={block.id}
          type="button"
          onClick={() => props.onSelect({
            id: block.id,
            label: block.label,
            kind: 'block',
            opType: block.opTypes.join(', ') || 'block',
            count: block.count,
            description: block.description,
          })}
        >
          <strong>{block.label}</strong>
          <span>{block.count > 0 ? `${block.count} ops` : block.description}</span>
        </button>
      ))}
    </div>
  );
}

function HfLayerFlow(props: {
  nodes: HfModelGraph['nodes'];
  onSelect: (selection: HfGraphSelection) => void;
  selectedId: string;
  size: 'embedded' | 'large';
  zoom: number;
}) {
  const nodes = props.nodes || [];
  const visibleNodes = props.size === 'large' ? nodes : nodes.slice(0, 18);
  const flowRef = useRef<HTMLDivElement | null>(null);
  const [flowHeight, setFlowHeight] = useState(0);
  const zoomStyle = {
    '--hf-graph-zoom': props.zoom,
    '--hf-graph-stage-height': flowHeight > 0 ? `${Math.ceil(flowHeight * props.zoom + 88)}px` : undefined,
  } as CSSProperties;

  useLayoutEffect(() => {
    if (props.size !== 'large') {
      setFlowHeight(0);
      return;
    }
    const element = flowRef.current;
    if (!element) {
      return;
    }
    setFlowHeight(element.scrollHeight);
  }, [props.size, props.zoom, visibleNodes.length]);

  if (visibleNodes.length === 0) {
    return <div className="quant-hf-empty-graph">No graph nodes were returned by the ONNX inspector.</div>;
  }

  if (visibleNodes.some((node) => node.opType === 'Group')) {
    return (
      <HfGroupedLayerFlow
        nodes={visibleNodes}
        onSelect={props.onSelect}
        selectedId={props.selectedId}
        size={props.size}
        style={zoomStyle}
        totalNodes={nodes.length}
        zoom={props.zoom}
      />
    );
  }

  return (
    <div className="quant-hf-zoom-stage" style={zoomStyle}>
      <div className="quant-hf-layer-flow" ref={flowRef}>
        {visibleNodes.map((node, index) => (
          <LayerNode
            key={`${node.id}-${index}`}
            node={node}
            onSelect={props.onSelect}
            selectedId={props.selectedId}
          />
        ))}
        {props.size !== 'large' && nodes.length > visibleNodes.length ? (
          <div className="quant-hf-layer-more">{nodes.length - visibleNodes.length} more layers in full graph</div>
        ) : null}
      </div>
    </div>
  );
}

function HfGroupedLayerFlow(props: {
  nodes: NonNullable<HfModelGraph['nodes']>;
  onSelect: (selection: HfGraphSelection) => void;
  selectedId: string;
  style: CSSProperties;
  totalNodes: number;
  size: 'embedded' | 'large';
  zoom: number;
}) {
  const sections: Array<{ group?: NonNullable<HfModelGraph['nodes']>[number]; nodes: NonNullable<HfModelGraph['nodes']> }> = [];
  const flowRef = useRef<HTMLDivElement | null>(null);
  const [flowHeight, setFlowHeight] = useState(0);

  for (const node of props.nodes) {
    if (node.opType === 'Group') {
      sections.push({ group: node, nodes: [] });
      continue;
    }
    if (sections.length === 0 || !sections[sections.length - 1].group) {
      sections.push({ nodes: [node] });
      continue;
    }
    sections[sections.length - 1].nodes.push(node);
  }

  const stageStyle = {
    ...props.style,
    '--hf-graph-stage-height': flowHeight > 0 && props.size !== 'large' ? `${Math.ceil(flowHeight * props.zoom + 48)}px` : undefined,
  } as CSSProperties;

  useLayoutEffect(() => {
    const element = flowRef.current;
    if (!element) {
      return;
    }
    setFlowHeight(element.scrollHeight);
  }, [props.size, props.nodes.length, props.zoom]);

  return (
    <div className="quant-hf-zoom-stage" style={stageStyle}>
      <div className="quant-hf-layer-flow grouped" ref={flowRef}>
        {sections.map((section, sectionIndex) => {
          if (!section.group) {
            return section.nodes.map((node, nodeIndex) => (
              <LayerNode
                key={`${node.id}-${sectionIndex}-${nodeIndex}`}
                node={node}
                onSelect={props.onSelect}
                selectedId={props.selectedId}
              />
            ));
          }
          if (isYoloPoseHeadSection(section.group.name)) {
            return (
              <div className={`quant-hf-layer-section yolo-head ${getYoloSectionClass(section.group.name)} tone-${sectionIndex % 6} ${props.selectedId === section.group.id ? 'selected' : ''}`} key={section.group.id}>
                <button
                  className="quant-hf-layer-section-title"
                  type="button"
                  onClick={() => props.onSelect({
                    id: section.group?.id || '',
                    label: section.group?.name || '',
                    kind: 'section',
                    opType: section.nodes.map((node) => node.opType).filter((value, index, array) => array.indexOf(value) === index).join(', ') || 'section',
                    count: section.nodes.length,
                    description: `Contains ${section.nodes.length} pose head layers`,
                  })}
                >
                  {section.group.name}
                </button>
                <HfPoseHeadDetail
                  nodes={section.nodes}
                  onSelect={props.onSelect}
                  selectedId={props.selectedId}
                />
              </div>
            );
          }
          return (
            <div className={`quant-hf-layer-section ${getYoloSectionClass(section.group.name)} tone-${sectionIndex % 6} ${props.selectedId === section.group.id ? 'selected' : ''}`} key={section.group.id}>
              <button
                className="quant-hf-layer-section-title"
                type="button"
                onClick={() => props.onSelect({
                  id: section.group?.id || '',
                  label: section.group?.name || '',
                  kind: 'section',
                  opType: section.nodes.map((node) => node.opType).filter((value, index, array) => array.indexOf(value) === index).join(', ') || 'section',
                  count: section.nodes.length,
                  description: `Contains ${section.nodes.length} layers`,
                })}
              >
                {section.group.name}
              </button>
              {isYoloBackboneSection(section.group.name) ? <YoloBackboneBridge /> : null}
              {isYoloNeckSection(section.group.name) ? <YoloNeckBridge /> : null}
              <div className="quant-hf-layer-section-body">
                {section.nodes.map((node, nodeIndex) => (
                  <LayerNode
                    compact
                    key={`${node.id}-${nodeIndex}`}
                    node={node}
                    onSelect={props.onSelect}
                    selectedId={props.selectedId}
                  />
                ))}
              </div>
            </div>
          );
        })}
        {props.size !== 'large' && props.totalNodes > props.nodes.length ? (
          <div className="quant-hf-layer-more">{props.totalNodes - props.nodes.length} more layers in full graph</div>
        ) : null}
      </div>
    </div>
  );
}

function isYoloPoseHeadSection(name: string) {
  return /yolov8.*pose.*head/i.test(name);
}

function isYoloBackboneSection(name: string) {
  return /yolov8.*backbone/i.test(name);
}

function isYoloNeckSection(name: string) {
  return /pan-fpn.*neck/i.test(name);
}

function getYoloSectionClass(name: string) {
  if (isYoloBackboneSection(name)) return 'yolo-backbone';
  if (isYoloNeckSection(name)) return 'yolo-neck';
  if (isYoloPoseHeadSection(name)) return 'yolo-head';
  return '';
}

function YoloBackboneBridge() {
  return (
    <svg className="quant-hf-section-edge-overlay backbone-bridge" viewBox="0 0 520 260" focusable="false" aria-hidden="true">
      <path className="rail-edge" d="M94 0 V238" />
      <path className="rail-edge bright" d="M118 0 V238" />
      <path className="skip-edge" d="M260 28 C310 48 360 54 392 72 C412 84 414 108 414 136 V238" />
      <path className="skip-edge alt" d="M260 28 C300 44 324 52 334 70 C342 84 342 104 342 136 V238" />
    </svg>
  );
}

function YoloNeckBridge() {
  return (
    <svg className="quant-hf-section-edge-overlay neck-bridge" viewBox="0 0 520 360" focusable="false" aria-hidden="true">
      <path className="rail-edge bright" d="M118 0 V346" />
      <path className="neck-edge" d="M342 34 C296 52 250 52 206 70 C178 82 172 102 172 132 V346" />
      <path className="neck-edge alt" d="M414 34 V182 C414 206 398 218 376 228 C346 242 316 254 292 272" />
      <path className="head-edge" d="M260 292 C292 310 328 316 370 330" />
    </svg>
  );
}

function HfPoseHeadDetail(props: {
  nodes: NonNullable<HfModelGraph['nodes']>;
  onSelect: (selection: HfGraphSelection) => void;
  selectedId: string;
}) {
  const findNode = (name: string) => props.nodes.find((node) => node.name === name);
  const selectNode = (name: string, fallbackOpType: string, description: string) => {
    const node = findNode(name);
    props.onSelect({
      id: node?.id || `pose-head-${name}`,
      label: name,
      kind: 'layer',
      opType: node?.opType || fallbackOpType,
      count: 1,
      description,
    });
  };
  const classFor = (name: string, tone: string) => `quant-hf-pose-node ${tone} ${props.selectedId === findNode(name)?.id ? 'selected' : ''}`;

  return (
    <div className="quant-hf-pose-head-detail" aria-label="YOLOv8 pose detection head detail">
      <svg className="quant-hf-pose-lines" viewBox="0 0 660 360" focusable="false" aria-hidden="true">
        <path className="conv-edge" d="M55 18 V46 C55 58 78 62 110 64" />
        <path className="conv-edge" d="M160 18 V46 C160 58 142 62 110 64" />
        <path className="conv-edge" d="M275 18 V46 C275 58 300 62 330 64" />
        <path className="conv-edge" d="M385 18 V46 C385 58 360 62 330 64" />
        <path className="conv-edge" d="M500 18 V46 C500 58 522 62 550 64" />
        <path className="conv-edge" d="M605 18 V46 C605 58 578 62 550 64" />
        <path d="M110 101 C110 122 186 121 330 121" />
        <path d="M330 101 V121" />
        <path d="M550 101 C550 122 474 121 330 121" />
        <path d="M330 158 V181" />
        <path className="branch-edge" d="M330 181 C228 184 190 195 160 214" />
        <path className="branch-edge" d="M330 181 V214" />
        <path className="branch-edge" d="M330 181 C432 184 470 195 500 214" />
        <path d="M160 251 C160 270 250 270 330 270" />
        <path d="M330 251 V270" />
        <path d="M500 251 C500 270 410 270 330 270" />
        <path className="nms-edge" d="M330 306 V324" />
        <path className="output-edge" d="M330 344 V358" />
      </svg>
      <div className="quant-hf-pose-conv-row">
        {['P3 box Conv', 'P3 pose Conv', 'P4 box Conv', 'P4 pose Conv', 'P5 box Conv', 'P5 pose Conv'].map((name) => (
          <button className={classFor(name, 'conv')} key={name} type="button" onClick={() => selectNode(name, 'Conv', 'Scale-specific head convolution')}>
            Conv
          </button>
        ))}
      </div>
      <div className="quant-hf-pose-logits-row">
        {['P3 logits', 'P4 logits', 'P5 logits'].map((name) => (
          <button className={classFor(name, 'logits')} key={name} type="button" onClick={() => selectNode(name, 'Logits', 'Scale-specific pose logits')}>
            {name}
          </button>
        ))}
      </div>
      <button className={classFor('8400 candidates', 'logits wide')} type="button" onClick={() => selectNode('8400 candidates', 'Candidates', 'Merged candidates from P3, P4, and P5 predictions')}>
        8400 candidates
      </button>
      <div className="quant-hf-pose-branch-row">
        <button className={classFor('DFL', 'dfl')} type="button" onClick={() => selectNode('DFL', 'DFL', 'Distribution focal loss decode')}>
          DFL
        </button>
        <button className={classFor('person score', 'score')} type="button" onClick={() => selectNode('person score', 'Score', 'Person confidence score')}>
          person score
        </button>
        <button className={classFor('17 keypoints', 'logits')} type="button" onClick={() => selectNode('17 keypoints', 'Keypoints', 'Pose keypoint coordinates')}>
          17 keypoints
        </button>
      </div>
      <button className={classFor('56 x 8400', 'logits mid')} type="button" onClick={() => selectNode('56 x 8400', 'Tensor', 'Decoded pose tensor')}>
        56 x 8400
      </button>
      <button className={classFor('NMS', 'nms')} type="button" onClick={() => selectNode('NMS', 'NonMaxSuppression', 'Non-maximum suppression')}>
        NMS
      </button>
      <button className={classFor('person poses', 'output')} type="button" onClick={() => selectNode('person poses', 'output', 'Final detected person poses')}>
        person poses
      </button>
    </div>
  );
}

function LayerNode(props: {
  compact?: boolean;
  node: NonNullable<HfModelGraph['nodes']>[number];
  onSelect: (selection: HfGraphSelection) => void;
  selectedId: string;
}) {
  const repeat = Number(props.node.repeat || 0);
  const opLabel = String(props.node.opType || '').trim();
  const nameLabel = String(props.node.name || '').trim();
  const showName = nameLabel && nameLabel.toLowerCase() !== opLabel.toLowerCase();

  return (
    <button
      className={`quant-hf-layer-node tone-${getLayerTone(props.node.opType)} ${props.compact ? 'compact' : ''} ${repeat > 1 ? 'repeated' : ''} ${props.selectedId === props.node.id ? 'selected' : ''}`}
      type="button"
      onClick={() => props.onSelect({
        id: props.node.id,
        label: repeat > 1 ? `${props.node.name} x${repeat}` : props.node.name,
        kind: 'layer',
        opType: props.node.opType,
        count: repeat > 1 ? repeat : 1,
        description: formatLayerPorts(props.node),
      })}
    >
      {repeat > 1 && props.node.opType === 'C2f' ? (
        <span className="quant-hf-repeat-inner" aria-hidden="true">
          <svg className="quant-hf-repeat-lines" viewBox="0 0 128 214" focusable="false">
            <path d="M64 12 L64 202" />
            <path d="M64 28 C42 42 30 52 30 72 L30 112 C30 126 42 133 55 137" />
            <path d="M64 28 C86 42 98 52 98 72 L98 150 C98 168 82 180 64 190" />
            <path d="M64 96 C48 104 42 114 42 128 C42 142 50 150 64 154" />
            <path d="M64 154 C64 166 70 170 80 172" />
          </svg>
          <span className="quant-hf-repeat-title">C2f</span>
          {['Conv', 'Conv', 'Add', 'Concat', 'Conv'].map((label, index) => (
            <i key={`${label}-${index}`}>{label}</i>
          ))}
        </span>
      ) : (
        <>
          <span>{opLabel}</span>
          {showName ? <strong>{nameLabel}</strong> : null}
          <small>{formatLayerPorts(props.node)}</small>
        </>
      )}
      {repeat > 1 ? <b className="quant-hf-repeat-badge">x{repeat}</b> : null}
    </button>
  );
}

function getLayerTone(opType: string) {
  const lower = String(opType || '').toLowerCase();
  if (/conv|gemm|matmul/.test(lower)) return 0;
  if (/concat|add|mul|div|sub/.test(lower)) return 4;
  if (/resize|reshape|transpose|flatten/.test(lower)) return 1;
  if (/relu|sigmoid|softmax|activation/.test(lower)) return 5;
  if (/input|output|onnx|gguf|json|text|file/.test(lower)) return 3;
  return 2;
}

function formatLayerPorts(node: NonNullable<HfModelGraph['nodes']>[number]) {
  const inputCount = node.inputs?.length || 0;
  const outputCount = node.outputs?.length || 0;
  return `${inputCount} in -> ${outputCount} out`;
}

function HfGraphSidebar(props: {
  graph: HfModelGraph;
  onQuantizeSelection: () => void | Promise<void>;
  onSelectionBitsChange: (value: SelectiveQuantizationBits) => void;
  selection: HfGraphSelection | null;
  selectionAction: string | null;
  selectionActionState: 'idle' | 'success' | 'error';
  selectionBits: SelectiveQuantizationBits;
  selectionQuantizing: boolean;
}) {
  const topOps = getTopOpTypes(props.graph.opCounts);
  const totalOps = topOps.reduce((sum, item) => sum + item.count, 0);
  const selectedBitOption = selectiveQuantizationBitOptions.find((option) => option.value === props.selectionBits) || selectiveQuantizationBitOptions[0];

  return (
    <aside className="quant-hf-graph-side">
      {props.selection ? (
        <div className="quant-hf-selection-panel">
          <span className="eyebrow">Selection</span>
          <strong>{props.selection.label}</strong>
          <div className="quant-hf-selection-meta">
            <span>{props.selection.kind}</span>
            <span>{props.selection.opType}</span>
            <span>{props.selection.count} {props.selection.count === 1 ? 'layer' : 'layers'}</span>
          </div>
          {props.selection.description ? <p>{props.selection.description}</p> : null}
          <div className="quant-hf-bit-selector" role="group" aria-label="Selective quantization precision">
            {selectiveQuantizationBitOptions.map((option) => (
              <button
                className={props.selectionBits === option.value ? 'active' : ''}
                key={option.value}
                type="button"
                onClick={() => props.onSelectionBitsChange(option.value)}
              >
                <strong>{option.label}</strong>
                <span>{option.scheme}</span>
              </button>
            ))}
          </div>
          <small>{selectedBitOption.description}</small>
          <button className="primary-button" type="button" onClick={props.onQuantizeSelection} disabled={props.selectionQuantizing}>
            {props.selectionQuantizing ? 'Quantizing selected part...' : 'Quantize selected part'}
          </button>
          <small>
            The full ONNX model will be rebuilt with this region quantized, then run end-to-end with ONNX Runtime.
          </small>
          {props.selectionAction ? <div className={`quant-hf-selection-status ${props.selectionActionState}`}>{props.selectionAction}</div> : null}
        </div>
      ) : null}

      <div>
        <strong>{props.graph.name || 'ONNX model'}</strong>
        <span>{props.graph.nodeCount || 0} nodes · {props.graph.opTypeCount || 0} op types</span>
        <span>{formatGraphIo('Inputs', props.graph.inputs)} · {formatGraphIo('Outputs', props.graph.outputs)}</span>
      </div>

      <div className="quant-hf-op-list">
        <strong>Operation types</strong>
        {topOps.map((item, index) => {
          const percent = totalOps > 0 ? Math.round((item.count / totalOps) * 100) : 0;
          return (
            <div className="quant-hf-op-row" key={item.opType}>
              <span className={`quant-hf-op-dot tone-${index % 6}`} />
              <span>{item.opType}</span>
              <small>{percent}%</small>
            </div>
          );
        })}
      </div>

      <div className="quant-hf-io-list">
        <strong>Model attributes</strong>
        {[...(props.graph.inputs || []), ...(props.graph.outputs || [])].slice(0, 4).map((item) => (
          <div key={item.name}>
            <span>{item.name}</span>
            <small>{formatDims(item.dims)}</small>
          </div>
        ))}
      </div>
    </aside>
  );
}

function getTopOpTypes(opCounts?: Record<string, number>) {
  return Object.entries(opCounts || {})
    .map(([opType, count]) => ({ opType, count: Number(count) || 0 }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 8);
}

function formatGraphIo(label: string, values?: Array<{ name: string; dims: Array<string | number> }>) {
  return `${label}: ${values?.length || 0}`;
}

function formatDims(values?: Array<string | number>) {
  return values && values.length > 0 ? values.join(' x ') : 'shape unknown';
}

function formatHfFileName(value: string) {
  const parts = String(value || '').split('/').filter(Boolean);
  return parts.length > 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}` : parts[parts.length - 1] || value;
}

function tokenizeDisplayText(value: string) {
  return String(value || '').trim().split(/\s+/).filter(Boolean);
}

function normalizeDiffToken(value: string) {
  return String(value || '').trim();
}

function isStepComplete(current: PlaygroundStep, candidate: PlaygroundStep) {
  const order: PlaygroundStep[] = ['configure', 'evaluate', 'analyze', 'deploy'];
  return order.indexOf(candidate) < order.indexOf(current);
}

function getEvaluationProfile(form: QuantizationForm, inspection: HuggingFaceInspection | null): EvaluationProfile {
  return evaluationProfiles[getEvaluationModality(form, inspection)];
}

function getEvaluationModality(form: QuantizationForm, inspection: HuggingFaceInspection | null): EvaluationModality {
  if (inspection) {
    const haystack = [
      inspection.pipelineTag,
      inspection.libraryName,
      inspection.name,
      inspection.repoId,
      ...inspection.tags,
      ...inspection.formats,
    ].join(' ').toLowerCase();

    if (/(video|action-recognition|video-classification|text-to-video|image-to-video)/.test(haystack)) {
      return 'video';
    }

    if (/(audio|speech|automatic-speech-recognition|asr|text-to-speech|audio-classification|voice|wav2vec|whisper)/.test(haystack)) {
      return 'audio';
    }

    if (/(vision-language|visual-question-answering|vqa|image-to-text|text-to-image|image-text|multimodal|clip)/.test(haystack)) {
      return 'multimodal';
    }

    if (/(text|token|llm|language|text-generation|text2text-generation|conversational|question-answering|summarization|translation|fill-mask|feature-extraction|sentence-similarity|embedding|bert|gpt|t5|minilm|gguf|safetensors)/.test(haystack)) {
      return 'text';
    }

    if (/(image|vision|object-detection|image-classification|image-segmentation|semantic-segmentation|instance-segmentation|depth-estimation|pose|keypoint|yolo|detr|sam|segmentation|resnet|mobilenet)/.test(haystack)) {
      return 'image';
    }
  }

  if (form.modelSource === 'local') {
    if (/\.(onnx|tflite)$/i.test(form.localPath)) {
      return 'unknown';
    }
    if (/\.(gguf|safetensors|bin)$/i.test(form.localPath)) {
      return 'text';
    }
  }

  return 'text';
}

function createFullOnnxGraphSelection(inspection: HuggingFaceInspection): HfGraphSelection {
  const graph = getHfViewerGraph(inspection);
  const graphBlock = graph.blockGraph?.blocks.find((block) => block.id === 'graph');
  return {
    id: 'graph',
    label: graphBlock?.label || 'ONNX graph',
    kind: 'section',
    opType: graphBlock?.opTypes.join(', ') || 'full model',
    count: graph.nodeCount || graphBlock?.count || 1,
    description: 'Quantize all supported ONNX operators across the full model graph.',
  };
}

function getSelectedModelName(form: QuantizationForm) {
  if (form.modelSource === 'huggingface') {
    return form.hfRepo.trim();
  }

  if (form.modelSource === 'local') {
    return form.localPath.trim();
  }

  return form.model.trim();
}

function getInferredModelFormat(form: QuantizationForm) {
  if (form.modelSource === 'huggingface') {
    return 'HF repo';
  }

  if (form.modelSource === 'local') {
    const lowerPath = form.localPath.toLowerCase();
    if (lowerPath.endsWith('.gguf')) return 'GGUF';
    if (lowerPath.endsWith('.onnx')) return 'ONNX';
    if (lowerPath.endsWith('.safetensors')) return 'safetensors';
    return 'local file';
  }

  return 'OneInfer catalog';
}

function slugifyModelName(value: string) {
  return (value || 'model')
    .toLowerCase()
    .replace(/^hf\.co\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'model';
}

function getCatalogModelOptions(models: any[]) {
  return models
    .map((model) => {
      const value = String(model.model_id ?? model.modelId ?? model.id ?? model.model_name ?? model.modelName ?? '').trim();
      const label = String(model.model_name ?? model.modelName ?? model.display_name ?? model.displayName ?? value).trim();
      return value ? { value, label: label || value } : null;
    })
    .filter((model): model is { value: string; label: string } => Boolean(model));
}

function getProgressForStage(stage?: string) {
  switch (stage) {
    case 'preparing':
      return 8;
    case 'quantize':
      return 34;
    case 'perplexity':
      return 62;
    case 'generation':
      return 82;
    case 'complete':
      return 100;
    default:
      return 18;
  }
}

function getRunStages(form: QuantizationForm) {
  return baseRunStages.filter((stage) => {
    if (stage.key === 'tokenAccuracy') {
      return form.benchmarks.tokenAccuracy || form.benchmarks.rouge;
    }
    if (stage.key === 'perplexity') {
      return form.benchmarks.perplexity;
    }
    if (stage.key === 'latencyMemory') {
      return form.benchmarks.latencyMemory;
    }
    return true;
  });
}

function getAnalyzedMetrics(result: QuantizationResult | null) {
  if (!result) {
    return headlineMetrics;
  }
  const primary = getPrimaryRun(result);
  const failed = hasQuantizationRunFailed(primary);

  const sizeDelta = primary.compressionRatio === null || primary.compressionRatio === undefined
    ? 'size measured'
    : `${Math.round((1 - primary.compressionRatio) * 100)}% smaller`;
  const baselineSpeed = getEffectiveTokensPerSecond(primary.generation?.baseline);
  const speed = getEffectiveTokensPerSecond(primary.generation?.quantized);
  const speedDelta = baselineSpeed && speed
    ? ((speed - baselineSpeed) / baselineSpeed) * 100
    : primary.generation?.latencyDeltaPercent;

  return [
    {
      label: 'Token agreement',
      value: failed ? 'Failed' : formatPercent(primary.generation?.tokenAgreement),
      delta: failed ? 'generation check failed' : 'estimated from baseline prompt output',
      tone: failed ? 'rose' : 'sea',
    },
    {
      label: 'Perplexity',
      value: formatMetricNumber(getEffectivePerplexity(primary)),
      delta: getPerplexityDeltaText(primary),
      tone: primary.perplexity?.error ? 'rose' : 'gold',
    },
    {
      label: 'Model size',
      value: formatBytes(primary.quantizedSizeBytes) || 'measured',
      delta: sizeDelta,
      tone: 'sky',
    },
    {
      label: 'Tokens/sec',
      value: failed ? 'Failed' : formatMetricNumber(speed),
      delta: failed ? 'latency check failed' : speedDelta === null || speedDelta === undefined ? 'latency unavailable' : `${speedDelta >= 0 ? '+' : ''}${speedDelta.toFixed(1)}% vs baseline`,
      tone: failed ? 'rose' : 'sea',
    },
  ];
}

function getAnalyzedTokenMetrics(result: QuantizationResult | null) {
  if (!result) {
    return tokenMetrics;
  }
  const primary = getPrimaryRun(result);
  const artifactPath = primary.quantizedPath || '-';
  const reportPath = result.reportPath || '-';

  return [
    ['Status', hasQuantizationRunFailed(primary) ? 'Failed' : 'Succeeded'],
    ['Prompt token agreement', formatPercent(primary.generation?.tokenAgreement)],
    ['Baseline speed', formatSpeed(getEffectiveTokensPerSecond(primary.generation?.baseline))],
    ['Quantized speed', formatSpeed(getEffectiveTokensPerSecond(primary.generation?.quantized))],
    ['Quantized artifact', formatPathForDisplay(artifactPath), artifactPath],
    ['Report', formatPathForDisplay(reportPath), reportPath],
  ];
}

function getMissingQuantizationMetrics(run: QuantizationResult | null | undefined, form: QuantizationForm) {
  if (!run) {
    return [];
  }

  const missing = [];
  const tokenAgreement = run.generation?.tokenAgreement;
  const perplexity = getEffectivePerplexity(run);
  const tokensPerSecond = getEffectiveTokensPerSecond(run.generation?.quantized);

  if (form.benchmarks.tokenAccuracy && !isMeasuredNumber(tokenAgreement)) {
    missing.push('token agreement');
  }
  if (form.benchmarks.perplexity && !isMeasuredNumber(perplexity)) {
    missing.push('perplexity');
  }
  if (form.benchmarks.latencyMemory && !isMeasuredNumber(tokensPerSecond)) {
    missing.push('tokens/sec');
  }

  return missing;
}

function isMeasuredNumber(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function hasQuantizationRunFailed(run: QuantizationResult | null | undefined) {
  return Boolean(
    run?.generation?.status === 'failed'
    || run?.generation?.error
    || isLlamaErrorOutput(run?.generation?.baseline?.output)
    || isLlamaErrorOutput(run?.generation?.quantized?.output)
  );
}

function getQuantizationRunFailureMessage(run: QuantizationResult | null | undefined) {
  if (run?.generation?.error) {
    return run.generation.error;
  }

  const baselineIssue = getLlamaOutputErrorMessage(run?.generation?.baseline?.output);
  const quantizedIssue = getLlamaOutputErrorMessage(run?.generation?.quantized?.output);
  if (baselineIssue || quantizedIssue) {
    return baselineIssue || quantizedIssue;
  }

  if (run?.perplexity?.error) {
    return run.perplexity.error;
  }

  return 'The local evaluation did not complete successfully. Re-run after fixing the tool or model issue.';
}

function getDiffOutputText(output: string | undefined, run: QuantizationResult | null | undefined, label: 'baseline' | 'quantized') {
  const issue = getLlamaOutputErrorMessage(output) || getQuantizationRunFailureMessage(hasQuantizationRunFailed(run) ? run : null);
  if (issue && isLlamaErrorOutput(output)) {
    return `Evaluation failed: ${issue}`;
  }

  return output || `Run a local GGUF evaluation to capture ${label} output.`;
}

function isLlamaErrorOutput(output: string | undefined) {
  return Boolean(getLlamaOutputErrorMessage(output));
}

function getLlamaOutputErrorMessage(output: string | undefined) {
  const text = String(output || '');
  if (!text.trim()) {
    return '';
  }

  const patterns = [
    /--no-conversation\s+is\s+not\s+supported\s+by\s+llama-cli[^\n]*/i,
    /please use llama-completion instead[^\n]*/i,
    /failed to create command queue[^\n]*/i,
    /failed to initialize\s+backend[^\n]*/i,
    /unable to create context[^\n]*/i,
  ];
  const match = patterns.map((pattern) => text.match(pattern)?.[0]).find(Boolean);
  return match ? match.trim() : '';
}

function formatPathForDisplay(value: string) {
  if (!value || value === '-') {
    return '-';
  }

  const normalized = value.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 2) {
    return value;
  }

  const fileName = parts[parts.length - 1];
  const parent = parts[parts.length - 2];
  return `${parent}/${fileName}`;
}

function getBenchmarkRows(result: QuantizationResult | null) {
  const primary = result ? getPrimaryRun(result) : null;
  if (!primary) {
    return benchmarkRows;
  }

  return [
    {
      name: 'Perplexity',
      baseline: '-',
      quantized: formatMetricNumber(getEffectivePerplexity(primary)),
      delta: getPerplexityDeltaText(primary),
    },
    {
      name: 'Prompt agreement',
      baseline: '100%',
      quantized: formatPercent(primary.generation?.tokenAgreement),
      delta: 'vs baseline output',
    },
    {
      name: 'Tokens/sec',
      baseline: formatMetricNumber(getEffectiveTokensPerSecond(primary.generation?.baseline)),
      quantized: formatMetricNumber(getEffectiveTokensPerSecond(primary.generation?.quantized)),
      delta: getEffectiveLatencyDeltaPercent(primary) === null
        ? '-'
        : `${getEffectiveLatencyDeltaPercent(primary)! >= 0 ? '+' : ''}${getEffectiveLatencyDeltaPercent(primary)!.toFixed(1)}%`,
    },
    {
      name: 'Model size',
      baseline: formatBytes(primary.baselineSizeBytes),
      quantized: formatBytes(primary.quantizedSizeBytes),
      delta: primary.compressionRatio === null || primary.compressionRatio === undefined ? '-' : `${Math.round((1 - primary.compressionRatio) * 100)}% smaller`,
    },
  ];
}

function getParetoPoints(result: QuantizationResult | null, fallbackScheme: string) {
  if (!result?.runs?.length) {
    return paretoPoints.map((point) => point.label === fallbackScheme ? { ...point, active: true } : point);
  }

  return result.runs.map((run) => ({
    label: run.scheme || 'scheme',
    quality: formatPercent(run.generation?.tokenAgreement),
    size: formatBytes(run.quantizedSizeBytes) || '-',
    speed: formatSpeed(getEffectiveTokensPerSecond(run.generation?.quantized)),
  }));
}

function getEffectiveLatencyDeltaPercent(run: QuantizationResult | null | undefined) {
  const baselineSpeed = getEffectiveTokensPerSecond(run?.generation?.baseline);
  const quantizedSpeed = getEffectiveTokensPerSecond(run?.generation?.quantized);
  if (baselineSpeed && quantizedSpeed) {
    return ((quantizedSpeed - baselineSpeed) / baselineSpeed) * 100;
  }

  return run?.generation?.latencyDeltaPercent ?? null;
}

function getEffectivePerplexity(run: QuantizationResult | null | undefined) {
  const value = run?.perplexity?.value;
  if (value !== null && value !== undefined && Number.isFinite(value)) {
    return value;
  }

  return parsePerplexityFromRaw(run?.perplexity?.raw);
}

function parsePerplexityFromRaw(value: string | undefined) {
  const text = String(value || '');
  const directMatch = text.match(/(?:Final estimate:\s*)?PPL\s*=\s*([0-9]+(?:\.[0-9]+)?)/i)
    || text.match(/perplexity[^0-9]*([0-9]+(?:\.[0-9]+)?)/i);
  if (directMatch) {
    return Number(directMatch[1]);
  }

  const indexedMatches = [...text.matchAll(/\[\d+\]\s*([0-9]+(?:\.[0-9]+)?)/g)];
  const lastIndexed = indexedMatches[indexedMatches.length - 1]?.[1];
  return lastIndexed ? Number(lastIndexed) : null;
}

function getEffectiveTokensPerSecond(sample: { output?: string; tokensPerSecond?: number | null; durationMs?: number | null } | undefined) {
  if (sample?.tokensPerSecond !== null && sample?.tokensPerSecond !== undefined && Number.isFinite(sample.tokensPerSecond)) {
    return sample.tokensPerSecond;
  }

  const tokenCount = tokenizeDisplayText(sample?.output || '').length;
  const durationMs = sample?.durationMs;
  if (!tokenCount || !durationMs || !Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }

  return tokenCount / (durationMs / 1000);
}

function getPrimaryRun(result: QuantizationResult) {
  if (!result.runs?.length) {
    return result;
  }

  return result.runs.find((run) => run.scheme === result.recommendedScheme) || result.runs[0];
}

function formatSelectiveOnnxQuantizationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (isHuggingFaceAccessError(message)) {
    return formatGatedHuggingFaceMessage();
  }

  if (/No handler registered for 'app:run-selective-onnx-quantization(?:-v2)?'/i.test(message)) {
    return 'Selective ONNX full-model evaluation is installed in the renderer, but the Electron main process is still running the previous build. Quit and restart the Electron app so the v2 quantization handler is registered.';
  }

  return message || 'Selective ONNX quantization failed.';
}

function formatQuantizationEvaluationError(error: unknown, repoId?: string) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (isHuggingFaceAccessError(message)) {
    return formatGatedHuggingFaceMessage(repoId);
  }

  return message || 'Quantization evaluation failed.';
}

function formatHuggingFaceInspectionError(error: unknown, repoId?: string) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (isHuggingFaceAccessError(message)) {
    return formatGatedHuggingFaceMessage(repoId);
  }

  return message || 'Unable to inspect Hugging Face model.';
}

function isHuggingFaceAccessError(error?: unknown) {
  const message = String(error || '').toLowerCase();
  return /http\s*(401|403)|unauthorized|forbidden|gated|private|restricted|access.+denied|repository.+not.+found/.test(message)
    && /hugging face|huggingface|hf_|repo|repository|model|token|access/.test(message);
}

function formatGatedHuggingFaceMessage(repoId?: string) {
  const repoText = repoId ? `${repoId} is` : 'This Hugging Face model is';
  return `${repoText} gated or private. Accept the model terms on Hugging Face and configure a valid HF_TOKEN/Hugging Face access token, then retry inspection and evaluation.`;
}

function getOnnxQualityMetrics(evaluation?: SelectiveOnnxQuantizationResult['evaluation']) {
  if (!evaluation || evaluation.datasetStatus !== 'success') {
    return [];
  }

  const metrics: Array<{ label: string; value: string; delta: string; tone: string }> = [];
  const hasKeypointMetric = isFiniteNumber(evaluation.keypointMap5095) || isFiniteNumber(evaluation.keypointMap50);
  if (hasKeypointMetric) {
    metrics.push({
      label: 'Keypoint mAP',
      value: formatRatioPercent(evaluation.keypointMap5095),
      delta: `mAP@50 ${formatRatioPercent(evaluation.keypointMap50)}`,
      tone: 'sea',
    });
  }

  if (isFiniteNumber(evaluation.map5095) || isFiniteNumber(evaluation.map50)) {
    metrics.push({
      label: hasKeypointMetric ? 'Box mAP' : 'mAP',
      value: formatRatioPercent(evaluation.map5095),
      delta: `mAP@50 ${formatRatioPercent(evaluation.map50)}`,
      tone: 'gold',
    });
  }

  if (isFiniteNumber(evaluation.precision) || isFiniteNumber(evaluation.recall)) {
    metrics.push({
      label: 'Precision / recall',
      value: formatRatioPercent(evaluation.precision),
      delta: `recall ${formatRatioPercent(evaluation.recall)}`,
      tone: 'sky',
    });
  }

  return metrics.slice(0, 2);
}

function formatSelectiveOnnxEvaluationSummary(evaluation?: SelectiveOnnxQuantizationResult['evaluation']) {
  if (!evaluation) {
    return 'The artifact was created by an older Electron handler, so the full-model ONNX run was not executed. Quit and restart Electron, then run this selection again.';
  }

  if (evaluation.status === 'failed') {
    return `Artifact was created, but the full-model ONNX smoke run failed: ${evaluation.error || 'unknown error'}.`;
  }

  if (evaluation.status !== 'success') {
    return 'Artifact was created; full-model ONNX run was not completed.';
  }

  const baselineLatency = formatMilliseconds(evaluation.baselineLatencyMs);
  const quantizedLatency = formatMilliseconds(evaluation.quantizedLatencyMs);
  const latencyDelta = formatSignedPercent(evaluation.latencyDeltaPercent);
  const meanDelta = formatCompactNumber(evaluation.meanAbsDelta);
  const maxDelta = formatCompactNumber(evaluation.maxAbsDelta);
  const outputText = evaluation.comparableOutputs
    ? `output delta mean ${meanDelta}, max ${maxDelta}`
    : 'outputs ran without comparable numeric tensors';

  return `Full rebuilt model ran end-to-end: baseline ${baselineLatency}, quantized ${quantizedLatency}${latencyDelta ? ` (${latencyDelta})` : ''}; ${outputText}.`;
}

function isFiniteNumber(value?: number | null) {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function getSizeReductionPercent(baselineSize?: number | null, quantizedSize?: number | null) {
  if (!baselineSize || !quantizedSize || !Number.isFinite(baselineSize) || !Number.isFinite(quantizedSize) || baselineSize <= 0) {
    return null;
  }

  return (1 - (quantizedSize / baselineSize)) * 100;
}

function formatMilliseconds(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'n/a';
  }

  return value >= 100 ? `${Math.round(value)} ms` : `${value.toFixed(1)} ms`;
}

function formatSignedPercent(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '';
  }

  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatRatioPercent(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'Not measured';
  }

  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${normalized.toFixed(1)}%`;
}

function formatOptionalInteger(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'Not measured';
  }

  return String(Math.round(value));
}

function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  const side = Math.max(4, Math.floor((maxLength - 3) / 2));
  return `${value.slice(0, side)}...${value.slice(-side)}`;
}

function formatCompactNumber(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'n/a';
  }

  if (value === 0) {
    return '0';
  }

  if (Math.abs(value) < 0.001) {
    return value.toExponential(2);
  }

  return value.toFixed(4);
}

function formatBytes(value?: number | null) {
  if (!value || !Number.isFinite(value)) {
    return '';
  }

  const gb = value / 1024 ** 3;
  if (gb >= 1) {
    return `${gb.toFixed(2)} GB`;
  }

  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

function formatPercent(value?: number | null) {
  return value === null || value === undefined || !Number.isFinite(value) ? '-' : `${value.toFixed(1)}%`;
}

function formatNumber(value?: number | null) {
  return value === null || value === undefined || !Number.isFinite(value) ? '-' : value.toFixed(2);
}

function formatMetricNumber(value?: number | null) {
  return value === null || value === undefined || !Number.isFinite(value) ? 'Not measured' : value.toFixed(2);
}

function formatSpeed(value?: number | null) {
  return value === null || value === undefined || !Number.isFinite(value) ? 'Not measured' : `${value.toFixed(2)} tok/s`;
}

function getPerplexityDeltaText(run: QuantizationResult | null | undefined) {
  if (run?.perplexity?.error) {
    return 'perplexity failed';
  }

  return getEffectivePerplexity(run) === null || getEffectivePerplexity(run) === undefined
    ? 'not measured'
    : 'measured with llama-perplexity';
}
