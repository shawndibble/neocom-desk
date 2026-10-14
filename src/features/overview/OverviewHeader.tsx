/**
 * The Overview's header controls, handed to `CharacterHeader`'s slots: the
 * data age (`OverviewDataAge`, beside the Character's name) and the
 * controls (`OverviewNext` and `OverviewCustomize`, level with the bell).
 *
 * It reads what is on screen, not what is stored: the button and the age count
 * only the widgets the page draws (a widget hidden on a phone offers neither a
 * clock nor a read). There is no Refresh here (a failed widget's Retry bumps the
 * page's refresh epoch) and no Character switcher: the rail
 * footer and the command palette switch the active Character, and each
 * widget's own menu chooses its Character scope.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SEVERITY_TEXT,
  SeverityIcon,
  Tooltip,
  buttonClassName,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { formatCountdown } from '@/lib/duration';
import { formatAge } from '@/lib/age';
import { useTicker } from '@/lib/ticker';
import { useIsPhone } from '@/lib/useIsPhone';
import { useKindViews, viewKey } from './widgets/data/useWidgetView';
import { useOverviewRefresh } from './widgets/data/refreshContext';
import { useOverviewEdit } from './widgets/editContext';
import { collectDeadlines, fetchBreakdown, stalestFetch } from './widgets/headerSummary';
import { getKind } from './widgets/kinds';
import type { Widget } from './widgets/layout';
import type { KindView } from './widgets/data/types';
import { chipTone, nextDeadline, type ChipTone } from './widgets/nextDeadline';
import { distinctKinds, visibleWidgets } from './widgets/visibility';

const CLOCK_TICK_MS = 30_000;

/** The button's own ladder: amber under 3 h, red under 30 min (not the per-card severities). */
const CHIP_TEXT: Record<ChipTone, string> = {
  neutral: 'text-text',
  warning: SEVERITY_TEXT.warning,
  danger: SEVERITY_TEXT.critical,
};

/** What the header shows of the drawn widgets: the soonest clock and the stalest read. */
function useOverviewSummary(widgets: readonly Widget[]) {
  const isPhone = useIsPhone();
  const now = useTicker(CLOCK_TICK_MS);
  const shown = useMemo(() => visibleWidgets(widgets, isPhone), [widgets, isPhone]);
  const requests = useMemo(
    () => distinctKinds(shown).map((kind) => ({ kind, scopeAll: false })),
    [shown]
  );
  const views = useKindViews(requests);
  const all = [...views.values()];
  const next = nextDeadline(collectDeadlines(all), now);
  const breakdown = fetchBreakdown(
    shown.map((widget) => ({
      kind: widget.kind,
      view: views.get(viewKey({ kind: widget.kind, scopeAll: false })) as KindView,
    }))
  );
  const remaining = next ? next.at - now : 0;
  return {
    next,
    remaining,
    tone: chipTone(remaining),
    fetchedAt: stalestFetch(all).date,
    breakdown,
    now,
  };
}

/**
 * "Updated N ago" beside the Character's name: the stalest read of any drawn
 * widget. Its tooltip names that widget; a click opens the per-widget table, so
 * "14h ago" is never a mystery (no Refresh: widgets retry themselves).
 */
export function OverviewDataAge({ widgets }: { widgets: readonly Widget[] }) {
  const { t } = useTranslation();
  const { fetchedAt, breakdown, now } = useOverviewSummary(widgets);
  const { refresh } = useOverviewRefresh();
  if (!fetchedAt) return null;
  const title = (kind: string) => {
    const def = getKind(kind);
    return def ? t(def.titleKey) : kind;
  };
  const age = (date: Date) => formatAge(Math.max(0, now - date.getTime()), t);
  const stalest = breakdown[0];
  return (
    <Popover>
      <Tooltip
        content={t('overview.header.stalest', {
          name: title(stalest.kind),
          age: age(fetchedAt),
        })}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cx(
              'inline-flex cursor-pointer items-center gap-1 rounded-xs border border-line px-1.5 py-0.5 text-[0.6875rem] text-text-dim hover:border-line-bright hover:bg-panel-2 hover:text-text',
              interactiveClassName,
              focusRingClassName
            )}
          >
            {t('overview.header.updated')}
            <DataAgeBadge date={fetchedAt} alwaysVisible tooltip={false} />
            <Icon.Expanded className="size-3" aria-hidden="true" />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-0">
        <table className="w-full text-xs">
          <caption className="sr-only">{t('overview.header.breakdownCaption')}</caption>
          <thead>
            <tr className="border-b border-line bg-panel-2 text-left text-text-dim uppercase">
              <th scope="col" className="px-3 py-2 font-semibold tracking-widest">
                {t('overview.header.breakdownWidget')}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold tracking-widest">
                {t('overview.header.breakdownUpdated')}
              </th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((row) => (
              <tr key={row.kind} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  {title(row.kind)}
                </th>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.fetchedAt ? (
                    <DataAgeBadge date={row.fetchedAt} alwaysVisible className="justify-end" />
                  ) : (
                    <span className="text-text-dim">{t('overview.header.breakdownNever')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-line p-2">
          <Button size="sm" onClick={refresh} className="w-full">
            <Icon.Refresh aria-hidden="true" />
            {t('overview.header.refreshAll')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The Next deadline: a link to the page that owns the clock, drawn as a plain
 * button (absent with no deadline). It is a child of `CharacterHeader`'s flex
 * row: left of Customize and the bell from `md`, on its own full-width line
 * under them on a phone.
 */
export function OverviewNext({ widgets }: { widgets: readonly Widget[] }) {
  const { t } = useTranslation();
  const { next, remaining, tone } = useOverviewSummary(widgets);
  if (!next) return null;
  return (
    <div className="order-last min-w-0 basis-full md:order-none md:basis-auto">
      <Tooltip content={t('overview.header.nextGoTo', { note: next.note })}>
        <Link
          to={next.to}
          className={buttonClassName({
            size: 'md',
            className: 'w-full min-w-0 whitespace-nowrap md:w-auto',
          })}
        >
          <span className="text-text-dim">{t('overview.header.next')}</span>
          {tone !== 'neutral' && (
            <SeverityIcon severity={tone === 'danger' ? 'critical' : 'warning'} />
          )}
          <b className={cx('font-semibold tabular-nums', CHIP_TEXT[tone])}>
            {formatCountdown(remaining / 1000)}
          </b>
          <span className="min-w-0 truncate text-text-dim normal-case md:max-w-40">
            {next.note}
          </span>
        </Link>
      </Tooltip>
    </div>
  );
}

/** Customize: icon-only on a phone (44px), icon and word from `md`. Hidden while the edit bar owns Done. */
export function OverviewCustomize() {
  const { t } = useTranslation();
  const { editing, startEditing } = useOverviewEdit();
  if (editing) return null;
  return (
    <Button className="w-11 px-0 md:w-auto md:px-4" onClick={startEditing}>
      <Icon.EditBoard size={Icon.ICON_SIZE.md} aria-hidden="true" />
      <span className="sr-only md:not-sr-only">{t('overview.header.customize')}</span>
    </Button>
  );
}
