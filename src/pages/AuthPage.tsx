import type { FormEvent } from 'react';
import { KeyRound, LoaderCircle, Orbit, Rocket, Send, Server, ShieldCheck } from 'lucide-react';

import { Banner, HeroChip } from '../components/Common';

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
  return (
    <div className="shell auth-shell">
      <div className="auth-stage">
        <div className="auth-hero glass-panel">
          <div className="eyebrow">OneInfer Desktop</div>
          <h1>Ship GPU infrastructure and developer APIs from one native workspace.</h1>
          <p>
            This client talks directly to your existing OneInfer backend endpoints for OTP login, credits, models,
            instances, API keys, and intelligent routing.
          </p>
          <div className="hero-grid">
            <HeroChip icon={Server} title="Instance Control" text="Create, start, stop, restart, and remove GPU instances." />
            <HeroChip icon={KeyRound} title="Developer Keys" text="Generate and revoke keys without leaving the desktop app." />
            <HeroChip icon={Orbit} title="Routing Studio" text="Create inference endpoints and attach them into intelligent routing." />
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

          {props.message ? <Banner tone={props.message.tone} text={props.message.text} /> : null}

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
              <button className="secondary-button" type="submit" disabled={props.busy === 'login'}>
                {props.busy === 'login' ? <LoaderCircle className="spin" size={16} /> : <Rocket size={16} />}
                Enter Workspace
              </button>
              <button className="ghost-button" type="button" style={{ marginTop: '-8px' }} onClick={props.onBackToEmail}>
                Change Email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
