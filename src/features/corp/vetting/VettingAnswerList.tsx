import type { VettingAnswer } from '@/engine/vetting';

/** A corp's questions with what the pilot answered, each question as it read when answered. */
export function VettingAnswerList({ answers }: { answers: readonly VettingAnswer[] }) {
  return (
    <dl className="space-y-3 text-sm">
      {answers.map((entry) => (
        <div key={entry.questionId} className="space-y-0.5">
          <dt className="text-xs text-text-dim">{entry.label}</dt>
          <dd className="break-words whitespace-pre-wrap">{entry.answer}</dd>
        </div>
      ))}
    </dl>
  );
}
