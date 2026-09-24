/**
 * The Reply/Forward compose box (mail-reply-and-forward decision,
 * docs/context/decisions/): inline, in the same reading-pane `Panel` Mail.tsx
 * already renders the open mail in — no modal, no new route. Mounted only
 * while a pilot has Reply or Forward open; `Mail.tsx` unmounts it on Cancel,
 * on send, or when the selected mail changes.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, Spinner, TextInput } from '@/components/ui';
import { fieldBaseClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import {
  buildReplyAllRecipients,
  prefixSubject,
  quoteMailBody,
  type ComposeKind,
} from '@/engine/mail';
import { moveHighlight } from '@/lib/comboboxNav';
import { sendMail } from './mail';
import { loadDraft, saveDraft, clearDraft, type MailDraftRecipient } from './mailDrafts';
import { loadContacts } from './contacts';
import { resolveNames } from './names';
import { searchMailRecipients, MIN_RECIPIENT_SEARCH_LENGTH } from './mailRecipientSearch';
import type { MailHeader } from '@/esi/endpoints';

/** One chip in the recipient row — a name is always resolved before it is added, so the row never shows a bare id. */
interface RecipientChip extends MailDraftRecipient {
  name: string;
  removable: boolean;
}

interface RecipientCandidate {
  characterId: number;
  name: string;
}

/** Saves the draft in progress without hammering Dexie on every keystroke. */
const DRAFT_SAVE_DEBOUNCE_MS = 500;
/** Matches `BuildLocationPicker`'s own recipient-search debounce (the same ESI search endpoint). */
const RECIPIENT_SEARCH_DEBOUNCE_MS = 300;
const MAX_QUICK_PICKS = 8;

function chipKey(r: { recipient_id: number; recipient_type: string }): string {
  return `${r.recipient_type}:${r.recipient_id}`;
}

interface MailComposeBoxProps {
  characterId: number;
  kind: ComposeKind;
  header: MailHeader;
  /** The reading pane's own already-stripped body text — quoted verbatim, never re-fetched or re-stripped here. */
  bodyText: string;
  senderName: string;
  /** Already formatted in the pilot's chosen timezone, same string the reading pane shows. */
  formattedTimestamp: string;
  resolveRecipientName: (recipient: { recipient_id: number; recipient_type: string }) => string;
  onClose: () => void;
  onSent: () => void;
}

export function MailComposeBox({
  characterId,
  kind,
  header,
  bodyText,
  senderName,
  formattedTimestamp,
  resolveRecipientName,
  onClose,
  onSent,
}: MailComposeBoxProps) {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const [recipients, setRecipients] = useState<RecipientChip[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recipientQuery, setRecipientQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RecipientCandidate[]>([]);
  const [contacts, setContacts] = useState<RecipientCandidate[]>([]);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const listboxId = `mail-compose-recipient-listbox-${header.mail_id}`;

  // First-field focus (issue #1485): Forward's recipient search is the real
  // first field (it sits above Subject); `skipNextPickerOpenRef` stops that
  // field's own `onFocus` from popping its picker open on this programmatic
  // focus. Runs once per mount, which a kind/mail switch already is —
  // Mail.tsx keys this component by `${mail_id}:${kind}`.
  const recipientSearchRef = useRef<HTMLInputElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const skipNextPickerOpenRef = useRef(false);
  useEffect(() => {
    if (kind === 'forward') {
      skipNextPickerOpenRef.current = true;
      recipientSearchRef.current?.focus();
    } else {
      subjectRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only, see comment above
  }, []);
  function handleRecipientSearchFocus() {
    if (skipNextPickerOpenRef.current) {
      skipNextPickerOpenRef.current = false;
      return;
    }
    setPickerOpen(true);
  }

  // Flips true the moment a pilot makes their own edit (subject, body, a
  // chip). Guards the hydration effect below: `loadDraft` is async, and
  // nothing else stops a slow resolution from landing after typing has
  // already started and silently overwriting it.
  const touchedRef = useRef(false);

  // Hydrates from a saved draft, or builds this decision's reply/forward
  // defaults (`engine/mail.ts`) otherwise. Mail.tsx keys this component by
  // `${mail_id}:${kind}`, so either changing fully remounts it — `ready`
  // starting `false` is already the reset this effect needs.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const draft = await loadDraft(characterId, header.mail_id);
      // A pilot who started typing before this resolved keeps what they
      // typed — their edit is authoritative over a draft/default that would
      // otherwise clobber it. `ready` still flips below, so autosave picks
      // up their in-progress edit rather than staying gated forever.
      if (cancelled || touchedRef.current) {
        if (!cancelled) setReady(true);
        return;
      }
      if (draft && draft.kind === kind) {
        setRecipients(
          draft.recipients.map((r) => ({
            ...r,
            name: resolveRecipientName(r),
            removable: !(r.recipient_type === 'character' && r.recipient_id === header.from),
          }))
        );
        setSubject(draft.subject);
        setBody(draft.body);
      } else if (kind === 'reply') {
        setRecipients(
          buildReplyAllRecipients(header, characterId).map((r) => ({
            ...r,
            name: resolveRecipientName(r),
          }))
        );
        setSubject(prefixSubject('reply', header.subject ?? ''));
        setBody(quoteMailBody(senderName, formattedTimestamp, bodyText));
      } else {
        setRecipients([]);
        setSubject(prefixSubject('forward', header.subject ?? ''));
        setBody(quoteMailBody(senderName, formattedTimestamp, bodyText));
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only on a genuinely new mail/kind, not on every resolver identity change.
  }, [characterId, header.mail_id, kind]);

  // Debounced autosave (decision: Dexie, device-only, cleared on send).
  // Gated on `ready` so the hydration above never overwrites a real draft
  // with the still-empty initial state on the first render.
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => {
      void saveDraft(
        characterId,
        header.mail_id,
        kind,
        recipients.map(({ recipient_id, recipient_type }) => ({ recipient_id, recipient_type })),
        subject,
        body
      );
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [ready, characterId, header.mail_id, kind, recipients, subject, body]);

  // Forward's contacts quick-picks (decision: search-plus-contacts) — loaded
  // once, character-type contacts only (this app's mail recipients are
  // people, not corp/alliance broadcast targets).
  useEffect(() => {
    if (kind !== 'forward') return;
    let cancelled = false;
    void (async () => {
      const result = await loadContacts(characterId);
      const characterIds = (result.cached?.data ?? [])
        .filter((c) => c.contact_type === 'character')
        .map((c) => c.contact_id);
      const names = await resolveNames(characterIds);
      if (cancelled) return;
      setContacts(
        characterIds
          .map((id) => ({ characterId: id, name: names.get(id) }))
          .filter((c): c is RecipientCandidate => c.name !== undefined)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, characterId]);

  // Only the newest query may write results (ESI can answer out of order) —
  // same `latest`-ticket guard `BuildLocationPicker` uses against its own
  // search. The `.catch()` also matters on its own: `esi/client.ts` throws
  // on an aborted request, and every keystroke that supersedes an in-flight
  // search aborts the previous one — with no catch here, that was an
  // unhandled rejection on nearly every character typed.
  const latestSearch = useRef(0);

  // Debounced live search (decision: same ESI search pattern as
  // BuildLocationPicker). Below the floor there is nothing to fetch — no
  // setState here either; `candidates` below gates on the same floor, so a
  // shortened query simply stops showing the stale `searchResults` rather
  // than needing them cleared.
  useEffect(() => {
    if (kind !== 'forward') return;
    const trimmed = recipientQuery.trim();
    if (trimmed.length < MIN_RECIPIENT_SEARCH_LENGTH) return;
    const ticket = ++latestSearch.current;
    const controller = new AbortController();
    const id = setTimeout(() => {
      void searchMailRecipients(characterId, trimmed, controller.signal)
        .then((hits) => {
          if (ticket !== latestSearch.current) return;
          setSearchResults(hits.map((h) => ({ characterId: h.characterId, name: h.name })));
        })
        .catch(() => {
          if (ticket !== latestSearch.current || controller.signal.aborted) return;
          setSearchResults([]);
        });
    }, RECIPIENT_SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [kind, characterId, recipientQuery]);

  const addedIds = useMemo(
    () =>
      new Set(
        recipients.filter((r) => r.recipient_type === 'character').map((r) => r.recipient_id)
      ),
    [recipients]
  );

  const candidates = useMemo((): RecipientCandidate[] => {
    const trimmed = recipientQuery.trim();
    const query = trimmed.toLowerCase();
    const quickPicks =
      query === ''
        ? contacts.slice(0, MAX_QUICK_PICKS)
        : contacts.filter((c) => c.name.toLowerCase().includes(query));
    // Stale `searchResults` below the floor (see the search effect above) is dropped here.
    const liveResults = trimmed.length < MIN_RECIPIENT_SEARCH_LENGTH ? [] : searchResults;
    const merged = [...quickPicks, ...liveResults].filter((c) => !addedIds.has(c.characterId));
    return Array.from(new Map(merged.map((c) => [c.characterId, c])).values());
  }, [contacts, searchResults, recipientQuery, addedIds]);

  function addRecipient(candidate: RecipientCandidate) {
    touchedRef.current = true;
    setRecipients((prev) => [
      ...prev,
      {
        recipient_id: candidate.characterId,
        recipient_type: 'character',
        name: candidate.name,
        removable: true,
      },
    ]);
    setRecipientQuery('');
    setSearchResults([]);
    setHighlight(null);
    setPickerOpen(false);
  }

  // Named rather than inlined at its `onMouseDown` call site: a block-body
  // arrow directly in JSX (needed for `preventDefault()` before the call)
  // is what the `react-hooks/refs` lint rule flags as an unproven-safe call
  // to a ref-touching function — a single-expression arrow calling a named
  // function, the same shape every other handler below already uses, reads
  // as a plain event handler to it.
  function pickCandidateOnMouseDown(e: ReactMouseEvent, candidate: RecipientCandidate) {
    e.preventDefault();
    addRecipient(candidate);
  }

  function removeRecipient(target: RecipientChip) {
    touchedRef.current = true;
    setRecipients((prev) => prev.filter((r) => chipKey(r) !== chipKey(target)));
  }

  function handlePickerKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setPickerOpen(false);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight !== null && candidates[highlight]) addRecipient(candidates[highlight]);
      return;
    }
    const key = e.key;
    if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
      e.preventDefault();
      setPickerOpen(true);
      setHighlight((current) => moveHighlight(key, current, candidates.length));
    }
  }

  async function handleSend() {
    if (recipients.length === 0) {
      setError(t('mail.sendNoRecipients'));
      return;
    }
    setSending(true);
    setError(null);
    try {
      await sendMail(
        characterId,
        recipients.map(({ recipient_id, recipient_type }) => ({ recipient_id, recipient_type })),
        subject,
        body
      );
      await clearDraft(characterId, header.mail_id);
      onSent();
    } catch (err) {
      setError(
        t('mail.sendErrorPrefix', { message: err instanceof Error ? err.message : String(err) })
      );
    } finally {
      setSending(false);
    }
  }

  const headingKey = kind === 'reply' ? 'mail.composeReplyHeading' : 'mail.composeForwardHeading';

  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      <p className="text-xs font-semibold tracking-widest text-text-dim uppercase">
        {t(headingKey)}
      </p>

      <div role="group" aria-label={t('mail.recipientsLabel')} className="flex flex-wrap gap-1.5">
        {recipients.map((r) => (
          <span
            key={chipKey(r)}
            className="flex items-center gap-1 rounded-xs border border-line bg-panel-2 py-1 pr-1 pl-2 text-xs text-text"
          >
            {r.name}
            {r.removable ? (
              <IconButton
                icon={<Icon.Close size={Icon.ICON_SIZE.sm} />}
                label={t('mail.removeRecipient', { name: r.name })}
                size="sm"
                variant="plain"
                onClick={() => removeRecipient(r)}
              />
            ) : (
              <span className="sr-only">{t('mail.senderNotRemovable')}</span>
            )}
          </span>
        ))}
      </div>

      {kind === 'forward' && (
        <div className="relative">
          <TextInput
            ref={recipientSearchRef}
            size="sm"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={pickerOpen}
            aria-controls={listboxId}
            aria-activedescendant={
              highlight !== null ? `${listboxId}-option-${highlight}` : undefined
            }
            placeholder={t('mail.recipientSearchPlaceholder')}
            aria-label={t('mail.addRecipient')}
            value={recipientQuery}
            onChange={(e) => {
              setRecipientQuery(e.target.value);
              setPickerOpen(true);
              setHighlight(null);
            }}
            onFocus={handleRecipientSearchFocus}
            onKeyDown={handlePickerKeyDown}
            className="w-full"
          />
          <span role="status" aria-live="polite" className="sr-only">
            {pickerOpen &&
              recipientQuery.trim().length >= MIN_RECIPIENT_SEARCH_LENGTH &&
              (highlight !== null && candidates[highlight]
                ? t('mail.recipientHighlighted', {
                    count: candidates.length,
                    name: candidates[highlight].name,
                  })
                : t('mail.recipientResultsCount', { count: candidates.length }))}
          </span>
          {pickerOpen && (
            <ul
              id={listboxId}
              role="listbox"
              aria-label={t('mail.addRecipient')}
              className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xs border border-line bg-panel shadow-lg"
            >
              {candidates.length === 0 ? (
                <li className="px-3 py-2 text-xs text-text-dim">
                  {recipientQuery.trim().length < MIN_RECIPIENT_SEARCH_LENGTH
                    ? t('mail.recipientSearchHint')
                    : t('mail.noRecipientResults')}
                </li>
              ) : (
                candidates.map((c, i) => (
                  <li
                    key={c.characterId}
                    id={`${listboxId}-option-${i}`}
                    role="option"
                    aria-selected={highlight === i}
                    className={cx(
                      'cursor-pointer px-3 py-1.5 text-xs text-text',
                      highlight === i ? 'bg-panel-2' : 'hover:bg-panel-2/60'
                    )}
                    onMouseEnter={() => setHighlight(i)}
                    // Keeps the input focused — a plain click would blur it first and close the list.
                    onMouseDown={(e) => pickCandidateOnMouseDown(e, c)}
                  >
                    {c.name}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}

      <TextInput
        ref={subjectRef}
        size="sm"
        aria-label={t('mail.subjectLabel')}
        placeholder={t('mail.subjectLabel')}
        value={subject}
        onChange={(e) => {
          touchedRef.current = true;
          setSubject(e.target.value);
        }}
        className="w-full"
      />

      <textarea
        aria-label={t('mail.bodyLabel')}
        value={body}
        onChange={(e) => {
          touchedRef.current = true;
          setBody(e.target.value);
        }}
        rows={8}
        className={`${fieldBaseClassName} w-full p-2 text-sm`}
      />

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => void handleSend()} disabled={sending}>
          {sending ? (
            <span className="flex items-center gap-1.5">
              <Spinner size="sm" /> {t('mail.sending')}
            </span>
          ) : (
            t('mail.send')
          )}
        </Button>
        <Button size="sm" onClick={onClose} disabled={sending}>
          {t('mail.cancel')}
        </Button>
      </div>
    </div>
  );
}
