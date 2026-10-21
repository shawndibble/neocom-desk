# Scope decisions — Corp stock targets are their own synced setting, not Stock Lists (issue #4671)

_Recorded 2026-10-21 · issue #4671._

- **A corporation's stock targets live in `sync.corpStockTargets`, `{corporationId: {typeId: quantity}}`, not in `sync.stockLists`.** A Stock List is a market the pilot sells at, counted against their own sell orders and hangars (GLOSSARY.md **Stock Target**); a corp stock target is a minimum the corporation owns across its offices and deliveries, with no location. Reusing the Stock List shape would invent a fake market per corporation and mix two meanings of "target". The setting is account-wide and additive (dev and prod share one Firebase project); its parse drops targets that are not whole numbers above zero and keeps corporation ids it does not recognise. A target below 1 means no target, so an emptied field removes it.
