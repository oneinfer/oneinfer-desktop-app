import type { FormEvent } from 'react';
import { AlertCircle, BarChart3, CheckCircle2, Cpu, Gauge, Info, LoaderCircle, Network, Rocket, Send, Server, ShieldCheck, SlidersHorizontal, UserPlus } from 'lucide-react';
import type { AuthStep, RegistrationFormState } from '../types';

export function AuthPage(props: {
  email: string;
  otp: string;
  loginStep: AuthStep;
  busy: string | null;
  message: { tone: 'info' | 'success' | 'error'; text: string } | null;
  registrationForm: RegistrationFormState;
  onEmailChange: (value: string) => void;
  onOtpChange: (value: string) => void;
  onRegistrationChange: (value: RegistrationFormState) => void;
  onOtpRequest: (event: FormEvent<HTMLFormElement>) => void;
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
  onRegistration: (event: FormEvent<HTMLFormElement>) => void;
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
          ) : props.loginStep === 'otp' ? (
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
          ) : (
            <form className="stack-form auth-registration-form" onSubmit={props.onRegistration}>
              <div className="auth-form-grid">
                <label>
                  <span>First Name</span>
                  <input
                    value={props.registrationForm.firstName}
                    onChange={(event) => props.onRegistrationChange({ ...props.registrationForm, firstName: event.target.value })}
                    autoFocus
                  />
                </label>
                <label>
                  <span>Last Name</span>
                  <input
                    value={props.registrationForm.lastName}
                    onChange={(event) => props.onRegistrationChange({ ...props.registrationForm, lastName: event.target.value })}
                  />
                </label>
              </div>
              <label>
                <span>Email</span>
                <input value={props.email} readOnly />
              </label>
              <label>
                <span>Date of Birth</span>
                <input
                  type="date"
                  value={props.registrationForm.dob}
                  max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
                  onChange={(event) => props.onRegistrationChange({ ...props.registrationForm, dob: event.target.value })}
                />
              </label>
              <label>
                <span>Organization Type</span>
                <select
                  value={props.registrationForm.organizationType}
                  onChange={(event) => props.onRegistrationChange({
                    ...props.registrationForm,
                    organizationType: event.target.value as RegistrationFormState['organizationType'],
                    organization: event.target.value === 'business' ? props.registrationForm.organization : '',
                  })}
                >
                  <option value="">Select organization type</option>
                  <option value="individual">Individual</option>
                  <option value="business">Business</option>
                </select>
              </label>
              {props.registrationForm.organizationType === 'business' ? (
                <label>
                  <span>Organization Name</span>
                  <input
                    value={props.registrationForm.organization}
                    onChange={(event) => props.onRegistrationChange({ ...props.registrationForm, organization: event.target.value })}
                  />
                </label>
              ) : null}
              <label>
                <span>Designation</span>
                <select
                  value={props.registrationForm.designation}
                  onChange={(event) => props.onRegistrationChange({ ...props.registrationForm, designation: event.target.value as RegistrationFormState['designation'] })}
                >
                  <option value="">Select your designation</option>
                  <option value="developer">Developer</option>
                  <option value="founder_ceo_cto">Founder/CEO/CTO</option>
                  <option value="manager">Manager</option>
                  <option value="student">Student</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="auth-consent-row">
                <input
                  type="checkbox"
                  checked={props.registrationForm.acceptedTerms}
                  onChange={(event) => props.onRegistrationChange({ ...props.registrationForm, acceptedTerms: event.target.checked })}
                />
                <span>
                  I agree to the <a href="https://oneinfer.ai/terms-and-conditions" target="_blank" rel="noopener noreferrer">Terms</a> and <a href="https://oneinfer.ai/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
                </span>
              </label>
              <button className="secondary-button auth-enter-button" type="submit" disabled={props.busy === 'registration'}>
                {props.busy === 'registration' ? <LoaderCircle className="spin" size={16} /> : <UserPlus size={16} />}
                Complete Registration
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
