import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QuestionRow } from '@/components/ui/QuestionRow';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { LANDING_FAQ } from './landingFaqEntries';

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
            <QuestionRow
              key={id}
              question={t(`login.faq.${id}.q`)}
              expanded={open.has(id)}
              onToggle={() => toggle(id)}
              answerClassName="text-text-dim"
            >
              <p>{t(`login.faq.${id}.a`)}</p>
              {readMore !== undefined && (
                <p>
                  <a href={readMore} className={inlineLinkClassName}>
                    {t('login.faq.readMore')}
                  </a>
                </p>
              )}
            </QuestionRow>
          ))}
        </ul>
      ))}
    </div>
  );
}
