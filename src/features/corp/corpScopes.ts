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
 * The scope each capability's endpoints require, from
 * https://esi.evetech.net/meta/openapi.json. One scope each today; the type is
 * a list so a capability that grows a second requirement does not change shape.
 */
export const CORP_SCOPES_FOR_CAPABILITY: Readonly<Record<CorpCapability, readonly Scope[]>> = {
  canReadWallet: ['esi-wallet.read_corporation_wallets.v1'],
  canReadStructures: ['esi-corporations.read_structures.v1'],
  canReadMembers: ['esi-corporations.track_members.v1'],
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
