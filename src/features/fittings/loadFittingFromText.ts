import { getKillmail } from '@/esi/endpoints';
import { fetchKillmailHash } from '@/lib/zkillboard';
import { fetchEveWorkbenchEft } from '@/lib/eveWorkbench';
import { loadText, type LoadOutcome, type ShareLoad } from '@/engine/fittings/load';
import { loadItemNameMap } from '@/features/skills/typeCatalog';
import { loadFittingSlots, typeName } from '@/sde/loadSde';
import { loadMutaplasmidLookup } from '@/features/abyssal/mutaplasmidData';

export function loadFittingFromText(text: string): Promise<LoadOutcome | ShareLoad> {
  return loadText(text, {
    catalog: async () => {
      const [typeByName, slotByTypeId, mutaplasmids] = await Promise.all([
        loadItemNameMap(),
        loadFittingSlots(),
        loadMutaplasmidLookup().catch(() => undefined),
      ]);
      return { typeByName, slotByTypeId, mutaplasmids };
    },
    hullName: typeName,
    killmailHash: fetchKillmailHash,
    killmailVictim: async (killmailId, hash) =>
      (await getKillmail(killmailId, hash)).data?.victim ?? null,
    eveWorkbenchEft: fetchEveWorkbenchEft,
  });
}
