interface TrendBadgeProps {
  status: 'HOT' | 'WATCH' | 'SKIP';
}

const styles = {
  HOT: 'bg-red-500/20 text-red-400 border-red-500/30',
  WATCH: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  SKIP: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

export default function TrendBadge({ status }: TrendBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border ${styles[status]}`}
    >
      {status}
    </span>
  );
}
