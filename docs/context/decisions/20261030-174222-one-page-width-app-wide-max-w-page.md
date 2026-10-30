# Scope decisions — One page width app-wide: max-w-page (96rem)

_Recorded 2026-10-30._

- **Every app page's root is `mx-auto max-w-page` (96rem), on every tab.**
  Pages had drifted to four widths: most at `max-w-6xl`, Industry at
  `max-w-7xl`, SRP at `5xl` or `6xl` by tab, and some tabs wider than their
  siblings (Market Browser at 96rem, the PI Map and both Ships tabs uncapped),
  so switching tabs moved the page's edges. The owner asked for one width.
  Supersedes the per-page tiers of `20260901-172427-app-wide-page-width.md`,
  the Browser's 96rem of `20261004-100214`, and SRP's wide/narrow view split.
- **96rem, not 6xl.** 6xl would have stopped the PI Map's detail panel from
  ever docking (it docks at a 1500px layout box) and squeezed the Market
  Browser's two columns again. At 96rem both keep what they had on a 1920px
  screen, and wide screens use the space.
- **One token, `--container-page`** in `src/styles/index.css`, so the width
  is changed in one place. `docs/DESIGN.md` §3 holds the rule.
- **Left alone:** prose pages (Help `3xl`, Communities `4xl`), public pages
  (landing, Login, shared links, Community join), modals and slide-overs, and
  the open Fitting editor (`max-w-[120rem]`, `20261016-171349`).
