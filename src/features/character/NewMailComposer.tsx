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
import { useEffect, useId, useRef, useState, type ComponentType, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { GrantNote } from '@/app/GrantNote';
import { SEND_MAIL_ENDPOINTS } from '@/esi/registry';
import { Button, FieldError, IconButton, Modal, TextInput } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { useVisualViewportBox } from '@/lib/useVisualViewportBox';
import { isOfflineFailure } from '@/esi/client';
import { EsiOfflineError, EsiTimeoutError } from '@/esi/errors';
import { isOnline, useOnline } from '@/stores/network';
import {
  MAX_BODY_LENGTH,
  MAX_SUBJECT_LENGTH,
  addRecipient,
  composeBodyLength,
  isNewMailEmpty,
  MAX_RECIPIENTS,
  type NewMailFields,
  recipientKey,
  validateNewMail,
  type ComposeRecipient,
} from '@/engine/mail/mailCompose';
import { draftMarkupBody, sanitizeMarkup } from '@/engine/mail/mailEditorDoc';
import { sendMail } from './mail';
import { clearNewMailDraft, loadNewMailDraft, saveNewMailDraft } from './mailDrafts';
import { MailBodyEditor, type MailBodyEditorProps } from './MailBodyEditor';
import { MailComposeFooter } from './MailComposeFooter';
import { MailCounter } from './MailCounter';
import { NewMailRecipientPicker } from './NewMailRecipientPicker';

const DRAFT_SAVE_DEBOUNCE_MS = 500;

/** Writes the slot, or clears it when there is nothing worth keeping. Returns whether a draft is now stored. */
async function persistNewMail(characterId: number, fields: NewMailFields): Promise<boolean> {
  if (isNewMailEmpty(fields)) {
    await clearNewMailDraft(characterId);
    return false;
  }
  await saveNewMailDraft(characterId, fields.recipients, fields.subject, fields.body);
  return true;
}

/** How the composer ended: draft kept, nothing worth keeping, or an explicit Discard. */
export type NewMailCloseReason = 'kept' | 'empty' | 'discarded';

interface NewMailComposerProps {
  characterId: number;
  /** Phone placement: covers the whole viewport instead of sitting in the reading pane. */
  fullPane: boolean;
  /** Swap point for the body editor; defaults to the rich (WYSIWYG + Source) one. */
  bodyEditor?: ComponentType<MailBodyEditorProps>;
  onClose: (reason: NewMailCloseReason) => void;
  onSent: () => void;
}

export function NewMailComposer({
  characterId,
  fullPane,
  bodyEditor: BodyEditor = MailBodyEditor,
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
  const [saved, setSaved] = useState(false);
  const touchedRef = useRef(false);
  const finishedRef = useRef(false);
  const sendingRef = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);
  // The latest values, for the flushes that run outside a render (unmount,
  // backgrounding), where the closure would be stale.
  const latestRef = useRef({ characterId, recipients, subject, body, ready: false });
  useEffect(() => {
    latestRef.current = { characterId, recipients, subject, body, ready };
  });
  const fieldId = useId();
  const recipientsId = `${fieldId}-to`;
  const subjectId = `${fieldId}-subject`;
  const bodyId = `${fieldId}-body`;
  const bodyCountId = `${fieldId}-body-count`;
  const errorId = `${fieldId}-error`;
  const viewport = useVisualViewportBox(fullPane);

  // The page behind a full-pane composer is not reachable by keyboard or
  // screen reader: every other child of <body> goes inert while it is open.
  useEffect(() => {
    if (!fullPane) return;
    const section = sectionRef.current;
    const marked: Element[] = [];
    for (const child of Array.from(document.body.children)) {
      if (child === section || child.hasAttribute('inert') || child.tagName === 'SCRIPT') continue;
      child.setAttribute('inert', '');
      marked.push(child);
    }
    return () => marked.forEach((el) => el.removeAttribute('inert'));
  }, [fullPane]);

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
        setBody(draftMarkupBody(draft));
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  // Writes what is on screen right now, from the refs; never after the
  // composer has finished (sent, discarded or closed).
  function flushLatest() {
    const l = latestRef.current;
    if (finishedRef.current || !l.ready) return Promise.resolve();
    return persistNewMail(l.characterId, l).then(
      () => undefined,
      () => undefined
    );
  }

  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => {
      if (finishedRef.current) return;
      void persistNewMail(characterId, { recipients, subject, body }).then(
        setSaved,
        () => undefined
      );
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [ready, characterId, recipients, subject, body]);

  // The 500 ms debounce is lost if the composer goes away without Close
  // (bottom nav, route change, Back) or the page is backgrounded.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flushLatest();
    };
    const onPageHide = () => void flushLatest();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      void flushLatest();
    };
  }, []);

  const fields = { recipients, subject, body };
  const problems = validateNewMail(fields);
  const blocked = problems.some((p) => p !== 'noRecipients');
  const bodyLength = composeBodyLength(body);

  async function handleClose() {
    const empty = isNewMailEmpty(fields);
    // Flush now: the debounce may not have fired, and the draft must survive the close.
    await flushLatest();
    finishedRef.current = true;
    onClose(empty ? 'empty' : 'kept');
  }

  async function handleDiscard() {
    finishedRef.current = true;
    setConfirmingDiscard(false);
    await clearNewMailDraft(characterId).catch(() => undefined);
    onClose('discarded');
  }

  async function handleSend() {
    // Synchronous: a double tap lands before `sending` re-renders the button disabled.
    if (sendingRef.current) return;
    if (recipients.length === 0) {
      setError(t('mail.sendNoRecipients'));
      return;
    }
    // Read before the request: a drop mid-send must not retroactively make it "never sent".
    const wasOffline = !isOnline();
    sendingRef.current = true;
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
      sendingRef.current = false;
      setSending(false);
    }
  }

  function onSectionKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== 'Escape' || !fullPane || confirmingDiscard || sendingRef.current) return;
    // Escape inside a sheet or dialog (format bar, discard) closes that, not the composer.
    if (e.defaultPrevented || (e.target instanceof Element && e.target.closest('dialog'))) return;
    e.preventDefault();
    void handleClose();
  }

  function add(recipient: ComposeRecipient) {
    touchedRef.current = true;
    setError(null);
    const result = addRecipient(recipients, recipient);
    if (result.ok) setRecipients(result.recipients);
  }

  const labelClass = 'block text-[0.6875rem] text-text-dim';
  const subjectOver = subject.length > MAX_SUBJECT_LENGTH;
  const bodyOver = bodyLength > MAX_BODY_LENGTH;

  const content = (
    <section
      ref={sectionRef}
      role={fullPane ? 'dialog' : undefined}
      aria-modal={fullPane ? true : undefined}
      aria-label={t('mail.newMailHeading')}
      onKeyDown={onSectionKeyDown}
      // `dvh` does not shrink for the iOS keyboard, so a known visual viewport sizes the pane.
      style={
        fullPane && viewport ? { top: viewport.offsetTop, height: viewport.height } : undefined
      }
      className={cx(
        'flex flex-col',
        fullPane
          ? cx(
              'fixed inset-x-0 z-50 bg-bg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
              viewport ? '' : 'inset-y-0 h-dvh'
            )
          : 'min-h-96 gap-3'
      )}
    >
      <header
        className={cx(
          'flex shrink-0 items-center gap-2',
          fullPane && 'border-b border-line px-2 py-2'
        )}
      >
        <h2 className="min-w-0 flex-1 truncate text-xs font-semibold tracking-widest text-text-dim uppercase">
          {t('mail.newMailHeading')}
        </h2>
        <IconButton
          icon={<Icon.Close />}
          label={t('mail.newMailClose')}
          onClick={() => void handleClose()}
          disabled={sending}
        />
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
            autoFocus
            invalid={error !== null && recipients.length === 0}
            describedBy={error !== null && recipients.length === 0 ? errorId : undefined}
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-baseline justify-between">
            <label htmlFor={subjectId} className={labelClass}>
              {t('mail.subjectLabel')}
            </label>
            <MailCounter count={subject.length} max={MAX_SUBJECT_LENGTH} />
          </div>
          <TextInput
            id={subjectId}
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
            aria-describedby={bodyCountId}
            counter={
              <MailCounter
                id={bodyCountId}
                count={bodyLength}
                max={MAX_BODY_LENGTH}
                warnFrom={0.9}
              />
            }
            aria-invalid={bodyOver}
            className={fullPane ? 'min-h-40 flex-1 resize-none' : 'min-h-64'}
          />
        </div>

        {problems.map((p) =>
          p === 'noRecipients' ? null : (
            <FieldError key={p} id={`${fieldId}-${p}`}>
              {t(`mail.problem.${p}`, { max: MAX_RECIPIENTS })}
            </FieldError>
          )
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>

      <GrantNote
        characterId={characterId}
        endpoints={SEND_MAIL_ENDPOINTS}
        title={t('mail.sendGrantTitle')}
        hint={t('mail.sendGrantHint')}
        actionLabel={t('mail.sendGrantAction')}
      />

      <MailComposeFooter
        size="md"
        sending={sending}
        blocked={blocked}
        onSend={() => void handleSend()}
        pinned={fullPane}
      >
        {!isNewMailEmpty(fields) && (
          <Button
            variant="danger"
            size="md"
            onClick={() => setConfirmingDiscard(true)}
            disabled={sending}
          >
            {t('mail.discardDraft')}
          </Button>
        )}
        {!online && saved && (
          <span className="truncate text-xs text-text-dim">{t('mail.draftSaved')}</span>
        )}
      </MailComposeFooter>

      <Modal
        open={confirmingDiscard}
        onClose={() => setConfirmingDiscard(false)}
        title={t('mail.discardTitle')}
      >
        <div className="space-y-4 text-sm">
          <p>{t('mail.discardBody')}</p>
          <div className="flex justify-end gap-2">
            <Button size="md" onClick={() => setConfirmingDiscard(false)}>
              {t('mail.discardKeep')}
            </Button>
            <Button variant="danger" size="md" onClick={() => void handleDiscard()}>
              {t('mail.discardConfirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
  return fullPane ? createPortal(content, document.body) : content;
}
