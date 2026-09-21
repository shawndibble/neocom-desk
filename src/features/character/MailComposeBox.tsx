/**
 * The Reply/Forward compose box (mail-reply-and-forward decision,
 * docs/context/decisions/): inline, in the same reading-pane `Panel` Mail.tsx
 * already renders the open mail in — no modal, no new route. Mounted only
 * while a pilot has Reply or Forward open; `Mail.tsx` unmounts it on Cancel,
 * on send, or when the selected mail changes.
 */
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, Spinner, TextInput } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import {
  buildReplyAllRecipients,
  prefixSubject,
  quoteMailBody,
  type ComposeKind,
} from '@/engine/mail';
import { moveHighlight } from '@/features/industry/comboboxNav';
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

  // Hydrates from a saved draft (same kind, same source mail) or builds the
  // defaults this decision settled: reply-all with the sender pinned, both
  // kinds auto-quoted. Runs once per (mail, kind) — a pilot who closes and
  // reopens the same Reply mid-edit should see the draft, not the defaults.
  // Mail.tsx keys this component by `${mail_id}:${kind}`, so a change to
  // either fully remounts it — `ready` starting `false` on mount is already
  // the reset this effect needs, with no synchronous setState of its own.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const draft = await loadDraft(characterId, header.mail_id);
      if (cancelled) return;
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

  // Debounced live search (decision: same ESI search pattern as
  // BuildLocationPicker). Below the floor there is nothing to fetch — no
  // setState here either; `candidates` below gates on the same floor, so a
  // shortened query simply stops showing the stale `searchResults` rather
  // than needing them cleared.
  useEffect(() => {
    if (kind !== 'forward') return;
    const trimmed = recipientQuery.trim();
    if (trimmed.length < MIN_RECIPIENT_SEARCH_LENGTH) return;
    const controller = new AbortController();
    const id = setTimeout(() => {
      void searchMailRecipients(characterId, trimmed, controller.signal).then((hits) => {
        setSearchResults(hits.map((h) => ({ characterId: h.characterId, name: h.name })));
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
    // Below the search floor, `searchResults` is stale from a longer query
    // that has since been shortened — the debounce effect no longer clears
    // it (that setState-in-effect is what this gate replaces), so this is
    // where a short query stops showing it.
    const liveResults = trimmed.length < MIN_RECIPIENT_SEARCH_LENGTH ? [] : searchResults;
    const merged = [...quickPicks, ...liveResults].filter((c) => !addedIds.has(c.characterId));
    const seen = new Set<number>();
    return merged.filter((c) =>
      seen.has(c.characterId) ? false : (seen.add(c.characterId), true)
    );
  }, [contacts, searchResults, recipientQuery, addedIds]);

  function addRecipient(candidate: RecipientCandidate) {
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

  function removeRecipient(target: RecipientChip) {
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
                className="size-5 md:size-5"
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
            size="sm"
            role="combobox"
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
            onFocus={() => setPickerOpen(true)}
            onKeyDown={handlePickerKeyDown}
            className="w-full"
          />
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
                    onMouseDown={(e) => {
                      // Keeps the input focused — a plain click would blur it first and close the list.
                      e.preventDefault();
                      addRecipient(c);
                    }}
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
        size="sm"
        aria-label={t('mail.subjectLabel')}
        placeholder={t('mail.subjectLabel')}
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="w-full"
      />

      <textarea
        aria-label={t('mail.bodyLabel')}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        className="w-full rounded-xs border border-line bg-panel-2 p-2 text-sm text-text placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-accent"
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
