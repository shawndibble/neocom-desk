import { useTranslation } from 'react-i18next';
import { ReauthBanner } from '@/components/ui';
import type { GrantLack } from './grantLack';

/**
 * The moon owner's grant is from before refinery names or the Extraction notices were read:
 * optional and quiet, one line beside the page. Its action is the same grant round trip as
 * Reconnect, which asks for every scope at once; the ledger keeps syncing either way.
 */
export function GrantAgainBanner({ lacks, onGrant }: { lacks: GrantLack; onGrant: () => void }) {
  const { t } = useTranslation();
  const k = (key: string) => `corpTaxBook.moons.ownerView.grantAgain.${lacks}.${key}`;
  return (
    <ReauthBanner
      variant="ghost"
      compact
      title={t(k('title'))}
      hint={t(k('hint'))}
      actionLabel={t('corpTaxBook.moons.ownerView.grantAgain.action')}
      onLogin={onGrant}
    />
  );
}
