# Scope decisions — A war-declared Alert asks ESI for the newest wars so the banner does not wait for the sweep

_Recorded 2026-10-21._

- **A `WarDeclared` or `AllWarDeclaredMsg` notice in the Alerts feed makes the War banner read ESI's newest wars itself, for three days.** The open-wars list is only rewritten twice a day, so a pilot told of a declaration would otherwise wait up to 12 hours for the banner. The feed row carries no war id (only a title and body), so the app reads the newest 60 ids from `/wars` (about two days of declarations) and `/wars/{id}` for each, and picks its own corporation's out, the same filter the sweep's list goes through. Public reads, nothing signed, at most once per 30 minutes while a notice is recent.
- **Dismissing the Alert does not hide the war.** The banner is driven by the war, not by the Alert: the notice only says "look now". The sweep's list is the standing source, and it also covers pilots with no Alerts on or who signed up after the declaration.
- **The two sources merge by war id, the fresher read winning.** Nothing is persisted: a reload with no recent Alert falls back to the sweep's list, which has the war by then.
