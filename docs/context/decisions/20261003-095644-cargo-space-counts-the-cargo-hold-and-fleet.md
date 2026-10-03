# Scope decisions — Cargo Space counts the cargo hold and fleet hangar, not specialised holds

_Recorded 2026-10-03._

- **A ship's Cargo Space is its cargo hold plus its fleet hangar, and nothing else.** Those are the two holds that take any item; a Deep Space Transport such as the Mastodon carries most of its load in the fleet hangar, so leaving it out made the planner size a 54,500 m³ ship as 4,500. Every other hold is specialised to certain contents (ore and mining holds, planetary commodities, gas, minerals, ammunition, fuel and so on) and is left out, even where it could take what is being hauled: a Trip Plan sizes one load against one number, and counting a specialised hold would need per-item hold eligibility and a plan per hold. Counting a specialised hold when the category fits (a Hoarder's ammo hold on an Ammunition & Charges run) is a possible follow-up, not part of this.
