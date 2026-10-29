# Scope decisions — Fittings three-column breakpoint lowered from 100rem to 87.5rem

_Recorded 2026-10-28._

- **The Fittings page goes three-column (browser | Ring or List | stats) from 87.5rem (1400px), down from 100rem.** With Improve open below the breakpoint the stats stacked above the editor although the Ring had room to shrink. The Ring track is `minmax(0,52rem)`, so it narrows rather than overflows (about 460px with the browser docked, about 400px with Improve open at 1400px). The one constant also moves the docked-browser breakpoint; a separate Improve-only threshold was not added. Supersedes the `(100rem)` in the start-screen decision.
