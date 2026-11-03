# Scope decisions — Accelerator ended is one local alert for both evidences

_Recorded 2026-11-03._

- **`acceleratorEnded` is one Notification Event for both ways an accelerator can stop**: the typed-in one running out (`expired`), and a detected one (GLOSSARY.md **Detected Accelerator**, no expiry ever typed) no longer showing on the cached attribute sheet (`lost`). A pilot sees "Accelerator ended" in the alerts list, not two toggles for one fact.
- **It cannot double-alert.** The Occurrence Key is the Character plus the UTC day it ended, whichever evidence saw it. The attribute sheet usually refreshes a poll after the typed expiry, so both sightings of one accelerator collapse into one occurrence. Deleting or replacing a typed accelerator that was still running is not an end and fires nothing. It is separate from `acceleratorExpiring` (the lead-time warning), which keeps its own key.
- **Foreground only, no Scheduled Push.** It reads local data (Dexie and the cached sheet) and describes something that already happened, so there is nothing to project; it fires on the first poll after the app is open.
