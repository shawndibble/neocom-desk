# Scope decisions — Customize permissions at sign-in, Core Grant plus opt-out Permissions

_Recorded 2026-09-24._

- **The plain "Log in" button still asks for the whole Base Grant.** The
  complaints come from users who want to grant less. Everyone else keeps a
  one-click sign-in and never meets a later prompt. A secondary "Customize
  permissions" action under the button is the way to ask for less. Rules out
  making the plain button ask for the Core Grant alone.
- **Core Grant = skills, skill queue, structure lookup (names + search).**
  These are what other pages quietly depend on. Missing skills make training
  time, industry time and fees wrong rather than empty. Missing structure
  lookup leaves structures unnamed everywhere. Everything else is a
  Permission. Implants and standings also shift numbers, but only at the
  margins, so they are optional. A page that uses them without the grant says
  what it assumed ("no implants", "base standings") instead of computing
  silently.
- **Permissions are feature-level, not one per scope.** The Permissions are
  Wallet, Market orders, Contracts, Assets, Industry (blueprints + jobs),
  Mining, Planets, Mail (read/organize/send), Calendar (read/respond), EVE
  notifications, Character details (implants, clones, location, contacts,
  standings, loyalty), Corporation, and Structure markets. Each scope sits in
  exactly one Permission. Each checkbox is labelled with the pages it unlocks.
- **Corporation and Structure markets stay opt-in.** They start unchecked in
  Customize and are not part of the plain button's request, which is
  unchanged from before.
- **A declined Permission is asked for through the existing re-login
  banner.** Only pages missing the Permission show it. It asks for the Core
  Grant, plus what the Character already holds, plus that page's Permission,
  never the whole Base Grant. Otherwise the banner would re-ask for every
  Permission the user just customized away. No automatic redirect to SSO on
  page visit.
- **Customize never revokes.** The concern is granting in the first place;
  once a Permission is granted, users do not want to remove it. There is no
  Remove action anywhere in the app. Revocation stays on CCP's own site.
- **Add Character becomes a split button.** The main action adds a Character
  with the Base Grant. A dropdown arrow on its right offers "Add with specific
  permissions…", which opens the same dialog as the login page.
- **Settings gains a per-Character Permissions section.** It lists what is
  missing, each with a Grant button, and generalizes today's Corp access row.
- **A stored Character re-added with fewer Permissions keeps its cache.**
  Add Character cannot know who is logging in until EVE sends them back, so
  someone may pick an existing Character and uncheck something they already
  granted. The narrower token is accepted and nothing is purged. The pages
  that lost access show their usual grant banner. Rules out bouncing back to
  SSO for the old grant, which would be a consent screen nobody asked for.
- **Alerts backed by a declined Permission show as disabled in Notification
  settings.** Each is marked "Needs the <Permission> permission" with a Grant
  link. Rules out hiding them, which hides the reason, and leaving them on
  but never firing, which looks like a bug.
- **The Settings Corporation row stays role-aware.** It is hidden for a
  Character with no Corp Role and offers Grant only for
  `roles-without-grant`. A line member is never offered a grant that unlocks
  nothing.
- **The Customize dialog is a modal.** The Core Grant sits at the top,
  checked and locked, with a one-line reason. Below it are the thirteen
  Permissions, each captioned with the pages it unlocks, plus Select all /
  Select none and a primary "Log in with selected permissions" button. The
  login page's permissions hint gains one sentence pointing to Customize.
  The layout is the compact two-column checklist ("A" in the mockup canvas,
  https://claude.ai/artifact/5k5YKNAfHQxmEQVmTh8GoW), with a one-line
  "unlocks" caption under each label and an "opt-in" tag on Corporation and
  Structure markets. Raw ESI scope names are not shown. The table with a
  scope column and the list-plus-detail pane were both rejected as heavier
  than the choice needs.
- **The Customize checkboxes remember the last choice, device-locally.**
  Adding several alts in a row keeps the same selection. It is a view
  preference, so it stays out of the URL and is never synced.
