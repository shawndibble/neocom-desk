# Scope decisions (round 9)

_Recorded 2026-08-31._

- Tree filtering starts at 3 characters, then caps the match count and says so
  on screen rather than truncating silently.
- Order-book columns follow the reference tool: sellers show quantity, price,
  location and expiry; buyers add order range and minimum volume. Security
  status reads inline in the location, not as its own column. No jumps-away
  column — that needs a pathfinding graph the app does not have.
- Order-book reduction (best price, spread, totals, per-station grouping) is
  **pure calculation and lives in the engine**, test-first. The ESI client for
  order books sits with the other price sources; state and components stay in
  the feature.
- Item Detail groups an item's attributes by category and shows all of them.
  A curated allow-list would silently drop whatever mattered for an item class
  nobody thought about.
- The Location Mode control sits in the page header, above both columns — it
  governs the Compare drawer as well as the order book, so it belongs to
  neither one.
