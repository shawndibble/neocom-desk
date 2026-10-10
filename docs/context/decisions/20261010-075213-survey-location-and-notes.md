# Scope decisions — survey location and notes

_Recorded 2026-10-10._

- **The moon tax panel became "Additional information": Location, Moon tax, Notes.** Location and Notes always show on the owner's Survey tab; the Moon tax row still only shows once the scans show a moon ore. The button that opened the Tax tab, and the public page's link to it, are both labelled "Manage Taxes".
- **A Survey's location is a solar system, NPC station or player structure, never an asteroid belt or ice field.** The location exists so a pilot can set their autopilot waypoint, and ESI's `POST /ui/autopilot/waypoint` only takes those three kinds of place; belts and ice fields are celestials it refuses. For ice and plain asteroids the system is the closest a Survey gets. Structures need ESI's name search (`esi-search.search_structures.v1`), so a Character without that scope still gets systems and stations.
- **Location and notes are shared with everyone holding the link, stored as a create-only `shares/{id}/surveyInfo` doc per change (newest wins), carrying the location's name beside its id.** A visitor with no sign-in can't resolve a structure's name. Same sign-in and owner rules as the moon tax, so `firestore.rules` and `firestore.indexes.json` need deploying by hand.
- **Notes are plain text, capped at 1,000 characters, stored when the box loses focus.** Anyone holding the link reads them, so they are never rendered as markup. Every store is a new doc, which rules out storing per keystroke.
- **Set waypoint on the public page works for any visitor who has a Character logged in with the waypoint scope; without one it is disabled with the reason beside it.**
