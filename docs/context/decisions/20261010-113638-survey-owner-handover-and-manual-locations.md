# Scope decisions — Survey owner handover and manual locations (issue #3460)

_Recorded 2026-10-10 · issue #3460._

- **Changing a survey's owner rewrites `payload.owner` on the share.** It is the one update a `survey` share allows (rules limit it to that key), with no transfer record or pending-accept step. The owner is still a Character name the rules can't check, so only the app offers it, to the current owner. The previous owner becomes a viewer because the tab reads `owned` off the name.
- **A manual location is a name with no id.** When the search can't find a structure, the typed text is saved as free text (`surveyInfo` carries `locationName` alone); with no id there is nothing to send as a waypoint, so the button is hidden.
- **Non-owners in the app cannot mark a field cleared.** The public share page keeps offering it once the field is nearly done (see the owner-names decision).
