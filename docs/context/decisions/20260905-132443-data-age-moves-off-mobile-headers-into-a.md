# Scope decisions — data age moves off mobile headers into a Settings tab

_Recorded 2026-09-05._

- **`DataAgeBadge` (the "just now" / "5m ago" text every ESI-backed view
  shows) now renders `hidden md:inline-flex` — it disappears below the `md`
  breakpoint instead of showing on every view's header.** On a phone-width
  header it was competing with the title and the action icons for room that
  doesn't exist; CONTEXT.md's **Data Age** glossary entry ("Timestamp shown
  on every API-derived view") still holds in spirit, just not inline on
  mobile — the same information moved to a dedicated place instead of being
  dropped.

- **Settings gained real tab navigation** (`General` / `Data Age` /
  `Activity Log`, via the shared `Tabs` component) **and the pre-existing
  Activity Log panel moved into its own tab**, alongside a new `Data Age`
  tab. Settings had been a single scrolling stack of `Panel`s with no tabs
  anywhere in it; this is the first place in the app where `Tabs` gates
  content that used to always render, rather than switching between peer
  views that were already tab-shaped. `General` keeps every other existing
  panel (Display, Shortcuts, Notifications, Corp Access, Data) so the
  `#notifications` / `#corp-access` deep-link anchors from elsewhere in the
  app still resolve without changing routes.

- **The new `Data Age` tab is derived from the existing session-only
  `useActivityLog` store, not a new registry fed by every `DataAgeBadge`
  call site.** `ActivityLogEntry` already carries `endpointId`,
  `characterId`, `timestamp`, and `outcome` for every ESI call; the panel
  dedupes to the most recent **successful** entry per
  `endpointId:characterId` pair (a failed call never updated anything, so
  it's excluded even when it's the most recent event for that pair) and
  lists it next to the endpoint's route template and the character's name —
  the same columns `ActivityLogPanel` already renders, reused rather than
  inventing a second display format. This was chosen over adding a `label`
  prop to all ~39 `DataAgeBadge` call sites: cheaper, and it reuses
  infrastructure that already existed for issue #32, at the cost of only
  reflecting the current session (cleared on reload, capped at the log's own
  100-entry limit) rather than being authoritative for data that hasn't been
  refetched since the last reload.
