export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

export function formatSeconds(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (hours > 0 || minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds % 60}s`);
  return parts.join(' ');
}

export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 86_400) return formatDuration(seconds);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  return `${days}d ${hours}h`;
}

export function stepFinish(cumulativeSeconds: number, startDate: Date): Date {
  return new Date(startDate.getTime() + cumulativeSeconds * 1000);
}

export function formatTenure(totalSeconds: number): string {
  const DAYS_PER_MONTH = 30.4;
  const DAYS_PER_YEAR = 365;
  const days = Math.floor(Math.max(0, totalSeconds) / 86_400);
  if (days < 60) return `${days}d`;
  const months = Math.floor(days / DAYS_PER_MONTH);
  if (days < DAYS_PER_YEAR) return `${months}mo`;
  const years = Math.floor(days / DAYS_PER_YEAR);
  const leftover = Math.floor((days - years * DAYS_PER_YEAR) / DAYS_PER_MONTH);
  return leftover > 0 ? `${years}y ${leftover}mo` : `${years}y`;
}
