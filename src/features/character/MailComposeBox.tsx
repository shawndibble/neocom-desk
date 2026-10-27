/**
 * The Reply/Forward compose box (mail-reply-and-forward decision,
 * docs/context/decisions/): inline, in the same reading-pane `Panel` Mail.tsx
 * already renders the open mail in — no modal, no new route. Mounted only
 * while a pilot has Reply or Forward open; `Mail.tsx` unmounts it on Cancel,
 * on send, or when the selected mail changes.
 */
import { useEffect, useId, useRef, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { GrantNote } from '@/app/GrantNote';
import { SEND_MAIL_ENDPOINTS } from '@/esi/registry';
import { Button, IconButton, TextInput } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  buildReplyAllRecipients,
  forwardMailBody,
  prefixSubject,
  quoteMailBody,
  type ComposeKind,
} from '@/engine/mail/mail';
import { isOfflineFailure } from '@/esi/client';
import { EsiOfflineError, EsiTimeoutError } from '@/esi/errors';
import { isOnline, useOnline } from '@/stores/network';
import { sendMail } from './mail';
import { draftMarkupBody, plainTextToMarkup, sanitizeMarkup } from '@/engine/mail/mailEditorDoc';
import { MailBodyEditor, type MailBodyEditorProps } from './MailBodyEditor';
import { loadDraft, saveDraft, clearDraft, type MailDraftRecipient } from './mailDrafts';
import { loadContacts } from './contacts';
import { resolveNames } from './names';
import { MailComposeFooter } from './MailComposeFooter';
import { MailCounter } from './MailCounter';
import { NewMailRecipientPicker } from './NewMailRecipientPicker';
import {
  MAX_BODY_LENGTH,
  addRecipient,
  composeBodyLength,
  type ComposeRecipient,
} from '@/engine/mail/mailCompose';
import type { MailHeader } from '@/esi/endpoints';

/** One chip in the recipient row — a name is always resolved before it is added, so the row never shows a bare id. */
interface RecipientChip extends MailDraftRecipient {
  name: string;
  removable: boolean;
}

/** Saves the draft in progress without hammering Dexie on every keystroke. */
const DRAFT_SAVE_DEBOUNCE_MS = 500;

function chipKey(r: { recipient_id: number; recipient_type: string }): string {
  return `${r.recipient_type}:${r.recipient_id}`;
}

interface MailComposeBoxProps {
  characterId: number;
  kind: ComposeKind;
  header: MailHeader;
  /** The reading pane's own already-stripped body text — quoted verbatim, never re-fetched or re-stripped here. */
  bodyText: string;
  /** The mail's raw body, so a Forward keeps its formatting; Reply quotes `bodyText` plain. */
  bodyMarkup?: string;
  /** Swap point for tests; defaults to the rich editor. */
  bodyEditor?: ComponentType<MailBodyEditorProps>;
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
  bodyMarkup,
  bodyEditor: BodyEditor = MailBodyEditor,
  senderName,
  formattedTimestamp,
  resolveRecipientName,
  onClose,
  onSent,
}: MailComposeBoxProps) {
  const { t } = useTranslation();
  const online = useOnline();
  const [ready, setReady] = useState(false);
  const [recipients, setRecipients] = useState<RecipientChip[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Forward's contacts, offered before anything is typed. */
  const [contacts, setContacts] = useState<ComposeRecipient[]>([]);
  const errorId = `mail-compose-error-${header.mail_id}`;
  const fieldId = useId();
  const toLabelId = `${fieldId}-to`;
  const recipientSearchId = `${fieldId}-recipient-search`;
  const subjectId = `${fieldId}-subject`;
  const bodyId = `${fieldId}-body`;
  const bodyCountId = `${fieldId}-body-count`;

  // First-field focus (issue #1485): Forward's recipient picker is the real
  // first field (it sits above Subject) and focuses itself (`autoFocus`);
  // Reply lands on Subject. Runs once per mount, which a kind/mail switch
  // already is — Mail.tsx keys this component by `${mail_id}:${kind}`.
  const subjectRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (kind !== 'forward') subjectRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only, see comment above
  }, []);

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
        setBody(draftMarkupBody(draft));
      } else if (kind === 'reply') {
        setRecipients(
          buildReplyAllRecipients(header, characterId).map((r) => ({
            ...r,
            name: resolveRecipientName(r),
          }))
        );
        setSubject(prefixSubject('reply', header.subject ?? ''));
        // The quote is plain `> ` lines: formatting stripped, `< > &` escaped to stay literal.
        setBody(plainTextToMarkup(quoteMailBody(senderName, formattedTimestamp, bodyText)));
      } else {
        setRecipients([]);
        setSubject(prefixSubject('forward', header.subject ?? ''));
        // The original travels with its formatting, editable, under a header.
        setBody(
          forwardMailBody(
            senderName,
            formattedTimestamp,
            header.subject ?? '',
            bodyMarkup === undefined ? plainTextToMarkup(bodyText) : sanitizeMarkup(bodyMarkup)
          )
        );
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
          .filter((c): c is { characterId: number; name: string } => c.name !== undefined)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c): ComposeRecipient => ({
            recipient_id: c.characterId,
            recipient_type: 'character',
            name: c.name,
          }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, characterId]);

  function addPicked(candidate: ComposeRecipient) {
    touchedRef.current = true;
    setError(null);
    const result = addRecipient(recipients, candidate);
    if (result.ok) setRecipients((prev) => [...prev, { ...candidate, removable: true }]);
  }

  function removeRecipient(target: RecipientChip) {
    touchedRef.current = true;
    // Clears a stale send-failure message too — otherwise removing the last
    // recipient re-wires an unrelated old error onto the recipients field via
    // `noRecipientsError`, which reads `recipients.length` alone.
    setError(null);
    setRecipients((prev) => prev.filter((r) => chipKey(r) !== chipKey(target)));
  }

  async function handleSend() {
    if (recipients.length === 0) {
      setError(t('mail.sendNoRecipients'));
      return;
    }
    // Read before the request: a drop mid-send must not retroactively make it "never sent".
    const wasOffline = !isOnline();
    setSending(true);
    setError(null);
    try {
      try {
        await sendMail(
          characterId,
          recipients.map(({ recipient_id, recipient_type }) => ({ recipient_id, recipient_type })),
          subject,
          // Whatever the editor produced, only the safe subset is ever sent.
          sanitizeMarkup(body)
        );
      } catch (err) {
        // Only the send itself is classified: a failure below is not "offline".
        // Known not to have left: offline when pressed, no token, or still queued for a permit.
        const neverSent =
          isOfflineFailure(err) &&
          (wasOffline ||
            err instanceof EsiOfflineError ||
            (err instanceof EsiTimeoutError && !err.sent));
        setError(
          neverSent
            ? t('mail.sendOffline')
            : isOfflineFailure(err)
              ? // It may have left and been delivered: do not invite a duplicate.
                t('mail.sendUnconfirmed')
              : t('mail.sendErrorPrefix', {
                  message: err instanceof Error ? err.message : String(err),
                })
        );
        return;
      }
      // The mail is sent; a draft that fails to clear is stale, not a failed send.
      await clearDraft(characterId, header.mail_id).catch(() => undefined);
      onSent();
    } finally {
      setSending(false);
    }
  }

  const headingKey = kind === 'reply' ? 'mail.composeReplyHeading' : 'mail.composeForwardHeading';
  const bodyLength = composeBodyLength(body);
  const bodyOver = bodyLength > MAX_BODY_LENGTH;
  const noRecipientsError = error !== null && recipients.length === 0;
  // Plain stacked labels, not the `Fields`/`Field` label-column primitive: a
  // side label column would take width from the 8-row message box in the
  // narrow reading pane. Don't "fix" this to `Fields`.
  const labelClass = 'block text-[0.6875rem] text-text-dim';

  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      <p className="text-xs font-semibold tracking-widest text-text-dim uppercase">
        {t(headingKey)}
      </p>

      {kind === 'forward' ? (
        <div className="space-y-1">
          <label htmlFor={recipientSearchId} className={labelClass}>
            {t('mail.addRecipient')}
          </label>
          <NewMailRecipientPicker
            characterId={characterId}
            recipients={recipients}
            onAdd={addPicked}
            onRemove={(r) => removeRecipient({ ...r, removable: true })}
            inputId={recipientSearchId}
            quickPicks={contacts}
            autoFocus
            invalid={noRecipientsError}
            describedBy={noRecipientsError ? errorId : undefined}
          />
        </div>
      ) : (
        <div className="space-y-1">
          <p id={toLabelId} className={labelClass}>
            {t('mail.toLabel')}
          </p>
          <div
            role="group"
            aria-labelledby={toLabelId}
            aria-describedby={noRecipientsError ? errorId : undefined}
            className="flex flex-wrap gap-1.5"
          >
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
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor={subjectId} className={labelClass}>
          {t('mail.subjectLabel')}
        </label>
        <TextInput
          id={subjectId}
          ref={subjectRef}
          size="sm"
          value={subject}
          onChange={(e) => {
            touchedRef.current = true;
            setSubject(e.target.value);
          }}
          className="w-full"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor={bodyId} className={labelClass}>
          {t('mail.bodyLabel')}
        </label>
        <BodyEditor
          id={bodyId}
          value={body}
          onChange={(next) => {
            touchedRef.current = true;
            setBody(next);
          }}
          disabled={sending}
          aria-describedby={bodyCountId}
          counter={
            <MailCounter id={bodyCountId} count={bodyLength} max={MAX_BODY_LENGTH} warnFrom={0.9} />
          }
          aria-invalid={bodyOver}
          className="min-h-48"
        />
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      <GrantNote
        characterId={characterId}
        endpoints={SEND_MAIL_ENDPOINTS}
        title={t('mail.sendGrantTitle')}
        hint={t('mail.sendGrantHint')}
        actionLabel={t('mail.sendGrantAction')}
      />

      <MailComposeFooter
        size="sm"
        sending={sending}
        blocked={bodyOver}
        onSend={() => void handleSend()}
      >
        <Button size="sm" onClick={onClose} disabled={sending}>
          {t('mail.cancel')}
        </Button>
        {!online && <span className="truncate text-xs text-text-dim">{t('mail.draftSaved')}</span>}
      </MailComposeFooter>
    </div>
  );
}
