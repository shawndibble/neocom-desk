import type { TFunction } from 'i18next';
import { isStillRead, type MoonOwnerRow } from '@/engine/corpTaxBook/moonOwners';
import { formatAge } from '@/lib/age';
import { nextScheduledBookSync } from '../../../../functions/src/corpTaxBookSchedule';
import { type ClockZone, atDate, clockAt } from './moonsFormat';

const k = (key: string) => `corpTaxBook.moons.moonOwners.${key}`;

/**
 * The dim line under a moon owner's name, shared by the table and the phone cards: its
 * refineries (or that nothing was seen yet), then how its ledger reads. One of the viewer's own
 * corporations says it has no owner rate, and its last read's age like any other. One still read
 * on the schedule ends with when it is read next (#6117), so a new one never looks stuck.
 */
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
