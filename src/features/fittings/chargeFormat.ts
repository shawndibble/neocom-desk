import { formatCount } from '@/lib/formatCount';

export function formatIskExact(value: number): string {
  return formatCount(value);
}
