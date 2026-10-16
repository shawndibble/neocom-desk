# Scope decisions — Mutated-module rolls in Fitting Share Code v3

_Recorded 2026-10-16._

- **A Fitting carries its mutated modules' and drones' rolls.** A mutated
  item is its abyssal type plus an `ItemMutation`: the base type, the
  mutaplasmid, and the rolled attributes as absolute dogma values. This
  supersedes "Abyssal module rolls are not encoded in v1" in
  `20260924-150509-fittings-section-a-fitter-after-all.md`.
- **Fitting Share Code version 3 is version 2 plus a mutations section,
  written only when a mutated item is present.** A Fitting with none still
  encodes as version 2, byte for byte, so builds from before version 3 (an
  installed PWA or the Android app not yet updated) keep opening it, and every
  saved My Fittings record and link stays valid. A build that predates
  version 3 reads a mutated Fitting's code as "unsupported version" — it never
  silently drops the rolls. Each entry names its item by position (rack
  letter or drone, index), then base, mutaplasmid, and rolls. Rolls are cut to
  6 significant digits: no attribute shows more than 4 or 5 in game, so no
  shown figure or roll quality changes, and a roll costs a few characters
  instead of a float's 17. A cruiser with 8 mutated modules of 5 rolls each
  encodes to 418 characters (142 without them).
- **A mutated drone is always a stack of one.** Each is its own item with its
  own rolls; a share code rejects a mutation on a larger stack, and EFT's
  `Drone x2 [N]` loads as two drones.
- **Rolls are filtered to the mutaplasmid's own attributes where they enter
  the app, and again at the engine.** The engine takes any attribute it is
  handed as the item's own value (a live run set a plain module's activation
  cost to 1 that way), and ESI's dynamic item sends the item's full attribute
  set. So the ESI client, the EFT loader and the Assets path keep only the
  attributes the mutaplasmid rolls, and drop a mutation whose base,
  mutaplasmid and type do not belong together. A share code's codec checks
  shape only, so every decode of a code a stranger may have written — the
  share view, the editor's link, Compare — checks its mutations against the
  data too, dropping them all if the data won't load. The engine mapper
  checks every mutation once more whatever its source, and hands mutated
  items in bare without the data. A forged value for an attribute the
  mutaplasmid does roll is not caught: bounding it needs the base module's
  own value, which the data doesn't carry. Swapping a module for a variant drops its
  mutation, and drone launch and recall move mutated drones one item at a
  time, never merging them.
- **Unknown rolls are shown as unknown, never guessed.** Killmails, In-game
  Fittings and a bare `Abyssal …` EFT line carry no base and no rolls, nor
  does an Assets ship opened before ESI answered for its items (Open in
  Fittings waits at most 8 s; what arrived is kept for the next open), and one
  abyssal type is made from many bases (every heavy neutralizer becomes the
  same Heavy Abyssal Energy Neutralizer), so the base cannot be worked out.
  Such an item keeps its slot but adds no CPU, powergrid or effect to the
  stats; the UI badges it (`mutationStatus` `'baseUnknown'`) and the pilot
  can set its base and rolls. Picking a "typical" base was ruled out: it
  would state numbers the app cannot stand behind. When the base and
  mutaplasmid are known but the rolls are not (an EFT block with no roll
  line), the base module's own values are stated, badged `'rollsUnknown'`.
- **Where the data comes from.** Roll ranges, applicable bases and resulting
  types are CCP's `dynamicItemAttributes.jsonl`, baked into
  `public/data/mutaplasmids.json` on every SDE refresh. A real item's rolls
  come from ESI's public `/dogma/dynamic/items/{type_id}/{item_id}`, which is
  immutable per item, so each answer is kept in Dexie for good and an id ESI
  rejected is not asked again that session — that route is bounded only by
  ESI's error limit. EFT follows Pyfa's layout (base name with ` [N]`, blocks
  after the fit), reconstructed from Pyfa's source; no real export sample was
  available to check it against.
