# Scope decisions (round 46) — People beside Money on the corp overview (#345)

_Recorded 2026-09-03 · issue #345._

- **People was always intended on the `/corp` overview; it was never cut.**
  The Directorate design study round 39 documented showed People and Money
  panels side by side, and round 39's ranking decisions never mention
  dropping the People half. Only Money shipped (`CorpVitalsRail`, #296)
  because the ticket scoping split that way, and the completeness audit run
  afterwards found the gap. This round closes it and records that the
  absence was an accident of scoping rather than a decision — so a future
  reader does not have to re-derive that from the silence.
- **`CorpPeopleRail` is its own component beside `CorpVitalsRail`, not a
  `people` mode on it.** The two share a shape (a small stack of labelled
  figures in a `Panel`) and nothing else: different capability, different
  reads, different engine. A mode flag would have made one component that
  branches on everything except its own layout.
- **The two rails share the one 18rem side-column cell, side by side where
  there is width and stacked where there is not.** The board's own column
  stays full width — giving People a grid cell of its own would have taken
  that width from the ranking, which is the feature. The `sm:grid-cols-2`
  class is conditional on _both_ rails actually rendering, so a wallet-only
  Character's Money rail keeps the full width it had before (AC3's
  "unaffected and unchanged"). "Where there is width" excludes `lg` and up,
  where the side column _is_ the 18rem track: two ~9rem columns would overflow
  it, because a `StatChip` and the vitals rail's ISK figures are `shrink-0` by
  contract. So the pair is side by side only between `sm` and `lg`, and stacked
  either side of that band. AC1 asks for side-by-side on desktop too; the
  ticket's own Scope caps the container at that track, and a rail that
  overflows its column is the worse of the two failures.
- **A member-id list that could not be read is `null`, not an empty diff.**
  Joined/Left are dropped in that case rather than printed as zero: with the
  tracking read still fine the rail is up, and `/corp/members` renders no
  summary at all there (`isEmptyRosterDiff`), so a confident zero would be
  exactly the drift AC2 forbids. This is the failed-read branch only — a
  genuinely unchanged roster still shows `0`.
- **The overview reads the roster baseline and deliberately does not replace
  it.** `features/corp/rosterState.ts` stores what this device has already
  _reported_, and `/corp/members` reads and records in one pass so each
  change is announced exactly once. If the overview recorded too, whichever
  surface the user opened first would consume the change and the other would
  show nothing — precisely the failure that module's note rules out for
  #299's background poller, which is why the poller has a key of its own.
  A third baseline key was the alternative and is wrong here for the
  opposite reason: the two surfaces must agree exactly (AC2), and separate
  baselines would let them disagree. So the overview only ever asks, and the
  figure stands until the user follows the link — which is the correct
  behaviour for a tile whose whole job is "should I go look".
- **Every figure comes from the engine call `/corp/members` already makes.**
  `memberStanding` and `DARK_AFTER_MS` for the dark count, `diffRoster` for
  joins and leaves. The total counts the _tracking_ rows, not the id list,
  because `CorpRosterStats` counts tracking rows — counting ids would drift
  from the page the tile links to whenever the two reads disagree. The two
  labels are the roster page's own i18n strings rather than copies, for the
  same reason.
- **Joined/Left are shown at zero, unlike `CorpRosterSummary`, which hides an
  unchanged roster entirely.** That summary is a sentence announcing a
  change and an empty one would announce nothing; this is a rail of standing
  figures, where "0 joined" is the answer to the question the rail is always
  asking — and a chip that came and went would reflow the rail every visit.
  They are labelled `Joined`/`Left`, not "joined this week" as #345's prose
  had it: the figure is since-your-last-visit-to-the-roster, and a
  seven-day label would misstate the number it sits next to.
- **The overview now fires `/members` and `/membertracking` for a Director,
  which it did not before — the same modules, the same `corpCacheKey` rows,
  no new endpoint.** #345's AC5 ("no new ESI read") was written as though
  the overview already loaded the roster; it did not. What makes the
  deviation small is `esi/cache.ts`'s ten-minute freshness window: `/corp`
  and `/corp/members` share both cache keys, so visiting one and then the
  other inside that window costs nothing extra, and the section pays for the
  roster once per window rather than once per page. No name is resolved for
  the rail at all — four counts need no `/universe/names` call — so the
  expensive half of `/corp/members`'s load is not duplicated.
