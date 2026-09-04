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
import {
  Button,
  Panel,
  EmptyState,
  SearchInput,
  Tooltip,
  TextInput,
  NativeSelect,
} from '@/components/ui';
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
  characterEveTypePrefs,
  withMasterEnabled,
  withBrowserEnabled,
  withFeedEnabled,
  isBrowserChannelEnabled,
  isFeedChannelEnabled,
  withEventChannelToggled,
  withAllEventsToggledForCharacter,
  withEveNotificationTypeToggled,
  withAllEveTypesToggledForCharacter,
  characterEventThresholds,
  withCharacterEventThreshold,
  STRUCTURE_FUEL_LOW_DAY_OPTIONS,
} from './preferences';
import {
  isEventEnabledFor,
  isEveTypeEnabledFor,
  selectionStateForEvents,
  selectionStateForEveTypes,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_FAMILIES,
  eveTypesByFamily,
  type NotificationChannel,
} from './eventSelection';
import { filterNotificationSections } from './notificationSearch';
import { refreshAppBadge } from './appBadge';
import {
  useNotificationPermission,
  useNotificationPromptState,
  requestNotificationPermission,
  promptStateAfterAsk,
  notificationsBlocked,
} from './permission';
import { loadCharacterRoles, corpWideRoles } from '@/features/corp/roles';
import { corpCapabilities, type CorpCapabilities } from '@/engine/corpRoles';

const EVENT_BY_ID = new Map(NOTIFICATION_EVENTS.map((event) => [event.id, event]));

/**
 * Every corp event (issue #299) — used to attach the best-effort disclosure
 * to each, since search can narrow a section to just one row. Derived from
 * `corpCapability` rather than hand-listed, so a future corp event picks up
 * the disclosure by virtue of carrying that field, not by also being added
 * here.
 */
const CORP_EVENT_IDS: ReadonlySet<NotificationEventId> = new Set(
  NOTIFICATION_EVENTS.filter((event) => event.corpCapability !== undefined).map((event) => event.id)
);

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

  // The Overview panel refreshes the app-icon badge when preferences change,
  // but it is unmounted while the user is on Settings — which is the only
  // place these toggles live. Without this the badge keeps a count the feed
  // no longer shows until the next Overview visit or app restart.
  useEffect(() => {
    void refreshAppBadge();
  }, [prefsValue]);

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

  /**
   * Per-stored-character corp capability (issue #299) — a departure from
   * `useCorpAccess`'s active-character-only scope (CONTEXT.md round 37):
   * that read backs a hot, always-mounted Settings row, while
   * `loadCharacterRoles` is documented as cheap enough to run for everyone
   * (`features/corp/roles.ts`) and this only runs once per Settings visit,
   * cached an hour by the same read `/corp` itself uses.
   *
   * A character absent from the map (still loading, or the roles read
   * failed) is **not** treated as capability-missing — AC5 is a poller
   * contract, not a UI one, so an unresolved read here renders the row
   * enabled rather than falsely locking it before the answer is in.
   */
  const [capabilitiesByCharacterId, setCapabilitiesByCharacterId] = useState<
    ReadonlyMap<number, CorpCapabilities>
  >(new Map());

  useEffect(() => {
    let cancelled = false;
    const ids = (characters ?? []).map((c) => c.characterId);
    if (ids.length === 0) return;
    void (async () => {
      const entries = await Promise.all(
        ids.map(async (characterId) => {
          const result = await loadCharacterRoles(characterId);
          if (result.needsReauth || result.cached === null) return null;
          return [characterId, corpCapabilities(corpWideRoles(result.cached.data))] as const;
        })
      );
      if (cancelled) return;
      const resolved = entries.filter(
        (entry): entry is readonly [number, CorpCapabilities] => entry !== null
      );
      setCapabilitiesByCharacterId(new Map(resolved));
    })();
    return () => {
      cancelled = true;
    };
  }, [characters]);

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

  // A denied grant disables the *browser* column and its Enable button — JS
  // cannot re-request one, so those controls could never take effect. It no
  // longer stands in for the whole panel: the Overview feed is designed to
  // work with no grant at all (`foregroundPoller` keeps filing it when
  // permission is 'denied'), so blanking this section left exactly the user
  // whose only channel is the feed with no way to configure it — and the
  // Overview's own "Settings" link landing on a dead end.
  const browserBlocked = notificationsBlocked(permission);

  return (
    <Panel title={t('settings.notificationsTitle')}>
      <div className="space-y-3">
        <p className="text-xs text-text-dim">{t('settings.notifications.hint')}</p>
        {browserBlocked && (
          <p
            role="status"
            className="rounded-xs border border-warning/60 bg-warning/10 px-3 py-2 text-xs text-text"
          >
            {t('settings.notifications.blockedNotice')}
          </p>
        )}
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

        {/*
          The two delivery channels, nested under the master switch and
          disabled with it. They are independent rather than a fallback
          chain: browser notifications need a permission grant and an OS that
          will raise one (never iOS while the app is closed, ADR 0007), while
          the Overview feed works everywhere and is the only channel some
          devices will ever see — so switching one off must not touch the
          other.
        */}
        <fieldset disabled={!prefsValue.masterEnabled} className="ml-6 space-y-2">
          <label className="flex items-center gap-2 text-xs text-text">
            <input
              type="checkbox"
              checked={isBrowserChannelEnabled(prefsValue) && !browserBlocked}
              disabled={browserBlocked}
              onChange={() =>
                void setPrefsValue(
                  withBrowserEnabled(prefsValue, !isBrowserChannelEnabled(prefsValue))
                )
              }
              className="size-4 shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-50"
            />
            {t('settings.notifications.browserChannelLabel')}
          </label>
          <p className="ml-6 text-[0.6875rem] text-text-dim">
            {t('settings.notifications.browserChannelHint')}
          </p>
          <label className="flex items-center gap-2 text-xs text-text">
            <input
              type="checkbox"
              checked={isFeedChannelEnabled(prefsValue)}
              onChange={() =>
                void setPrefsValue(withFeedEnabled(prefsValue, !isFeedChannelEnabled(prefsValue)))
              }
              className="size-4 shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed"
            />
            {t('settings.notifications.feedChannelLabel')}
          </label>
          <p className="ml-6 text-[0.6875rem] text-text-dim">
            {t('settings.notifications.feedChannelHint')}
          </p>
        </fieldset>

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
                const characterCapabilities = capabilitiesByCharacterId.get(character.characterId);
                // A capability not yet resolved reads as held (see the
                // capability effect's own doc comment) — never a false lock
                // while the roles read is still in flight.
                function hasCapability(def: NotificationEventDef): boolean {
                  return (
                    def.corpCapability === undefined ||
                    (characterCapabilities?.[def.corpCapability] ?? true)
                  );
                }
                const togglableEventIds = visibleEventIds.filter((eventId) => {
                  const def = eventDef(eventId);
                  return grantedScopes.has(def.scope) && hasCapability(def);
                });
                const prefs = characterEventPrefs(prefsValue, character.characterId);
                const eveTypePrefs = characterEveTypePrefs(prefsValue, character.characterId);
                const thresholds = characterEventThresholds(prefsValue, character.characterId);

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
                      {/* One select-all per column, in the same grid track as
                          the checkboxes below so each sits over its own column. */}
                      <div className="grid shrink-0 grid-cols-2 gap-x-6">
                        {NOTIFICATION_CHANNELS.map((channel) => (
                          <SelectionCheckbox
                            key={channel}
                            state={selectionStateForEvents(togglableEventIds, prefs, channel)}
                            onToggle={() =>
                              void setPrefsValue(
                                withAllEventsToggledForCharacter(
                                  prefsValue,
                                  character.characterId,
                                  togglableEventIds,
                                  channel
                                )
                              )
                            }
                            label={t(`settings.notifications.selectAll.${channel}`, {
                              character: character.name,
                            })}
                          />
                        ))}
                      </div>
                    </div>
                    {expanded && (
                      <div className="bg-panel-2">
                        {/* Column captions, aligned to the same two tracks the
                            rows below use — an event can raise a browser
                            notification without joining the Overview list, or
                            the reverse. */}
                        <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-1.5">
                          <span className="sr-only">{t('settings.notifications.columnEvent')}</span>
                          <span aria-hidden="true" className="flex-1" />
                          <div className="grid shrink-0 grid-cols-2 gap-x-6 text-center">
                            {NOTIFICATION_CHANNELS.map((channel) => (
                              <span
                                key={channel}
                                className="w-4 text-[0.6875rem] leading-tight text-text-dim"
                              >
                                {t(`settings.notifications.column.${channel}`)}
                              </span>
                            ))}
                          </div>
                        </div>
                        <ul className="divide-y divide-line">
                          {visibleEventIds.map((eventId) => {
                            const def = eventDef(eventId);
                            const hasScope = grantedScopes.has(def.scope);
                            const capabilityMissing = !hasCapability(def);
                            const rowEnabled = hasScope && !capabilityMissing;
                            const eventLabel = t(def.labelKey);
                            return (
                              <li key={eventId}>
                                <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                                  <span className={rowEnabled ? 'text-text' : 'text-text-faint'}>
                                    {eventLabel}
                                  </span>
                                  <div className="grid shrink-0 grid-cols-2 gap-x-6">
                                    {NOTIFICATION_CHANNELS.map((channel) => (
                                      <ChannelCheckbox
                                        key={channel}
                                        channel={channel}
                                        eventLabel={eventLabel}
                                        enabled={
                                          rowEnabled && !(channel === 'browser' && browserBlocked)
                                        }
                                        disabledReason={
                                          !hasScope
                                            ? 'scope'
                                            : capabilityMissing
                                              ? 'capability'
                                              : null
                                        }
                                        checked={isEventEnabledFor(prefs, eventId, channel)}
                                        onToggle={() =>
                                          void setPrefsValue(
                                            withEventChannelToggled(
                                              prefsValue,
                                              character.characterId,
                                              eventId,
                                              channel
                                            )
                                          )
                                        }
                                      />
                                    ))}
                                  </div>
                                </div>
                                {/*
                                  Delivery disclosure for the lead-time
                                  warning (issue #310, AC5). Not gated on
                                  `hasScope`: what limits this one is the
                                  poll cadence (the app must be open — ADR
                                  0009 retired Periodic Background Sync), not
                                  the character's grants, so the caveat is
                                  true before authorization too.
                                */}
                                {eventId === 'planetaryExtractorExpiring' && (
                                  <p className="border-t border-line bg-panel/60 px-6 py-1.5 text-[0.6875rem] text-text-dim">
                                    {t('settings.notifications.extractorExpiringHint')}
                                  </p>
                                )}
                                {/*
                                  Structure fuel's inline threshold control
                                  (issue #299, AC4) — the first Notification
                                  Event with a setting of its own rather than
                                  a plain on/off. Persisted per Character and
                                  per device (`preferences.ts`), and re-read
                                  by the poller every 5-minute tick, which is
                                  what "takes effect without a reload" means
                                  here (CONTEXT.md round 43).
                                */}
                                {eventId === 'structureFuelLow' && rowEnabled && (
                                  <div className="border-t border-line bg-panel/60 px-6 py-1.5">
                                    <label className="flex items-center gap-2 text-[0.6875rem] text-text-dim">
                                      {t('settings.notifications.structureFuelLowThresholdLabel')}
                                      <NativeSelect
                                        size="sm"
                                        className="w-auto"
                                        value={thresholds.structureFuelLowDays}
                                        onChange={(e) =>
                                          void setPrefsValue(
                                            withCharacterEventThreshold(
                                              prefsValue,
                                              character.characterId,
                                              'structureFuelLowDays',
                                              Number(e.target.value)
                                            )
                                          )
                                        }
                                      >
                                        {STRUCTURE_FUEL_LOW_DAY_OPTIONS.map((days) => (
                                          <option key={days} value={days}>
                                            {t(
                                              'settings.notifications.structureFuelLowThresholdOption',
                                              {
                                                count: days,
                                              }
                                            )}
                                          </option>
                                        ))}
                                      </NativeSelect>
                                    </label>
                                    {/*
                                      Issue #299's own words: "say so in the
                                      UI, so nobody reads it as a second copy
                                      of the EVE alert." CCP's own
                                      StructureFuelAlert fires later, at its
                                      own fixed point — this is additive
                                      early warning, not a duplicate.
                                    */}
                                    <p className="mt-1 text-[0.6875rem] text-text-faint">
                                      {t('settings.notifications.structureFuelLowNotDuplicateHint')}
                                    </p>
                                  </div>
                                )}
                                {/*
                                  Corp wallet's two independent thresholds
                                  (issue #299, AC4) — a division balance floor
                                  and a single-transaction ceiling, either of
                                  which fires. Same persistence as the fuel
                                  control above.
                                */}
                                {eventId === 'corpWalletThreshold' && rowEnabled && (
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line bg-panel/60 px-6 py-1.5">
                                    <ThresholdAmountInput
                                      id={`corp-wallet-floor-${character.characterId}`}
                                      label={t(
                                        'settings.notifications.corpWalletBalanceFloorLabel'
                                      )}
                                      value={thresholds.corpWalletBalanceFloorIsk}
                                      onCommit={(amount) =>
                                        void setPrefsValue(
                                          withCharacterEventThreshold(
                                            prefsValue,
                                            character.characterId,
                                            'corpWalletBalanceFloorIsk',
                                            amount
                                          )
                                        )
                                      }
                                    />
                                    <ThresholdAmountInput
                                      id={`corp-wallet-ceiling-${character.characterId}`}
                                      label={t(
                                        'settings.notifications.corpWalletTransactionCeilingLabel'
                                      )}
                                      value={thresholds.corpWalletTransactionCeilingIsk}
                                      onCommit={(amount) =>
                                        void setPrefsValue(
                                          withCharacterEventThreshold(
                                            prefsValue,
                                            character.characterId,
                                            'corpWalletTransactionCeilingIsk',
                                            amount
                                          )
                                        )
                                      }
                                    />
                                  </div>
                                )}
                                {/*
                                  The honesty requirement (issue #299): these
                                  five events are best-effort, no server push.
                                  Attached per row, not once per section, so
                                  it survives a search that narrows a
                                  character's section to a single corp row.
                                */}
                                {CORP_EVENT_IDS.has(eventId) && (
                                  <p className="border-t border-line bg-panel/60 px-6 py-1.5 text-[0.6875rem] text-text-dim">
                                    {t('settings.notifications.corpEventBestEffortHint')}
                                  </p>
                                )}
                                {/*
                                  Per-type opt-out underneath the single
                                  eveNotification event (issue #274, AC3).
                                  Enumerated from the closed allow-list,
                                  grouped by Notification Family (issue #352),
                                  rather than discovered from the feed, so
                                  every type is toggle-able immediately rather
                                  than only after it has fired once.
                                */}
                                {eventId === 'eveNotification' && hasScope && (
                                  <div className="border-t border-line bg-panel/60 pl-3">
                                    <p className="px-3 py-1.5 text-[0.6875rem] text-text-dim">
                                      {t('settings.notifications.eveTypesHint')}
                                    </p>
                                    {NOTIFICATION_FAMILIES.map((family) => {
                                      const familyTypes = eveTypesByFamily(family);
                                      if (familyTypes.length === 0) return null;
                                      const familyLabel = t(
                                        `settings.notifications.family.${family}`
                                      );
                                      return (
                                        <div key={family}>
                                          <div className="flex items-center justify-between gap-3 border-t border-line/60 bg-panel/40 px-3 py-1">
                                            <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                                              {familyLabel}
                                            </span>
                                            <div className="grid shrink-0 grid-cols-2 gap-x-6">
                                              {NOTIFICATION_CHANNELS.map((channel) => (
                                                <SelectionCheckbox
                                                  key={channel}
                                                  state={selectionStateForEveTypes(
                                                    familyTypes,
                                                    eveTypePrefs,
                                                    channel
                                                  )}
                                                  onToggle={() =>
                                                    void setPrefsValue(
                                                      withAllEveTypesToggledForCharacter(
                                                        prefsValue,
                                                        character.characterId,
                                                        familyTypes,
                                                        channel
                                                      )
                                                    )
                                                  }
                                                  label={t(
                                                    `settings.notifications.selectAllFamily.${channel}`,
                                                    { family: familyLabel }
                                                  )}
                                                />
                                              ))}
                                            </div>
                                          </div>
                                          <ul className="divide-y divide-line/60">
                                            {familyTypes.map((type) => (
                                              <li
                                                key={type}
                                                className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs"
                                              >
                                                <span className="truncate text-text-dim">
                                                  {type}
                                                </span>
                                                <div className="grid shrink-0 grid-cols-2 gap-x-6">
                                                  {NOTIFICATION_CHANNELS.map((channel) => (
                                                    <ChannelCheckbox
                                                      key={channel}
                                                      channel={channel}
                                                      eventLabel={type}
                                                      enabled={
                                                        !(channel === 'browser' && browserBlocked)
                                                      }
                                                      disabledReason={null}
                                                      checked={isEveTypeEnabledFor(
                                                        eveTypePrefs,
                                                        type,
                                                        channel
                                                      )}
                                                      onToggle={() =>
                                                        void setPrefsValue(
                                                          withEveNotificationTypeToggled(
                                                            prefsValue,
                                                            character.characterId,
                                                            type,
                                                            channel
                                                          )
                                                        )
                                                      }
                                                    />
                                                  ))}
                                                </div>
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
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

/**
 * One event's checkbox for one delivery channel. Its accessible name names
 * both — "New Mail, browser notifications" — because two visually adjacent
 * checkboxes on a row are indistinguishable to a screen reader otherwise, and
 * the column caption above is not associated with them.
 *
 * `disabledReason` picks the tooltip when `enabled` is false: a missing
 * scope reads "re-authorize", but a corp event a Character lacks the
 * in-game role for cannot be fixed by re-authing at all (issue #299) — that
 * needs its own copy, the same distinction `corpAuthFailure.ts` draws for
 * the poller's own 403 handling. `null` (the eve-type sub-rows, which are
 * never capability- or scope-gated of their own) falls back to the scope
 * copy for parity with this component's pre-#299 behaviour.
 */
function ChannelCheckbox({
  channel,
  eventLabel,
  enabled,
  disabledReason,
  checked,
  onToggle,
}: {
  channel: NotificationChannel;
  eventLabel: string;
  enabled: boolean;
  disabledReason: 'scope' | 'capability' | null;
  checked: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const label = t(`settings.notifications.toggleLabel.${channel}`, { event: eventLabel });
  const checkbox = (
    <input
      type="checkbox"
      checked={enabled && checked}
      disabled={!enabled}
      onChange={onToggle}
      aria-label={label}
      className="size-4 shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
  if (enabled) return checkbox;
  const hintKey =
    disabledReason === 'capability'
      ? 'settings.notifications.corpCapabilityHint'
      : 'settings.notifications.reauthHint';
  return <Tooltip content={t(hintKey)}>{checkbox}</Tooltip>;
}

/**
 * An ISK-amount threshold field (issue #299): local text state so a
 * mid-typing value like "50," or an empty field never round-trips through
 * `withCharacterEventThreshold` as `NaN`. Commits on blur, matching the
 * pattern used elsewhere for numeric fields (`piPlan.tsx`); reverts to the
 * last committed value on an invalid blur.
 */
function ThresholdAmountInput({
  id,
  label,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  // Adjusted during render, not an effect (react-hooks/set-state-in-effect):
  // this is React's own "store info from previous renders" pattern for
  // resetting local state when a prop changes, not a DOM/external-system
  // sync — an actual effect would run one render late here.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(String(value));
  }

  function commit() {
    const amount = Number(text);
    if (Number.isFinite(amount) && amount >= 0) {
      onCommit(Math.round(amount));
    } else {
      setText(String(value));
    }
  }

  return (
    <label htmlFor={id} className="flex items-center gap-2 text-[0.6875rem] text-text-dim">
      {label}
      <TextInput
        id={id}
        size="sm"
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        className="w-32"
      />
    </label>
  );
}
