# Scope decisions — Login page long-form tour videos open in a modal player

_Recorded 2026-11-26._

- **Four long-form tours (An evening in EVE 5:40, From a fit to undocking 3:23, Build it, sell it, see the profit 3:27, Running a corp: the officer's side 2:58) are links that open a `Modal`, not more in-page players.** One quiet `TourVideoLink` per placement keeps the 1:38 promo the page's one poster and the login button its one primary action; a second poster band per video would bury the showcase. The `youtube-nocookie.com` iframe mounts only while the dialog is open, so the no-tracking, nothing-loads-before-a-press stance of the promo facade (decision `20261125-000356`) holds, and closing stops the video.
- **Placements: the full tour under the promo player, the industry and corporation videos in their showcase tabs, the undocking video under the closing login.** The full tour is not in the hero: the hero is the prerendered shell, and it already carries the 1:38 tour action; a second video action there would compete with the login. All four sit below the fold, so they ride `useBelowFold` and add nothing to first paint.
- **`TOUR_VIDEOS` in `promoVideoConfig.ts` holds each id and length**; a showcase tab names its video with `video` in `showcaseTabs.ts`. A re-cut changes both fields, nothing in JSX.
