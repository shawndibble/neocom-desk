# Scope decisions — The timer and tab-resume checks read version.json too

_Recorded 2026-10-23._

- **`ReloadPrompt`'s 5-minute timer and its on-resume check read `version.json` before the worker.** Supersedes the "Unchanged" bullet of `20261023-090330-settings-update-check-reads-version-json-not-the.md`, which left those checks on `registration.update()` alone. The running release means no worker request at all (no `sw.js` fetch); a different one starts the download; an unreadable file asks the worker as before.

- **A poll can now mark `available` on its own, so the Settings dot and rail dot light without a visit to Settings.** `available` is sticky until a reload. If `version.json` ever runs ahead of `sw.js`, the dot stays lit for a build the worker cannot find yet, and "Update now" waits out its install cap and reloads onto the same build. Accepted: Pages deploys are atomic, and the dot clears on the reload.

- **Unchanged:** the boot swap (still reads the worker), the offline and already-installing early returns in the poll, and "Update now".
