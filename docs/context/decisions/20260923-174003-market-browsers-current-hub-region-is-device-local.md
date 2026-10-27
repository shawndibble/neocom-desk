# Scope decisions — Market Browser's current hub/region is device-local, not the synced default

_Recorded 2026-09-23._

- **The Market Browser page's own current hub/region moves to a new
  device-local key (`features/market/browserHub.ts`), separate from
  `sync.marketHub`.** Reported bug: a pilot's Trade Hub/Region pick on the
  Market Browser page didn't stick. Root cause was a scope mismatch, not a
  broken write path — `sync.marketHub` is a cross-device _default_
  (`hub.ts`'s doc comment: "a pilot who trades out of Amarr had to say so
  again on every device"), but the Market Browser page had adopted it as its
  own live selection. Any other device, or any feature that writes the
  synced default (Settings' "Default trade hub", the LP Store's own hub
  picker), could silently reassign what the Market Browser showed next time
  it opened. What the pilot actually wants there is "whatever I last picked
  on this browser" — a fact about the machine, not about them. This rules
  out fixing the bug by changing precedence rules around it (e.g. having the
  URL always win); the underlying key was the wrong scope regardless of URL
  handling.

- **`sync.marketHub` keeps its existing scope and consumers unchanged: it
  stays the default the Contracts detail modal, LP Store, BPC Sourcing panel
  and notification polling price against, and what Settings' "Default trade
  hub" control edits.** These are genuinely cross-device preferences —
  nothing about the reported bug implicated them — so de-syncing
  `sync.marketHub` itself would have cost every one of them real
  functionality to fix a Market-Browser-only problem. This rules out
  reusing or renaming `sync.marketHub` in place.

- **The new local key seeds once from `sync.marketHub`, then never reads it
  again.** An existing pilot's first load after this shipped should show no
  visible reset; every pick after that is purely local, mirroring the
  "adopt once, unstamped" pattern `useSyncedSetting.ts` already uses for the
  other direction (device-local value adopted into a new synced key). This
  rules out re-deriving the Market Browser's hub from the synced default on
  every load, which would have reproduced the same bug one layer down.
