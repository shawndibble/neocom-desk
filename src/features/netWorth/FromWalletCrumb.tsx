import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { OriginCrumb } from '@/components/OriginCrumb';
import { isFromWallet } from '@/features/character/viewedCharacter';

export function FromWalletCrumb() {
  const { t } = useTranslation();
  const state = useLocation().state as { from?: string } | null;
  if (state?.from !== 'wallet' && !isFromWallet(state)) return null;
  return <OriginCrumb to="/wallet">{t('wallet.netWorth.walletCrumb')}</OriginCrumb>;
}
