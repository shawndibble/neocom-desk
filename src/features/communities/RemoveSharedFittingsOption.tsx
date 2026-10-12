import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';

/**
 * The logout prompt's "also remove the Fittings I shared" (issue #3605, ADR
 * 0018), on by default: logging a Character out of this device should not
 * leave its shared data readable by Communities it can no longer manage. Shown
 * only where sync is set up, since nothing is shared without it.
 */
export function RemoveSharedFittingsOption({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <label className={`${tappableRowClassName} mt-3 flex items-center gap-2 text-xs`}>
      <Checkbox
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{t('communities.fittings.removeOnLogout')}</span>
    </label>
  );
}
