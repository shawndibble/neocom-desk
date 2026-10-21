# Scope decisions — Corp overview is a widget grid the pilot builds

_Recorded 2026-10-20._

- **`/corp` is a Widget grid the pilot builds, not a fixed ops board.** Standing,
  Deadline Strip, Kind Cards, Offline services, Money and People are retired
  (components, `cardReadability` and the engine helpers `peopleHighlights`,
  `vitalsFigures`, `toVitalsJournal` deleted). Record: `docs/features/corp.md`
  section 1, `docs/design/overview-widgets.md` "Corp overview board".
- **One widget engine, two boards.** The Overview and the Corp overview share the
  grid, Customize, Gallery and menu through a `WidgetBoard` context. One global
  Widget Kind catalogue; corp-only ids are prefixed `corp`. Structures and Moon
  extractions are on both boards.
- **One Corp overview layout per pilot,** synced as `sync.corpOverviewLayout`;
  not per corporation, not per Character.
- **No Role chooser or first-run prompt on the Corp overview.** Until the pilot
  edits, the page draws the full default (every default corp kind) and never
  saves it; the capability gate decides what is drawn. The default is never
  trimmed to one Character's roles: an alt's edit would then save a layout
  missing the Director main's widgets. On a new device it waits for the first
  sync pull before drawing the default, like the Overview's first run.
- **Hide, don't lock.** A kind whose capability the Character lacks is never
  offered in the Gallery, drawn or fetched. A saved one stays in the layout but
  is not drawn. Coming-soon kinds are listed for everyone, not addable.
- **No Character scope menu on corp widgets.** Corp data belongs to one
  corporation.
- **Each corp read is gated in its loader** (`resolveCorpReadAccess`) before it
  fetches. Unreadable, failed and empty stay distinct states.
- **No countdown shorter than the 1 h corp cache window.** The data-age popover
  carries the hourly-cache note.
- **No Next deadline button in the Corp overview header.** It squeezed the five
  corp tabs off the header line; Due soon names the next clock.
- **Item "Show info" links from the old board rows are gone.** Widget tables link
  rows to pages instead.
- **Nine coming-soon corp kinds** (Starbases, Customs offices, Corp orders, Role
  audit, Doctrine, Kills, Contracts, SRP, Projects) need new ESI scopes or
  app-owned data and are separate tickets (#4606–#4614, umbrella #4615). No new corp scope in this change; any
  future one must be additive in ADR terms (`ADDITIVE_CORP_CAPABILITIES`).
