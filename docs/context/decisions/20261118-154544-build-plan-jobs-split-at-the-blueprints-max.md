# Scope decisions — Build Plan jobs split at the blueprint's max production limit (issue #6393)

_Recorded 2026-11-18 · issue #6393._

- **A node past its blueprint's max production limit is several jobs.** `maxProductionLimit` (Fuzzwork `industryBlueprints.csv`, baked into `blueprints.json`; absent means no cap) is the Runs field's cap in game; the cost engine and the schedule now build `ceil(runs / limit)` jobs instead of one the game would refuse.
- **Runs are spread evenly, largest job first.** 90 runs at a limit of 40 is 30/30/30, not 40/40/10, so ME rounding and duration stay balanced; the remainder goes to the first jobs (100 at 40 is 34/33/33). Total runs never change.
- **Materials round per job; the fee does not need to.** ME rounding is per job, so each job's materials are rounded then summed. EIV is linear in runs, so the split jobs' fees sum to one fee at the total runs and stay priced once.
- **`seconds` is the longest job.** The split jobs run in parallel, so a node's duration is the first (largest) job's; each job is its own schedule node with `seconds x runs / largest runs`, and a parent waits on all of them.
- **Out of scope:** a longest-job target in days, splitting across owned copies (#3988), owned BPC runs.
