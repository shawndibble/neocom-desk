import { useCharacters } from '@/features/character/useCharacters';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, Field, Fields, Modal, Panel, Tooltip } from '@/components/ui';
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
import { DialogFooter } from '@/components/ui/DialogFooter';

type Dialog = 'logout' | 'delete';

export function DevicePanel() {
  const { t, i18n } = useTranslation();
  const characters = useCharacters();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [removeShared, setRemoveShared] = useState(true);
  const [unpurged, setUnpurged] = useState<number[] | null>(null);
  const [leaveFailed, setLeaveFailed] = useState<number[]>([]);
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
    <Panel>
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
            <Tooltip content={loggedIn === 0 ? t('settings.deviceNoneLoggedIn') : null}>
              <Button
                variant="danger"
                size="sm"
                aria-disabled={loggedIn === 0 || undefined}
                onClick={() => openDialog('logout')}
              >
                {t('settings.deviceLogoutOpen')}
              </Button>
            </Tooltip>
          </Field>
          <Field
            label={t('settings.deviceDeleteLabel')}
            note={t(
              syncConfigured ? 'settings.deviceDeleteHint' : 'settings.deviceDeleteHintLocalOnly'
            )}
          >
            <Tooltip content={loggedIn === 0 ? t('settings.deviceNoneLoggedIn') : null}>
              <Button
                variant="danger"
                size="sm"
                aria-disabled={loggedIn === 0 || undefined}
                onClick={() => openDialog('delete')}
              >
                {t('settings.deviceDeleteOpen')}
              </Button>
            </Tooltip>
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
        <DialogFooter className="mt-3">
          <Button
            ref={cancelLogoutRef}

            aria-disabled={working || undefined}
            onClick={() => setDialog(null)}
          >
            {t('characters.cancel')}
          </Button>
          <Button variant="danger" loading={working} onClick={() => void confirmLogout()}>
            {t('settings.deviceLogoutAction')}
          </Button>
        </DialogFooter>
      </Modal>
      <Modal
        open={dialog === 'delete'}
        onClose={() => {
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
        <DialogFooter className="mt-3">
          {!unpurged && (
            <Button aria-disabled={working || undefined} onClick={() => setDialog(null)}>
              {t('characters.cancel')}
            </Button>
          )}
          <Button variant="danger" loading={working} onClick={() => void confirmDelete()}>
            {t(unpurged ? 'settings.deviceDeleteFinish' : 'settings.deviceDeleteAction')}
          </Button>
        </DialogFooter>
      </Modal>
    </Panel>
  );
}
