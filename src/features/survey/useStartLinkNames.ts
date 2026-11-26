import { useEffect, useState } from 'react';
import { MIN_PAYEE_SEARCH_LENGTH } from '@/features/miningTax/payeeEntitySearch';
import { LOOKUP_DEBOUNCE_MS } from '@/lib/useDebouncedValue';
import type { StartLinkFields } from './startLink';
import {
  resolvePayeeId,
  resolveTypedPayee,
  resolvePlaceId,
  type PayeeKind,
  type Resolved,
} from './startLinkNames';

export type NameStatus<Extra = object> = 'idle' | 'loading' | Resolved<Extra>;

interface Answer<K, T> {
  key: K;
  result: T;
}

function useLookup<K extends string | number, T>(
  key: K | null,
  lookup: (key: K, signal: AbortSignal) => Promise<T>
): 'idle' | 'loading' | T {
  const [answer, setAnswer] = useState<Answer<K, T> | null>(null);
  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void lookup(key, controller.signal).then((result) => {
        if (!controller.signal.aborted) setAnswer({ key, result });
      });
    }, LOOKUP_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, lookup]);
  if (key === null) return 'idle';
  return answer?.key === key ? answer.result : 'loading';
}

export function useStartLinkNames(fields: StartLinkFields): {
  place: NameStatus;
  payee: NameStatus<{ kind: PayeeKind; id: number }>;
  payeeByName: boolean;
} {
  const placeId = fields.place !== null && fields.place.name.trim() === '' ? fields.place.id : null;
  const payeeId = fields.payee?.id ?? null;
  const typed = fields.payee?.name.trim() ?? '';
  const byId = useLookup(payeeId, resolvePayeeId);
  const byName = useLookup(
    payeeId === null && typed.length >= MIN_PAYEE_SEARCH_LENGTH ? typed : null,
    resolveTypedPayee
  );
  return {
    place: useLookup(placeId, resolvePlaceId),
    payee: payeeId === null ? byName : byId,
    payeeByName: payeeId === null,
  };
}
