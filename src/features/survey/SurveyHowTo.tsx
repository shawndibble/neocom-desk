import { useTranslation } from 'react-i18next';

interface HowToPicture {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption?: string;
}

interface HowToStep {
  key: string;
  pictures?: readonly HowToPicture[];
}

const STEPS: readonly HowToStep[] = [
  {
    key: 'openMenu',
    pictures: [
      {
        src: '/images/survey/scan-menu.webp',
        width: 752,
        height: 378,
        alt: 'menuAlt',
        caption: 'olderOverlay',
      },
      {
        src: '/images/survey/scan-menu-new.webp',
        width: 566,
        height: 364,
        alt: 'menuNewAlt',
        caption: 'newerOverlay',
      },
    ],
  },
  { key: 'openResults' },
  {
    key: 'scan',
    pictures: [
      { src: '/images/survey/scan-results.webp', width: 750, height: 826, alt: 'resultsAlt' },
    ],
  },
  { key: 'expand' },
  { key: 'copy' },
  { key: 'paste' },
];

export function SurveyHowTo({ heading = true }: { heading?: boolean }) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby={heading ? 'survey-how-to' : undefined}
      aria-label={heading ? undefined : t('survey.howTo.title')}
      className="mx-auto max-w-2xl space-y-3 px-4"
    >
      {heading && (
        <h2
          id="survey-how-to"
          className="text-xs font-semibold tracking-widest text-text-dim uppercase"
        >
          {t('survey.howTo.title')}
        </h2>
      )}
      <ol className="space-y-3 text-sm text-text">
        {STEPS.map(({ key, pictures }, i) => (
          <li key={key} className="space-y-3">
            {pictures && (
              <div
                className={
                  pictures.length > 1 ? 'grid items-end gap-3 sm:grid-cols-2' : 'mx-auto max-w-md'
                }
              >
                {pictures.map((picture) => (
                  <figure key={picture.src} className="space-y-1">
                    <img
                      src={picture.src}
                      alt={t(`survey.howTo.${picture.alt}`)}
                      width={picture.width}
                      height={picture.height}
                      className="w-full rounded-xs border border-line"
                    />
                    {picture.caption && (
                      <figcaption className="text-center text-xs text-text-dim">
                        {t(`survey.howTo.${picture.caption}`)}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
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
