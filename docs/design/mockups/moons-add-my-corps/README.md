# Moons: Add my other corps

First draft mockup; sample data, all names invented. Story source: `src/mockups/MoonsAddCorps.stories.tsx` (title `mockups/MoonsAddCorps`). Dashed amber boxes mark pieces that are not existing components. Use these to check the build against, and to walk a non-technical CEO through the flow.

**The job:** a CEO who owns many alt corps (one per Athanor, to dodge war decs) gets every corp's moons into the main corp's tax book: no invite links, no switching characters. Each corp is a moon owner of the main book; corps whose CEO character is on his account are marked **Yours** (no owner rate, no payouts).

**Decisions behind the screens**
- Entry: an **Add my other corps** button on the Moons page, plus a one-time "New corp found" banner. Never auto-connects. **Don't ask again** hides a corp; it is gone from the banner and the picker, and comes back only from **Hidden corps (N)** in the picker's footer (a dialog, never a block on the page).
- The picker lists every corp where an account character is CEO, nothing ticked. The app cannot see moons before a sign-in, and asks for no extra permissions.
- One combined confirm, one **How far back?** for the whole batch (From today by default, up to 30 days; EVE keeps about 30). Older mining is out of scope.
- One EVE sign-in per corp, run as a guided sequence ("Corp 4 of 12"). The dialog shows a large card with the portrait and name of the character to pick on EVE's login page. EVE redirects back to the Moons page and the dialog reopens on the next corp, because the run is kept in the browser (closing the tab keeps the place). Signing in as the wrong character connects nothing and says so. A failed sign-in is skipped and never blocks the rest.
- Statuses: Ready, Connected, Needs sign-in, Needs a role, Has its own book (fix: Move it into this book), Gone quiet (fix: Remove; keeps past records).
- Held for later: corp switcher and an "All my corps" view.

New components: `NewCorpBanner`, `PickCorps`, `ConfirmBatch`, `SignInSequence`, `CorpStatusList`, `HiddenCorps`.

| Step | 1440 | 390 |
|---|---|---|
| Entry: header button and New corp found banner | ![](entry-1440.png) | ![](entry-390.png) |
| 1. Pick corps (two hidden) | ![](pick-corps-1440.png) | ![](pick-corps-390.png) |
| 1. Pick corps, ten ticked | ![](pick-corps-ticked-1440.png) | ![](pick-corps-ticked-390.png) |
| 2. One confirm, How far back | ![](confirm-1440.png) | ![](confirm-390.png) |
| 3. Guided sign-in, corp 4 of 12 | ![](sign-in-1440.png) | ![](sign-in-390.png) |
| 3. Back from EVE: corp 5 of 12, last one confirmed | ![](sign-in-back-from-eve-1440.png) | ![](sign-in-back-from-eve-390.png) |
| 3. Wrong character: nothing connected, same corp again | ![](sign-in-wrong-character-1440.png) | ![](sign-in-wrong-character-390.png) |
| 4. Result: Needs you, then Moon owners with Yours | ![](result-1440.png) | ![](result-390.png) |
| Hidden corps (opened from the picker footer) | ![](hidden-1440.png) | ![](hidden-390.png) |
