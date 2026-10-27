/**
 * A pilot's standing with the active Character as the Contacts page draws it
 * (`StandingIcon`: the client's colour tag). The tooltip says whether the
 * contact is the pilot's own or their corporation's or alliance's.
 */
import { useTranslation } from 'react-i18next';
import { StandingIcon } from '@/components/ui/StandingIcon';
import { standingTier } from '@/components/ui/standingTier';
import type { ContactStanding } from '@/engine/pilotList/standing';

export function PilotStandingTag({ standing }: { standing: ContactStanding }) {
  const { t } = useTranslation();
  const tier = t(`contacts.tier.${standingTier(standing.value)}`);
  const label =
    standing.via === 'character'
      ? t('contacts.standingSummaryOwn', { tier, value: standing.value })
      : t('contacts.standingSummaryInherited', {
          tier,
          value: standing.value,
          source: t(`contacts.source.${standing.via}`),
        });
  return <StandingIcon value={standing.value} label={label} />;
}
