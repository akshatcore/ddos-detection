// Backend timestamps (created_at/updated_at everywhere) come from Python's
// datetime.utcnow() - a naive datetime with no timezone attached - so the
// JSON the API sends looks like "2026-09-05T14:39:22.123456", with no
// trailing "Z" or UTC offset. Per the ECMA-262 spec, JS's Date constructor
// treats a date-TIME string with no timezone designator as LOCAL time, not
// UTC. That means every timestamp from the backend was silently parsed as
// if it were already in the viewer's local timezone - for someone in IST
// (UTC+5:30), a flow that just happened shows up as "5h ago" instead of
// "just now", and every displayed clock time is off by the same offset.
// Routing every backend timestamp through this function instead of a bare
// `new Date(...)` fixes it at the one place that matters, without needing a
// database migration to timezone-aware columns.
export function parseUtc(dateStr: string): Date {
  const hasTimezone = /[zZ]|[+-]\d\d:?\d\d$/.test(dateStr);
  return new Date(hasTimezone ? dateStr : `${dateStr}Z`);
}

export function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - parseUtc(dateStr).getTime();
  const seconds = Math.max(0, Math.floor(diffMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
