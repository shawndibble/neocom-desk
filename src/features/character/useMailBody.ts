import { useEffect, useRef, useState } from 'react';
import { loadMailBody } from '@/features/character/mail';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { useFocusHeading } from '@/lib/useFocusHeading';
import { stripEveMarkup } from '@/features/skills/typeDisplay';
import type { CachedResult } from '@/esi/cache';
import type { ComposeKind } from '@/engine/mail/mail';
import type { MailBody } from '@/esi/endpoints';

/** The open mail's body: load, retry, and the focus the reading pane owes (issue #1485). */
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
  /** Bumped by "Try again" on a body that could not be read, to refetch it. */
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
  // Stripped once, shared by the reading pane's own paragraph and the
  // compose box's auto-quote — both must quote exactly what the pilot reads.
  const bodyText = body?.data.body ? stripEveMarkup(body.data.body) : '';

  // Reader heading focus: fires once `body` has resolved for the newly
  // selected mail, not the instant `selectedKey` changes — focusing a
  // still-loading pane would land on a spinner. `enabled: !isDesktop` —
  // narrow-only; see `useFocusHeading`'s own doc comment for why that's a
  // separate param rather than folded into the key. Off while composing too:
  // Reply/Forward render from the header alone, so a pilot can open one before
  // the body loads — the compose box then mounts with the body, and its own
  // focus must not lose to this heading's.
  const readerHeadingRef = useRef<HTMLElement>(null);
  useFocusHeading(
    readerHeadingRef,
    body === undefined ? null : selectedKey,
    !isDesktop && composeKind === null
  );

  function retry() {
    // The retry button unmounts while the body loads: the wrapper holds focus meanwhile.
    holdBodyFocus();
    setBodySnapshot(null);
    setBodyAttempt((n) => n + 1);
  }

  return { body, bodyText, bodyRetryRef, readerHeadingRef, retry };
}
