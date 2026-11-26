import type { Translate } from '@/lib/translate';
import { standingTier } from '@/components/ui/standingTier';
import type { EffectiveStanding } from './contactStandings';

export function standingLabel(t: Translate, standing: EffectiveStanding | null): string | null {
  if (standing === null) return null;
  const tier = t(`contacts.tier.${standingTier(standing.standing)}`);
  return standing.inherited
    ? t('contacts.standingSummaryInherited', {
        tier,
        value: standing.standing,
        source: t(`contacts.source.${standing.source}`),
      })
    : t('contacts.standingSummaryOwn', { tier, value: standing.standing });
}
