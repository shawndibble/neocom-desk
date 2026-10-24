/**
 * Where a Director's Doctrine Fit comes from: one of their saved Fittings, or pasted
 * EFT. Both become the engine's snapshot (`engine/srpDoctrineFit.ts`); the catalogs load on use.
 */
import type { FittingRecord } from '@/db';
import { decodeFittingShare } from '@/engine/fittings/fittingShare';
import { shareToFitting } from '@/engine/fittings/shareMapper';
import type { DoctrineFitSnapshot } from '@/engine/srpDoctrine';
import {
  doctrineFitFromEft,
  doctrineFitFromFitting,
  type DoctrineEftResult,
} from '@/engine/srpDoctrineFit';
import { loadMutaplasmidLookup } from '@/features/abyssal/mutaplasmidData';
import { loadItemNameMap } from '@/features/skills/typeCatalog';
import { loadFittingSlots } from '@/sde/loadSde';

/** The saved Fitting's modules and rigs; null when its share code no longer decodes. */
export async function snapshotFromFitting(
  record: Pick<FittingRecord, 'code' | 'name'>
): Promise<DoctrineFitSnapshot | null> {
  const decoded = await decodeFittingShare(record.code);
  if (!decoded.ok) return null;
  return doctrineFitFromFitting(shareToFitting(decoded.value, record.name));
}

/** Pasted EFT text; `unresolved` lists the lines that are not part of the fit. */
export async function snapshotFromEft(text: string): Promise<DoctrineEftResult> {
  const [typeByName, slotByTypeId, mutaplasmids] = await Promise.all([
    loadItemNameMap(),
    loadFittingSlots(),
    loadMutaplasmidLookup().catch(() => undefined),
  ]);
  return doctrineFitFromEft(text, typeByName, slotByTypeId, mutaplasmids);
}
