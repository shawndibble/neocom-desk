# Scope decisions — Login page drops the read-only claim and follows the real nav

_Recorded 2026-09-24._

Supersedes parts of `20260907-010343-login-page-sells-the-shipped-product-and-a.md`.

- **The page no longer calls the app read-only.** The Base Grant carries three
  write scopes (`esi-mail.send_mail.v1`, `esi-calendar.respond_calendar_events.v1`,
  `esi-mail.organize_mail.v1`), and the page said "Read-only" in its eyebrow,
  trust line, trust heading, first trust card and permissions sentence. The
  framing now matches `public/privacy.html`: it reads, never trades or touches a
  colony, and writes in three places only when the pilot acts. A test pins that
  the old phrasings stay gone. The per-feature "Read-only" row tags (Clones,
  Wallet, Assets) stay — those surfaces really are.

- **The headline sells the worked-out answer, not multi-character.** Handling
  several characters is table stakes among EVE tools and the page already said
  it five times. The hero now leads with "Answers, not API dumps."; multi-character stays in the tagline and is backed by a
  question ("Which character needs my attention?") rather than repeated.

- **The moon-rental question is dropped.** "Who owes what on the moon rental"
  read as a landlord collecting from renters, which the app cannot do (it
  would need the moon owner's observer endpoint and Accountant role, per
  `20260905-170644-moon-mining-tax-ledger.md`). The ledger is the renter's view
  of what they owe; the Mining catalog row now says so. The questions are now
  six — attention, orders, build, training, colonies (PI Advisor), appraisal —
  kept even because the grid is two columns.

- **Catalog groups now mirror `Layout.tsx`'s nav, Clones aside.** Progression
  (Skills, Clones, Industry, Mining, PI) / Economy (Market, Orders, Wallet,
  Assets, Contracts) / Social (Mail & Calendar, Contacts), with the nav's
  unlabelled head — Corporation and Alerts — as "Command", carrying
  Notifications. This reverses the earlier "Operations" group: by now the nav
  files Mining and PI under Progression and Contracts under Economy, so the
  old grouping no longer matched the shell it claimed to follow.

- **A screenshot gallery sits between the questions and the catalog.** Real
  captures from the Play Store listing, in `public/screenshots/` as WebP,
  lazy-loaded and outside the PWA precache glob so signed-in users never pay
  for them. The hero preview stays the illustrative mockup; the gallery is the
  evidence.
