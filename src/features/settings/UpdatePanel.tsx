import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { useApplyUpdate, useUpdateStatusLine } from './useUpdateState';
import { ActionResult } from '@/features/settings/settingsFields';

/** Settings → App & backup: the update state, then the button that applies it. */
export function UpdatePanel() {
  const { t } = useTranslation();
  const { status, line } = useUpdateStatusLine();
  const { updating, failed, update } = useApplyUpdate();
  const available = status === 'available';

  return (
    <Panel title={t('settings.updateTitle')}>
      <div className="space-y-2">
        <p
          role="status"
          className={available ? 'min-h-5 text-sm text-accent' : 'min-h-5 text-sm text-text-dim'}
        >
          {line}
        </p>
        <Button
          size="sm"
          variant={available ? 'accent' : 'ghost'}
          className={available ? undefined : 'text-text-dim!'}
          loading={updating}
          onClick={update}
        >
          {t('settings.updateAction')}
        </Button>
        {failed && <ActionResult kind="error">{t('settings.updateFailed')}</ActionResult>}
      </div>
    </Panel>
  );
}
