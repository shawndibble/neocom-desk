import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { parsePositiveInt } from '@/engine/market/urlState';
import { MAIL_OWNER_PARAM, OPEN_PARAM } from '@/lib/highlightParam';

export interface MailOpenTarget {
  mailId: number;
  /** Null when the link named no owner: the active Character's mailbox. */
  ownerId: number | null;
}

/**
 * The mail a widget row asked Mail to open, from `?open=<mailId>&owner=<characterId>`.
 * One-shot like `useOpenParam` (latched on mount, params stripped at once), but
 * it strips both keys in a single update: two hooks each calling `setSearchParams`
 * in one commit would overwrite each other's change.
 */
export function useMailOpenParam(): MailOpenTarget | null {
  const [searchParams, setSearchParams] = useSearchParams();
  const [initial] = useState(() => ({
    mailId: parsePositiveInt(searchParams.get(OPEN_PARAM)),
    ownerId: parsePositiveInt(searchParams.get(MAIL_OWNER_PARAM)),
  }));

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete(OPEN_PARAM);
        params.delete(MAIL_OWNER_PARAM);
        return params;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  return initial.mailId === null ? null : { mailId: initial.mailId, ownerId: initial.ownerId };
}
