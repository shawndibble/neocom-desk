# Scope decisions — Employment History's controls move into the character header

_Recorded 2026-10-14._

- **Employment History's data age, Refresh and export leave the panel's title bar for the character header, as on the Overview.** The age ("Updated 3 min ago") sits beside the pilot's name (`aside`); Refresh and the export menu sit level with the alerts bell (`actions`), drawn at the bell's size (`md`, 44px on a phone). The panel loses its "Employment" title bar entirely: the tab directly above already says it, and the timeline's list carries the name for assistive tech. They stay in the header in the empty, failed and offline states, which is where a Refresh is needed. Amends `20260902-101732` for this tab only.
- **Total SP and Unallocated SP are gone from this tab.** Nothing here uses them, and the page no longer reads `/skills` at all. `CharacterHeader` draws the SP chips only when `totalSp` or `unallocatedSp` is passed; Clones still passes them, so Clones is unchanged.
- **`CharacterHeader` honours `aside` and `actions` on any tab that passes them**, not only under `overview`. Clones and the Overview keep their own arrangements.
