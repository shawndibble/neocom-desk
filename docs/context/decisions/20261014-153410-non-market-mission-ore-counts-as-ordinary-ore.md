# Scope decisions — Non-market mission ore counts as ordinary ore in the mining ledger

_Recorded 2026-10-14._

- **Ore with no market group (mission-only Banidine, Augumene, Green Arisite and similar) counts as ordinary ore.** `oreAndIceTypeIds.json` takes published Asteroid-category types as well as the market tree, so the ledger stops flagging them as unclassified. It rules out making pilots tag each one by hand; gas stays in its own list.
