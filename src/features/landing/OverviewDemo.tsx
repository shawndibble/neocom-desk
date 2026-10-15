import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SEVERITY_TEXT,
  SeverityIcon,
} from '@/components/ui';
import { characterAvatarBoxClassName } from '@/components/ui/characterAvatarBox';
import { focusRingClassName } from '@/components/ui/controlStyles';
import { Descend, EditBoard, ICON_SIZE, More, NavAlerts } from '@/components/ui/icons';
import {
  tabItemActiveClassName,
  tabItemClassName,
  tabItemIdleClassName,
  tabListClassName,
  tabScrollerClassName,
} from '@/components/ui/tabStyles';
import { AreaChart } from '@/features/overview/widgets/charts/AreaChart';
import { HBars } from '@/features/overview/widgets/charts/HBars';
import type { AreaChartModel, HBarsChartModel } from '@/features/overview/widgets/charts/types';
import type { DeadlineSeverity } from '@/engine/severity';
import { MINUTE_MS } from '@/lib/age';
import { cx } from '@/lib/cx';
import { formatCountdown } from '@/lib/duration';
import { canAnimate } from './motion';

/**
 * The signed-out landing page's working mock of the Overview: the same header,
 * tabs and Widgets the app draws, filled with sample data, with the alerts
 * bell opening a list of sample alerts. Nothing here navigates: a Widget's
 * title looks like the real link but is plain text, because every destination
 * is a route a signed-out visitor cannot reach.
 *
 * Every label comes from the keys the real Widgets render
 * (`overview.widgets.*`, `overview.board.*`, `overview.header.*`), so a retired
 * key fails `Login.test.tsx` instead of printing a literal key at a visitor.
 */

const PLANETS = ['Efa I', 'Efa II', 'Efa IV', 'Efa V', 'Efa VI'];

const DAY = 86_400;
const HOUR = 3600;

const DEMO = {
  name: 'Aurelia Vex',
  nextEvent: 'Leatherneck Logistics op',
  nextEventSeconds: DAY + 22 * HOUR,
  trainingSeconds: 10 * DAY + 5 * HOUR,
  events: [
    { name: 'Leatherneck Logistics op', seconds: DAY + 22 * HOUR, response: 'accepted' },
    { name: 'Maw Of Creation Moon', seconds: 4 * DAY + 19 * HOUR, response: 'accepted' },
  ],
  walletChart: {
    kind: 'area',
    summary: '',
    values: [58, 58, 57, 60, 55, 59, 44, 62, 62, 60, 66, 58, 59, 61, 18, 40, 52, 50],
    low: '960.2M',
    high: '2B',
    rangeLabel: '30 days',
  } satisfies AreaChartModel,
  planetarySeconds: 2 * DAY + 21 * HOUR,
  planetaryChart: {
    kind: 'hbars',
    summary: '',
    rows: PLANETS.map((label) => ({ key: label, label, share: 1, text: '2d 21h' })),
  } satisfies HBarsChartModel,
  orders: [
    {
      item: 'Ligature Integrated Analyzer ×1',
      severity: 'critical',
      price: '310M',
      vs: '+3.2%',
      days: '25d 12h',
    },
    {
      item: 'Warp Core Stabilizer II ×1',
      severity: 'critical',
      price: '562.7K',
      vs: '+1.7%',
      days: '25d 12h',
    },
    {
      item: 'Superconductors ×570',
      severity: 'warning',
      price: '10.2K',
      vs: '+1.9%',
      days: '28d 9h',
    },
    {
      item: 'Medium Capacitor Booster II ×1',
      severity: 'warning',
      price: '1.1M',
      vs: '+5.3%',
      days: '25d 12h',
    },
    {
      item: 'Republic Fleet Private Insignia II ×5',
      severity: 'warning',
      price: '53.9K',
      vs: '+53.6%',
      days: '29d 10h',
    },
  ] satisfies {
    item: string;
    severity: DeadlineSeverity;
    price: string;
    vs: string;
    days: string;
  }[],
  station: 'Amarr VIII (Oris)',
};

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
  // Wall-clock read for the illustrative "Updated" badge; lazy so it runs once.
  const [fetchedAt] = useState(() => new Date(Date.now() - 2 * MINUTE_MS));
  const [alertsOpen, setAlertsOpen] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const phase = useAlertArrival(frameRef);
  useFloat(frameRef);
  // Newest first: while `pending`, the head of the list has not arrived yet.
  const alerts = phase === 'pending' ? ALERTS.slice(1) : ALERTS;

  return (
    <div
      ref={frameRef}
      role="group"
      aria-labelledby="login-preview-label"
      className="lp-float relative w-full rounded-xs border border-line bg-panel/85 p-4 text-left shadow-[0_0_60px_-20px_rgba(87,199,244,0.25)] backdrop-blur-sm sm:p-6"
    >
      <span
        id="login-preview-label"
        className="absolute -top-3 right-4 bg-bg px-1.5 text-[0.625rem] tracking-widest text-text-dim uppercase"
      >
        {t('login.previewLabel')}
      </span>

      <div className="flex flex-wrap items-center gap-3">
        <div
          aria-hidden="true"
          className={`${characterAvatarBoxClassName('lg')} border-line bg-panel-2`}
        />
        <div className="min-w-0 flex-1 basis-56">
          <p className="flex flex-wrap items-baseline gap-x-3 text-base font-semibold tracking-widest uppercase sm:text-lg">
            {DEMO.name}
            <DataAgeBadge date={fetchedAt} />
          </p>
          <p className="truncate text-xs text-accent">{t('login.previewCorp')}</p>
        </div>
        <span className="inline-flex min-h-9 min-w-0 max-w-full items-center gap-2 rounded-xs border border-line bg-panel-2/50 px-3 text-xs">
          <span className="shrink-0 tracking-widest text-text-dim uppercase">
            {t('overview.header.next')}
          </span>
          <span className="shrink-0 font-medium whitespace-nowrap tabular-nums">
            {formatCountdown(DEMO.nextEventSeconds)}
          </span>
          <span className="truncate text-text-dim">{DEMO.nextEvent}</span>
        </span>
        <span className="inline-flex min-h-9 items-center gap-2 rounded-xs border border-line px-3 text-xs tracking-widest uppercase">
          <EditBoard size={ICON_SIZE.sm} aria-hidden="true" />
          {t('overview.header.customize')}
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

      <div className={`${tabScrollerClassName} mt-4`}>
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

      {/* One column on a phone, two from `sm`, the app's twelve-column grid from `lg`. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
        <Tile title={t('overview.widgets.miningTax.title')} span="lg:col-span-3">
          <Figure tone="text-accent" unit={t('overview.board.iskUnpaid')}>
            257.3K
          </Figure>
          <Sub>{t('overview.widgets.miningTax.oldest', { days: 0 })}</Sub>
        </Tile>

        <Tile title={t('overview.widgets.training.title')} span="lg:col-span-3">
          <Figure>{formatCountdown(DEMO.trainingSeconds)}</Figure>
          <Sub>
            {t('overview.widgets.training.skillLevel', { name: 'Mining Exploitation', level: 5 })}
          </Sub>
        </Tile>

        <Tile title={t('overview.widgets.contracts.title')} span="lg:col-span-3">
          <Figure unit={t('overview.widgets.contracts.unit')}>0</Figure>
          <Sub>{t('overview.board.contractsNothingDue')}</Sub>
        </Tile>

        <Tile title={t('overview.widgets.location.title')} span="lg:col-span-3">
          <Figure unit={t('overview.widgets.data.location.security', { value: '0.5' })}>
            Ainsan
          </Figure>
        </Tile>

        <Tile title={t('overview.widgets.comingUp.title')} span="sm:col-span-2 lg:col-span-4">
          <Figure>{formatCountdown(DEMO.nextEventSeconds)}</Figure>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[0.6875rem] tracking-widest text-text-dim uppercase">
                  <th className="py-1.5 font-semibold">
                    {t('overview.widgets.comingUp.col.event')}
                  </th>
                  <th className="px-2 py-1.5 text-right font-semibold">
                    {t('overview.widgets.comingUp.col.in')}
                  </th>
                  <th className="py-1.5 text-right font-semibold">
                    {t('overview.widgets.comingUp.col.response')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {DEMO.events.map((event) => (
                  <tr key={event.name} className="border-t border-line">
                    <td className="py-1.5">{event.name}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
                      {formatCountdown(event.seconds)}
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap text-text-dim">
                      {t(`overview.board.response.${event.response}`)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tile>

        <Tile title={t('overview.widgets.wallet.title')} span="lg:col-span-4">
          <Figure unit={t('overview.isk')}>1.6B</Figure>
          <p className={cx('truncate text-sm', SEVERITY_TEXT.critical)}>
            {t('overview.widgets.wallet.change', { isk: '-99.3M', count: 30 })}
          </p>
          <div className="mt-2">
            <AreaChart model={DEMO.walletChart} height={80} />
          </div>
        </Tile>

        <Tile title={t('overview.widgets.planetary.title')} span="lg:col-span-4">
          <Figure tone="text-accent" unit={t('overview.widgets.planetary.untilNext')}>
            {formatCountdown(DEMO.planetarySeconds)}
          </Figure>
          <Sub>
            {t('overview.widgets.planetary.together', {
              count: PLANETS.length,
              total: PLANETS.length,
            })}
          </Sub>
          <div className="mt-2">
            <HBars model={DEMO.planetaryChart} maxRows={5} />
          </div>
          <p className="mt-2 text-xs text-text-dim">{t('overview.widgets.chart.planetary.note')}</p>
        </Tile>

        <Tile title={t('overview.widgets.mail.title')} span="sm:col-span-1 lg:col-span-5">
          <Figure unit={t('overview.widgets.mail.unit')}>0</Figure>
        </Tile>

        <Tile title={t('overview.widgets.walletFlow.title')} span="sm:col-span-1 lg:col-span-7">
          <Figure unit={t('overview.isk')}>95.7M</Figure>
          <Sub>
            {t('overview.widgets.walletFlow.top', {
              name: 'Contract price payment corp',
              isk: '2.4B',
            })}
          </Sub>
        </Tile>

        <Tile title={t('overview.widgets.orders.title')} span="sm:col-span-2 lg:col-span-12">
          <Figure
            tone={SEVERITY_TEXT.critical}
            unit={t('overview.widgets.chart.ordersStates.undercut')}
          >
            14
          </Figure>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[0.6875rem] tracking-widest text-text-dim uppercase">
                  <th className="py-1.5 font-semibold">{t('overview.widgets.orders.col.item')}</th>
                  <th className="hidden px-2 py-1.5 font-semibold sm:table-cell">
                    {t('overview.widgets.orders.col.side')}
                  </th>
                  <th className="px-2 py-1.5 text-right font-semibold">
                    {t('overview.widgets.orders.col.price')}
                  </th>
                  <th className="px-2 py-1.5 text-right font-semibold">
                    {t('overview.widgets.orders.col.vsBest')}
                  </th>
                  <th className="px-2 py-1.5 text-right font-semibold">
                    {t('overview.widgets.orders.col.expires')}
                  </th>
                  <th className="hidden py-1.5 pl-2 font-semibold md:table-cell">
                    {t('overview.widgets.orders.col.station')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {DEMO.orders.map((order) => (
                  <tr key={order.item} className="border-t border-line">
                    <td className="py-1.5">
                      <span className="flex items-center gap-2">
                        <SeverityIcon severity={order.severity} />
                        {order.item}
                      </span>
                    </td>
                    <td className="hidden px-2 py-1.5 text-text-dim sm:table-cell">
                      {t('overview.widgets.orders.sideSell')}
                    </td>
                    <td
                      className={cx(
                        'px-2 py-1.5 text-right tabular-nums',
                        SEVERITY_TEXT[order.severity]
                      )}
                    >
                      {order.price}
                    </td>
                    <td
                      className={cx(
                        'px-2 py-1.5 text-right tabular-nums',
                        SEVERITY_TEXT[order.severity]
                      )}
                    >
                      {order.vs}
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
                      {order.days}
                    </td>
                    <td className="hidden py-1.5 pl-2 text-text-dim md:table-cell">
                      {DEMO.station}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tile>
      </div>
    </div>
  );
}

/**
 * One Widget's frame: the real one's micro title with its link caret and its
 * menu glyph over a body. Plain text, not links or buttons (see the file note).
 */
function Tile({ title, span, children }: { title: string; span: string; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className={cx('flex min-w-0 flex-col rounded-xs border border-line bg-panel', span)}
    >
      <p className="flex items-center gap-1 border-b border-line px-3 py-2 text-[0.6875rem] font-semibold tracking-widest uppercase">
        <span className="truncate">{title}</span>
        <Descend size={ICON_SIZE.sm} aria-hidden="true" />
        <More size={ICON_SIZE.sm} aria-hidden="true" className="ml-auto shrink-0 text-text-dim" />
      </p>
      <div className="grid flex-1 content-start gap-1 px-3 py-3">{children}</div>
    </section>
  );
}

function Figure({ tone, unit, children }: { tone?: string; unit?: string; children: ReactNode }) {
  return (
    <p className={cx('text-2xl font-medium tabular-nums', tone)}>
      {children}
      {unit && <small className="ml-2 text-sm font-normal text-text-dim">{unit}</small>}
    </p>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <p className="text-sm text-text-dim">{children}</p>;
}
