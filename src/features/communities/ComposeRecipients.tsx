import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { GrantNote } from '@/app/GrantNote';
import { Button, SearchInput, Spinner } from '@/components/ui';
import { activeOptionClassName } from '@/components/ui/controlStyles';
import { MAX_REQUEST_MAILS_PER_DAY, type RequestRecipient } from '@/engine/communities/requests';
import { moveHighlight, type ComboboxNavKey } from '@/lib/comboboxNav';
import { cx } from '@/lib/cx';
import { rankedSearch } from '@/lib/rankedSearch';
import { SEND_MAIL, type ComposeRecipientsState } from './useComposeRecipients';
import type {
  RequestMailOutcome,
  RequestMailRecipient,
  RequestMailResult,
} from './requestMailSend';

const SUGGESTIONS = 6;
const NAV_KEYS: readonly string[] = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

/**
 * "Mail to": the ticked Members as removable chips, and a field that finds any
 * other Member by name and adds them as a chip. Everyone in the Community can
 * see the Request; mail goes only to the chips, one mail each.
 */
export function ComposeRecipientsField({ state }: { state: ComposeRecipientsState }) {
  const { t } = useTranslation();
  const id = useId();
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState<number | null>(null);
  const chips = state.recipients.filter((r) => state.isTicked(r));
  const matches = useMemo(
    () =>
      query.trim() === ''
        ? []
        : rankedSearch(
            state.recipients.filter((r) => !state.isTicked(r)),
            query,
            { primary: (r) => r.characterName, limit: SUGGESTIONS }
          ),
    // isTicked closes over state; its inputs are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.recipients, state.ticked, query]
  );

  function choose(recipient: RequestRecipient) {
    state.setTicked(recipient.uid, true);
    setQuery('');
    setHighlight(null);
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (NAV_KEYS.includes(event.key)) {
      event.preventDefault();
      setHighlight(moveHighlight(event.key as ComboboxNavKey, highlight, matches.length));
    } else if (event.key === 'Enter') {
      const pick = matches[highlight ?? 0];
      if (pick) {
        event.preventDefault();
        choose(pick);
      }
    } else if (event.key === 'Backspace' && query === '' && chips.length > 0) {
      state.setTicked(chips[chips.length - 1].uid, false);
    }
  }
  const exceeds = state.ready && state.mailsLeft > 0 && state.ticked.length > state.mailsLeft;

  return (
    <div className="space-y-1.5">
      <label htmlFor={`${id}-input`} className="block text-xs text-text-dim">
        {t('communities.board.compose.mailTo')}
      </label>
      {state.lacksScope && (
        <GrantNote
          characterId={state.characterId}
          endpoints={SEND_MAIL}
          title={t('communities.board.compose.grantTitle')}
          hint={t('communities.board.compose.grantHint')}
          actionLabel={t('communities.board.compose.grantAction')}
        />
      )}
      {!state.ready ? (
        <Spinner size="sm" label={t('communities.loading')} />
      ) : (
        <>
          <ul
            aria-label={t('communities.board.compose.recipientsLabel')}
            className="flex flex-wrap gap-1.5 empty:hidden"
          >
            {chips.map((r) => (
              <li
                key={r.uid}
                className="inline-flex items-center gap-1 rounded-full border border-line bg-panel-2 py-0.5 pr-1 pl-2.5 text-xs"
              >
                <span>
                  {r.characterName}
                  {r.self && (
                    <span className="text-text-dim"> {t('communities.board.compose.you')}</span>
                  )}
                </span>
                <button
                  type="button"
                  aria-label={t('communities.board.compose.unmail', { name: r.characterName })}
                  className="grid size-5 place-items-center rounded-full text-text-dim hover:bg-panel hover:text-text touch:size-8"
                  onClick={() => state.setTicked(r.uid, false)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="relative">
            <SearchInput
              id={`${id}-input`}
              value={query}
              disabled={state.lacksScope}
              placeholder={t('communities.board.compose.mailToPlaceholder')}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(null);
              }}
              onKeyDown={onKeyDown}
              aria-controls={`${id}-list`}
              aria-activedescendant={highlight === null ? undefined : `${id}-${highlight}`}
              role="combobox"
              aria-expanded={matches.length > 0}
              aria-autocomplete="list"
            />
            {matches.length > 0 && (
              <ul
                id={`${id}-list`}
                role="listbox"
                aria-label={t('communities.board.compose.mailToResults')}
                className="absolute inset-x-0 top-full z-20 mt-1 flex flex-col rounded-xs border border-line-bright bg-panel p-1 shadow-lg"
              >
                {matches.map((r, index) => (
                  <li
                    key={r.uid}
                    id={`${id}-${index}`}
                    role="option"
                    aria-selected={index === highlight}
                    className={cx(
                      'flex cursor-pointer items-center gap-2 rounded-xs px-2 py-1 hover:bg-panel-2 touch:min-h-11',
                      index === highlight && `bg-panel-2 ${activeOptionClassName}`
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(r)}
                  >
                    <span className="min-w-0 flex-1 truncate">{r.characterName}</span>
                    {r.shared > 0 && (
                      <span className="shrink-0 text-xs text-text-dim">
                        {t('communities.board.compose.shares', { count: r.shared })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
      <p className="text-xs text-text-dim">
        {state.mailsUnknown
          ? t('communities.board.compose.recipientsIntroUnknown')
          : t('communities.board.compose.recipientsIntro', {
              used: state.mailsToday ?? 0,
              max: MAX_REQUEST_MAILS_PER_DAY,
            })}
      </p>
      {state.librariesFailed && (
        <p role="status" className="text-xs text-warning">
          {t('communities.board.compose.recipientsFailed')}
        </p>
      )}
      {state.ready && state.mailsLeft === 0 && (
        <p role="status" className="text-xs text-warning">
          {t('communities.board.compose.capNone')}
        </p>
      )}
      {exceeds && (
        <p role="status" className="text-xs text-warning">
          {t('communities.board.compose.capNote', { count: state.mailsLeft })}
        </p>
      )}
    </div>
  );
}

/** The mailing and done phases: a text result per recipient, then Done. */
export function ComposeMailResults({
  phase,
  mailed,
  mailResults,
  onClose,
}: {
  phase: 'mailing' | 'done';
  mailed: readonly RequestMailRecipient[];
  mailResults: readonly RequestMailResult[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 text-sm">
      <p role="status" className="text-xs text-text-dim">
        {phase === 'mailing'
          ? t('communities.board.compose.mailing', {
              done: mailResults.length,
              count: mailed.length,
            })
          : t('communities.board.compose.resultsSummary', {
              sent: mailResults.filter((r) => r.outcome === 'sent').length,
              count: mailed.length,
            })}
      </p>
      <ul
        aria-label={t('communities.board.compose.resultsLabel')}
        className="divide-y divide-line rounded-xs border border-line"
      >
        {mailed.map((recipient) => {
          const outcome: RequestMailOutcome | undefined = mailResults.find(
            (r) => r.uid === recipient.uid
          )?.outcome;
          return (
            <li key={recipient.uid} className="flex items-center gap-2 px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate">{recipient.name}</span>
              <span className="min-w-0 text-xs text-text-dim">
                {outcome ? (
                  t(`communities.board.compose.result.${outcome}`)
                ) : (
                  <Spinner size="sm" label={t('communities.loading')} />
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end">
        <Button size="sm" variant="primary" onClick={onClose} disabled={phase === 'mailing'}>
          {t('communities.board.compose.done')}
        </Button>
      </div>
    </div>
  );
}
