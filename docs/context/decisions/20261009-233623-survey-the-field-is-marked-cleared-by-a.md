# Scope decisions — Survey: the field is marked cleared by a button, not a paste

_Recorded 2026-10-09._

- **A Survey ends with a "Mark field cleared" button, never a paste.** The scanner has nothing to copy once the last rock is gone, so an empty paste can't say it, and an empty paste stays "not a scan" (a collapsed scanner group looks the same). The button stores a scan with no text, flagged `cleared`, which loads as a scan with no rocks, so the existing finished state (100%, total time, "cleared" chat message) follows. Rules out auto-finishing on the ETA alone, and accepting an empty paste.
- **Three cases offer it.** The owner, at any point; anyone holding the link once the survey's "Done at" time has passed; anyone once it reads 99% mined. Otherwise a stranger could end a field that is well under way. The check is in the app only: the rules can't tell the owner from a visitor, as for removed scans.
- **The owner can undo it.** A cleared scan is a scan like any other, so removing it puts the survey back to mining.
