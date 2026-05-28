import React from 'react';
import {
  Calendar,
  CheckCircle2,
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
  Zap,
} from 'lucide-react';

import type { ValidationResult } from '../helpers/hardwareValidation';
import { getModelMemoryBreakdown } from '../helpers/modelSizing';
import { getServingLibraryCompatibility } from '../helpers/servingCompatibility';
import type { HfModelInfo, MachineDetailsItem, ServingLibrary } from '../types';
import { formatNumber } from '../utils/format';

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
  const [servingLibraryMenuOpen, setServingLibraryMenuOpen] = React.useState(false);

  if (!model) return null;

  const memoryBreakdown = getModelMemoryBreakdown(model, {
    servingLibrary: selectedLibrary,
  });
  const sizeGb = validation?.modelWeightGb ?? memoryBreakdown.modelWeightGb;
  const kvCacheGb = validation?.kvCacheGb ?? memoryBreakdown.kvCacheGb;
  const servingOverheadGb = validation?.servingOverheadGb ?? memoryBreakdown.servingOverheadGb;
  const effectiveMinVramGb = validation?.effectiveMinVramGb || memoryBreakdown.totalVramGb;

  const isVllmBusy = busy === 'install-vllm';
  const isOllamaBusy = busy === 'install-ollama';
  const isRegisterBusy = busy === 'register-self-hosted';
  const platform = getSupportedPlatform(machine?.platform);
  const selectedOption = servingLibraryOptions.find((option) => option.value === selectedLibrary) ?? servingLibraryOptions[0];
  const selectedStatus = getServingLibraryStatus(selectedOption, platform, model);
  const selectedSupported = selectedStatus.supported;
  const selectedInstalled = selectedSupported && libraries[selectedOption.value];
  const preferredRuntime = selectedSupported && selectedInstalled ? selectedOption.label : null;
  const selectedLaunchable = isOneClickLaunchable(selectedOption.value);
  const canUseSelectedLibrary = selectedSupported && validation?.status !== 'insufficient';
  const selectedBusy = busy === `install-${selectedOption.value}`;

  const handleInstall = async (name: ServingLibrary) => {
    try {
      await onInstall(name);
    } catch (error: any) {
      console.error('[model-detail] installation failed', error);
    }
  };

  const handleDeploy = async () => {
    try {
      if (selectedSupported && !selectedInstalled) {
        await handleInstall(selectedOption.value);
        return;
      }

      const deployed = await onRegister();
      if (deployed === false) {
        return;
      }
    } catch (error: any) {
      console.error('[model-detail] deployment failed', error);
    }
  };

  const handleCancelDeploy = async () => {
    await onCancelDeploy();
  };

  return (
    <section className="model-detail-panel" style={{ animation: 'fadeIn 0.4s ease-out', background: 'transparent' }}>
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
                <strong style={{ color: 'var(--muted)' }}>+ {kvCacheGb.toFixed(2)} GB</strong>
              </div>
              <div className="data-row" style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', borderBottom: 'none' }}>
                <span
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                  title="Estimated extra VRAM used by the selected serving runtime, separate from model weights and KV cache."
                >
                  <Server size={16} /> Serving Library VRAM (Est.)
                </span>
                <strong style={{ color: 'var(--muted)' }}>+ {servingOverheadGb.toFixed(2)} GB</strong>
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

            {props.deploymentProgress.length > 0 ? (
              <DeploymentProgressLog items={props.deploymentProgress} />
            ) : null}

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
        <button className="primary-button" style={{ fontSize: '0.85rem', padding: '8px 16px' }} onClick={handleDeploy} disabled={isRegisterBusy || !canUseSelectedLibrary || selectedBusy} type="button">
          {isRegisterBusy ? <LoaderCircle className="spin" size={14} /> : <Rocket size={14} />}
          {selectedInstalled
            ? selectedLaunchable ? `Deploy with ${preferredRuntime}` : `Register ${selectedOption.label} endpoint`
            : selectedSupported ? `Install ${selectedOption.label}` : `${selectedOption.label}: ${selectedStatus.shortLabel}`}
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
  const selectedStatus = getServingLibraryStatus(selectedOption, props.platform, props.model);
  const selectedSupported = selectedStatus.supported;
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
          {selectedInstalled ? 'Installed' : selectedStatus.supported ? 'Install available' : selectedStatus.shortLabel}
          <ChevronDown size={16} />
        </span>
      </button>
      {props.open ? (
        <div className="serving-library-menu">
          {servingLibraryOptions.map((option) => {
            const status = getServingLibraryStatus(option, props.platform, props.model);
            const installed = status.supported && props.libraries[option.value];
            const optionBusy = props.busy === `install-${option.value}`;
            const selected = option.value === props.selectedLibrary;
            return (
              <div
                className={`serving-library-option ${selected ? 'selected' : ''} ${installed ? 'installed' : status.supported ? 'missing' : 'unsupported'}`}
                key={option.value}
                title={status.detail}
              >
                <button
                  className="serving-library-option-select"
                  disabled={!status.supported}
                  onClick={() => props.onSelect(option.value)}
                  type="button"
                >
                  <span />
                  <strong>{option.label}</strong>
                  <small>{installed ? 'Installed' : status.supported ? 'Not installed' : status.shortLabel}</small>
                </button>
                {!installed ? (
                  <button
                    className="serving-library-option-install"
                    disabled={!status.supported || optionBusy}
                    onClick={() => props.onInstall(option.value)}
                    type="button"
                  >
                    {optionBusy ? <LoaderCircle className="spin" size={12} /> : status.supported ? 'Install' : status.shortLabel}
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

function getServingLibraryStatus(
  option: { value: ServingLibrary; label: string; platforms: SupportedPlatform[] },
  platform: SupportedPlatform,
  model: HfModelInfo,
): { supported: boolean; shortLabel: string; detail: string } {
  const osSupported = platform === 'unknown' || Boolean(option?.platforms.includes(platform));
  if (!osSupported) {
    const supportedOs = option.platforms.map(formatPlatformLabel).join(', ');
    return {
      supported: false,
      shortLabel: 'OS not supported',
      detail: `${option.label} is not supported on this OS. Supported OS: ${supportedOs}.`,
    };
  }

  const compatibility = getServingLibraryCompatibility(option.value, model);
  if (!compatibility.supported) {
    return {
      supported: false,
      shortLabel: 'Model not supported',
      detail: compatibility.reason || `${option.label} does not support this model.`,
    };
  }

  return {
    supported: true,
    shortLabel: 'Install available',
    detail: `${option.label} supports this OS and model.`,
  };
}

function isOneClickLaunchable(library: ServingLibrary): boolean {
  return library === 'vllm' || library === 'ollama' || library === 'transformers' || library === 'pytorch';
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

function formatPlatformLabel(platform: SupportedPlatform): string {
  const labels: Record<SupportedPlatform, string> = {
    windows: 'Windows',
    macos: 'macOS',
    linux: 'Linux',
    unknown: 'Unknown OS',
  };
  return labels[platform] ?? platform;
}
