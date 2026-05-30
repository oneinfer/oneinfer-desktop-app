import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { BookOpen, Copy, LoaderCircle, Play, Send } from 'lucide-react';

import { Modal } from './Common';
import type { DesktopSession } from '../types';

const ONEINFER_CHAT_COMPLETIONS_DOCS_URL = 'https://oneinfer.ai/console/docs?tab=api&section=chat-completions';

export interface EndpointUsageTarget {
  endpointId: string;
  endpointUrl: string;
  modelId: string;
  name: string;
  source: 'local' | 'cloud';
}

export function EndpointUsageModal(props: {
  target: EndpointUsageTarget | null;
  session: DesktopSession;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [prompt, setPrompt] = useState('Say hello from OneInfer Desktop.');
  const [maxTokens, setMaxTokens] = useState(128);
  const [temperature, setTemperature] = useState(0.7);
  const [busy, setBusy] = useState(false);
  const [responseText, setResponseText] = useState('');

  useEffect(() => {
    setResponseText('');
  }, [props.target?.endpointId, props.target?.endpointUrl]);

  const chatCompletionsUrl = useMemo(
    () => props.target ? getChatCompletionsUrl(props.target.endpointUrl) : '',
    [props.target],
  );
  const requestBody = useMemo(() => ({
    model: props.target?.modelId ?? '',
    messages: [{ role: 'user', content: prompt }],
    temperature,
    max_tokens: maxTokens,
  }), [maxTokens, prompt, props.target?.modelId, temperature]);
  const curlCommand = useMemo(() => {
    if (!props.target) {
      return '';
    }

    return [
      `curl ${JSON.stringify(chatCompletionsUrl)} \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -H "Authorization: Bearer $ONEINFER_API_KEY" \\`,
      `  -d '${JSON.stringify(requestBody, null, 2)}'`,
    ].join('\n');
  }, [chatCompletionsUrl, props.target, requestBody]);

  if (!props.target) {
    return null;
  }

  async function handleTryNow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!props.target) {
      return;
    }

    setBusy(true);
    setResponseText('');
    try {
      const response = await fetch(chatCompletionsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${props.session.accessToken}`,
        },
        body: JSON.stringify(requestBody),
      });
      const rawText = await response.text();
      let payload: unknown = rawText;
      try {
        payload = JSON.parse(rawText);
      } catch {}

      if (!response.ok) {
        const message = getErrorMessage(payload, response.statusText);
        throw new Error(`${message} (HTTP ${response.status})`);
      }

      setResponseText(typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Try Now request failed.';
      setResponseText(message);
      props.onError(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenDocs() {
    try {
      if (window.desktopBridge?.openExternalUrl) {
        await window.desktopBridge.openExternalUrl({ url: ONEINFER_CHAT_COMPLETIONS_DOCS_URL });
        return;
      }

      window.open(ONEINFER_CHAT_COMPLETIONS_DOCS_URL, '_blank', 'noopener,noreferrer');
    } catch (error) {
      props.onError(error instanceof Error ? error.message : 'Failed to open API docs.');
    }
  }

  return (
    <Modal title={`Usage: ${props.target.name}`} isOpen={Boolean(props.target)} onClose={props.onClose}>
      <form className="endpoint-usage-modal" onSubmit={handleTryNow}>
        <div className="endpoint-usage-summary">
          <div>
            <span>{props.target.source === 'local' ? 'Self-hosted model' : 'Cloud-hosted model'}</span>
            <strong>{props.target.modelId}</strong>
            <code>{chatCompletionsUrl}</code>
          </div>
          <button className="ghost-button" type="button" onClick={handleOpenDocs}>
            <BookOpen size={14} />
            Docs
          </button>
        </div>

        <div className="endpoint-usage-section">
          <div className="endpoint-usage-section-header">
            <strong>Request</strong>
            <button className="ghost-button" type="button" onClick={() => navigator.clipboard?.writeText(curlCommand)}>
              <Copy size={14} />
              Copy cURL
            </button>
          </div>
          <pre className="endpoint-usage-code">{curlCommand}</pre>
        </div>

        <div className="endpoint-usage-grid">
          <label>
            <span>Prompt</span>
            <textarea value={prompt} rows={4} onChange={(event) => setPrompt(event.target.value)} />
          </label>
          <div className="endpoint-usage-controls">
            <label>
              <span>Max tokens</span>
              <input min={1} max={4096} type="number" value={maxTokens} onChange={(event) => setMaxTokens(Number(event.target.value) || 1)} />
            </label>
            <label>
              <span>Temperature</span>
              <input min={0} max={2} step={0.1} type="number" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} />
            </label>
          </div>
        </div>

        <div className="endpoint-usage-actions">
          <button className="primary-button" type="submit" disabled={busy || !prompt.trim()}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />}
            Try now
          </button>
          <button className="ghost-button" type="button" onClick={() => navigator.clipboard?.writeText(JSON.stringify(requestBody, null, 2))}>
            <Send size={14} />
            Copy JSON
          </button>
        </div>

        {responseText ? (
          <div className="endpoint-usage-section">
            <strong>Response</strong>
            <pre className="endpoint-usage-code endpoint-usage-response">{responseText}</pre>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

function getChatCompletionsUrl(endpointUrl: string): string {
  const trimmedUrl = endpointUrl.trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(trimmedUrl)) {
    return trimmedUrl;
  }

  return `${trimmedUrl}/chat/completions`;
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string') {
    return payload || fallback;
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const error = record.error;
    if (error && typeof error === 'object') {
      const typedError = error as Record<string, unknown>;
      return String(typedError.message ?? typedError.error_description ?? fallback);
    }

    return String(record.message ?? record.detail ?? fallback);
  }

  return fallback;
}
