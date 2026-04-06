import { useState, useEffect } from 'react';
import { useIPC } from '../hooks/useIPC';
import KeywordTree, { KeywordNode } from '../components/KeywordTree';
import TrendBadge from '../components/TrendBadge';
import { formatRelativeTime } from '../utils/formatTime';

interface Keyword {
  id: number;
  keyword: string;
  category?: string;
  source: string;
  expansion_source: string;
  depth: number;
  status: string;
  max_pages: number;
  auto_expand: number;
  crawl_interval_minutes: number;
  last_crawled: string | null;
  hot_count: number;
  watch_count: number;
}

const INTERVAL_OPTIONS = [
  { value: 180, label: '3h' },
  { value: 360, label: '6h' },
  { value: 720, label: '12h' },
  { value: 1440, label: '24h' },
];

interface SearchResult {
  id: number;
  etsy_listing_id: string;
  title: string;
  shop_name: string;
  price: number;
  sale_price: number | null;
  is_bestseller: number;
  is_ad: number;
  position_in_search: number;
  page_number: number;
  crawled_at: string;
}

const sourceStyles: Record<string, string> = {
  user_input: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  tag_expansion: 'bg-green-500/20 text-green-400 border-green-500/30',
  ai_suggest: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  sibling_family: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

const sourceLabels: Record<string, string> = {
  user_input: 'user',
  tag_expansion: 'tag expansion',
  ai_suggest: 'AI suggest',
  sibling_family: 'sibling',
};

export default function SearchTracker() {
  const [showForm, setShowForm] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [crawlingId, setCrawlingId] = useState<number | null>(null);
  const [crawlMessage, setCrawlMessage] = useState<string | null>(null);

  // Form state
  const [formKeyword, setFormKeyword] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formMaxPages, setFormMaxPages] = useState(3);
  const [formInterval, setFormInterval] = useState(180);
  const [formAutoExpand, setFormAutoExpand] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const { data: keywords, invoke: loadKeywords, loading } = useIPC<Keyword[]>('keyword:list');
  const { invoke: addKeyword } = useIPC('keyword:add');
  const { invoke: crawlKeyword } = useIPC('keyword:crawl-now');
  const { invoke: deleteKeyword } = useIPC('keyword:delete');
  const { invoke: updateKeyword } = useIPC('keyword:update');
  const { data: searchResults, invoke: loadSearchResults } = useIPC<SearchResult[]>('snapshot:search-history');
  const { data: expansionTree, invoke: loadTree } = useIPC<KeywordNode[]>('expansion:tree');

  useEffect(() => {
    loadKeywords();
    loadTree();
  }, []);

  const handleAdd = async () => {
    if (!formKeyword.trim()) return;
    setAddError(null);

    const result = await addKeyword({
      keyword: formKeyword.trim(),
      category: formCategory || null,
      max_pages: formMaxPages,
      crawl_interval_minutes: formInterval,
      auto_expand: formAutoExpand,
    });

    if (result.success) {
      setFormKeyword('');
      setFormCategory('');
      setFormMaxPages(3);
      setFormAutoExpand(false);
      setShowForm(false);
      loadKeywords();
    } else {
      setAddError(result.error || 'Failed to add keyword');
    }
  };

  const handleCrawlNow = async (e: React.MouseEvent, kwId: number) => {
    e.stopPropagation();
    setCrawlingId(kwId);
    setCrawlMessage(null);

    try {
      const result = await crawlKeyword(kwId);
      if (result.success) {
        setCrawlMessage(result.data?.message || 'Crawl completed');
        loadKeywords(); // Refresh list
      } else {
        setCrawlMessage(`Error: ${result.error}`);
      }
    } catch {
      setCrawlMessage('Crawl failed');
    } finally {
      setCrawlingId(null);
      setTimeout(() => setCrawlMessage(null), 5000);
    }
  };

  const handleDelete = async (e: React.MouseEvent, kwId: number) => {
    e.stopPropagation();
    const result = await deleteKeyword(kwId);
    if (result.success) {
      loadKeywords();
    }
  };

  const handleRowClick = (kwId: number) => {
    if (expandedRow === kwId) {
      setExpandedRow(null);
    } else {
      setExpandedRow(kwId);
      loadSearchResults({ keywordId: kwId });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAdd();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-100">Keywords</h1>
        <button
          onClick={() => { setShowForm(!showForm); setAddError(null); }}
          className="px-4 py-2 rounded-lg font-medium text-sm bg-indigo-500 text-white hover:opacity-90 transition-opacity"
        >
          {showForm ? 'Cancel' : '+ Add Keyword'}
        </button>
      </div>

      {/* Crawl message */}
      {crawlMessage && (
        <div className={`rounded-lg px-4 py-3 text-sm ${
          crawlMessage.startsWith('Error') ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'
        }`}>
          {crawlMessage}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
          {addError && (
            <div className="rounded-lg px-4 py-2 text-sm bg-red-500/10 text-red-400 border border-red-500/20">
              {addError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Keyword *</label>
              <input
                type="text"
                placeholder="e.g., funny cat shirt"
                value={formKeyword}
                onChange={(e) => setFormKeyword(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Category</label>
              <input
                type="text"
                placeholder="e.g., clothing"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Max Pages</label>
              <input
                type="number"
                min={1}
                max={10}
                value={formMaxPages}
                onChange={(e) => setFormMaxPages(Number(e.target.value))}
                className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Cron Interval</label>
              <select
                value={formInterval}
                onChange={(e) => setFormInterval(Number(e.target.value))}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              >
                {INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>Every {opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 mt-5">
              <input
                type="checkbox"
                id="auto-expand"
                checked={formAutoExpand}
                onChange={(e) => setFormAutoExpand(e.target.checked)}
                className="rounded bg-gray-800 border-gray-700 text-indigo-500 focus:ring-indigo-500"
              />
              <label htmlFor="auto-expand" className="text-sm text-gray-400">
                Auto-expand tags
              </label>
            </div>
          </div>
          <button
            onClick={handleAdd}
            disabled={!formKeyword.trim()}
            className="px-4 py-2 rounded-lg font-medium text-sm bg-indigo-500 text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Keyword
          </button>
        </div>
      )}

      {/* Keywords table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-800">
              <th className="text-left px-4 py-3 text-xs uppercase text-gray-400 font-medium">Keyword</th>
              <th className="text-center px-4 py-3 text-xs uppercase text-gray-400 font-medium">Source</th>
              <th className="text-center px-4 py-3 text-xs uppercase text-gray-400 font-medium">Depth</th>
              <th className="text-center px-4 py-3 text-xs uppercase text-gray-400 font-medium">Status</th>
              <th className="text-center px-4 py-3 text-xs uppercase text-gray-400 font-medium">Cron</th>
              <th className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium">Last Crawled</th>
              <th className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium">HOT</th>
              <th className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium">WATCH</th>
              <th className="text-center px-4 py-3 text-xs uppercase text-gray-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && !keywords ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500 text-sm">
                  Loading...
                </td>
              </tr>
            ) : (keywords ?? []).length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500 text-sm">
                  No keywords tracked yet. Add a keyword to start discovering trends.
                </td>
              </tr>
            ) : (
              (keywords ?? []).map((kw, idx) => (
                <tbody key={kw.id}>
                  <tr
                    className={`border-t border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors ${
                      idx % 2 === 1 ? 'bg-gray-900/50' : ''
                    } ${expandedRow === kw.id ? 'bg-gray-800/70' : ''}`}
                    onClick={() => handleRowClick(kw.id)}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-200">{kw.keyword}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold border ${sourceStyles[kw.source || kw.expansion_source] || sourceStyles.user_input}`}>
                        {sourceLabels[kw.source || kw.expansion_source] || kw.source || 'user'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 text-center">{kw.depth}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          kw.status === 'active'
                            ? 'text-green-400 bg-green-500/10'
                            : kw.status === 'saturated'
                            ? 'text-gray-400 bg-gray-500/10'
                            : 'text-yellow-400 bg-yellow-500/10'
                        }`}
                      >
                        {kw.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={kw.crawl_interval_minutes || 180}
                        onChange={(e) => {
                          updateKeyword({ id: kw.id, crawl_interval_minutes: Number(e.target.value) });
                          loadKeywords();
                        }}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:ring-1 focus:ring-indigo-500 outline-none"
                      >
                        {INTERVAL_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 text-right">
                      {kw.last_crawled ? formatRelativeTime(kw.last_crawled) : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-sm text-red-400 text-right font-medium">
                      {kw.hot_count || 0}
                    </td>
                    <td className="px-4 py-3 text-sm text-yellow-400 text-right font-medium">
                      {kw.watch_count || 0}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={(e) => handleCrawlNow(e, kw.id)}
                          disabled={crawlingId === kw.id}
                          className="px-3 py-1 rounded text-xs font-medium bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/30 transition-colors disabled:opacity-50"
                        >
                          {crawlingId === kw.id ? 'Crawling...' : 'Crawl'}
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, kw.id)}
                          className="px-3 py-1 rounded text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* Expanded search results */}
                  {expandedRow === kw.id && (
                    <tr>
                      <td colSpan={9} className="px-4 py-4 bg-gray-800/30">
                        {searchResults && searchResults.length > 0 ? (
                          <div className="space-y-2">
                            <div className="text-xs text-gray-500 mb-2">
                              {searchResults.length} results found
                            </div>
                            {searchResults.map((sr) => (
                              <div
                                key={sr.id}
                                className="flex items-center gap-3 px-3 py-2 bg-gray-900 rounded-lg border border-gray-800"
                              >
                                <span className="text-xs text-gray-500 w-6">#{sr.position_in_search}</span>
                                <span className="text-sm text-gray-200 truncate flex-1">{sr.title}</span>
                                <span className="text-xs text-gray-500">{sr.shop_name}</span>
                                <span className="text-sm text-gray-100 font-medium">
                                  ${(sr.sale_price || sr.price || 0).toFixed(2)}
                                </span>
                                {sr.is_bestseller ? (
                                  <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">BS</span>
                                ) : null}
                                {sr.is_ad ? (
                                  <span className="text-xs bg-gray-500/20 text-gray-400 px-1.5 py-0.5 rounded">Ad</span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">No search results yet. Click "Crawl Now" to fetch results.</p>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Keyword Expansion Tree */}
      {expansionTree && expansionTree.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">Keyword Expansion Tree</h2>
          <KeywordTree keywords={expansionTree} />
        </div>
      )}
    </div>
  );
}
