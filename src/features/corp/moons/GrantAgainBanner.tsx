import { useTranslation } from 'react-i18next';
import { ReauthBanner } from '@/components/ui';
import type { GrantLack } from './grantLack';

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
