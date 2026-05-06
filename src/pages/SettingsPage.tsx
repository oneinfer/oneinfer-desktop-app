import { Bell, Edit, Save, ShieldCheck } from 'lucide-react';

import type { DashboardState, DesktopSession } from '../types';

export type SettingsTab = 'account' | 'security' | 'notifications';

export function SettingsPage(props: {
  dashboard: DashboardState;
  session: DesktopSession;
  settingsTab: SettingsTab;
  onSettingsTabChange: (tab: SettingsTab) => void;
}) {
  return (
    <div className="settings-modern-layout">
      <div className="settings-nav-tabs">
        <button className={`settings-tab-btn ${props.settingsTab === 'account' ? 'active' : ''}`} onClick={() => props.onSettingsTabChange('account')} type="button">
          Profile
        </button>
        <button className={`settings-tab-btn ${props.settingsTab === 'security' ? 'active' : ''}`} onClick={() => props.onSettingsTabChange('security')} type="button">
          Security
        </button>
        <button className={`settings-tab-btn ${props.settingsTab === 'notifications' ? 'active' : ''}`} onClick={() => props.onSettingsTabChange('notifications')} type="button">
          Notifications
        </button>
      </div>

      <div className="settings-main-card glass-panel">
        {props.settingsTab === 'account' ? <AccountSettings dashboard={props.dashboard} session={props.session} /> : null}
        {props.settingsTab === 'security' ? <SecuritySettings /> : null}
        {props.settingsTab === 'notifications' ? <NotificationSettings /> : null}
      </div>
    </div>
  );
}

function AccountSettings(props: { dashboard: DashboardState; session: DesktopSession }) {
  const rawProfile = (props.dashboard.profile?.developer || props.dashboard.profile) as any;

  return (
    <>
      <div className="settings-card-header">
        <div>
          <h2 style={{ fontSize: '1.8rem', margin: 0 }}>Profile Settings</h2>
          <p style={{ color: 'var(--muted)', margin: '4px 0 0 0' }}>Manage your personal information and account details</p>
        </div>
        <button className="primary-button ghost" style={{ borderRadius: '8px', border: '1px solid var(--accent)', color: 'var(--accent)', background: 'transparent' }} type="button">
          <Edit size={14} /> Edit Profile
        </button>
      </div>

      <div className="profile-settings-grid">
        <ProfileField label="First Name" value={rawProfile?.first_name || 'Arunkumar'} />
        <ProfileField label="Last Name" value={rawProfile?.last_name || 'soundararajan'} />
        <ProfileField label="Email Address" value={rawProfile?.email || 'sarunkumar1990@gmail.com'} fullWidth />
        <ProfileField label="Organization" value={rawProfile?.organization || 'testingorg'} />
        <ProfileField label="Organization Type" value={rawProfile?.organization_type || 'individual'} />
        <ProfileField label="Designation" value={rawProfile?.designation || 'developer'} />
        <ProfileField label="Date of Birth" value={rawProfile?.dob || 'Not provided'} />

        <div className="form-group full-width" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
          <label style={{ marginBottom: '8px' }}>Developer ID</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input value={String(props.dashboard.profile?.developer_id || props.session.developerId)} readOnly style={{ flex: 1, border: 'none', background: 'transparent', padding: 0, fontSize: '0.9rem', color: 'var(--text)' }} />
            <button className="ghost-button" style={{ fontSize: '0.7rem' }} type="button">Copy</button>
          </div>
          <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>This ID cannot be changed</p>
        </div>
      </div>
    </>
  );
}

function ProfileField(props: { label: string; value: string; fullWidth?: boolean }) {
  return (
    <div className={`form-group${props.fullWidth ? ' full-width' : ''}`}>
      <label>{props.label}</label>
      <input value={props.value} readOnly />
    </div>
  );
}

function SecuritySettings() {
  return (
    <>
      <div className="settings-card-header">
        <div>
          <h2 style={{ fontSize: '1.8rem', margin: 0 }}>Security Settings</h2>
          <p style={{ color: 'var(--muted)', margin: '4px 0 0 0' }}>Manage your account security and authentication</p>
        </div>
      </div>

      <div className="security-stack">
        <div className="status-card info" style={{ background: 'rgba(37, 99, 235, 0.05)', border: '1px solid rgba(37, 99, 235, 0.1)' }}>
          <div className="status-card-icon" style={{ background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb' }}>
            <ShieldCheck size={20} />
          </div>
          <div className="status-card-content">
            <h4 style={{ color: '#2563eb', marginBottom: '8px' }}>OTP-Based Authentication</h4>
            <p style={{ fontSize: '0.95rem', opacity: 0.8, lineHeight: 1.5 }}>Your account is secured with OTP (One-Time Password) authentication. No password is required for login.</p>
            <div className="how-it-works" style={{ marginTop: '16px', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
              <p style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '12px' }}>How it works:</p>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem', color: 'var(--muted)', listStyle: 'disc' }}>
                <li style={{ marginBottom: '8px' }}>Enter your email address to login</li>
                <li style={{ marginBottom: '8px' }}>Receive a secure OTP code via email</li>
                <li style={{ marginBottom: '8px' }}>Enter the OTP to access your account</li>
                <li>No password needed - more secure and convenient</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="status-card success" style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.1)', marginTop: '24px' }}>
          <div className="status-card-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            <Bell size={20} />
          </div>
          <div className="status-card-content">
            <h4 style={{ color: '#10b981', marginBottom: '8px' }}>Security Notifications</h4>
            <p style={{ fontSize: '0.95rem', opacity: 0.8 }}>Get notified about important security events on your account</p>
            <div className="checkbox-group" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label className="checkbox-label"><input type="checkbox" defaultChecked /><span>Email me when someone logs into my account</span></label>
              <label className="checkbox-label"><input type="checkbox" defaultChecked /><span>Email me about API key changes</span></label>
              <label className="checkbox-label"><input type="checkbox" defaultChecked /><span>Email me about billing changes</span></label>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function NotificationSettings() {
  const prefs = [
    { title: 'Credit Balance Alerts', desc: 'Get notified when your credit balance is low', checked: true },
    { title: 'Service Updates', desc: 'Get notified about new features and service updates', checked: true },
    { title: 'Weekly Usage Reports', desc: 'Get a weekly summary of your API usage', checked: false },
    { title: 'Marketing Communications', desc: 'Receive updates about new models and promotional offers', checked: false },
  ];

  return (
    <>
      <div className="settings-card-header">
        <div>
          <h2 style={{ fontSize: '1.8rem', margin: 0 }}>Notification Preferences</h2>
          <p style={{ color: 'var(--muted)', margin: '4px 0 0 0' }}>Choose what notifications you want to receive and how</p>
        </div>
      </div>

      <div className="notifications-stack">
        <div className="preference-section" style={{ background: 'rgba(255,255,255,0.02)', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
          <h4 style={{ marginBottom: '20px', color: 'var(--accent)' }}>Email Notifications</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {prefs.map((pref) => (
              <div key={pref.title} className="pref-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div>
                  <p style={{ fontWeight: 600, margin: '0 0 4px 0' }}>{pref.title}</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: 0 }}>{pref.desc}</p>
                </div>
                <input type="checkbox" defaultChecked={pref.checked} style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }} />
              </div>
            ))}
          </div>
        </div>

        <div className="preference-section" style={{ background: 'rgba(255, 255, 0, 0.02)', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255, 255, 0, 0.05)', marginTop: '24px' }}>
          <h4 style={{ marginBottom: '20px', color: '#fbbf24', textAlign: 'left' }}>Notification Frequency</h4>
          <div className="radio-group" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'flex-start' }}>
            {['Real-time (immediate notifications)', 'Daily digest (once per day)', 'Weekly summary (once per week)'].map((label, index) => (
              <label key={label} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', width: 'auto' }}>
                <input type="radio" name="freq" defaultChecked={index === 0} style={{ margin: 0, width: '18px', height: '18px', accentColor: '#fbbf24' }} />
                <span style={{ fontSize: '0.95rem', color: 'var(--text)', whiteSpace: 'nowrap' }}>{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '32px' }}>
          <button className="primary-button" style={{ gap: '10px', padding: '12px 24px' }} type="button">
            <Save size={18} /> Save Notification Settings
          </button>
        </div>
      </div>
    </>
  );
}
