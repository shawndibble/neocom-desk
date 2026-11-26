import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QuestionRow } from '@/components/ui/QuestionRow';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { LANDING_FAQ } from './landingFaqEntries';

export function LandingFaq() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  function toggle(id: string) {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  }

  return (
    <ul className="mt-6 divide-y divide-line border border-line bg-bg/60">
      {LANDING_FAQ.map(({ id, readMore }) => (
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
  );
}
