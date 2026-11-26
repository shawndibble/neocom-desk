import { encodeFittingShare } from '@/engine/fittings/fittingShare';
import { esiFittingToFitting } from '@/engine/fittings/esiFittingMapper';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import { loadInGameFittings } from '@/features/fittings/inGameFittings';
import { loadFittings } from '@/features/fittings/myFittings';
import type { SharedFittingInput } from './sharedFittings';

export async function collectFittingsToShare(characterId: number): Promise<SharedFittingInput[]> {
  const inputs: SharedFittingInput[] = (await loadFittings(characterId)).map((record) => ({
    source: 'saved',
    key: record.id,
    name: record.name,
    code: record.code,
  }));
  try {
    const { cached } = await loadInGameFittings(characterId);
    for (const inGame of cached?.data ?? []) {
      const encoded = await encodeFittingShare(
        fittingToShareInput(esiFittingToFitting(inGame).fitting)
      );
      if (encoded.ok) {
        inputs.push({
          source: 'game',
          key: String(inGame.fitting_id),
          name: inGame.name,
          code: encoded.payload,
        });
      }
    }
  } catch {}
  return inputs;
}
