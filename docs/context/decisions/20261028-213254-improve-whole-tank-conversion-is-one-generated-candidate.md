# Scope decisions — Improve: whole-tank conversion is one generated candidate behind the Defense Choice (issue #5512)

_Recorded 2026-10-28 · issue #5512._

- **A whole-tank conversion is one generated candidate, not a new control.** The Shield and Armor buttons already free the other side's tank modules inside a rack; a conversion is what they also offer when the fit's tank is on the other side, as one row ("Convert to armor tank") scored as a whole fit. The single-swap loop cannot find it, because every step alone scores worse. It chains existing `ImproveCandidate`s with `pairedWith`, so price, delta, Guardrails, "gives up" and Apply/Undo are unchanged.
- **Freed slots stay empty in v1, and the row names them.** Filling them (utility, propulsion) is a second search that Rework and the empty-slot fills already approximate; the pilot sees "frees 3 mid slots" and can run Improve again. Scram, web, cap, propulsion and EWAR modules are never stripped.
- **A full chosen-side rack gives up its weakest unprotected modules, scored whole.** A few displacement counts are tried and only a variant that beats the current fit is shown.
- **Rigs are never converted in v1, even with the Rigs group ticked.** Refilling rig slots is a separate search; the conversion strips and refills modules only. A losing variant of a conversion sits behind the row's "more options", as other grouped rows do.
