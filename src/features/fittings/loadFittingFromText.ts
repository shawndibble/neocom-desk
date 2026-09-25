/**
 * The text half of a Load (`engine/fittings/load.ts`'s `loadText`) bound to
 * the real type catalog, hull names, zKillboard and ESI. Shared by
 * `useFittingWorkspace`'s paste box and the compare picker's Load section
 * (`useFittingPicker`) — neither owns the other's state, so this returns an
 * outcome instead of committing anywhere.
 */
import { getKillmail } from '@/esi/endpoints';
import { fetchKillmailHash } from '@/lib/zkillboard';
import { loadText, type LoadOutcome, type ShareLoad } from '@/engine/fittings/load';
import { loadItemNameMap } from '@/features/skills/typeCatalog';
import { loadFittingSlots, typeName } from '@/sde/loadSde';

/** Loads EFT text, a DNA string / chat link, a Share Link, an eveship.fit link, or a killmail link. */
export function loadFittingFromText(text: string): Promise<LoadOutcome | ShareLoad> {
  return loadText(text, {
    catalog: async () => {
      const [typeByName, slotByTypeId] = await Promise.all([loadItemNameMap(), loadFittingSlots()]);
      return { typeByName, slotByTypeId };
    },
    hullName: typeName,
    killmailHash: fetchKillmailHash,
    killmailVictim: async (killmailId, hash) =>
      (await getKillmail(killmailId, hash)).data?.victim ?? null,
  });
}
