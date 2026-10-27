import { lazy, Suspense } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { guarded } from '@/app/routeChunks';
import { db } from '@/db';

const MailQueueHost = lazy(() => guarded(() => import('./MailQueueHost')));

/**
 * The shell's hook for the Corp Tax Book send queue (D24: nothing corp-side
 * until a Corp Tax Book has queued mail). Counts the rows, and only then loads
 * the chip and the sender.
 */
export function MailQueueMount() {
  const count = useLiveQuery(() => db.corpMailQueue.count(), [], 0);
  if (count === 0) return null;
  return (
    <Suspense fallback={null}>
      <MailQueueHost />
    </Suspense>
  );
}
