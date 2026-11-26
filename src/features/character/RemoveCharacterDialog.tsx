import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import { useIsPhone } from '@/lib/useIsPhone';
import { clearNeedsLogin } from '@/stores/authFailure';
import { isSyncConfigured } from '@/app/syncStatus';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { removeCharacterAfterSync } from '@/features/character/removeCharacter';
import { UnsyncedChangesWarning } from '@/features/character/UnsyncedChangesWarning';
import { RemoveSharedOption } from '@/features/communities/RemoveSharedOption';
import { DialogFooter } from '@/components/ui/DialogFooter';

export interface RemoveTarget {
  id: number;
  name: string;
}

export function RemoveCharacterDialog({
  target,
  onClose,
  onFailed,
}: {
  target: RemoveTarget | null;
  onClose: () => void;
  onFailed: (name: string) => void;
}) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const focusAfterCommit = useFocusAfterCommit();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [removing, setRemoving] = useState(false);
  const [removeShared, setRemoveShared] = useState(true);
  const [seenTarget, setSeenTarget] = useState(target);
  if (seenTarget !== target) {
    setSeenTarget(target);
    if (target) setRemoveShared(true);
  }

  async function confirm() {
    if (!target) return;
    const { id, name } = target;
    const ids = Array.from(
      document.querySelectorAll<HTMLElement>('[data-character-select]'),
      (el) => el.dataset.characterSelect
    );
    const at = ids.indexOf(String(id));
    const cardButton = (cardId: string | undefined) => () =>
      cardId ? document.querySelector<HTMLElement>(`[data-character-select="${cardId}"]`) : null;
    setRemoving(true);
    try {
      await removeCharacterAfterSync(id, isSyncConfigured(), removeShared);
      void clearNeedsLogin(id);
      focusAfterCommit(
        cardButton(at >= 0 ? ids[at + 1] : undefined),
        cardButton(at > 0 ? ids[at - 1] : undefined),
        () => document.querySelector<HTMLElement>('h1')
      );
    } catch {
      onFailed(name);
    } finally {
      onClose();
      setRemoving(false);
    }
  }

  return (
    <Modal
      open={target !== null}
      onClose={() => {
        if (!removing) onClose();
      }}
      placement={phone ? 'sheet' : 'center'}
      title={t('characters.removeTitle', { name: target?.name ?? '' })}
      initialFocusRef={cancelRef}
    >
      {target && (
        <UnsyncedChangesWarning characterIds={[target.id]} syncConfigured={isSyncConfigured()} />
      )}
      <p className="text-xs text-text-dim">
        {target && t('characters.removeConfirm', { name: target.name })}
      </p>
      {target && (
        <RemoveSharedOption
          characterIds={[target.id]}
          checked={removeShared}
          onChange={setRemoveShared}
        />
      )}
      <DialogFooter className="mt-3">
        <Button ref={cancelRef} size="sm" aria-disabled={removing || undefined} onClick={onClose}>
          {t('characters.cancel')}
        </Button>
        <Button variant="danger" size="sm" loading={removing} onClick={() => void confirm()}>
          {t('characters.remove')}
        </Button>
      </DialogFooter>
    </Modal>
  );
}
