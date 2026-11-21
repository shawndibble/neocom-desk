# Scope decisions — Verify page shows the payments credited (issue #4066)

_Recorded 2026-10-18 · issue #4066._

- **The verify read returned only the payments credited to its calendar bill.** The callable ran the Miner's whole allocation and returned, per payment, the part that landed on that bill. Superseded by decisions 20261119-054513 and 20261120-235011: a verify link opens a Late notice, which takes no money, and the page leads with what the Miner owes now on their Running account.
- **The allocation is mirrored in `functions/src/corpTaxBookEngine.ts`.** `functions/` cannot import `src/`, so the engine is copied there and pinned by `functionsMirror.test.ts`, like the other engine mirrors.
- **Dismissal credits on the verify read cover record and Miner scopes only.** Moon and Extraction dismissals need observed-row metadata the read does not load, so days dismissed by moon or Extraction can show payments allocated as if they were still owed. Revisit if officers use those scopes on billed days.
- **Names are optional on the notice.** The page reads `corporationName`, `minerName` and `refineryNames` when the issuing client stored them on the Late notice; otherwise it names the corporation from public ESI and shows "Refinery <id>". The guest has no session, so structure names cannot be looked up by the page.
- **A closed account is `miners/{id}.closedAt`.** The page prints a note when it is set.
- **The route is a public link route.** `/corp-tax-book/verify/:token` sits outside `RequireCharacter`, registers no service worker and skips the update wait, like `/s` and `/communities/join`. Analytics and Sentry report the route pattern, never the token.
