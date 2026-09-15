# Scope decisions — One onboarding banner at a time (issue #1124)

_Recorded 2026-09-15 · issue #1124._

- **The three fixed onboarding banners share one slot, arbitrated by a
  module-level store (`src/app/onboardingBannerSlot.ts`) rather than a React
  context.** `InstallPrompt` is mounted in `App` as a sibling of `Layout`
  while `NotificationPermissionPrompt` and `CorpGrantPrompt` are inside it,
  so the banners share no subtree a provider could wrap without restructuring
  the app shell. This rules out a `Layout`-only wrapper, which cannot reach
  the install banner at all.
- **Priority order is corp grant > notifications > install.** Corp grant is
  the rarest and most perishable — offered at the moment a Character becomes
  a Director and, by design (round 42), never again for that scope set.
  Install is last: least urgent, and about the device rather than anything
  the user just did. The ticket left the order unstated; it is not derived
  from the old stacking offsets, which encoded painting order, not urgency.
- **Each banner keeps its own eligibility logic untouched; the slot only
  decides which eligible banner mounts.** `shouldShowPermissionExplainer`,
  `selectInstallPromptVariant` and the `roles-without-grant` + dismissal
  check are unchanged, so nothing here can alter _whether_ a banner is owed
  to the user — only _when_ they see it.
- **All three mobile offsets collapse to `bottom-16`; `md:` offsets are
  untouched.** The staggered `bottom-16`/`bottom-28`/`bottom-40` existed
  purely to keep the banners from overlapping each other. With one visible at
  a time, a lone `CorpGrantPrompt` at `bottom-40` would float mid-screen and
  bury the content this ticket exists to uncover. A single offset clear of
  the phone tab bar is the only position that still makes sense.
- **`ReloadPrompt` stays out of it.** It is a service-worker update prompt,
  not onboarding: it is not one-time, not dismissible-forever, and fires on a
  deploy rather than on a first login. It also renders no UI of its own, so it
  never competes for the bottom band in the first place.
- **The e2e count assertion is on `role="alert"`, as the ticket's AC words
  it** — the stronger invariant, since it would also catch a future fixed
  banner that regressed the rule without opting into the shared
  `data-testid="onboarding-banner"`. The testid exists only to say _which_
  onboarding banner is showing.
