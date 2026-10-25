import type { TFunction } from 'i18next';
import type { MoveHull } from '@/engine/assets/movePlan';
import { ownedAria, ownedText } from './ownedHullText';

export function OwnedMark({ t, hull }: { t: TFunction; hull: MoveHull }) {
  const text = ownedText(t, hull);
  if (!text) return null;
  return (
    <span
      className="shrink-0 text-xs font-semibold whitespace-nowrap text-success tabular-nums"
      aria-label={ownedAria(t, hull)}
    >
      {text}
    </span>
  );
}
