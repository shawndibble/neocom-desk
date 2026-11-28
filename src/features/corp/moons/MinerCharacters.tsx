import { useState } from 'react';
import { InlineError } from '@/components/ui/InlineError';
import { useTranslation } from 'react-i18next';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { UnlinkConfirm } from './UnlinkConfirm';
import { plainTextActionClassName } from '@/components/ui/plainTextActionClassName';
import { textActionClassName } from '@/components/ui/textActionClassName';
import type { MinerRow } from '@/engine/corpTaxBook/bookView';
import { useCorporationName } from './lateNoticeMailing';
import { GroupMinersDialog } from './GroupMinersDialog';
import { callableErrorText } from './feederErrorText';
import { useBook } from './useBook';
import { tapTargetClassName } from './sectionHelpers';

interface StoredGrouping {
  id: string;
  pendingConfirmation?: number[];
  officerClaimed?: number[];
}

export function MinerCharacters({ miner }: { miner: MinerRow }) {
  const { t } = useTranslation();
  const { names, edit, canEdit, data, characterId, corporationId } = useBook();
  const [declining, setDeclining] = useState(false);
  const corpName = useCorporationName();
  const [grouping, setGrouping] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stored = (data.state.miners as StoredGrouping[]).find((m) => m.id === miner.id);
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
  const claimed = new Set(stored?.officerClaimed ?? []);
  const canDecline = stored !== undefined && claimed.has(characterId);
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
  const [unlinking, setUnlinking] = useState<number | null>(null);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className={plainTextActionClassName(tapTargetClassName)}>
            {t('corpTaxBook.moons.grouping.count', { count: miner.characterIds.length })}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label={t('corpTaxBook.moons.grouping.count', { count: miner.characterIds.length })}
          className="w-80 max-w-[calc(100vw-2rem)] space-y-2 p-3"
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
                  {canEdit && claimed.has(characterId) && (
                    <span className="text-xs text-text-dim" data-testid="officer-claim">
                      {' '}
                      · {t('corpTaxBook.moons.grouping.officerClaim')}
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
                        className={textActionClassName('shrink-0 whitespace-nowrap')}
                        onClick={() => void makeMain(characterId)}
                      >
                        {t('corpTaxBook.moons.grouping.makeMain')}
                      </button>
                    )}
                    {characterId !== miner.mainCharacterId && isStored && (
                      <span aria-hidden="true" className="self-center text-text-dim">
                        ·
                      </span>
                    )}
                    {isStored && (
                      <button
                        type="button"
                        className={textActionClassName('shrink-0 whitespace-nowrap')}
                        onClick={() => setUnlinking(characterId)}
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
          {canEdit && claimed.size > 0 && (
            <p className="text-xs text-text-dim">
              {t('corpTaxBook.moons.grouping.officerClaimHint')}
            </p>
          )}
          {error && <InlineError>{error}</InlineError>}
          {canDecline && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDeclining(true);
                setOpen(false);
              }}
            >
              {t('corpTaxBook.moons.grouping.declineLink')}
            </Button>
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
      {declining && (
        <ConfirmDialog
          open
          title={t('corpTaxBook.moons.grouping.declineTitle')}
          body={t('corpTaxBook.moons.grouping.declineBody', {
            name: names.character(characterId),
            corp: corpName ?? String(corporationId),
          })}
          actionLabel={t('corpTaxBook.moons.grouping.declineLink')}
          failedLabel={t('corpTaxBook.moons.grouping.declineFailed')}
          onClose={() => setDeclining(false)}
          onConfirm={async () => {
            const { declineLink } = await import('@/features/corpTaxBook/playerApi');
            await declineLink(characterId, { corporationId, minerId: miner.id });
            setDeclining(false);
          }}
        />
      )}
      {unlinking !== null && (
        <UnlinkConfirm
          title={t('corpTaxBook.moons.grouping.unlinkTitle')}
          body={t('corpTaxBook.moons.grouping.unlinkBody', { name: names.character(unlinking) })}
          actionLabel={t('corpTaxBook.moons.grouping.unlink')}
          failedLabel={t('corpTaxBook.moons.grouping.unlinkFailed')}
          onClose={() => setUnlinking(null)}
          onUnlink={async (leftOn) => {
            await edit({ action: 'unlink', minerId: miner.id, characterId: unlinking, leftOn });
          }}
        />
      )}
      {grouping && <GroupMinersDialog open onClose={() => setGrouping(false)} miner={miner} />}
    </>
  );
}
