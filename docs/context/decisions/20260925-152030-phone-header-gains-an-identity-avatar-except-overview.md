# Scope decisions — Phone header gains an identity avatar, except Overview (issue #1765)

_Recorded 2026-09-25 · issue #1765._

- **Below `md`, `PageHeader` shows a 28px round avatar link to `/characters` (return target = current path, #1764), on every route using it.** Only Overview, which carries a large portrait and does not render `PageHeader`, has none; nor does `/characters` itself. It partly reverses `20260905-132443` (which cleared the data-age badge off phone headers for crowding) for identity only — the avatar is smaller than the badge was. Desktop is unchanged: the rail already names the pilot.
