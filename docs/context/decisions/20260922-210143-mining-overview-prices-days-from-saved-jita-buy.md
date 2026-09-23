# Scope decisions — Mining Overview prices days from saved Jita buy/sell snapshots (issue #1279)

_Recorded 2026-09-22 · issue #1279._

- **Default basis is the Jita buy price saved on the day mined; Jita sell is the other mined-day option.** ESI market history only carries a daily average, which mixes buy- and sell-side trades and so is neither the price a pilot gets selling into buy orders nor the sell-order price. It replaces the Overview's earlier "mined-date average" basis. The Tax tab's Jita-buy-of-Compressed pricing (`20260906-081307-…`) is unchanged.
- **The app saves its own daily Jita book.** Each Overview load fetches the live Fuzzwork aggregate (`buyMax`, `sellMin`) for every priced type — each ore's pricing type (Compressed where one exists) and every reprocessing material — and saves it as that EVE/UTC day's snapshot; a later load the same day overwrites per type. 90 days kept, in its own Dexie table (`jitaPriceSnapshots`). Today's snapshot is saved before prices are read, so today prices as "saved".
- **Fallback, per type per day: saved → ESI daily average → live.** The live step applies only to today and yesterday (before ESI publishes the day); an older day with no history is a type that does not trade, not one waiting on downtime, and is left unpriced rather than valued at today's price.
- **"Now" values every day at today's live price, on whichever side was last picked.** It answers "what is this worth if I sell it now", not "what was it worth then". No fallback: a side with no live orders is unpriced.
- **Row tag = the weakest source among the row's ore lines**: saved < live < daily average. A daily average is not the chosen side at all; live is the right side but not the day's. Materials do not affect the tag (the Value column is raw ore). A day's chart colour uses the same rule across its rows.
- **Every basis is precomputed in the snapshot** (four valuations per row), so switching basis never refetches.
