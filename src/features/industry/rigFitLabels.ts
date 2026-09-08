/**
 * i18n plumbing for a rig fit (issue #609): which `industry.rig*` key names
 * one slot's kind, and how a whole 3-slot fit reads as one chip value.
 */
import type { RigFit, RigKind } from '@/engine/industry/types';

const RIG_KIND_LABEL_KEY: Readonly<Record<RigKind, string>> = {
  none: 'industry.rigNone',
  meT1: 'industry.rigMeT1',
  meT2: 'industry.rigMeT2',
  teT1: 'industry.rigTeT1',
  teT2: 'industry.rigTeT2',
};

/** The `industry.rig*` i18n key naming one rig kind. */
export function rigKindLabelKey(kind: RigKind): string {
  return RIG_KIND_LABEL_KEY[kind];
}

/** A whole fit as one line: every fitted rig's label, comma-joined, or "None" when every slot is empty. */
export function rigFitSummaryLabel(fit: RigFit, t: (key: string) => string): string {
  const fitted = fit.filter((kind) => kind !== 'none').map((kind) => t(rigKindLabelKey(kind)));
  return fitted.length > 0 ? fitted.join(', ') : t('industry.rigNone');
}
