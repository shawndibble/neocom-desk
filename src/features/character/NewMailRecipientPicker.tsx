/**
 * The New Mail recipient row: typed chips plus one combobox that lists the
 * Character's joined mailing lists (local) and ESI search hits for
 * characters, corporations and alliances.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { GrantNote } from '@/app/GrantNote';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { IconButton, TextInput } from '@/components/ui';
import { activeOptionClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { isOfflineFailure } from '@/esi/client';
import { cx } from '@/lib/cx';
import { moveHighlight } from '@/lib/comboboxNav';
import { useOnline } from '@/stores/network';
import {
  MAX_RECIPIENTS,
  filterMailingLists,
  recipientKey,
  type ComposeRecipient,
} from '@/engine/mailCompose';
import { loadMailingLists } from './mail';
import { MIN_RECIPIENT_SEARCH_LENGTH, searchTypedMailRecipients } from './mailRecipientSearch';

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_ENDPOINTS = ['getCharacterSearch'] as const;

interface NewMailRecipientPickerProps {
  characterId: number;
  recipients: readonly ComposeRecipient[];
  onAdd: (recipient: ComposeRecipient) => void;
  onRemove: (recipient: ComposeRecipient) => void;
  /** Id of the combobox input, for the composer's label. */
  inputId: string;
  inputRef?: React.Ref<HTMLInputElement>;
  invalid?: boolean;
  describedBy?: string;
}

export function NewMailRecipientPicker({
  characterId,
  recipients,
  onAdd,
  onRemove,
  inputId,
  inputRef,
  invalid,
  describedBy,
}: NewMailRecipientPickerProps) {
  const { t } = useTranslation();
  const online = useOnline();
  const lacksSearch = useCharacterLacksEndpoints(characterId, SEARCH_ENDPOINTS);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [lists, setLists] = useState<{ mailing_list_id: number; name: string }[]>([]);
  const [hits, setHits] = useState<ComposeRecipient[]>([]);
  const [failure, setFailure] = useState<'offline' | 'error' | null>(null);
  const listboxId = `${useId()}-recipients`;
  const latest = useRef(0);
  const full = recipients.length >= MAX_RECIPIENTS;

  useEffect(() => {
    let cancelled = false;
    void loadMailingLists(characterId).then((result) => {
      if (!cancelled) setLists(result.cached?.data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  const trimmed = query.trim();
  const searchable = trimmed.length >= MIN_RECIPIENT_SEARCH_LENGTH && !lacksSearch;
  useEffect(() => {
    if (!searchable) return;
    const ticket = ++latest.current;
    const controller = new AbortController();
    const id = setTimeout(() => {
      void searchTypedMailRecipients(characterId, trimmed, controller.signal)
        .then((found) => {
          if (ticket !== latest.current) return;
          setFailure(null);
          setHits(found.map((h) => ({ recipient_id: h.id, recipient_type: h.type, name: h.name })));
        })
        .catch((err: unknown) => {
          if (ticket !== latest.current || controller.signal.aborted) return;
          setFailure(isOfflineFailure(err) ? 'offline' : 'error');
          setHits([]);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [characterId, trimmed, searchable]);

  const candidates = useMemo(() => {
    const taken = new Set(recipients.map(recipientKey));
    const found = (searchable ? hits : []).filter((h) => !taken.has(recipientKey(h)));
    return [...filterMailingLists(lists, query, recipients), ...found];
  }, [lists, hits, query, recipients, searchable]);

  function pick(candidate: ComposeRecipient) {
    onAdd(candidate);
    setQuery('');
    setHits([]);
    setHighlight(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight !== null && candidates[highlight]) pick(candidates[highlight]);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setOpen(true);
      setHighlight((cur) => moveHighlight(e.key as 'ArrowDown', cur, candidates.length));
    }
  }

  const emptyText = lacksSearch
    ? t('mail.newMailSearchNeedsGrant')
    : trimmed.length > 0 && trimmed.length < MIN_RECIPIENT_SEARCH_LENGTH
      ? t('mail.recipientSearchHint')
      : searchable && (!online || failure === 'offline')
        ? t('mail.recipientSearchOffline')
        : searchable && failure === 'error'
          ? t('mail.recipientSearchFailed')
          : searchable
            ? t('mail.newMailNoResults')
            : t('mail.newMailNoLists');

  return (
    <div className="space-y-1.5">
      {recipients.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t('mail.toLabel')}>
          {recipients.map((r) => (
            <li
              key={recipientKey(r)}
              className="flex items-center gap-1 rounded-xs border border-line bg-panel-2 py-0.5 pr-0.5 pl-2 text-xs text-text"
            >
              <span>{r.name}</span>
              <span className="text-text-dim">{t(`mail.recipientType.${r.recipient_type}`)}</span>
              <IconButton
                icon={<Icon.Close size={Icon.ICON_SIZE.sm} />}
                label={t('mail.removeRecipient', { name: r.name })}
                size="sm"
                variant="plain"
                onClick={() => onRemove(r)}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="relative flex items-center gap-2">
        <TextInput
          id={inputId}
          ref={inputRef}
          size="sm"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && !full}
          aria-controls={listboxId}
          aria-activedescendant={
            highlight !== null ? `${listboxId}-option-${highlight}` : undefined
          }
          aria-invalid={invalid}
          aria-describedby={describedBy}
          placeholder={
            full
              ? t('mail.recipientsFull', { max: MAX_RECIPIENTS })
              : t('mail.newMailRecipientPlaceholder')
          }
          disabled={full}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setFailure(null);
            setOpen(true);
            setHighlight(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1"
        />
        <span className={cx('text-xs tabular-nums', full ? 'text-warning' : 'text-text-dim')}>
          {t('mail.recipientCount', { count: recipients.length, max: MAX_RECIPIENTS })}
        </span>
        {open && !full && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label={t('mail.addRecipient')}
            className="absolute top-full right-0 left-0 z-10 mt-1 max-h-56 overflow-y-auto rounded-xs border border-line bg-panel shadow-lg"
          >
            {candidates.length === 0 ? (
              <li className="px-3 py-2 text-xs text-text-dim">{emptyText}</li>
            ) : (
              candidates.map((c, i) => (
                <li
                  key={recipientKey(c)}
                  id={`${listboxId}-option-${i}`}
                  role="option"
                  aria-selected={highlight === i}
                  className={cx(
                    'flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-xs text-text',
                    highlight === i ? `bg-panel-2 ${activeOptionClassName}` : 'hover:bg-panel-2'
                  )}
                  onMouseEnter={() => setHighlight(i)}
                  // Keeps the input focused; a click would blur it first and close the list.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(c);
                  }}
                >
                  <span className="min-w-0 truncate">{c.name}</span>
                  <span className="shrink-0 text-text-dim">
                    {t(`mail.recipientType.${c.recipient_type}`)}
                  </span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      {lacksSearch && (
        <GrantNote
          characterId={characterId}
          endpoints={SEARCH_ENDPOINTS}
          title={t('mail.searchReauthTitle')}
          hint={t('mail.searchReauthHint')}
          actionLabel={t('mail.searchReauthAction')}
        />
      )}
    </div>
  );
}
