import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useApplyUpdate } from '@/features/settings/useUpdateState';
import { useUpdateStatus } from './updateAvailable';

/**
 * The desktop rail's Upgrade icon, at the right end of the Settings row. Shown
 * only while a newer build waits; one press applies it (`forceUpdate`, behind
 * the boot cover) with no trip into Settings. When the page stays up, the
 * reason is read out and replaces the tooltip.
 */
export function RailUpgradeButton() {
  const { t } = useTranslation();
  const available = useUpdateStatus((state) => state.status === 'available');
  const { updating, notice, update } = useApplyUpdate();
  if (!available) return null;
  return (
    <>
      <IconButton
        variant="plain"
        tone="accent"
        size="sm"
        icon={<Icon.Upgrade />}
        label={t('nav.upgrade')}
        tooltip={notice?.text ?? t('nav.upgrade')}
        busy={updating}
        onClick={update}
      />
      {notice && (
        <span role="status" className="sr-only">
          {notice.text}
        </span>
      )}
    </>
  );
}
