# Scope decisions — Travel settings: one route vocabulary, CCP route costs, ESI POST route

_Recorded 2026-09-30._

- **One Route Preference vocabulary, the game's.** Prefer shorter / safer /
  less secure in the UI; `shortest`/`prefer-highsec`/`avoid-highsec` in code;
  ESI's `Shorter`/`Safer`/`LessSecure` mapped in one place
  (`features/route/esiRoute.ts`). This is the unification CONTEXT.md owed
  before a second persisted preference shipped, and the default preference in
  Settings → Travel is that second one. Assets' device-local Shortest/Safest
  (`assetsRoutePreference`) is gone; its value seeds the synced default once.
- **The default opens every page; a page's picker overrides it for that view.**
  Courier, Route Safety and Thera keep an override in the URL only when set;
  Assets keeps one in view state. Jump Range and market order jumps have no
  picker and use the default in full — "within 5 jumps" counts the trip the
  pilot would actually fly.
- **Only what ESI's route endpoint can honour is offered** (the user's rule:
  keep ESI for Assets and order jumps, and drop a setting ESI cannot take).
  ESI's `POST /route/{origin}/{destination}` (compatibility date 2025-09-30)
  takes `preference`, `security_penalty` and `avoid_systems`, so all of them
  stay; the legacy `GET /latest/route` it replaces took no penalty.
- **The local graph uses CCP's published route costs**
  (developers.eveonline.com, "Route Calculation"): the system jumped into
  costs exp(0.15 × penalty) when unwanted, twice that for nullsec (≤ 0.0) under
  both biased preferences, and 0.9 when wanted; highsec from raw 0.45. So a
  local route and ESI's agree. Penalty 0 is not Shorter, as in game. An
  unknown security is charged as unwanted.
- **Avoidance is one list, a cost never a wall.** Effective avoid = Avoided
  Systems (when their switch is on) + EDENCOM (137: 53 fortress + 84 minor
  victory) + Triglavian minor victory (28) + systems at or over the pod-kill
  threshold in ESI's last-hour kill report. Entering one costs more than any
  security penalty can add up to. ESI's `avoid_systems` is a hard filter
  (verified live), so a 404 under a non-empty list retries without it.
- **EDENCOM and Triglavian sets are vendored.** Neither the SDE nor ESI marks
  them (the SDE's `visualEffect` flags only Pochven); the list is
  kybernaut.space/invasions, which EVE University links to, static since the
  invasion ended in 2020. "EDENCOM systems" includes fortresses, as EVE
  University uses the term.
- **Pod kills read the feed Route Safety already caches**, kills only. An
  unread feed routes without the rule and says so; it is never read as a quiet
  universe. Routing waits for the feed when the rule is on.
