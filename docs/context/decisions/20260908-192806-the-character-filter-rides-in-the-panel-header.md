# Scope decisions — The character filter rides in the panel header, and disappears for a one-character account

_Recorded 2026-09-08._

- **A Character filter belongs in its panel's `meta` slot, beside the title —
  not in a row of its own inside the body.** Issue #607 first put
  `CharacterFilterControl` in the body of Active Jobs and above the Wallet
  Balance panel, and that placement broke down in three states. Folded, the
  body is hidden but the filter row was not, so the "collapsed" Active Jobs
  panel was still two rows tall with a stray control under its summary. Idle,
  the body is empty, so the control sat alone in a padded box saying nothing.
  And the summary it stands beside — "3 running · 1 done" — has no subject
  without it: the header could not say _whose_ jobs it was counting. `meta` was
  already the panel's one-line read that survives a fold — "a count, a total, a
  countdown" — and the filter names the subject of exactly that sentence, so
  `Panel`'s own doc now says a control may sit there when it names what is
  being read rather than acting on it. This rules out the header's right-hand
  `actions` cluster: those are verbs (export, refresh, fold) and have no room
  at 390px, while the filter is a noun that says whose panel this is.

- **The filter is not rendered at all for an account holding one Character.**
  "This character" and "All characters" both resolve to the same pilot, so the
  control cannot change anything — `OpenOrdersPanel` already gated its own
  strip this way. This does _not_ extend to Settings' Defaults panel: that
  picker is an account-level synced preference that takes effect the moment a
  second Character is added, so it stays visible with one.

- **Discoverability is still the reason the filter renders while pinned to
  "This character."** #607's original constraint holds unchanged — an idle
  panel is the single best moment to find the cross-character view, because
  "nothing running here" is when the pilot most wants to know what an alt is
  doing. So the empty state keeps the filter rather than dropping it; only its
  _placement_ moved.

- **The Corp/My jobs `OwnerSwitch` stays in the body.** It is a two-option
  segmented control, far wider than a dropdown trigger, and it answers a
  different question (which _owner's_ jobs, not which of my pilots).

- **`OpenOrdersPanel` keeps its filter in a body strip, and that is not drift.**
  Its copy sits among that panel's other filter chips, in a `Panel` whose
  header carries no title for the filter to stand beside, and it gates on
  Characters that actually _have orders_ rather than Characters that exist. The
  `meta` rule above is about a filter that qualifies a panel's header summary;
  there is none there to qualify.
