# Scope decisions — One Payee per corporation or player, merged at read (issue #6308)

_Recorded 2026-11-17 · issue #6308._

- **Merge at read; stored records stay per Character.** Payees that share an EVE entity and kind (verified), or an identical name (unverified, never into a verified one), read as one in every All-characters view: lists, filters, pickers, balances, Settle up, the Overview. Not an account-level Payee set: that changes sync, Assignments, ledger moves and delete, and dev and prod share Firestore. No data change; additive.
- **The group's primary is its lowest record id.** Stable across views and Character filters. An Assignment on any record counts toward the group.
- **Terms that differ are shown, never dropped.** Manage Payees lists one button per distinct terms (tax %, Trade Hub); the pilot's pick is copied to every record (`applyPayeeTerms`). That is also how existing duplicates are merged. Default Systems stay per Character, so a Default System one Character holds still routes that Character's ore.
- **Edit and delete act on the whole group.** Saving the primary copies name, rate, hub and link to its siblings; deleting removes every record, moving entries to the chosen Payee.
