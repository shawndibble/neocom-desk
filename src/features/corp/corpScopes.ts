/**
 * The other half of the corp gate: which OAuth scopes each capability needs.
 *
 * Split from `engine/corpRoles.ts` on purpose. Role -> capability is pure game
 * logic and lives in the engine, which `CLAUDE.md` forbids from importing
 * `esi/registry.ts`; capability -> scope is an ESI concern and lives here.
 *
 * The mapping below is a *selection* from the registry, not a second copy of
 * it. #295 registered all seven corp scopes under the opt-in `corp` group, and
 * typing these as `Scope` — the union `esi/registry.ts` derives — makes an
 * unregistered or misspelled string a compile error; `corpScopes.test.ts` adds
 * that every one of them is in `scopesForGroup('corp')`. What cannot be
 * derived is which capability needs which, because a *capability* is a
 * role-shaped idea, not an endpoint-shaped one — several corp endpoints share
 * a scope and answer to different roles.
 */
import { CORP_CAPABILITIES, type CorpCapabilities, type CorpCapability } from '@/engine/corpRoles';
import type { Scope } from '@/esi/registry';

/**
 * The scopes each capability's endpoints require, from
 * https://esi.evetech.net/meta/openapi.json.
 *
 * Two capabilities need more than one, and both matter: without
 * `read_divisions` a corp wallet renders as "Division 3" rather than the name
 * the corp gave it, and `membertracking` answers nothing useful without the
 * membership list beside it. Naming only one scope each would let
 * `missingCorpScopes` under-report and call a Character `ready` for a surface
 * that is still half-blind.
 *
 * `esi-industry.read_corporation_mining.v1` was registered by #295 with no
 * capability claiming it. The moon-chunk clock is one of the corp board's item
 * kinds (#296), so `canReadMoonExtractions` now claims it — every registered
 * corp scope is spoken for.
 */
export const CORP_SCOPES_FOR_CAPABILITY: Readonly<Record<CorpCapability, readonly Scope[]>> = {
  canReadWallet: ['esi-wallet.read_corporation_wallets.v1', 'esi-corporations.read_divisions.v1'],
  canReadStructures: ['esi-corporations.read_structures.v1'],
  /**
   * Its own entry rather than a second scope on `canReadStructures`, even
   * though `Station_Manager` opens both: keyed per capability, a Character
   * missing only this one is reported as missing only this one.
   */
  canReadMoonExtractions: ['esi-industry.read_corporation_mining.v1'],
  canReadMembers: [
    'esi-corporations.track_members.v1',
    'esi-corporations.read_corporation_membership.v1',
  ],
  canReadIndustry: ['esi-industry.read_corporation_jobs.v1'],
};

/**
 * Every scope the held capabilities need, deduplicated and in capability order.
 *
 * Keyed on capability rather than on "all corp scopes": a Factory_Manager who
 * is not an Accountant can never use the corp wallet scope, so counting it as
 * missing would hold them at `roles-without-grant` over a permission their
 * roles make useless.
 */
function requiredCorpScopes(capabilities: CorpCapabilities): readonly Scope[] {
  const required = new Set<Scope>();
  for (const capability of CORP_CAPABILITIES) {
    if (!capabilities[capability]) continue;
    for (const scope of CORP_SCOPES_FOR_CAPABILITY[capability]) required.add(scope);
  }
  return [...required];
}

/**
 * Required corp scopes absent from `granted`. Plain strings on the way in,
 * because a JWT's `scp` claim carries whatever CCP put there — the same reading
 * `missingScopesForRoute` and `revokedScopes` give it.
 */
export function missingCorpScopes(
  capabilities: CorpCapabilities,
  granted: readonly string[]
): readonly Scope[] {
  const held = new Set(granted);
  return requiredCorpScopes(capabilities).filter((scope) => !held.has(scope));
}
