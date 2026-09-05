# Scope decisions (round 44) — corp assets, division-first (#330)

_Recorded 2026-09-03 · issue #330._

- **`/corp/assets`, gated on `canReadAssets`, is a new page under `/corp` —
  not a panel, not a switch bolted onto `/assets`.** Round 41 already ruled
  the switch out; this is the surface it named. Same hide-whole rule as
  `/corp/members` (round 35): `state !== 'ready' || !capabilities.canReadAssets`
  renders the reason, never a lock, and the route is `UNGATED` in
  `routeScopes.ts` for the identical reason `/corp/members` is — a scope
  declaration there would offer a re-login to everyone who is merely not a
  Director, which is almost everybody.
- **`canReadAssets` now claims `esi-corporations.read_divisions.v1` too
  (option 1 of the two the issue offered), and it costs no one a re-grant.**
  Naming a division ("SRP" rather than "Division 3") needs the `hangar` half
  of `GET /corporations/{id}/divisions`, and `corpScopes.ts` previously
  claimed that scope only under `canReadWallet` — which would have made the
  capability→scope map lie about what this surface actually reads. The scope
  is free rather than a second grant: `canReadAssets` answers to `Director`
  alone, and `corpCapabilities` grants a Director every capability, so a
  Character who can reach `/corp/assets` at all already holds `canReadWallet`
  too and already needed the scope through that entry. `corpScopes.test.ts`
  asserts the required set names it once, not twice, for a Director. The
  alternative (numbered-division fallback, never claiming the scope) was
  the other option on the table and was not taken — division names were
  worth a scope claim that turned out to be free.
- **Division is its own pure grouping (`engine/corp/assetDivisions.ts`), not
  a new case in `engine/assetTree.ts`.** Round 41 already established why:
  no level between a station and a container, and no `item_id` to key a
  division on. `groupCorpAssets` takes a division-shaped input instead —
  seven hangar divisions (`HANGAR_DIVISIONS`, `CorpSAG1`..`CorpSAG7`) always
  present in the output, in order, even empty, because "seven hangar
  divisions as the top axis" means seven regardless of what a corporation
  happens to have stored where.
- **The four corp-only `location_flag` values get sibling groups, shown only
  when non-empty, in a fixed order after the seven divisions — not a home
  inside the division axis, and not dropped.** `OfficeFolder`,
  `CorpDeliveries`, `Impounded` and `AssetSafety` are not one of the seven
  numbered divisions; folding them into that axis would misrepresent what a
  division is. They render as their own `Disclosure` groups, each with a
  fixed i18n label, and — unlike the seven divisions — only when the
  corporation actually has something in them, since unlike the divisions
  they are not a promised, always-seven axis.
- **An unrecognised `location_flag` buckets under `other` rather than being
  dropped.** CCP extends the flag enum without notice (the same lesson round
  39 drew from a role string, applied here to a data value); a silently
  vanished row on the one page whose job is "what does the corporation own"
  is worse than an `Other` bucket nobody asked for. `assetDivisions.test.ts`
  asserts this directly with a made-up flag.
- **`truncated` renders as a visible note, not a silently short list —
  matching `/assets`' own two-part treatment exactly, not just its shared
  half.** `getCorporationAssets` shares `MAX_ASSET_PAGES` with the character
  endpoint, and a corporation's holdings are the likelier of the two to hit
  it. `/assets` pairs the shared `common.incompleteTitle` with a
  page-specific count (`assets.fetchTruncatedNotice`, "Only the first
  {{shown}} assets were fetched"); `/corp/assets` does the same with its own
  `corp.assets.fetchTruncatedNotice` and `assetsShown` (the count of assets
  the truncated read actually returned) rather than stopping at the shared
  string alone.
- **A failed assets read and a genuinely empty corporation render two
  different empty states, not one.** `loadCorporationAssets` returning
  `{ cached: null }` (offline, uncached, or a 403 the role gate swallowed)
  collapses to nothing if read as "zero assets" — `common.loadFailedTitle`
  covers that case, `corp.assets.empty` covers the case where the read
  succeeded and the corporation truly owns nothing. `CorpAssets.test.tsx`
  exercises both.
- **Type names go through `loadTypeNames` (SDE snapshot first), location
  names through the same Upwell-structure/`/universe/names` split
  `features/corp/members.ts`'s `resolveLocationNames` already uses** —
  written again in `features/corp/assets.ts` rather than extracted into a
  shared module, deliberately: the two are structurally identical but the
  members feature is stable, tested code this ticket has no reason to touch,
  and the duplication is small and explicitly cross-referenced in a comment.
  Unlike the roster's version, there is no 1000-id batch chunking — a
  corporation's distinct asset locations are the offices and structures it
  holds, not one per member, so a single `/universe/names` call is always
  enough.
- **Out of scope, deliberately: container and location naming beyond what is
  already resolved.** `POST /corporations/{id}/assets/names` and
  `/assets/locations` are not in `ESI_REGISTRY` and this ticket does not add
  them — the surface ships with item type names, quantities and the
  top-level location name each asset row already carries, nothing deeper.
