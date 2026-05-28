import React from 'react';
import { Rocket, Sparkles, X } from 'lucide-react';

import { formatValue } from '../utils/format';

export function Panel(props: { title: string; icon: typeof Sparkles; children: React.ReactNode; className?: string; description?: string; style?: React.CSSProperties }) {
  const Icon = props.icon;
  return (
    <section className={`content-panel glass-panel ${props.className || ''}`} style={props.style}>
      <div className="panel-header">
        <div className="panel-title">
          <Icon size={18} />
          <div>
            <h3>{props.title}</h3>
            {props.description ? <p className="panel-description">{props.description}</p> : null}
          </div>
        </div>
      </div>
      {props.children}
    </section>
  );
}

export function Banner(props: { tone: 'info' | 'success' | 'error'; text: string }) {
  return <div className={`banner ${props.tone}`}>{props.text}</div>;
}

export function DataList(props: { entries: Array<[string, unknown]>; emptyText: string }) {
  if (props.entries.length === 0) {
    return <EmptyState text={props.emptyText} />;
  }

  return (
    <div className="data-list">
      {props.entries.map(([label, value]) => (
        <div className="data-row" key={label}>
          <span>{label}</span>
          <strong>{formatValue(value)}</strong>
        </div>
      ))}
    </div>
  );
}

export function MiniTable(props: { columns: string[]; rows: Array<Record<string, unknown>>; emptyText: string }) {
  if (props.rows.length === 0) {
    return <EmptyState text={props.emptyText} />;
  }

  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            {props.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, index) => (
            <tr key={`${index}-${props.columns.map((column) => formatValue(row[column])).join('-')}`}>
              {props.columns.map((column) => (
                <td key={column}>{formatValue(row[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState(props: { text: string }) {
  return <div className="empty-state">{props.text}</div>;
}

export function HeroChip(props: { icon: typeof Rocket; title: string; text: string }) {
  const Icon = props.icon;
  return (
    <div className="hero-chip">
      <Icon size={18} />
      <div>
        <strong>{props.title}</strong>
        <p>{props.text}</p>
      </div>
    </div>
  );
}

export function Modal(props: { title: string; isOpen: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!props.isOpen) return null;

  return (
    <div className="modal-overlay" onClick={props.onClose}>
      <div className="modal-content glass-panel" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>{props.title}</h3>
          <button className="ghost-button" onClick={props.onClose} style={{ padding: '8px' }} type="button">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{props.children}</div>
      </div>
    </div>
  );
}
