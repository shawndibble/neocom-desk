# Review a member: pick from the roster, tell the member

Mockup only, no product code. Stories: `src/mockups/ReviewMember.stories.tsx` (title `mockups/ReviewMember`; parts in `reviewMemberParts.tsx`, sample data in `reviewMemberFixtures.ts`). Shots are at 1440 and 390 (`-1440.png`, `-390.png`). Sample data; the ticket's Agent Brief wins over the picture where they differ.

Owner's verdict on today's dialog: awful (in the shot, its labels even sit beside the inputs instead of above them). This is one recommended design, with one real choice left (open question 1).

## Today vs proposed

| | Today | Proposed |
|---|---|---|
| Dialog | ![](today-1440.png) | ![](dialog-empty-1440.png) |
| Phone | ![](today-phone-390.png) | ![](dialog-empty-phone-390.png) |

| Part | Today | Proposed |
|---|---|---|
| Who | Type the exact in-game name. A typo or an ex-member fails after Ask ("That character is not in this corporation."). | A search field over the corporation's members (all of them, the list scrolls). Typing narrows; the match is bold. Each row: portrait, name, title, last seen. |
| No match | Error after submit. | Before Ask: "No member named ... in Brass Meridian Logistics", with the reason and the apply link for an applicant. |
| Already has a review | Error after submit ("already has a review waiting"). | The member stays in the list, dimmed, "Review waiting", who asked and when. Not pickable. The officer themselves: "You". |
| Picked | Nothing (a typed string). | A card: portrait, name, title, last seen, Change. |
| Role | Free text. | Free text kept. Under it chips: the corp's own titles first, then the common EVE roles. Typing narrows the chips; a chip fills the field. |
| After Ask | Dialog closes. Nothing tells the member. | The dialog turns into a result: the review exists, and "Send mail to Ren" (never automatic), Preview mail, Copy link. |
| Queue | A waiting row is not clickable and says "Asked 2d". | The row opens the request page (accent name, row click), says "Waiting" and where the mail stands, and has a menu: Send or Resend mail, Copy link. |
| Member | Opens /vetting only if they happen to. A short top panel. | An in-game mail with the link and a plain explanation. The page top says who asked, for what, the three steps and four facts. |

## States

| State | 1440 | 390 |
|---|---|---|
| Empty dialog | ![](dialog-empty-1440.png) | ![](dialog-empty-phone-390.png) |
| Typing "ren" | ![](dialog-typing-1440.png) | ![](dialog-typing-phone-390.png) |
| No match | ![](dialog-no-match-1440.png) | ![](dialog-no-match-phone-390.png) |
| Already waiting | ![](dialog-already-waiting-1440.png) | ![](dialog-already-waiting-phone-390.png) |
| Picked + role | ![](dialog-picked-1440.png) | ![](dialog-picked-phone-390.png) |
| Roster unreadable | ![](dialog-roster-missing-1440.png) | |
| After Ask: mail offer | ![](result-offer-1440.png) | ![](result-offer-phone-390.png) |
| After Send | ![](result-mailed-1440.png) | |
| Mail preview | ![](mail-preview-1440.png) | ![](mail-preview-phone-390.png) |
| Queue rows | ![](queue-rows-1440.png) | ![](queue-rows-phone-390.png) |
| Review page: requested, no mail | ![](page-requested-no-mail-1440.png) | |
| Review page: requested, mailed | ![](page-requested-mailed-1440.png) | ![](page-requested-phone-390.png) |
| Review page: shared | ![](page-shared-1440.png) | ![](page-shared-phone-390.png) |
| Review about you | ![](page-about-you-1440.png) | |
| Member's page | ![](member-page-1440.png) | ![](member-page-phone-390.png) |

## Decisions

1. **The member is picked from the roster.** `GET /corporations/{id}/members` is public to any member and the names come from `/universe/names`, so every officer has the list. Title comes from `/corporations/{id}/members/titles` plus `/titles` (the same roster read as the Members page), last seen from member tracking. Both are optional extras: a row without them shows the name only. If the member list itself cannot be read, the dialog falls back to today's exact-name field and says why. The server's two checks (name resolves, pilot is in the corp) stay as the backstop.
2. **A list in the flow, not a floating menu.** The options sit under the field inside the dialog, so the dialog's edge never clips them and a phone keyboard does not hide them. It is a WAI-ARIA list combobox: Arrow keys move, Enter picks, Escape clears, option rows are 44px tall on touch. No combobox primitive exists (`npm run ui:catalog`: none; `SearchInput` is a filter box, `Select` and `NativeSelect` do not search), so this is a new component.
3. **Nothing is hidden or capped.** Members who cannot be picked stay in the list with the reason on the row, and the list scrolls through all of them. A hidden member would read as "not in the corporation".
4. **Role stays free text, with suggestions.** The corp's own titles lead because they are usually the promotion ladder; EVE's common roles follow. Length limit unchanged (`VETTING_ROLE_MAX`).
5. **Telling the member is an officer's mail, sent on purpose.** Same mechanism as the decision mail: the paced Officer mail queue, from the asking officer's Character, reported as a `MailRun` (`useVettingDecisionMail`, `queueOfficerMail`). The server cannot send mail. Never automatic; the corp setting for the decision mail is separate. It needs the send-mail permission; a missing one shows the existing `GrantNote`.
6. **The mail text is fixed.** What is read is always said the same way: who asked, for which role, one-time read of the characters they share, mail headers only (never subject or text), no stored sign-in, they can see who opens it, delete it, or decline. Then the link and "Sign in as Ren Halvard." Plain text, no formatting EVE would drop. Preview is a dialog in the Late notice mail preview's style.
7. **The queue is the place to come back to.** Mail state is a line in the row ("Mail not sent" in warning, "Mail sent 6 hours ago"), the menu holds Send or Resend mail and Copy link (two real actions, so a menu is allowed by DESIGN.md section 6c). Resend waits a day, with the reason printed under the item like Send reminder on a Corp Tax Book Miner's page.
8. **A requested row opens a page.** Today `rowClickable` is false for `requested`. The row click and the accent name now open the review page (section 6c: a row's primary action beats name links; the pilot's Show info lives on the page). Before the member shares, the page shows the request and "Nothing shared yet" where the report would be. After they share it is the same report an applicant gets, unchanged: result line, flags (`VettingFlagList`), their answers, characters (`VettingCharacterList`), About this report, and the real sign-off block with the role.
9. **Review about you is closed.** The page says so (existing wording) and the queue should not list it at all. The asker sees "You asked for this review, so you cannot sign it off" in the rail, before and after the member shares. A review needs the sign-offs of others (two by default), so a one-officer corp cannot complete it. Build note: today's rail draws the asker's bar only for an open review; a requested one needs the same line (the mockup shows it that way).
10. **The member's page top** (compose, not redesign): one sentence (who, role, corp, "Other officers decide it, not Kestrel"), three numbered steps (sign in, choose, share or decline), four plain facts and a link to the full consent terms already on the page. The Characters panel, consent terms and Share / Decline are untouched. Step 1 states how many characters already work without another sign-in.

## New components

- `MemberCombobox` (with the picked card): roster autocomplete. Props: roster rows (id, name, title?, seen?, waiting?, you?), query, onPick. Lives under `src/components/ui` only if a second use appears (a `MemberPicker` for SRP or Moons is likely); until then in `features/corp/vetting`.
- `RoleField`: text input plus suggestion chips (`Button` ghost sm).
- `TellMemberStep`: the result block. Primary, Preview mail, Copy link.
- `ReviewMailPreview`: dialog; same shape as the mail preview dialog in the Corp Tax Book mockup.
- `WaitingQueueRows`: no new primitive, only new cells and menu on `DataTable`.
- `RequestPanel`: `Panel` + `ValueList` + buttons.
- `RequestIntro`: `Panel` + numbered steps.

## Open questions

1. **One real choice: what a link does for someone not signed in to Neocom Desk.** Recommended: `/vetting` sends them through the normal EVE login and returns to the request. The alternative is a public per-review link (like the apply link), so a member who never used the app lands on the request without an account. That needs a server change (a key per request), so it is only worth it if members often have no account. Not drawn: the login page already exists.
2. Resend cooldown of 24 hours: right, or paced only by the mail queue?
3. Should the queue show a member who left the corp since the ask? Suggestion: a "Left the corp" pill, Withdraw in the menu.
4. Last seen needs the track-members permission; for officers without it the row shows title only. Acceptable?
5. Can an officer withdraw their own request? Today only the member can decline.

## Recommendation

Build it as drawn: roster autocomplete with the apply-link hint, role chips, the result step with Send mail / Preview mail / Copy link, the waiting rows with mail state and menu, the request page before sharing and the existing report after, and the member page top. Build order: combobox and role field (dialog only), then mail (reuses the queue), then the queue rows and request page, then the member page top.
