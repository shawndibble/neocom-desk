/**
 * ESI OAuth scopes for Neocom Desk v1. Reads by design (see CONTEXT.md), with
 * three narrow, user-triggered writes: `esi-mail.organize_mail.v1` marks a
 * mail read on ESI when it's opened here, `esi-calendar.respond_calendar_events.v1`
 * sends an RSVP, and `esi-mail.send_mail.v1` sends a reply or forward. Every
 * other scope below is a read — `esi-planets.manage_planets.v1` included,
 * whatever its name says.
 * `esi-markets.structure_markets.v1` (issue #538) is opt-in only — behind the
 * `structureMarkets` group, never the Base Grant — since checking a player
 * structure's own market is a need almost nobody's orders have.
 *
 * Derived from `registry.ts`, never hand-maintained, so a scope is here only
 * because some endpoint asks for it. `e2e/support/fixtureData.ts` re-exports.
 */
import {
  ESI_REGISTRY,
  isScopeRequired,
  PERMISSIONS,
  SCOPE_GROUPS,
  type EsiEndpointSpec,
  type Scope,
  type ScopeGroup,
} from './registry';

export type { Scope };

/**
 * Widened to the interface so the optional `group` reads uniformly. Straight
 * off `ESI_REGISTRY` the values are a union of literal object types, only some
 * of which have the field at all.
 */
const SPECS: readonly EsiEndpointSpec[] = Object.values(ESI_REGISTRY);

/** Distinct scopes of the endpoints matching `belongs`, in first-declared order. */
function derive(belongs: (spec: EsiEndpointSpec) => boolean): readonly Scope[] {
  return [...new Set(SPECS.filter(belongs).map((spec) => spec.scope))].filter(isScopeRequired);
}

/**
 * The Core Grant: scopes of the endpoints that declare no Permission at all
 * (skills, skill queue, structure lookup). These belong to no Permission and
 * are never a choice — `Customize permissions` shows them checked and locked.
 */
export const CORE_GRANT: readonly Scope[] = derive((spec) => spec.group === undefined);

/**
 * The Scope Groups (Permissions) that are part of the Base Grant — also the
 * Customize permissions dialog's starting selection (issue #1522), since that
 * is the same "what does a Character get by default" question.
 */
export const DEFAULT_ON_GROUPS: readonly ScopeGroup[] = SCOPE_GROUPS.filter(
  (group) => PERMISSIONS[group].defaultOn
);

/**
 * What **every** character is asked for at sign-in: the Core Grant plus every
 * default-on Permission. The plain login and Add Character request exactly
 * this set.
 *
 * Opt-in Permissions (`corp`, `structureMarkets`) are excluded by design
 * (issue #295, issue #538). Registering a corp endpoint the ordinary way
 * would put "read your corporation's wallets, assets and members" on the
 * consent screen of the ~95% of users who hold no corp role and can never
 * exercise it — a conversion cost paid by everyone for a feature almost
 * nobody uses. `scopesForGroup` supplies the rest, per character, when they
 * ask for it.
 *
 * Order is cosmetic — the SSO authorize URL's `scope` parameter is
 * order-insensitive.
 */
export const SCOPES: readonly Scope[] = [
  ...new Set([...CORE_GRANT, ...DEFAULT_ON_GROUPS.flatMap((group) => scopesForGroup(group))]),
];

/**
 * The scopes one Scope Group (Permission) asks for, derived from the registry
 * exactly as `SCOPES` is — this file stays hand-edit-free (CLAUDE.md).
 *
 * Whole groups are requested rather than individual scopes: a character
 * granting corp access once should not be sent back to SSO the day they gain
 * a second role. `features/corp/corpScopes.ts` still judges *readiness* per
 * capability held, so a Junior_Accountant is `ready` on the wallet scopes
 * alone rather than waiting on ones their roles could never use.
 */
export function scopesForGroup(group: ScopeGroup): readonly Scope[] {
  return derive((spec) => spec.group === group);
}

const GROUP_BY_SCOPE: ReadonlyMap<string, ScopeGroup> = new Map(
  SPECS.flatMap((spec) =>
    spec.group !== undefined && isScopeRequired(spec.scope)
      ? [[spec.scope, spec.group] as const]
      : []
  )
);

/**
 * The Permission (Scope Group) a scope belongs to — the inverse of
 * `scopesForGroup`. `undefined` for a Core Grant scope (it belongs to no
 * Permission) or a scope this app does not model. Lets a surface that gates on
 * one scope name the Permission to ask for (Notification settings, issue
 * #1525). Each scope sits in exactly one Permission (`scopes.test.ts`).
 */
export function permissionForScope(scope: string): ScopeGroup | undefined {
  return GROUP_BY_SCOPE.get(scope);
}

/**
 * Whether `granted` holds every scope of `group`. A partial grant — a scope
 * added to the group after the Character granted it — reads as missing,
 * because only another Grant moves it.
 */
export function isPermissionGranted(group: ScopeGroup, granted: readonly string[]): boolean {
  const held = new Set(granted);
  return scopesForGroup(group).every((scope) => held.has(scope));
}

/** Space-joined form for the SSO authorize URL `scope` parameter. */
export const SCOPES_STRING: string = SCOPES.join(' ');

/**
 * Scopes in `previous` but not `next` — what the character revoked. Empty when
 * the grant is unchanged or *widened*: a wider grant is not a revocation and
 * must stay a no-op, or shipping a new scope would purge every user's cache on
 * their next login.
 *
 * Plain strings, not `Scope`: a JWT's `scp` claim carries whatever CCP put
 * there, and a scope this app does not model (renamed upstream, granted to the
 * same client elsewhere) must still count as removed — filtering through the
 * registry would re-open the leak this closes. By the same reasoning an empty
 * `next` against a populated `previous` is a full revocation and purges.
 *
 * Pure: order-independent, deduplicated, no I/O. Dexie work is in
 * `cachePurge.ts`.
 */
export function revokedScopes(previous: readonly string[], next: readonly string[]): string[] {
  const granted = new Set(next);
  return [...new Set(previous)].filter((scope) => !granted.has(scope));
}
