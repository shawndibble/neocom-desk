# Scope decisions — Rules exists() officer check left as is (issue #5076)

_Recorded 2026-10-25 · issue #5076._

- **The `isOfficer()` `exists(officerPath())` check in `firestore.rules` stays.** Member queries on a book's collections are `isOfficer() || isOwnLine()`. A rule cannot see the query's filter, so a member's own-lines query cannot skip the officer lookup without a separate collection or a rules-visible marker — a data-model change the ticket puts out of scope. Rules evaluate `||` left to right, so putting `isOwnLine()` first would skip the lookup for members but the officer's whole-book reads would then pay it for every query instead; no net saving. Rules are unchanged.
