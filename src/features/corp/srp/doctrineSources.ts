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

export interface DoctrineSourceFit {
  snapshot: DoctrineFitSnapshot;
  fitting: Fitting;
}

export async function doctrineFromFitting(
  record: Pick<FittingRecord, 'code' | 'name'>
): Promise<DoctrineSourceFit | null> {
  const decoded = await decodeFittingShare(record.code);
  if (!decoded.ok) return null;
  const fitting = shareToFitting(decoded.value, record.name);
  return { snapshot: doctrineFitFromFitting(fitting), fitting };
}

export async function doctrineShareCode(
  fitting: Fitting,
  name: string
): Promise<string | undefined> {
  const encoded = await encodeFittingShare(fittingToShareInput({ ...fitting, name }));
  return encoded.ok ? encoded.payload : undefined;
}

export async function snapshotFromEft(text: string): Promise<DoctrineEftResult> {
  const [typeByName, slotByTypeId, mutaplasmids] = await Promise.all([
    loadItemNameMap(),
    loadFittingSlots(),
    loadMutaplasmidLookup().catch(() => undefined),
  ]);
  return doctrineFitFromEft(text, typeByName, slotByTypeId, mutaplasmids);
}
