/**
 * Settings' Notifications section. Persistence + UI shell landed with issue
 * #170; issue #171 added the browser grant on top, so this section renders
 * three ways off the *live* `Notification.permission` (never off the stored
 * outcome, since the user can flip it in site settings without telling the
 * page):
 *
 * - **denied**: the blocked notice and a disabled Device column. JS cannot
 *   re-request a denied grant, so a toggle here would do nothing.
 * - **default**: the toggles stay, with Device pop-ups reading unticked: the
 *   second chance for someone who dismissed the one-time explainer
 *   (`NotificationExplainer`). Ticking Device pop-ups is the only thing in this file
 *   that reaches the browser prompt; nothing requests permission on mount.
 * - **granted** (and browsers with no Notification API at all): unchanged.
 *
 * Below that the page is event-first: every Notification Event once, each row
 * speaking for all Characters, with a "K differ" chip and an expander that
 * lists the Characters so the odd ones out can be fixed (`NotificationEventList`).
 * A row a Character lacks the ESI scope for does not count that Character and
 * shows it dimmed with a reauth tooltip, the "compare the grant, don't wait for
 * a 403" reasoning of `ScopeGate.tsx` applied per Character. The Foreground
 * Poller (`ForegroundNotificationPoller.tsx`, issue #172) reads these same
 * toggles to decide what to fire.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Panel, EmptyState, SearchInput } from '@/components/ui';
import { NotificationsDelivery } from './NotificationsDelivery';
import { NotificationEventList } from './NotificationEventList';
import type { EventRowContext } from './eventRowSupport';
import { MD_UP_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
import { db } from '@/db';
import { useCharacters } from '@/features/character/useCharacters';
import { NOTIFICATION_EVENT_IDS, eventLabelKey } from './events';
import { useNotificationPreferences, hydrateNotificationPreferences } from './preferences';
import { extraEveTypes } from './eventSelection';
import { filterNotificationEvents } from './notificationSearch';
import { useSeenEveTypesStore } from './seenEveTypes';
import { refreshAppBadge } from './appBadge';
import { useNotificationPermission, notificationsBlocked } from './permission';
import { channelOffReasons } from './channelOff';
import { webPushSupport } from '@/sync/webPushSupport';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { isSyncConfigured } from '@/app/syncStatus';
import { loadCharacterRoles, corpWideRoles } from '@/features/corp/roles';
import { corpCapabilities, type CorpCapabilities } from '@/engine/corpRoles';
import { useUrlParam } from '@/lib/useUrlState';
import { textParam } from '@/lib/urlState';
import { useHydratedStore } from '@/lib/useHydratedStore';

/** Module scope so `useUrlParam` sees a stable codec identity across renders. */
const SEARCH_PARAM = textParam();

export function NotificationsPanel() {
  const { t } = useTranslation();
  const roster = useCharacters();
  const characters = useMemo(
    () => [...roster].sort((a, b) => a.characterId - b.characterId),
    [roster]
  );
  const tokens = useLiveQuery(() => db.tokens.toArray());

  const prefsValue = useNotificationPreferences((state) => state.value);
  // Types the server has seen for each Character (issue #3755): a toggle for
  // one appears the next time Settings opens, so this is read, not awaited.
  const seenEveTypes = useSeenEveTypesStore((state) => state.value);
  useHydratedStore(useSeenEveTypesStore);
  const extraTypesByCharacter = useMemo(
    () =>
      new Map(
        Object.entries(seenEveTypes).map(([characterId, seen]) => [
          Number(characterId),
          extraEveTypes(seen),
        ])
      ),
    [seenEveTypes]
  );

  useEffect(() => {
    void hydrateNotificationPreferences();
  }, []);

  // Per-Character writes (event/eve-type toggles, thresholds) go through
  // `updatePrefs` (preferences.ts) — it also pushes the feed-only slice to
  // the synced setting and schedules a sync (issue #363). The
  // device-local-only writes below (master switch, browser/feed channel
  // gates) go through `setDeviceNotificationPrefs` instead, since none of
  // that belongs on the wire. Both schedule the Projection rebuild themselves.

  // The Overview panel refreshes the app-icon badge when preferences change,
  // but it is unmounted while the user is on Settings — which is the only
  // place these toggles live. Without this the badge keeps a count the feed
  // no longer shows until the next Overview visit or app restart.
  useEffect(() => {
    void refreshAppBadge();
  }, [prefsValue]);

  const { permission, refresh: refreshPermission } = useNotificationPermission();
  const [search, setSearch] = useUrlParam('search', SEARCH_PARAM);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const isDesktop = useMediaQuery(MD_UP_QUERY);

  const scopesByCharacterId = useMemo(() => {
    const map = new Map<number, ReadonlySet<string>>();
    for (const token of tokens ?? []) map.set(token.characterId, new Set(token.scopes));
    return map;
  }, [tokens]);

  /**
   * Per-stored-character corp capability (issue #299) — a departure from
   * `useCorpAccess`'s active-character-only scope (GLOSSARY.md round 37):
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
    const ids = characters.map((c) => c.characterId);
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
    () => NOTIFICATION_EVENT_IDS.map((id) => ({ id, label: t(eventLabelKey(id)) })),
    [t]
  );

  // useLiveQuery resolves asynchronously: render the panel and master switch
  // immediately, and treat "still loading" the same as "no characters yet".
  // "Still loading" covers `tokens` too: the two live queries resolve on
  // separate ticks, and rendering Characters before their tokens arrive drew
  // every row scope-less for a frame.
  const characterList = useMemo(
    () => (tokens !== undefined ? characters : []),
    [characters, tokens]
  );

  /**
   * Every known Character, active one first: a row's broadcast writes into
   * every Character it applies to in one call and schedules its sync off the
   * first, and the active Character is the one this session already knows is
   * signed in with a usable token.
   */
  const characterRefs = useMemo(
    () => characterList.map((c) => ({ characterId: c.characterId, name: c.name })),
    [characterList]
  );
  const orderedCharacters = useMemo(() => {
    if (activeCharacterId === null) return characterRefs;
    return [
      ...characterRefs.filter((c) => c.characterId === activeCharacterId),
      ...characterRefs.filter((c) => c.characterId !== activeCharacterId),
    ];
  }, [characterRefs, activeCharacterId]);

  const filterResult = useMemo(
    () =>
      filterNotificationEvents(
        orderedCharacters.map((c) => ({ characterId: c.characterId, characterName: c.name })),
        eventLabels,
        search
      ),
    [orderedCharacters, eventLabels, search]
  );
  const visibleEventIds = useMemo(
    () =>
      filterResult === null
        ? NOTIFICATION_EVENT_IDS
        : NOTIFICATION_EVENT_IDS.filter((id) => filterResult.visibleEventIds.has(id)),
    [filterResult]
  );

  // A denied grant disables the *browser* column and its Enable button: JS
  // cannot re-request one. It does not blank the panel, because the Overview
  // feed works with no grant at all.
  const browserBlocked = notificationsBlocked(permission);
  // Which channels the event boxes can use right now (issue #5330); one object per change, not per render.
  const channelOff = useMemo(
    () =>
      channelOffReasons({
        permission,
        installRequired: webPushSupport() === 'requires-install',
        prefsValue,
      }),
    [permission, prefsValue]
  );

  const rowContext: EventRowContext = {
    characters: orderedCharacters,
    scopesByCharacterId,
    capabilitiesByCharacterId,
    prefsValue,
    channelOff,
    visibleCharacterIds: filterResult?.characterIds ?? null,
    // A search that names Characters opens every row to show just those chips.
    forceExpanded: filterResult?.characterIds != null,
    isDesktop,
  };

  return (
    <Panel>
      <div className="space-y-3">
        <p className="text-xs text-text-dim">{t('settings.notifications.hint')}</p>
        <NotificationsDelivery
          permission={permission}
          refreshPermission={refreshPermission}
          browserBlocked={browserBlocked}
          alertsWhenClosedCharacters={
            isSyncConfigured() && characterList.length > 0 ? characterRefs : null
          }
        />

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
            {filterResult !== null && visibleEventIds.length === 0 ? (
              <EmptyState title={t('settings.notifications.noResults')} className="py-8" />
            ) : (
              <NotificationEventList
                eventIds={visibleEventIds}
                context={rowContext}
                extraTypesByCharacter={extraTypesByCharacter}
                searching={filterResult !== null}
              />
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
