# Scope decisions — Route Safety's Route Preference saves the pilot's default (amends 20261003-161302) (issue #2472)

_Recorded 2026-10-06 · issue #2472._

- **Route Safety's Route Preference picker writes the pilot's saved default,
  the same `useDefaultRoutePreference` store Settings → Travel edits.** The
  picker and the setting are one variable. A link-only picker reverted to the
  saved default on every revisit, so a pilot who kept choosing Prefer safer
  saw Prefer shorter come back. This reverses the "this route only" group of
  `20261003-161302`: the Route Preference now sits in "Your travel settings".
  The picker also drops `pref` from the link. An incoming link that names
  `pref` (from Assets or Courier) still wins until the picker is used.
