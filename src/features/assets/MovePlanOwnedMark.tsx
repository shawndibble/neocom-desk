import type { TFunction } from 'i18next';
import type { MoveHull } from '@/engine/assets/movePlan';
import { ownedAria, ownedText } from './ownedHullText';

export function OwnedMark({ t, hull }: { t: TFunction; hull: MoveHull }) {
  const text = ownedText(t, hull);
  if (!text) return null;
  const aria = ownedAria(t, hull);
  return (
    <span className="shrink-0 text-xs font-semibold whitespace-nowrap text-success tabular-nums">
      <span aria-hidden={aria ? true : undefined}>{text}</span>
      {aria && <span className="sr-only">{aria}</span>}
    </span>
  );
}
