import { useTranslation } from 'react-i18next';
import { formatIsk } from '@/lib/isk';
import { DialogShell } from './BookDialogs';

export function LeaveMoonOwnerDialog({
  name,
  owed,
  removing,
  onClose,
  onLeave,
}: {
  name: string;
  owed: number | null;
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
