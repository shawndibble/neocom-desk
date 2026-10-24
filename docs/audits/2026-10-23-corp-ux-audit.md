# Corporation pages UX audit for a new Director or CEO

_Recorded 2026-10-23. Branch `audit/corp-ux-2026-10`._

**Goal.** Can a Director or CEO who has never used Neocom Desk find the corporation pages, set up Mining Tax (the Corp Tax Book) and SRP, and read the other corp pages without getting lost? Every finding below records what was expected, what the app did, and how it could be better, so each can become one ticket.

**How it was tested.** The real app (`npm run dev` on this branch) against the Firebase emulators, with a mocked EVE SSO, a mocked ESI and mocked zKillboard/Fuzzwork/Open Prices, driven by a headless Chromium. One corporation (Test Corp, 12 members, 2 Athanors, 1 Fortizar, moon mining ledger, wallet journal, assets, killmails). Personas: Test Pilot (Director, the audit persona), Aria Vance (CEO), Bram Okonkwo (Accountant), Dax Ferrin (no roles). Widths 1280, 1024, 768 and 390. Screenshots and the harness are in `.audit/corp-ux/` in this worktree (not committed). Fixture-caused oddities (wrong ore names, fake prices) are left out.

Severity: **High** blocks or misleads a new officer; **Medium** costs time or trust; **Low** polish.

## Summary

| Area                  | High  | Medium | Low    |
| --------------------- | ----- | ------ | ------ |
| Discovery and grant   | 1     | 0      | 2      |
| Corp Board            | 1     | 3      | 3      |
| Members               | 0     | 1      | 3      |
| Corp Wallet           | 0     | 1      | 1      |
| Corp Assets           | 1     | 2      | 1      |
| Moons (Corp Tax Book) | 1     | 11     | 14     |
| SRP                   | 0     | 4      | 5      |
| **Total**             | **4** | **22** | **29** |

## What worked well

- Role gating is clear: an Accountant sees Corp Board, Corp Wallet, Moons and SRP; `/corp/members` as an Accountant explains that EVE only opens member tracking to a Director; a no-role member gets a plain "No corporation access" page.
- The Corp Tax Book statement flow (Check, Send, Done) with mail preview, progress chip and verify link works end to end.
- SRP: filing from the lost-ships list, fixed Hull Rule, killmail-percent chain, approve and reject toasts with mail, History and Activity all behave.
- No page scrolls sideways on a phone (390px); tables switch to cards or their own scroller.

## 1. Discovery and granting access

### CX-01 · High · Nothing tells a new Director that corporation pages exist

- **Page:** rail after first login; `/overview`.
- **Expected:** a Director who signs in sees a Corporation entry, a locked teaser, or an Overview nudge saying corp pages unlock once Corporation access is granted.
- **Got:** the rail has no Corporation group at all until the grant is done. The only ways in are Settings › Permissions › Corporation › Grant, typing `/corp`, or the command palette. The Overview only shows "Test Corp / Test Alliance".
- **Better:** show the Corporation group header with one dim row "Grant corporation access" for a character whose corp grant is missing (hide it after a dismissed "I hold no roles"), or an Overview card for the same.
- **Evidence:** `00-after-login.png`, `01-corp-first-visit.png`, `02-settings-permissions.png`.

### CX-02 · Low · Permission copy does not say what each corp grant unlocks

- **Page:** `/settings/permissions`.
- **Expected:** the three separate corp-related grants (Corporation, Corporation projects, Killmails) say what page each unlocks and that Killmails is for SRP's lost-ship list.
- **Got:** "Corporation roles show once granted." and "Your own losses, so you can pick one to file for ship replacement." with no link between them and no mention of SRP or Moons.
- **Better:** name the pages ("Unlocks Corp Board, Members, Corp Wallet, Corp Assets, Moons, SRP officer view") and link Killmails to SRP.

### CX-03 · Low · Three SSO round trips to be fully set up

- **Expected:** one grant for a Director.
- **Got:** corp grant on `/corp`, killmails grant on `/srp`, and a third for Corporation projects. Each is a full redirect to EVE login.
- **Better:** when the corp grant is requested from `/corp`, offer the related opt-in groups in the same login (one checkbox list), as Customize permissions does.

## 2. Corp Board (`/corp`)

### CX-04 · High · Due soon treats past events as critical "late" deadlines

- **Expected:** a chunk that decayed three days ago and an industry job that finished two hours ago are not deadlines. "Next:" names the next upcoming deadline.
- **Got:** "2 Due in 24h", "Next: Moon 2 - Test Corp Second Athanor, 2d 21h 1m late", rows "Moon 2 … 2d 21h 1m late" (Critical) and "Myrmidon 2h 1m late" (Critical). Both are history, not work.
- **Better:** drop a decayed chunk from Due soon (or show it once as "Decayed") and show a finished job as "Ready to deliver" under Corp industry jobs only. "Next" is the soonest future item.
- **Evidence:** `03-after-grant.png`.

### CX-05 · Medium · Two widgets disagree about the same chunk

- **Expected:** one clock for one event.
- **Got:** Due soon says Moon 2 is "2d 21h late"; Moon extractions says Moon 2 "0m · Chunk decays".
- **Better:** share the deadline model between the two widgets.

### CX-06 · Medium · Structures and Moon extractions widget titles link to the page they are on

- **Expected:** a widget title with a caret opens that widget's page (DESIGN §6c).
- **Got:** both titles are links to `/corp`. Clicking does nothing visible.
- **Better:** Moon extractions links to `/corp/moons/extractions`; Structures gets a plain title (no page exists) or a structures view.

### CX-07 · Medium · Inactive members widget contradicts itself when all is well

- **Expected:** "Every member has logged in recently." and nothing else.
- **Got:** "Every member has logged in recently. This widget has no data for this Character." plus a "Remove widget" button. Good news is styled as an empty-data failure.
- **Better:** a healthy state with no Remove button; keep Remove in the ⋮ menu where it already is.

### CX-08 · Low · "+1 more" / "+2 more" are dead text

- **Got:** plain paragraphs under Due soon and Corp wallet; Due soon has no page, so the hidden rows are unreachable.
- **Better:** make "+N more" expand the list in place, or open the row detail modal list.

### CX-09 · Low · Empty unnamed divisions take space

- **Page:** Corp Board wallet widget and `/corp/wallet` division strip.
- **Got:** "Division 4 · 0 · 0 ISK · 0%" and "Division 6 · 0.00" as full rows and cards.
- **Better:** fold unnamed zero-balance divisions into one dim "2 unused divisions" line, or hide them until they hold ISK.

### CX-10 · Low · "Runway 1640 days at current spending" while net flow is positive

- **Better:** when 28-day net is positive, say "Net positive over 28 days" and only show runway when it is burning.

## 3. Members (`/corp/members`)

### CX-11 · Medium · The CEO is not marked anywhere

- **Expected:** a Director opening Roles sees who the CEO is.
- **Got:** Aria Vance (the corporation's `ceo_id`) is listed as "Director" in the Roles tab and has no mark in the roster.
- **Better:** a "CEO" pill on the roster row and in the Sensitive roles table, read from `/corporations/{id}`.
- **Evidence:** `13-members-roles.png`.

### CX-12 · Low · `/corp/members` redirects to `/corp/members/members`

- **Better:** name the default tab `roster` so the URL reads `/corp/members/roster`.

### CX-13 · Low · Default sort puts the least recently seen member first under a "Last seen ↓" arrow

- **Got:** 18d ago at the top, "just now" at the bottom, with a down arrow.
- **Better:** most recent first by default, or an explicit "Oldest first" label.

### CX-14 · Low · Member Show Info says "no kills" and "couldn't reach zKillboard" at once

- **Page:** PublicInfoModal from a roster name.
- **Got:** "No kills in the last 90 days", "zKillboard lists no kills for this pilot" and "zKillboard couldn't be reached · Try again" in the same modal when the lookup fails.
- **Better:** when the read failed, every zKillboard-derived line reads "Unknown", never "none" (DESIGN: `LoadFailedState`).
- **Evidence:** `12-member-info.png`.

## 4. Corp Wallet (`/corp/wallet`)

### CX-15 · Medium · "Where the ISK went" shows a day that has not happened

- **Expected:** days bucketed the same way the journal rows are, or labelled as EVE time.
- **Got:** the journal's newest row is "10/23/2026, 7:22 PM" (local), the dialog's daily table ends with "Oct 24, 2026 · 15,000,000 in", and the table starts with an empty "Sep 25" row. Phone cards do label days "EVE time"; the desktop dialog does not.
- **Better:** label the dialog "days in EVE time" and drop leading empty days, or bucket by the pilot's time format setting like the journal.
- **Evidence:** `22-wallet-where.png`, `w390_corp_wallet.png`.

### CX-16 · Low · Two freshness readouts on one page

- **Got:** Divisions "2m ago" and Journal "just now" side by side.
- **Better:** one `DataAgeBadge` in the header.

## 5. Corp Assets (`/corp/assets`)

### CX-18 · High · Structure names are missing from Where and from Location grouping

- **Expected:** "Jita - Test Corp Home Fortizar › Ships ×1". The corporation's own `/structures` read already has every name.
- **Got:** Item view Where chips read only "Ships ×1", "Minerals ×300,000"; station items read "Jita IV · Ships". Location grouping shows three groups named "Office", "Jita IV · Office" and "Office" and two named "In space", so a Director cannot tell which refinery or citadel a hangar belongs to.
- **Better:** resolve structure ids through the corp structures list (and `/universe/structures/{id}` as a fallback) and prefix the division with the structure name everywhere a station name already appears.
- **Evidence:** `30-assets.png`, `33-assets-location.png`.

### CX-19 · Medium · Fuel bay contents are called "In space"

- **Got:** fuel blocks in a refinery's `StructureFuel` bay appear under the "In space" tab and as "In space ×600" chips.
- **Better:** a "Fuel bay" bucket under the structure; keep "In space" for deployed items.

### CX-20 · Medium · Tables overflow the page at tablet width (768px)

- **Pages and measured page width:** `/corp/assets` 847px, `/corp/moons/extractions` 789px, `/corp/moons/miners` 877px, `/corp/srp/queue` 912px (header and table), `/srp` 891px. At 390px every one of them is fine.
- **Better:** give these `DataTable`s their own horizontal scroller or switch to cards at `md`, as the Members table already does.
- **Evidence:** `w768_corp_assets.png`, `w768_corp_srp_queue.png`.

### CX-21 · Low · Row ⋮ carries nine item-generic actions

- **Got:** Add to Quickbar, Set price alert, Show info, Open market in EVE, Add to Compare, View in Market, Copy name, "No blueprint options" (disabled), Export table.
- **Better:** trim to what a corp hangar row needs (Show info, View in Market, Set stock target, Export) per DESIGN restraint rules.

## 6. Moons, the Corp Tax Book (`/corp/moons`)

### CX-23 · High · Start date defaults to the EVE date, is not labelled, and cannot be changed later

- **Expected:** the setup form says the date is in EVE time, suggests when mining history begins, and lets a Director correct the start later.
- **Got:** at 8 PM local the field read `2026-10-24` (tomorrow), with no "EVE time" label. After "Turn the book on" the Billing tab shows "Start date 10/24/2026" as read-only text. The resulting book counted nothing (Miners tab empty, "Before the book: 5 donations … not counted"); the only fix was Access › Delete the book and start again.
- **Better:** label it "Start date (EVE time)", default to the first day of the current month or the earliest refinery ledger day, and allow moving the start date earlier with the same "never reaches back" rule, or at least warn before confirming that it cannot be changed.
- **Evidence:** `41-moons-setup-step1.png`, `48-book-settings-Billing.png`, `45-miners.png`.

### CX-24 · Medium · Setup form has no Back or Cancel

- **Got:** once "Turn on our own book" is clicked, the three-way choice is gone and the only control is "Turn the book on".
- **Better:** a Back link to the choice screen.

### CX-25 · Medium · A new book is not synced on creation

- **Got:** "Never synced", an amber "1 thing needs attention" strip and an empty Extractions table until the Director finds "Sync now".
- **Better:** run the first sync as part of "Turn the book on".
- **Evidence:** `42-moons-after-turn-on.png`.

### CX-26 · Medium · "1 thing needs attention" stays when nothing does

- **Got:** after the first sync the strip still reads "1 thing needs attention · Last synced just now by Test Pilot" and, expanded, "Billable through 22 Oct … The book warns here once nobody has synced for about 3 days."
- **Better:** the strip is only amber and only titled "needs attention" when a check fails; otherwise fold it to a plain status line.
- **Evidence:** `43-moons-after-sync.png`.

### CX-27 · Medium · "Hidden from members until 27 Oct 01:29" is unexplained and cannot be ended

- **Got:** a bare note on every tab. The reason (three days to set the book up before members see their Tax tab) is written only under Access › Delete the book. There is no "Show to members now".
- **Better:** a tooltip or sentence beside the note, and a "Show to members now" action for a Director.

### CX-28 · Medium · Tabs are offered before the book exists

- **Got:** the rail and page show Extractions, Miners, Statements and Moon owners before setup; each opens the same three-way choice screen, and the page title reads "Extractions — Moons".
- **Better:** hide the tabs until a mode is chosen; title the page "Moons".
- **Evidence:** `40-moons-first.png`.

### CX-29 · Medium · A token error is reported as a missing role

- **Got:** when the server rejected the EVE token, a Director saw "Moons need the Accountant role — EVE access token rejected [401]".
- **Better:** map `esi-forbidden` from a token failure to "Couldn't verify your corp role. Try again or log in again." and keep the role copy for a real role miss.

### CX-30 · Low · Raw SDK error on screen

- **Got:** "Couldn't load the Corp Tax Book · Firebase: Error (auth/invalid-api-key)".
- **Better:** a plain sentence with the code in a details line.

### CX-31 · Low · Setup copy speaks as "our"

- **Got:** "Run our own book", "Track the moon mining tax for our own refineries", "Turn on our own book".
- **Better:** "Run your corporation's book", matching the rest of the app.

### CX-32 · Medium · Settings dialog mixes save models and promises a reason field that is not there

- **Got:** footer on every tab: "Logged under your name with the reason. Your role is checked again when you confirm." No reason field exists on Rates, Billing, Extractions or Access. Rates says "A rate saves as soon as you add it. The other tabs save with Save." Save closes the dialog with no confirmation.
- **Better:** one save model per dialog, a footer that only mentions a reason where one is asked, and a "Settings saved" toast.
- **Evidence:** `48-book-settings.png`.

### CX-33 · Medium · Wallet divisions are numbers, not names

- **Page:** Settings › Billing › "Wallet divisions donations are read from".
- **Got:** checkboxes "1 2 3 4 5 6 7" although the app knows Master Wallet, SRP Fund, Moon Tax Income.
- **Better:** show the division names, numbers as a fallback.
- **Evidence:** `48-book-settings-Billing.png`.

### CX-34 · Medium · "Turn on for #90000001"

- **Page:** Settings › Access › Automatic sync.
- **Got:** the button names the Character by raw id.
- **Better:** "Turn on for Test Pilot".
- **Evidence:** `48-book-settings-Access.png`.

### CX-35 · Low · Extractions settings: an hours field with a m³/h note

- **Got:** "Field lasts after fracture, Jita IV - Moon 1 - Test Corp Refinery (hours)" followed by "Jita IV - Moon 1 - Test Corp Refinery: not measured yet, uses 30,000 m³/h".
- **Better:** put the rate note under a per-refinery rate field or reword to "Rate not measured yet; fallback 30,000 m³/h applies".

### CX-36 · Medium · Miners filter hides the biggest debtor by default

- **Got:** "Members" is on and "Non-members" off; the Guest miner owing 43.5M (85M not on a Statement) is not in the list until the chip is pressed. With a start date of today the table is empty under a pressed "Members 3" chip and a footnote "3 other Miners owe nothing".
- **Better:** default both chips on, or show "1 non-member hidden · 43.5M owed" under the table.
- **Evidence:** `50-miners-data.png`, `62-non-members.png`.

### CX-37 · Low · "Not a character any Miner has" for a corp member who did not mine

- **Got:** Unmatched donation card: "17 Oct. Not a character any Miner has; the player can claim it, or you can assign it." Bram is a corp member who donated without mining.
- **Better:** "Bram Okonkwo has not mined at your refineries, so there is no Miner to credit."

### CX-38 · Medium · "All periods" hides closed periods and misstates the open one

- **Got:** with 7-day periods and ledger from 4 Oct, the table listed only "23 Oct – 29 Oct · Open · 511,289,415" and "2 Oct – 8 Oct · Ready to send". 9–15 Oct and 16–22 Oct appeared one at a time, each only after the earlier period was issued. The Open period's Billed figure was the total of every un-issued day (511M, then 343M after one issue), not that week's mining.
- **Better:** list every closed period with its own figure and let the officer pick which to send; show the Open period's own days only.
- **Evidence:** `56-after-settings-save.png`, `59-sending.png`.

### CX-39 · Low · Dense "Written off" sentence shown when all zero

- **Got:** "Written off: 0 left over by 0 payments within tolerance (logged), and 0 lines recorded after payment, never billed. Both are on each Miner's page."
- **Better:** hide when zero; otherwise two short lines.

### CX-40 · Low · Verify page calls a weekly Statement monthly

- **Page:** `/corp-tax-book/verify/<token>`.
- **Got:** "Test Corp · Statement Oct 2026" and "Your monthly Statement still comes" for a 2–8 Oct Statement; price lines read "Saved snapshot".
- **Better:** "Statement 2–8 Oct 2026", cadence word from the setting, and "price saved on the day" instead of "Saved snapshot".
- **Evidence:** `92-verify-page.png`.

### CX-41 · Low · Miner detail: duplicated moon name and an unexplained disabled button

- **Got:** Refinery cell "Jita IV - Moon 2 - Test Corp Second Athanor / Jita IV - Moon 2" on some rows and only the name on others; "Send reminder" is natively disabled with no reason.
- **Better:** drop the moon subtitle when the structure name contains it; `aria-disabled` with "No Statement issued yet".
- **Evidence:** `51-miner-detail.png`.

### CX-42 · Low · "Dismiss tax for this extraction…" offered with nothing to dismiss

- **Got:** on an extraction with no ledger lines the dialog reads "0 of tax recorded … Dismiss 0".
- **Better:** disable the button with "No tax recorded yet".

### CX-43 · Low · "Ore unknown — link a survey" is a sentence, not an action, in the table

- **Got:** the cell text names an action that only exists on the detail page; "survey" is unexplained.
- **Better:** make the cell a "Link a Survey…" text action, with a tooltip on why the ore is unknown.

### CX-44 · Low · Moon owners empty state names an action it does not offer

- **Got:** "Invite a corporation that owns moons…" with the "Invite a moon owner…" button only in the page header.
- **Better:** repeat the button inside the empty state.
- **Evidence:** `47-moon-owners.png`.

### CX-45 · Low · "Not tax" dialog toggle has a doubled accessible name

- **Got:** `button "How much of it is not tax How much of it is not tax": All 15,071,271`.
- **Better:** label the group once and the segments "All" / "Part".

### CX-46 · Low · Delete the book: dialog on a dialog, no typed confirmation

- **Got:** a second `<dialog>` opens over the settings dialog; one red button erases everything "for good".
- **Better:** close settings first and ask the officer to type the corporation ticker.

### CX-47 · Low · Activity entries carry no subject

- **Got:** seven lines "Test Pilot issued a Statement" and two "Test Pilot mailed a Statement" with no miner or amount.
- **Better:** "issued a Statement to Dax Ferrin, 28,390,765 ISK".
- **Evidence:** `60-activity.png`.

### CX-48 · Low · An officer cannot preview the member's Tax tab

- **Got:** members' Mining › Tax shows nothing from the book for three days (CX-27), so a Director cannot check what pilots will read.
- **Better:** a "Preview as member" view, or the "Show to members now" action from CX-27.

## 7. SRP (`/corp/srp`, `/srp`)

### CX-49 · Medium · "Turn on SRP" lands on an empty queue

- **Got:** the intro says "Turn it on to set percents and rules", the button lands on Queue with "No claims waiting" and no pointer to Settings.
- **Better:** land on Settings, or show a setup checklist card on the Queue (percents, Hull Rules, share link) until done.
- **Evidence:** `71-srp-turned-on.png`.

### CX-50 · Medium · Off-doctrine filing moves the action away from the click

- **Page:** `/srp`, lost-ships table.
- **Got:** the row's "File" button files instantly for an on-doctrine loss (toast "Claim filed for Myrmidon"). For an off-doctrine loss it silently fills the form at the top and shows the Off doctrine notice there; nothing scrolls or focuses, so the first click looks like a no-op. The claim is only filed by the form's "File claim".
- **Better:** show the Off doctrine notice in a dialog from the row with "File anyway" and Cancel, or scroll to and focus the form's button.
- **Evidence:** `83-srp-off-doctrine.png`.

### CX-51 · Medium · Mark paid has no confirmation and no feedback

- **Got:** one click moved 76M from Owed to History with no dialog and no toast, while Approve and Reject both toast and mail.
- **Better:** a short confirm ("Mark 76,000,000 ISK to Test Pilot as paid?") and the same toast.

### CX-52 · Medium · Approve is enabled on your own claim and fails after the click

- **Got:** as Test Pilot (Director) the Approve button on Test Pilot's claim is active; pressing it shows "You cannot decide your own claim. Another officer must."
- **Better:** `aria-disabled` with that sentence as the tooltip before the click (DESIGN: disabled with a reason).
- **Evidence:** `90-srp-self-approve.png`.

### CX-53 · Low · Activity has "Other activity" and duplicate lines

- **Got:** adding a Doctrine Fit logs "Other activity"; two "Saved SRP settings" lines a minute apart.
- **Better:** "Added Doctrine Fit Doctrine Rifter"; collapse repeated saves.

### CX-54 · Low · Doctrine Fits save instantly, Hull Rules need Save, Save gives no toast

- **Better:** one model (the `UnsavedChangesBar`) for the whole page, and a "Saved" toast.

### CX-55 · Low · Raw killmail id under the pilot's name

- **Got:** Queue and History Pilot cell: "Test Pilot 8800002".
- **Better:** a "Killmail" link to zKillboard, or hide the id in the row detail.

### CX-56 · Low · Settings tab is shown to an Accountant

- **Got:** the tab exists and opens "SRP settings are for Directors".
- **Better:** hide the tab for non-Directors, as the rail hides pages.

### CX-57 · Low · Console permission-denied before SRP exists

- **Got:** `BatchGetDocuments … corps/98000001/srp/settings` permission-denied logged on first visit.
- **Better:** read settings through the callable or allow the read when the doc is missing.

## Reproducing the walkthrough

The harness lives in `.audit/corp-ux/harness/` (uncommitted): `world.mjs` is the fixture corporation and ESI router, `driver.mjs` starts the mock upstream server (ESI, EVE JWKS, zKillboard, Fuzzwork, Open Prices) on :5299, a headless Chromium with SSO/ESI interception, and a JSON command API on :5298; `c` is a shell helper; `sweep.sh` is the width sweep. Functions emulator env: `EVE_CLIENT_ID=e2e-fake-client EVE_JWKS_URL=http://127.0.0.1:5299/jwks AUDIT_ESI_BASE=http://127.0.0.1:5299/latest AUDIT_ZKILL_API=http://127.0.0.1:5299/zkill AUDIT_FUZZWORK_AGGREGATES=http://127.0.0.1:5299/fuzzwork/`; the two `AUDIT_*` reads in `functions/src/esiNotifications.ts` and `functions/src/srpKillmailEsi.ts` are a local-only patch and are not committed. `.env.local` needs `VITE_FIREBASE_EMULATORS=1` and `VITE_EVE_CLIENT_ID=e2e-fake-client`.

## Verification, 2026-10-24

Fixes landed on `develop` in PRs #4897 (Assets), #4899 (Corp Board + permission tooltips), #4900 (Members + Wallet), #4904 (Moons setup/settings), #4906 + #4911 (Moons ledger), #4910 (SRP), #4912 (review follow-ups), #4909 (CI flake). Each PR had a read-only review; its follow-ups went into #4912 and a second polish PR. Re-walked on `develop` with the same harness and personas.

| Finding                                         | Result                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CX-01, CX-03                                    | Not done by decision: corp access stays opt-in; the character switcher and Settings › Permissions are the way in.                                                                                                                                                                                                                                                                          |
| CX-02, CX-04..CX-13, CX-15, CX-16, CX-18..CX-21 | Verified in browser. Due soon lists only upcoming items, widget links fixed, CEO pill, `/corp/members/roster`, EVE-time days, structure names in Where and Location groups, Fuel bay tab, trimmed row menu, no page-level overflow at 768px on any corp page.                                                                                                                              |
| CX-14                                           | Code-reviewed only (zKillboard failure path not reproducible with the mock).                                                                                                                                                                                                                                                                                                               |
| CX-23..CX-28, CX-31..CX-39, CX-40, CX-42..CX-47 | Verified in browser. Start date labelled EVE time, defaults to the 1st, editable later; Back link; first sync runs on creation; plain health status; "Show to members now"; tabs hidden before setup; single Save with toast; division names; per-period Statement rows; verify page reads "Statement 1–7 Oct 2026", "weekly", "price saved on the day"; Activity names the Miner and ISK. |
| CX-29, CX-30, CX-41                             | Code-reviewed only (401 path, raw SDK error and the disabled-reminder reason were not reachable in the re-walk).                                                                                                                                                                                                                                                                           |
| CX-48                                           | Covered by "Show to members now" (CX-27) instead of a preview mode.                                                                                                                                                                                                                                                                                                                        |
| CX-49..CX-57                                    | Verified in browser. Turn on lands on Settings; off-doctrine filing opens a dialog with File anyway; Approve/Reject disabled with a reason on the officer's own claim; Mark paid confirms and toasts; Activity reads "Added Doctrine Fit …"; Killmail link replaces the raw id; Accountant sees no Settings tab.                                                                           |

New in the re-walk:

- R1 · Medium · Statements "All periods": after switching cadence from Monthly to Every 7 days, the Ready to send row is labelled "Oct 2026" while the Closed and Open rows read "8 Oct – 14 Oct" and so on. The verify page for the same Statement correctly reads "1–7 Oct 2026". The table label must follow the period actually covered. Evidence: `v43-statements.png`.

### Follow-up round, 2026-10-24

- R1 fixed in #4917: period labels now follow the covered days ("1–7 Oct 2026", "25–30 Sep 2026"); moving the start date also moves an N-day anchor that sat on the old start, client and server; days before a later anchor form a stub period.
- Row context menus (#4915 + #4919, decision `20261023-223827-corp-tables-carry-row-context-menus.md`): ⋮ plus right-click on Members roster and Roles tables, Corp Wallet journal (corp lines with a Player) and transactions, Moons Miners (officers), Moons Extractions (officers, survey ore with tax only), SRP officer Pending/Owed (claims with an amount). No menu where a row has fewer than two real actions (Statements, SRP History, `/srp` member tables). Verified in browser: the ⋮ is the last cell at the table's right edge; on phone cards it is a 36px button pinned top-right, centred on the title line (button y 0–36, title cell y 8–33), down from the old 44px block.
- Review follow-ups F1–F27 landed in #4912 and #4914; F25 (CEO without the Director role seeing SRP Settings) left as a note.
