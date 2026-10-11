/**
 * The Overview's header controls, handed to `CharacterHeader`'s two slots: the
 * data age (`OverviewDataAge`, beside the Character's name) and
 * the controls row (`OverviewControls`: the Next deadline button and
 * Customize).
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
  SEVERITY_TEXT,
  SeverityIcon,
  Tooltip,
  buttonClassName,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { formatCountdown } from '@/lib/duration';
import { useTicker } from '@/lib/ticker';
import { useIsPhone } from '@/lib/useIsPhone';
import { useKindViews } from './widgets/data/useWidgetView';
import { useOverviewEdit } from './widgets/editContext';
import { collectDeadlines, stalestFetch } from './widgets/headerSummary';
import type { Widget } from './widgets/layout';
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
  const remaining = next ? next.at - now : 0;
  return {
    next,
    remaining,
    tone: chipTone(remaining),
    fetchedAt: stalestFetch(all).date,
  };
}

/** "Updated N ago", a read-only indicator beside the Character's name (no Refresh: widgets retry themselves). */
export function OverviewDataAge({ widgets }: { widgets: readonly Widget[] }) {
  const { t } = useTranslation();
  const { fetchedAt } = useOverviewSummary(widgets);
  if (!fetchedAt) return null;
  return (
    <span className="flex items-center gap-1 text-[0.6875rem] text-text-dim">
      {t('overview.header.updated')}
      <DataAgeBadge date={fetchedAt} alwaysVisible />
    </span>
  );
}

/**
 * The controls row: the Next deadline (a link to the page that owns the clock,
 * drawn as a plain button, absent with no deadline) and Customize. Every
 * control in it is the one `md` control height.
 */
export function OverviewControls({ widgets }: { widgets: readonly Widget[] }) {
  const { t } = useTranslation();
  const { editing, startEditing } = useOverviewEdit();
  const { next, remaining, tone } = useOverviewSummary(widgets);

  return (
    <div className="flex items-center gap-2">
      {next && (
        <Tooltip content={t('overview.header.nextGoTo', { note: next.note })}>
          <Link
            to={next.to}
            className={buttonClassName({
              size: 'md',
              className: 'min-w-0 shrink whitespace-nowrap',
            })}
          >
            <span className="text-text-dim">{t('overview.header.next')}</span>
            {tone !== 'neutral' && (
              <SeverityIcon severity={tone === 'danger' ? 'critical' : 'warning'} />
            )}
            <b className={cx('font-semibold tabular-nums', CHIP_TEXT[tone])}>
              {formatCountdown(remaining / 1000)}
            </b>
            <span className="min-w-0 truncate text-text-dim normal-case md:max-w-48">
              {next.note}
            </span>
          </Link>
        </Tooltip>
      )}
      {/* While customizing, the edit bar owns Cancel and Done: two Done buttons would be one too many. */}
      {!editing && (
        <Button className="shrink-0" onClick={startEditing}>
          <Icon.EditBoard size={Icon.ICON_SIZE.md} aria-hidden="true" />
          {t('overview.header.customize')}
        </Button>
      )}
    </div>
  );
}
