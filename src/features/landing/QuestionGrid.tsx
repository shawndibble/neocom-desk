import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { PHONE_TILES, QUESTION_TILES, type Tile } from './questionTiles';
import { screenshotSrc, screenshotSrcSet, type Screenshot } from './screenshots';
import { ScreenshotZoom, ZoomBadge } from './ScreenshotZoom';

const EYEBROW_CLASS = 'font-mono text-[0.6875rem] tracking-widest text-text-dim uppercase';

const CELL_CLASS = cx(
  'group relative flex bg-bg has-[:focus-visible]:bg-panel-2',
  rowInteractiveClassName
);

export function QuestionGrid() {
  const [zoomed, setZoomed] = useState<Screenshot | null>(null);
  return (
    <>
      <ul className="mt-6 grid grid-cols-1 gap-px overflow-hidden border border-line bg-line md:grid-cols-2 lg:grid-cols-6">
        {QUESTION_TILES.map((tile) => (
          <li key={tile.key} className={cx('flex', tile.span)}>
            <QuestionCell tile={tile} onOpen={() => setZoomed(tile.shot)} />
          </li>
        ))}
        <li className="md:col-span-2 lg:col-span-6">
          <PhoneBand onOpen={setZoomed} />
        </li>
      </ul>
      <ScreenshotZoom shot={zoomed} onClose={() => setZoomed(null)} />
    </>
  );
}

function ShotButton({
  shot,
  onOpen,
  className,
}: {
  shot: Screenshot;
  onOpen: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const alt = t(`login.screenshots.${shot.key}.alt`);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('login.screenshotEnlarge', { alt })}
      className={cx(
        'relative block cursor-zoom-in overflow-hidden',
        focusRingInsetClassName,
        className
      )}
    >
      <span className="absolute inset-0 block mask-[linear-gradient(to_bottom,black_60%,transparent)]">
        <img
          src={screenshotSrc(shot)}
          srcSet={screenshotSrcSet(shot)}
          sizes="(min-width: 1024px) 40vw, (min-width: 768px) 50vw, 100vw"
          alt={alt}
          width={shot.size.width}
          height={shot.size.height}
          loading="lazy"
          decoding="async"
          className={cx(
            'block size-full object-cover object-top',
            'motion-safe:transition-[object-position] motion-safe:duration-[600ms] motion-safe:ease-out',
            'motion-safe:group-hover:object-bottom motion-safe:group-has-[:focus-visible]:object-bottom'
          )}
        />
      </span>
      <ZoomBadge />
    </button>
  );
}

function CellText({ tile, eyebrow }: { tile: Tile; eyebrow: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="p-4">
      {eyebrow && <p className={EYEBROW_CLASS}>{t(`login.answers.${tile.key}.eyebrow`)}</p>}
      <h3 className={cx('text-base font-semibold text-balance', eyebrow && 'mt-1.5')}>
        {t(`login.answers.${tile.key}.question`)}
      </h3>
      <p className="mt-2 text-sm text-text-dim">{t(`login.answers.${tile.key}.answer`)}</p>
    </div>
  );
}

function QuestionCell({ tile, onOpen }: { tile: Tile; onOpen: () => void }) {
  const { wide } = tile;
  return (
    <div className={cx(CELL_CLASS, 'w-full flex-col', wide && 'lg:flex-row')}>
      <ShotButton
        shot={tile.shot}
        onOpen={onOpen}
        className={cx(
          'aspect-[2.2/1] w-full shrink-0 border-b border-line',
          wide && 'lg:order-2 lg:aspect-auto lg:min-h-56 lg:w-3/5 lg:border-b-0 lg:border-l'
        )}
      />
      <div className={cx(wide && 'lg:flex lg:w-2/5 lg:items-center')}>
        <CellText tile={tile} eyebrow />
      </div>
    </div>
  );
}

function PhoneBand({ onOpen }: { onOpen: (shot: Screenshot) => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid items-center gap-8 bg-bg p-4 sm:p-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-12">
      <div>
        <p className={EYEBROW_CLASS}>{t('login.answersPhoneEyebrow')}</p>
        <ul className="mt-4 space-y-5">
          {PHONE_TILES.map((tile) => (
            <li key={tile.key}>
              <h3 className="text-base font-semibold text-balance">
                {t(`login.answers.${tile.key}.question`)}
              </h3>
              <p className="mt-1 text-sm text-text-dim">{t(`login.answers.${tile.key}.answer`)}</p>
            </li>
          ))}
        </ul>
      </div>
      <ul className="flex items-end justify-center px-2 pt-6 pb-2">
        {PHONE_TILES.map((tile, index) => (
          <li
            key={tile.key}
            className={cx(
              'relative w-[32%] max-w-52 min-w-0',
              index > 0 && '-ml-[3%]',
              index === 1 ? 'z-10 -translate-y-5 sm:-translate-y-8' : 'z-0'
            )}
          >
            <PhoneShot shot={tile.shot} onOpen={() => onOpen(tile.shot)} />
          </li>
        ))}
      </ul>
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
        'group relative block w-full cursor-zoom-in overflow-hidden rounded-xl border border-line bg-panel shadow-lg',
        'motion-safe:transition-transform motion-safe:duration-300 motion-safe:hover:-translate-y-1',
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
