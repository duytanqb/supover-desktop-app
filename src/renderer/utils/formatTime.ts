export function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'never';

  // SQLite datetime('now') stores UTC without 'Z' suffix.
  // Append 'Z' so JavaScript parses it as UTC, then displays in local timezone.
  const normalized = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
  const date = new Date(normalized);

  if (isNaN(date.getTime())) return 'never';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 4) return `${weeks}w ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
