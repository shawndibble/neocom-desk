# Scope decisions — Mail show-info links to a region, station or structure open Place Info (issue #3958)

_Recorded 2026-10-16 · issue #3958._

- **A region, station or structure opens Place Info** (`?info=place-<id>`,
  `PlaceLink`). Supersedes the "styled text until a Place Info modal ships"
  line of `20261016-124635-mail-compose-format-bar-and-eve-markup.md`.
- **Place Info shows what the app already resolves**: kind, solar system (to
  Route Safety, with security), region, and Set destination / View route for
  a station or structure. No new data: no constellation, no services, no
  owner.
- **A structure is read as the active Character.** No docking access (or no
  Character) shows "Can't read this structure", never an error.
- **A solar system id is not a Place Info target.** Systems keep Route Safety
  (§6c); `?info=place-<systemId>` shows "Can't find this place".
- **Constellation and faction links stay inert text** with the generic
  "Open in EVE" tooltip: no view for them yet.
