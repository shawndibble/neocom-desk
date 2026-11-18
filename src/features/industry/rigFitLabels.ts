/**
 * i18n plumbing for a rig fit (issue #609, scoped per product in #6392): the
 * label of one slot's kind, and how a whole 3-slot fit reads as one chip value.
 */
import { parseRigKind } from '@/engine/industry/rigScope';
import type { RigFit, RigKind } from '@/engine/industry/types';
import type { Translate } from '@/lib/translate';

/** One rig kind as the pilot reads it: "None", "ME II" (every product) or "Capital Ship ME II" (one rig group). */
export function rigKindLabel(kind: RigKind, t: Translate): string {
  const parsed = parseRigKind(kind);
  if (parsed === null) return t('industry.rigNone');
  const line = t(`industry.rig${parsed.line === 'me' ? 'Me' : 'Te'}${parsed.tier}`);
  if (parsed.target === undefined) return line;
  return t('industry.rigScoped', { target: t(`industry.rigTarget.${parsed.target}`), kind: line });
}

/** A whole fit as one line: every fitted rig's label, comma-joined, or "None" when every slot is empty. */
export function rigFitSummaryLabel(fit: RigFit, t: Translate): string {
  const fitted = fit.filter((kind) => kind !== 'none').map((kind) => rigKindLabel(kind, t));
  return fitted.length > 0 ? fitted.join(', ') : t('industry.rigNone');
}
