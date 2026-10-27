/**
 * The notes row's body for readers: Markdown, parsed in a lazy chunk. Until it
 * arrives (and for a moment on first paint) the notes show as plain text, so
 * the words are never missing.
 */
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
