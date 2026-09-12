# Scope decisions — Contract Search reads the shared snapshot as its own cached copy (issue #908)

_Recorded 2026-09-12 · issue #908._

- **Contract Search gets its own read of `publicContractOffers`, cached under
  its own key (`publicContractOffersAll`), rather than BPC Search narrowing
  from one shared full-size cache entry.** This re-opens the sizing trade
  #907 settled a few hours earlier, because that decision's premise — that
  every consumer of the snapshot wants a strict subset of it — stops holding
  the moment a consumer wants all of it. The alternative considered was to
  cache the snapshot whole under `publicContractOffers` and make
  `loadPublicBpcContracts` a `bpcRowsFromContractOffers` call over that: one
  read, one cache entry, both tabs served, and a change confined to
  `syncedContracts.ts` since #907 deliberately kept that function's name and
  return type. It was rejected because it makes _every_ BPC Search user pay
  the full-corpus Dexie record (~3x what they store today) for a tab they may
  never open, and `esi/cache.ts` has no quota handling at all — a single
  oversized record is the worst shape for an IndexedDB quota ceiling, and
  hitting it would break BPC Search, a feature this ticket is not supposed to
  touch. Two independent entries keep the blast radius at zero for anyone who
  only uses BPC Search.
- **The cost this accepts, explicitly: a user who opens both tabs fetches the
  same ~124 chunk docs twice per publish cycle and stores both narrowings.**
  That is the one axis #907 moved the staleness window to 30 minutes to
  protect, so this read matches that window rather than `STALE_AFTER.default`
  for the same reason. If the doubled transfer proves to hurt in practice,
  the shared-entry design above is the recorded fallback — it is a
  single-file change, not a rewrite.
- **The Search tab mounts only while it is the active tab.** A ~3x-sized
  Firestore read firing on every `/contracts` visit — including the far more
  common one that only wants the character's own contract history — is the
  failure mode this avoids, and it is the same shape Industry already uses
  for `BpcSourcingPanel`.
- **The tab switch sits outside `Contracts.tsx`'s existing loading/reauth/
  empty chain, not inside it.** That chain answers "can we show this
  character's contracts", and every one of its branches (a `contracts` scope
  403, an empty history, a failed load) would otherwise make the Search tab
  unreachable — even though Search needs neither the scope nor the data. Only
  the History branch keeps the chain.
- **`ContractSearchPanel` is a sibling of `BpcSourcingPanel`, not a
  generalization of it.** The two overlap on type/region/price and on nothing
  else: BPC Search merges the character's owned blueprints into its results
  and filters on ME/TE/runs, both of which this tab's ticket rules out, and
  ME/TE/runs are absent — not zero — on a plain item line. Folding the two
  together would mean a filter with a mode flag and a row type that is half
  optional. What is genuinely shared is imported rather than copied:
  `loadRegionName`, `rankedSearch`, and the asking-price rule.
- **Item names come from the market catalogue
  (`public/data/market/types.json`), not `loadTypeNames`.** The slim
  `public/data/types.json` that `loadTypeNames` consults first covers only
  skill- and blueprint-referenced types, so a general contract corpus would
  send most of its ids to the batched `POST /universe/names` fan-out on every
  tab open — exactly the live traffic `readCachedTypeNames` exists to warn
  against. The market catalogue already names every published market type and
  is fetched lazily. A type the catalogue does not name falls back to
  `#<id>`, which keeps it searchable-by-id rather than dropping it.
- **No Location or Space column, unlike BPC Search.** Those need a per-row
  `locationId` resolution fan-out, which over the whole corpus is ~3x the one
  BPC Search runs; the ticket asks for item/price/region/quantity and the
  region rides along on every row for free. Rules out nothing permanent —
  adding the column later is the same `loadContractLocationInfo` call BPC
  Search already makes.
- **No column picker and no detail modal on this table.** Five columns is a
  picker with nothing to hide, and `BpcContractModal` speaks `BpcContractRow`,
  not a general offer. Both are additive later; neither is in the acceptance
  criteria. Worth noting the trap if a picker is ever added: reusing
  `bpcSearchVisibleColumns` as the `createLocalSetting` key would make BPC
  Search's `parse` reject the stored ids and silently wipe the user's
  preference.
