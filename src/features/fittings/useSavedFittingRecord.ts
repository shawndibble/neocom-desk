import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation } from 'react-router-dom';
import { db } from '@/db';

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
    savedRecord.id === savedId &&
    currentShareCode !== null &&
    savedRecord.code !== currentShareCode;
  return { savedRecord, currentShareCode, hasUnsavedEdits };
}
