# Scope decisions — Local list keeps pilot kill history between pastes (issue #5812)

_Recorded 2026-11-01 · issue #5812._

- **Kill history is stored per pilot and reused across pastes.** A pilot's parsed kill history is kept in the generic `esiCache` table (key `pilot-kills:<id>`, under the global sentinel). Younger than 30 minutes it is used as it is, with no request. Between 30 minutes and 24 hours it is shown at once, marked stale, and read again behind the list. Older than 24 hours it is not shown as data and the pilot loads as before. Rows are pruned after 7 days. This replaces nothing in the in-memory zKillboard caches; it sits in front of them so a paste 15 minutes later is not a burst of one request per pilot.
- **A failed refresh keeps the stale copy and its mark.** A pilot with a usable stored copy is never shown as unreachable; only a pilot with nothing usable is.
- **The stale marker is the existing `DataAgeBadge`.** Last column of the desktop table ("Kills read"), empty for a fresh read; a "Kills read <age>" tag in the phone card's tag line. A stale read cannot raise a Threat level: its kills are a subset of what a fresh list holds for the same window.
- **A pasted name's character id is reused for a day** (key `pilot-id:<lower-cased name>`, pruned after 30 days), so only unknown names go to `/universe/ids`. A day, not longer, because a renamed pilot frees their old name.
- **Still asked each paste:** a pilot's danger ratio and loss dates for the Threat verdict, when the verdict needs them; those stay on their own 10-minute in-memory caches.
