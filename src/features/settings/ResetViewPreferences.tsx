import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { markStoresStale } from '@/app/staleStoresReload';
import { db } from '@/db';
import { VIEW_PREFERENCE_KEYS } from '@/lib/viewPreferenceKeys';
import { ActionConfirmation } from '@/features/settings/ActionConfirmation';

/**
 * Undoes the preferences pages remember silently — a pinned sort, a filter, a
 * remembered tab. Those have no control of their own anywhere, by design
 * (a duplicate control on this page is a second thing that can drift from what
 * the page itself shows), which is exactly why there has to be one way back.
 *
 * Scoped to `VIEW_PREFERENCE_KEYS`, never `db.settings.clear()`: that table
 * also holds hand-made character groups, saved skill comparisons, starred
 * characters and ore classifications. Clearing it wholesale would destroy work
 * the pilot did on purpose.
 */
export function ResetViewPreferences() {
  const { t } = useTranslation();
  const [confirmed, setConfirmed] = useState(false);

  async function handleReset() {
    await db.settings.bulkDelete([...VIEW_PREFERENCE_KEYS]);
    setConfirmed(true);
    setTimeout(() => setConfirmed(false), 2000);
    // Every one of these is read through a `createLocalSetting` store that has
    // already hydrated, so the rows are gone but the stores still hold the old
    // values. Settings shows none of them, so the reload that re-hydrates them
    // waits for the next route out of Settings (`StaleStoresReloader`) — a
    // reload here would wipe the confirmation before it could be read.
    markStoresStale();
  }

  return (
    <div className="space-y-2 border-t border-line pt-3">
      <p className="max-w-2xl text-xs text-text-dim">{t('settings.resetViewPrefsHint')}</p>
      <Button size="sm" onClick={() => void handleReset()}>
        {t('settings.resetViewPrefs')}
      </Button>
      {confirmed && <ActionConfirmation message={t('settings.resetViewPrefsConfirm')} />}
    </div>
  );
}
