interface ProxyStatusProps {
  status: 'active' | 'failed' | 'retired';
}

const statusStyles = {
  active: { dot: 'bg-green-400', text: 'text-green-400', label: 'Active' },
  failed: { dot: 'bg-red-400', text: 'text-red-400', label: 'Failed' },
  retired: { dot: 'bg-gray-400', text: 'text-gray-400', label: 'Retired' },
};

export default function ProxyStatus({ status }: ProxyStatusProps) {
  const style = statusStyles[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${style.dot}`} />
      <span className={`text-xs font-medium ${style.text}`}>{style.label}</span>
    </span>
  );
}
