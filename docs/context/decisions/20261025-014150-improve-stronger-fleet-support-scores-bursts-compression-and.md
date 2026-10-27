# Scope decisions — Improve: Stronger fleet support scores bursts, compression and core fuel (issue #5032)

_Recorded 2026-10-25 · issue #5032._

- **Stronger fleet support is the mean relative gain over the fleet figures the fit already has: summed burst buff size (each burst's strongest buff), mean burst reach, best compressor reach, and the industrial core's fuel per cycle (lower is a gain).** A figure the swap loses (a dropped core) counts as a full loss. Read from `fleetSupport` (`improveCommand.ts`), the same figures What to train's burst metrics use. Disabled with "No command bursts, compressors or industrial core on this fit". Burst duration and reload stay out: they are What to train's.
- **Fighter DPS on fighter fits needed no work:** More damage already scores `fighters.dps`. Fighter range is skipped by the engine.
- **Jobs.** A new `fleet` job (Command Burst 1770, Compressor 4174, Industrial Core 515) is scored by this goal and protected from every other goal's Rework. Cap stability stays the guardrail.
