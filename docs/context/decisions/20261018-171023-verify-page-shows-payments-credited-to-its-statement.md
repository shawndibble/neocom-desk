# Scope decisions — Verify page shows payments credited to its Statement (issue #4066)

_Recorded 2026-10-18 · issue #4066._

- **The verify read returns only the payments credited to that Statement.** The callable runs the Miner's whole allocation (oldest first, a code pins, "not tax" reduces) and returns, per payment, the part that landed on this Statement. A donation that paid two Statements shows its own part on each page. The Miner's other Statements stay out of the response.
- **The allocation is mirrored in `functions/src/corpTaxBookEngine.ts`.** `functions/` cannot import `src/`, so `allocatePayments` is copied there and pinned by `functionsMirror.test.ts`, like the other engine mirrors. The engine's `Allocation` gained `paymentCredits` for it.
- **Dismissal credits on the verify read cover record and Miner scopes only.** Moon and Extraction dismissals need observed-row metadata the read does not load. A Statement whose days were dismissed by moon or Extraction can therefore show payments allocated as if those days were still owed. Revisit if officers use those scopes on billed days.
- **Names are optional on the Statement.** The page reads `corporationName`, `minerName` and `refineryNames` when the issuing client stored them on the Statement; otherwise it names the corporation from public ESI and shows "Refinery <id>". The guest has no session, so structure names cannot be looked up by the page.
- **A closed account is `miners/{id}.closedAt`.** The page prints a note when it is set. The close-account flow that writes it is not built yet.
- **The route is a public link route.** `/corp-tax-book/verify/:token` sits outside `RequireCharacter`, registers no service worker and skips the update wait, like `/s` and `/communities/join`. Analytics and Sentry report the route pattern, never the token.
