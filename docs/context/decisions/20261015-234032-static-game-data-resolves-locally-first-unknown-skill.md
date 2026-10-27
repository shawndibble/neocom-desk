# Scope decisions — Static game data resolves locally first; unknown skill requirements never read as flyable

_Recorded 2026-10-15._

- **Data that ships with the app is read locally before ESI.** A Build Plan's
  build system name resolves against the bundled solar-system table
  (`market/systems.json`, via `sde/solarSystems.ts`) first; a system's name
  and security (`character/systemSecurity.ts`) likewise. ESI is the fallback,
  not the source, so these work offline. A name the table lacks still goes to
  ESI, since the snapshot can lag the game: "no such system" is said only when
  ESI also finds none, and "couldn't check" (nothing could answer) is a third
  answer, worded differently. **This supersedes the build-system-resolution
  bullet of `20260905-000835-job-fee-uses-the-build-system-not-the.md`**
  (ESI-only `/universe/ids`, "the bundled SDE carries no solar-system table").

- **Types, names and public info read through the cache.** Show Info, row
  skills, Compare Attributes and hauling use the cached `loadUniverseTypeOnce`;
  region, constellation and corp/alliance names use the cached `resolveNames`
  and the esiCache-backed public-info loaders. The one exception is the public
  character record behind `stores/publicInfo.ts`: it is the only place a
  corporation change is noticed (issue #293), so it is read on the short
  window, live when online.

- **An unknown skill requirement never reads as "can fly".** When a fitting's
  type lookup fails, required skills are _unknown_, not _none_: the
  missing-skills panels, compare can-fly and the plan Fit Goal say they can't
  confirm it rather than showing the fit as flyable or the goal as met.
