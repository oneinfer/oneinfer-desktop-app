import { Fragment, useEffect, useState } from 'react';
import { ChevronDown, GitPullRequest, LogOut, Menu, Plus, RefreshCw, Server, Settings, UserRound, X, Bell, Trash2, CheckCheck } from 'lucide-react';

import oneInferLogo from '../assets/oneinfer-logo.png';
import { sections } from '../constants';
import type { DashboardState, SectionKey, Notification } from '../types';
import { getBalance } from '../utils/format';

export function AppLayout(props: {
  appVersion: string;
  activeSection: SectionKey;
  dashboard: DashboardState;
  sidebarOpen: boolean;
  onSidebarOpen: (open: boolean) => void;
  onSectionChange: (section: SectionKey) => void;
  onAddCredits: () => void;
  onRefresh: () => void;
  onGitPull?: () => void;
  onLogout: () => void;
  notifications: Notification[];
  onMarkAllRead: () => void;
  onClearAll: () => void;
  onToggleRead: (id: string) => void;
  onDeleteNotification: (id: string) => void;
  children: React.ReactNode;
}) {
  const hostingSectionKeys: SectionKey[] = ['selfHosting', 'instances', 'routing'];
  const hostingSections = sections.filter((section) => hostingSectionKeys.includes(section.key));
  const topLevelSections = sections.filter((section) => !hostingSectionKeys.includes(section.key));
  const hostingActive = hostingSectionKeys.includes(props.activeSection);
  const [hostingOpen, setHostingOpen] = useState(hostingActive);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const accountName = getSidebarAccountName(props.dashboard);
  const unreadCount = props.notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (hostingActive) {
      setHostingOpen(true);
    }
  }, [hostingActive]);

  return (
    <div className="shell app-shell">
      {showNotifications && (
        <div className="notifications-popover glass-panel">
          <div className="notifications-header">
            <h3>Notifications</h3>
            <div className="notifications-header-actions">
              {props.notifications.length > 0 && (
                <>
                  <button className="notif-action-btn" onClick={props.onMarkAllRead}>
                    <CheckCheck size={13} />
                    <span>Mark all read</span>
                  </button>
                  <button className="notif-action-btn danger" onClick={props.onClearAll}>
                    <Trash2 size={13} />
                    <span>Clear all</span>
                  </button>
                </>
              )}
              <button className="notif-close-btn" onClick={() => setShowNotifications(false)}>
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="notifications-list">
            {props.notifications.length === 0 ? (
              <div className="notifications-empty">
                <Bell size={24} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <span>No new notifications</span>
              </div>
            ) : (
              props.notifications.map((notif) => (
                <div key={notif.id} className={`notification-item ${notif.type} ${notif.read ? 'read' : 'unread'}`} onClick={() => props.onToggleRead(notif.id)}>
                  <div className="notification-item-icon">
                    <span className={`notification-dot ${notif.type}`} />
                  </div>
                  <div className="notification-item-content">
                    <div className="notification-item-title-row">
                      <strong>{notif.title}</strong>
                      <span className="notification-time">{notif.timestamp}</span>
                    </div>
                    <p>{notif.message}</p>
                  </div>
                  <button className="notification-item-delete" onClick={(e) => { e.stopPropagation(); props.onDeleteNotification(notif.id); }}>
                    <X size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <header className="mobile-header glass-panel">
        <BrandLockup />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className={`notifications-bell-btn${showNotifications ? ' active' : ''}`}
            type="button"
            onClick={() => setShowNotifications((prev) => !prev)}
            aria-label="Toggle notifications"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="notifications-badge">{unreadCount}</span>
            )}
          </button>
          <button className="ghost-button" type="button" onClick={() => props.onSidebarOpen(true)}>
            <Menu size={20} />
          </button>
        </div>
      </header>

      <div className={`sidebar-overlay${props.sidebarOpen ? ' active' : ''}`} onClick={() => props.onSidebarOpen(false)} />

      <aside className={`sidebar-container glass-panel${props.sidebarOpen ? ' open' : ''}`} style={{ minWidth: 0 }}>
        <div className="sidebar">
          <button className="ghost-button sidebar-close" type="button" onClick={() => props.onSidebarOpen(false)}>
            <X size={18} />
            Close
          </button>

          <div className="sidebar-header-row">
            <BrandLockup />
            <button
              className={`notifications-bell-btn${showNotifications ? ' active' : ''}`}
              type="button"
              onClick={() => setShowNotifications((prev) => !prev)}
              aria-label="Toggle notifications"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="notifications-badge">{unreadCount}</span>
              )}
            </button>
          </div>

          <nav className="nav-stack">
            <div className="sidebar-credit-panel">
              <div>
                <span>Available Credits</span>
                <strong>{getBalance(props.dashboard.credits)}</strong>
              </div>
              <button
                className="sidebar-credit-action"
                type="button"
                onClick={props.onAddCredits}
              >
                <Plus size={13} />
                Add credits
              </button>
            </div>
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
            <div className="sidebar-account">
              {accountMenuOpen ? (
                <div className="sidebar-account-menu">
                  <button
                    className="sidebar-account-menu-item"
                    type="button"
                    onClick={() => {
                      props.onSectionChange('settings');
                      props.onSidebarOpen(false);
                      setAccountMenuOpen(false);
                    }}
                  >
                    <Settings size={18} />
                    Settings
                  </button>
                  {props.onGitPull ? (
                    <button
                      className="sidebar-account-menu-item"
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        props.onGitPull?.();
                      }}
                    >
                      <GitPullRequest size={18} />
                      Update
                    </button>
                  ) : null}
                  <button
                    className="sidebar-account-menu-item danger"
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      props.onLogout();
                    }}
                  >
                    <LogOut size={18} />
                    Logout
                  </button>
                </div>
              ) : null}
              <button
                className={`sidebar-account-trigger${accountMenuOpen ? ' active' : ''}`}
                type="button"
                aria-expanded={accountMenuOpen}
                onClick={() => setAccountMenuOpen((current) => !current)}
              >
                <UserRound size={22} />
                <span>{accountName}</span>
                <ChevronDown size={18} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="content-stage">
        {props.children}
      </div>
    </div>
  );
}

function getSidebarAccountName(dashboard: DashboardState): string {
  const rawProfile = (dashboard.profile?.developer || dashboard.profile || {}) as Record<string, unknown>;
  const profileName = [
    rawProfile.first_name,
    rawProfile.firstName,
    rawProfile.name,
    rawProfile.full_name,
    rawProfile.fullName,
    rawProfile.email,
  ].find((value) => typeof value === 'string' && value.trim().length > 0);
  const candidateName = String(profileName || 'Account').trim();
  return candidateName.split(/[\s._-]+/).find(Boolean) || 'Account';
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
