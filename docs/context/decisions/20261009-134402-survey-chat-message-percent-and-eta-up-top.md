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
