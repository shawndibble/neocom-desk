import { useEffect, useId, useState } from 'react';
import { InlineError } from '@/components/ui/InlineError';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  LiveNote,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
} from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { GrantBanner } from '@/app/GrantNote';
import type { CharacterFitting } from '@/esi/endpoints';
import type { Fitting } from '@/engine/fittings/types';
import { useOnline } from '@/stores/network';
import { loadInGameFittings } from './inGameFittings';
import { clampFittingName, IN_GAME_FITTING_NAME_MAX, saveFittingToEve } from './saveToEve';
import { DialogFooter } from '@/components/ui/DialogFooter';

const NEW_TARGET = 'new';

interface SaveToEveDialogProps {
  open: boolean;
  onClose: () => void;
  characterId: number;
  fitting: Fitting;
  description?: string;
  onSaved: () => void;
  onSaveToMyFittings?: () => Promise<boolean>;
}

export function SaveToEveDialog({
  open,
  onClose,
  characterId,
  fitting,
  description = '',
  onSaved,
  onSaveToMyFittings,
}: SaveToEveDialogProps) {
  const { t } = useTranslation();
  const online = useOnline();
  const nameReasonId = useId();
  const offlineReasonId = useId();
  const [name, setName] = useState(() => clampFittingName(fitting.name));
  const [existing, setExisting] = useState<CharacterFitting[]>([]);
  const [target, setTarget] = useState<string>(NEW_TARGET);
  const [alsoSave, setAlsoSave] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [offlineFailed, setOfflineFailed] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [overwriteFailure, setOverwriteFailure] = useState<{
    name: string;
    message: string;
  } | null>(null);
  const [myFittingsFailed, setMyFittingsFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a fresh open, not a render-time derivation
    setName(clampFittingName(fitting.name));
    setTarget(NEW_TARGET);
    setErrorMessage(null);
    setOfflineFailed(false);
    setUnconfirmed(false);
    setNeedsPermission(false);
    setOverwriteFailure(null);
    setMyFittingsFailed(false);
    setAlsoSave(true);
    void (async () => {
      try {
        const { cached } = await loadInGameFittings(characterId);
        setExisting(cached?.data ?? []);
      } catch {
        setExisting([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- opens fresh for whichever Fitting/Character triggered it; re-running on their later changes would reset an in-progress edit.
  }, [open]);

  const overwriteTarget =
    target === NEW_TARGET ? null : (existing.find((f) => String(f.fitting_id) === target) ?? null);

  const nameMissing = name.trim() === '';
  const offlineBlocked = !online && !(onSaveToMyFittings && alsoSave);

  async function handleSave() {
    const trimmed = name.trim();
    if (trimmed === '') return;
    setSaving(true);
    setErrorMessage(null);
    setOfflineFailed(false);
    setUnconfirmed(false);
    setNeedsPermission(false);
    try {
      if (!online) {
        if (onSaveToMyFittings && alsoSave) {
          const saved = await onSaveToMyFittings().then(
            (ok) => ok,
            () => false
          );
          if (saved) onClose();
          else setMyFittingsFailed(true);
        }
        return;
      }
      const result = await saveFittingToEve({
        characterId,
        fitting,
        name: trimmed,
        description,
        overwriteFittingId: overwriteTarget?.fitting_id,
      });
      if (!result.ok) {
        if (result.kind === 'offline') setOfflineFailed(true);
        else if (result.kind === 'unconfirmed') setUnconfirmed(true);
        else if (result.needsPermission) setNeedsPermission(true);
        else setErrorMessage(result.message);
        return;
      }
      onSaved();
      let mineFailed = false;
      if (onSaveToMyFittings && alsoSave) {
        mineFailed = await onSaveToMyFittings().then(
          (saved) => !saved,
          () => true
        );
      }
      if (mineFailed) setMyFittingsFailed(true);
      if (result.overwriteError !== null) {
        setOverwriteFailure({ name: trimmed, message: result.overwriteError });
      } else if (!mineFailed) {
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  if (myFittingsFailed || overwriteFailure !== null) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title={
          myFittingsFailed
            ? t('fittings.saveToEve.myFittingsFailedTitle')
            : t('fittings.saveToEve.overwriteFailedTitle')
        }
      >
        <div className="space-y-3">
          {myFittingsFailed && (
            <p className="text-sm text-text">{t('fittings.saveToEve.myFittingsFailed')}</p>
          )}
          {overwriteFailure !== null && (
            <p className="text-sm text-text">
              {t('fittings.saveToEve.overwriteFailed', overwriteFailure)}
            </p>
          )}
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              {t('fittings.saveToEve.close')}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={t('fittings.saveToEve.title')}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
      >
        <div>
          <label className="mb-1 block text-xs text-text-dim" htmlFor="save-to-eve-name">
            {t('fittings.saveToEve.nameLabel')}
          </label>
          <TextInput
            id="save-to-eve-name"
            value={name}
            maxLength={IN_GAME_FITTING_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            className="w-full"
          />
          <p className="mt-1 text-right text-[0.6875rem] text-text-dim">
            {name.length}/{IN_GAME_FITTING_NAME_MAX}
          </p>
        </div>
        {existing.length > 0 && (
          <div>
            <label className="mb-1 block text-xs text-text-dim" htmlFor="save-to-eve-target">
              {t('fittings.saveToEve.targetLabel')}
            </label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="save-to-eve-target" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW_TARGET}>{t('fittings.saveToEve.targetNew')}</SelectItem>
                {existing.map((f) => (
                  <SelectItem key={f.fitting_id} value={String(f.fitting_id)}>
                    {t('fittings.saveToEve.targetOverwrite', { name: f.name })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <p className="text-xs text-text-dim">{t('fittings.saveToEve.dropsNote')}</p>
        {onSaveToMyFittings && (
          <label className={`${tappableRowClassName} inline-flex items-center gap-2 text-sm`}>
            <Checkbox checked={alsoSave} onChange={(e) => setAlsoSave(e.target.checked)} />
            {t('fittings.saveToEve.alsoSaveLabel')}
          </label>
        )}
        {overwriteTarget && (
          <LiveNote className="text-xs text-warning">
            {t('fittings.saveToEve.overwriteConfirm', { name: overwriteTarget.name })}
          </LiveNote>
        )}
        {needsPermission && (
          <GrantBanner
            variant="ghost"
            characterId={characterId}
            endpoints={['postCharacterFitting']}
          />
        )}
        {!online ? (
          <div id={offlineReasonId}>
            <LiveNote className="text-xs text-warning">
              {t(
                onSaveToMyFittings
                  ? 'fittings.saveToEve.needsConnectionKeepMine'
                  : 'fittings.saveToEve.needsConnection'
              )}
            </LiveNote>
          </div>
        ) : (
          offlineFailed && <InlineError>{t('fittings.saveToEve.offlineFailed')}</InlineError>
        )}
        {unconfirmed && (
          <LiveNote className="text-xs text-warning">
            {t('fittings.saveToEve.unconfirmed')}
          </LiveNote>
        )}
        {errorMessage && (
          <InlineError>
            {t('fittings.saveToEve.errorTitle')}: {errorMessage}
          </InlineError>
        )}
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            {t('fittings.saveToEve.cancel')}
          </Button>
          {nameMissing && !saving && (
            <span id={nameReasonId} className="mr-auto text-[0.6875rem] text-text-dim">
              {t('fittings.myFittings.saveAsNewNeedsName')}
            </span>
          )}
          <Button
            type="submit"
            variant={overwriteTarget ? 'danger' : 'primary'}
            loading={saving}
            aria-disabled={nameMissing || offlineBlocked || undefined}
            aria-describedby={
              nameMissing ? nameReasonId : offlineBlocked ? offlineReasonId : undefined
            }
          >
            {!online
              ? t('fittings.saveToEve.saveMineOnlyAction')
              : overwriteTarget
                ? t('fittings.saveToEve.overwriteAction')
                : t('fittings.saveToEve.saveAction')}
          </Button>
        </DialogFooter>
      </form>
    </Modal>
  );
}
