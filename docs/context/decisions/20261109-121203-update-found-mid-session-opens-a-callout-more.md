# Scope decisions — Update found mid-session opens a callout; More sheet gets a one-press update row

_Recorded 2026-11-09._

- **On desktop, every time a newer build is found the rail's Upgrade icon opens a small callout beside it** ("A new version is ready." and Update now). The icon alone was easy to miss in a tab left open for days. The callout never takes focus, a press outside or Escape dismisses it, and it comes back when a _different_ build replaces the one it announced (`found` in `useUpdateStatus`), not on every poll that sees the same build. Nothing persists across loads: a waiting build is already applied at boot.

- **The callout only draws attention; nothing applies or reloads until the pilot presses Update now.** This keeps `20261015-152345-boot-applies-a-waiting-update-never-mid-session`: a running tab never reloads for an update. It rules out a banner, a modal and a timer-based auto-apply.

- **On the phone, the More sheet gets a full-width accent row above the pages** ("Update available" and Update now), shown only while a build waits. The phone has no rail, so before this the only route was a dot and a trip into Settings. It reuses the Settings index row's grammar and the same `useApplyUpdate`, so a failed apply reads out under the row.
