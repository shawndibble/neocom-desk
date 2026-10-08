/**
 * The "‹ Wallet" crumb on a page the Wallet net worth table linked to (issue
 * #2935). Shown only when the link carried `state.from === 'wallet'`, so a
 * visit from the nav rail or a bookmark has no crumb. The same labelled-crumb
 * shape as `SettingsBackLink` (DESIGN §6c retires the bare back caret).
 */
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';

export function FromWalletCrumb() {
  const { t } = useTranslation();
  const state = useLocation().state as { from?: string } | null;
  if (state?.from !== 'wallet') return null;
  return (
    <Link
      to="/wallet"
      className={cx(
        'inline-flex min-h-11 items-center gap-1 rounded-xs px-2 text-xs text-text-dim hover:text-text active:text-text-dim md:min-h-0',
        interactiveClassName,
        focusRingClassName
      )}
    >
      <span aria-hidden="true">‹</span>
      {t('wallet.netWorth.walletCrumb')}
    </Link>
  );
}
