import { useEffect, useMemo, useState } from 'react';
import { parsePositiveInt } from '@/engine/market/urlState';
import { MAIL_OWNER_PARAM, OPEN_PARAM } from '@/lib/highlightParam';
import { nullableTextParam } from '@/lib/urlState';
import { useUrlParams } from '@/lib/useUrlState';

export interface MailOpenTarget {
  mailId: number;
  /** Null when the link named no owner: the active Character's mailbox. */
  ownerId: number | null;
}

const OPEN_PARAMS = { [OPEN_PARAM]: nullableTextParam(), [MAIL_OWNER_PARAM]: nullableTextParam() };

/**
 * The mail a widget row asked Mail to open, from `?open=<mailId>&owner=<characterId>`.
 * One-shot like `useOpenParam` (latched on mount, params stripped at once), and
 * both keys go in a single write. The strip runs once, on mount, through
 * `useUrlParams`, which merges onto the live URL: a strip re-run on every URL
 * change, from the query string as last rendered, undid a write that had landed
 * since (a Hide read click lost `hideRead=1`).
 */
export function useMailOpenParam(): MailOpenTarget | null {
  const [params, setParams] = useUrlParams(OPEN_PARAMS);
  const [initial] = useState(() => ({
    linked: params[OPEN_PARAM] !== null || params[MAIL_OWNER_PARAM] !== null,
    mailId: parsePositiveInt(params[OPEN_PARAM]),
    ownerId: parsePositiveInt(params[MAIL_OWNER_PARAM]),
  }));

  useEffect(() => {
    if (initial.linked) setParams({ [OPEN_PARAM]: null, [MAIL_OWNER_PARAM]: null });
  }, [initial, setParams]);

  // Stable identity: Mail re-renders when the strip above rewrites the URL, and a fresh object would read as a new request.
  return useMemo(
    () => (initial.mailId === null ? null : { mailId: initial.mailId, ownerId: initial.ownerId }),
    [initial]
  );
}
