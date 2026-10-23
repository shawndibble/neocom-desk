# Scope decisions — Mercenary Den clock kind takes orchid; kinds are drawn as glyphs on the map and legend (issue #4806)

_Recorded 2026-10-23 · issue #4806._

- **`kind-mercenary-den` is orchid `#c88be9`**, the ninth clock kind. It fills the
  hue gap between `kind-skill-training` and `kind-contract-expiry` inside the set's
  band (LCh L 66–84, C 22–56): 59 ΔE (CIE76) from the nearest status tone, 25 from
  the nearest kind, 16 under simulated deuteranopia (the set's worst pair is 12), and
  6.7–7.7:1 on bg, panel and panel-2. A muted green scored higher on separation and
  was refused: green reads as `success`, which is the confusion the 20 ΔE rule exists
  to prevent. Neon greens and yellows outside the band were refused as off-palette.
- **Every kind is drawn as its glyph, not a dot**, on the Calendar Map's day cells and
  in the filter menu, which is the legend (`calendarKindIcons.ts`). Colour was the only
  visual signal on the map; the rail already carried the glyph. The phone Day Ticker
  keeps its 2px segments: there is no room for a glyph and the day's count is beside it.
- **Den clocks:** a reinforcement end while still ahead and each open operation's
  expiry, from the Character's own den reads; the Mercenary Dens glyph is
  `CastleTurret`.
