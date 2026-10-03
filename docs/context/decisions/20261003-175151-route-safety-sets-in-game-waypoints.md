# Scope decisions — Route Safety sets in-game waypoints (issue #2479)

_Recorded 2026-10-03 · issue #2479._

- **A new write scope, `esi-ui.write_waypoint.v1`, joins the Base Grant
  as its own default-on Permission, Autopilot waypoints.** It is the fifth
  write exception, after mail organizing, calendar RSVP, sending mail and
  Save to EVE, and like them it is used only when the pilot presses the
  button. Folding it into Character details was weighed and rejected: a
  Permission counts as granted only when all of its scopes are, so every
  Character that signed in before this would have shown Character details
  as missing, even though implants, clones and location all still read.
  As a Permission of its own, the Permissions panel shows exactly what is
  missing, and a pilot can leave it out at sign-in. The sign-in fine print
  and the trust card name it.

- **Characters who logged in before this must log in again.** A stored
  grant never gains a scope by itself. For a Character whose grant lacks
  it, the button is disabled, and a Grant for that Character (the chosen
  one, not only the active one) sits under the facts line. The Travel page
  itself is not gated on the scope: Route Safety reads nothing with it.

- **Waypoints are the Stops in flying order.** With Optimize stop order on,
  that is the optimized order the legs show, and with Return to start it ends
  back at the start. The first call clears the client's waypoints and the
  rest add after it. Each is one ESI call, strictly in order, and a failure
  stops there and says how many were set. ESI states no cap on waypoint
  count. A trip is at most 11 calls (10 Stops plus the way home), well
  inside the `ui` rate-limit group's 900 tokens per 15 minutes.

- **The client plans the path between waypoints with its own autopilot
  settings**, which can differ from the route the page shows. The
  confirmation says so instead of promising the page's route.

- **Any non-gate hop cuts the waypoints off at its entrance.** The client
  cannot route through a wormhole or a jump bridge. Waypoints stop at the
  entrance system of the first such hop, and the result names where to pick
  up ("Waypoints set to Kihtaled. Take the wormhole there, then set the rest
  from Atai."). When the very first hop out of the start is one, nothing is
  set, and the message says so. A pilot who isn't in the start system then
  gets no waypoint to it, because the page cannot tell where they actually
  are.

- **A hop's kind is read from the plain stargate graph**
  (`stargateHopKind`). Neighbours count as a gate, and anything else counts
  as a wormhole. That graph must stay stargates only: if hole edges are ever
  merged into `loadJumpGraph()` itself, a hole hop would read as a gate and
  the cut-off would silently stop working. A bridge needs its hop kind from
  the leg that plans it, once bridges exist.
