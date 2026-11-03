# Scope decisions — Unreadable structures are named Unknown/Undockable

_Recorded 2026-11-03._

- **A structure ESI will not name to the active character reads "Unknown/Undockable".** ESI names a structure only to a character with docking access, so a refusal is a normal answer, not an error. Owner decision; it replaces the "Unreadable station" wording from the courier decision of the same day.
- **Courier:** the detail modal's refused structure end. **Moon pages:** a refinery with no officer label, no name (the moon owner's server read or this character's lookup) and no system, once the name lookups have answered, reads `Unknown/Undockable (<id>)`; the id stays so two such refineries never look alike. Before the lookups answer it still reads `Refinery <id>`, so a refinery is never called undockable while it is still being asked about.
- **Neither stand-in is ever saved or mailed as a real name** (`isRefineryPlaceholder`).
- **The moon page uses names the server already read** (moon owner's grant, #4654) and no longer asks ESI again for those ids (nor sweeps the roster for them).
- **A name read by someone else, for a structure the viewer cannot dock at, shows the name plus a yellow `Undockable` chip** (`PlaceCell`, warning `Pill`). The viewer's own access comes from `loadVisibleStructure`, this character alone, from its cached lookup. A lookup that went unanswered (offline) is not a refusal and shows no chip. The chip sits on the on-screen place cells (Overview, Extractions, Miner detail); exports, mails and sorts keep the plain name.
