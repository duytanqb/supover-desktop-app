import { formatRelativeTime } from '../utils/formatTime';

interface Snapshot {
  id: number;
  date: string;
}

interface SnapshotTimelineProps {
  snapshots: Snapshot[];
  activeId?: number;
  onSelect?: (snapshot: Snapshot) => void;
}

export default function SnapshotTimeline({ snapshots, activeId, onSelect }: SnapshotTimelineProps) {
  if (snapshots.length === 0) {
    return <p className="text-sm text-gray-500">No snapshots yet.</p>;
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2 px-1">
      {/* Line */}
      <div className="relative flex items-center gap-1">
        {snapshots.map((snap, idx) => (
          <button
            key={snap.id}
            className={`relative flex-shrink-0 w-4 h-4 rounded-full border-2 transition-all ${
              snap.id === activeId
                ? 'bg-indigo-500 border-indigo-400 scale-125'
                : 'bg-gray-700 border-gray-600 hover:bg-gray-600 hover:border-gray-500'
            }`}
            title={formatRelativeTime(snap.date)}
            onClick={() => onSelect?.(snap)}
          />
        ))}
      </div>

      {/* Most recent label */}
      {snapshots.length > 0 && (
        <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
          Latest: {formatRelativeTime(snapshots[snapshots.length - 1].date)}
        </span>
      )}
    </div>
  );
}
