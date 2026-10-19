import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel, textActionClassName } from '@/components/ui';
import type { MinerRow } from '@/engine/corpTaxBook/bookView';
import { GroupMinersDialog } from './GroupMinersDialog';
import { editErrorMessage, useBook } from './useBook';

/** The stored grouping carries the guest-confirmation state the engine's Miner shape leaves out (D26b). */
interface StoredGrouping {
  id: string;
  pendingConfirmation?: number[];
}

/**
 * A Miner's characters (D18, issue #4194): who gets the mail, who is waiting
 * for their own confirmation, and the officer's group / unlink actions.
 */
export function MinerCharacters({ miner }: { miner: MinerRow }) {
  const { t } = useTranslation();
  const { names, edit, canEdit, data } = useBook();
  const [grouping, setGrouping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stored = (data.state.miners as StoredGrouping[]).find((m) => m.id === miner.id);
  const pending = new Set(stored?.pendingConfirmation ?? []);
  const isStored = stored !== undefined;

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(editErrorMessage(e));
    }
  };
  const makeMain = (characterId: number) =>
    run(() =>
      edit({
        action: 'setMiner',
        minerId: miner.id,
        characterIds: miner.characterIds,
        mainCharacterId: characterId,
      })
    );
  const unlink = (characterId: number) =>
    // The server records the unlink in the book, so no officer's sync puts it straight back (D26).
    run(() => edit({ action: 'unlink', minerId: miner.id, characterId }));

  return (
    <Panel
      title={t('corpTaxBook.moons.grouping.title')}
      meta={<span className="text-xs text-text-dim">{t('corpTaxBook.moons.grouping.hint')}</span>}
      actions={
        canEdit ? (
          <Button size="sm" variant="ghost" onClick={() => setGrouping(true)}>
            {t('corpTaxBook.moons.grouping.group')}
          </Button>
        ) : undefined
      }
    >
      <ul className="space-y-1.5 text-sm">
        {miner.characterIds.map((characterId) => (
          <li key={characterId} className="flex items-center justify-between gap-3">
            <span>
              {names.character(characterId)}
              {characterId === miner.mainCharacterId && (
                <span className="text-xs text-text-dim">
                  {' '}
                  · {t('corpTaxBook.moons.grouping.main')}
                </span>
              )}
              {pending.has(characterId) && (
                <span className="text-xs text-warning">
                  {' '}
                  · {t('corpTaxBook.moons.grouping.pending')}
                </span>
              )}
            </span>
            {canEdit && miner.characterIds.length > 1 && (
              <span className="flex gap-3">
                {characterId !== miner.mainCharacterId && (
                  <button
                    type="button"
                    className={textActionClassName('shrink-0')}
                    onClick={() => void makeMain(characterId)}
                  >
                    {t('corpTaxBook.moons.grouping.makeMain')}
                  </button>
                )}
                {isStored && (
                  <button
                    type="button"
                    className={textActionClassName('shrink-0')}
                    onClick={() => void unlink(characterId)}
                  >
                    {t('corpTaxBook.moons.grouping.unlink')}
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
      {grouping && <GroupMinersDialog open onClose={() => setGrouping(false)} miner={miner} />}
    </Panel>
  );
}
