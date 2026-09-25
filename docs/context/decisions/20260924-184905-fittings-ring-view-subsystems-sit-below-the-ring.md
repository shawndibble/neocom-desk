# Scope decisions — Fittings Ring view: subsystems sit below the ring, view choice is device-local (issue #1536)

_Recorded 2026-09-24 · issue #1536._

- **Subsystem slots (T3 hulls) render as a row beneath the ring, not on it.** The ring has four racks (high top, mid right, low bottom, rigs left); a fifth arc would crowd 44px targets on a phone. They still show every slot, empty ones included.
- **The Ring | List choice is device-local, unset by default.** Unset resolves by breakpoint (Ring on desktop, List on a phone) and a stored choice wins; it is never in the URL (`20260922-221531`).
- **Empty slots come from the hull's dogma slot attributes** (`FittingStats.slotLayout`), so until stats load the ring shows only fitted slots.
