import { LogOut, Menu, RefreshCw, ShieldCheck, X } from 'lucide-react';

import oneInferLogo from '../assets/oneinfer-logo.png';
import { sections } from '../constants';
import type { DashboardState, SectionKey } from '../types';
import { getBalance } from '../utils/format';

export function AppLayout(props: {
  appVersion: string;
  activeSection: SectionKey;
  dashboard: DashboardState;
  sidebarOpen: boolean;
  onSidebarOpen: (open: boolean) => void;
  onSectionChange: (section: SectionKey) => void;
  onRefresh: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="shell app-shell">
      <header className="mobile-header glass-panel">
        <BrandLockup />
        <button className="ghost-button" type="button" onClick={() => props.onSidebarOpen(true)}>
          <Menu size={20} />
        </button>
      </header>

      <div className={`sidebar-overlay${props.sidebarOpen ? ' active' : ''}`} onClick={() => props.onSidebarOpen(false)} />

      <aside className={`sidebar-container glass-panel${props.sidebarOpen ? ' open' : ''}`} style={{ width: '360px', flexShrink: 0 }}>
        <div className="sidebar">
          <button className="ghost-button sidebar-close" type="button" onClick={() => props.onSidebarOpen(false)}>
            <X size={18} />
            Close
          </button>

          <BrandLockup />

          <div className="developer-pill" style={{ background: 'rgba(116, 227, 197, 0.08)', borderColor: 'rgba(116, 227, 197, 0.2)', padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={18} style={{ color: 'var(--accent)' }} />
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>Available Balance</div>
                <strong style={{ color: 'var(--accent)', fontSize: '1.15rem', fontWeight: 800 }}>{getBalance(props.dashboard.credits)}</strong>
              </div>
            </div>
          </div>

          <nav className="nav-stack">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.key}
                  className={`nav-button ${props.activeSection === section.key ? 'active' : ''}`}
                  onClick={() => {
                    props.onSectionChange(section.key);
                    props.onSidebarOpen(false);
                  }}
                  type="button"
                >
                  <Icon size={18} />
                  {section.label}
                </button>
              );
            })}
          </nav>

          <div className="sidebar-footer">
            <div className="version-text">Version {props.appVersion || 'dev'}</div>
            <button className="ghost-button" onClick={props.onRefresh} type="button">
              <RefreshCw size={16} />
              Refresh
            </button>
            <button className="ghost-button" onClick={props.onLogout} type="button">
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </div>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {props.children}
      </div>
    </div>
  );
}

function BrandLockup() {
  return (
    <div className="brand-lockup">
      <div className="brand-icon">
        <img src={oneInferLogo} alt="OneInfer logo" className="brand-image" />
      </div>
      <div>
        <h1 style={{ fontSize: '1.4rem' }}>OneInfer</h1>
      </div>
    </div>
  );
}
