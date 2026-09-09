# Scope decisions — BPC search matches on the name minus its shared Blueprint suffix

_Recorded 2026-09-08._

- **A query is matched against the name with its trailing "Blueprint"
  removed.** `rankedSearch` ends in a substring test, and every entry in this
  corpus is named "… Blueprint" — so "b", "lu" or "print" matched all ~2,900
  types at once, and the table filled with the first `TYPE_SEARCH_LIMIT` of
  them. Ranking could not save it: the matches were real, just meaningless.
  Reported from use as "what is with all these other things?" — a Buzzard
  search showing Heron, Crucifier, Bellicose and Burst Jammer.

  The suffix is dropped from both sides, so "Rifter Blueprint" typed in full
  still resolves, and it is never dropped when nothing would survive it — a
  type genuinely called "Blueprint" stays matchable rather than becoming
  unreachable.

- **The autocomplete gets its own ground.** It was a plain list flush against
  the filter bar and read as page furniture; the user reported not knowing it
  was there. It now sits inset on `panel-2` behind an accent micro-heading.
  Still not a floating combobox — that trade is unchanged (see the #608
  decision) — the fix here is contrast, not mechanism.

  This matters more than presentation: _not_ picking a suggestion is exactly
  what falls back to the free-text path, so an autocomplete nobody sees routes
  people into the worse of the two behaviours.

- **A row opens the whole contract, not just the blueprint line.** Contracts
  bundle, and the table shows one item per row, so "what else is in this?" had
  no answer anywhere in the UI.

- **Item lines come from ESI's public route, not the character-scoped one.**
  `/contracts/public/items/{contract_id}` needs no scope, which is what makes
  detail possible at all: these are contracts no character here is party to,
  and `/characters/{id}/contracts/{id}/items` cannot serve them. The response
  gets its own `PublicContractItem` type rather than reusing `ContractItem` —
  the public route carries the blueprint attributes a buyer shops on (ME/TE,
  runs, `is_blueprint_copy`) and omits `is_singleton`, so one shared interface
  would mean fields mandatory on one route and absent on the other.

  Cached under `GLOBAL_CACHE_CHARACTER_ID`: a public contract belongs to no
  character, and twenty alts opening the same one should read a single row.
  Only the first page of 1,000 lines is read — a contract longer than that is
  not one a buyer browses, and a partial list beats refusing to open.
