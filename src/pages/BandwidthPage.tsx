import { Sparkles, Wifi, Zap } from 'lucide-react';

import { Panel } from '../components/Common';
import type { DashboardState } from '../types';
import { getPlanName } from '../utils/format';

const plans = [
  { name: 'Starter', price: '₹499.00', rpm: '1 RPM', accent: 'var(--accent)', badge: null },
  { name: 'Pro', price: '₹1,999.00', rpm: '3 RPM', accent: '#71beff', badge: 'Popular' },
  { name: 'Team', price: '₹3,999.00', rpm: '8 RPM', accent: 'white', badge: null },
  { name: 'Scale', price: '₹8,999.00', rpm: '26 RPM', accent: 'white', badge: null },
];

export function BandwidthPage(props: { dashboard: DashboardState }) {
  const currentPlan = getPlanName(props.dashboard.profile).toLowerCase();

  return (
    <div className="card-stack" style={{ gap: '24px' }}>
      <Panel title="Active Subscriptions" icon={Wifi}>
        <div style={{ marginBottom: '16px', color: 'var(--muted)', fontSize: '0.9rem' }}>
          We are supporting models <a href="#" style={{ color: 'var(--accent)', textDecoration: 'none' }}>View Models</a>
        </div>
        <div className="card-stack" style={{ gap: '16px' }}>
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.name.toLowerCase();
            const accent = isCurrent ? plan.accent : 'rgba(255,255,255,0.1)';
            return (
              <div key={plan.name} className="sub-card" style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '20px', border: isCurrent ? `1px solid ${plan.accent}` : '1px solid rgba(255,255,255,0.06)', background: isCurrent ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isCurrent ? '#081018' : 'var(--muted)' }}>
                  <Zap size={28} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{plan.name}</h3>
                    {isCurrent ? <PlanBadge text="Current" color={plan.accent} /> : plan.badge ? <PlanBadge text={plan.badge} color={plan.accent} /> : null}
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{plan.price} <span style={{ fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 400 }}>/mo</span></div>
                </div>
                <div style={{ flex: 1, borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '24px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Bandwidth</div>
                  <div style={{ fontWeight: 600 }}>{plan.rpm} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>Guaranteed</span></div>
                </div>
                <button className="primary-button" disabled={isCurrent} style={{ background: isCurrent ? plan.accent : 'rgba(255,255,255,0.1)', color: isCurrent ? '#081018' : 'var(--text)', border: 'none' }} type="button">
                  {isCurrent ? 'Current Plan' : 'Upgrade'}
                </button>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="glass-panel" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
            <Sparkles size={24} />
          </div>
          <div>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem' }}>Inference API Fallback</h3>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
              When RPM limits are reached, fallback to Standard Inference API. <a href="#" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Uses standard credits.</a>
            </p>
          </div>
        </div>
        <label className="switch">
          <input type="checkbox" defaultChecked />
          <span className="slider round"></span>
        </label>
      </div>
    </div>
  );
}

function PlanBadge(props: { text: string; color: string }) {
  return <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.2)', color: props.color, padding: '2px 6px', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>{props.text}</span>;
}
