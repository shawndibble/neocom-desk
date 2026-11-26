import { useEffect, useMemo, useState } from 'react';
import { parsePositiveInt } from '@/engine/market/urlState';
import { MAIL_OWNER_PARAM, OPEN_PARAM } from '@/lib/highlightParam';
import { nullableTextParam } from '@/lib/urlState';
import { useUrlParams } from '@/lib/useUrlState';

export interface MailOpenTarget {
  mailId: number;
  ownerId: number | null;
}

const OPEN_PARAMS = { [OPEN_PARAM]: nullableTextParam(), [MAIL_OWNER_PARAM]: nullableTextParam() };

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

  return useMemo(
    () => (initial.mailId === null ? null : { mailId: initial.mailId, ownerId: initial.ownerId }),
    [initial]
  );
}
