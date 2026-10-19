# Scope decisions — Auto-grouping covers the syncing officer's own app account (issue #4194)

_Recorded 2026-10-18 · issue #4194._

- **D26 automatic grouping runs in the officer's sync, for the officer's own app account only.** EVE exposes no account identity (GLOSSARY.md "Account" is UI-level, with no server identity), so the only Characters the app can know share an account are those in the syncing officer's own Dexie. The sync groups those that are in the book's corporation and not yet in a Miner. Other members' alts are grouped by an officer by hand (Miner page, "Group with…"). Rules out inventing an account identity on the server.
- **An unlink is remembered in the book.** A Character an officer unlinks from a group is written to the book (`meta/declinedAutoGroup`, by the `unlink` edit), so no officer's sync re-groups it. Grouping it on purpose (`regroupMiner`) lifts the mark.
