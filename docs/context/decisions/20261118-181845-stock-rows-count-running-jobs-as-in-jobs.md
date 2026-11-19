# Scope decisions — stock rows count running jobs as In jobs (issue #6429)

_Recorded 2026-11-18 · issue #6429._

- **A Stock List row gains a third count, In jobs: units the pilot's active
  manufacturing and reaction jobs will deliver to the market.** Copy,
  invention and research jobs make no product and never count; corporation
  jobs are out of scope and the UI never implies corp-built stock is
  included. Units are runs times the blueprint's product quantity per run
  (a BPC job's own runs). Stock Targets v1 scope still stands: **Listed** alone
  measures status and the below-target alert, so a row with 20 in build still
  reads Out and In jobs is what explains it. In jobs only shrinks the part of
  the **Shortfall** still to source, after the hangar's share
  (`toSource = shortfall - fromHangar - fromJobs`, never below zero), and every
  consumer reads that one number: the markets list, Overview card, cost to
  fill, Builder view and CSV. The share link carries no counts and is unaffected.
- **Output location: a job counts only when its `output_location_id` equals
  the market's location id exactly.** Probe result (ESI schema, not a live
  character): `output_location_id` is "normally a station ID, but can also be a
  corporation facility", so a hangar delivery names the station or structure
  and equals the market id; a container or corporation facility yields some
  other id, and nothing in the jobs payload says where that id sits. Rather
  than guess by walking assets, anything that does not match exactly (an
  unresolvable container or structure id, or the field absent from an old
  cache) is not counted and goes in the "N jobs deliver elsewhere" footnote,
  counted for jobs whose product is on the list. This under-counts rather
  than over-counts, which only ever errs toward telling the pilot to start
  a batch, the status quo.
- **Cache skew: assets and jobs never both count a unit.** A job counts In
  jobs only while it is in the active jobs list (about 5 min cache). Once it
  delivers it leaves that list and the assets (about 1 h cache) own the units,
  so for as long as the assets lag, those units are in neither count rather than
  in both. Staleness shows through the existing data-age badge, now the
  oldest of the asset and jobs reads. A job whose end time has passed but is
  still in the list still counts, and its row reads "ready to deliver".
- **The below-target alert notes jobs but does not change.** It still fires on
  Listed crossing Low or Out; its body adds how many units are in running jobs.
  Jobs are read from the cache only inside the poll.
