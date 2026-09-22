/**
 * Projection rebuild (issue #1248, ADR 0010): assembles every Character's
 * whole 72-hour Projection from each domain's *saved* baseline
 * (`PollDomain.store`), applies the browser-channel filter and uploads it.
 * No ESI calls — which is what lets Settings re-upload after a toggle or
 * lead-time change without running a whole Foreground Poll. The poll calls
 * this too, after saving its baselines, handing them in directly.
 *
 * Every Character is in the upload, including ones with nothing to project:
 * `registerDeviceForWebPush` sends every Character on the device and the
 * backend replaces each one's stored Projection, so a missing entry already
 * meant "no rows" — listing it explicitly just says so.
 */
import type { ProjectionRow } from '@/engine/projection';
import { mapWithConcurrencyLimit, ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';
import { NOTIFICATION_EVENTS, type NotificationEventId } from './events';
import { isEventEnabledFor, type EventEnabledMap } from './eventSelection';
import type { PollDependencies } from './foregroundPoller';
import { POLL_DOMAINS, type PollDomain } from './pollDomains';
import type { PollerState } from './pollerState';

export type ProjectionRebuildDependencies = Pick<
  PollDependencies,
  | 'now'
  | 'characters'
  | 'grantedScopes'
  | 'domainState'
  | 'masterEnabled'
  | 'browserChannelEnabled'
  | 'eventPrefsFor'
  | 'permission'
  | 'uploadProjection'
>;

const SCOPE_BY_EVENT = new Map(NOTIFICATION_EVENTS.map((event) => [event.id, event.scope]));

const PROJECTING_DOMAINS = POLL_DOMAINS.filter((domain) => domain.projection);

/**
 * Whether a row for this event may be uploaded. A Scheduled Push is the
 * closed-app analog of the *browser* channel (it shows an OS notification),
 * so the feed column never counts: a feed-only event must not push once the
 * app closes. The live browser channel itself is checked by the caller.
 */
function projects(
  eventId: NotificationEventId,
  scopes: ReadonlySet<string>,
  eventPrefs: EventEnabledMap
): boolean {
  const scope = SCOPE_BY_EVENT.get(eventId);
  return (
    (scope === undefined || scopes.has(scope)) && isEventEnabledFor(eventPrefs, eventId, 'browser')
  );
}

/**
 * Rebuilds run one at a time, in call order: each reads preferences when it
 * starts, so a later rebuild (a newer Settings change) can never have its
 * upload overtaken by an earlier one still resolving names.
 */
let queue: Promise<unknown> = Promise.resolve();

/**
 * `baselines` is the poll's in-memory state for every domain, just saved;
 * absent (Settings), each projecting domain's baseline is read from its store.
 */
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
  if (!(await deps.masterEnabled())) return;
  const [browserAllowed, characters] = await Promise.all([
    deps.browserChannelEnabled(),
    deps.characters(),
  ]);
  const browserEnabled = browserAllowed && deps.permission() === 'granted';

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
      // Skip name resolution for a domain none of whose events could upload.
      if (!domain.eventIds.some((eventId) => projects(eventId, scopes, eventPrefs))) continue;
      const domainRows = await domain.projection!(
        character.characterId,
        character.name,
        snapshot,
        nowMs
      );
      rows.push(...domainRows.filter((row) => projects(row.eventId, scopes, eventPrefs)));
    }
  });

  await deps.uploadProjection(rowsByCharacter);
}
