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
  Rocket,
  Server,
  Tag,
  User,
  X,
  Zap,
} from 'lucide-react';

import type { ValidationResult } from '../helpers/hardwareValidation';
import type { HfModelInfo, MachineDetailsItem } from '../types';
import { formatNumber } from '../utils/format';
import { Banner } from './Common';

export function HfModelDetailPanel(props: {
  model: HfModelInfo | null;
  validation: ValidationResult | null;
  machine: MachineDetailsItem | null;
  libraries: { vllm: boolean; ollama: boolean };
  busy: string | null;
  message: { tone: 'info' | 'success' | 'error'; text: string } | null;
  onInstall: (name: 'vllm' | 'ollama') => Promise<void>;
  onRegister: () => void;
}) {
  const { model, validation, machine, libraries, busy, onInstall, onRegister } = props;
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = React.useState<string | null>(null);

  if (!model) return null;

  const totalSize = (model.siblings as any[])?.reduce((acc, file) => acc + (file.size || 0), 0) ?? 0;
  const sizeGb = totalSize / (1024 ** 3);
  const totalVramGb = machine?.gpus?.reduce((acc, gpu) => acc + (gpu.vramGb ?? 0), 0) ?? 0;
  const effectiveMinVramGb = validation?.effectiveMinVramGb || sizeGb;

  const isVllmBusy = busy === 'install-vllm';
  const isOllamaBusy = busy === 'install-ollama';
  const isRegisterBusy = busy === 'register-self-hosted';
  const isAnyInstalling = isVllmBusy || isOllamaBusy;
  const vramUsage = totalVramGb > 0 ? Math.min(100, (effectiveMinVramGb / totalVramGb) * 100) : 0;

  const handleInstall = async (name: 'vllm' | 'ollama') => {
    setLocalError(null);
    setLocalSuccess(null);
    try {
      await onInstall(name);
      setLocalSuccess(`${name === 'vllm' ? 'vLLM' : 'Ollama'} installed successfully.`);
    } catch (error: any) {
      setLocalError(error?.message || 'Installation failed');
    }
  };

  const handleDeploy = async () => {
    setLocalError(null);
    setLocalSuccess(null);
    try {
      await onRegister();
      setLocalSuccess('Model deployed successfully to your local machine.');
    } catch (error: any) {
      setLocalError(error?.message || 'Deployment failed');
    }
  };

  return (
    <section className="model-detail-panel" style={{ animation: 'fadeIn 0.4s ease-out', background: 'transparent', padding: '24px' }}>
      {props.message ? <div style={{ marginBottom: '12px' }}><Banner tone={props.message.tone} text={props.message.text} /></div> : null}
      {localError ? <div style={{ marginBottom: '12px' }}><Banner tone="error" text={localError} /></div> : null}
      {localSuccess ? <div style={{ marginBottom: '12px' }}><Banner tone="success" text={localSuccess} /></div> : null}
      {(isAnyInstalling || isRegisterBusy) && !localError && !localSuccess ? (
        <div style={{ marginBottom: '20px' }}>
          <Banner tone="info" text={isRegisterBusy ? 'Deploying model to local machine...' : `Installing ${isVllmBusy ? 'vLLM' : 'Ollama'}... Please wait.`} />
        </div>
      ) : null}

      <div className="panel-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
          <div>
            <div className="eyebrow" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <Layers size={14} /> {model.pipeline_tag || 'Model Architecture'}
            </div>
            <h2 style={{ fontSize: '1.75rem', margin: 0, fontWeight: 700 }}>{model.id}</h2>
            <div style={{ display: 'flex', gap: '16px', marginTop: '8px', color: 'var(--muted)', fontSize: '0.85rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><User size={14} /> {model.author || 'community'}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={14} /> Updated {model.lastModified ? new Date(model.lastModified).toLocaleDateString() : '-'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div className="stat-badge"><Heart size={14} /> {formatNumber(model.likes)}</div>
            <div className="stat-badge"><Download size={14} /> {formatNumber(model.downloads)}</div>
          </div>
        </div>
      </div>

      <div className="model-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', padding: '20px 0' }}>
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
              <LibraryStatus name="vLLM (Recommended)" installed={libraries.vllm} busy={isVllmBusy} onInstall={() => handleInstall('vllm')} />
              <LibraryStatus name="Ollama" installed={libraries.ollama} busy={isOllamaBusy} onInstall={() => handleInstall('ollama')} />
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
        <button className="primary-button" style={{ fontSize: '0.85rem', padding: '8px 16px' }} onClick={handleDeploy} disabled={isRegisterBusy} type="button">
          {isRegisterBusy ? <LoaderCircle className="spin" size={14} /> : <Rocket size={14} />}
          Deploy this Model
        </button>
      </div>
    </section>
  );
}

function LibraryStatus(props: { name: string; installed: boolean; busy: boolean; onInstall: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: props.installed ? '#10b981' : '#ef4444', boxShadow: props.installed ? '0 0 8px #10b981' : 'none' }} />
        {props.name}
      </div>
      {!props.installed ? (
        <button className="ghost-button" style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={props.onInstall} disabled={props.busy} type="button">
          {props.busy ? <LoaderCircle className="spin" size={12} /> : 'Install'}
        </button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10b981', fontSize: '0.85rem', fontWeight: 600 }}>
          <CheckCircle2 size={16} /> Installed
        </div>
      )}
    </div>
  );
}
