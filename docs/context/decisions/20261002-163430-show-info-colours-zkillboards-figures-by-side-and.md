# Scope decisions — Show Info colours zKillboard's figures by side and sign

_Recorded 2026-10-02._

- **The Danger and Fleet size meters take the colour of the end they lean
  to: green towards snuggly and solo, red towards dangerous and gang, neutral
  at exactly 50.** Asked for by the user reviewing a corporation, who reads
  those two meters first. It sits beside `20261002-145207`'s "the app adds no
  verdict of its own" rather than against it: the colour restates which end
  of zKillboard's own scale the figure is on, which the readout already says
  in words ("78% dangerous"), so nothing new is claimed and nothing rests on
  telling red from green. `danger`/`success` here mark a side of the scale,
  an exception to DESIGN.md §1's reservation of `danger` for errors, scoped to
  these two meters.

- **Kills read green and losses red on every Show Info tab, without a sign.**
  Also the user's call. They borrow `isk-pos`/`isk-neg` because a kill and a
  loss are the same gain/loss pair those tokens mean for ISK; the sign
  DESIGN.md §6 asks for is carried by the tile's own label ("Kills",
  "Losses") instead, which no reader can take the wrong way round. ISK
  destroyed and ISK lost stay uncoloured.
