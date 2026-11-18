# Scope decisions — A signed-in owner manages a survey on its public page, and the details panel folds

_Recorded 2026-11-18._

- **On `/s/<id>`, a pilot signed in with the Character that started the survey gets what the Survey tab gives its owner: the editable Additional information panel and the scan list that sets a scan aside.** The owner opens the link as often as the tab (it is what they paste into the game), so making them go to the app to fix a bad paste or add a location was a detour. Ownership is the same name check the tab uses (`ownsSurvey`), a hint that only picks which controls to show; the write still needs a signed-in Character. A visitor, or a pilot who is not the owner, sees the page as before.
- **The Additional information panel folds for the pilot who edits it, and starts folded on a survey this device just started from `/survey` with no details.** There is nothing to read in an empty panel, and it pushes the chart and scans down. Any detail stored, or a survey this device did not start, opens it. Applying a template opens it, so the rows are there to settle. Readers' read-only panel does not fold.
- **`/survey` has its own tab title** ("Start a mining survey"), instead of falling through to "Page not found". The page always rendered; only the title was wrong.
