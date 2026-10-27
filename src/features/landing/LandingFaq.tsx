import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret } from '@/components/ui/Disclosure';
import {
  focusRingInsetClassName,
  inlineLinkClassName,
  rowInteractiveClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { LANDING_FAQ } from './landingFaqEntries';

function FaqRow({
  question,
  expanded,
  onToggle,
  children,
}: {
  question: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const answerId = useId();
  return (
    <li>
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
          className="space-y-2 border-t border-line px-3 py-3 text-sm text-text-dim"
        >
          {children}
        </div>
      )}
    </li>
  );
}

/** Short answers to the questions asked before logging in, closed by default, hairline-divided. */
export function LandingFaq() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  function toggle(id: string) {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  }

  const half = Math.ceil(LANDING_FAQ.length / 2);
  // Two independent columns from lg, so opening an answer in one never
  // stretches a row in the other; one column (in order) below that.
  return (
    <div className="mt-6 grid items-start gap-3 lg:grid-cols-2 lg:gap-x-6">
      {[LANDING_FAQ.slice(0, half), LANDING_FAQ.slice(half)].map((column) => (
        <ul key={column[0]?.id} className="divide-y divide-line border border-line bg-bg/60">
          {column.map(({ id, readMore }) => (
            <FaqRow
              key={id}
              question={t(`login.faq.${id}.q`)}
              expanded={open.has(id)}
              onToggle={() => toggle(id)}
            >
              <p>{t(`login.faq.${id}.a`)}</p>
              {readMore !== undefined && (
                <p>
                  <a href={readMore} className={inlineLinkClassName}>
                    {t('login.faq.readMore')}
                  </a>
                </p>
              )}
            </FaqRow>
          ))}
        </ul>
      ))}
    </div>
  );
}
