# Scope decisions — Type effects of interest baked into one general file (issue #5629)

_Recorded 2026-10-30 · issue #5629._

- **One baked file, `public/data/typeEffects.json`, keyed by dogma effect: `{ "980": [typeId, …] }`.** The dogma engine's results carry attributes and state, never effects, and the baked data keeps no effect lists (only the on-demand `typeInfo` shards do), so a fact that is only an effect cannot be read while stats are worked out. `scripts/build-sde.mjs` bakes it from `typeDogma.jsonl` (`scripts/lib/typeEffects.mjs`), published types only, ids sorted. It rules out a file per effect.
- **The allow-list is `TYPE_EFFECTS_OF_INTEREST` in `scripts/lib/typeEffects.mjs`; today `{ 980: 'cloakingWarpSafe' }`.** A later need adds an entry there, in its own ticket, not a new file. Effect 980 marks a Covert Ops cloak (Covert Ops Cloaking Device II and its Smokescreen variant today).
- **`warpsCloaked` is display only.** A 0/1 field in `NUMERIC_FIELDS` (shown yes/no), on the Exploration card whenever a cloak is fitted; it joins no `GAIN_METRICS`. The engine stays pure: `extractExplore` takes the covert cloak type ids as an input, and `dogmaFittingEngine.ts` loads the file with the engine.
