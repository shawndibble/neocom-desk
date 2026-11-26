import { lazy, Suspense } from 'react';
import { guarded } from '@/app/routeChunks';

const SurveyNotesMarkdown = lazy(() => guarded(() => import('./SurveyNotesMarkdown')));

export function SurveyNotes({ notes }: { notes: string }) {
  return (
    <Suspense fallback={<p className="whitespace-pre-line [overflow-wrap:anywhere]">{notes}</p>}>
      <SurveyNotesMarkdown notes={notes} />
    </Suspense>
  );
}
