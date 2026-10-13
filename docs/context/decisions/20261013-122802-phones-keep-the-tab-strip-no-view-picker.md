# Scope decisions — Phones keep the tab strip; no view picker

_Recorded 2026-10-13._

- **Every page shows its tab strip on a phone, the same as on desktop.** The
  title-row view picker (`PageViewPicker`) is gone. Supersedes the 4+-tab
  bullet in `20261009-163837-pinned-rail-alerts-bell-pilot-lookup-back-under`
  and the Travel bullet in `20261010-193521-hauling-moves-from-market-to-travel`.
  Why: Skills, Industry, Market and Travel showed a dropdown on a
  phone while every other page showed tabs, so the same job had two controls
  depending on how many tabs a page happened to have. The strip already scrolls
  sideways when it outgrows a phone
  (`20260907-073634-a-tab-bar-scrolls-sideways-instead-of-squeezing`), so a
  long strip needs no second control.
- **Out of scope:** selects that switch a view inside one panel, not the page
  (Industry Opportunities' Ranked / Owned below `lg`, History's view select).
