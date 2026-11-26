import { useEffect, useState } from 'react';
import type { DoctrineCheckRecord, DoctrinePreview } from '../srpTypes';
import { looksLikeKillmailLink } from './srpMemberModel';

const DEBOUNCE_MS = 400;

export interface DoctrinePreviewState {
  check: DoctrineCheckRecord | undefined;
  checking: boolean;
}

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
