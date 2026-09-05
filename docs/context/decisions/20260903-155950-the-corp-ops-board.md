# Scope decisions (round 39) — the corp ops board

_Recorded 2026-09-03._

- **The board is one list, and the ranking is the feature.** Fuel expiry,
  structure state timers, offline services, moon extractions and undelivered
  jobs live in four ESI endpoints and four windows in the game client. Merging
  them into one deadline-ordered list is what `/corp` is for; the tables under
  it are ordinary. `engine/corp/board.ts` owns it, and it is pure — `nowMs` is
  a parameter, never a `Date.now()` call.
- **Severity derives from time remaining alone.** One `severityForRemaining`
  ladder, called by every source, so a Fortizar with 25 days of fuel and an
  Athanor with 2 are the same kind of item at different urgencies rather than
  two per-endpoint rules that drift apart. Nothing in it may branch on the item
  kind.
- **A missing `fuel_expires` is past-due, not untimed.** ESI drops the field
  once a structure runs dry — precisely when it matters — so it sorts above
  every live clock. An offline service is the genuine untimed case and sorts
  below them; `cleanup` is the transient state a service passes through on its
  way offline and is not a fault at all. Time remaining stays _unclamped_ in the
  engine, so overdue items keep their order against each other; the clamp
  belongs at the point of display.
- **A countdown shorter than the refresh window is not presented as live.** CCP
  caches corp data for about an hour. Multi-day clocks are honest at that
  window; a twelve-minute shield timer is not, and the board says "Under 1h"
  rather than a figure it cannot stand behind. That class of alert belongs to
  the notification feed, which refreshes on a ten-minute cadence. The
  `DataAgeBadge` states the hourly cache in its tooltip rather than leaving the
  amber tone to read as a fault.
- **"Cannot read" and "nothing due" are different answers and must look
  different.** Each panel is gated on its own Corp Capability, and the gate
  decides what is _fetched_ as well as what is drawn. A Station Manager who is
  not an Accountant sees structures and no wallet rail — no error, and no "No
  industry jobs" card about an endpoint they were never allowed to ask.
- **`canReadMoonExtractions` is its own Corp Capability**, though it shares
  `Station_Manager` with `canReadStructures`: they are separate reads behind
  separate scopes, and a capability names what a Character can read. (Issue
  #296's brief names the role `Structure_manager`; that string appears nowhere
  in ESI's spec.)
- **A corp 403 never raises the app-wide auth-failure notice.** The board takes
  round 38's `detectCorpAuthFailure`, which subtracts the role gate from the
  shared rule and so also suppresses `emitEsiAuthFailure` — a revoked role must
  degrade quietly, not herd the user toward a re-login that cannot restore it.
  A 401 or a failed refresh still counts.
- **The board is a second consumer of the corp data modules, not a second copy.**
  The wallet, divisions, journal and industry-jobs reads are round 38's
  (`wallet.ts`, `divisions.ts`, `jobs.ts`) and are used as they are; `/corp`
  adds only the structure list, the moon-extraction schedule and
  `loadCorporationId`.
- **The corporation id is part of the nav gate, as it is for the switch.** It
  is written by the public-info read, so a cold device simply has none, and an
  entry into a section with no corporation behind it must not be on screen. The
  route reads it differently on purpose — `loadCorporationId` can _learn_ it, so
  a deep link works and the nav entry then heals itself. That is the same
  hide-versus-wait asymmetry `unknown` already has.
- **The runway's two halves describe the same wallet.** ESI publishes no
  all-divisions journal and the seven divisions are separately role-gated, so
  the rail divides one division's balance by that same division's spending.
  Every division's balance over one division's outgoings would answer a
  question nobody asked.
- **`/corp` is UNGATED in `routeScopes.ts`.** Not because it needs no scopes —
  it needs seven — but because its gate is the two-axis Corp Access, not a
  scope set. Declaring the endpoints there would put a `ReauthBanner` in front
  of a Character whose only obstacle is an in-game role no login can grant.
- **`unknown` hides in the nav and waits at the route.** The asymmetry is
  deliberate: a nav item that flickers into existence is worse than one a beat
  late, but bouncing a Director who deep-linked before their roles read landed
  is simply a bug.
