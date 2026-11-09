import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { ActionResult } from '@/features/settings/settingsFields';
import { useApplyUpdate } from '@/features/settings/useUpdateState';
import { useUpdateStatus } from './updateAvailable';

/**
 * The phone's one-press update, a full-width accent row at the top of the More
 * sheet's pages. Shown only while a newer build waits; the same row grammar as
 * Settings → "Update available". When the page stays up, the reason shows under
 * the row.
 */
export function MoreSheetUpdateRow() {
  const { t } = useTranslation();
  const available = useUpdateStatus((state) => state.status === 'available');
  const { updating, notice, update } = useApplyUpdate();
  if (!available) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 border border-l-2 border-line border-l-accent bg-accent/10 py-2 pr-2 pl-3">
        <span className="text-sm text-accent">{t('settings.update.available')}</span>
        <Button size="md" variant="accent" className="shrink-0" loading={updating} onClick={update}>
          {t('settings.updateAction')}
        </Button>
      </div>
      {notice && <ActionResult kind={notice.kind}>{notice.text}</ActionResult>}
    </div>
  );
}
