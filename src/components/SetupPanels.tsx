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

      <div className="cc-toggle">
        <button
          className={`cc-toggle-btn${isOneinfer ? ' active' : ''}`}
          type="button"
          onClick={() => props.onSetProvider('oneinfer')}
          disabled={busyConfig}
        >
          {busyConfig && isOneinfer ? <LoaderCircle className="spin" size={14} /> : <Orbit size={14} />}
          OneInfer API
        </button>
        <button
          className={`cc-toggle-btn${!isOneinfer ? ' active' : ''}`}
          type="button"
          onClick={() => props.onSetProvider('anthropic')}
          disabled={busyConfig}
        >
          {busyConfig && !isOneinfer ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />}
          Anthropic API
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

      <div className="stack-form">
        <div className="form-hint">
          Install OpenCode automatically if it is missing, then write a global OneInfer-backed
          configuration for this user account.
        </div>
        <button className="primary-button" type="button" onClick={props.onEnable} disabled={busyConfig}>
          {busyConfig ? <LoaderCircle className="spin" size={16} /> : <Blocks size={16} />}
          Enable OpenCode Globally
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

      <div className="stack-form">
        <div className="form-hint">
          Install OpenClaw automatically if it is missing, then write a global OneInfer-backed
          configuration for this user account.
        </div>
        <button className="primary-button" type="button" onClick={props.onEnable} disabled={busyConfig}>
          {busyConfig ? <LoaderCircle className="spin" size={16} /> : <Blocks size={16} />}
          Enable OpenClaw Globally
        </button>
      </div>
    </section>
  );
}
