import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import type { MinerRow } from '@/engine/corpTaxBook/bookView';
import { GroupMinersDialog } from './GroupMinersDialog';
import { callableErrorText } from './feederErrorText';
import { useBook } from './useBook';

/** The stored grouping carries the guest-confirmation state the engine's Miner shape leaves out (D26b). */
interface StoredGrouping {
  id: string;
  pendingConfirmation?: number[];
}

/**
 * A Miner's characters (D18, issue #4194): who gets the mail, who is waiting
 * for their own confirmation, and the officer's group / unlink actions. On the
 * Miner's page it is the "3 characters" link in the header, opening a popover:
 * the link is the owner's call, where §6c's popover cue is field chrome.
 */
export function MinerCharacters({ miner }: { miner: MinerRow }) {
  const { t } = useTranslation();
  const { names, edit, canEdit, data } = useBook();
  const [grouping, setGrouping] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stored = (data.state.miners as StoredGrouping[]).find((m) => m.id === miner.id);
  // A character that said no is no longer in the group, so its answer is listed on its own (#4210).
  const declined = (data.groupingAnswers ?? []).filter(
    (a) =>
      a.answer === 'declined' &&
      a.minerId === miner.id &&
      !miner.characterIds.includes(a.characterId)
  );
  const confirmed = new Set(
    (data.groupingAnswers ?? [])
      .filter((a) => a.answer === 'confirmed' && a.minerId === miner.id)
      .map((a) => a.characterId)
  );
  const pending = new Set(stored?.pendingConfirmation ?? []);
  const isStored = stored !== undefined;

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(callableErrorText(t, e, 'corpTaxBook.moons.dialogs.failed'));
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
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className={entityLinkClassName()}>
            {t('corpTaxBook.moons.grouping.count', { count: miner.characterIds.length })}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-80 max-w-[calc(100vw-2rem)] space-y-2 p-3"
          // The dialog takes focus itself when Group opens it.
          onCloseAutoFocus={(e) => grouping && e.preventDefault()}
        >
          <p className="text-xs text-text-dim">{t('corpTaxBook.moons.grouping.hint')}</p>
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
                  {confirmed.has(characterId) && !pending.has(characterId) && (
                    <span className="text-xs text-success">
                      {' '}
                      · {t('corpTaxBook.moons.grouping.confirmed')}
                    </span>
                  )}
                </span>
                {canEdit && miner.characterIds.length > 1 && (
                  <span className="flex gap-3">
                    {characterId !== miner.mainCharacterId && (
                      <button
                        type="button"
                        className={entityLinkClassName('shrink-0 whitespace-nowrap')}
                        onClick={() => void makeMain(characterId)}
                      >
                        {t('corpTaxBook.moons.grouping.makeMain')}
                      </button>
                    )}
                    {isStored && (
                      <button
                        type="button"
                        className={entityLinkClassName('shrink-0 whitespace-nowrap')}
                        onClick={() => void unlink(characterId)}
                      >
                        {t('corpTaxBook.moons.grouping.unlink')}
                      </button>
                    )}
                  </span>
                )}
              </li>
            ))}
            {declined.map((a) => (
              <li key={`declined-${a.characterId}`} className="text-sm">
                {names.character(a.characterId)}
                <span className="text-xs text-danger">
                  {' '}
                  ·{' '}
                  {t(
                    a.via === 'verify-link'
                      ? 'corpTaxBook.moons.grouping.declinedByLink'
                      : 'corpTaxBook.moons.grouping.declined'
                  )}
                </span>
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
          {canEdit && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setGrouping(true);
                setOpen(false);
              }}
            >
              {t('corpTaxBook.moons.grouping.group')}
            </Button>
          )}
        </PopoverContent>
      </Popover>
      {grouping && <GroupMinersDialog open onClose={() => setGrouping(false)} miner={miner} />}
    </>
  );
}
