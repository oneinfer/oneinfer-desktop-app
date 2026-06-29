import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  Cpu,
  Download,
  FileJson,
  Gauge,
  Layers3,
  Play,
  Rocket,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Trash2,
} from 'lucide-react';

import { Panel } from '../components/Common';
import type { DashboardState, ServingLibrary } from '../types';

type PlaygroundStep = 'configure' | 'evaluate' | 'analyze' | 'deploy';
type EvalStatus = 'idle' | 'running' | 'complete';
type ModelSource = 'huggingface' | 'catalog' | 'local';

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
    latencyMemory: boolean;
    ttft: boolean;
    peakMemory: boolean;
  };
}

const datasetOptions = [
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
  benchmarks: {
    tokenAccuracy: true,
    perplexity: true,
    mmlu: false,
    hellaswag: false,
    truthfulqa: false,
    arcChallenge: false,
    winogrande: false,
    gsm8k: false,
    humaneval: false,
    rouge: true,
    bertScore: false,
    latencyMemory: true,
    ttft: true,
    peakMemory: true,
  },
};

const benchmarkGroups: Array<{
  title: string;
  items: Array<[keyof QuantizationForm['benchmarks'], string]>;
}> = [
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

const baseRunStages = [
  { key: 'quantize', title: 'Quantize model', detail: 'Create selected quantized artifact or batch of schemes' },
  { key: 'calibration', title: 'Load calibration data', detail: 'Prepare built-in or custom evaluation text' },
  { key: 'tokenAccuracy', title: 'Token agreement evaluation', detail: 'Compare generated tokens against baseline output' },
  { key: 'perplexity', title: 'Perplexity evaluation', detail: 'Run held-out corpus perplexity when llama-perplexity is available' },
  { key: 'latencyMemory', title: 'Latency and memory benchmark', detail: 'Measure prompt latency, tokens/sec, size, and compression' },
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
  const [tools, setTools] = useState<QuantizationTools | null>(null);
  const [cacheClearStatus, setCacheClearStatus] = useState<string | null>(null);
  const [cacheClearing, setCacheClearing] = useState(false);

  const runStages = useMemo(() => getRunStages(form), [form]);
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
  const canRunEval = !targetNeedsInstance && selectedModelName.trim().length > 0;
  const needsLocalGguf = form.modelSource !== 'local' && selectedTarget.value === 'local';
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

  function updateForm(next: Partial<QuantizationForm>) {
    setForm((current) => ({ ...current, ...next }));
  }

  async function runEvaluation() {
    if (!canRunEval) {
      return;
    }

    setStep('evaluate');
    setStatus('running');
    setProgress(5);
    setEvalError(null);
    setEvalResult(null);
    setProgressEvents([]);

    if (!window.desktopBridge?.runQuantizationEval) {
      setStatus('idle');
      setEvalError('Quantization evaluation is not available in this app build. Restart Electron after updating the app.');
      return;
    }

    try {
      const result = await window.desktopBridge.runQuantizationEval({
        jobId: `quant-${Date.now()}`,
        target: selectedTarget.value,
        modelSource: form.modelSource,
        modelId: form.model,
        hfRepo: form.hfRepo,
        localPath: form.localPath,
        format: getInferredModelFormat(form),
        scheme: form.scheme,
        dataset: form.dataset,
        calibrationSamples: form.calibrationSamples,
        benchmarks: form.benchmarks,
        prompt,
      }) as QuantizationResult;
      setEvalResult(result);
      setStatus('complete');
      setProgress(100);
      setStep('analyze');
    } catch (error) {
      setStatus('idle');
      setEvalError(error instanceof Error ? error.message : 'Quantization evaluation failed.');
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
        <button className="primary-button" type="button" onClick={runEvaluation} disabled={!canRunEval}>
          <Play size={16} />
          Run quick eval
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
                  <label>
                    <span>Hugging Face repo</span>
                    <input
                      placeholder="owner/model-name"
                      value={form.hfRepo}
                      onChange={(event) => updateForm({ hfRepo: event.target.value })}
                    />
                  </label>
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
                <label>
                  <span>Evaluation dataset</span>
                  <select value={form.dataset} onChange={(event) => updateForm({ dataset: event.target.value })}>
                    {datasetOptions.map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
                <div className="quant-toggle-list">
                  {benchmarkGroups.map((group) => (
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
        <Panel title={`${selectedModelName || 'Selected model'} - ${form.scheme}`} icon={Gauge} description={`${form.dataset} eval on ${selectedTarget.label}`}>
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
          <div className="action-row" style={{ marginTop: '18px' }}>
            <button className="secondary-button" type="button" onClick={() => setStep('configure')}>Back</button>
            <button className="primary-button" type="button" onClick={completeEvaluation} disabled={!evalResult}>
              <BarChart3 size={16} />
              View results
            </button>
          </div>
        </Panel>
      ) : null}

      {step === 'analyze' ? (
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
              <button className="secondary-button" type="button" onClick={runEvaluation} disabled={!canRunEval || status === 'running'}>Run</button>
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
      ) : null}

      {step === 'deploy' ? (
        <Panel title="Deploy quantized model" icon={Rocket} description="Export the artifact, config, and command needed to run this profile with oneinfer-edge.">
          <div className="quant-deploy-grid">
            <div className="quant-command">
              <Terminal size={16} />
              <code>oneinfer-edge deploy {slugifyModelName(selectedModelName)}-{form.scheme.toLowerCase()} --target "{selectedTarget.value}"</code>
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
