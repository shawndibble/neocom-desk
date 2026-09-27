import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, Modal, Panel } from '@/components/ui';
import { db } from '@/db';
import { isSyncConfigured } from '@/app/syncStatus';
import { logoutAllCharacters } from '@/features/character/logoutAll';
import {
  deleteAllLocalData,
  purgeAllRemoteCharacterData,
} from '@/features/character/deleteAllCharacterData';

type Dialog = 'logout' | 'delete';

/**
 * Settings → This device. Two actions: forget every login on this browser, or
 * that plus erasing every Character's synced data and this browser's app data.
 * Once no Character is left, `RequireCharacter` sends the app to /login by
 * itself, so logout never navigates and a deferred purge is reported before
 * the local wipe, while this dialog can still be seen. Delete reloads after.
 */
export function DevicePanel() {
  const { t, i18n } = useTranslation();
  const characters = useLiveQuery(() => db.characters.toArray());
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  // Characters whose remote purge could not run now; set once step one is done.
  const [deferred, setDeferred] = useState<number[] | null>(null);
  const syncConfigured = isSyncConfigured();

  function openDialog(next: Dialog) {
    setFailed(false);
    setDeferred(null);
    setDialog(next);
  }

  async function run(action: () => Promise<void>) {
    setWorking(true);
    setFailed(false);
    try {
      await action();
    } catch {
      // Stay in the dialog so the pilot can see it and try again.
      setFailed(true);
    } finally {
      setWorking(false);
    }
  }

  const confirmLogout = () =>
    run(async () => {
      await logoutAllCharacters(syncConfigured);
      setDialog(null);
    });

  const confirmDelete = () =>
    run(async () => {
      if (syncConfigured && deferred === null) {
        const notPurged = await purgeAllRemoteCharacterData();
        if (notPurged.length > 0) {
          setDeferred(notPurged);
          return;
        }
      }
      await deleteAllLocalData(syncConfigured);
      // A fresh boot: no store, query or timer from before the wipe survives.
      window.location.replace('/');
    });

  const loggedIn = characters?.length ?? 0;
  const deferredNames = deferred
    ? new Intl.ListFormat(i18n.language, { style: 'long', type: 'conjunction' }).format(
        deferred.map(
          (id) => characters?.find((character) => character.characterId === id)?.name ?? String(id)
        )
      )
    : '';

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
            onClick={() => openDialog('logout')}
          >
            {t('settings.deviceLogoutAction')}
          </Button>
        </div>
        <div className="space-y-1.5 border-t border-line pt-3">
          <span className="block text-xs font-semibold">{t('settings.deviceDeleteLabel')}</span>
          <p className="text-xs text-text-dim">
            {t(syncConfigured ? 'settings.deviceDeleteHint' : 'settings.deviceDeleteHintLocalOnly')}
          </p>
          <Button
            variant="danger"
            size="sm"
            disabled={loggedIn === 0}
            onClick={() => openDialog('delete')}
          >
            {t('settings.deviceDeleteAction')}
          </Button>
        </div>
      </div>
      <Modal
        open={dialog === 'logout'}
        onClose={() => {
          if (!working) setDialog(null);
        }}
        title={t('settings.deviceLogoutConfirmTitle')}
      >
        <p className="text-xs text-text-dim">
          {t('settings.deviceLogoutConfirm', { count: loggedIn })}
        </p>
        {failed && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {t('settings.deviceLogoutFailed')}
          </p>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" disabled={working} onClick={() => setDialog(null)}>
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
      <Modal
        open={dialog === 'delete'}
        onClose={() => {
          // Past a partial purge there is no going back: the purged Characters'
          // remote data is gone, and an incremental sync would not re-push rows
          // older than its cursor. Only finishing is offered.
          if (!working && !deferred) setDialog(null);
        }}
        title={t('settings.deviceDeleteConfirmTitle')}
      >
        <p className="text-xs text-text-dim">
          {deferred
            ? t('settings.deviceDeleteDeferred', { count: deferred.length, names: deferredNames })
            : t(
                syncConfigured
                  ? 'settings.deviceDeleteConfirm'
                  : 'settings.deviceDeleteConfirmLocalOnly',
                { count: loggedIn }
              )}
        </p>
        {failed && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {t('settings.deviceDeleteFailed')}
          </p>
        )}
        <div className="mt-3 flex justify-end gap-2">
          {!deferred && (
            <Button size="sm" disabled={working} onClick={() => setDialog(null)}>
              {t('characters.cancel')}
            </Button>
          )}
          <Button
            variant="danger"
            size="sm"
            disabled={working}
            onClick={() => void confirmDelete()}
          >
            {t(deferred ? 'settings.deviceDeleteFinish' : 'settings.deviceDeleteAction')}
          </Button>
        </div>
      </Modal>
    </Panel>
  );
}
