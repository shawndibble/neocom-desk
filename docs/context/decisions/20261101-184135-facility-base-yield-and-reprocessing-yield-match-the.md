# Scope decisions — Facility base yield and reprocessing yield match the EVE client's wording

_Recorded 2026-11-01._

- **"Facility Yield" is renamed Facility Base Yield, and the breakdown's "Total efficiency" is Reprocessing Yield.** The EVE client's Reprocessing tooltip calls the facility's own figure the "base yield" (51%) and the headline after skills the "yield" (69.7%). We called the first "Facility yield", so a pilot reading 69.7% off the client reached for the box labelled Facility yield and counted their skills twice. The two names now read as the client's do. The stored setting and its key do not change.
- **The Reprocessing Yield is the one you can type.** In the Refine breakdown on the live tab it is editable: the figure typed is the one the client shows, divided by the skills multiplier back to the Facility Base Yield, which is what is saved (rounded to four places, so what you typed reads back as itself). The base stays the saved setting because skills change and a stored headline would go stale; this converts once.
- **Typing it needs one skills multiplier.** Where the pasted ores carry different multipliers (specialisation skills trained to different levels) the Reprocessing Yield is a readout showing the span, and the Facility Base Yield is the box to edit. On a shared link it is always a readout.
