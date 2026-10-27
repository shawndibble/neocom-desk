import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { db } from '@/db';
import { useOnline } from '@/stores/network';
import { ResetViewPreferences } from '@/features/settings/ResetViewPreferences';
import { ActionResult, SettingsHint } from '@/features/settings/settingsFields';

export function DataPanel() {
  const { t } = useTranslation();
  const [clearedConfirm, setClearedConfirm] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const online = useOnline();
  const clearConfirmTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(clearConfirmTimer.current), []);

  async function handleClearCache() {
    // Blunt on purpose, matching `esi/cachePurge.ts`'s own tier-2 fallback:
    // every character's rows, global reference data included. `esiCache` is
    // 100% re-derivable from ESI, so over-clearing costs a refetch, not data.
    await db.esiCache.clear();
    setClearedConfirm(true);
    clearConfirmTimer.current = setTimeout(() => setClearedConfirm(false), 2000);
  }

  return (
    <Panel title={t('settings.dataTitle')}>
      <div className="space-y-2">
        <SettingsHint>{t('settings.dataHint')}</SettingsHint>
        <Button size="sm" onClick={() => setConfirmingClear(true)}>
          {t('settings.clearCache')}
        </Button>
        <ConfirmDialog
          open={confirmingClear}
          title={t('settings.clearCacheTitle')}
          body={t(online ? 'settings.clearCacheBody' : 'settings.clearCacheBodyOffline')}
          actionLabel={t('settings.clearCacheAction')}
          cancelLabel={t('characters.cancel')}
          failedLabel={t('settings.clearCacheFailed')}
          onConfirm={handleClearCache}
          onClose={() => setConfirmingClear(false)}
        />
        {clearedConfirm && (
          <ActionResult kind="success">{t('settings.clearCacheConfirm')}</ActionResult>
        )}
        <ResetViewPreferences />
      </div>
    </Panel>
  );
}
