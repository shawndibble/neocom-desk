import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, Modal, Panel } from '@/components/ui';
import { db } from '@/db';
import { isSyncConfigured } from '@/app/syncStatus';
import { logoutAllCharacters } from '@/features/character/logoutAll';

/**
 * Settings → This device. One action today: forget every login on this
 * browser. Once no Character is left, `RequireCharacter` sends the app to
 * /login by itself, so nothing here navigates.
 */
export function DevicePanel() {
  const { t } = useTranslation();
  const count = useLiveQuery(() => db.characters.count());
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const syncConfigured = isSyncConfigured();

  async function confirmLogout() {
    setWorking(true);
    try {
      await logoutAllCharacters(syncConfigured);
    } finally {
      setWorking(false);
      setConfirming(false);
    }
  }

  const loggedIn = count ?? 0;

  return (
    <Panel title={t('settings.deviceTitle')}>
      <div className="max-w-md space-y-2">
        <p className="text-xs text-text-dim">
          {loggedIn > 0
            ? t('settings.deviceCharacters', { count: loggedIn })
            : t('settings.deviceCharactersNone')}
        </p>
        <div className="space-y-1.5 border-t border-line pt-3">
          <span className="block text-xs font-semibold">{t('settings.deviceLogoutLabel')}</span>
          <p className="text-xs text-text-dim">
            {t(syncConfigured ? 'settings.deviceLogoutHint' : 'settings.deviceLogoutHintLocalOnly')}
          </p>
          <Button
            variant="danger"
            size="sm"
            disabled={loggedIn === 0}
            onClick={() => setConfirming(true)}
          >
            {t('settings.deviceLogoutAction')}
          </Button>
        </div>
      </div>
      <Modal
        open={confirming}
        onClose={() => {
          if (!working) setConfirming(false);
        }}
        title={t('settings.deviceLogoutConfirmTitle')}
      >
        <p className="text-xs text-text-dim">
          {t('settings.deviceLogoutConfirm', { count: loggedIn })}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" disabled={working} onClick={() => setConfirming(false)}>
            {t('characters.cancel')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={working}
            onClick={() => void confirmLogout()}
          >
            {t('settings.deviceLogoutAction')}
          </Button>
        </div>
      </Modal>
    </Panel>
  );
}
