/**
 * Where a Director's Doctrine Fit comes from: one of their saved Fittings, or pasted
 * EFT. Both become the engine's snapshot (`engine/srpDoctrineFit.ts`), which SRP matches, plus
 * the whole fit, which is stored as its share code for members to open (#6202). The catalogs
 * load on use.
 */
import type { FittingRecord } from '@/db';
import { decodeFittingShare, encodeFittingShare } from '@/engine/fittings/fittingShare';
import { fittingToShareInput, shareToFitting } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import type { DoctrineFitSnapshot } from '@/engine/srpDoctrine';
import {
  doctrineFitFromEft,
  doctrineFitFromFitting,
  type DoctrineEftResult,
} from '@/engine/srpDoctrineFit';
import { loadMutaplasmidLookup } from '@/features/abyssal/mutaplasmidData';
import { loadItemNameMap } from '@/features/skills/typeCatalog';
import { loadFittingSlots } from '@/sde/loadSde';

/** A source read: the snapshot SRP matches and the whole fit members open. */
export interface DoctrineSourceFit {
  snapshot: DoctrineFitSnapshot;
  fitting: Fitting;
}

/** The saved Fitting's snapshot and whole fit; null when its share code no longer decodes. */
export async function doctrineFromFitting(
  record: Pick<FittingRecord, 'code' | 'name'>
): Promise<DoctrineSourceFit | null> {
  const decoded = await decodeFittingShare(record.code);
  if (!decoded.ok) return null;
  const fitting = shareToFitting(decoded.value, record.name);
  return { snapshot: doctrineFitFromFitting(fitting), fitting };
}

/**
 * The whole fit as the Fitting Share Code stored beside the snapshot, under the Doctrine Fit's
 * name. Undefined when it is too large to encode: the fit then saves as a snapshot alone.
 */
export async function doctrineShareCode(
  fitting: Fitting,
  name: string
): Promise<string | undefined> {
  const encoded = await encodeFittingShare(fittingToShareInput({ ...fitting, name }));
  return encoded.ok ? encoded.payload : undefined;
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
