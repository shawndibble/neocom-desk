import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation } from 'react-router-dom';
import { db } from '@/db';

/**
 * The record the open Fitting was saved from (for the "Save as new…" prefill),
 * plus whether the URL's share code has drifted from it, which tells Compare
 * there are unsaved edits against it.
 */
export function useSavedFittingRecord(savedId: string | null) {
  const { search } = useLocation();
  const savedRecord = useLiveQuery(
    () => (savedId === null ? undefined : db.fittings.get(savedId)),
    [savedId]
  );
  const currentShareCode = new URLSearchParams(search).get('f');
  const hasUnsavedEdits =
    savedId !== null &&
    savedRecord !== undefined &&
    // Guards the render right after a save/save-as-new, where `savedRecord`
    // (async, via useLiveQuery) can still be the previous record for a tick
    // after `savedId` (synchronous) already points at the new one.
    savedRecord.id === savedId &&
    currentShareCode !== null &&
    savedRecord.code !== currentShareCode;
  return { savedRecord, currentShareCode, hasUnsavedEdits };
}
