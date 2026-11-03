# Scope decisions — Unreadable structures are named Unknown/Undockable

_Recorded 2026-11-03._

- **A structure ESI will not name to the active character reads "Unknown/Undockable".** ESI names a structure only to a character with docking access, so a refusal is a normal answer, not an error. Owner decision; it replaces the "Unreadable station" wording from the courier decision of the same day.
- **Courier:** the detail modal's refused structure end. **Moon pages:** a refinery with no officer label, no name (the moon owner's server read or this character's lookup) and no system, once the name lookups have answered, reads `Unknown/Undockable (<id>)`; the id stays so two such refineries never look alike. Before the lookups answer it still reads `Refinery <id>`, so a refinery is never called undockable while it is still being asked about.
- **Neither stand-in is ever saved or mailed as a real name** (`isRefineryPlaceholder`).
- **The moon page uses names the server already read** (moon owner's grant, #4654) and makes no roster sweep for those ids. This character's own access is still checked once per refinery (cached; a refusal is remembered for a day), which is what drives the chip.
- **A name read by someone else, for a structure the viewer cannot dock at, shows the name plus a yellow `Undockable` chip** (`PlaceCell`, warning `Pill`). The viewer's own access comes from `loadVisibleStructure`, this character alone, from its cached lookup. Only a confirmed refusal (`loadStructureAccess` = `refused`) shows the chip: offline, a timeout, a 5xx or a spent budget gate is `unknown` and shows none. The chip sits on the on-screen place cells (Overview, Extractions, Miner detail, the moon's page); exports, mails and sorts keep the plain name.
