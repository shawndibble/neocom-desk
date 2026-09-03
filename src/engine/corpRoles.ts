/**
 * In-game corporation roles, mapped to what the Character can actually *see*.
 *
 * Corp data is gated on a second axis the rest of the app doesn't have: CCP
 * role-gates the corporation endpoints server-side, so a Character can grant
 * every corp scope and still take a permanent 403. Scopes are knowable
 * offline; roles are not — which is why they get their own read
 * (`features/corp/roles.ts`) and this mapping.
 *
 * Capability, never a raw role string, is what leaves this module. Consumers
 * ask "can this Character read the corp wallet", not "is this Character an
 * Accountant" — so the Junior_Accountant case and the Director case below are
 * decided once, here, instead of at every call site.
 *
 * Pure and free of any ESI import by design (CLAUDE.md): plain strings in,
 * booleans out. `src/engine` must never reach `esi/registry.ts`, so the
 * capability -> *scope* half of the story lives in `features/corp/corpScopes.ts`
 * instead.
 */

/** What a Character can read, independent of which scopes were granted. */
export interface CorpCapabilities {
  /** GET /corporations/{id}/wallets, /wallets/{division}/journal, /transactions. */
  canReadWallet: boolean;
  /** GET /corporations/{id}/structures. */
  canReadStructures: boolean;
  /**
   * GET /corporation/{id}/mining/extractions — the moon-chunk schedule.
   *
   * Separate from `canReadStructures` even though the two share a role: they
   * are separate reads behind separate scopes, and a capability names what a
   * Character can *read*. Folding the moon drill into "structures" would make
   * that capability stand for something it does not, and would leave the moon
   * panel with nothing of its own to gate on.
   */
  canReadMoonExtractions: boolean;
  /** GET /corporations/{id}/membertracking. */
  canReadMembers: boolean;
  /** GET /corporations/{id}/industry/jobs. */
  canReadIndustry: boolean;
}

export type CorpCapability = keyof CorpCapabilities;

/**
 * Every capability, for consumers that must handle each one exhaustively
 * (`corpScopes.ts` maps each to the scopes it needs). Typed as
 * `readonly CorpCapability[]` so adding a field to `CorpCapabilities` without
 * adding it here fails `corpRoles.test.ts` rather than silently dropping a
 * capability from the scope prompt.
 */
export const CORP_CAPABILITIES: readonly CorpCapability[] = [
  'canReadWallet',
  'canReadStructures',
  'canReadMoonExtractions',
  'canReadMembers',
  'canReadIndustry',
];

/** The answer for a Character with no roles — and the shape of "not loaded yet". */
export const NO_CORP_CAPABILITIES: CorpCapabilities = {
  canReadWallet: false,
  canReadStructures: false,
  canReadMoonExtractions: false,
  canReadMembers: false,
  canReadIndustry: false,
};

/**
 * Which roles each capability's endpoints accept, transcribed from the
 * `x-required-roles` extension on https://esi.evetech.net/meta/openapi.json —
 * ESI's own machine-readable statement of the server-side gate, not a guess
 * from prose. Any one of the listed roles suffices.
 *
 * `Director` is deliberately absent here and handled separately below.
 */
const ROLES_FOR_CAPABILITY: Readonly<Record<CorpCapability, readonly string[]>> = {
  canReadWallet: ['Accountant', 'Junior_Accountant'],
  canReadStructures: ['Station_Manager'],
  // Same role as the structure list, straight from `x-required-roles` on the
  // mining/extractions path. Issue #296's brief calls this role
  // `Structure_manager`; that string appears nowhere in ESI's spec, and using
  // it would have denied the moon board to every user entitled to it.
  canReadMoonExtractions: ['Station_Manager'],
  canReadMembers: [],
  canReadIndustry: ['Factory_Manager'],
};

/**
 * A Director implicitly holds every other role in game, and ESI does **not**
 * expand that in the response — a Director's `roles` array is frequently just
 * `["Director"]`. Listing it as an ordinary entry against each capability in the
 * table above would deny corp data to precisely the users who have all of it the
 * moment a new capability forgot to repeat it, so it satisfies every capability
 * on its own instead. It is also the only role `membertracking` accepts, which
 * is why `canReadMembers` has no other entry.
 */
const DIRECTOR = 'Director';

/**
 * What `roles` lets this Character read.
 *
 * Takes the corporation-wide role list only — never `roles_at_hq` /
 * `roles_at_base` / `roles_at_other`, whose grants are scoped to one office and
 * do not open the corporation-wide endpoints these capabilities stand for.
 *
 * Unrecognised strings are ignored rather than rejected: CCP extends the role
 * enum without notice, and a role this app has never heard of must not stop the
 * ones it has from resolving.
 */
export function corpCapabilities(roles: readonly string[]): CorpCapabilities {
  const held = new Set(roles);
  const isDirector = held.has(DIRECTOR);

  const capabilities = { ...NO_CORP_CAPABILITIES };
  for (const capability of CORP_CAPABILITIES) {
    capabilities[capability] =
      isDirector || ROLES_FOR_CAPABILITY[capability].some((role) => held.has(role));
  }
  return capabilities;
}

/**
 * Whether any corp surface is readable at all. The rendering rule keys off
 * this: a Character with no capability gets no corp UI, not a locked one
 * (CONTEXT.md round 35).
 */
export function hasAnyCorpCapability(capabilities: CorpCapabilities): boolean {
  return CORP_CAPABILITIES.some((capability) => capabilities[capability]);
}
