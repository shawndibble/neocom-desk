import type { useTranslation } from 'react-i18next';
import type { HardpointKind } from '@/engine/fittings/hardpoints';
import { RING_VIEW } from '@/engine/fittings/ringLayout';
import type { Budget } from './RimGauge';
import { fmt1 } from '../stats/fixedFormat';

/**
 * A kind's hardpoints in words — the tooltip, and the text a screen reader
 * gets for the pips (which are a picture) — naming any overfit, so it isn't
 * told by colour alone.
 */
export function hardpointLabel(
  t: ReturnType<typeof useTranslation>['t'],
  kind: HardpointKind,
  used: number | null,
  total: number
): string {
  if (used === null) return t(`fittings.ring.hardpoints.${kind}Loading`, { total });
  const label = t(`fittings.ring.hardpoints.${kind}`, { used, total });
  return used > total ? t('fittings.ring.hardpoints.over', { label, count: used - total }) : label;
}

export function pct(value: number): string {
  return `${(value / RING_VIEW) * 100}%`;
}

export function budgetValue(
  t: ReturnType<typeof useTranslation>['t'],
  budget: Budget
): string | null {
  const { used, total } = budget;
  if (used === null || total === null) return null;
  return t(budget.valueKey, { used: fmt1(used), total: fmt1(total) });
}
