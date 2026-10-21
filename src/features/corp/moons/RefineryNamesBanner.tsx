import { useTranslation } from 'react-i18next';
import { ReauthBanner } from '@/components/ui';

/**
 * The moon owner's grant is from before refinery names were read (#4654): optional and quiet,
 * one line beside the page. Its action is the same grant round trip as Reconnect; the ledger
 * keeps syncing either way.
 */
export function RefineryNamesBanner({ onGrant }: { onGrant: () => void }) {
  const { t } = useTranslation();
  return (
    <ReauthBanner
      variant="ghost"
      compact
      title={t('corpTaxBook.moons.ownerView.refineryNames.title')}
      hint={t('corpTaxBook.moons.ownerView.refineryNames.hint')}
      actionLabel={t('corpTaxBook.moons.ownerView.refineryNames.action')}
      onLogin={onGrant}
    />
  );
}
