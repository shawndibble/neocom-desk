# Scope decisions — Implant Finder prices LP Store offers and searches boosters

_Recorded 2026-10-02._

Builds on `20261002-194757-implant-finder-finds-implants-by-trying-them-on.md`,
whose "out of scope" list this closes.

- **Every LP Store is searched, not only stores the pilot holds LP with.**
  Stores carry no index of what they sell, so the first search reads all of
  them (each cached a day). An offer the pilot can't redeem is still worth
  seeing — it says what to save LP for.
- **An LP offer costs ISK + LP × that store's LP Value + the turn-ins not
  already owned, bought at the pilot's Trade Hub** (see
  `20261002-222635-lp-value-defaults-to-each-stores-market-rate.md`), per
  unit when one redemption hands out several.
- **What the pilot can buy now comes first.** An offer they lack the LP for,
  or whose turn-in nobody sells, sinks below the next source they can use and
  is shown as "Cheaper if you could", with what's missing. A turn-in that can
  be bought is not a blocker: its price is added. An offer whose LP nothing
  prices sits after priced sources and never wins a fix.
- **An unreadable LP balance doesn't block.** With no Character, or no loyalty
  scope, offers aren't checked against a balance; the toolbar says so once.
- **A fix is priced bought together.** One store's LP and the pilot's owned
  turn-ins are spent once across every item of the fix, so two items can't
  both claim the same LP or the same tag.
- **Boosters are searched like implants**, slotted by their "Booster Slot NN"
  market group, strengths grouped Synth to Strong. Their side effects aren't
  counted in what they're shown to do; a replaced or removed booster takes its
  switched-on side effects with it.
- **Weapon goals are per weapon type on the Fitting** — turrets, missiles,
  drones, fighters — plus applied DPS against the page's selected Target
  Profile (at its best range), weapon range and signature radius, so an
  implant or booster that improves application or reach is found too. Goals
  nothing on the Fitting uses are listed apart as "Not on this fit".
