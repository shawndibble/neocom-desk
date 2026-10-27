# Scope decisions — Login page: courier and assets questions, corp tab rewritten, corp records disclosed

_Recorded 2026-10-24._

- **Two new question tiles, both player questions with their own page.**
  "Which haul pays best per jump?" points at Contracts › Courier, which ranks
  public courier contracts on **ISK/jump** and flags pay far over the **Going
  Rate**. Not Market › Hauling: that tab ranks trade runs, not jumps. "Where did
  I leave that ship?" points at Assets. Rejected: Skyhook raids (an Overview
  widget, and the Overview is already on the page) and SRP (an officer's view
  more than a pilot's). Neither Contracts nor Assets had a capture before.

- **Five captures retaken against the current app:** Open Orders' order
  detail, a fitting, the phone market within 15 jumps, Skills (with a Skill
  Plan, not the empty state) and the Corp Board (now a **Widget board**; the
  old capture showed the retired Standing card and Deadline Strip).

- **The Corporation tab describes the rail group, not the old fixed board.**
  Corp Board widgets, the separate Corp Members / Wallet / Assets pages, Moons'
  **Corp Tax Book** and **SRP**. Catalog rows added: Corp Tax Book and SRP under
  Corporation, Communities under Mail. The old "appears only with a Corp Role"
  line was untrue once a pilot with no role could file an **SRP Claim**.

- **The FAQ now says corp records live on our server.** "What it reads from
  EVE stays on this device" listed every exception except **SRP Claims** and
  the **Corp Tax Book** (ADR 0023, ADR 0026), and Delete all data does not
  remove either: they belong to the corporation. Both FAQ answers say so.
  `public/privacy.html` has the same gap; it is a separate change because it
  needs retention terms stated exactly.

- **"Six writes" is still right.** The trust card groups the mail-type writes
  (reply, Community invite, SRP result) as one, so the count holds.
