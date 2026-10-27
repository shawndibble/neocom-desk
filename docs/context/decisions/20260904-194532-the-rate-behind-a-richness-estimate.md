# Scope decisions (round 53) — the rate behind a richness estimate (issue #425)

_Recorded 2026-09-04 · issue #425._

Round 52 settled where a planet's resource ranking is _stored_. Implementing
it surfaced a question that round did not reach: a ranking says **which**
resource is best on a planet and says nothing about **how much** of it comes
out, so something has to supply a rate before an unbuilt planet can be priced
at all.

- **The rate is derived from the pilot's own colonies, not asked for again.**
  The Plan tab already asks for one (`extractionRateField`), because it has to
  answer for a pilot with no colonies at all — `chainBlockPins` returns
  `needs-extraction-rate` rather than guessing, and that field is how the
  refusal gets answered. Adding a second input on the Advisor would give one
  quantity two values that can disagree on screen. So `assumedExtractionRate`
  takes the mean of what this character's own extractors are measurably
  sustaining, off `advisorModel`'s existing `extractedPerHour`. It is a better
  answer than any figure a pilot could type, and it needs no new control.
- **The estimate refuses rather than defaulting.** With no measurable
  extraction anywhere, there is no rate of the pilot's own to project from,
  and the card says so. No default rate is substituted. This is the same rule
  `advisorModel` already follows by dropping an extractor with no install-time
  baseline instead of counting it as zero, and the same rule the link-cost gap
  (#440) put on the built cards' headroom.
- **Refusals, not caveats.** `estimateUnbuiltPlanet` answers with
  `needs-ranking`, `needs-measured-extraction` or `needs-price` rather than a
  number with a warning beside it. A caveat next to a figure is easy to miss;
  an absent figure is not. A resource the reference hub does not quote is
  therefore left unpriced rather than valued at zero.
- **`AssumedRate` carries its provenance**, so the card states what the figure
  rests on and how thin the sample is — the same job `customsRateSource` does
  for the customs rate, and the same reason: a derived number that does not
  say it is derived reads as measured.
- **The estimate stays out of pin-fitting.** It answers "what would one
  extractor here be worth an hour", not "how many factories fit". Feeding it
  into `planColony` would inherit #440's uncharged link cost, which is exactly
  the overstatement the built cards just stopped making.

## Ranking semantics worth keeping

- **Unranked is not last.** A resource the pilot has not ranked keeps
  `rank: null` rather than being sorted to the bottom. "I have not scanned
  this" and "this is the worst here" are different claims, and only the first
  is one the app knows.
- **The planet's own resource list out-ranks a stale ordering.** Rankings are
  durable and planet types change between patches, so a ranked typeID the
  planet no longer yields is dropped rather than shown.
