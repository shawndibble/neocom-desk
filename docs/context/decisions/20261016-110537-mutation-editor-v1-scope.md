# Scope decisions — Mutation editor v1 scope

_Recorded 2026-10-16._

- **Only fitted modules can be mutated in the editor; mutated drones are
  flagged, not edited.** A drone type's List row shows "Rolls unknown" or
  "Base unknown" when any of its units needs it, with no fix in the tooltip:
  drones have no module dialog to hold the Mutation section, and each mutated
  drone is its own stack of one, so editing them needs its own UI. Mutated
  drones still load from EFT, share codes and assets with their rolls. The
  Ring has no drone tiles, so it has no drone flag.
- **The mutaplasmid picker groups by strain read from the mutaplasmid's
  English name.** The SDE has no strain field: every mutaplasmid is in one
  group (1964), and `dynamicItemAttributes` carries no strain. All 441 names
  start with one of the six strains (Decayed, Gravid, Unstable, Glorified,
  Exigent, Radical); anything else falls into "Other". The names are the
  baked SDE's English `types.json` names, never translated text, so this
  holds while the app is English-only. If the app is ever localised, compute
  the strain at bake time and store it in `mutaplasmids.json`.
- **The "Rolls unknown" / "Base unknown" flags add no fetch of their own.**
  Every view that shows a Ring or List also runs the fitting stats, and the
  dogma engine already loads the mutaplasmid lookup on start
  (`dogmaFittingEngine.ts`), so the flags share that one load. Gating the
  flags on `item.mutation` would hide "Base unknown", which by definition has
  no mutation. To load the lookup only for fits that hold an abyssal item,
  change the engine's eager load, not the flags.
- **"Remove mutation" is the reset.** It turns the module back into its base
  module. There is no "reset rolls to starting values" control: those values
  are the base module's own, which nobody rolls toward, and §6c's restraint
  rule asks for no control without a real use.
- **Mutate… and Variations open after the module menu closes**
  (`useOpenAfterMenu`, DESIGN.md §6c "Menu item that opens a dialog"), so
  focus returns to the menu's trigger when the dialog closes.
