import { useTranslation } from 'react-i18next';
import { formatIsk } from '@/lib/isk';
import { DialogShell } from './BookDialogs';

/**
 * Leave (or end a pending removal now): shows what the accounting corporation still
 * owes before anything is revoked. `owed` is the whole-ISK balance from the moon
 * owner's page; `null` when that page has not loaded.
 */
export function LeaveMoonOwnerDialog({
  name,
  owed,
  removing,
  onClose,
  onLeave,
}: {
  name: string;
  owed: number | null;
  /** A removal is pending: the dialog ends it now instead of leaving. */
  removing: boolean;
  onClose: () => void;
  onLeave: () => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <DialogShell
      open
      onClose={onClose}
      title={t(
        removing
          ? 'corpTaxBook.moons.ownerView.removal.confirmTitle'
          : 'corpTaxBook.moons.owner.leave.title'
      )}
      confirmLabel={t(
        removing
          ? 'corpTaxBook.moons.ownerView.removal.action'
          : 'corpTaxBook.moons.owner.leave.confirm'
      )}
      canConfirm
      danger
      run={onLeave}
    >
      <p>
        {owed === null
          ? t('corpTaxBook.moons.owner.leave.owedUnknown', { name })
          : owed > 0
            ? t('corpTaxBook.moons.owner.leave.owed', { name, isk: formatIsk(owed) })
            : t('corpTaxBook.moons.owner.leave.nothingOwed', { name })}
      </p>
      <p className="mt-2 text-text-dim">
        {removing
          ? t('corpTaxBook.moons.ownerView.removal.confirmBody', { name })
          : t('corpTaxBook.moons.owner.leave.body')}
      </p>
    </DialogShell>
  );
}
