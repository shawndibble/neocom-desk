# Scope decisions — Contacts Standings tab: fee marker is Trade Hub owners only (issue #2859)

_Recorded 2026-10-07 · issue #2859._

- **The "Used for fees" marker flags only Trade Hub owner corps and factions.** Other NPC stations use their own owner, which cannot be listed up front; agents never count. The tab says so in a note.
- **Refine / reprocessing is not marked.** The brief mentioned refine tax, but reprocessing v1 applies no standing (decision `20260906-180034`), so only broker fees are a fee path.
- **`/contacts` route scopes do not gain `getCharacterStandings`.** A missing standings scope shows a `GrantBanner` inside the Standings tab; it never blocks the rest of Contacts (decision `20260922-200200`).
