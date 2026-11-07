# Scope decisions — A never-granted opt-in Permission is off, never a reauth (issue #5997)

_Recorded 2026-11-06 · issue #5997._

- **A never-granted opt-in Permission is off, never a reauth.** When a Character's grant never included an opt-in Permission (one outside the Base Grant, e.g. `corp`, `structureMarkets`, `jumpFatigue`, `corpProjects`, `killmails`, `mercenaryDens`), a source that reads through it is simply off: no rows, no "needs a new login" notice, and no "Unavailable" row. `needsReauth` is only for a grant that _did_ include the scope and ESI now refuses (revoked or stale). Telling a Base Grant pilot to log in again for a feature they never chose is wrong, and it nudges them toward granting more. Rules out: a missing opt-in scope raising a reauth banner or notice on the Calendar or Overview. A pilot who wants the feature gets there through Settings › Permissions or the widget's own "needs permission" state, never through a reauth prompt.
