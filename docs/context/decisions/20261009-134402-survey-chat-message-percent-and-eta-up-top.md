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
- **The message sits in a closed box.** The ETA is set into the top rail (`╔═[ … ]═╗`) and the link into the bottom one (`╚[ url ]╝`), each centred; the bar, with its percent after it, and the Left line sit between `║` rails. The box is as wide as the Left line, or as the link when the link is longer, and the rails and bar stretch to it, giving up their spare `═` first. The chat font is proportional, so the right edge lines up by character count, not pixel for pixel; check it in game. The link is bracketed by spaces so link detection stops at them. Only box and block characters that the forum thread on special characters reports working in EVE are used.
- **A line may run to 60 visible characters, up from 56,** so a box can hold two long ore names ("Brimful Zeolites", "Brimful Bitumens") and the "N other" count. It is still a count-based guess: shrink it, and drop the second ore, if a line is seen to wrap in game. The percent leaves the headline and follows the bar.
