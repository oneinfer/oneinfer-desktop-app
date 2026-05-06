import type { FormEvent } from 'react';
import { LoaderCircle } from 'lucide-react';

import { Modal } from '../components/Common';
import type { DashboardState } from '../types';
import { formatValue } from '../utils/format';

export function ApiKeysPage(props: {
  dashboard: DashboardState;
  apiKeyName: string;
  busy: string | null;
  showCreateKeyModal: boolean;
  onApiKeyNameChange: (value: string) => void;
  onModalChange: (open: boolean) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onDelete: (name: string) => void;
}) {
  return (
    <div className="flex flex-col">
      <header className="mb-0.5 flex h-8 shrink-0 items-center justify-between">
        <h2 className="m-0 text-lg font-semibold leading-none">API Keys</h2>
        <button className="primary-button !h-7 !rounded-[0.625rem] !px-3 !py-0 !text-[0.8rem] !leading-none" onClick={() => props.onModalChange(true)} type="button">
          Create New API Key
        </button>
      </header>

      <div className="glass-panel mb-5 mt-4 flex shrink-0 flex-wrap items-center gap-4 rounded-[0.875rem] px-5 py-3">
        <div className="relative min-w-0 flex-1">
          <input className="h-11 w-full rounded-[0.5rem] border border-white/[0.06] bg-black/20 px-4 py-0 text-[0.9rem] text-[var(--text)] placeholder:text-[var(--muted)]" placeholder="Search API keys..." />
        </div>
        <label className="flex h-11 shrink-0 items-center gap-2 whitespace-nowrap text-[0.85rem] text-[var(--muted)]">
          <input className="accent-[var(--accent)]" type="checkbox" />
          Show inactive keys
        </label>
      </div>

      <div className="glass-panel w-full overflow-hidden">
        {props.dashboard.apiKeys.length === 0 ? (
          <div className="p-10 text-center">
            <p className="mb-5 text-base text-[var(--muted)]">No API keys found. Create a new key to get started.</p>
            <button className="primary-button mx-auto" onClick={() => props.onModalChange(true)} type="button">
              Create New API Key
            </button>
          </div>
        ) : (
          <div className="table-shell">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Name', 'API Key (Prefix)', 'Created', 'Last Used', 'Status', 'Actions'].map((heading) => (
                    <th key={heading} className={`px-4 py-3 text-[0.7rem] uppercase tracking-[0.05em] text-[var(--muted)] ${heading === 'Actions' ? 'text-right' : 'text-left'}`}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {props.dashboard.apiKeys.map((apiKey, index) => {
                  const name = String(apiKey.api_key_name ?? apiKey.id ?? `key-${index}`);
                  const prefix = String(apiKey.prefix ?? apiKey.api_key_prefix ?? '-');
                  const lastUsed = apiKey.last_used ?? apiKey.last_used_at;
                  return (
                    <tr key={name} className="border-t border-white/[0.04]">
                      <td className="px-4 py-6 font-semibold">{name}</td>
                      <td className="px-4 py-6 font-mono text-[var(--accent)]">{prefix && prefix !== 'null' ? prefix : '-'}</td>
                      <td className="px-4 py-6 text-[0.85rem]">{apiKey.created_at ? new Date(apiKey.created_at).toLocaleDateString() : '-'}</td>
                      <td className="px-4 py-6 text-[0.85rem] text-[var(--muted)]">{lastUsed ? formatValue(lastUsed) : 'Never used'}</td>
                      <td className="px-4 py-6"><span className="status-pill active">Active</span></td>
                      <td className="px-4 py-6 text-right">
                        <button className="ghost-button !border-0 !bg-transparent !px-2 !py-1 !text-[0.8rem] !text-[#818cf8]" onClick={() => props.onDelete(name)} type="button">
                          Deactivate
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal title="Create New API Key" isOpen={props.showCreateKeyModal} onClose={() => props.onModalChange(false)}>
        <form className="stack-form" onSubmit={async (event) => { await props.onCreate(event); props.onModalChange(false); }}>
          <label>
            <span className="mb-2 block text-[0.85rem] text-[var(--muted)]">API Key Name</span>
            <input className="rounded-xl border border-white/10 bg-black/20 p-3" value={props.apiKeyName} onChange={(event) => props.onApiKeyNameChange(event.target.value)} placeholder="e.g. Production API Key" autoFocus />
            <div className="mt-2 text-xs text-[var(--muted)] opacity-80">
              Give your API key a name to help you identify what it's used for.
            </div>
          </label>
          <div className="mt-6 flex justify-end gap-3">
            <button className="secondary-button" type="button" onClick={() => props.onModalChange(false)}>Cancel</button>
            <button className="primary-button !bg-[var(--accent)] !font-bold !text-[#081018]" type="submit" disabled={props.busy === 'create-key'}>
              {props.busy === 'create-key' ? <LoaderCircle className="spin" size="1rem" /> : null}
              Create API Key
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
