export interface DiffChange {
  type: 'added' | 'removed' | 'changed';
  field: string;
  oldValue?: string | number | null;
  newValue?: string | number | null;
}

interface DiffViewerProps {
  changes: DiffChange[];
}

const typeStyles = {
  added: { icon: '+', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
  removed: { icon: '-', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  changed: { icon: '~', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
};

export default function DiffViewer({ changes }: DiffViewerProps) {
  if (changes.length === 0) {
    return <p className="text-sm text-gray-500">No changes detected.</p>;
  }

  return (
    <div className="space-y-2">
      {changes.map((change, idx) => {
        const style = typeStyles[change.type];
        return (
          <div
            key={`${change.field}-${idx}`}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${style.bg}`}
          >
            <span className={`font-mono font-bold text-sm w-5 text-center ${style.color}`}>
              {style.icon}
            </span>
            <span className="text-sm text-gray-300 font-medium">{change.field}</span>
            <div className="flex-1 text-right text-sm">
              {change.type === 'changed' && (
                <>
                  <span className="text-red-400 line-through mr-2">{String(change.oldValue ?? '')}</span>
                  <span className="text-green-400">{String(change.newValue ?? '')}</span>
                </>
              )}
              {change.type === 'added' && (
                <span className="text-green-400">{String(change.newValue ?? '')}</span>
              )}
              {change.type === 'removed' && (
                <span className="text-red-400 line-through">{String(change.oldValue ?? '')}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
