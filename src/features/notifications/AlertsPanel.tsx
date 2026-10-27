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
import { useAccountCharacters } from '@/features/character/useCharacters';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  Button,
  Caret,
  EmptyState,
  IconButton,
  FilterChip,
  Tooltip,
  plainTextActionClassName,
  textActionClassName,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { type NotificationFeedRecord } from '@/db';
import { CharacterLink } from '@/features/entities';
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
  alertViewPath,
  bellBadge,
  filterByChip,
  isSnoozable,
  markAllReadTargets,
  type AlertChip,
  usefulChips,
} from './dangerAlert';
import { dismissFeedEntriesAndSync } from './feedSync';
import { NotificationExplainer } from './NotificationExplainer';
import { dedupeCharacterName } from './notificationBody';
import { notificationUrlForSubject } from './notificationOptions';
import { useNotificationPermission } from './permission';
import { isDismissOnView, useNotificationPreferences } from './preferences';
import { pruneExpired, snooze, useSnoozeStore } from './snooze';
import { useVisibleAlertEntries } from './useUnreadAlertCount';

/** Fires listed under an opened group before "Show N more" — a week away can leave hundreds. */
const FIRES_PAGE = 10;

const NOTIFICATION_SETTINGS_PATH = tabPath(SETTINGS_TABS, 'notifications');

export function AlertsPanel({ variant, onClose }: AlertsPanelRenderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const now = useNow();
  const entries = useVisibleAlertEntries();
  const snoozeMap = useSnoozeStore((state) => state.value);
  const { permission } = useNotificationPermission();
  const dismissOnView = useNotificationPreferences((state) => isDismissOnView(state.value));
  const [selectedChip, setSelectedChip] = useState<AlertChip>('all');
  /** Group key → how many of its fires are listed; absent means collapsed. */
  const [opened, setOpened] = useState<ReadonlyMap<string, number>>(new Map());
  const { characters, namesById: nameById } = useAccountCharacters();
  // One-Character device: the name is the same on every row, so it is dropped.
  const showCharacter = characters.length > 1;
  const focusAfterCommit = useFocusAfterCommit();
  const rootRef = useRef<HTMLDivElement>(null);
  const sheet = variant === 'sheet';

  const groups = useMemo(() => groupAlertsByType(entries), [entries]);
  const chips = useMemo(() => usefulChips(groups), [groups]);
  // A chip whose alerts have all been dismissed is gone from the bar; fall back to All.
  const chip = chips.includes(selectedChip) ? selectedChip : 'all';
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

  function setShown(key: string, shown: number | null) {
    setOpened((prev) => {
      const next = new Map(prev);
      if (shown === null) next.delete(key);
      else next.set(key, shown);
      return next;
    });
  }

  /** Dismisses one fire; focus moves to a neighbouring fire, else the group's toggle, else the heading. */
  function dismissFire(group: AlertTypeGroup, fireIndex: number) {
    const fireControl = (id: string | undefined) =>
      id === undefined
        ? null
        : () => rootRef.current?.querySelector<HTMLElement>(`[data-fire-id="${id}"] button`);
    focusAfterCommit(
      fireControl(group.entries[fireIndex + 1]?.id),
      fireControl(group.entries[fireIndex - 1]?.id),
      rowControl(group.key),
      heading
    );
    void dismissFeedEntriesAndSync([group.entries[fireIndex]]);
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

      <NotificationExplainer />

      {chips.length > 0 && (
        <div
          role="group"
          aria-label={t('alerts.panel.chipsLabel')}
          className="flex flex-wrap gap-1.5 border-b border-line px-3.5 py-2"
        >
          {chips.map((id) => (
            <FilterChip
              key={id}
              label={t(`alerts.panel.chip.${id}`)}
              selected={chip === id}
              onToggle={() => setSelectedChip(id)}
              size={sheet ? 'md' : 'sm'}
            />
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          title={t('alerts.panel.empty')}
          hint={t('alerts.panel.emptyHint')}
          className="py-8"
        />
      ) : (
        <ul>
          {visible.map((group, index) => {
            const danger = group.severity === 'critical';
            const newest = group.entries[0];
            const label = alertGroupLabel(t, group.target);
            const fired = new Date(group.newestFiredAt);
            const shown = opened.get(group.key);
            const many = group.count > 1;
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
                    {many && (
                      <button
                        type="button"
                        aria-expanded={shown !== undefined}
                        onClick={() => setShown(group.key, shown === undefined ? FIRES_PAGE : null)}
                        className="ml-2 inline-flex min-h-9 items-center gap-1 rounded-xs text-xs md:min-h-0 font-normal text-text-dim hover:text-text"
                      >
                        <Caret expanded={shown !== undefined} />
                        {t('alerts.panel.groupCount', { count: group.count })}
                      </button>
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
                      if (dismissOnView) void dismissFeedEntriesAndSync(group.entries);
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
                    aria-label={
                      many
                        ? t(
                            danger
                              ? 'alerts.panel.acknowledgeAllLabel'
                              : 'alerts.panel.dismissAllLabel',
                            { title: label, count: group.count }
                          )
                        : t(
                            danger ? 'alerts.panel.acknowledgeLabel' : 'alerts.panel.dismissLabel',
                            {
                              title: label,
                            }
                          )
                    }
                    onClick={() => finish(group, index)}
                  >
                    {many
                      ? t(danger ? 'alerts.panel.acknowledgeAll' : 'alerts.panel.dismissAll', {
                          count: group.count,
                        })
                      : t(danger ? 'alerts.panel.acknowledge' : 'alerts.panel.dismiss')}
                  </Button>
                </div>
                {many && shown !== undefined && (
                  <ul className="mt-1 border-t border-line">
                    {group.entries.slice(0, shown).map((fire, fireIndex) => (
                      <FireRow
                        key={fire.id}
                        fire={fire}
                        now={now}
                        characterName={nameById.get(fire.characterId) ?? String(fire.characterId)}
                        showCharacter={showCharacter}
                        buttonSize={buttonSize}
                        onNavigate={() => {
                          if (dismissOnView) void dismissFeedEntriesAndSync([fire]);
                          onClose();
                        }}
                        onDismiss={() => dismissFire(group, fireIndex)}
                      />
                    ))}
                    {shown < group.count && (
                      <li className="pt-1.5">
                        <button
                          type="button"
                          className={textActionClassName()}
                          onClick={() => setShown(group.key, shown + FIRES_PAGE)}
                        >
                          {t('alerts.panel.showMore', {
                            count: Math.min(FIRES_PAGE, group.count - shown),
                          })}
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-3.5 pt-2.5">
        {/* One link: dismissed alerts have no history view to open, so an "Older alerts" link would only repeat this one. */}
        <Link
          to={NOTIFICATION_SETTINGS_PATH}
          className={plainTextActionClassName('min-h-9 md:min-h-0')}
          onClick={onClose}
        >
          {t('alerts.panel.notifyMe')}
        </Link>
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-3.5 pt-1 pb-3 text-xs text-text-dim">
        <span>
          {permission === 'granted' ? t('alerts.panel.pushOn') : t('alerts.panel.pushOff')}
        </span>
      </div>
    </div>
  );
}

/** One fire inside an opened group: its own body (the group row only shows the newest), age and ×. */
function FireRow({
  fire,
  now,
  characterName,
  showCharacter,
  buttonSize,
  onNavigate,
  onDismiss,
}: {
  fire: NotificationFeedRecord;
  now: number;
  characterName: string;
  showCharacter: boolean;
  buttonSize: 'sm' | 'md';
  onNavigate: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const fired = new Date(fire.firedAt);
  const body = dedupeCharacterName(fire.body, characterName);
  return (
    <li
      data-fire-id={fire.id}
      className="flex items-start gap-x-2 border-b border-line py-1 last:border-b-0 min-h-9 md:min-h-0"
    >
      {/* The × sits outside the wrapping text block so it stays top-right when the body wraps. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 self-center">
        <Link
          to={notificationUrlForSubject(
            fire.eventId,
            fire.subjectId ?? fire.typeId,
            fire.characterId
          )}
          onClick={onNavigate}
          className="min-w-0 flex-1 basis-48 rounded-xs text-xs text-text-dim hover:text-text hover:underline"
        >
          {body}
        </Link>
        {showCharacter && (
          <CharacterLink
            id={fire.characterId}
            className="max-w-24 shrink-0 truncate text-[0.6875rem] font-medium"
          >
            {characterName}
          </CharacterLink>
        )}
        <time
          dateTime={fired.toISOString()}
          className="shrink-0 text-[0.6875rem] tabular-nums text-text-dim"
        >
          {formatAge(Math.max(0, now - fire.firedAt), t)}
        </time>
      </div>
      <IconButton
        icon={<Icon.Close />}
        label={t('alerts.panel.dismissFire', { body })}
        variant="plain"
        size={buttonSize}
        onClick={onDismiss}
        className="shrink-0"
      />
    </li>
  );
}
