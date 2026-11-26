import { useEffect, useRef, useState } from 'react';
import { loadMailBody } from '@/features/character/mail';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { useFocusHeading } from '@/lib/useFocusHeading';
import { stripEveMarkup } from '@/features/skills/typeDisplay';
import type { CachedResult } from '@/esi/cache';
import type { ComposeKind } from '@/engine/mail/mail';
import type { MailBody } from '@/esi/endpoints';

export function useMailBody(
  selected: { ownerId: number; mailId: number; key: string } | null,
  isDesktop: boolean,
  composeKind: ComposeKind | null
) {
  const selectedKey = selected?.key ?? null;
  const [bodySnapshot, setBodySnapshot] = useState<{
    key: string;
    result: CachedResult<MailBody> | null;
  } | null>(null);
  const [bodyAttempt, setBodyAttempt] = useState(0);

  useEffect(() => {
    if (selected === null) return;
    let cancelled = false;
    void loadMailBody(selected.ownerId, selected.mailId).then((result) => {
      if (!cancelled) setBodySnapshot({ key: selected.key, result });
    });
    return () => {
      cancelled = true;
    };
  }, [selected, bodyAttempt]);

  const body = bodySnapshot?.key === selectedKey ? bodySnapshot.result : undefined;
  const [bodyRetryRef, , holdBodyFocus] = useRetryFocus<HTMLDivElement>(
    body === undefined ? 'busy' : body === null ? 'failed' : 'ok',
    selectedKey
  );
  const bodyText = body?.data.body ? stripEveMarkup(body.data.body) : '';

  const readerHeadingRef = useRef<HTMLElement>(null);
  useFocusHeading(
    readerHeadingRef,
    body === undefined ? null : selectedKey,
    !isDesktop && composeKind === null
  );

  function retry() {
    holdBodyFocus();
    setBodySnapshot(null);
    setBodyAttempt((n) => n + 1);
  }

  return { body, bodyText, bodyRetryRef, readerHeadingRef, retry };
}
