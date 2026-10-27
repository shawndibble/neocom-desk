import type { TFunction } from 'i18next';
import type { ShipTreeHullStatus } from '@/engine/shipTree/types';
import { formatDuration } from '@/lib/duration';

/** "Can fly", or how long the hull's own required skills take ("3d 4h to fly"). */
export function flyLabel(t: TFunction, status: ShipTreeHullStatus | undefined): string {
  if (!status) return '';
  if (status.canFly) return t('ships.tree.canFly');
  return t('ships.tree.timeToFly', { time: formatDuration(status.secondsToFly) });
}
