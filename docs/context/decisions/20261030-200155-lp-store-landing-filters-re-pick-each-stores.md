# Scope decisions — LP Store landing filters re-pick each store's best offer

_Recorded 2026-10-30. Owner's pick (option 2A) on the LP Store landing mockup._

- **The landing has two views, Stores and Offers, under one search box and one filter set.** Stores ranks every LP Store by its market **LP Value**; Offers lists every offer of every store, ranked by ISK/LP. Sorted by Store (nearest first) with a query, Offers is the item-first search of #2873, which it replaces.
- **Offer-level filters re-pick a store's Best offer.** In the Stores view, Sells at least, No turn-ins, I can afford and Category decide which of a store's offers its Best offer column may name; a store none of whose offers pass shows no best offer. Store-level filters (Faction, Distance, Stores I hold LP with, Hide Faction Warfare, the search box) decide which stores are listed.
- **LP Value is never filtered.** The column is the glossary's LP Value — each store's market value, priced for no particular pilot — the same figure Build Plans and Appraisal use. Filtering it would give one store two LP Values.
- **"Faction Warfare" means the four empire militias** (ESI's `militia_corporation_id`). Pirate insurgency stores carry no militia corporation and get no tag.
- **Rules out:** a per-store "re-ranked LP Value" under the filters, and a row cap on either view.
