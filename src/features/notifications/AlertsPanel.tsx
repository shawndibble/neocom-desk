/**
 * The global alerts panel the bell in every page header opens: a popover
 * anchored to the bell on a desktop, the body of a full-height sheet on a
 * phone (`components/ui/AlertsBell`, which owns the surface; this is its
 * content). It replaces the old Alerts page and the Overview's alerts column.
 *
 * Rows are one per notification *type* (`groupAlertsByType`), the same unit the
 * page used: a device back from a week away holds hundreds of fires, and a row
 * per fire is unusable on exactly the days it matters. The row's detail is the
 * newest fire's body. The row itself is the click target (`AlertGroupRow`): View
 * for a single fire, expand for a group of many.
 *
 * What each action means (scope decisions in
 * `docs/context/decisions/20261011-064822-overview-is-a-widget-grid-the-pilot-builds.md`):
 * Acknowledge is Dismiss for a danger type (nothing new is stored), Mark all
 * read dismisses everything *except* danger, and Snooze 1h hides a type on this
 * device only and is offered for price alerts alone. Stop these alerts turns the
 * type off, on both channels, for every Character on the account
 * (`docs/context/decisions/20261028-225816-stop-these-alerts-mutes-a-type-for-every.md`).
 *
 * Dismiss and Stop these alerts are undoable. There is no undismiss, so the
 * write is held back until the Undo toast ends (`useDeferredCommits`) and the
 * row is hidden meanwhile. Closing the panel, or the page hiding, commits what
 * is pending.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccountCharacters } from '@/features/character/useCharacters';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  EmptyState,
  IconButton,
  FilterChip,
  ToastStack,
  plainTextActionClassName,
  textActionClassName,
  useDeferredCommits,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { type NotificationFeedRecord } from '@/db';
import { CharacterLink } from '@/features/entities';
import type { AlertsPanelRenderProps } from '@/components/ui/alertsPanelContext';
import { SETTINGS_TABS } from '@/app/pageTabs';
import { formatAge } from '@/lib/age';
import { tabPath } from '@/lib/pageTabs';
import { useFocusAfterCommit, type FocusCandidate } from '@/lib/useFocusAfterCommit';
import { usePrefersReducedMotion } from '@/lib/useMediaQuery';
import { useNow } from '@/lib/useNow';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { AlertGroupRow } from './AlertGroupRow';
import { alertGroupLabel, groupAlertsByType, type AlertTypeGroup } from './alertGroups';
import {
  alertViewPath,
  bellBadge,
  filterByChip,
  markAllReadTargets,
  type AlertChip,
  usefulChips,
} from './dangerAlert';
import { dismissFeedEntriesAndSync } from './feedSync';
import { NotificationExplainer } from './NotificationExplainer';
import { dedupeCharacterName } from './notificationBody';
import { notificationUrlForSubject } from './notificationOptions';
import { useNotificationPermission } from './permission';
import { isDismissOnView, setMutedForCharacters, useNotificationPreferences } from './preferences';
import { pruneExpired, snooze, useSnoozeStore } from './snooze';
import { useVisibleAlertEntries } from './useUnreadAlertCount';

/** Fires listed under an opened group before "Show N more" — a week away can leave hundreds. */
const FIRES_PAGE = 10;

/** The slide out (150ms), the height collapse after it (200ms) and a margin; see `AlertGroupRow`. */
const LEAVE_MS = 400;

const NOTIFICATION_SETTINGS_PATH = tabPath(SETTINGS_TABS, 'notifications');

export function AlertsPanel({ variant, onClose }: AlertsPanelRenderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const now = useNow();
  const allEntries = useVisibleAlertEntries();
  const snoozeMap = useSnoozeStore((state) => state.value);
  const { permission } = useNotificationPermission();
  const dismissOnView = useNotificationPreferences((state) => isDismissOnView(state.value));
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const [selectedChip, setSelectedChip] = useState<AlertChip>('all');
  /** Group key → how many of its fires are listed; absent means collapsed. */
  const [opened, setOpened] = useState<ReadonlyMap<string, number>>(new Map());
  /** Group keys sliding out after a dismiss; their rows stay mounted until the slide ends. */
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  const leaveTimers = useRef(new Map<string, number>());
  const reducedMotion = usePrefersReducedMotion();
  const deferred = useDeferredCommits();
  const { hiddenIds } = deferred;
  const { characters, namesById: nameById } = useAccountCharacters();
  // One-Character device: the name is the same on every row, so it is dropped.
  const showCharacter = characters.length > 1;
  const focusAfterCommit = useFocusAfterCommit();
  const rootRef = useRef<HTMLDivElement>(null);
  const sheet = variant === 'sheet';

  useEffect(() => {
    const timers = leaveTimers.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
    };
  }, []);

  const allGroups = useMemo(() => groupAlertsByType(allEntries), [allEntries]);
  // A group waiting on its Undo toast is already gone as far as the heading, chips and Mark all read go.
  const liveGroups = useMemo(
    () => (hiddenIds.size === 0 ? allGroups : allGroups.filter((g) => !hiddenIds.has(g.key))),
    [allGroups, hiddenIds]
  );
  const entries = useMemo(() => liveGroups.flatMap((group) => group.entries), [liveGroups]);
  const chips = useMemo(() => usefulChips(liveGroups), [liveGroups]);
  // A chip whose alerts have all been dismissed is gone from the bar; fall back to All.
  const chip = chips.includes(selectedChip) ? selectedChip : 'all';
  /** What is on screen: the live rows, plus the ones still sliding out. */
  const rendered = useMemo(
    () => filterByChip(allGroups, chip).filter((g) => !hiddenIds.has(g.key) || leaving.has(g.key)),
    [allGroups, chip, hiddenIds, leaving]
  );
  /** What the keyboard can reach: focus never lands on a row that is leaving. */
  const live = useMemo(() => rendered.filter((g) => !leaving.has(g.key)), [rendered, leaving]);
  const { count } = useMemo(() => bellBadge(entries), [entries]);
  const readable = useMemo(() => markAllReadTargets(entries), [entries]);

  /** A row's dismiss control (Acknowledge on a danger row), else the row itself. */
  const rowControls = (key: string | undefined): FocusCandidate[] =>
    key === undefined
      ? []
      : [
          () =>
            rootRef.current?.querySelector<HTMLElement>(
              `[data-group-key="${key}"] [data-dismiss-target]`
            ),
          () =>
            rootRef.current?.querySelector<HTMLElement>(
              `[data-group-key="${key}"] [data-row-cover]`
            ),
        ];
  const heading = () => rootRef.current?.querySelector<HTMLElement>('h2');

  /** Focus lands on the next row's ×, the previous one's if this was last, else the heading. */
  function focusNeighbour(key: string) {
    const index = live.findIndex((g) => g.key === key);
    focusAfterCommit(
      ...rowControls(live[index + 1]?.key),
      ...rowControls(live[index - 1]?.key),
      heading
    );
  }

  function setShown(key: string, shown: number | null) {
    setOpened((prev) => {
      const next = new Map(prev);
      if (shown === null) next.delete(key);
      else next.set(key, shown);
      return next;
    });
  }

  /** Dismisses one fire; focus moves to a neighbouring fire, else the group's row, else the heading. */
  function dismissFire(group: AlertTypeGroup, fireIndex: number) {
    const fireControl = (id: string | undefined) =>
      id === undefined
        ? null
        : () => rootRef.current?.querySelector<HTMLElement>(`[data-fire-id="${id}"] button`);
    focusAfterCommit(
      fireControl(group.entries[fireIndex + 1]?.id),
      fireControl(group.entries[fireIndex - 1]?.id),
      ...rowControls(group.key),
      heading
    );
    void dismissFeedEntriesAndSync([group.entries[fireIndex]]);
  }

  function stopLeaving(key: string) {
    window.clearTimeout(leaveTimers.current.get(key));
    leaveTimers.current.delete(key);
    setLeaving((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  /** Slides the row out and collapses it; with reduced motion it is simply gone. */
  function startLeaving(key: string) {
    if (reducedMotion) return;
    setLeaving((prev) => new Set(prev).add(key));
    window.clearTimeout(leaveTimers.current.get(key));
    leaveTimers.current.set(
      key,
      window.setTimeout(() => stopLeaving(key), LEAVE_MS)
    );
  }

  /** Hides the group now and holds `commit` until its Undo toast ends. */
  function removeWithUndo(group: AlertTypeGroup, message: string, commit: () => Promise<void>) {
    focusNeighbour(group.key);
    startLeaving(group.key);
    deferred.defer({ id: group.key, message, commit });
  }

  function dismissGroup(group: AlertTypeGroup, label: string) {
    removeWithUndo(
      group,
      group.count > 1
        ? t('alerts.panel.undoDismissedMany', { title: label, count: group.count })
        : t('alerts.panel.undoDismissed', { title: label }),
      () => dismissFeedEntriesAndSync(group.entries)
    );
  }

  /** Every Character on the account, the active one first (it is the one with a token to sync under). */
  function accountCharacterIds(group: AlertTypeGroup): number[] {
    const ids = new Set<number>();
    if (activeCharacterId !== null) ids.add(activeCharacterId);
    for (const character of characters) ids.add(character.characterId);
    // A fire can be from a Character no longer on the roster.
    for (const id of group.characterIds) ids.add(id);
    return [...ids];
  }

  function stopGroup(group: AlertTypeGroup, label: string) {
    const characterIds = accountCharacterIds(group);
    removeWithUndo(
      group,
      t(showCharacter ? 'alerts.panel.undoStopped' : 'alerts.panel.undoStoppedOne', {
        title: label,
      }),
      async () => {
        // The mute first: if it fails the rows stay, rather than going with the type still on.
        await setMutedForCharacters(characterIds, group.target, true);
        await dismissFeedEntriesAndSync(group.entries);
      }
    );
  }

  function undo(id: string) {
    stopLeaving(id);
    deferred.undo(id);
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

      {rendered.length === 0 ? (
        <EmptyState
          title={t('alerts.panel.empty')}
          hint={t('alerts.panel.emptyHint')}
          className="py-8"
        />
      ) : (
        <ul>
          {rendered.map((group) => {
            const label = alertGroupLabel(t, group.target);
            const shown = opened.get(group.key);
            const many = group.count > 1;
            return (
              <AlertGroupRow
                key={group.key}
                group={group}
                label={label}
                now={now}
                shown={shown}
                leaving={leaving.has(group.key)}
                buttonSize={buttonSize}
                onOpen={() => {
                  if (dismissOnView) void dismissFeedEntriesAndSync(group.entries);
                  navigate(alertViewPath(group.key));
                  onClose();
                }}
                onToggle={() => setShown(group.key, shown === undefined ? FIRES_PAGE : null)}
                onDismiss={() => dismissGroup(group, label)}
                // Acknowledge and Snooze commit at once, with no slide and no
                // Undo, where Dismiss and Stop defer. Acknowledge is the one
                // deliberate act the panel keeps (§4e) and undoing it would
                // undo that deliberateness; Snooze is already reversible, since
                // the type returns by itself when the snooze expires.
                onAcknowledge={() => {
                  focusNeighbour(group.key);
                  void dismissFeedEntriesAndSync(group.entries);
                }}
                onSnooze={() => {
                  focusNeighbour(group.key);
                  void useSnoozeStore
                    .getState()
                    .setValue(snooze(pruneExpired(snoozeMap, Date.now()), group.key, Date.now()));
                }}
                onStop={() => stopGroup(group, label)}
                onSettings={() => {
                  // The page narrows its list to this type's label (`NotificationsPanel`'s search).
                  navigate({
                    pathname: NOTIFICATION_SETTINGS_PATH,
                    search: `?search=${encodeURIComponent(label)}`,
                  });
                  onClose();
                }}
              >
                {many && shown !== undefined && (
                  <ul className="mr-3.5 ml-10 border-t border-line">
                    {group.entries.slice(0, shown).map((fire, fireIndex) => (
                      <FireRow
                        key={fire.id}
                        fire={fire}
                        now={now}
                        characterName={nameById.get(fire.characterId) ?? String(fire.characterId)}
                        showCharacter={showCharacter}
                        onNavigate={() => {
                          if (dismissOnView) void dismissFeedEntriesAndSync([fire]);
                          onClose();
                        }}
                        onDismiss={() => dismissFire(group, fireIndex)}
                      />
                    ))}
                    {shown < group.count && (
                      <li className="py-1.5">
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
              </AlertGroupRow>
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

      <ToastStack
        items={deferred.items}
        undoLabel={t('alerts.panel.undo')}
        onUndo={undo}
        onClose={deferred.commit}
      />
    </div>
  );
}

/** One fire inside an opened group: its own body (the group row only shows the newest), age and ×. */
function FireRow({
  fire,
  now,
  characterName,
  showCharacter,
  onNavigate,
  onDismiss,
}: {
  fire: NotificationFeedRecord;
  now: number;
  characterName: string;
  showCharacter: boolean;
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
        size="row"
        onClick={onDismiss}
        className="shrink-0"
      />
    </li>
  );
}
