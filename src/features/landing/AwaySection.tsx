import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { focusRingInsetClassName } from '@/components/ui/controlStyles';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { hudLabelClassName } from './hudLabel';
import { PHONE_TILES } from './phoneTiles';
import { screenshotSrc, screenshotSrcSet, type Screenshot } from './screenshots';
import { ScreenshotZoom, ZoomBadge } from './ScreenshotZoom';
import { TourVideoLink } from './TourVideo';

const ALERTS = [
  { key: 'undercut', tone: 'bg-warning' },
  { key: 'extractor', tone: 'bg-warning' },
  { key: 'job', tone: 'bg-success' },
  { key: 'skill', tone: 'bg-accent' },
  { key: 'mail', tone: 'bg-accent' },
  { key: 'filled', tone: 'bg-success' },
] as const;

const FILTERS = ['all', 'market', 'industry', 'mail', 'skills'] as const;

export function AwaySection() {
  const { t } = useTranslation();
  const [zoomed, setZoomed] = useState<Screenshot | null>(null);
  return (
    <div className="mt-10 grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
      <div>
        <div className="border border-line bg-panel">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3.5">
            <p className="text-sm font-semibold">{t('login.away.feedTitle')}</p>
            <p className={cx(hudLabelClassName, 'text-[0.6875rem] text-accent')}>
              {t('login.away.markAll')}
            </p>
          </div>
          <ul
            aria-label={t('login.away.filtersLabel')}
            className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2.5"
          >
            {FILTERS.map((filter, index) => (
              <li
                key={filter}
                className={cx(
                  hudLabelClassName,
                  'border px-2 py-1 text-[0.6875rem]',
                  index === 0
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-line text-text-dim'
                )}
              >
                {t(`login.away.filters.${filter}`)}
              </li>
            ))}
          </ul>
          <ul aria-label={t('login.away.feedLabel')}>
            {ALERTS.map(({ key, tone }) => (
              <li
                key={key}
                className="grid grid-cols-[0.5rem_minmax(0,1fr)_auto] items-start gap-x-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <span aria-hidden="true" className={cx('mt-2 size-2', tone)} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{t(`login.away.alerts.${key}.title`)}</p>
                  <p className="text-sm text-text-dim">{t(`login.away.alerts.${key}.detail`)}</p>
                </div>
                <p className="text-xs whitespace-nowrap text-text-faint">
                  {t(`login.away.alerts.${key}.ago`)}
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className={eyebrowClassName}>{t('login.showcase.watch')}</span>
          <TourVideoLink video="alerts" variant="button" />
        </div>
      </div>
      <div>
        <ul className="flex items-end justify-center gap-3.5">
          {PHONE_TILES.map(({ key, shot }, index) => (
            <li key={key} className={cx('w-[31%] max-w-52 min-w-0', index === 1 && 'mb-7')}>
              <PhoneShot shot={shot} onOpen={() => setZoomed(shot)} />
            </li>
          ))}
        </ul>
        <p className="mx-auto mt-6 max-w-120 text-center text-text-dim">
          {t('login.away.phoneCaption')}
        </p>
      </div>
      <ScreenshotZoom shot={zoomed} onClose={() => setZoomed(null)} />
    </div>
  );
}

function PhoneShot({ shot, onOpen }: { shot: Screenshot; onOpen: () => void }) {
  const { t } = useTranslation();
  const alt = t(`login.screenshots.${shot.key}.alt`);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('login.screenshotEnlarge', { alt })}
      className={cx(
        // eslint-disable-next-line no-restricted-syntax -- landing phone-capture frame keeps its bezel radius (DESIGN.md §3)
        'group relative block w-full cursor-zoom-in overflow-hidden rounded-xl border border-line-bright bg-panel shadow-lg',
        focusRingInsetClassName
      )}
    >
      <img
        src={screenshotSrc(shot)}
        srcSet={screenshotSrcSet(shot)}
        sizes="min(32vw, 13rem)"
        alt={alt}
        width={shot.size.width}
        height={shot.size.height}
        loading="lazy"
        decoding="async"
        className="block h-auto w-full"
      />
      <ZoomBadge />
    </button>
  );
}
