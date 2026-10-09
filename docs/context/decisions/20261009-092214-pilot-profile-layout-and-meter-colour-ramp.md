# Scope decisions — Pilot profile layout and meter colour ramp

_Recorded 2026-10-09._

- **The Threat verdict is the only red on a pilot's profile.** The user found the
  profile read as red everywhere. The red badge beside the name, the red chips,
  the red meter fills and the red nullsec bars are gone; the band's level word
  keeps its colour. Every chip is neutral. This supersedes `20261002-163430`'s
  green-or-red-by-side meters.

- **Meter fills follow a desaturated gray, blue, green, yellow, orange, red ramp
  by percentage** (`ratioMeterColor`), and nothing warm appears until a value
  passes about half. The user wanted urgency without a yellow meter on a
  yellow-tier pilot. The readout stays plain text and the figure is always
  printed. A 99% Fleet size is dusty red even though a gang pilot is not
  necessarily worse; the ramp says "more", the words say what.

- **Kind of space has its own hues.** Highsec and lowsec keep success and
  warning; nullsec is periwinkle (`space-nullsec`) and wormhole lilac
  (`space-wormhole`). This also recolours the Local list, so a space reads the
  same everywhere.

- **The six-month chart is always open and carries the 30-day counts.** The
  user called it the most important graph and said it should not collapse. On a
  wide profile it sits left of "How they fight"; on a phone the meters are one
  row above it. The legend went: each count's coloured rule and name key the
  bars. Bars are width-capped so six months do not read as slabs.
