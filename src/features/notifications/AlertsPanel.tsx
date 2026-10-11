/**
 * The global alerts panel the bell in every page header opens: a popover
 * anchored to the bell on a desktop, the body of a full-height sheet on a
 * phone (`components/ui/AlertsBell`, which owns the surface; this is its
 * content). It replaces the old Alerts page and the Overview's alerts column.
 *
 * Rows are one per notification *type* (`groupAlertsByType`), the same unit the
 * page used: a device back from a week away holds hundreds of fires, and a row
 * per fire is unusable on exactly the days it matters. The row's detail is the
 * newest fire's body.
 *
 * What each action means (scope decisions in
 * `docs/context/decisions/20261011-064822-overview-is-a-widget-grid-the-pilot-builds.md`):
 * Acknowledge is Dismiss for a danger type (nothing new is stored), Mark all
 * read dismisses everything *except* danger, and Snooze 1h hides a type on this
 * device only and is offered for price alerts alone.
 */
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  Button,
  EmptyState,
  FilterChip,
  Tooltip,
  plainTextActionClassName,
  textActionClassName,
} from '@/components/ui';
import type { AlertsPanelRenderProps } from '@/components/ui/alertsPanelContext';
import { SETTINGS_TABS } from '@/app/pageTabs';
import { cx } from '@/lib/cx';
import { formatAge } from '@/lib/age';
import { tabPath } from '@/lib/pageTabs';
import { formatTimestamp } from '@/lib/timestamp';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { useNow } from '@/lib/useNow';
import { alertGroupLabel, groupAlertsByType, type AlertTypeGroup } from './alertGroups';
import {
  ALERT_CHIPS,
  alertViewPath,
  bellBadge,
  filterByChip,
  isSnoozable,
  markAllReadTargets,
  type AlertChip,
} from './dangerAlert';
import { dismissFeedEntriesAndSync } from './feedSync';
import { useNotificationPermission } from './permission';
import { pruneExpired, snooze, useSnoozeStore } from './snooze';
import { useVisibleAlertEntries } from './useUnreadAlertCount';

const NOTIFICATION_SETTINGS_PATH = tabPath(SETTINGS_TABS, 'notifications');

export function AlertsPanel({ variant, onClose }: AlertsPanelRenderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const now = useNow();
  const entries = useVisibleAlertEntries();
  const snoozeMap = useSnoozeStore((state) => state.value);
  const { permission } = useNotificationPermission();
  const [chip, setChip] = useState<AlertChip>('all');
  const focusAfterCommit = useFocusAfterCommit();
  const rootRef = useRef<HTMLDivElement>(null);
  const sheet = variant === 'sheet';

  const groups = useMemo(() => groupAlertsByType(entries), [entries]);
  const visible = useMemo(() => filterByChip(groups, chip), [groups, chip]);
  const { count } = useMemo(() => bellBadge(entries), [entries]);
  const readable = useMemo(() => markAllReadTargets(entries), [entries]);

  const rowControl = (key: string | undefined) =>
    key === undefined
      ? null
      : () => rootRef.current?.querySelector<HTMLElement>(`[data-group-key="${key}"] button`);
  const heading = () => rootRef.current?.querySelector<HTMLElement>('h2');

  /** Focus lands on a neighbouring row when this one's own buttons are about to unmount. */
  function focusNeighbour(index: number) {
    focusAfterCommit(
      rowControl(visible[index + 1]?.key),
      rowControl(visible[index - 1]?.key),
      heading
    );
  }

  function finish(group: AlertTypeGroup, index: number) {
    focusNeighbour(index);
    void dismissFeedEntriesAndSync(group.entries);
  }

  const buttonSize = sheet ? 'md' : 'sm';

  return (
    <div ref={rootRef} className="text-sm">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-panel px-3.5 py-2">
        <h2 tabIndex={-1} className="text-sm font-semibold focus:outline-none">
          {count > 0 ? t('alerts.panel.heading', { count }) : t('alerts.panel.headingAllRead')}
        </h2>
        <span className="flex items-center gap-3">
          <button
            type="button"
            className={textActionClassName()}
            disabled={readable.length === 0}
            onClick={() => {
              focusAfterCommit(heading);
              void dismissFeedEntriesAndSync(readable);
            }}
          >
            {t('alerts.panel.markAllRead')}
          </button>
          {!sheet && (
            <button type="button" className={textActionClassName()} onClick={onClose}>
              {t('alerts.panel.close')}
            </button>
          )}
        </span>
      </div>

      <div
        role="group"
        aria-label={t('alerts.panel.chipsLabel')}
        className="flex flex-wrap gap-1.5 border-b border-line px-3.5 py-2"
      >
        {ALERT_CHIPS.map((id) => (
          <FilterChip
            key={id}
            label={t(`alerts.panel.chip.${id}`)}
            selected={chip === id}
            onToggle={() => setChip(id)}
            size={sheet ? 'md' : 'sm'}
          />
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={t('alerts.panel.empty')}
          hint={chip === 'all' ? t('alerts.panel.emptyHint') : t('alerts.panel.emptyChip')}
          className="py-8"
        />
      ) : (
        <ul>
          {visible.map((group, index) => {
            const danger = group.severity === 'critical';
            const newest = group.entries[0];
            const label = alertGroupLabel(t, group.target);
            const fired = new Date(group.newestFiredAt);
            return (
              <li
                key={group.key}
                data-group-key={group.key}
                className={cx(
                  'grid gap-1 border-b border-line px-3.5 py-2.5',
                  danger && 'border-l-2 border-l-danger bg-danger/5'
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 font-semibold">
                    {label}
                    {group.count > 1 && (
                      <span className="ml-2 text-xs font-normal text-text-dim">
                        {t('alerts.panel.groupCount', { count: group.count })}
                      </span>
                    )}
                  </span>
                  <Tooltip
                    content={t('alerts.panel.eveTime', { time: formatTimestamp(fired, 'UTC') })}
                  >
                    <time
                      dateTime={fired.toISOString()}
                      tabIndex={0}
                      className="shrink-0 rounded-xs text-[0.6875rem] tabular-nums text-text-dim"
                    >
                      {formatAge(Math.max(0, now - group.newestFiredAt), t)}
                    </time>
                  </Tooltip>
                </div>
                <p className="text-xs text-text-dim">{newest.body}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Button
                    size={buttonSize}
                    variant={danger ? 'primary' : 'ghost'}
                    aria-label={t('alerts.panel.viewLabel', { title: label })}
                    onClick={() => {
                      navigate(alertViewPath(group.key));
                      onClose();
                    }}
                  >
                    {t('alerts.panel.view')}
                  </Button>
                  {isSnoozable(group) && (
                    <Button
                      size={buttonSize}
                      aria-label={t('alerts.panel.snoozeLabel', { title: label })}
                      onClick={() => {
                        focusNeighbour(index);
                        void useSnoozeStore
                          .getState()
                          .setValue(
                            snooze(pruneExpired(snoozeMap, Date.now()), group.key, Date.now())
                          );
                      }}
                    >
                      {t('alerts.panel.snooze')}
                    </Button>
                  )}
                  <Button
                    size={buttonSize}
                    aria-label={t(
                      danger ? 'alerts.panel.acknowledgeLabel' : 'alerts.panel.dismissLabel',
                      { title: label }
                    )}
                    onClick={() => finish(group, index)}
                  >
                    {t(danger ? 'alerts.panel.acknowledge' : 'alerts.panel.dismiss')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-3.5 pt-2.5">
        {/* One link: dismissed alerts have no history view to open, so an "Older alerts" link would only repeat this one. */}
        <Link
          to={NOTIFICATION_SETTINGS_PATH}
          className={plainTextActionClassName('min-h-11 md:min-h-0')}
          onClick={onClose}
        >
          {t('alerts.panel.notifyMe')}
        </Link>
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-3.5 pt-1 pb-3 text-xs text-text-dim">
        <span>
          {permission === 'granted' ? t('alerts.panel.pushOn') : t('alerts.panel.pushOff')}
        </span>
        <span>{t('alerts.panel.bannerNote')}</span>
      </div>
    </div>
  );
}
