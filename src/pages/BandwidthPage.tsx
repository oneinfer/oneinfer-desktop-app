import type { DashboardState } from '../types';

export function BandwidthPage(_props: { dashboard: DashboardState }) {
  return (
    <div className="coming-soon-only">
      <span>Bandwidth</span>
      <h1>Coming Soon</h1>
      <p>
        Track endpoint traffic, usage limits, and network performance for your hosted models from this page.
      </p>
    </div>
  );
}
