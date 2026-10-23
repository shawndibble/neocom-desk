# Scope decisions — Skyhook raids Near me: scope and Next rule

_Recorded 2026-10-23 · issue #4781._

- **Skyhook raids gains a Where setting, not a second widget.** My alliance (default, never stored) or Near me, and under Near me a jumps radius of 5, 8 (default), 10 or 15. The radius is its own `raidsRadius` field on the widget, not `WidgetRange` (which counts days); `raidsWhere` is stored only for Near me and `raidsRadius` only when it is not 8, so every saved layout loads unchanged. Both sit in one menu section (a Where group, and a Radius group shown only under Near me).

- **One shared read serves both modes.** The loader keeps every raidable skyhook with its holder (the sovereignty claim join) and measures all listed systems from the Current System once, locally (Route Safety's jump basis). Planet and holder-name lookups are limited to the alliance's skyhooks and those within 15 jumps, the widest radius, so a Near me widget adds no fan-out over the whole list. A Character in no alliance now reads the public lists too (Near me works for them); My alliance still says "no alliance".

- **Next feeds only the Character's own alliance windows, in both modes.** A hunt target is a place to go, not a deadline, so Near me windows held by others never reach the header Next button; the pilot's own upcoming windows do, as before.

- **Order and tone in Near me.** Open now first (fewer jumps first, since all are "opening now"), then soonest opening, ties by fewer jumps; an unreadable window stays, last. Open is green with the words, amber when under 10 minutes remain (the theft link takes 10), and the Character's own alliance is amber and named "Your alliance". My alliance keeps red for open. No copy states a window length.

- **Held by is the lowest-priority column** and the Near me table is `fitWidth`, so on a phone it is dropped first rather than scrolling sideways.

- **No location is never guessed.** When no listed skyhook has a known distance, Near me says the location is unknown instead of "none within radius".
