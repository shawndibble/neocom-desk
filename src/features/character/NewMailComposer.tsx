/**
 * New Mail compose (docs/context/decisions/
 * 20261016-124635-mail-compose-format-bar-and-eve-markup.md). One component,
 * two placements: a full-pane takeover on a phone (`fullPane`) and inline in
 * the reading pane on a wide screen. Close (X) keeps the draft; Discard
 * clears it after a confirmation; Send clears it on success.
 *
 * The body is a controlled string behind the `bodyEditor` seam
 * (`MailBodyEditor.tsx`), so a rich editor replaces the plain text area
 * without touching send or draft code.
 */
import { useEffect, useId, useRef, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  FieldError,
  IconButton,
  Modal,
  NeedsConnection,
  Spinner,
  TextInput,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { isOfflineFailure } from '@/esi/client';
import { EsiOfflineError, EsiTimeoutError } from '@/esi/errors';
import { isOnline, useOnline } from '@/stores/network';
import {
  MAX_BODY_LENGTH,
  MAX_SUBJECT_LENGTH,
  addRecipient,
  composeBodyLength,
  isNewMailEmpty,
  recipientKey,
  validateNewMail,
  type ComposeRecipient,
} from '@/engine/mailCompose';
import { sendMail } from './mail';
import { clearNewMailDraft, loadNewMailDraft, saveNewMailDraft } from './mailDrafts';
import { PlainBodyEditor, type MailBodyEditorProps } from './MailBodyEditor';
import { NewMailRecipientPicker } from './NewMailRecipientPicker';

const DRAFT_SAVE_DEBOUNCE_MS = 500;

/** How the composer ended: draft kept, nothing worth keeping, or an explicit Discard. */
export type NewMailCloseReason = 'kept' | 'empty' | 'discarded';

interface NewMailComposerProps {
  characterId: number;
  /** Phone placement: covers the whole viewport instead of sitting in the reading pane. */
  fullPane: boolean;
  /** Swap point for the rich editor; defaults to a plain text area. */
  bodyEditor?: ComponentType<MailBodyEditorProps>;
  onClose: (reason: NewMailCloseReason) => void;
  onSent: () => void;
}

export function NewMailComposer({
  characterId,
  fullPane,
  bodyEditor: BodyEditor = PlainBodyEditor,
  onClose,
  onSent,
}: NewMailComposerProps) {
  const { t } = useTranslation();
  const online = useOnline();
  const [ready, setReady] = useState(false);
  const [recipients, setRecipients] = useState<ComposeRecipient[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const touchedRef = useRef(false);
  const finishedRef = useRef(false);
  const fieldId = useId();
  const recipientsId = `${fieldId}-to`;
  const subjectId = `${fieldId}-subject`;
  const bodyId = `${fieldId}-body`;
  const bodyCountId = `${fieldId}-body-count`;
  const errorId = `${fieldId}-error`;
  const recipientInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    recipientInputRef.current?.focus();
  }, []);

  // Reopens the draft as left; anything typed before it resolves wins.
  useEffect(() => {
    let cancelled = false;
    void loadNewMailDraft(characterId).then((draft) => {
      if (cancelled) return;
      if (draft && !touchedRef.current) {
        setRecipients(
          draft.recipients.map((r) => ({
            recipient_id: r.recipient_id,
            recipient_type: r.recipient_type,
            name: r.name ?? `#${r.recipient_id}`,
          }))
        );
        setSubject(draft.subject);
        setBody(draft.body);
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  async function persist() {
    if (isNewMailEmpty({ recipients, subject, body })) {
      await clearNewMailDraft(characterId);
    } else {
      await saveNewMailDraft(characterId, recipients, subject, body);
    }
  }

  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => {
      if (!finishedRef.current) void persist();
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persist closes over exactly these values
  }, [ready, characterId, recipients, subject, body]);

  const fields = { recipients, subject, body };
  const problems = validateNewMail(fields);
  const blocked = problems.some((p) => p !== 'noRecipients');
  const bodyLength = composeBodyLength(body);

  async function handleClose() {
    finishedRef.current = true;
    const empty = isNewMailEmpty(fields);
    // Flush now: the debounce may not have fired, and the draft must survive the close.
    await persist().catch(() => undefined);
    onClose(empty ? 'empty' : 'kept');
  }

  async function handleDiscard() {
    finishedRef.current = true;
    setConfirmingDiscard(false);
    await clearNewMailDraft(characterId).catch(() => undefined);
    onClose('discarded');
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
          body
        );
      } catch (err) {
        const neverSent =
          isOfflineFailure(err) &&
          (wasOffline ||
            err instanceof EsiOfflineError ||
            (err instanceof EsiTimeoutError && !err.sent));
        setError(
          neverSent
            ? t('mail.sendOffline')
            : isOfflineFailure(err)
              ? t('mail.sendUnconfirmed')
              : t('mail.sendErrorPrefix', {
                  message: err instanceof Error ? err.message : String(err),
                })
        );
        return;
      }
      finishedRef.current = true;
      // The mail is sent; a draft that fails to clear is stale, not a failed send.
      await clearNewMailDraft(characterId).catch(() => undefined);
      onSent();
    } finally {
      setSending(false);
    }
  }

  function add(recipient: ComposeRecipient) {
    touchedRef.current = true;
    setError(null);
    const result = addRecipient(recipients, recipient);
    if (result.ok) setRecipients(result.recipients);
  }

  const labelClass = 'block text-[0.6875rem] text-text-dim';
  const counterClass = (over: boolean) =>
    cx('text-[0.6875rem] tabular-nums', over ? 'text-danger' : 'text-text-dim');
  const subjectOver = subject.length > MAX_SUBJECT_LENGTH;
  const bodyOver = bodyLength > MAX_BODY_LENGTH;

  return (
    <section
      aria-label={t('mail.newMailHeading')}
      className={cx(
        'flex flex-col',
        fullPane
          ? 'fixed inset-0 z-50 h-dvh bg-bg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'
          : 'min-h-96 gap-3'
      )}
    >
      <header
        className={cx(
          'flex shrink-0 items-center gap-2',
          fullPane && 'border-b border-line px-2 py-2'
        )}
      >
        <IconButton
          icon={<Icon.Close />}
          label={t('mail.newMailClose')}
          onClick={() => void handleClose()}
          disabled={sending}
        />
        <h2 className="min-w-0 flex-1 truncate text-xs font-semibold tracking-widest text-text-dim uppercase">
          {t('mail.newMailHeading')}
        </h2>
        {!online && <span className="text-xs text-text-dim">{t('mail.draftSaved')}</span>}
        <NeedsConnection>
          <Button
            variant="primary"
            size="md"
            onClick={() => void handleSend()}
            disabled={sending || blocked}
          >
            {sending ? (
              <span className="flex items-center gap-1.5">
                <Spinner size="sm" /> {t('mail.sending')}
              </span>
            ) : (
              t('mail.send')
            )}
          </Button>
        </NeedsConnection>
      </header>

      <div className={cx('flex min-h-0 flex-1 flex-col gap-3', fullPane && 'overflow-y-auto p-3')}>
        <div className="space-y-1">
          <label id={recipientsId} htmlFor={`${fieldId}-recipient-input`} className={labelClass}>
            {t('mail.toLabel')}
          </label>
          <NewMailRecipientPicker
            characterId={characterId}
            recipients={recipients}
            onAdd={add}
            onRemove={(r) => {
              touchedRef.current = true;
              setError(null);
              setRecipients((prev) => prev.filter((p) => recipientKey(p) !== recipientKey(r)));
            }}
            inputId={`${fieldId}-recipient-input`}
            inputRef={recipientInputRef}
            invalid={error !== null && recipients.length === 0}
            describedBy={error !== null && recipients.length === 0 ? errorId : undefined}
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-baseline justify-between">
            <label htmlFor={subjectId} className={labelClass}>
              {t('mail.subjectLabel')}
            </label>
            <span className={counterClass(subjectOver)}>
              {t('mail.counter', { count: subject.length, max: MAX_SUBJECT_LENGTH })}
            </span>
          </div>
          <TextInput
            id={subjectId}
            size="sm"
            value={subject}
            aria-invalid={subjectOver}
            onChange={(e) => {
              touchedRef.current = true;
              setSubject(e.target.value);
            }}
            className="w-full"
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col space-y-1">
          <div className="flex items-baseline justify-between">
            <label htmlFor={bodyId} className={labelClass}>
              {t('mail.bodyLabel')}
            </label>
            <span id={bodyCountId} className={counterClass(bodyOver)}>
              {t('mail.counter', { count: bodyLength, max: MAX_BODY_LENGTH })}
            </span>
          </div>
          <BodyEditor
            id={bodyId}
            value={body}
            onChange={(next) => {
              touchedRef.current = true;
              setBody(next);
            }}
            aria-describedby={bodyCountId}
            aria-invalid={bodyOver}
            className={fullPane ? 'min-h-40 flex-1 resize-none' : 'min-h-64'}
          />
        </div>

        {problems.map((p) =>
          p === 'noRecipients' ? null : (
            <FieldError key={p} id={`${fieldId}-${p}`}>
              {t(`mail.problem.${p}`)}
            </FieldError>
          )
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}

        {!isNewMailEmpty(fields) && (
          <div>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmingDiscard(true)}
              disabled={sending}
            >
              {t('mail.discardDraft')}
            </Button>
          </div>
        )}
      </div>

      <Modal
        open={confirmingDiscard}
        onClose={() => setConfirmingDiscard(false)}
        title={t('mail.discardTitle')}
      >
        <div className="space-y-4 text-sm">
          <p>{t('mail.discardBody')}</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setConfirmingDiscard(false)}>
              {t('mail.discardKeep')}
            </Button>
            <Button variant="danger" size="sm" onClick={() => void handleDiscard()}>
              {t('mail.discardConfirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
