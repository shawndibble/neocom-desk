/**
 * Names for the IDs the start page's form holds, looked up as they are typed or
 * arrive in the link (`startLinkNames.ts`). `idle` means there is no ID to look
 * up; `loading` that its answer has not landed; otherwise the answer.
 */
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

/** One lookup: debounced, aborted when its key changes, and keyed by the key it answered. */
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
  /** The payee as ESI names it: by its ID when the form has one, else by the name typed. */
  payee: NameStatus<{ kind: PayeeKind; id: number }>;
  /** Whether `payee` is the answer to a typed name (so its ID is new to the form). */
  payeeByName: boolean;
} {
  // A place typed by name needs no lookup: only an ID with no name does.
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
