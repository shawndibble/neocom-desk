# Scope decisions — Calendar gains a moon chunk kind (issue #1762)

_Recorded 2026-09-25 · issue #1762._

- **The Calendar gains an eighth Clock Kind, `moonChunk`, read from the same cached corp extractions the corp ops board uses.** It is the first Calendar source that is a corporation read, so it is gated in the loader before any fetch: the roles scope, then `Station_Manager` (`canReadMoonExtractions`), then `esi-industry.read_corporation_mining.v1`. A Character who fails any step contributes nothing — no request is made and `moonChunk` is not readable, the same "unreadable is not zero" contract as every other kind. Rules out a page-wide gate.
- **Deadline rule is the corp board's:** the chunk's arrival until it lands, then its natural decay. Which one rides in the row's `detail` (`arrival` / `decay`).
- **No severity.** The ticket's "severity uses `severityForRemaining`" is superseded by the earlier decision that the Calendar paints kind colour, not severity (`CharacterBoardItem` has no severity). Countdown and order already carry urgency.
- **Filter menu hides the row when the kind is not readable,** rather than showing "Unavailable", which would hint at corp access the Character does not hold (Corp Access renders nothing when not `ready`). A hidden-kinds preference for it still persists harmlessly.
- **Colour:** `--color-kind-moon-chunk: #a0a8b8` (cool grey; ΔE ≥ 30 from every other tone and clock kind, AA on bg/panel/panel-2). Glyph is the Moon icon. Refinery names are used when the Character can also read structures; otherwise `Moon <id>`.
