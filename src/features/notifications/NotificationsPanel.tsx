import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel, EmptyState, SearchInput } from '@/components/ui';
import { NotificationsDelivery } from './NotificationsDelivery';
import { NotificationEventList } from './NotificationEventList';
import type { EventRowContext } from './eventRowSupport';
import { MD_UP_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
import { useCharacters } from '@/features/character/useCharacters';
import { NOTIFICATION_EVENT_IDS, eventLabelKey, isCorpEventId } from './events';
import { corpEventsApply } from './eventGroups';
import { useNotificationPreferences, hydrateNotificationPreferences } from './preferences';
import { EVE_ALLOWED_TYPES, extraEveTypes } from './eventSelection';
import { eveTypeLabel } from './eveTypeLabel';
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
import { useGrantedScopesByCharacter } from '@/app/grantedScopes';

const SEARCH_PARAM = textParam();

const NO_SCOPES: ReadonlyMap<number, ReadonlySet<string>> = new Map();

export function NotificationsPanel() {
  const { t } = useTranslation();
  const roster = useCharacters();
  const characters = useMemo(
    () => [...roster].sort((a, b) => a.characterId - b.characterId),
    [roster]
  );
  const loadedScopes = useGrantedScopesByCharacter();
  const scopesByCharacterId = loadedScopes ?? NO_SCOPES;

  const prefsValue = useNotificationPreferences((state) => state.value);
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

  useEffect(() => {
    void refreshAppBadge();
  }, [prefsValue]);

  const { permission, refresh: refreshPermission } = useNotificationPermission();
  const [search, setSearch] = useUrlParam('search', SEARCH_PARAM);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const isDesktop = useMediaQuery(MD_UP_QUERY);

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

  const eveTypeLabels = useMemo(() => {
    const seen = [...extraTypesByCharacter.values()].flat();
    return [...new Set([...EVE_ALLOWED_TYPES, ...seen])].map((type) => ({
      type,
      label: eveTypeLabel(t, type),
    }));
  }, [extraTypesByCharacter, t]);

  const characterList = useMemo(
    () => (loadedScopes !== undefined ? characters : []),
    [characters, loadedScopes]
  );

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
        search,
        eveTypeLabels
      ),
    [orderedCharacters, eventLabels, search, eveTypeLabels]
  );
  const showCorpEvents = corpEventsApply(characterList.map((c) => c.corporationId));
  const visibleEventIds = useMemo(() => {
    const ids =
      filterResult === null
        ? NOTIFICATION_EVENT_IDS
        : NOTIFICATION_EVENT_IDS.filter((id) => filterResult.visibleEventIds.has(id));
    return showCorpEvents ? ids : ids.filter((id) => !isCorpEventId(id));
  }, [filterResult, showCorpEvents]);

  const browserBlocked = notificationsBlocked(permission);
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
                eveTypes={filterResult?.visibleEveTypes}
              />
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
