# Scope decisions — Settings update check reads version.json, not the worker install

_Recorded 2026-10-23._

- **Settings' update status comes from the build's `version.json`, not from the service worker finishing its install.** The build emits `{ release }`; Settings fetches it (`no-store`) and compares it with the running `__APP_RELEASE__`. Same is `current` with no worker work; different is `available` at once, with `registration.update()` started in the background. Waiting on the install made the check read "Checking…" for the whole precache download (up to 20 s). An unreadable file (offline, dev, a host without it) falls back to asking the worker and waiting on its install, as before.

- **`available` can now precede the worker being installed.** "Update now" (`forceUpdate`) already waits on the install, so it applies correctly; it just may take a few seconds on a slow link. A `version.json` that briefly runs ahead of `sw.js` shows `available` for a build the worker cannot yet find; the next check settles it.

- **`version.json` is deliberately not precached** (`globIgnores`): a precached copy would be served by the worker and never change until the very update it is meant to announce.

- **Unchanged:** the boot swap path and its decisions (`20261015-152345-boot-applies-a-waiting-update-never-mid-session.md`, `20261016-125007-boot-no-longer-waits-on-the-update-check.md`), which still read the worker, and the 5-minute / on-resume `ReloadPrompt` checks.
