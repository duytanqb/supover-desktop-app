import { useState, useEffect } from 'react';
import { useIPC } from '../hooks/useIPC';
import { formatRelativeTime } from '../utils/formatTime';

interface Insight {
  id: number;
  insight_type: string;
  content: string;
  data_context: string;
  model_used: string;
  is_pinned: number;
  created_at: string;
}

export default function AIInsights() {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: insights, invoke: loadInsights, loading } = useIPC<Insight[]>('ai:insights-list');
  const { invoke: generateReport } = useIPC('ai:market-report');

  useEffect(() => {
    loadInsights();
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await generateReport();
      if (result.success) {
        loadInsights();
      } else {
        setError(result.error || 'Failed to generate report');
      }
    } catch {
      setError('Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const list = insights ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-100">AI Insights</h1>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-5 py-2.5 rounded-lg font-medium text-sm bg-indigo-500 text-white hover:bg-indigo-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {generating ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Analyzing...
            </>
          ) : (
            <>✨ Generate Market Report</>
          )}
        </button>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-500">
        Analyzes your last 100 HOT/WATCH listings to find trending niches, winning keywords, design patterns, and opportunities.
      </p>

      {/* Error */}
      {error && (
        <div className="rounded-lg px-4 py-3 text-sm bg-red-500/10 text-red-400 border border-red-500/20">
          {error}
        </div>
      )}

      {/* Reports */}
      {loading && list.length === 0 ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : list.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
          <p className="text-gray-400 text-lg mb-2">No reports yet</p>
          <p className="text-gray-500 text-sm">
            Crawl some keywords first, then click "Generate Market Report" to get AI-powered niche analysis.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((insight) => {
            let context: any = {};
            try { context = JSON.parse(insight.data_context || '{}'); } catch {}

            return (
              <div
                key={insight.id}
                className="bg-gray-900 rounded-xl border border-gray-800 p-6"
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-800">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">📊</span>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-200">Market Report</h3>
                      <p className="text-xs text-gray-500">
                        {context.hotCount ?? 0} HOT · {context.watchCount ?? 0} WATCH · {context.totalListings ?? 0} listings analyzed
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">{formatRelativeTime(insight.created_at)}</p>
                    <p className="text-xs text-gray-600">{insight.model_used}</p>
                  </div>
                </div>

                {/* Content */}
                <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {insight.content}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
