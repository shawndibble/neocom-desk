# Scope decisions — Corp industry jobs return to Industry, listed by installer (issue #2302)

_Recorded 2026-09-29 · issue #2302._

- **Industry's Active Jobs panel lists corp-owned jobs again, picked by
  `installer_id`.** The character filter answers "whose jobs", whoever owns
  them: with All characters selected the list shows every job any of this
  account's Characters installed, personal or corp. A corpmate outside the
  account is never "mine", so their jobs are not listed. The reason: the
  2026-09-12 decision removed corp jobs on the grounds that the Corporation
  page already lists them, but it does not. `/corp` uses them only for the
  ops board's `jobDelivery` items, which appear once a job is ready. A pilot
  who only runs corp jobs saw an empty Industry page, because ESI's character
  jobs endpoint never returns a corp-owned job.
- **Each corporation is read once, through any account Character that can**
  (the corp jobs grant plus `canReadIndustry`), preferring the active
  Character so the read shares its cache row with `/corp` and the poller. The
  installer does not need the Factory Manager role: an alt's corp jobs show
  as long as some Character here can read that corporation. The scope is
  checked from the stored token before any call, and the role gate mirrors
  the poller's `corpContextFor`. The loader never rejects, so a failed corp
  read cannot blank the personal list.
- **Rows are badged Corp and deduplicated by `job_id`**, with the personal
  copy winning.
- **A selected Character who granted the corp jobs scope, but whose
  corporation no Character here can read, gets one quiet note.** A Character
  who never granted the corp scope gets none: that was a choice, not a gap.
  This also keeps NPC-corp alts from carrying a permanent note.
- **`corpIndustryJobReady` routes to `/industry?highlight=<job_id>`, not
  `/corp`.** Since the alert fires for every corp job its reader can see,
  including a corpmate's, the panel always keeps the job `?highlight=` names,
  whoever installed it. Otherwise the alert would land on a list that had
  filtered out the very job it named. The panel also expands itself when the
  highlighted job is in its list, for personal alerts too; a pulsed row
  inside a folded panel is a pulse nobody sees. A job that has already been
  delivered is not listed, same as the personal alert.
- **Out of scope, unchanged:** "Log production…" stays personal-only (the
  production log has no corp dimension,
  `20260905-181537-production-log-row-per-allocation-sync-accept-wallet.md`).
  The job-slot readout stays personal-only for now, even though EVE counts a
  corp job against its installer's slots; the Characters page's readout is
  personal-only too, and changing one without the other would make them
  disagree. Delivered job history is not fetched for either owner.
- **Supersedes `20260912-131802-corp-industry-jobs-live-only-on-the-corporation.md`'s
  first bullet.** Its second bullet (the folded header shows counts rather
  than a bar per job) still holds, and the My jobs / Corp jobs toggle stays
  gone: corp jobs are merged into the one list rather than switched to.
