import { lazy, Suspense } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { guarded } from '@/app/routeChunks';
import { db } from '@/db';

const MailQueueHost = lazy(() => guarded(() => import('./MailQueueHost')));

export function MailQueueMount() {
  const count = useLiveQuery(() => db.corpMailQueue.count(), [], 0);
  if (count === 0) return null;
  return (
    <Suspense fallback={null}>
      <MailQueueHost />
    </Suspense>
  );
}
