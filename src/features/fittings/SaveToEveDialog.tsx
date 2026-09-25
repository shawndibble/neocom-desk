/**
 * Save to EVE (issue #1540): names the open Fitting, optionally picks an
 * existing In-game Fitting to replace, and shows what EVE drops on the way
 * out (module state, charge-to-module binding, implants) before saving.
 * Overwriting deletes the old In-game Fitting only after the replacement
 * save has already succeeded (`saveToEve.ts`), so a failed save never costs
 * the pilot their original — a failed *delete* after a successful save
 * leaves both, which this dialog reports rather than hiding.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
} from '@/components/ui';
import { GrantBanner } from '@/app/GrantNote';
import type { CharacterFitting } from '@/esi/endpoints';
import type { Fitting } from '@/engine/fittings/types';
import { loadInGameFittings } from './inGameFittings';
import { clampFittingName, IN_GAME_FITTING_NAME_MAX, saveFittingToEve } from './saveToEve';

const NEW_TARGET = 'new';

interface SaveToEveDialogProps {
  open: boolean;
  onClose: () => void;
  characterId: number;
  fitting: Fitting;
  /** Called once the save itself succeeds (whether or not the overwrite delete also did) — the caller refreshes its In-game Fittings list. */
  onSaved: () => void;
}

export function SaveToEveDialog({
  open,
  onClose,
  characterId,
  fitting,
  onSaved,
}: SaveToEveDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(() => clampFittingName(fitting.name));
  const [existing, setExisting] = useState<CharacterFitting[]>([]);
  const [target, setTarget] = useState<string>(NEW_TARGET);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** The save was refused for want of the Fittings Permission, which a re-login can grant. */
  const [needsPermission, setNeedsPermission] = useState(false);
  /** Set when a save succeeded but the overwritten Fitting's delete failed — the pilot now has both. */
  const [overwriteFailure, setOverwriteFailure] = useState<{
    name: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a fresh open, not a render-time derivation
    setName(clampFittingName(fitting.name));
    setTarget(NEW_TARGET);
    setErrorMessage(null);
    setNeedsPermission(false);
    setOverwriteFailure(null);
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

  async function handleSave() {
    const trimmed = name.trim();
    if (trimmed === '') return;
    setSaving(true);
    setErrorMessage(null);
    setNeedsPermission(false);
    try {
      const result = await saveFittingToEve({
        characterId,
        fitting,
        name: trimmed,
        description: '',
        overwriteFittingId: overwriteTarget?.fitting_id,
      });
      if (!result.ok) {
        if (result.needsPermission) setNeedsPermission(true);
        else setErrorMessage(result.message);
        return;
      }
      onSaved();
      if (result.overwriteError !== null) {
        setOverwriteFailure({ name: trimmed, message: result.overwriteError });
      } else {
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  if (overwriteFailure !== null) {
    return (
      <Modal open={open} onClose={onClose} title={t('fittings.saveToEve.overwriteFailedTitle')}>
        <div className="space-y-3">
          <p className="text-sm text-text">
            {t('fittings.saveToEve.overwriteFailed', overwriteFailure)}
          </p>
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
        {overwriteTarget && (
          <p role="alert" className="text-xs text-warning">
            {t('fittings.saveToEve.overwriteConfirm', { name: overwriteTarget.name })}
          </p>
        )}
        {needsPermission && (
          <GrantBanner
            variant="ghost"
            characterId={characterId}
            endpoints={['postCharacterFitting']}
            title={t('fittings.saveToEve.grantTitle')}
            hint={t('fittings.saveToEve.grantHint')}
            actionLabel={t('fittings.saveToEve.grantAction')}
          />
        )}
        {errorMessage && (
          <p role="alert" className="text-xs text-danger">
            {t('fittings.saveToEve.errorTitle')}: {errorMessage}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            {t('fittings.saveToEve.cancel')}
          </Button>
          <Button
            type="submit"
            variant={overwriteTarget ? 'danger' : 'primary'}
            disabled={saving || name.trim() === ''}
          >
            {saving
              ? t('fittings.saveToEve.saving')
              : overwriteTarget
                ? t('fittings.saveToEve.overwriteAction')
                : t('fittings.saveToEve.saveAction')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
