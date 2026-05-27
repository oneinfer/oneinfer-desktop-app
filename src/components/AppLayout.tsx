import { Fragment, useEffect, useState } from 'react';
import { ChevronDown, LogOut, Menu, RefreshCw, Server, X } from 'lucide-react';

import oneInferLogo from '../assets/oneinfer-logo.png';
import { sections } from '../constants';
import type { DashboardState, SectionKey } from '../types';

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
  const hostingSectionKeys: SectionKey[] = ['selfHosting', 'instances', 'routing'];
  const hostingSections = sections.filter((section) => hostingSectionKeys.includes(section.key));
  const topLevelSections = sections.filter((section) => !hostingSectionKeys.includes(section.key));
  const hostingActive = hostingSectionKeys.includes(props.activeSection);
  const [hostingOpen, setHostingOpen] = useState(hostingActive);

  useEffect(() => {
    if (hostingActive) {
      setHostingOpen(true);
    }
  }, [hostingActive]);

  return (
    <div className="shell app-shell">
      <header className="mobile-header glass-panel">
        <BrandLockup />
        <button className="ghost-button" type="button" onClick={() => props.onSidebarOpen(true)}>
          <Menu size={20} />
        </button>
      </header>

      <div className={`sidebar-overlay${props.sidebarOpen ? ' active' : ''}`} onClick={() => props.onSidebarOpen(false)} />

      <aside className={`sidebar-container glass-panel${props.sidebarOpen ? ' open' : ''}`} style={{ minWidth: 0 }}>
        <div className="sidebar">
          <button className="ghost-button sidebar-close" type="button" onClick={() => props.onSidebarOpen(false)}>
            <X size={18} />
            Close
          </button>

          <BrandLockup />

          <nav className="nav-stack">
            {topLevelSections.map((section, index) => {
              const Icon = section.icon;
              if (index === 1) {
                return (
                  <Fragment key="model-hosting-group">
                    <div className="nav-group" key="model-hosting">
                      <button
                        className={`nav-button nav-group-toggle ${hostingActive ? 'active' : ''}`}
                        onClick={() => setHostingOpen((current) => !current)}
                        type="button"
                        aria-expanded={hostingOpen}
                      >
                        <Server size={18} />
                        <span>Model Hosting</span>
                        <ChevronDown className={`nav-chevron${hostingOpen ? ' open' : ''}`} size={16} />
                      </button>
                      {hostingOpen ? (
                        <div className="nav-substack">
                          {hostingSections.map((hostingSection) => {
                            const HostingIcon = hostingSection.icon;
                            return (
                              <button
                                key={hostingSection.key}
                                className={`nav-button nav-subbutton ${props.activeSection === hostingSection.key ? 'active' : ''}`}
                                onClick={() => {
                                  props.onSectionChange(hostingSection.key);
                                  props.onSidebarOpen(false);
                                }}
                                type="button"
                              >
                                <HostingIcon size={16} />
                                {hostingSection.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
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
                  </Fragment>
                );
              }

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

      <div className="content-stage">
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
