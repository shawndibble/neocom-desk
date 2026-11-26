import { parseRigKind } from '@/engine/industry/rigScope';
import type { RigFit, RigKind } from '@/engine/industry/types';
import type { Translate } from '@/lib/translate';

export function rigKindLabel(kind: RigKind, t: Translate): string {
  const parsed = parseRigKind(kind);
  if (parsed === null) return t('industry.rigNone');
  const line = t(`industry.rig${parsed.line === 'me' ? 'Me' : 'Te'}${parsed.tier}`);
  if (parsed.target === undefined) return line;
  return t('industry.rigScoped', { target: t(`industry.rigTarget.${parsed.target}`), kind: line });
}

export function rigFitSummaryLabel(fit: RigFit, t: Translate): string {
  const fitted = fit.filter((kind) => kind !== 'none').map((kind) => rigKindLabel(kind, t));
  return fitted.length > 0 ? fitted.join(', ') : t('industry.rigNone');
}
