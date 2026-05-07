import { Sparkles, Wifi, Zap } from 'lucide-react';

import { Panel } from '../components/Common';
import type { DashboardState, DeveloperPlanItem } from '../types';

export function BandwidthPage(props: { dashboard: DashboardState }) {
  const plans = props.dashboard.developerPlans;
  const activePlanId = props.dashboard.activeDeveloperPlan?.planId ?? null;
  const allowInferenceFallback = props.dashboard.activeDeveloperPlan?.allowInferenceFallback;

  return (
    <div className="card-stack" style={{ gap: '24px' }}>
      <Panel title="Active Subscriptions" icon={Wifi}>
        <div style={{ marginBottom: '16px', color: 'var(--muted)', fontSize: '0.9rem' }}>
          We are supporting models <a href="#" style={{ color: 'var(--accent)', textDecoration: 'none' }}>View Models</a>
        </div>
        <div className="card-stack" style={{ gap: '16px' }}>
          {plans.length === 0 ? (
            <div className="sub-card" style={{ padding: '20px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', color: 'var(--muted)' }}>
              Loading subscription plans...
            </div>
          ) : plans.map((plan) => (
            <PlanRow key={plan.planId} plan={plan} isCurrent={plan.planId === activePlanId} />
          ))}
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
          <input type="checkbox" checked={Boolean(allowInferenceFallback)} readOnly />
          <span className="slider round"></span>
        </label>
      </div>
    </div>
  );
}

export function PlanRow(props: { plan: DeveloperPlanItem; isCurrent: boolean }) {
  const planName = normalizePlanName(props.plan.planTier);
  const accent = props.isCurrent ? getPlanAccent(planName) : 'rgba(255,255,255,0.1)';

  return (
    <div className="sub-card" style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '20px', border: props.isCurrent ? `1px solid ${getPlanAccent(planName)}` : '1px solid rgba(255,255,255,0.06)', background: props.isCurrent ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)' }}>
      <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: props.isCurrent ? '#081018' : 'var(--muted)' }}>
        <Zap size={28} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{planName}</h3>
          {props.isCurrent ? <PlanBadge text="Current" color={getPlanAccent(planName)} /> : isPopularPlan(planName) ? <PlanBadge text="Popular" color={getPlanAccent(planName)} /> : null}
        </div>
        <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{formatPlanPrice(props.plan.pricing, props.plan.currency)} <span style={{ fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 400 }}>/mo</span></div>
      </div>
      <div style={{ flex: 1.5, borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '24px', display: 'flex', gap: '32px' }}>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Bandwidth</div>
          <div style={{ fontWeight: 600 }}>{props.plan.requestsPerMinute} RPM <span style={{ color: 'var(--muted)', fontWeight: 400 }}>Guaranteed</span></div>
        </div>
        {props.plan.concurrency > 0 && (
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Concurrency</div>
            <div style={{ fontWeight: 600 }}>{props.plan.concurrency} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>Threads</span></div>
          </div>
        )}
      </div>
      <button className="primary-button" disabled={props.isCurrent} style={{ minWidth: '132px', background: props.isCurrent ? getPlanAccent(planName) : 'rgba(255,255,255,0.1)', color: props.isCurrent ? '#081018' : 'var(--text)', border: 'none' }} type="button">
        {props.isCurrent ? 'Current Plan' : 'Upgrade'}
      </button>
    </div>
  );
}

function PlanBadge(props: { text: string; color: string }) {
  return <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.2)', color: props.color, padding: '2px 6px', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>{props.text}</span>;
}

function normalizePlanName(value: string): string {
  return value.replace(/\s+plan$/i, '').trim() || 'Plan';
}

function getPlanAccent(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized.includes('starter') || normalized.includes('lite')) return 'var(--accent)';
  if (normalized.includes('pro')) return '#71beff';
  return 'white';
}

function isPopularPlan(value: string): boolean {
  return value.toLowerCase().includes('pro');
}

function formatPlanPrice(value: number, currency: string): string {
  const normalizedCurrency = currency === 'INR' ? 'INR' : 'USD';
  const locale = normalizedCurrency === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: normalizedCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
