import { useId, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Caret } from './Disclosure';
import { focusRingInsetClassName, rowInteractiveClassName } from './controlStyles';

interface QuestionRowProps {
  /** The question, read as a sentence. */
  question: string;
  expanded: boolean;
  onToggle: () => void;
  /** The answer, shown under the question while `expanded`. */
  children: ReactNode;
  /** An anchor id on the row, so `#<id>` can open and scroll to it. */
  id?: string;
  /** The row's frame (border, fill, scroll margin); the toggle and answer are fixed. */
  className?: string;
  /** Text tone of the answer, e.g. `text-text-dim`. */
  answerClassName?: string;
}

/**
 * One FAQ question: a body-size row that opens its answer below. Not
 * `Disclosure`, whose label is a micro-heading: a question is read as a
 * sentence. The caller owns `expanded`, so a list can open several at once or
 * follow a URL hash. Render inside a `<ul>`.
 *
 * @summary A body-size FAQ row (caret and question) that opens its answer below.
 */
export function QuestionRow({
  question,
  expanded,
  onToggle,
  children,
  id,
  className,
  answerClassName,
}: QuestionRowProps) {
  const answerId = useId();
  return (
    <li id={id} className={className}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? answerId : undefined}
        onClick={onToggle}
        className={cx(
          'flex min-h-9 w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-text',
          rowInteractiveClassName,
          focusRingInsetClassName
        )}
      >
        <Caret expanded={expanded} />
        {question}
      </button>
      {expanded && (
        <div
          id={answerId}
          className={cx('space-y-2 border-t border-line px-3 py-3 text-sm', answerClassName)}
        >
          {children}
        </div>
      )}
    </li>
  );
}
