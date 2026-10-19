import { useEffect, useRef, useState } from 'react';
import { mailKey, type ComposeKind } from '@/engine/mail/mail';

interface MailTarget {
  ownerId: number;
  mailId: number;
}

/**
 * Which mail is open (as owner + `mail_id`: the id alone repeats across
 * mailboxes), which Reply/Forward box is open on it, and the focus hand-offs
 * those transitions owe (issue #1485).
 */
export function useMailSelection(isDesktop: boolean) {
  const [selected, setSelected] = useState<(MailTarget & { key: string }) | null>(null);
  const selectedKey = selected?.key ?? null;
  // Reset on every selection change, so switching mails never leaves a stale
  // Reply/Forward box open against the wrong header.
  const [composeKind, setComposeKind] = useState<ComposeKind | null>(null);

  function selectMail(target: MailTarget | null) {
    setSelected(target && { ...target, key: mailKey(target.ownerId, target.mailId) });
    setComposeKind(null);
  }

  // Below the `lg:` breakpoint, opening a mail hides the list Panel and Back
  // hides the reader Panel again — both CSS `hidden`, not an unmount, so there
  // is no mount effect, only a place to land focus once the swap has happened.
  const searchInputRef = useRef<HTMLInputElement>(null);
  // The exact row button last clicked — a DOM node, not a mail id +
  // `querySelector`, so a row the "Hide read" filter has since removed is
  // simply not `.isConnected` rather than matching another row sharing an id.
  const openedRowRef = useRef<HTMLButtonElement | null>(null);
  function selectMailFromRow(target: MailTarget, row: HTMLButtonElement) {
    openedRowRef.current = row;
    selectMail(target);
  }
  // Back-to-list focus restore: only when the pilot actually pressed Back,
  // never for an unrelated `selectedKey` reset — e.g. switching characters.
  const backToListRef = useRef(false);
  function handleBackToList() {
    backToListRef.current = true;
    selectMail(null);
  }
  useEffect(() => {
    if (selectedKey !== null) return;
    // Cleared unconditionally the moment `selectedKey` goes null, before the
    // `isDesktop` check below — otherwise a resize straight after the Back
    // click (landing between the click and this effect's commit) could skip
    // the reset entirely, leaving a stale flag that a later, unrelated
    // `selectedKey` reset (a character switch) would misread as "Back was
    // pressed" and wrongly steal focus for.
    const wasBackPressed = backToListRef.current;
    backToListRef.current = false;
    if (!wasBackPressed || isDesktop) return;
    const row = openedRowRef.current;
    if (row && row.isConnected) row.focus();
    else searchInputRef.current?.focus();
  }, [selectedKey, isDesktop]);

  // Reply/Forward focus restore: both buttons unmount the instant
  // `composeKind` is set, so Cancel/Send have nothing to hand focus back to
  // unless it's remembered up front. Records which button opened it and for
  // which mail; a mail switch clears `composeKind` too (see `selectMail`), and
  // that must NOT steal focus back onto a mail the pilot has since left.
  const replyButtonRef = useRef<HTMLButtonElement>(null);
  const forwardButtonRef = useRef<HTMLButtonElement>(null);
  const composeOpenedFromRef = useRef<{ kind: ComposeKind; key: string } | null>(null);
  function openCompose(kind: ComposeKind, key: string) {
    composeOpenedFromRef.current = { kind, key };
    setComposeKind(kind);
  }
  useEffect(() => {
    if (composeKind !== null) return;
    const opened = composeOpenedFromRef.current;
    if (opened === null) return;
    composeOpenedFromRef.current = null;
    if (selectedKey !== opened.key) return;
    const button = opened.kind === 'reply' ? replyButtonRef.current : forwardButtonRef.current;
    button?.focus();
  }, [composeKind, selectedKey]);

  return {
    selected,
    selectedKey,
    composeKind,
    setComposeKind,
    selectMail,
    selectMailFromRow,
    handleBackToList,
    openCompose,
    searchInputRef,
    replyButtonRef,
    forwardButtonRef,
  };
}
