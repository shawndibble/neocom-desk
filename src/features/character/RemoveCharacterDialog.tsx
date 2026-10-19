import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import { useAuthFailure } from '@/stores/authFailure';
import { isSyncConfigured } from '@/app/syncStatus';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { removeCharacterAfterSync } from '@/features/character/removeCharacter';
import { UnsyncedChangesWarning } from '@/features/character/UnsyncedChangesWarning';
import { RemoveSharedOption } from '@/features/communities/RemoveSharedOption';

export interface RemoveTarget {
  id: number;
  name: string;
}

/** Confirm + run removal of one Character from this device. `target` null = closed. */
export function RemoveCharacterDialog({
  target,
  onClose,
  onFailed,
}: {
  target: RemoveTarget | null;
  onClose: () => void;
  /** The removal was rolled back whole — the Character is still listed. */
  onFailed: (name: string) => void;
}) {
  const { t } = useTranslation();
  const focusAfterCommit = useFocusAfterCommit();
  const cancelRef = useRef<HTMLButtonElement>(null);
  /** The removal is running: the confirm stays open and busy until it finishes. */
  const [removing, setRemoving] = useState(false);
  /** Also delete this Character's Shared Blueprints from its Communities (issue #3600). */
  const [removeShared, setRemoveShared] = useState(true);
  // Each new request starts with the box ticked again.
  const [seenTarget, setSeenTarget] = useState(target);
  if (seenTarget !== target) {
    setSeenTarget(target);
    if (target) setRemoveShared(true);
  }

  async function confirm() {
    if (!target) return;
    const { id, name } = target;
    // Neighbours are read now: the removed card is gone from the DOM afterwards.
    const ids = Array.from(
      document.querySelectorAll<HTMLElement>('[data-character-select]'),
      (el) => el.dataset.characterSelect
    );
    const at = ids.indexOf(String(id));
    const cardButton = (cardId: string | undefined) => () =>
      cardId ? document.querySelector<HTMLElement>(`[data-character-select="${cardId}"]`) : null;
    // The dialog stays open, busy, while the last push and cleanup run (up to
    // ~24 s offline) — closing it at once looked like the removal had finished.
    setRemoving(true);
    try {
      await removeCharacterAfterSync(id, isSyncConfigured(), removeShared);
      useAuthFailure.getState().dismissNeedsLogin(id);
      // Requested in the same batch as the dialog closing (`finally`), so the
      // request outlives the dialog's own focus return, which it retries past.
      focusAfterCommit(
        cardButton(at >= 0 ? ids[at + 1] : undefined),
        cardButton(at > 0 ? ids[at - 1] : undefined),
        () => document.querySelector<HTMLElement>('h1')
      );
    } catch {
      // The local removal is one transaction, so a failure left every row in
      // place — say so rather than leave the click looking ignored.
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
      title={t('characters.remove')}
      initialFocusRef={cancelRef}
    >
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
      {target && (
        <UnsyncedChangesWarning characterIds={[target.id]} syncConfigured={isSyncConfigured()} />
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button ref={cancelRef} size="sm" disabled={removing} onClick={onClose}>
          {t('characters.cancel')}
        </Button>
        <Button variant="danger" size="sm" loading={removing} onClick={() => void confirm()}>
          {t('characters.remove')}
        </Button>
      </div>
    </Modal>
  );
}
