# Scope decisions — Contracts opens on Search, not History

_Recorded 2026-09-12._

- **Search is the Contracts page's landing tab, and History is second.** This
  reverses issue #908's original order, which put History first on the grounds
  that it was the page's pre-existing content. A year of the page existing is
  not a reason to keep leading with it: the public corpus is the thing pilots
  open Contracts _to use_, while a character's own contract history is a
  look-up-what-happened list consulted occasionally. The tab nobody navigates
  to on purpose should not be the one that costs a click to leave.
- **`?tab=` still names only the non-default tab, so the default one is
  absent from the URL.** Which tab that is flipped; the rule did not. `?tab=`
  is now written as `history` and omitted for Search, mirroring
  `features/industry/industryTabs.ts`. `readContractsTab` matches the exact
  string `history` and falls through to Search for everything else, so every
  `?tab=search` link written under the old order — shared, bookmarked, or
  pasted — still lands exactly where it did.
- **`contractAccepted` notifications deep-link to `/contracts?tab=history`.**
  Not `/contracts`. That alert is about a row in History, and
  `notificationUrlForSubject` appends `?highlight=<contractId>` to pulse it.
  `useHighlightParam` spends the parameter on arrival whether or not a row
  matched, so landing on Search would burn the highlight silently and the
  pilot would never see the contract they were just told about. Precedent:
  `walletBalanceChanged` → `/wallet?tab=journal`.
