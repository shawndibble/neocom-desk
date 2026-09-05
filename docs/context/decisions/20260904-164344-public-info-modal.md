# Implementation notes (round 50) — Public Info Modal (issue #399)

_Recorded 2026-09-04 · issue #399._

Round 49 above set the shape and the going-forward rule; this round records
the choices its first implementation actually made, for the Contacts/Corp
Members/Contracts tickets that adopt it next:

- **Global Zustand signal store, not local `selected` state.** Every other
  detail modal in this repo (`ContractDetailModal`, `ItemDetailModal`,
  `EventDetailModal`) is opened by one route's own local state, because only
  that route ever opens it. This modal is opened from several unrelated
  features sharing one instance, so it follows `stores/authFailure.ts`'s
  shape instead: `src/stores/publicInfoModal.ts` holds
  `request: { kind, id } | null`, and `PublicInfoModal` — mounted once in
  `App.tsx` beside `WhatsNewPanel` — is the only place that renders it. A
  feature opens it via `openPublicInfoModal(kind, id)` or
  `usePublicInfoModal().open(kind, id)`.
- **Cached like `stations.ts`, not like `stores/publicInfo.ts`.** The
  existing `publicInfo.ts` store only caches `{ corporationName,
allianceName }` strings for the signed-in Character's own header and is
  not reused here — this modal needs the fuller record (ticker, member
  count, CEO) for an arbitrary looked-up entity. `features/character/
publicInfoData.ts` instead read-throughs `esi/cache.ts` under the global
  cache sentinel with `STALE_AFTER.static`, the same choice already made for
  other public, rarely-changing lookups (station/structure names).
- **CEO name resolves via `resolveNames` (`POST /universe/names`)**, not a
  second `getCharacterPublicInfo` call — `CorporationPublicInfo` only carries
  `ceo_id`, and a name is all the Corporation tab needs.
- **Opening by character id resolves the whole chain (character → its corp →
  its alliance) in one pass; opening directly by corporation or alliance id
  skips straight to that tab.** A tab only appears once its kind has actually
  entered the chain, so an alliance-less character (or corporation) never
  shows an Alliance tab at all — not a tab with an error state. Switching
  tabs never re-fetches: each tab's data is kept in local component state for
  the lifetime of one open `request`, cleared only when a new `open()` call
  changes the kind/id.
