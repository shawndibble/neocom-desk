import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { focusRingInsetClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { DESKTOP_SIZE, PHONE_SIZE, screenshotSrc, type Screenshot } from './screenshots';
import { ScreenshotZoom, ZoomBadge } from './ScreenshotZoom';

/**
 * One cell of the grid: the `login.answers.<key>` copy and the capture that
 * answers it. `span` is a literal Tailwind class (never built from a number,
 * which the compiler would not see); the six-column grid is arranged so every
 * row sums to six on lg and to two on md. `wide` lays the cell out text-left,
 * image-right on lg.
 */
interface Tile {
  key: string;
  shot: Screenshot;
  span: string;
  wide?: boolean;
}

const TILES: Tile[] = [
  {
    key: 'orders',
    shot: { file: 'desktop-order-detail', key: 'orderDetail', size: DESKTOP_SIZE },
    span: 'md:col-span-2 lg:col-span-4',
    wide: true,
  },
  {
    key: 'journal',
    shot: { file: 'desktop-wallet-journal', key: 'walletJournal', size: DESKTOP_SIZE },
    span: 'lg:col-span-2',
  },
  {
    key: 'build',
    shot: { file: 'desktop-build-plan', key: 'buildPlan', size: DESKTOP_SIZE },
    span: 'lg:col-span-3',
  },
  {
    key: 'fitting',
    shot: { file: 'desktop-fitting', key: 'fitting', size: DESKTOP_SIZE },
    span: 'lg:col-span-3',
  },
  {
    key: 'flyNext',
    shot: { file: 'desktop-ship-tree', key: 'shipTree', size: DESKTOP_SIZE },
    span: 'lg:col-span-2',
  },
  {
    key: 'survey',
    shot: { file: 'desktop-survey', key: 'survey', size: DESKTOP_SIZE },
    span: 'md:col-span-2 lg:col-span-4',
    wide: true,
  },
];

/** The phone band: three tall captures side by side. */
const PHONE_TILES: Tile[] = [
  {
    key: 'marketJumps',
    shot: { file: 'phone-market-jumps', key: 'phoneMarketJumps', size: PHONE_SIZE },
    span: '',
  },
  {
    key: 'routeSafety',
    shot: { file: 'phone-route-safety', key: 'phoneRouteSafety', size: PHONE_SIZE },
    span: '',
  },
  {
    key: 'pilot',
    shot: { file: 'phone-pilot-lookup', key: 'phonePilotLookup', size: PHONE_SIZE },
    span: '',
  },
];

const EYEBROW_CLASS = 'font-mono text-[0.6875rem] tracking-widest text-text-dim uppercase';

/** The cell background shift on hover or keyboard focus, shared by every cell. */
const CELL_CLASS =
  'group relative flex bg-bg motion-safe:transition-colors motion-safe:duration-300 hover:bg-panel has-[:focus-visible]:bg-panel';

/**
 * The questions grid: one hairline-divided frame (a `bg-line` grid with 1px
 * gaps showing through between opaque cells), not a pile of bordered cards.
 * Selecting a picture enlarges it in a Modal. Each picture is top-aligned with
 * a bottom fade and pans toward its lower part on hover or focus, so the crop
 * never reads as an accident; all motion is `motion-safe:`.
 */
export function QuestionGrid() {
  const { t } = useTranslation();
  const [zoomed, setZoomed] = useState<Screenshot | null>(null);
  return (
    <>
      <ul className="mt-6 grid grid-cols-1 gap-px overflow-hidden border border-line bg-line md:grid-cols-2 lg:grid-cols-6">
        {TILES.map((tile) => (
          <li key={tile.key} className={cx('flex', tile.span)}>
            <QuestionCell tile={tile} onOpen={() => setZoomed(tile.shot)} />
          </li>
        ))}
        <li className="flex md:col-span-2 lg:col-span-6">
          <div className="flex w-full flex-col bg-bg p-4">
            <p className={EYEBROW_CLASS}>{t('login.answersPhoneEyebrow')}</p>
            <ul className="mt-3 grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-3">
              {PHONE_TILES.map((tile) => (
                <li key={tile.key} className="flex">
                  <PhoneCell tile={tile} onOpen={() => setZoomed(tile.shot)} />
                </li>
              ))}
            </ul>
          </div>
        </li>
      </ul>
      <ScreenshotZoom shot={zoomed} onClose={() => setZoomed(null)} />
    </>
  );
}

/**
 * The picture that opens enlarged. The button's label carries the image's alt
 * plus what selecting does (a button's children are presentational, so the alt
 * alone would never be read). Explicit `width`/`height` reserve the image's box
 * before the lazy image arrives, so the grid does not jump. The image is taller
 * than its window, anchored to the top and faded out at the bottom; the parent
 * `group` pans it up on hover or focus. DESIGN.md §6c "Magnifier badge".
 */
function ShotButton({
  shot,
  onOpen,
  className,
  imageClassName,
  panClassName,
}: {
  shot: Screenshot;
  onOpen: () => void;
  className?: string;
  imageClassName?: string;
  panClassName: string;
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
        // Inset: the button clips its own overflow, so an outset ring would be cut off.
        focusRingInsetClassName,
        className
      )}
    >
      <img
        src={screenshotSrc(shot)}
        alt={alt}
        width={shot.size.width}
        height={shot.size.height}
        loading="lazy"
        decoding="async"
        className={cx(
          'block h-auto w-full mask-[linear-gradient(to_bottom,black_60%,transparent)]',
          'motion-safe:transition-transform motion-safe:duration-[600ms] motion-safe:ease-out',
          panClassName,
          imageClassName
        )}
      />
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
        panClassName="motion-safe:group-hover:-translate-y-[22%] motion-safe:group-has-[:focus-visible]:-translate-y-[22%]"
        className={cx(
          'aspect-video max-h-56 shrink-0 border-b border-line',
          wide && 'lg:order-2 lg:aspect-auto lg:max-h-none lg:w-3/5 lg:border-b-0 lg:border-l'
        )}
      />
      <div className={cx(wide && 'lg:flex lg:w-2/5 lg:items-center')}>
        <CellText tile={tile} eyebrow />
      </div>
    </div>
  );
}

function PhoneCell({ tile, onOpen }: { tile: Tile; onOpen: () => void }) {
  return (
    <div className={cx(CELL_CLASS, 'w-full flex-row gap-3 p-3 sm:flex-col sm:gap-0 sm:p-0')}>
      <ShotButton
        shot={tile.shot}
        onOpen={onOpen}
        panClassName="motion-safe:group-hover:-translate-y-[12%] motion-safe:group-has-[:focus-visible]:-translate-y-[12%]"
        className="max-h-40 w-24 shrink-0 self-start border border-line sm:mx-auto sm:mt-4 sm:max-h-80 sm:w-48 sm:max-w-[60%]"
      />
      <CellText tile={tile} eyebrow={false} />
    </div>
  );
}
