import { useState, useEffect } from 'react';
import { useIPC } from '../hooks/useIPC';
import KeywordTree, { KeywordNode } from '../components/KeywordTree';
import TrendBadge from '../components/TrendBadge';
import { formatRelativeTime } from '../utils/formatTime';

interface Keyword {
  id: number;
  keyword: string;
  category?: string;
  source: 'user' | 'tag_expansion' | 'ai_suggest';
  depth: number;
  status: 'active' | 'paused' | 'saturated';
  max_pages: number;
  auto_expand: boolean;
  last_crawled: string | null;
  hot_count: number;
  watch_count: number;
}

interface SearchResult {
  id: number;
  title: string;
  shopName: string;
  price: number;
  trendStatus?: 'HOT' | 'WATCH' | 'SKIP';
  sold24h?: number;
  views24h?: number;
}

const sourceStyles: Record<string, string> = {
  user: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  tag_expansion: 'bg-green-500/20 text-green-400 border-green-500/30',
  ai_suggest: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

export default function SearchTracker() {
  const [showForm, setShowForm] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Form state
  const [formKeyword, setFormKeyword] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formMaxPages, setFormMaxPages] = useState(3);
  const [formAutoExpand, setFormAutoExpand] = useState(false);

  const { data: keywords, invoke: loadKeywords, loading } = useIPC<Keyword[]>('keyword:list');
  const { invoke: addKeyword } = useIPC('keyword:add');
  const { data: searchResults, invoke: loadSearchResults } = useIPC<SearchResult[]>('snapshot:search-history');
  const { data: expansionTree, invoke: loadTree } = useIPC<KeywordNode[]>('expansion:tree');

  useEffect(() => {
    loadKeywords();
    loadTree();
  }, []);

  const handleAdd = async () => {
    if (!formKeyword.trim()) return;
    const result = await addKeyword({
      keyword: formKeyword,
      category: formCategory || null,
      max_pages: formMaxPages,
      auto_expand: formAutoExpand,
    });
    if (result.success) {
      setFormKeyword('');
      setFormCategory('');
      setFormMaxPages(3);
      setFormAutoExpand(false);
      setShowForm(false);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-100">Keyword Tracking</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg font-medium text-sm bg-indigo-500 text-white hover:opacity-90 transition-opacity"
        >
          {showForm ? 'Cancel' : 'Add Keyword'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Keyword</label>
              <input
                type="text"
                placeholder="e.g., funny cat shirt"
                value={formKeyword}
                onChange={(e) => setFormKeyword(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Category</label>
              <input
                type="text"
                placeholder="e.g., clothing"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
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
            className="px-4 py-2 rounded-lg font-medium text-sm bg-indigo-500 text-white hover:opacity-90 transition-opacity"
          >
            Add Keyword
          </button>
        </div>
      )}

      {/* Keywords table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-800">
              <th className="text-left px-4 py-3 text-xs uppercase text-gray-400 font-medium">Keyword</th>
              <th className="text-center px-4 py-3 text-xs uppercase text-gray-400 font-medium">Source</th>
              <th className="text-center px-4 py-3 text-xs uppercase text-gray-400 font-medium">Depth</th>
              <th className="text-center px-4 py-3 text-xs uppercase text-gray-400 font-medium">Status</th>
              <th className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium">Last Crawled</th>
              <th className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium">HOT</th>
              <th className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium">WATCH</th>
            </tr>
          </thead>
          <tbody>
            {loading && !keywords ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500 text-sm">
                  Loading...
                </td>
              </tr>
            ) : (keywords ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500 text-sm">
                  No keywords tracked yet. Add a keyword to start discovering trends.
                </td>
              </tr>
            ) : (
              (keywords ?? []).map((kw, idx) => (
                <>
                  <tr
                    key={kw.id}
                    className={`border-t border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors ${
                      idx % 2 === 1 ? 'bg-gray-900/50' : ''
                    } ${expandedRow === kw.id ? 'bg-gray-800/70' : ''}`}
                    onClick={() => handleRowClick(kw.id)}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-200">{kw.keyword}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold border ${sourceStyles[kw.source]}`}>
                        {kw.source.replace('_', ' ')}
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
                    <td className="px-4 py-3 text-sm text-gray-400 text-right">
                      {formatRelativeTime(kw.last_crawled)}
                    </td>
                    <td className="px-4 py-3 text-sm text-red-400 text-right font-medium">
                      {kw.hot_count}
                    </td>
                    <td className="px-4 py-3 text-sm text-yellow-400 text-right font-medium">
                      {kw.watch_count}
                    </td>
                  </tr>
                  {/* Expanded search results */}
                  {expandedRow === kw.id && (
                    <tr key={`${kw.id}-results`}>
                      <td colSpan={7} className="px-4 py-4 bg-gray-800/30">
                        {searchResults && searchResults.length > 0 ? (
                          <div className="space-y-2">
                            {searchResults.map((sr) => (
                              <div
                                key={sr.id}
                                className="flex items-center gap-3 px-3 py-2 bg-gray-900 rounded-lg border border-gray-800"
                              >
                                <span className="text-sm text-gray-200 truncate flex-1">{sr.title}</span>
                                <span className="text-xs text-gray-500">{sr.shopName}</span>
                                <span className="text-sm text-gray-100 font-medium">${sr.price.toFixed(2)}</span>
                                {sr.trendStatus && <TrendBadge status={sr.trendStatus} />}
                                {sr.sold24h != null && (
                                  <span className="text-xs text-gray-400">
                                    <span className="text-green-400">{sr.sold24h}</span> sold
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">No search results yet for this keyword.</p>
                        )}
                      </td>
                    </tr>
                  )}
                </>
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
