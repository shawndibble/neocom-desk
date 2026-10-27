# Scope decisions — Login page sells the shipped product, and a test pins the catalog

_Recorded 2026-09-07._

- **The signed-out page argues from four questions, not from a feature list.**
  The old page opened straight into an eight-row catalog, which describes what
  the app _has_ and leaves the reader to work out why they'd want it. Four
  question-led blocks now sit above the catalog — "which of my orders is
  quietly losing ISK", "is this blueprint worth building today", "what is this
  training plan really going to cost me", "who owes what on the moon rental" —
  each naming a surface a signed-in pilot actually opens, so the claim under it
  can be checked against the app rather than admired. This rules out generic
  benefit copy: a block that can't point at a route doesn't go on the page.

- **The consent list is derived from the registry; the feature catalog is
  not, and the two are pinned differently on purpose.** Both had rotted: the
  catalog's eight rows had fallen behind Moon Mining, Corporation,
  Notifications, the Open Orders worklist, reactions, the Production Log and
  the PI planner, and `permissionsHint` had been omitting four Base Grant
  scopes outright. Only one of them is derivable, so only one gets a real
  guard. `Login.test.tsx` holds `BASE_GRANT_PHRASES`, a scope-to-disclosure
  map asserted equal to `SCOPES` — registering a new ungrouped endpoint now
  fails that test until someone writes how it will be disclosed, which is a
  judgement a person has to make and a test can only force. The catalog's
  twelve rows are pinned as strings: that stops a silent rename or deletion,
  and nothing more. A new route shipping with no row still fails nothing,
  because nothing enumerates the routes and not every route earns a row.
  Claiming otherwise would be the same kind of overstatement this page was
  being cleaned of.

- **Catalog groups follow the app's own nav groups.** Progression / Economy /
  Operations, so the marketing page and the signed-in shell describe the same
  product in the same order. Not the nav's literal
  `nav.groups.progression|economy|social`: "social" is the shell's grouping of
  three character views, while the page's third group also has to hold
  Corporation and Notifications, which are neither social nor progression.

- **The scope enumeration moved out of the hero and above the closing CTA.**
  It is consent copy, and at 11px `text-faint` beside the first button it was a
  wall nobody read. It now sits under the four trust points, at `text-xs`
  `text-dim`, directly above the button that starts the grant — where the
  hesitation actually happens. `trustLine` moved off `text-faint` for the same
  reason: DESIGN.md §7 restricts that token to decoration, and "your refresh
  token never leaves this device" is the page's single best argument.

- **The enumeration is derived from the Base Grant, and was wrong before.**
  Checked against the ungrouped entries in `esi/registry.ts`: the old prose
  omitted the mining ledger, blueprints, current location and corporation
  roles, all of which the consent screen has been asking for. Being incomplete
  here is a different class of defect from being thin elsewhere on the page, so
  this paragraph is maintained against the registry, never trimmed for rhythm.
  The `corp` Scope Group is named as separate and opt-in rather than folded in.

- **`app.tagline` and the PWA manifest description stay one sentence.** The
  tagline ("character, skill planning, and industry companion") predated
  market, planetary, moon mining and corp. Both were rewritten together, with a
  comment in `vite.config.ts` pointing at the i18n key, because the login hero
  renders that key and a manifest that disagrees with the page is how the two
  drifted the first time.
