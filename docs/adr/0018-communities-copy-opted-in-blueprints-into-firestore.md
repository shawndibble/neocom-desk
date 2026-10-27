# 0018 — Communities copy opted-in blueprints into a membership-gated Firestore collection

## Status

Accepted (2026-10-11)

## Context

A player building a complete BPO library wants to see which BPOs the people
they play with hold, and to use those as a free source in BPC Sourcing and
Build Plans. That data is Character data from ESI
(`esi-characters.read_blueprints`), and the glossary's **API-Derived Data**
says it is cached per device and "never synced through the backend".
`firestore.rules` agrees: every per-Character collection is readable only by
its own uid, and the only shared collections (public contract offers, LP
offers, market history, workbench fits, Share Links) hold public data or data
reachable only by an unguessable id.

Sharing a blueprint with another player cannot work without a server both
players can reach, and the reader is someone other than the Character who
owns the data. It is also data about where a player keeps assets, so the
usual objection to storing it applies.

## Decision

Blueprint libraries are copied into Firestore only when a Member opts in, per
Community, per blueprint (or category). That makes this the first collection
whose reads are gated by Community membership instead of by uid or by public
visibility. Rules grant read to signed-in Characters who are Members of that
Community, and write only to the owning Character, under the `ownerHash` guard
every per-Character collection already uses.

Writes stay low: the client keeps the hash of what it last pushed and pushes
again only when the blueprint list's hash changes. Each Member's library
carries its pushed-at time so readers can show it, and mark it stale after 30
days.

Leaving or being removed deletes that Member's shared data in the same
operation; there is no soft hide. A Character logged out of a device is
offered the same removal. The scheduled `purgeStaleAccounts` function already
removes inactive Characters' data and must cover this collection too.

Everything else Character-derived stays device-local. This is a deliberate,
opted-in exception to the **API-Derived Data** rule, not a change to it.

## Consequences

- `docs/ARCHITECTURE.md`'s statement that Firebase holds only per-character
  sync data and public caches needs a third category: membership-gated shared
  data.
- Location data (station or structure plus system) is stored and readable by
  every Member. Containers and hangars are never stored, so the exposure is
  bounded to what a Member picked.
- A stale Member's offers remain visible. The badge, not deletion, handles
  staleness, so a returning player's data is intact.
- Rules for this collection need emulator-backed tests, since a mistake here
  leaks one player's asset locations to another, which is worse than the same
  mistake in public-data collections.
- Fittings and corp-owned blueprints can reuse the same membership gate when
  they follow.
