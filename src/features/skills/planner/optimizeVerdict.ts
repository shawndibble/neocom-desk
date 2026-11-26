import type { PlaceRemapsResult } from '@/engine/optimizer';
import { MIN_MEANINGFUL_SAVINGS_SECONDS } from './planHeaderStats';

export type OptimizeVerdict =
  | { kind: 'saves'; savingsSeconds: number }
  | { kind: 'noRemapsAvailable' }
  | { kind: 'markersAtEnd' }
  | { kind: 'noGain' };

function savesVerdict(result: PlaceRemapsResult): OptimizeVerdict | null {
  return result.savingsSeconds >= MIN_MEANINGFUL_SAVINGS_SECONDS
    ? { kind: 'saves', savingsSeconds: result.savingsSeconds }
    : null;
}

export function remapVerdict(result: PlaceRemapsResult, remapCount: number): OptimizeVerdict {
  if (remapCount <= 0) return { kind: 'noRemapsAvailable' };
  return savesVerdict(result) ?? { kind: 'noGain' };
}

export function markerVerdict(result: PlaceRemapsResult): OptimizeVerdict {
  const saves = savesVerdict(result);
  if (saves) return saves;
  return result.segments.some((segment) => segment.remap)
    ? { kind: 'noGain' }
    : { kind: 'markersAtEnd' };
}
