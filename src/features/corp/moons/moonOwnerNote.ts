import type { TFunction } from 'i18next';
import { isStillRead, type MoonOwnerRow } from '@/engine/corpTaxBook/moonOwners';
import { formatAge } from '@/lib/age';
import { nextScheduledBookSync } from '../../../../functions/src/corpTaxBookSchedule';
import { type ClockZone, atDate, clockAt } from './moonsFormat';

const k = (key: string) => `corpTaxBook.moons.moonOwners.${key}`;

export function moonOwnerNote(r: MoonOwnerRow, now: number, t: TFunction, zone: ClockZone): string {
  const synced =
    r.lastReadWellAt !== undefined
      ? t(k('synced'), { age: formatAge(now - Date.parse(r.lastReadWellAt), t) })
      : undefined;
  const read =
    r.status === 'cant-read' && r.staleSince !== undefined
      ? [t(k('cantReadSince'), { date: atDate(r.staleSince, zone) })]
      : [r.sameOwner ? t(k('yoursNote')) : undefined, synced];
  const next = !isStillRead(r.status)
    ? undefined
    : t(k('nextRead'), {
        time: clockAt(nextScheduledBookSync(now), zone),
      });
  return [
    r.nothingSeen ? t(k('nothingSeen')) : t(k('refineries'), { count: r.refineryCount }),
    ...read,
    next,
  ]
    .filter((part) => part !== undefined)
    .join(' · ');
}
