import { useCharacters } from '@/features/character/useCharacters';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, Field, Fields, Modal, Panel } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { isSyncConfigured } from '@/app/syncStatus';
import { logoutAllCharacters } from '@/features/character/logoutAll';
import { UnsyncedChangesWarning } from '@/features/character/UnsyncedChangesWarning';
import { RemoveSharedOption } from '@/features/communities/RemoveSharedOption';
import { ActionResult, SettingsHint } from '@/features/settings/settingsFields';
import {
  deleteAllLocalData,
  leaveAllCommunities,
  loadAllCommunities,
  purgeAllRemoteCharacterData,
  type CharacterCommunity,
} from '@/features/character/deleteAllCharacterData';

type Dialog = 'logout' | 'delete';

/**
 * Settings → This device. Two actions: forget every login on this device, or
 * that plus erasing every Character's synced data and this device's app data.
 * Once no Character is left, `RequireCharacter` sends the app to /login by
 * itself, so logout never navigates and a failed purge is reported before
 * the local wipe, while this dialog can still be seen. Delete reloads after.
 */
export function DevicePanel() {
  const { t, i18n } = useTranslation();
  const characters = useCharacters();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Also delete what each Character shared with its Communities (issue #3600). */
  const [removeShared, setRemoveShared] = useState(true);
  // Characters whose remote purge could not run now; set once step one is done.
  const [unpurged, setUnpurged] = useState<number[] | null>(null);
  // Characters with a Community that could not be left (the wipe waits on them too).
  const [leaveFailed, setLeaveFailed] = useState<number[]>([]);
  /** Delete all data's Communities question: null until looked up. */
  const [communities, setCommunities] = useState<CharacterCommunity[] | null>(null);
  const [leaveCommunities, setLeaveCommunities] = useState(true);
  const syncConfigured = isSyncConfigured();
  const cancelLogoutRef = useRef<HTMLButtonElement>(null);

  function openDialog(next: Dialog) {
    setFailed(false);
    setUnpurged(null);
    setLeaveFailed([]);
    setCommunities(null);
    setLeaveCommunities(true);
    setDialog(next);
    // No network unless sync is on; a lookup that fails just hides the question.
    if (next === 'delete' && syncConfigured) {
      void loadAllCommunities().then(setCommunities, () => setCommunities([]));
    }
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
      await logoutAllCharacters(syncConfigured, removeShared);
      setDialog(null);
    });

  const confirmDelete = () =>
    run(async () => {
      if (syncConfigured && unpurged === null) {
        // Before the purge, while each Character can still sign in.
        const notLeft =
          leaveCommunities && communities?.length ? await leaveAllCommunities(communities) : [];
        const notPurged = await purgeAllRemoteCharacterData();
        if (notPurged.length > 0 || notLeft.length > 0) {
          setLeaveFailed(notLeft);
          setUnpurged(notPurged);
          return;
        }
      }
      await deleteAllLocalData(syncConfigured);
      // A fresh boot: no store, query or timer from before the wipe survives.
      window.location.replace('/');
    });

  const loggedIn = characters.length;
  const listNames = (ids: readonly number[]) =>
    new Intl.ListFormat(i18n.language, { style: 'long', type: 'conjunction' }).format(
      ids.map(
        (id) => characters.find((character) => character.characterId === id)?.name ?? String(id)
      )
    );
  const unpurgedNames = unpurged ? listNames(unpurged) : '';
  const administered = (communities ?? []).filter((entry) => entry.administered);

  return (
    <Panel title={t('settings.deviceTitle')}>
      <div className="space-y-4">
        <SettingsHint>
          {loggedIn > 0
            ? t('settings.deviceCharacters', { count: loggedIn })
            : t('settings.deviceCharactersNone')}
        </SettingsHint>
        <Fields variant="form">
          <Field
            label={t('settings.deviceLogoutLabel')}
            note={t(
              syncConfigured ? 'settings.deviceLogoutHint' : 'settings.deviceLogoutHintLocalOnly'
            )}
          >
            <Button
              variant="danger"
              size="sm"
              disabled={loggedIn === 0}
              onClick={() => openDialog('logout')}
            >
              {t('settings.deviceLogoutOpen')}
            </Button>
          </Field>
          <Field
            label={t('settings.deviceDeleteLabel')}
            note={t(
              syncConfigured ? 'settings.deviceDeleteHint' : 'settings.deviceDeleteHintLocalOnly'
            )}
          >
            <Button
              variant="danger"
              size="sm"
              disabled={loggedIn === 0}
              onClick={() => openDialog('delete')}
            >
              {t('settings.deviceDeleteOpen')}
            </Button>
          </Field>
        </Fields>
      </div>
      <Modal
        open={dialog === 'logout'}
        onClose={() => {
          if (!working) setDialog(null);
        }}
        title={t('settings.deviceLogoutConfirmTitle')}
        initialFocusRef={cancelLogoutRef}
      >
        <p className="text-xs text-text-dim">
          {t('settings.deviceLogoutConfirm', { count: loggedIn })}
        </p>
        <RemoveSharedOption
          characterIds={characters.map((character) => character.characterId)}
          checked={removeShared}
          onChange={setRemoveShared}
        />
        <UnsyncedChangesWarning
          characterIds={characters.map((character) => character.characterId)}
          syncConfigured={syncConfigured}
        />
        {failed && (
          <ActionResult kind="error" className="mt-2">
            {t('settings.deviceLogoutFailed')}
          </ActionResult>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <Button
            ref={cancelLogoutRef}
            size="sm"
            disabled={working}
            onClick={() => setDialog(null)}
          >
            {t('characters.cancel')}
          </Button>
          <Button variant="danger" size="sm" loading={working} onClick={() => void confirmLogout()}>
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
          if (!working && !unpurged) setDialog(null);
        }}
        title={t('settings.deviceDeleteConfirmTitle')}
      >
        <p className="text-xs text-text-dim">
          {unpurged
            ? unpurged.length > 0
              ? t('settings.deviceDeleteUnpurged', { count: unpurged.length, names: unpurgedNames })
              : t('settings.deviceDeleteLeaveFailed', {
                  count: leaveFailed.length,
                  names: listNames(leaveFailed),
                })
            : t(
                syncConfigured
                  ? 'settings.deviceDeleteConfirm'
                  : 'settings.deviceDeleteConfirmLocalOnly',
                { count: loggedIn }
              )}
        </p>
        {unpurged && unpurged.length > 0 && leaveFailed.length > 0 && (
          <p className="mt-2 text-xs text-text-dim">
            {t('settings.deviceDeleteLeaveFailed', {
              count: leaveFailed.length,
              names: listNames(leaveFailed),
            })}
          </p>
        )}
        {!unpurged && communities && communities.length > 0 && (
          <>
            <label className={`mt-3 flex items-center gap-2 text-xs ${tappableRowClassName}`}>
              <Checkbox
                checked={leaveCommunities}
                disabled={working}
                onChange={(event) => setLeaveCommunities(event.target.checked)}
              />
              {t('settings.deviceDeleteLeaveCommunities')}
            </label>
            {leaveCommunities && administered.length > 0 && (
              <p className="text-xs text-text-dim">
                {t('settings.deviceDeleteAdministered', {
                  names: new Intl.ListFormat(i18n.language, {
                    style: 'long',
                    type: 'conjunction',
                  }).format(administered.map((entry) => entry.name)),
                })}
              </p>
            )}
          </>
        )}
        {failed && (
          <ActionResult kind="error" className="mt-2">
            {t('settings.deviceDeleteFailed')}
          </ActionResult>
        )}
        <div className="mt-3 flex justify-end gap-2">
          {!unpurged && (
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
            {t(unpurged ? 'settings.deviceDeleteFinish' : 'settings.deviceDeleteAction')}
          </Button>
        </div>
      </Modal>
    </Panel>
  );
}
