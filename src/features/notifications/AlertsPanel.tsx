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

const FIRES_PAGE = 10;

const LEAVE_MS = 400;

const NOTIFICATION_SETTINGS_PATH = tabPath(SETTINGS_TABS, 'notifications');

const MARK_ALL_READ_ID = 'mark-all-read';

export function AlertsPanel({ variant, onClose }: AlertsPanelRenderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const now = useNow();
  const feedEntries = useVisibleAlertEntries();
  const deferred = useDeferredCommits();
  const { hiddenIds } = deferred;
  const [markedReadIds, setMarkedReadIds] = useState<ReadonlySet<string>>(new Set());
  const allEntries = useMemo(
    () =>
      hiddenIds.has(MARK_ALL_READ_ID)
        ? feedEntries.filter((entry) => !markedReadIds.has(entry.id))
        : feedEntries,
    [feedEntries, hiddenIds, markedReadIds]
  );
  const snoozeMap = useSnoozeStore((state) => state.value);
  const { permission } = useNotificationPermission();
  const dismissOnView = useNotificationPreferences((state) => isDismissOnView(state.value));
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const [selectedChip, setSelectedChip] = useState<AlertChip>('all');
  const [opened, setOpened] = useState<ReadonlyMap<string, number>>(new Map());
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  const leaveTimers = useRef(new Map<string, number>());
  const reducedMotion = usePrefersReducedMotion();
  const { characters, namesById: nameById } = useAccountCharacters();
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
  const liveGroups = useMemo(
    () => (hiddenIds.size === 0 ? allGroups : allGroups.filter((g) => !hiddenIds.has(g.key))),
    [allGroups, hiddenIds]
  );
  const entries = useMemo(() => liveGroups.flatMap((group) => group.entries), [liveGroups]);
  const chips = useMemo(() => usefulChips(liveGroups), [liveGroups]);
  const chip = chips.includes(selectedChip) ? selectedChip : 'all';
  const rendered = useMemo(
    () => filterByChip(allGroups, chip).filter((g) => !hiddenIds.has(g.key) || leaving.has(g.key)),
    [allGroups, chip, hiddenIds, leaving]
  );
  const live = useMemo(() => rendered.filter((g) => !leaving.has(g.key)), [rendered, leaving]);
  const { count } = useMemo(() => bellBadge(entries), [entries]);
  const readable = useMemo(() => markAllReadTargets(entries), [entries]);

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

  function startLeaving(key: string) {
    if (reducedMotion) return;
    setLeaving((prev) => new Set(prev).add(key));
    window.clearTimeout(leaveTimers.current.get(key));
    leaveTimers.current.set(
      key,
      window.setTimeout(() => stopLeaving(key), LEAVE_MS)
    );
  }

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

  function accountCharacterIds(group: AlertTypeGroup): number[] {
    const ids = new Set<number>();
    if (activeCharacterId !== null) ids.add(activeCharacterId);
    for (const character of characters) ids.add(character.characterId);
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
            aria-disabled={readable.length === 0 || hiddenIds.has(MARK_ALL_READ_ID) || undefined}
            onClick={() => {
              if (readable.length === 0 || hiddenIds.has(MARK_ALL_READ_ID)) return;
              focusAfterCommit(heading);
              const swept = readable;
              setMarkedReadIds(new Set(swept.map((entry) => entry.id)));
              deferred.defer({
                id: MARK_ALL_READ_ID,
                message: t('alerts.panel.undoMarkedRead', { count: swept.length }),
                commit: () => dismissFeedEntriesAndSync(swept),
              });
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
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 self-center">
        <Link
          to={notificationUrlForSubject(
            fire.eventId,
            fire.subjectId ?? fire.typeId,
            fire.characterId,
            fire.id
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
        icon={<Icon.Done />}
        label={t('alerts.panel.dismissFire', { body })}
        variant="plain"
        size="row"
        onClick={onDismiss}
        className="shrink-0"
      />
    </li>
  );
}
