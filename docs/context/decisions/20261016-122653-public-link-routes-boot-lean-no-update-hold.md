# Scope decisions — Public link routes boot lean: no update hold, no service worker until the visitor enters the app

_Recorded 2026-10-16._

- **A public link route never holds the boot for an update.** `/s/*`, `/share/*` and `/communities/join/*` (`isPublicRoute` in `src/app/routerPath.ts`) render on the first frame: no update check, no swap, no reload, even with a build waiting. Whoever was sent a link is mostly someone with no account who wants the page, not an update. This extends the "no hold when there is nothing to wait for" cases in `20261015-152345-boot-applies-a-waiting-update-never-mid-session.md`; the build still updates on their next normal load.

- **A visitor with no service worker does not get one on a public link route.** Registering starts a precache of the whole app that competes with the page's one small read, for someone who may never return. The worker registers when they go into the app (and stays registered after), or at once if one already exists (`ReloadPrompt`).

- **Trade-off, accepted: a one-time visitor has no offline copy of the app.** They get it only if they enter the app. The share page itself still keeps its last copy of the share in Dexie for offline reads.
