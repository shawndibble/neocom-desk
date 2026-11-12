import type { TFunction } from 'i18next';
import type { MoonOwnerRow } from '@/engine/corpTaxBook/moonOwners';
import { formatAge } from '@/lib/age';
import { nextScheduledBookSync } from '../../../../functions/src/corpTaxBookSchedule';
import { shortDate, utcTime } from './moonsFormat';

const k = (key: string) => `corpTaxBook.moons.moonOwners.${key}`;

/** Statuses the scheduled sync no longer reads. */
const NEVER_READ_AGAIN = new Set<MoonOwnerRow['status']>(['disconnected', 'left', 'removed']);

/**
 * The dim line under a moon owner's name, shared by the table and the phone cards: its
 * refineries (or that nothing was seen yet), then how its ledger reads. One of the viewer's own
 * corporations says it has no owner rate, and its last read's age like any other. One still read
 * on the schedule ends with when it is read next (#6117), so a new one never looks stuck.
 */
export function moonOwnerNote(r: MoonOwnerRow, now: number, t: TFunction): string {
  const synced =
    r.lastReadWellAt !== undefined
      ? t(k('synced'), { age: formatAge(now - Date.parse(r.lastReadWellAt), t) })
      : undefined;
  const read =
    r.status === 'cant-read' && r.staleSince !== undefined
      ? [t(k('cantReadSince'), { date: shortDate(new Date(r.staleSince).toISOString()) })]
      : [r.sameOwner ? t(k('yoursNote')) : undefined, synced];
  const next = NEVER_READ_AGAIN.has(r.status)
    ? undefined
    : t(k('nextRead'), {
        time: utcTime(nextScheduledBookSync(now)),
      });
  return [
    r.nothingSeen ? t(k('nothingSeen')) : t(k('refineries'), { count: r.refineryCount }),
    ...read,
    next,
  ]
    .filter((part) => part !== undefined)
    .join(' · ');
}
