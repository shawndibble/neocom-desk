# Scope decisions — Survey chat message calls out ores by value left and bars colour by ISK per m3

_Recorded 2026-10-09._

- **The chat message's "Left:" line is ordered by the ISK left in each ore, not
  by volume.** The scanner's own ISK column is summed per ore. The top three ores
  are named, each with its rock count; the rocks of every other ore are grouped
  into one "N other" count. With no ISK in the scan it falls back to volume, as
  before. The same order runs the ore list on the page.
- **An ore bar's colour is how rich the ore is: ISK per m³ left, against the
  richest ore on the field.** Gray, blue, yellow, orange, at 0–55%, 55–75%,
  75–90% and 90–100% of the best. It is value per m³, not total value, because a
  miner is limited by cargo and a small rich ore beats a big poor one; it is
  relative to the field because what counts as rich moves with the market. The
  ISK and the percent are printed beside every bar, so colour is never the only
  signal. Yellow is `warning` and orange is halfway from `warning` to `danger`,
  the rule Kill heat already uses (DESIGN.md), so there is no new palette. The
  chart's ore layers keep their own categorical tones, named in the chart's
  legend.
- **A message line may run to 56 visible characters, up from 50.** RockRadar's
  widest lines are about 52 characters, mostly box-drawing characters that run
  wider than letters in the chat window's proportional font, so plain text fits
  a little longer than the count suggests. 56 lets "Left: 5 Scordite · 15
  Pyroxeres · 20 Veldspar · 4 other" through. It is a count-based guess, not a
  measurement, so shrink it if a line is seen to wrap in game.
- **The page follows the chart-led mockup.** Paste bar above the panel, percent
  first, then legend and charts, then large stat tiles under the chart; on a
  phone the Copy chat message button moves from the panel header to full width
  under the chart so the title is not squeezed.
