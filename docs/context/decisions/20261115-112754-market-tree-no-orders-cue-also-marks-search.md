# Scope decisions — Market tree no-orders cue also marks search results (issue #6200)

_Recorded 2026-11-15 · issue #6200._

- **Search results carry "No orders in {Region}" too, Best match included.** They are the same tree rows (`MarketGroupTree`'s `renderItem`), and a search is where a pilot picks among several same-named matches, so the cue saves the most clicks there. Gating it off for search would make the same row change its look as the query changes.
- **A Global Market Region item (PLEX) is never marked.** Its orders live in its own region, so the browser's region list never holds it and the cue would be false.
- **No cue on the other Market tabs, under All regions, under a Jump Range, or before the saved scope settles.** Only the Browser tab draws the tree, and a cue spanning regions would need one request set per region (the rebuild's no fan-out rule).
