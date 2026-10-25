/**
 * Each implant's and booster's own EVE slot, from the market tree (the baked
 * SDE carries no slot attribute; `implantEntriesFromMarket`). Once per session.
 * The engine needs it to place a clone's implants (`fittingToDogmaFit`), and the
 * Implant Finder to place a set's.
 */
import {
  boosterEntriesFromMarket,
  implantEntriesFromMarket,
  type ImplantEntry,
  type SlotOf,
} from '@/engine/fittings/implantFinder';
import { loadMarketGroups, loadMarketTypes } from '@/sde/loadMarketSde';

export interface ImplantMarketEntries {
  implants: ImplantEntry[];
  boosters: ImplantEntry[];
  slotOf: SlotOf;
}

let pending: Promise<ImplantMarketEntries> | null = null;

export function loadImplantMarketEntries(): Promise<ImplantMarketEntries> {
  if (!pending) {
    const load = Promise.all([loadMarketTypes(), loadMarketGroups()]).then(([types, groups]) => {
      const implants = implantEntriesFromMarket(types, groups);
      const boosters = boosterEntriesFromMarket(types, groups);
      const slots = new Map(
        [...implants, ...boosters].map((e) => [
          e.typeId,
          { kind: e.kind ?? ('implant' as const), slot: e.slot },
        ])
      );
      return { implants, boosters, slotOf: (id: number) => slots.get(id) };
    });
    pending = load;
    load.catch(() => {
      if (pending === load) pending = null;
    });
  }
  return pending;
}
