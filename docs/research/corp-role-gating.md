# Corp roles vs ESI: what a Character with the scope but no role gets

Issue #4739. Research only; no gating changed. Source of truth for the role
column is `x-required-roles` in https://esi.evetech.net/meta/openapi.json
(fetched 2026-10-22).

## What ESI does without the role

The spec documents the role gate but declares no 403 response on any corp route
(only `200` and `default`). The established behaviour, which the app already
encodes (`features/corp/corpAuthFailure.ts`, `esi/errors.ts`), is that a
Character holding the scope but not the role gets **HTTP 403, no data**, not an
empty list and not a partial list. It does not trim results to what the role
allows. We did not confirm this against the live API here: it needs a token for
a role-less corp member, and a probe would add to the ESI error count. The
first 403 a role-less Character takes in production should be treated as the
confirmation.

## Endpoint x no-role table

| Endpoint (corp)                             | ESI `x-required-roles`        | `corpRoles.ts` capability            | Matches? | No-role result                                                                   |
| ------------------------------------------- | ----------------------------- | ------------------------------------ | -------- | -------------------------------------------------------------------------------- |
| wallets, wallets/{d}/journal, /transactions | Accountant, Junior_Accountant | `canReadWallet`                      | yes      | 403                                                                              |
| divisions                                   | **Director**                  | gated by `canReadWallet`             | **no**   | 403 for an Accountant                                                            |
| orders, orders/history                      | Accountant, Trader            | `canReadOrders`                      | yes      | 403                                                                              |
| contracts, contracts/{id}/items, /bids      | none                          | `canReadContracts` (open to members) | yes      | 200, only contracts where the corp is issuer, acceptor or assignee, last 30 days |
| assets (+ locations, names)                 | Director                      | `canReadAssets`                      | yes      | 403                                                                              |
| blueprints                                  | Director                      | `canReadBlueprints`                  | yes      | 403                                                                              |
| industry/jobs                               | Factory_Manager               | `canReadIndustry`                    | yes      | 403                                                                              |
| structures                                  | Station_Manager               | `canReadStructures`                  | yes      | 403                                                                              |
| mining/extractions                          | Station_Manager               | `canReadMoonExtractions`             | yes      | 403                                                                              |
| mining/observers (+ {id})                   | Accountant                    | `canReadMiningLedger`                | yes      | 403                                                                              |
| membertracking                              | Director                      | `canReadMembers`                     | yes      | 403                                                                              |
| members                                     | none                          | not gated (only the ids)             | yes      | 200                                                                              |
| roles (own corp roster)                     | none                          | not gated                            | yes      | 200                                                                              |
| roles/history, titles, members/titles       | Director                      | `canReadRoleAudit`                   | yes      | 403                                                                              |
| starbases (+ {id})                          | Director                      | `canReadStarbases`                   | yes      | 403                                                                              |
| customs_offices                             | Director                      | `canReadCustomsOffices`              | yes      | 403                                                                              |

Empty role lists in `ROLES_FOR_CAPABILITY` (`canReadAssets`, `canReadBlueprints`,
`canReadStarbases`, `canReadCustomsOffices`, `canReadRoleAudit`, `canReadMembers`)
are correct: each is Director-only and the Director clause covers it.
`canReadContracts: []` is also correct, and is the one capability the map
deliberately treats as "every member" (`OPEN_TO_MEMBERS`).

## Where the app does not check a role

1. **Contracts `corpAvailable`** (`src/routes/Contracts.tsx:163`) is scope-only.
   That is right for ESI: no role is required, so a role-less member reads a
   real (possibly short) list. The Market orders picker is role-gated because
   `/orders` genuinely is. The two differ because the endpoints differ, not
   because one is a bug.
2. **`getCorporationDivisions`** is Director-only but is read for the wallet
   (`features/corp/wallet.ts`, overview wallet widget) under `canReadWallet`.
   An Accountant who is not a Director takes a 403 on every wallet load and the
   wallet shows "Division 3" instead of the corp's division names. It is one
   wasted, always-failing request per load and counts toward the ESI error limit.
3. Every other `corporation` option on `CharacterFilterControl` or `/corp/*`
   page already sits behind `useCorpAccess` / `useCorpRouteGate` capabilities.

## Recommendation

One rule: the Corporation option and corp pages show when the Character holds
the scope **and** ESI's `x-required-roles` for that read is satisfied, decided
only by `corpCapabilities`. Where ESI names no role, scope alone suffices. A
Character with the scope but not the role sees no Corporation option (hide,
don't lock, GLOSSARY round 35); on a direct `/corp/*` link, `CorpDenied` names
the role.
