interface AnalyticsData {
  sold_24h?: number;
  views_24h?: number;
  hey_score?: number;
  trending_score?: number;
  conversion_rate?: number;
  days_old?: number;
}

interface AnalyticsPanelProps {
  analytics: AnalyticsData;
}

interface MetricCardProps {
  label: string;
  value: string | number;
  color?: string;
}

function MetricCard({ label, value, color = 'text-gray-100' }: MetricCardProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function getHeyColor(score: number): string {
  if (score >= 8) return 'text-green-400';
  if (score >= 5) return 'text-yellow-400';
  return 'text-red-400';
}

function getSoldColor(sold: number): string {
  if (sold >= 3) return 'text-green-400';
  if (sold >= 1) return 'text-yellow-400';
  return 'text-gray-400';
}

export default function AnalyticsPanel({ analytics }: AnalyticsPanelProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <MetricCard
        label="Sold 24h"
        value={analytics.sold_24h ?? 0}
        color={getSoldColor(analytics.sold_24h ?? 0)}
      />
      <MetricCard
        label="Views 24h"
        value={analytics.views_24h ?? 0}
        color={
          (analytics.views_24h ?? 0) >= 120
            ? 'text-green-400'
            : (analytics.views_24h ?? 0) >= 80
            ? 'text-yellow-400'
            : 'text-gray-400'
        }
      />
      <MetricCard
        label="HEY Score"
        value={analytics.hey_score ?? 0}
        color={getHeyColor(analytics.hey_score ?? 0)}
      />
      <MetricCard
        label="Trend Score"
        value={(analytics.trending_score ?? 0).toFixed(1)}
        color="text-indigo-400"
      />
      <MetricCard
        label="Conv. Rate"
        value={`${((analytics.conversion_rate ?? 0) * 100).toFixed(1)}%`}
        color={
          (analytics.conversion_rate ?? 0) >= 0.03
            ? 'text-green-400'
            : 'text-gray-400'
        }
      />
      <MetricCard
        label="Days Old"
        value={analytics.days_old ?? '-'}
        color={
          (analytics.days_old ?? 999) <= 30
            ? 'text-green-400'
            : (analytics.days_old ?? 999) <= 90
            ? 'text-yellow-400'
            : 'text-gray-400'
        }
      />
    </div>
  );
}
