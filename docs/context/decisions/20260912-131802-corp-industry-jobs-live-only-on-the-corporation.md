# Scope decisions — Corp industry jobs live only on the Corporation page

_Recorded 2026-09-12._

- **The Industry section's Active Jobs panel shows only the pilot's own jobs.**
  Its My jobs / Corp jobs `OwnerSwitch` is gone: corporation industry jobs are
  already on the Corporation page (`routes/Corp.tsx`, which calls
  `loadCorporationIndustryJobs` itself), so the toggle duplicated that page in
  a bar that spans every Industry page. Rules out reading corp jobs from the
  Industry section at all — the panel no longer calls `useCorpOwner` or
  `useCorpSnapshot`. The character filter beside its title still narrows which
  of _my_ pilots the list covers; that axis is unaffected.
- **The folded Active Jobs header shows counts and the next finish, not a bar
  per job.** The row of up to four mini progress bars beside the caret is gone.
  Folded, the header keeps "N running · N done", the next blueprint to finish,
  and the job-slot readout; the per-job progress bars stay in the expanded
  table's Progress column, one click away.

- **Supersedes the `OwnerSwitch` bullet in
  `20260908-192806-the-character-filter-rides-in-the-panel-header.md`.** That
  decision placed the switch in the panel body rather than its header; there is
  no switch on Industry any more. Its reasoning about the _character filter's_
  placement is untouched and still holds.
