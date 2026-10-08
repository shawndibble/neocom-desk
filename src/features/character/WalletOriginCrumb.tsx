import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { isFromWallet } from './viewedCharacter';

/** "‹ Wallet" — shown only when the reader arrived from the Wallet chart (route state), not on a plain visit. */
export function WalletOriginCrumb() {
  const { t } = useTranslation();
  const { state } = useLocation();
  if (!isFromWallet(state)) return null;
  return (
    <Link to="/wallet" className={`${inlineLinkClassName} inline-flex items-center gap-1 text-xs`}>
      <Icon.Back size={Icon.ICON_SIZE.sm} aria-hidden="true" />
      {t('character.crumb.wallet')}
    </Link>
  );
}
