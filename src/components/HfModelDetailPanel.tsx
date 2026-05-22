import React from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Heart,
  Info,
  Layers,
  LoaderCircle,
  ChevronDown,
  Rocket,
  Server,
  Tag,
  User,
  X,
  Zap,
} from 'lucide-react';

import type { ValidationResult } from '../helpers/hardwareValidation';
import { bytesToGiB, getModelWeightBytes } from '../helpers/modelSizing';
import type { HfModelInfo, MachineDetailsItem, ServingLibrary } from '../types';
import { formatNumber } from '../utils/format';
import { Banner } from './Common';

export function HfModelDetailPanel(props: {
  model: HfModelInfo | null;
  validation: ValidationResult | null;
  machine: MachineDetailsItem | null;
  libraries: Record<ServingLibrary, boolean>;
  selectedLibrary: ServingLibrary;
  busy: string | null;
  message: { tone: 'info' | 'success' | 'error'; text: string } | null;
  deploymentProgress: DesktopDeploymentProgress[];
  onSelectLibrary: (library: ServingLibrary) => void;
  onInstall: (name: ServingLibrary) => Promise<void>;
  onRegister: () => Promise<boolean | void> | boolean | void;
  onCancelDeploy: () => Promise<boolean | void> | boolean | void;
}) {
  const { model, validation, machine, libraries, busy, selectedLibrary, onInstall, onSelectLibrary, onRegister, onCancelDeploy } = props;
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = React.useState<string | null>(null);
  const [servingLibraryMenuOpen, setServingLibraryMenuOpen] = React.useState(false);

  if (!model) return null;

  const sizeGb = bytesToGiB(getModelWeightBytes(model));
  const totalVramGb = machine?.gpus?.reduce((acc, gpu) => acc + (gpu.vramGb ?? 0), 0) ?? 0;
  const effectiveMinVramGb = validation?.effectiveMinVramGb || sizeGb;

  const isVllmBusy = busy === 'install-vllm';
  const isOllamaBusy = busy === 'install-ollama';
  const isRegisterBusy = busy === 'register-self-hosted';
  const isAnyInstalling = Boolean(busy?.startsWith('install-'));
  const installingLibraryName = busy?.startsWith('install-') ? formatServingLibraryName(busy.replace('install-', '') as ServingLibrary) : '';
  const vramUsage = totalVramGb > 0 ? Math.min(100, (effectiveMinVramGb / totalVramGb) * 100) : 0;
  const platform = getSupportedPlatform(machine?.platform);
  const selectedOption = servingLibraryOptions.find((option) => option.value === selectedLibrary) ?? servingLibraryOptions[0];
  const selectedSupported = isLibrarySupported(selectedOption.value, platform, model);
  const selectedInstalled = selectedSupported && libraries[selectedOption.value];
  const preferredRuntime = selectedSupported && selectedInstalled ? selectedOption.label : null;
  const selectedLaunchable = isOneClickLaunchable(selectedOption.value);
  const canDeploy = Boolean(preferredRuntime) && selectedLaunchable && validation?.status !== 'insufficient';
  const selectedBusy = busy === `install-${selectedOption.value}`;

  const handleInstall = async (name: ServingLibrary) => {
    setLocalError(null);
    setLocalSuccess(null);
    try {
      await onInstall(name);
      setLocalSuccess(`${formatServingLibraryName(name)} installed successfully.`);
    } catch (error: any) {
      setLocalError(error?.message || 'Installation failed');
    }
  };

  const handleDeploy = async () => {
    setLocalError(null);
    setLocalSuccess(null);
    try {
      const deployed = await onRegister();
      if (deployed === false) {
        return;
      }
      setLocalSuccess('Model deployed successfully to your local machine.');
    } catch (error: any) {
      setLocalError(error?.message || 'Deployment failed');
    }
  };

  const handleCancelDeploy = async () => {
    setLocalError(null);
    setLocalSuccess(null);
    const cancelled = await onCancelDeploy();
    if (cancelled) {
      setLocalSuccess('Deployment cancelled.');
    }
  };

  return (
    <section className="model-detail-panel" style={{ animation: 'fadeIn 0.4s ease-out', background: 'transparent' }}>
      {props.message ? <div style={{ marginBottom: '12px' }}><Banner tone={props.message.tone} text={props.message.text} /></div> : null}
      {localError ? <div style={{ marginBottom: '12px' }}><Banner tone="error" text={localError} /></div> : null}
      {localSuccess ? <div style={{ marginBottom: '12px' }}><Banner tone="success" text={localSuccess} /></div> : null}
      {(isAnyInstalling || isRegisterBusy) && !localError && !localSuccess ? (
        <div style={{ marginBottom: '20px' }}>
          <Banner tone="info" text={isRegisterBusy ? 'Deploying model to local machine...' : `Installing ${installingLibraryName}... Please wait.`} />
        </div>
      ) : null}
      {props.deploymentProgress.length > 0 ? (
        <DeploymentProgressLog items={props.deploymentProgress} />
      ) : null}

      <div className="panel-header model-detail-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', gap: '16px' }}>
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <Layers size={14} /> {model.pipeline_tag || 'Model Architecture'}
            </div>
            <h2 style={{ fontSize: '1.75rem', margin: 0, fontWeight: 700, overflowWrap: 'anywhere' }}>{model.id}</h2>
            <div style={{ display: 'flex', gap: '16px', marginTop: '8px', color: 'var(--muted)', fontSize: '0.85rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><User size={14} /> {model.author || 'community'}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={14} /> Updated {model.lastModified ? new Date(model.lastModified).toLocaleDateString() : '-'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <div className="stat-badge"><Heart size={14} /> {formatNumber(model.likes)}</div>
            <div className="stat-badge"><Download size={14} /> {formatNumber(model.downloads)}</div>
          </div>
        </div>
      </div>

      <div className="model-grid">
        <div className="model-info-column">
          <h4 style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Metadata</h4>
          <div className="tag-cloud" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {model.tags?.slice(0, 12).map((tag) => <span key={tag} className="tag-pill"><Tag size={12} /> {tag}</span>)}
          </div>

          <div style={{ marginTop: '20px' }}>
            <h4 style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>File Summary</h4>
            <div className="data-list" style={{ gap: '8px' }}>
              <div className="data-row" style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', borderBottom: 'none' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={16} /> Model Weights</span>
                <strong style={{ color: 'var(--text)' }}>{sizeGb.toFixed(2)} GB</strong>
              </div>
              <div className="data-row" style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', borderBottom: 'none' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Zap size={16} /> KV Cache (Est.)</span>
                <strong style={{ color: 'var(--muted)' }}>+ {(sizeGb * 0.15).toFixed(2)} GB</strong>
              </div>
              <div className="data-row" style={{ padding: '12px', background: 'rgba(116, 227, 197, 0.05)', borderRadius: '8px', borderBottom: 'none' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)' }}><Server size={16} /> Total Req. VRAM</span>
                <strong style={{ color: 'var(--accent)' }}>{effectiveMinVramGb.toFixed(2)} GB</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="hardware-check-column">
          <h4 style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inference Readiness</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Serving Libraries</span>
                <Info size={14} style={{ opacity: 0.4 }} />
              </div>
              <div className="serving-library-picker">
                <ServingLibraryDropdown
                  busy={busy}
                  libraries={libraries}
                  onInstall={handleInstall}
                  onOpenChange={setServingLibraryMenuOpen}
                  onSelect={(library) => {
                    onSelectLibrary(library);
                    setServingLibraryMenuOpen(false);
                  }}
                  open={servingLibraryMenuOpen}
                  platform={platform}
                  model={model}
                  selectedLibrary={selectedLibrary}
                />
              </div>
            </div>

            {validation ? (
              <div className={`analysis-card ${validation.status}`} style={{
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid',
                background: validation.status === 'supported' ? 'rgba(16, 185, 129, 0.05)' : validation.status === 'warning' ? 'rgba(245, 158, 11, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                borderColor: validation.status === 'supported' ? 'rgba(16, 185, 129, 0.2)' : validation.status === 'warning' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <div style={{ padding: '6px', borderRadius: '6px', background: validation.status === 'supported' ? '#10b981' : validation.status === 'warning' ? '#f59e0b' : '#ef4444', color: '#fff' }}>
                    {validation.status === 'supported' ? <CheckCircle2 size={16} /> : validation.status === 'warning' ? <AlertCircle size={16} /> : <X size={16} />}
                  </div>
                  <div>
                    <h5 style={{ margin: '0 0 2px 0', fontSize: '0.95rem', color: validation.status === 'supported' ? '#10b981' : validation.status === 'warning' ? '#f59e0b' : '#ef4444' }}>
                      {validation.status === 'supported' ? 'Hardware Ready' : validation.status === 'warning' ? 'Performance Alert' : 'Incompatible'}
                    </h5>
                    <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.9, lineHeight: 1.4 }}>{validation.message}</p>
                  </div>
                </div>
                <div style={{ marginTop: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--muted)' }}>VRAM Capacity Used</span>
                    <span>{effectiveMinVramGb.toFixed(1)}GB / {totalVramGb.toFixed(1)}GB</span>
                  </div>
                  <div className="progress-bar-bg" style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div className="progress-bar-fill" style={{ height: '100%', width: `${vramUsage}%`, background: validation.status === 'supported' ? '#10b981' : validation.status === 'warning' ? '#f59e0b' : '#ef4444' }} />
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '24px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                <Clock size={24} style={{ opacity: 0.2, marginBottom: '8px' }} />
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>Analyzing hardware...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <a href={`https://huggingface.co/${model.id}`} target="_blank" rel="noopener noreferrer" className="ghost-button" style={{ textDecoration: 'none', fontSize: '0.85rem' }}>
          <ExternalLink size={14} /> Hub
        </a>
        {isRegisterBusy ? (
          <button className="danger-button" style={{ fontSize: '0.85rem', padding: '8px 16px' }} onClick={handleCancelDeploy} type="button">
            Cancel Deployment
          </button>
        ) : null}
        <button className="primary-button" style={{ fontSize: '0.85rem', padding: '8px 16px' }} onClick={handleDeploy} disabled={isRegisterBusy || !canDeploy} type="button">
          {isRegisterBusy ? <LoaderCircle className="spin" size={14} /> : <Rocket size={14} />}
          {preferredRuntime
            ? selectedLaunchable ? `Deploy with ${preferredRuntime}` : `${preferredRuntime} requires manual server`
            : selectedSupported ? `Install ${selectedOption.label} to Deploy` : `${selectedOption.label} not supported`}
        </button>
      </div>
    </section>
  );
}

function DeploymentProgressLog(props: { items: DesktopDeploymentProgress[] }) {
  const latest = props.items[props.items.length - 1];

  return (
    <div style={{ marginBottom: '20px', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.22)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '10px' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Hosting Progress</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{latest?.message || 'Preparing deployment...'}</div>
        </div>
        <span className={`status-pill ${latest?.level === 'error' ? 'error' : latest?.level === 'success' ? 'active' : ''}`} style={{ whiteSpace: 'nowrap' }}>
          {latest?.stage || 'preparing'}
        </span>
      </div>
      <div style={{ display: 'grid', gap: '6px', maxHeight: '11rem', overflowY: 'auto', paddingRight: '4px' }}>
        {props.items.slice(-12).map((item, index) => (
          <div key={`${item.timestamp}-${index}`} style={{ display: 'grid', gridTemplateColumns: '5.5rem 1fr', gap: '8px', fontSize: '0.75rem', lineHeight: 1.35 }}>
            <span style={{ color: item.level === 'error' ? 'var(--danger)' : item.level === 'success' ? 'var(--accent)' : 'var(--muted)', textTransform: 'uppercase' }}>{item.stage}</span>
            <span>
              <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{item.message}</strong>
              {item.detail ? <span style={{ display: 'block', color: 'var(--muted)', marginTop: '2px', fontFamily: 'monospace', wordBreak: 'break-word' }}>{item.detail}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type SupportedPlatform = 'windows' | 'macos' | 'linux' | 'unknown';

const servingLibraryOptions: Array<{ value: ServingLibrary; label: string; platforms: SupportedPlatform[] }> = [
  { value: 'vllm', label: 'vLLM', platforms: ['linux', 'macos'] },
  { value: 'sglang', label: 'SGLang', platforms: ['linux', 'macos'] },
  { value: 'tensorrt', label: 'TensorRT-LLM', platforms: ['linux'] },
  { value: 'ollama', label: 'Ollama', platforms: ['windows', 'macos', 'linux'] },
  { value: 'llama_cpp', label: 'llama.cpp', platforms: ['windows', 'macos', 'linux'] },
  { value: 'pytorch', label: 'PyTorch', platforms: ['windows', 'macos', 'linux'] },
  { value: 'transformers', label: 'Transformers', platforms: ['windows', 'macos', 'linux'] },
  { value: 'dynamo', label: 'Dynamo', platforms: ['linux'] },
];

function ServingLibraryDropdown(props: {
  busy: string | null;
  libraries: Record<ServingLibrary, boolean>;
  onInstall: (library: ServingLibrary) => void;
  onOpenChange: (open: boolean) => void;
  onSelect: (library: ServingLibrary) => void;
  open: boolean;
  platform: SupportedPlatform;
  model: HfModelInfo;
  selectedLibrary: ServingLibrary;
}) {
  const selectedOption = servingLibraryOptions.find((option) => option.value === props.selectedLibrary) ?? servingLibraryOptions[0];
  const selectedSupported = isLibrarySupported(selectedOption.value, props.platform, props.model);
  const selectedInstalled = selectedSupported && props.libraries[selectedOption.value];

  return (
    <div className="serving-library-dropdown">
      <button
        aria-expanded={props.open}
        className={`serving-library-trigger ${selectedInstalled ? 'installed' : selectedSupported ? 'missing' : 'unsupported'}`}
        onClick={() => props.onOpenChange(!props.open)}
        type="button"
      >
        <span className="serving-library-trigger-main">
          <span />
          <strong>{selectedOption.label}</strong>
        </span>
        <span className="serving-library-trigger-meta">
          {selectedInstalled ? 'Installed' : selectedSupported ? 'Install available' : 'Unsupported'}
          <ChevronDown size={16} />
        </span>
      </button>
      {props.open ? (
        <div className="serving-library-menu">
          {servingLibraryOptions.map((option) => {
            const supported = isLibrarySupported(option.value, props.platform, props.model);
            const installed = supported && props.libraries[option.value];
            const optionBusy = props.busy === `install-${option.value}`;
            const selected = option.value === props.selectedLibrary;
            return (
              <div className={`serving-library-option ${selected ? 'selected' : ''} ${installed ? 'installed' : supported ? 'missing' : 'unsupported'}`} key={option.value}>
                <button
                  className="serving-library-option-select"
                  disabled={!supported}
                  onClick={() => props.onSelect(option.value)}
                  type="button"
                >
                  <span />
                  <strong>{option.label}</strong>
                  <small>{installed ? 'Installed' : supported ? 'Not installed' : 'Unsupported'}</small>
                </button>
                {!installed ? (
                  <button
                    className="serving-library-option-install"
                    disabled={!supported || optionBusy}
                    onClick={() => props.onInstall(option.value)}
                    type="button"
                  >
                    {optionBusy ? <LoaderCircle className="spin" size={12} /> : supported ? 'Install' : 'Unsupported'}
                  </button>
                ) : (
                  <span className="serving-library-option-installed"><CheckCircle2 size={14} /> Installed</span>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function isLibrarySupported(library: ServingLibrary, platform: SupportedPlatform, model: HfModelInfo): boolean {
  const option = servingLibraryOptions.find((item) => item.value === library);
  const osSupported = platform === 'unknown' || Boolean(option?.platforms.includes(platform));
  return osSupported && isLibraryCompatibleWithModel(library, model);
}

function isLibraryCompatibleWithModel(library: ServingLibrary, model: HfModelInfo): boolean {
  const gguf = isGgufModel(model);
  if (library === 'ollama' || library === 'llama_cpp') {
    return gguf;
  }

  if (library === 'tensorrt') {
    return hasAnyFileExtension(model, ['.engine', '.plan']);
  }

  if (library === 'pytorch' || library === 'transformers') {
    return true;
  }

  return !gguf;
}

function isGgufModel(model: HfModelInfo): boolean {
  const id = String(model.id ?? '').toLowerCase();
  const tags = (model.tags || []).map((tag) => String(tag).toLowerCase());
  return id.includes('gguf')
    || tags.some((tag) => tag.includes('gguf') || tag.includes('llama.cpp') || tag.includes('llamacpp'))
    || hasAnyFileExtension(model, ['.gguf', '.ggml']);
}

function hasAnyFileExtension(model: HfModelInfo, extensions: string[]): boolean {
  return Array.isArray(model.siblings)
    && model.siblings.some((file) => {
      const filename = String(file.rfilename ?? '').toLowerCase();
      return extensions.some((extension) => filename.endsWith(extension));
    });
}

function isOneClickLaunchable(library: ServingLibrary): boolean {
  return library === 'vllm' || library === 'ollama';
}

function getSupportedPlatform(value: unknown): SupportedPlatform {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized.includes('win')) return 'windows';
  if (normalized.includes('darwin') || normalized.includes('mac')) return 'macos';
  if (normalized.includes('linux')) return 'linux';
  if (typeof navigator !== 'undefined') {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('windows')) return 'windows';
    if (userAgent.includes('mac')) return 'macos';
    if (userAgent.includes('linux')) return 'linux';
  }
  return 'unknown';
}

function formatServingLibraryName(value: ServingLibrary): string {
  const labels: Record<ServingLibrary, string> = {
    vllm: 'vLLM',
    sglang: 'SGLang',
    tensorrt: 'TensorRT-LLM',
    ollama: 'Ollama',
    llama_cpp: 'llama.cpp',
    pytorch: 'PyTorch',
    transformers: 'Transformers',
    dynamo: 'Dynamo',
  };
  return labels[value] ?? value;
}
