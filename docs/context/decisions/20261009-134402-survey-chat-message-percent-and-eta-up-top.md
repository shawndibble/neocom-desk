# Scope decisions — Survey chat message: percent and ETA up top, long bar, two richest ores

_Recorded 2026-10-09._

- **The first line is `N% · ETA: <b>HH:MM EVE</b> (~left)`; the status words are gone.** "Rocks
  cracking" and its kin said what the percent already says.
- **The bar is 48 cells, flush left, with no end caps and no percent.** It is the widest line
  of the message. The `▕ ▏` caps indented it and read thin next to the blocks, and the
  percent moved to line one.
- **"Left:" names two ores, richest per m³ first, then the rest as "N other".** It is the
  order the page's ore list uses (`sortByValuePerM3`, compressed Jita-style prices), so the
  message and the page agree. It replaces the order by total ISK left. With no ISK, volume
  order stands.
- **Supersedes the "top three ores, by total ISK left" ordering in the 095750 decision;** its 56-character line limit still stands. A long ore name can make the Left line longer than the bar.
- **The message sits in a frame open on the right.** The headline is set into a top rail (`╔═[ … ]══`), a `║` rail runs down the bar and the Left line, and a short `╚═══════════` rail closes it. The right edge is left open because the chat font is proportional and would never line it up. Both rails stay short so the bar is the one long line, and the link stays on its own unframed line so nothing trails it. Only box and block characters the forum thread on special characters reports working in EVE are used.
