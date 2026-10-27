/**
 * Contact standing beside an entity's name on a page other than Contacts —
 * a contract issuer, a mail sender. Wraps `StandingIcon` with a label that
 * says *why* the standing applies (the pilot's own entry vs. one inherited
 * from the entity's corp/alliance/faction), rather than duplicating the
 * icon's SVG here.
 *
 * Renders nothing for a stranger: `effectiveStanding` returning null means
 * none of the pilot's own contact entries match any tier of the target, and
 * a neutral-looking badge next to every unmatched name would be a false
 * signal, not the absence of one.
 */
import { useTranslation } from 'react-i18next';
import { StandingIcon } from '@/components/ui/StandingIcon';
import { standingTier } from '@/components/ui/standingTier';
import type { EffectiveStanding } from './contactStandings';

interface StandingTagProps {
  standing: EffectiveStanding | null;
  className?: string;
}

export function StandingTag({ standing, className }: StandingTagProps) {
  const { t } = useTranslation();
  if (standing === null) return null;
  const tier = t(`contacts.tier.${standingTier(standing.standing)}`);
  const label = standing.inherited
    ? t('contacts.standingSummaryInherited', {
        tier,
        value: standing.standing,
        source: t(`contacts.source.${standing.source}`),
      })
    : t('contacts.standingSummaryOwn', { tier, value: standing.standing });
  return <StandingIcon value={standing.standing} label={label} className={className} />;
}
