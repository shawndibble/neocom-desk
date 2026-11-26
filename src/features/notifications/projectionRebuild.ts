import type { ProjectionRow } from '@/engine/projection';
import { mapWithConcurrencyLimit, ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';
import { hasEventScope, type NotificationEventId } from './events';
import {
  EVE_ALLOWED_TYPES,
  enabledEveTypesForBrowser,
  isEventEnabledFor,
  type EventEnabledMap,
} from './eventSelection';
import type { PollDependencies } from './foregroundPoller';
import { POLL_DOMAINS, type PollDomain } from './pollDomains';
import type { PollerState } from './pollerState';
import { useSeenEveTypesStore } from './seenEveTypes';
import { serverRegistrationsByCharacter } from './serverEvents';

export type ProjectionRebuildDependencies = Pick<
  PollDependencies,
  | 'now'
  | 'characters'
  | 'grantedScopes'
  | 'domainState'
  | 'masterEnabled'
  | 'browserChannelEnabled'
  | 'eventPrefsFor'
  | 'eveTypePrefsFor'
  | 'permission'
  | 'uploadProjection'
  | 'serverInputsFor'
>;

const PROJECTING_DOMAINS = POLL_DOMAINS.filter((domain) => domain.projection);

function mayProject(
  eventId: NotificationEventId,
  scopes: ReadonlySet<string>,
  eventPrefs: EventEnabledMap
): boolean {
  return hasEventScope(eventId, scopes) && isEventEnabledFor(eventPrefs, eventId, 'browser');
}

export async function enabledEveTypesByCharacter(
  deps: Pick<
    ProjectionRebuildDependencies,
    | 'characters'
    | 'grantedScopes'
    | 'eveTypePrefsFor'
    | 'masterEnabled'
    | 'browserChannelEnabled'
    | 'permission'
  >
): Promise<Map<number, string[]>> {
  const [masterEnabled, browserAllowed, characters] = await Promise.all([
    deps.masterEnabled(),
    deps.browserChannelEnabled(),
    deps.characters(),
  ]);
  const browserEnabled = masterEnabled && browserAllowed && deps.permission() === 'granted';
  const seenStore = useSeenEveTypesStore.getState();
  await seenStore.hydrate();
  const seen = useSeenEveTypesStore.getState().value;

  const byCharacter = new Map<number, string[]>();
  await mapWithConcurrencyLimit(characters, ESI_FANOUT_CONCURRENCY, async (character) => {
    byCharacter.set(character.characterId, []);
    if (!browserEnabled) return;
    const [scopes, typePrefs] = await Promise.all([
      deps.grantedScopes(character.characterId),
      deps.eveTypePrefsFor(character.characterId),
    ]);
    if (!hasEventScope('eveNotification', scopes)) return;
    byCharacter.set(
      character.characterId,
      enabledEveTypesForBrowser(typePrefs, [
        ...EVE_ALLOWED_TYPES,
        ...(seen[String(character.characterId)] ?? []),
      ])
    );
  });
  return byCharacter;
}

let queue: Promise<unknown> = Promise.resolve();

export function rebuildProjection(
  deps: ProjectionRebuildDependencies,
  baselines?: ReadonlyMap<PollDomain, PollerState<unknown>>
): Promise<void> {
  const run = queue.then(() => rebuildOnce(deps, baselines));
  queue = run.catch(() => {});
  return run;
}

async function rebuildOnce(
  deps: ProjectionRebuildDependencies,
  baselines: ReadonlyMap<PollDomain, PollerState<unknown>> | undefined
): Promise<void> {
  const [masterEnabled, browserAllowed, characters] = await Promise.all([
    deps.masterEnabled(),
    deps.browserChannelEnabled(),
    deps.characters(),
  ]);
  const browserEnabled = masterEnabled && browserAllowed && deps.permission() === 'granted';

  const domainBaselines = await Promise.all(
    PROJECTING_DOMAINS.map(
      async (domain) =>
        [domain, baselines ? baselines.get(domain) : await deps.domainState(domain).prev()] as const
    )
  );
  const nowMs = deps.now();
  const rowsByCharacter = new Map<number, ProjectionRow[]>();

  await mapWithConcurrencyLimit(characters, ESI_FANOUT_CONCURRENCY, async (character) => {
    const rows: ProjectionRow[] = [];
    rowsByCharacter.set(character.characterId, rows);
    if (!browserEnabled) return;
    const [scopes, eventPrefs] = await Promise.all([
      deps.grantedScopes(character.characterId),
      deps.eventPrefsFor(character.characterId),
    ]);
    for (const [domain, baseline] of domainBaselines) {
      const snapshot = baseline?.[character.characterId];
      if (snapshot === undefined) continue;
      if (!domain.eventIds.some((eventId) => mayProject(eventId, scopes, eventPrefs))) continue;
      const domainRows = await domain.projection!(
        character.characterId,
        character.name,
        snapshot,
        nowMs
      );
      rows.push(...domainRows.filter((row) => mayProject(row.eventId, scopes, eventPrefs)));
    }
  });

  await deps.uploadProjection(
    rowsByCharacter,
    await enabledEveTypesByCharacter(deps),
    await serverRegistrationsByCharacter(deps)
  );
}
