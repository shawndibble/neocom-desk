import { useId, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Collapse } from './Collapse';
import { Caret } from './Disclosure';
import { focusRingInsetClassName, rowInteractiveClassName } from './controlStyles';

interface QuestionRowProps {
  question: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  id?: string;
  className?: string;
  answerClassName?: string;
}

/** @summary A body-size FAQ row (caret and question) that opens its answer below. */
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
      <Collapse open={expanded} closeInstantly>
        <div
          id={answerId}
          className={cx('space-y-2 border-t border-line px-3 py-3 text-sm', answerClassName)}
        >
          {children}
        </div>
      </Collapse>
    </li>
  );
}
