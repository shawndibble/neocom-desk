# Scope decisions — Route Safety shows an empty route as ghost rows, and the preference cards as a second picker

_Recorded 2026-10-14._

- **Before a route exists, the route area shows ghost rows in the shape of the
  itinerary, and the three preference cards show dashes.** DESIGN §6a prefers a
  spinner to a skeleton, and that still holds for anything loading. This is not
  loading: nothing is coming until a destination is picked, so the page shows
  what it will hold, with the existing "Pick where the route starts and ends"
  heading and hint kept as the message. The ghosts are `aria-hidden`. It is
  the one skeleton in the app, and it applies only to an empty Route Safety.
- **The Safer / Shorter / Less secure cards are a second face of the Route
  Preference picker, not a new setting.** Choosing a card writes the pilot's
  saved default and drops `pref` from the link, exactly as the segmented
  control in Route rules does (`20261006-143832`). Both stay: the control is
  there before a route exists and in the phone's collapsed summary; the cards
  are there to compare. A card states jumps, lowest security, last hour's kills
  and Gank Chokepoints, and says only when its route is exactly another
  card's. It never ranks, recommends or labels a route good or bad
  (`20260912-172628`).
- **The destination is a search field on the page, and a trip with no stops
  offers quick picks: the five trade hubs and the nearest Incursion's staging
  system.** The add-stop button hid the only thing a new visitor can do behind
  a click. A quick pick is a place to go, not a recommendation. The nearest
  Incursion is offered only when its distance is known, and a system already
  on the trip is left out.
- **Route rules and Incursions near you sit in a right column beside the
  route; the preference cards and the Stops sit above it, full width.**
