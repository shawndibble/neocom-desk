import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { markStoresStale } from '@/app/staleStoresReload';
import { db } from '@/db';
import { VIEW_PREFERENCE_KEYS } from '@/lib/viewPreferenceKeys';
import { ActionResult, SettingsHint } from '@/features/settings/settingsFields';

export function ResetViewPreferences() {
  const { t } = useTranslation();
  const [confirmed, setConfirmed] = useState(false);

  async function handleReset() {
    await db.settings.bulkDelete([...VIEW_PREFERENCE_KEYS]);
    setConfirmed(true);
    setTimeout(() => setConfirmed(false), 2000);
    markStoresStale();
  }

  return (
    <div className="space-y-2 border-t border-line pt-3">
      <SettingsHint>{t('settings.resetViewPrefsHint')}</SettingsHint>
      <Button size="sm" onClick={() => void handleReset()}>
        {t('settings.resetViewPrefs')}
      </Button>
      {confirmed && (
        <ActionResult kind="success">{t('settings.resetViewPrefsConfirm')}</ActionResult>
      )}
    </div>
  );
}
