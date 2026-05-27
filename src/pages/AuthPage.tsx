import type { FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Info, KeyRound, LoaderCircle, Network, Rocket, Send, Server, ShieldCheck } from 'lucide-react';

import { HeroChip } from '../components/Common';

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
  onGoogleLogin: () => void;
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
          <div className="eyebrow">OneInfer Desktop</div>
          <h1>
            One workspace for AI infrastructure.
          </h1>
          <p className="auth-lede">
            Manage GPU instances, developer keys, credits, models, and routing from a focused desktop app.
          </p>
          <div className="hero-grid">
            <HeroChip icon={Server} title="GPU Control" text="Create, start, stop, and inspect instances." />
            <HeroChip icon={KeyRound} title="Developer Keys" text="Generate and revoke API access quickly." />
            <HeroChip icon={Network} title="Routing Studio" text="Connect models and endpoints into routes." />
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
              <div className="auth-divider"><span>or</span></div>
              <button className="google-login-button" type="button" disabled={props.busy === 'google'} onClick={props.onGoogleLogin}>
                {props.busy === 'google' ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <svg aria-hidden="true" viewBox="0 0 21 20" width="18" height="18">
                    <path d="M18.9892 10.1871C18.9892 9.36767 18.9246 8.76973 18.7847 8.14966H9.68848V11.848H15.0277C14.9201 12.767 14.3388 14.1512 13.047 15.0812L13.0289 15.205L15.905 17.4969L16.1042 17.5173C17.9342 15.7789 18.9892 13.221 18.9892 10.1871Z" fill="#4285F4" />
                    <path d="M9.68813 19.9314C12.3039 19.9314 14.4999 19.0455 16.1039 17.5174L13.0467 15.0813C12.2286 15.6682 11.1306 16.0779 9.68813 16.0779C7.12612 16.0779 4.95165 14.3395 4.17651 11.9366L4.06289 11.9465L1.07231 14.3273L1.0332 14.4391C2.62638 17.6946 5.89889 19.9314 9.68813 19.9314Z" fill="#34A853" />
                    <path d="M4.17667 11.9366C3.97215 11.3165 3.85378 10.6521 3.85378 9.96562C3.85378 9.27905 3.97215 8.6147 4.16591 7.99463L4.1605 7.86257L1.13246 5.44363L1.03339 5.49211C0.37677 6.84302 0 8.36005 0 9.96562C0 11.5712 0.37677 13.0881 1.03339 14.4391L4.17667 11.9366Z" fill="#FBBC05" />
                    <path d="M9.68807 3.85336C11.5073 3.85336 12.7344 4.66168 13.4342 5.33718L16.1684 2.59107C14.4892 0.985496 12.3039 0 9.68807 0C5.89885 0 2.62637 2.23672 1.0332 5.49214L4.16573 7.99466C4.95162 5.59183 7.12608 3.85336 9.68807 3.85336Z" fill="#EB4335" />
                  </svg>
                )}
                Continue with Google
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
