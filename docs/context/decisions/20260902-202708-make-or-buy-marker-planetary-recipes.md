# Scope decisions (round 29) — make-or-buy marker + planetary recipes

_Recorded 2026-09-02._

- **One glyph per material row, and it carries the verdict, not the source.**
  "Better to craft or buy" is what the marker answers: a hammer for a
  material worth producing, a cart for one worth buying, and nothing at all
  for a material nothing produces. Two distinct shapes rather than one shape
  in two tones, because the verdict has to survive greyscale and a screen
  reader (docs/DESIGN.md §7); how it is produced — a blueprint or a planetary
  schematic — is named in the label instead of taking a glyph of its own.
- **It is the deliberate one-level version of the rollup round 27 scoped
  out.** Each material is quoted on its own recipe with the inputs priced at
  the hub, never recursively: a component's own components stay at their
  market price. That is the read an industrialist actually makes at the shelf
  — "buy this part, or run a job for it" — and it needs no change to
  `BuildPlanRecord`, which is still one blueprint per plan.
- **A quote is sized to a real job, at the ME the character actually has.**
  Runs are `ceil(units still to buy / units per run)`, because EVE rounds
  material use once per job rather than per run, and ME comes from the best
  copy of the sub-blueprint the character owns (else 0) — the same rule the
  ME field's "Owned" hint already shows. The job fee is included; sales tax
  and broker fee are not, since a material is consumed by the parent job and
  never listed.
- **No verdict beats a bad verdict.** The marker is gated on the same live
  prices the results panel needs: without adjusted prices and a system cost
  index there is no job fee, and a fee-free quote would call almost
  everything worth building. A material with an unpriced recipe input, or no
  price of its own, is likewise left unmarked.
- **Planetary industry gets a recipe payload of its own** (`public/data/pi.json`,
  ~13 KB, precached): schematics keyed by the typeID they produce, with item
  names carried inline because most planetary commodities are referenced by
  no blueprint and so are absent from `types.json`. Its costing is the
  inputs at hub prices over one cycle's output — planet setup, cycle time and
  the customs-office export tax are outside the number, and said so in the
  label. The same payload answers "how is this made" in Item Detail, which
  is the question a planetary commodity's info panel exists for.
