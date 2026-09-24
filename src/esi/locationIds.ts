/**
 * The lowest id CCP issues to an Upwell structure — the one fact behind every
 * "is this an NPC station/solar system, or a player structure" split in the
 * app: everything below this floor resolves through the ordinary bulk
 * lookups (`/universe/names`, Fuzzwork aggregates), and everything at or
 * above it needs its own per-id path, because Upwell structures have no bulk
 * endpoint at all and an unrelated public service (Fuzzwork) never carries
 * their data.
 *
 * Splitting the other way round — try the bulk call first, let a structure id
 * fail — is not an option: `/universe/names` answers 404 for the *whole*
 * batch if even one id in it is unresolvable, so a single structure id mixed
 * in would cost every other location name in the same call.
 *
 * Previously duplicated as a private const in `features/corp/assets.ts` and
 * `features/corp/members.ts` (each with its own copy of this same comment);
 * hoisted here rather than adding a third copy for `marketOrderUndercutDomain`
 * (issue #1423), which needs the same split to drop structure-parked orders
 * before ever asking Fuzzwork about them — the page's own `orderCompetition.ts`
 * already does the equivalent split the other way (structures go through
 * `loadStructureCompetition`, never `loadStationBestPrices`).
 */
export const UPWELL_STRUCTURE_ID_FLOOR = 1_000_000_000_000;
