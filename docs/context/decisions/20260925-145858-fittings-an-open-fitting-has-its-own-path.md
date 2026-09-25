# Scope decisions — Fittings: an open Fitting has its own path, /fittings/edit

_Recorded 2026-09-25._

- **The Start screen is `/fittings`; an open Fitting is `/fittings/edit?f=<share code>`.** Both used to be `/fittings`, with the Fitting only a `?f=` on it, and several ways of opening one (In-game, EFT/XML Load, a new hull) _replaced_ the current history entry — so Back from the editor skipped the Start screen instead of returning to it. Opening any Fitting now pushes an entry on the editor's path. `/fittings?f=` (every Share Link already copied) redirects to `/fittings/edit?f=` with `replace`, so those links keep working; the Export menu still copies `/fittings?f=`. `/fittings/edit` with no `?f=` redirects to `/fittings`. Edits are unchanged: they still push a coalesced history entry on the editor's own path (`20260924-183346`). `/fittings/compare` already had its own path (#1547).
