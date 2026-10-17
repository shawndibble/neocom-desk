# Scope decisions — Group member order for owned-stock claims is plan id order (issue #3992)

_Recorded 2026-10-16 · issue #3992._

- **Claim precedence follows plan id order.** A Build Group member's "Use assets" offer leaves out the Haves of members ahead of it, and "ahead" means a lower plan id (`compareGroupMembers`, `src/engine/industry/groupStockClaims.ts`). Members carry no order of their own — the plan list's drag only moves a plan between groups — and the group page lists members in Dexie's primary-key order, so this is the order the pilot already sees there. A stored member order would need a new synced field and a reorder control; not worth it for a display-only offer.
- **A sibling's claim is its stored Have, capped at the stock both scopes see.** Not capped at the sibling's own Need, which would mean pricing every sibling plan on the member page. "Use assets" never writes more than Need, so a Have above Need is hand-typed, and the over-claim line says so.
- **No over-claim warning on a lower-bound count.** When an asset list was short or unreadable the detected stock is a floor, so claims past it prove nothing; the amber line stays off rather than warn on a number that may only be short.
