# Scope decisions — Alerts leaves the phone tab bar and More sheet

_Recorded 2026-10-10._

- **Alerts has no phone tab, choice or More-sheet tile.** The bell in every page header is the way in (plus Ctrl K), so a second entry on the bar was redundant. Supersedes the phone-bar part of `20261009-163837-pinned-rail-alerts-bell-pilot-lookup-back-under`. Default bar is now Overview, Skills, Industry, Market; a stored bar holding `/alerts` fails `parseMobileTabs` and falls back to it.
