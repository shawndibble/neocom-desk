import type { TFunction } from 'i18next';
import type { MoonOwnerRow } from '@/engine/corpTaxBook/moonOwners';
import { formatAge } from '@/lib/age';
import { shortDate } from './moonsFormat';

const k = (key: string) => `corpTaxBook.moons.moonOwners.${key}`;

/**
 * The dim line under a moon owner's name, shared by the table and the phone cards: its
 * refineries (or that nothing was seen yet), then how its ledger reads. One of the viewer's own
 * corporations says it has no owner rate, and its last read's age like any other.
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
  return [
    r.nothingSeen ? t(k('nothingSeen')) : t(k('refineries'), { count: r.refineryCount }),
    ...read,
  ]
    .filter((part) => part !== undefined)
    .join(' · ');
}
