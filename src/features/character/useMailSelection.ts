import { useEffect, useRef, useState } from 'react';
import { mailKey, type ComposeKind } from '@/engine/mail/mail';

interface MailTarget {
  ownerId: number;
  mailId: number;
}

export function useMailSelection(isDesktop: boolean) {
  const [selected, setSelected] = useState<(MailTarget & { key: string }) | null>(null);
  const selectedKey = selected?.key ?? null;
  const [composeKind, setComposeKind] = useState<ComposeKind | null>(null);

  function selectMail(target: MailTarget | null) {
    setSelected(target && { ...target, key: mailKey(target.ownerId, target.mailId) });
    setComposeKind(null);
  }

  const searchInputRef = useRef<HTMLInputElement>(null);
  const openedRowRef = useRef<HTMLButtonElement | null>(null);
  function selectMailFromRow(target: MailTarget, row: HTMLButtonElement) {
    openedRowRef.current = row;
    selectMail(target);
  }
  const backToListRef = useRef(false);
  function handleBackToList() {
    backToListRef.current = true;
    selectMail(null);
  }
  useEffect(() => {
    if (selectedKey !== null) return;
    const wasBackPressed = backToListRef.current;
    backToListRef.current = false;
    if (!wasBackPressed || isDesktop) return;
    const row = openedRowRef.current;
    if (row && row.isConnected) row.focus();
    else searchInputRef.current?.focus();
  }, [selectedKey, isDesktop]);

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
