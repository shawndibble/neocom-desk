import { useEffect, useState } from 'react';
import type { DoctrineCheckRecord, DoctrinePreview } from '../srpTypes';
import { looksLikeKillmailLink } from './srpMemberModel';

const DEBOUNCE_MS = 400;

export interface DoctrinePreviewState {
  /** The check for the link as it stands now; undefined while unread, unreadable or unchecked. */
  check: DoctrineCheckRecord | undefined;
  /** A read of this link is waiting or in flight. */
  checking: boolean;
}

/**
 * The doctrine check of the killmail link in the form, read once the text looks like a link and
 * the pilot has stopped typing. An answer belongs to the link it was read for: after an edit the
 * old result is gone at once. A failed read shows nothing, since filing reports its own errors.
 */
export function useDoctrinePreview(
  link: string,
  read: (killmail: string) => Promise<DoctrinePreview>,
  enabled: boolean
): DoctrinePreviewState {
  const trimmed = link.trim();
  const active = enabled && looksLikeKillmailLink(trimmed);
  const [done, setDone] = useState<{ link: string; check: DoctrineCheckRecord | null } | null>(
    null
  );
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      read(trimmed).then(
        (preview) => !cancelled && setDone({ link: trimmed, check: preview.check }),
        () => !cancelled && setDone({ link: trimmed, check: null })
      );
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, trimmed, read]);
  if (!active) return { check: undefined, checking: false };
  if (done?.link !== trimmed) return { check: undefined, checking: true };
  return { check: done.check ?? undefined, checking: false };
}
