/**
 * How to get a scan out of the game, as numbered steps with the in-game
 * windows beside them. The badges on the pictures carry the same numbers as the
 * steps, so a pilot can find the spot on screen. Shown under the empty state,
 * where the page is waiting for the first paste.
 */
import { useTranslation } from 'react-i18next';

const GROUPS = [
  {
    start: 1,
    src: '/images/survey/scan-menu.webp',
    width: 752,
    height: 378,
    alt: 'survey.howTo.menuAlt',
    steps: ['openMenu', 'openResults'],
  },
  {
    start: 3,
    src: '/images/survey/scan-results.webp',
    width: 750,
    height: 826,
    alt: 'survey.howTo.resultsAlt',
    steps: ['scan', 'expand', 'copy'],
  },
] as const;

function Step({ n, children }: { n: number; children: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-contrast"
      >
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

export function SurveyHowTo() {
  const { t } = useTranslation();
  const last = GROUPS.reduce((n, g) => n + g.steps.length, 0) + 1;
  return (
    <section aria-labelledby="survey-how-to" className="mx-auto max-w-2xl space-y-4 px-4">
      <h3
        id="survey-how-to"
        className="text-xs font-semibold tracking-widest text-text-dim uppercase"
      >
        {t('survey.howTo.title')}
      </h3>
      {GROUPS.map((g) => (
        <div key={g.start} className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <img
            src={g.src}
            alt={t(g.alt)}
            width={g.width}
            height={g.height}
            loading="lazy"
            className="w-full rounded border border-line sm:w-1/2"
          />
          <ol className="flex-1 space-y-3 text-sm text-text" start={g.start}>
            {g.steps.map((key, i) => (
              <Step key={key} n={g.start + i}>
                {t(`survey.howTo.${key}`)}
              </Step>
            ))}
          </ol>
        </div>
      ))}
      <ol className="text-sm text-text" start={last}>
        <Step n={last}>{t('survey.howTo.paste')}</Step>
      </ol>
    </section>
  );
}
