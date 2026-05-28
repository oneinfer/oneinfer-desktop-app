import type { FormEvent } from 'react';
import { AlertCircle, BarChart3, CheckCircle2, Cpu, Gauge, Info, LoaderCircle, Network, Rocket, Send, Server, ShieldCheck, SlidersHorizontal } from 'lucide-react';

export function AuthPage(props: {
  email: string;
  otp: string;
  loginStep: 'email' | 'otp';
  busy: string | null;
  message: { tone: 'info' | 'success' | 'error'; text: string } | null;
  onEmailChange: (value: string) => void;
  onOtpChange: (value: string) => void;
  onOtpRequest: (event: FormEvent<HTMLFormElement>) => void;
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
  onBackToEmail: () => void;
}) {
  const MessageIcon = props.message?.tone === 'success'
    ? CheckCircle2
    : props.message?.tone === 'error'
      ? AlertCircle
      : Info;

  return (
    <div className="shell auth-shell">
      <div className="auth-stage">
        <div className="auth-hero glass-panel">
          <div className="eyebrow">OneInfer Edge</div>
          <h1>
            One workspace for AI infrastructure.
          </h1>
          <p className="auth-lede">
            Manage GPU instances, developer keys, credits, models, and routing from a focused edge app.
          </p>
          <div className="auth-capability-panel">
            <FeaturePill icon={Server} title="GPU Control" note="Launch, inspect, and manage GPU instances." />
            <FeaturePill icon={Network} title="Routing Studio" note="Route requests across local and cloud endpoints." />
            <FeaturePill icon={SlidersHorizontal} title="Quantization" note="Explore model formats, memory, and latency tradeoffs." />
            <FeaturePill icon={BarChart3} title="Model Evals" note="Compare quality, cost, latency, and reliability." />
            <FeaturePill icon={Gauge} title="Training & Finetuning" note="Prepare datasets and track model improvement runs." />
            <FeaturePill icon={Cpu} title="Kernel Optimizations" note="Tune inference paths for better hardware efficiency." />
          </div>
        </div>

        <div className="auth-forms glass-panel">
          <div className="panel-header">
            <div>
              <div className="eyebrow">Connect</div>
              <h2>Developer Login</h2>
            </div>
            <ShieldCheck size={20} />
          </div>

          {props.message ? (
            <div className={`auth-notice ${props.message.tone}`} role="status">
              <MessageIcon size={18} />
              <span>{props.message.text}</span>
            </div>
          ) : null}

          {props.loginStep === 'email' ? (
            <form className="stack-form" onSubmit={props.onOtpRequest}>
              <label>
                <span>Email</span>
                <input value={props.email} onChange={(event) => props.onEmailChange(event.target.value)} placeholder="developer@oneinfer.ai" />
              </label>
              <button className="primary-button" type="submit" disabled={props.busy === 'otp'}>
                {props.busy === 'otp' ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}
                Request OTP
              </button>
            </form>
          ) : (
            <form className="stack-form" onSubmit={props.onLogin}>
              <label>
                <span>One-Time Password</span>
                <input value={props.otp} onChange={(event) => props.onOtpChange(event.target.value)} placeholder="Enter OTP" autoFocus />
              </label>
              <button className="secondary-button auth-enter-button" type="submit" disabled={props.busy === 'login'}>
                {props.busy === 'login' ? <LoaderCircle className="spin" size={16} /> : <Rocket size={16} />}
                Enter Workspace
              </button>
              <button className="ghost-button auth-change-email-button" type="button" onClick={props.onBackToEmail}>
                Change Email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function FeaturePill(props: { icon: typeof Server; note: string; title: string }) {
  const Icon = props.icon;
  return (
    <div className="auth-feature-pill">
      <Icon size={15} />
      <span>
        <strong>{props.title}</strong>
        <small>{props.note}</small>
      </span>
    </div>
  );
}
