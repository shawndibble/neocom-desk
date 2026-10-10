/**
 * How to get a scan out of the game, as one numbered list with the in-game
 * windows shown where their steps begin. The badges on the pictures carry the
 * same numbers as the steps, so a pilot can find the spot on screen. Shown
 * under the empty state, where the page is waiting for the first paste.
 */
import { useTranslation } from 'react-i18next';

interface HowToStep {
  key: string;
  /** The in-game picture that covers this step and the ones after it, until the next picture. */
  image?: { src: string; width: number; height: number; alt: string };
}

const STEPS: readonly HowToStep[] = [
  {
    key: 'openMenu',
    image: { src: '/images/survey/scan-menu.webp', width: 752, height: 378, alt: 'menuAlt' },
  },
  { key: 'openResults' },
  {
    key: 'scan',
    image: { src: '/images/survey/scan-results.webp', width: 750, height: 826, alt: 'resultsAlt' },
  },
  { key: 'expand' },
  { key: 'copy' },
  { key: 'paste' },
];

export function SurveyHowTo() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="survey-how-to" className="mx-auto max-w-md space-y-3 px-4">
      <h2
        id="survey-how-to"
        className="text-xs font-semibold tracking-widest text-text-dim uppercase"
      >
        {t('survey.howTo.title')}
      </h2>
      <ol className="space-y-3 text-sm text-text">
        {STEPS.map(({ key, image }, i) => (
          <li key={key} className="space-y-3">
            {image && (
              <img
                src={image.src}
                alt={t(`survey.howTo.${image.alt}`)}
                width={image.width}
                height={image.height}
                className="w-full rounded border border-line"
              />
            )}
            <div className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-contrast"
              >
                {i + 1}
              </span>
              <span>{t(`survey.howTo.${key}`)}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
