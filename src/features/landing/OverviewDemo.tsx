import { lazy, Suspense, useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { guarded } from '@/app/routeChunks';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  SeverityIcon,
  buttonClassName,
} from '@/components/ui';
import { characterAvatarBoxClassName } from '@/components/ui/characterAvatarBox';
import { focusRingClassName } from '@/components/ui/controlStyles';
import { EditBoard, ICON_SIZE, NavAlerts } from '@/components/ui/icons';
import {
  tabItemActiveClassName,
  tabItemClassName,
  tabItemIdleClassName,
  tabListClassName,
  tabScrollerClassName,
} from '@/components/ui/tabStyles';
import { DataAgePopover } from '@/features/overview/DataAgePopover';
import type { DeadlineSeverity } from '@/engine/character/severity';
import { MINUTE_MS } from '@/lib/age';
import { cx } from '@/lib/cx';
import { formatCountdown } from '@/lib/duration';
import { canAnimate } from './motion';
import { DEMO_NAME, NEXT_EVENT, READ_AGES } from './demo/demoCast';

/**
 * The signed-out landing page's working mock of the Overview. The frame and
 * header here (portrait, name, Next chip, Customize, the alerts bell and the
 * tab row with its "Data updated" control) are drawn at once; the Widget grid
 * is the app's own `Widget` and `WidgetMenu` over sample data
 * (`demo/DemoBoard.tsx`), loaded as a chunk of its own because the widget
 * stack is far too large for the landing page's first load.
 *
 * Nothing here navigates or changes data: a Widget's title looks like the
 * real link but is plain text (every destination is a route a signed-out
 * visitor cannot reach), the menus and the popover only open and close, and
 * the alerts bell lists sample alerts.
 *
 * Every label is a key the real Overview renders (`overview.*`, `nav.*`), so a
 * retired key fails `Login.test.tsx` instead of printing a literal key at a
 * visitor.
 */

const DemoBoard = lazy(() => guarded(() => import('./demo/DemoBoard')));

/** Only the top of the board shows, fading out below: the full set scrolls off the page. */
const BOARD_CLIP =
  'max-h-[46rem] overflow-hidden [mask-image:linear-gradient(to_bottom,#000_calc(100%-8rem),transparent)] sm:max-h-[43rem]';

/** Holds the board's clipped height until its chunk arrives, so nothing below shifts. */
function BoardPlaceholder() {
  return <div aria-hidden="true" className="h-[46rem] sm:h-[43rem]" />;
}

/** The sample alerts behind the bell: key under `login.demo.alerts`, how bad, how long ago. */
const ALERTS: { key: string; severity: DeadlineSeverity; minutes: number }[] = [
  { key: 'undercut', severity: 'critical', minutes: 4 },
  { key: 'jobReady', severity: 'warning', minutes: 18 },
  { key: 'skillDone', severity: 'watch', minutes: 55 },
  { key: 'extractor', severity: 'warning', minutes: 130 },
  { key: 'mail', severity: 'clear', minutes: 310 },
];

/** How long the demo must be on screen before the newest sample alert arrives. */
const ARRIVAL_DELAY_MS = 3000;
/** Largest drift of the frame while scrolling, in px. */
const FLOAT_MAX_PX = 12;

/**
 * Drives the bell's one-time auto-play. `static`: motion is off or unavailable,
 * so every alert is already there. `pending`: the newest alert is withheld until
 * the demo has been in view for a while (timer pauses when it scrolls away or
 * the tab is hidden). `arrived`: done, never repeats.
 */
function useAlertArrival(frameRef: RefObject<HTMLElement | null>) {
  const [phase, setPhase] = useState<'static' | 'pending' | 'arrived'>(() =>
    canAnimate() ? 'pending' : 'static'
  );
  useEffect(() => {
    const el = frameRef.current;
    if (phase !== 'pending' || !el) return;
    let inView = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      clearTimeout(timer);
      if (inView && !document.hidden) {
        timer = setTimeout(() => setPhase('arrived'), ARRIVAL_DELAY_MS);
      }
    };
    const observer = new IntersectionObserver((entries) => {
      inView = entries[entries.length - 1]?.isIntersecting ?? false;
      sync();
    });
    observer.observe(el);
    document.addEventListener('visibilitychange', sync);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [phase, frameRef]);
  return phase;
}

/**
 * True once the board's chunk may start loading: the browser is idle after the
 * page has loaded, so the hero paints first.
 */
function useBoardReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const go = () => setReady(true);
    const schedule = () => {
      if (typeof requestIdleCallback === 'function') {
        idle = requestIdleCallback(go, { timeout: 3000 });
      } else {
        timer = setTimeout(go, 500);
      }
    };
    const loaded = document.readyState === 'complete';
    if (loaded) schedule();
    else window.addEventListener('load', schedule, { once: true });
    return () => {
      window.removeEventListener('load', schedule);
      if (idle !== undefined) cancelIdleCallback(idle);
      clearTimeout(timer);
    };
  }, [ready]);
  return ready;
}

/** Sets `--lp-float` (0 to -12px) on the frame as the page scrolls; rAF-throttled, off on touch. */
function useFloat(frameRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = frameRef.current;
    if (!el || !canAnimate()) return;
    if (window.matchMedia?.('(pointer: coarse)').matches) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const drift = Math.min(FLOAT_MAX_PX, window.scrollY * 0.03);
      el.style.setProperty('--lp-float', `${-drift}px`);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [frameRef]);
}

export function OverviewDemo() {
  const { t } = useTranslation();
  // Wall-clock read for the illustrative "Data updated" age; lazy so it runs once.
  const [now] = useState(() => Date.now());
  const [alertsOpen, setAlertsOpen] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const phase = useAlertArrival(frameRef);
  useFloat(frameRef);
  const boardReady = useBoardReady();
  // Newest first: while `pending`, the head of the list has not arrived yet.
  const alerts = phase === 'pending' ? ALERTS.slice(1) : ALERTS;
  const breakdown = READ_AGES.map(({ kind, minutes }) => ({
    kind,
    fetchedAt: new Date(now - minutes * MINUTE_MS),
  }));

  return (
    <div
      ref={frameRef}
      role="group"
      aria-labelledby="login-preview-label"
      className="lp-float relative w-full min-w-0 rounded-xs border border-line bg-panel/95 p-4 text-left shadow-[0_0_60px_-20px_color-mix(in_srgb,var(--color-accent)_25%,transparent)] sm:p-6"
    >
      <span
        id="login-preview-label"
        className="absolute -top-3 right-4 bg-bg px-1.5 text-[0.625rem] tracking-widest text-text-dim uppercase"
      >
        {t('login.previewLabel')}
      </span>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div
          aria-hidden="true"
          className={cx(
            characterAvatarBoxClassName('lg'),
            'flex items-center justify-center border-line bg-panel-2 text-sm font-semibold tracking-widest text-text-dim'
          )}
        >
          AV
        </div>
        <div className="min-w-0 flex-1 basis-24">
          <p className="max-w-full text-lg font-semibold tracking-widest break-words uppercase sm:truncate sm:text-xl">
            {DEMO_NAME}
          </p>
          <p className="truncate text-xs text-text-dim">{t('login.previewCorp')}</p>
        </div>
        <div className="order-last min-w-0 basis-full md:order-none md:basis-auto">
          <span
            className={buttonClassName({
              size: 'md',
              className: 'w-full min-w-0 cursor-default whitespace-nowrap md:w-auto',
            })}
          >
            <span className="text-text-dim">{t('overview.header.next')}</span>
            <b className="font-semibold tabular-nums">{formatCountdown(NEXT_EVENT.inMs / 1000)}</b>
            <span className="min-w-0 truncate text-text-dim normal-case md:max-w-40">
              {NEXT_EVENT.title}
            </span>
          </span>
        </div>
        <span
          className={buttonClassName({ className: 'w-11 cursor-default px-0 md:w-auto md:px-4' })}
        >
          <EditBoard size={ICON_SIZE.md} aria-hidden="true" />
          <span className="sr-only md:not-sr-only">{t('overview.header.customize')}</span>
        </span>
        <Popover open={alertsOpen} onOpenChange={setAlertsOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t('nav.alertsWithCount', { count: alerts.length })}
              className={cx(
                'relative inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xs border border-line text-text-dim hover:text-text',
                focusRingClassName
              )}
            >
              <NavAlerts aria-hidden="true" />
              <span
                aria-hidden="true"
                className={cx(
                  'absolute -top-1 -right-1 min-w-4 rounded-xs bg-accent px-1 text-center text-[0.625rem] leading-4 font-semibold text-bg tabular-nums',
                  phase === 'arrived' && 'lp-badge-pulse'
                )}
              >
                {alerts.length}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-0">
            <p className="border-b border-line px-3 py-2 text-[0.6875rem] font-semibold tracking-widest uppercase">
              {t('nav.alerts')}
            </p>
            <ul className="max-h-80 overflow-y-auto">
              {alerts.map((alert) => (
                <li
                  key={alert.key}
                  className="flex gap-2 border-b border-line px-3 py-2 last:border-b-0"
                >
                  <SeverityIcon severity={alert.severity} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">{t(`login.demo.alerts.${alert.key}.title`)}</p>
                    <p className="text-xs text-text-dim">
                      {t(`login.demo.alerts.${alert.key}.detail`)}
                    </p>
                  </div>
                  <span className="ml-auto shrink-0 text-xs text-text-dim tabular-nums">
                    {t('login.demo.alerts.ago', { duration: formatCountdown(alert.minutes * 60) })}
                  </span>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      </div>

      {/* The tab row, as `OverviewSubNav` draws it: the data age sits at its right end. */}
      <div className="mt-4 flex items-stretch">
        <div className={cx(tabScrollerClassName, 'min-w-0 flex-1')}>
          <div className={tabListClassName}>
            <span className={`${tabItemClassName} ${tabItemActiveClassName}`}>
              {t('nav.overview')}
            </span>
            <span className={`${tabItemClassName} ${tabItemIdleClassName}`}>{t('nav.clones')}</span>
            <span className={`${tabItemClassName} ${tabItemIdleClassName}`}>
              {t('nav.employmentHistory')}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center border-b border-line pr-1 pl-2">
          <DataAgePopover
            fetchedAt={breakdown[0].fetchedAt}
            breakdown={breakdown}
            now={now}
            onRefresh={() => undefined}
          />
        </div>
      </div>

      <div className={cx('mt-4', BOARD_CLIP)}>
        <Suspense fallback={<BoardPlaceholder />}>
          {boardReady ? <DemoBoard /> : <BoardPlaceholder />}
        </Suspense>
      </div>
    </div>
  );
}
