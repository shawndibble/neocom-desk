# Scope decisions — What to train ranks mining, hold, remote repair and jump range

_Recorded 2026-09-30._

- **What to train scores four non-combat stats beside the combat ones: mining yield (m³/h), total hold space, remote repair out (HP/s) and jump range (ly).** Before, a fit whose skills only moved those stats scored zero everywhere and was dropped, so an Exhumer got no mining skills. Each is zero on a fit without that role, so a warship's list gains nothing.
- **Hold space counts only on a fit that fires nothing** (no DPS, no drone DPS). On a warship a bigger hold is noise; on a hauler or Orca it is the point.
- **Command burst strength, burst range and compression are not ranked.** The engine does not compute them as Fitting stats yet, so a skill that only moves them still reads as no change. They need their own extraction first.
- **The rank-by list shows only stats some suggestion moves**, so a warship never offers "Mining yield".
