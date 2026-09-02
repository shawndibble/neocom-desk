/**
 * Settings' Notifications section. Persistence + UI shell landed with issue
 * #170; issue #171 added the browser grant on top, so this section now renders
 * three ways off the *live* `Notification.permission` (never off the stored
 * outcome — the user can flip it in site settings without telling the page):
 *
 * - **denied** — the blocked notice stands in for the whole toggle UI. JS
 *   cannot re-request a denied grant, so offering toggles here would be a
 *   button that does nothing.
 * - **default** — the toggles stay, with an Enable button above them: the
 *   second chance for someone who dismissed the one-time explainer
 *   (`NotificationPermissionPrompt`). That tap is the only thing in this file
 *   that reaches the browser prompt; nothing requests permission on mount.
 * - **granted** (and browsers with no Notification API at all) — unchanged.
 *
 * Below that: each Character gets a collapsible section listing every
 * Notification Event, on by default, with a select-all/none checkbox; a row
 * the Character lacks the ESI scope for renders disabled with a reauth tooltip
 * instead of a working toggle (the same "compare the grant, don't wait for a
 * 403" reasoning as `ScopeGate.tsx`, applied per row instead of per route).
 * Search filters rows by event-type or Character name (Trained Skills
 * precedent, issue #108). The Foreground Poller
 * (`features/notifications/ForegroundNotificationPoller.tsx`, issue #172)
 * reads these same toggles to decide what to fire; further Notification
 * Events land here as later tickets add their pollers (CONTEXT.md round 20).
 */ import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, Panel, EmptyState, SearchInput, Tooltip } from '@/components/ui';
import { SelectionCheckbox } from '@/features/character/SelectionCheckbox';
import { db } from '@/db';
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_IDS,
  type NotificationEventDef,
  type NotificationEventId,
} from './events';
import {
  useNotificationPreferences,
  characterEventPrefs,
  withMasterEnabled,
  withEventToggled,
  withAllEventsToggledForCharacter,
} from './preferences';
import { isEventEnabled, selectionStateForEvents } from './eventSelection';
import { filterNotificationSections } from './notificationSearch';
import {
  useNotificationPermission,
  useNotificationPromptState,
  requestNotificationPermission,
  promptStateAfterAsk,
  notificationsBlocked,
} from './permission';

const EVENT_BY_ID = new Map(NOTIFICATION_EVENTS.map((event) => [event.id, event]));

function eventDef(eventId: NotificationEventId): NotificationEventDef {
  const def = EVENT_BY_ID.get(eventId);
  if (!def) throw new Error(`Unknown Notification Event id: ${eventId}`);
  return def;
}

export function NotificationsPanel() {
  const { t } = useTranslation();
  const characters = useLiveQuery(() => db.characters.orderBy('characterId').toArray());
  const tokens = useLiveQuery(() => db.tokens.toArray());

  const prefsValue = useNotificationPreferences((state) => state.value);
  const hydratePrefs = useNotificationPreferences((state) => state.hydrate);
  const setPrefsValue = useNotificationPreferences((state) => state.setValue);

  useEffect(() => {
    void hydratePrefs();
  }, [hydratePrefs]);

  const { permission, refresh: refreshPermission } = useNotificationPermission();
  const setPromptState = useNotificationPromptState((state) => state.setValue);

  // Records the ask here too, so someone who ignored the one-time explainer and
  // came to Settings instead is not offered it again on the next load.
  async function enableNotifications() {
    const outcome = await requestNotificationPermission();
    await setPromptState(promptStateAfterAsk(outcome));
    refreshPermission();
  }

  const [search, setSearch] = useState('');
  const [expandedCharacterIds, setExpandedCharacterIds] = useState<ReadonlySet<number>>(new Set());

  function toggleExpanded(characterId: number) {
    setExpandedCharacterIds((prev) => {
      const next = new Set(prev);
      if (next.has(characterId)) next.delete(characterId);
      else next.add(characterId);
      return next;
    });
  }

  const scopesByCharacterId = useMemo(() => {
    const map = new Map<number, ReadonlySet<string>>();
    for (const token of tokens ?? []) map.set(token.characterId, new Set(token.scopes));
    return map;
  }, [tokens]);

  const eventLabels = useMemo(
    () => NOTIFICATION_EVENTS.map((event) => ({ id: event.id, label: t(event.labelKey) })),
    [t]
  );

  const sections = useMemo(
    () => (characters ?? []).map((c) => ({ characterId: c.characterId, characterName: c.name })),
    [characters]
  );

  const filterResult = useMemo(
    () => filterNotificationSections(sections, eventLabels, search),
    [sections, eventLabels, search]
  );
  const searching = filterResult !== null;
  // useLiveQuery resolves asynchronously — render the panel and master switch
  // immediately (like ActivityLogPanel does), and treat "still loading" the
  // same as "no characters yet" rather than blanking the whole section.
  const characterList = characters ?? [];

  // JS cannot re-request a denied grant, so the toggle UI would be a set of
  // controls that can never take effect — the notice stands in for all of it
  // until the user unblocks the site (issue #171).
  if (notificationsBlocked(permission)) {
    return (
      <Panel title={t('settings.notificationsTitle')}>
        <div className="space-y-3">
          <p className="text-xs text-text-dim">{t('settings.notifications.hint')}</p>
          <p
            role="status"
            className="rounded-xs border border-warning/60 bg-warning/10 px-3 py-2 text-xs text-text"
          >
            {t('settings.notifications.blockedNotice')}
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title={t('settings.notificationsTitle')}>
      <div className="space-y-3">
        <p className="text-xs text-text-dim">{t('settings.notifications.hint')}</p>
        {permission === 'default' && (
          <div className="flex flex-wrap items-center gap-2 rounded-xs border border-line bg-panel-2 px-3 py-2">
            <p className="min-w-0 flex-1 text-xs text-text-dim">
              {t('settings.notifications.enableHint')}
            </p>
            <Button size="sm" variant="primary" onClick={() => void enableNotifications()}>
              {t('settings.notifications.enableButton')}
            </Button>
          </div>
        )}
        <label className="flex items-center gap-2 text-xs font-medium text-text">
          <input
            type="checkbox"
            checked={prefsValue.masterEnabled}
            onChange={() =>
              void setPrefsValue(withMasterEnabled(prefsValue, !prefsValue.masterEnabled))
            }
            className="size-4 shrink-0 cursor-pointer accent-accent"
          />
          {t('settings.notifications.masterSwitchLabel')}
        </label>

        {characterList.length === 0 ? (
          <EmptyState title={t('settings.notifications.emptyTitle')} />
        ) : (
          <>
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('settings.notifications.searchPlaceholder')}
              aria-label={t('settings.notifications.searchPlaceholder')}
            />

            {searching && filterResult.visibleCharacterIds.size === 0 ? (
              <EmptyState title={t('settings.notifications.noResults')} className="py-8" />
            ) : (
              characterList.map((character) => {
                if (searching && !filterResult.visibleCharacterIds.has(character.characterId)) {
                  return null;
                }
                const expanded = searching || expandedCharacterIds.has(character.characterId);
                const visibleEventIds: readonly NotificationEventId[] = searching
                  ? [...(filterResult.visibleEventIdsByCharacter.get(character.characterId) ?? [])]
                  : NOTIFICATION_EVENT_IDS;
                const grantedScopes = scopesByCharacterId.get(character.characterId) ?? new Set();
                const togglableEventIds = visibleEventIds.filter((eventId) =>
                  grantedScopes.has(eventDef(eventId).scope)
                );
                const prefs = characterEventPrefs(prefsValue, character.characterId);
                const selectionState = selectionStateForEvents(togglableEventIds, prefs);

                return (
                  <div
                    key={character.characterId}
                    className="rounded-xs border border-line bg-panel/85 backdrop-blur-sm"
                  >
                    {/* Select-all is a sibling of the expand toggle, not nested inside its
                        <button> — an interactive control inside a <button> is invalid HTML
                        and would fold both accessible names together for screen readers. */}
                    <div
                      className={`flex min-h-8 items-center gap-2 px-2.5 py-1.5 ${expanded ? 'border-b border-line' : ''}`}
                    >
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => toggleExpanded(character.characterId)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                      >
                        <span aria-hidden="true" className="w-3 shrink-0 text-text-faint">
                          {expanded ? '▾' : '▸'}
                        </span>
                        <span className="min-w-0 truncate normal-case">{character.name}</span>
                      </button>
                      <SelectionCheckbox
                        state={selectionState}
                        onToggle={() =>
                          void setPrefsValue(
                            withAllEventsToggledForCharacter(
                              prefsValue,
                              character.characterId,
                              togglableEventIds
                            )
                          )
                        }
                        label={t('settings.notifications.selectAllLabel', {
                          character: character.name,
                        })}
                      />
                    </div>
                    {expanded && (
                      <ul className="divide-y divide-line bg-panel-2">
                        {visibleEventIds.map((eventId) => {
                          const def = eventDef(eventId);
                          const hasScope = grantedScopes.has(def.scope);
                          const enabled = isEventEnabled(prefs, eventId);
                          const eventLabel = t(def.labelKey);
                          const checkbox = (
                            <input
                              type="checkbox"
                              checked={hasScope && enabled}
                              disabled={!hasScope}
                              onChange={() =>
                                void setPrefsValue(
                                  withEventToggled(prefsValue, character.characterId, eventId)
                                )
                              }
                              aria-label={eventLabel}
                              className="size-4 shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          );
                          return (
                            <li
                              key={eventId}
                              className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                            >
                              <span className={hasScope ? 'text-text' : 'text-text-faint'}>
                                {eventLabel}
                              </span>
                              {hasScope ? (
                                checkbox
                              ) : (
                                <Tooltip content={t('settings.notifications.reauthHint')}>
                                  {checkbox}
                                </Tooltip>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
