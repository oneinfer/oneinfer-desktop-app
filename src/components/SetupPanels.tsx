import { Blocks, Bot, LoaderCircle, Orbit, Sparkles } from 'lucide-react';

export function ClaudeCodeSetupPanel(props: {
  provider: 'oneinfer' | 'anthropic';
  onSetProvider: (p: 'oneinfer' | 'anthropic') => void;
  busy: string | null;
}) {
  const isOneinfer = props.provider === 'oneinfer';
  const busyConfig = props.busy === 'configure-claude-code';

  return (
    <section className={`content-panel glass-panel cc-widget cc-widget--${props.provider}`}>
      <div className="panel-header">
        <div className="panel-title">
          <Bot size={18} />
          <h3>Claude Code Setup</h3>
        </div>
      </div>

      <div className="settings-list">
        <button
          className={`settings-list-item${isOneinfer ? ' active' : ''}`}
          type="button"
          onClick={() => props.onSetProvider('oneinfer')}
          disabled={busyConfig}
        >
          <span className="settings-list-icon">
            {busyConfig && isOneinfer ? <LoaderCircle className="spin" size={16} /> : <Orbit size={16} />}
          </span>
          <span className="settings-list-copy">
            <strong>OneInfer API</strong>
            <span>Route Claude Code through your OneInfer workspace.</span>
          </span>
          <span className="settings-list-status">{isOneinfer ? 'Selected' : 'Use'}</span>
        </button>
        <button
          className={`settings-list-item${!isOneinfer ? ' active' : ''}`}
          type="button"
          onClick={() => props.onSetProvider('anthropic')}
          disabled={busyConfig}
        >
          <span className="settings-list-icon">
            {busyConfig && !isOneinfer ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
          </span>
          <span className="settings-list-copy">
            <strong>Anthropic API</strong>
            <span>Use your configured Anthropic credentials directly.</span>
          </span>
          <span className="settings-list-status">{!isOneinfer ? 'Selected' : 'Use'}</span>
        </button>
      </div>
    </section>
  );
}

export function OpenCodeSetupPanel(props: {
  busy: string | null;
  onEnable: () => void;
}) {
  const busyConfig = props.busy === 'configure-opencode';

  return (
    <section className="content-panel glass-panel">
      <div className="panel-header">
        <div className="panel-title">
          <Blocks size={18} />
          <h3>OpenCode Setup</h3>
        </div>
      </div>

      <div className="settings-list">
        <button className="settings-list-item" type="button" onClick={props.onEnable} disabled={busyConfig}>
          <span className="settings-list-icon">
            {busyConfig ? <LoaderCircle className="spin" size={16} /> : <Blocks size={16} />}
          </span>
          <span className="settings-list-copy">
            <strong>Enable OpenCode Globally</strong>
            <span>Install OpenCode if needed and write a OneInfer-backed user config.</span>
          </span>
          <span className="settings-list-status">Enable</span>
        </button>
      </div>
    </section>
  );
}

export function KiloCodeSetupPanel(props: {
  busy: string | null;
  onEnable: () => void;
}) {
  const busyConfig = props.busy === 'configure-kilocode';

  return (
    <section className="content-panel glass-panel">
      <div className="panel-header">
        <div className="panel-title">
          <Blocks size={18} />
          <h3>Kilo Code Setup</h3>
        </div>
      </div>

      <div className="stack-form">
        <div className="form-hint">
          Install Kilo Code automatically if it is missing, then write a global OneInfer-backed
          configuration for this user account.
        </div>
        <button className="primary-button" type="button" onClick={props.onEnable} disabled={busyConfig}>
          {busyConfig ? <LoaderCircle className="spin" size={16} /> : <Blocks size={16} />}
          Enable Kilo Code Globally
        </button>
      </div>
    </section>
  );
}

export function OpenClawSetupPanel(props: {
  busy: string | null;
  onEnable: () => void;
}) {
  const busyConfig = props.busy === 'configure-openclaw';

  return (
    <section className="content-panel glass-panel">
      <div className="panel-header">
        <div className="panel-title">
          <Blocks size={18} />
          <h3>OpenClaw Setup</h3>
        </div>
      </div>

      <div className="settings-list">
        <button className="settings-list-item" type="button" onClick={props.onEnable} disabled={busyConfig}>
          <span className="settings-list-icon">
            {busyConfig ? <LoaderCircle className="spin" size={16} /> : <Blocks size={16} />}
          </span>
          <span className="settings-list-copy">
            <strong>Enable OpenClaw Globally</strong>
            <span>Install OpenClaw if needed and write a OneInfer-backed user config.</span>
          </span>
          <span className="settings-list-status">Enable</span>
        </button>
      </div>
    </section>
  );
}
