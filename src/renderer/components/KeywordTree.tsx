import { useState } from 'react';
import TrendBadge from './TrendBadge';

export interface KeywordNode {
  id: number;
  keyword: string;
  depth: number;
  status: 'active' | 'paused' | 'saturated';
  hotCount?: number;
  watchCount?: number;
  children?: KeywordNode[];
}

interface KeywordTreeProps {
  keywords: KeywordNode[];
  onSelect?: (keyword: KeywordNode) => void;
}

interface TreeNodeProps {
  node: KeywordNode;
  onSelect?: (keyword: KeywordNode) => void;
}

function TreeNode({ node, onSelect }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(node.depth < 2);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800/50 rounded-lg cursor-pointer transition-colors"
        style={{ paddingLeft: `${node.depth * 20 + 12}px` }}
        onClick={() => onSelect?.(node)}
      >
        {/* Expand toggle */}
        {hasChildren ? (
          <button
            className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-300 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? '\u25BC' : '\u25B6'}
          </button>
        ) : (
          <span className="w-5 h-5 flex items-center justify-center text-gray-700 text-xs">\u2022</span>
        )}

        {/* Keyword text */}
        <span className="text-sm text-gray-200 font-medium">{node.keyword}</span>

        {/* Depth indicator */}
        <span className="text-xs text-gray-600">d{node.depth}</span>

        {/* Status */}
        <span
          className={`text-xs px-1.5 py-0.5 rounded ${
            node.status === 'active'
              ? 'text-green-400 bg-green-500/10'
              : node.status === 'saturated'
              ? 'text-gray-400 bg-gray-500/10'
              : 'text-yellow-400 bg-yellow-500/10'
          }`}
        >
          {node.status}
        </span>

        {/* HOT/WATCH counts */}
        <div className="ml-auto flex items-center gap-2">
          {(node.hotCount ?? 0) > 0 && (
            <span className="text-xs text-red-400 font-medium">{node.hotCount} HOT</span>
          )}
          {(node.watchCount ?? 0) > 0 && (
            <span className="text-xs text-yellow-400 font-medium">{node.watchCount} WATCH</span>
          )}
        </div>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode key={child.id} node={child} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function KeywordTree({ keywords, onSelect }: KeywordTreeProps) {
  if (keywords.length === 0) {
    return <p className="text-sm text-gray-500 px-3 py-2">No keywords in expansion tree.</p>;
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 py-2">
      {keywords.map((node) => (
        <TreeNode key={node.id} node={node} onSelect={onSelect} />
      ))}
    </div>
  );
}
