/**
 * BPC Sourcing rows adapted for Blueprint Acquisition (issue #838): loads the
 * shared public-contracts snapshot once, narrows it to one Trade Hub's
 * region, and groups by blueprint typeID for `acquisitionForLookup`'s cheap
 * per-node lookup.
 *
 * Degrades to "no offers" rather than an error when BPC Sourcing sync isn't
 * configured or the snapshot hasn't landed yet — `selectBlueprintTier`'s
 * price cascade then falls straight through to the BPO's own hub sell price,
 * exactly as if no contract offer were listed for this blueprint.
 */
import { useEffect, useMemo, useState } from 'react';
import { loadPublicBpcContracts } from '@/features/bpcContracts/syncedContracts';
import { effectivePrice, type BpcContractRow } from '@/engine/contracts/bpcSearch';
import type { BpcOffer } from '@/engine/industry/blueprintAcquisition';

/** BPC Sourcing offers for one blueprint type, in one region — the per-node lookup `acquisitionForLookup` reads. */
export function offersForRegion(
  bpcRows: readonly BpcContractRow[],
  regionId: number
): (blueprintTypeID: number) => readonly BpcOffer[] {
  const byType = new Map<number, BpcOffer[]>();
  for (const row of bpcRows) {
    if (row.regionId !== regionId) continue;
    const list = byType.get(row.typeId) ?? [];
    list.push({
      me: row.me,
      te: row.te,
      runs: row.runs,
      quantity: row.quantity,
      price: effectivePrice(row),
      isMultiType: row.isMultiType,
    });
    byType.set(row.typeId, list);
  }
  return (blueprintTypeID) => byType.get(blueprintTypeID) ?? [];
}

export function useBpcAcquisitionOffers(
  characterId: number,
  regionId: number
): (blueprintTypeID: number) => readonly BpcOffer[] {
  const [rows, setRows] = useState<readonly BpcContractRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadPublicBpcContracts(characterId).then((cached) => {
      if (cancelled || !cached) return;
      setRows(cached.data.rows);
    });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  const offersFor = useMemo(() => offersForRegion(rows, regionId), [rows, regionId]);

  return offersFor;
}
