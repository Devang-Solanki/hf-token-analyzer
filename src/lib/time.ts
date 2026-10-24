/** Date formatting shared by every provider. */

export function formatDate(dateString?: string): string {
  if (!dateString) return 'Not reported';

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function isExpired(iso?: string): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  return !Number.isNaN(date.getTime()) && date < new Date();
}

/** Coarse "time remaining" phrase, e.g. "12 days" or "3 hours". */
export function timeUntil(iso?: string): string {
  if (!iso) return 'Never';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  if (date < new Date()) return 'Expired';

  const ms = date.getTime() - Date.now();
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);

  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

  if (days > 0) return `${plural(days, 'day')} ${plural(hours, 'hour')}`;
  if (hours > 0) return `${plural(hours, 'hour')} ${plural(minutes, 'minute')}`;
  return plural(minutes, 'minute');
}
