import { useState, useEffect } from 'react';
import { useIPC } from '../hooks/useIPC';
import { formatRelativeTime } from '../utils/formatTime';

type InsightType = 'all' | 'shop_summary' | 'keyword_analysis' | 'niche_discovery';

interface Insight {
  id: number;
  type: 'shop_summary' | 'keyword_analysis' | 'niche_discovery';
  target_name: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
}

interface InsightResponse {
  insights: Insight[];
}

interface ShopOption {
  id: number;
  shop_name: string;
}

interface KeywordOption {
  id: number;
  keyword: string;
}

const typeStyles: Record<string, string> = {
  shop_summary: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  keyword_analysis: 'bg-green-500/20 text-green-400 border-green-500/30',
  niche_discovery: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

const typeLabels: Record<string, string> = {
  shop_summary: 'Shop Summary',
  keyword_analysis: 'Keyword Analysis',
  niche_discovery: 'Niche Discovery',
};

export default function AIInsights() {
  const [activeTab, setActiveTab] = useState<InsightType>('all');
  const [showShopDropdown, setShowShopDropdown] = useState(false);
  const [showKeywordDropdown, setShowKeywordDropdown] = useState(false);

  const { data: insightData, invoke: loadInsights, loading } = useIPC<InsightResponse>('ai:insights-list');
  const { data: shops, invoke: loadShops } = useIPC<ShopOption[]>('shop:list');
  const { data: keywords, invoke: loadKeywords } = useIPC<KeywordOption[]>('keyword:list');
  const { invoke: analyzeShop } = useIPC('ai:analyze-shop');
  const { invoke: analyzeKeyword } = useIPC('ai:analyze-keyword');

  useEffect(() => {
    loadInsights({ type: activeTab === 'all' ? undefined : activeTab });
    loadShops();
    loadKeywords();
  }, [activeTab]);

  const insights = insightData?.insights ?? [];

  const handleAnalyzeShop = async (shopId: number) => {
    setShowShopDropdown(false);
    await analyzeShop({ shopId });
    loadInsights({ type: activeTab === 'all' ? undefined : activeTab });
  };

  const handleAnalyzeKeyword = async (keywordId: number) => {
    setShowKeywordDropdown(false);
    await analyzeKeyword({ keywordId });
    loadInsights({ type: activeTab === 'all' ? undefined : activeTab });
  };

  const tabs: { key: InsightType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'shop_summary', label: 'Shop Summary' },
    { key: 'keyword_analysis', label: 'Keyword Analysis' },
    { key: 'niche_discovery', label: 'Niche Discovery' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-2xl font-bold text-gray-100">AI Insights</h1>

      {/* Filter tabs + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1 border border-gray-800">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-gray-800 text-gray-100'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Analyze Shop */}
          <div className="relative">
            <button
              onClick={() => {
                setShowShopDropdown(!showShopDropdown);
                setShowKeywordDropdown(false);
              }}
              className="px-4 py-2 rounded-lg font-medium text-sm bg-indigo-500 text-white hover:opacity-90 transition-opacity"
            >
              Analyze Shop
            </button>
            {showShopDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10 max-h-60 overflow-y-auto">
                {(shops ?? []).length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-500">No shops available</p>
                ) : (
                  (shops ?? []).map((shop) => (
                    <button
                      key={shop.id}
                      onClick={() => handleAnalyzeShop(shop.id)}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
                    >
                      {shop.shop_name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Analyze Keyword */}
          <div className="relative">
            <button
              onClick={() => {
                setShowKeywordDropdown(!showKeywordDropdown);
                setShowShopDropdown(false);
              }}
              className="px-4 py-2 rounded-lg font-medium text-sm bg-purple-500 text-white hover:opacity-90 transition-opacity"
            >
              Analyze Keyword
            </button>
            {showKeywordDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10 max-h-60 overflow-y-auto">
                {(keywords ?? []).length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-500">No keywords available</p>
                ) : (
                  (keywords ?? []).map((kw) => (
                    <button
                      key={kw.id}
                      onClick={() => handleAnalyzeKeyword(kw.id)}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
                    >
                      {kw.keyword}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Insight cards */}
      {loading && insights.length === 0 ? (
        <p className="text-sm text-gray-500">Loading insights...</p>
      ) : insights.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
          <p className="text-gray-500">
            No AI insights yet. Use the analyze buttons above to generate insights for your shops and keywords.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {insights.map((insight) => (
            <div
              key={insight.id}
              className="bg-gray-900 rounded-xl border border-gray-800 p-6"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold border ${typeStyles[insight.type]}`}
                  >
                    {typeLabels[insight.type]}
                  </span>
                  <span className="text-sm font-medium text-gray-300">
                    {insight.target_name}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    {formatRelativeTime(insight.created_at)}
                  </span>
                  <button
                    className={`text-sm transition-colors ${
                      insight.is_pinned
                        ? 'text-yellow-400 hover:text-yellow-300'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                    title={insight.is_pinned ? 'Unpin' : 'Pin'}
                  >
                    {insight.is_pinned ? '\u2605' : '\u2606'}
                  </button>
                </div>
              </div>
              <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                {insight.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
