/**
 * The recipient row of New Mail and Forward: typed chips plus one combobox
 * that lists the Character's joined mailing lists (local), optional quick
 * picks (Forward's contacts) and ESI search hits for characters,
 * corporations and alliances.
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { GrantNote } from '@/app/GrantNote';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { IconButton, TextInput } from '@/components/ui';
import { activeOptionClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { isOfflineFailure } from '@/esi/client';
import { cx } from '@/lib/cx';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { LOOKUP_DEBOUNCE_MS } from '@/lib/useDebouncedValue';
import { moveHighlight } from '@/lib/comboboxNav';
import { useOnline } from '@/stores/network';
import {
  MAX_RECIPIENTS,
  filterMailingLists,
  recipientKey,
  type ComposeRecipient,
} from '@/engine/mail/mailCompose';
import { loadMailingLists } from './mail';
import { RecipientAvatar } from './RecipientAvatar';
import { MIN_RECIPIENT_SEARCH_LENGTH, searchTypedMailRecipients } from './mailRecipientSearch';

const MAX_QUICK_PICKS = 8;
const SEARCH_ENDPOINTS = ['getCharacterSearch'] as const;

const NO_LISTS: [] = [];

type ListsState =
  | { status: 'loading'; lists: [] }
  | { status: 'failed'; lists: [] }
  | { status: 'ready'; lists: { mailing_list_id: number; name: string }[] };

interface NewMailRecipientPickerProps {
  characterId: number;
  recipients: readonly ComposeRecipient[];
  onAdd: (recipient: ComposeRecipient) => void;
  onRemove: (recipient: ComposeRecipient) => void;
  /** Id of the combobox input, for the caller's visible label. */
  inputId: string;
  /** People shown before anything is typed, and filtered by it after (Forward's contacts). */
  quickPicks?: readonly ComposeRecipient[];
  /** Focus the field on mount without popping its list open. */
  autoFocus?: boolean;
  invalid?: boolean;
  describedBy?: string;
}

export function NewMailRecipientPicker({
  characterId,
  recipients,
  onAdd,
  onRemove,
  inputId,
  quickPicks = [],
  autoFocus = false,
  invalid,
  describedBy,
}: NewMailRecipientPickerProps) {
  const { t } = useTranslation();
  const online = useOnline();
  const lacksSearch = useCharacterLacksEndpoints(characterId, SEARCH_ENDPOINTS);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [hits, setHits] = useState<ComposeRecipient[]>([]);
  const [failure, setFailure] = useState<'offline' | 'error' | null>(null);
  const listboxId = `${useId()}-recipients`;
  const latest = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipNextOpenRef = useRef(false);
  const full = recipients.length >= MAX_RECIPIENTS;

  useEffect(() => {
    if (!autoFocus) return;
    skipNextOpenRef.current = true;
    inputRef.current?.focus();
  }, [autoFocus]);

  const loadLists = useCallback(async () => {
    const result = await loadMailingLists(characterId);
    if (result.cached === null) throw new Error('mailing lists unavailable');
    return result.cached.data;
  }, [characterId]);
  const listsLoad = useKeyedLoad(String(characterId), loadLists);
  const listsState: ListsState =
    listsLoad.status === 'ready'
      ? { status: 'ready', lists: listsLoad.data }
      : { status: listsLoad.status === 'failed' ? 'failed' : 'loading', lists: NO_LISTS };

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
    }, LOOKUP_DEBOUNCE_MS);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [characterId, trimmed, searchable]);

  const candidates = useMemo(() => {
    const taken = new Set(recipients.map(recipientKey));
    const q = trimmed.toLowerCase();
    const quick =
      q === ''
        ? quickPicks.slice(0, MAX_QUICK_PICKS)
        : quickPicks.filter((p) => p.name.toLowerCase().includes(q));
    const merged = [
      ...quick,
      ...filterMailingLists(listsState.lists, query, recipients),
      ...(searchable ? hits : []),
    ].filter((c) => !taken.has(recipientKey(c)));
    return Array.from(new Map(merged.map((c) => [recipientKey(c), c])).values());
  }, [listsState.lists, hits, query, trimmed, recipients, searchable, quickPicks]);

  function pick(candidate: ComposeRecipient) {
    onAdd(candidate);
    setQuery('');
    setHits([]);
    setHighlight(null);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      if (open) {
        // Closes the list only; a full-pane composer must not also close.
        e.stopPropagation();
        setOpen(false);
      }
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

  const min = MIN_RECIPIENT_SEARCH_LENGTH;
  const emptyText = lacksSearch
    ? t('mail.newMailSearchNeedsGrant')
    : trimmed.length > 0 && trimmed.length < min
      ? t('mail.recipientSearchHint', { min })
      : searchable && (!online || failure === 'offline')
        ? t('mail.recipientSearchOffline')
        : searchable && failure === 'error'
          ? t('mail.recipientSearchFailed')
          : searchable
            ? t('mail.newMailNoResults')
            : listsState.status === 'failed'
              ? t('mail.mailingListsFailed', { min })
              : listsState.status === 'loading'
                ? t('common.loading')
                : t('mail.newMailNoLists', { min });

  return (
    <div className="space-y-1.5">
      {recipients.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t('mail.toLabel')}>
          {recipients.map((r) => (
            <li
              key={recipientKey(r)}
              className="flex items-center gap-1 rounded-xs border border-line bg-panel-2 p-0.5 text-xs text-text"
            >
              <RecipientAvatar recipient={r} />
              <span className="ml-0.5">{r.name}</span>
              <span className="text-text-dim">{t(`mail.recipientType.${r.recipient_type}`)}</span>
              <IconButton
                icon={<Icon.Close size={Icon.ICON_SIZE.sm} />}
                label={t('mail.removeRecipient', { name: r.name })}
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
          onFocus={() => {
            if (skipNextOpenRef.current) {
              skipNextOpenRef.current = false;
              return;
            }
            setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1"
        />
        <span className={cx('text-xs tabular-nums', full ? 'text-warning' : 'text-text-dim')}>
          {t('mail.counter', { count: recipients.length, max: MAX_RECIPIENTS })}
        </span>
        <span role="status" aria-live="polite" className="sr-only">
          {open &&
            !full &&
            candidates.length > 0 &&
            (highlight !== null && candidates[highlight]
              ? t('mail.recipientHighlighted', {
                  count: candidates.length,
                  name: candidates[highlight].name,
                })
              : t('mail.recipientResultsCount', { count: candidates.length }))}
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
                    'flex min-h-9 cursor-pointer items-center gap-2 px-3 py-1 text-xs text-text md:min-h-0 touch:min-h-9',
                    highlight === i ? `bg-panel-2 ${activeOptionClassName}` : 'hover:bg-panel-2'
                  )}
                  onMouseEnter={() => setHighlight(i)}
                  // Keeps the input focused; a click would blur it first and close the list.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(c);
                  }}
                >
                  <RecipientAvatar recipient={c} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
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
