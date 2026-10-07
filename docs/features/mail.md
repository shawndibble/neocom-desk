# Mail

`/mail` (nav: Social group, scope-gated, phone tab). Two-pane EVE mail client for the active Character, or for every Character at once (see "All characters"): folder chips + search above, list left, reader right. Reads headers/bodies, marks read on ESI, Reply / Forward with drafts. No new-mail compose, no delete, no labels management, no mailing-list browsing.

Code: `src/routes/Mail.tsx`, `src/features/character/{mail,mailAll,mailScopePref,mailFolderPref,mailDrafts,mailRecipientSearch,MailComposeBox}.ts(x)`, `src/engine/mail.ts` (pure), `src/features/character/{contacts,contactStandings,affiliations,names}.ts`.

## Summary

| Feature           | What                                                                                                | Where                                           |
| ----------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Folder chips      | Inbox / Corp / Alliance / Sent multi-select toggles, per-folder unread count                        | `Mail.tsx:600`, `engine/mail.ts` `MAIL_FOLDERS` |
| Search            | Subject or sender name, 250 ms debounce, URL `search`                                               | `Mail.tsx:628`, `mailSearchMatches`             |
| Hide read         | Toggle chip, URL `hideRead`                                                                         | `Mail.tsx:636`                                  |
| List              | Two-line rows, unread dot, folder glyph+name, date; newest first; capped at 200 rendered            | `Mail.tsx:675`, `capHeadersForDisplay`          |
| Load more         | Pages older mail via `last_mail_id`, 50 per page                                                    | `Mail.tsx:805`, `loadMoreMailHeaders`           |
| Reader            | Subject, From (+standing tag), To, body (EVE markup stripped), timestamp                            | `Mail.tsx:862-965`                              |
| Mark read         | Instant local dim + ESI write on open                                                               | `markMailReadOnEsi`                             |
| Reply (reply-all) | Inline compose box, recipients prefilled, quoted body                                               | `MailComposeBox.tsx`                            |
| Forward           | Same box, empty recipients + recipient picker                                                       | `MailComposeBox.tsx`                            |
| Drafts            | Auto-saved per (character, mail) in Dexie                                                           | `mailDrafts.ts`                                 |
| Standing tag      | Sender colour-tag from own contacts, inherits corp/alliance                                         | `StandingTag`, `characterStanding`              |
| Scope             | This character / All characters picker (`CharacterFilterControl`), per-Character unread in its menu | `Mail()` wrapper, `mailScopePref.ts`            |
| Refresh           | Header icon button                                                                                  | `Mail.tsx:550`                                  |
| Data Age badge    | Header meta, from headers fetch                                                                     | `Mail.tsx:547`                                  |
| Re-login banner   | 401/403 on mail endpoints                                                                           | `GrantBanner`                                   |

## Page and states

- Route `/mail`, no sub-tabs. Not in `PAGE_TABS`. Scope gate from `src/app/routeScopes.ts:204`: endpoints `getCharacterMailHeaders`, `getCharacterMail`, `postUniverseNames`; strings key `mail`.
- No active Character: redirect to `/characters` (`Mail.tsx:534`).
- Not hydrated / loading with no data: spinner.
- `needsReauth` (401/403 or failed token refresh on headers, labels or lists): `GrantBanner` asking for `getCharacterMailHeaders` permission, title "Log in again to see your mail".
- Load error: `EmptyState` "load failed".
- No headers: `CachedEmptyState` ("No mail cached" when nothing cached and offline; "No mail" when a fetch succeeded empty).
- Served from cache: amber "offline" line above the chips (`common.offlineTitle`).
- Loaded but filters hide everything: `no-matches` EmptyState ("No mail matches these filters"); no folders on: `no-folders` EmptyState with "Show all folders" button.

## All characters

- Scope picker = the shared `CharacterFilterControl` (#2846), only offered with 2+ Characters. Label "All characters · N"; menu lists each Character's unread (sum of its four System Labels' `unread_count`, custom labels excluded).
- Choice persists device-wide in Dexie setting `mailScope` (`mailScopePref.ts`); URL `scope` (`current|all`) overrides it for one view and is never written back. `MailView` is keyed on the scope, so each scope loads its own snapshot (route cache key `mail` / `mail-all`).
- Load: `loadMailForCharacters` (`mailAll.ts`) fans out the per-Character loaders under `ESI_FANOUT_CONCURRENCY`. A Character without `esi-mail.read_mail.v1`, or with nothing cached and no fetch, is skipped and named in the readout: "All characters · 3 of 4", warning icon, tooltip "Not included: …". A skipped Character lacking the grant also gets its own `GrantNote`.
- Throttle: each Character goes live at most once per `MAIL_REFRESH_MIN_GAP_MS` (60 s). A Refresh inside the window reads Dexie for that Character instead.
- List: same rows, merged newest first by timestamp (`mergeOwnedMail`), each with an owner chip (avatar + name). `mail_id` is per-Character, so row identity is `mailKey(ownerId, mailId)`. Folder of a row comes from its own owner's labels. Chip counts = each System Label's own `unread_count` summed across Characters (`sumUnreadByTab`).
- Load more pages every Character that has more (`last_mail_id` per mailbox). Display cap (200) applies to the merged list.
- Opening a mail loads the body, marks read, and Reply/Forward all as the owner (token, own-Character exclusion in reply-all, draft key `ownerId:mailId`). Reader header says "For <Character>". Standing tag uses the owner's contacts.
- Sending refetches only the sending Character's headers.

## Folder chips

- Four `FilterChip`s in a `role="group"` (`aria-pressed`, not a tablist; scope decision `20260907-125125-mail-folders-are-multi-select-toggles-not-tabs`).
- Folder of a mail = highest-precedence System Label among its `labels`, order `sent > alliance > corp > inbox`; unlabelled falls to inbox (`resolveMailTab`). System labels recognised by name (case-insensitive `inbox|sent|corp|alliance`) via `buildLabelTabMap`.
- Unread badge on each chip = that System Label's own `unread_count` from `/mail/labels`, never summed. Shown only when > 0.
- Selection is device-wide (not per character), persisted in Dexie setting `mailFolders` via `useMailFolders`. Default all four. Empty selection allowed on screen; an empty stored array is rejected on read (`parseMailFolders`).
- Chip row, search and Hide read are hidden on phone while a mail is open (`!isDesktop && selectedId !== null`).

## List

- Sort: `timestamp` descending, string compare (`Mail.tsx:390`). No other sort.
- Row: unread dot (fixed gutter, `sr-only` "Unread"), subject (2-line clamp, bold when unread), folder glyph + folder name, party, date (date only, honours Local/EVE time setting via `useTimeZone`).
- Party = sender name, except in Sent folder = first recipient + "+N more" (`recipientSummary`).
- Unknown sender -> "Unknown sender"; empty subject -> "(no subject)".
- Selected row: accent edge + fill, `aria-current`.
- Opening a row: selects, marks read locally (`locallyReadIds`), and if ESI's `is_read` is false calls `putCharacterMail({read:true})`. On success patches cached header `is_read`. Failure is silent except 401/403 which signals the reauth banner (`reportWriteAuthFailure`, endpoint `putCharacterMail`). Retries on every reopen while ESI flag is false.
- No manual mark-unread, no multi-select, no bulk actions, no context menu, no CSV export, no keyboard shortcuts specific to Mail.
- Cap: after filters, at most `MAIL_HEADER_DISPLAY_CAP = 200` rows render; notice `mail.capNotice` appears when truncated.
- Load more: button shown while `hasMore` (last page returned >= 50). Merges by `mail_id`, writes merged list back to cache, resolves names + affiliations for new headers. Failure keeps `hasMore` true so you can retry; 401/403 raises app-wide reauth.
- Mobile (< `lg`): list and reader swap; reader shows Back button; focus returns to the opened row (or search box) after Back; reader heading takes focus once body loads (`useFocusHeading`). Desktop: grid `22rem|24rem` + 1fr, reader body bounded to viewport height.

## Reader

- Body fetched on open (`/mail/{id}`), cached 'static' tier (bodies never change). Spinner while loading; `EmptyState` if body null (failed/uncached).
- Title = folder name of the open mail; meta = full timestamp.
- From: `CharacterLink` (opens Public Info) + `StandingTag` (from the active Character's contacts; precedence character > corp > alliance > faction, via sender affiliations). To: character recipients are `CharacterLink`s, corp/alliance/mailing-list are plain text. Mailing-list names resolved from `/mail/lists` (the `/universe/names` endpoint cannot resolve list ids; list ids are excluded from the name batch).
- Body: `stripEveMarkup`, `whitespace-pre-wrap`. Links/markup in EVE mail are flattened to text; no images, no clickable links.
- Header actions: Reply, Forward icon buttons (hidden while composing). Back (phone).

## Compose (Reply / Forward)

- Opens inline under the body in `MailComposeBox`, keyed on `mailId:kind`. Reply/Forward buttons unmount while open; Cancel/Send restore focus to the button that opened it.
- Reply is reply-all: recipients = sender (not removable, chip shows sr-only note) + every other recipient except the own Character (`buildReplyAllRecipients`). Subject `RE: ` prefix (not doubled). Body = blank line + `On <ts>, <sender> wrote:` + `> ` quoted lines.
- Forward: no recipients; subject `FWD: `; same quote; focus lands in the recipient picker (picker does not auto-open).
- Recipient picker (Forward only, combobox with arrow/Home/End/Enter/Escape; `aria-activedescendant`, live count): shows up to 8 contacts (character-type only, names resolved, A-Z) on empty query; typing filters contacts and, at >= 3 chars, runs ESI character search (300 ms debounce, abort on change, max 15 hits) and merges, de-duped, minus already-added. Search needs `esi-search.search_structures.v1` (`getCharacterSearch`). Only characters can be added (no corp/alliance/list recipients added manually; ones inherited by Reply stay as chips).
- Subject text input, body textarea (8 rows). No attachments, no formatting, no CSPA/approved-cost support (`approved_cost` never sent).
- Send: requires >= 1 recipient (inline error `mail.sendNoRecipients`); posts `POST /characters/{id}/mail/` with `esi-mail.send_mail.v1`. On success: clears draft, closes box, refetches headers only (cache row deleted, not a full refresh) so the Sent mail appears. On failure: inline "Couldn't send: <message> Try sending from the EVE client instead."; 401/403 also raises the reauth banner.
- Draft: debounced 500 ms save to Dexie `mailDrafts` (id `characterId:mailId`; kind, recipients, subject, body). Restored on reopen when kind matches; touching recipients first suppresses restore race. Cleared on Send. Cancel keeps the draft.

## Data sources and scopes

| Data                                         | Endpoint                                  | Scope                                | Cache                             |
| -------------------------------------------- | ----------------------------------------- | ------------------------------------ | --------------------------------- |
| Headers (50, `last_mail_id` paging)          | `GET /characters/{id}/mail`               | `esi-mail.read_mail.v1`              | default, conditional              |
| Body                                         | `GET /characters/{id}/mail/{mail_id}`     | `esi-mail.read_mail.v1`              | static tier                       |
| Labels + unread counts                       | `GET /characters/{id}/mail/labels`        | `esi-mail.read_mail.v1`              | default                           |
| Mailing lists                                | `GET /characters/{id}/mail/lists`         | `esi-mail.read_mail.v1`              | static                            |
| Mark read                                    | `PUT /characters/{id}/mail/{mail_id}/`    | `esi-mail.organize_mail.v1`          | patches cached header             |
| Send                                         | `POST /characters/{id}/mail/`             | `esi-mail.send_mail.v1` (base grant) | deletes cached headers row        |
| Names                                        | `POST /universe/names`                    | public                               | name cache                        |
| Affiliations                                 | `POST /characters/affiliation`            | public                               | affiliation cache                 |
| Contacts (standing tag, forward quick-picks) | `GET /characters/{id}/contacts`           | `esi-characters.read_contacts.v1`    | default; empty when scope missing |
| Recipient search                             | `GET /characters/{id}/search`             | `esi-search.search_structures.v1`    | none                              |
| Local only                                   | Dexie `mailDrafts`, setting `mailFolders` | n/a                                  | device                            |

Registry: `src/esi/registry.ts:249-281`. Mail is not synced to Firestore.

## Related

- Notification Event `newMail` (Foreground Poller, high-water mark on `mail_id`, route `/mail`); see `notifications.md`.
- Glossary: Data Age, Foreground Poller. Scope decisions: `20260901-172427-mail-page-rebuild`, `20260905-140358-mail-custom-label-filter-chips-removed-mark-read`, `20260910-103051-mail-read-state-syncs-to-esi-the-apps`, `20260921-014556-mail-reply-and-forward`, `20260907-125125-mail-rows-go-two-line-colour-marks-state`.

## Observed gaps

- Custom labels are not shown or filterable (labels are fetched, only the four System Labels are read; chips were removed by decision `20260905-140358`). A mail with only a custom label files under Inbox.
- No compose-new, no delete, no mark-unread, no label assignment, no mailing-list view; `getCharacterMailingLists` is used only to name recipients.
- Search matches subject and sender name only; not body, not recipients (Sent folder rows are searched by sender = yourself).
- Unread count per chip is ESI's count for all mail, not for the loaded/filtered window; "Hide read" uses per-header flags.
- Reader flattens EVE markup to plain text (`stripEveMarkup`): no links, fonts or images.
- Folder chips on phone are hidden while a mail is open, so folder cannot be changed without Back.
- `loadMoreMailHeaders` swallows non-auth errors silently (list stays, button stays).
- Forward picker only adds characters; cannot add a corp, alliance or mailing list.
- Recipient search needs `esi-search.search_structures.v1`, which is not part of the mail scope set; a character without it just sees contacts (search failure -> empty results, no message).
- FAQ/Help panels do not mention Mail.

## Persistence and sync

| State                                         | Storage                                                                                                  | Synced? |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------- |
| `search`, `hideRead`                          | URL query (ADR 0015 `docs/adr/0015-tab-is-a-path-segment-url-holds-view-state.md`), omitted when default | no      |
| Selected folders                              | Dexie `settings` key `mailFolders`, device-wide                                                          | no      |
| Scope (This / All characters)                 | Dexie `settings` key `mailScope`, device-wide; URL `scope` overrides per view                            | no      |
| Selected mail, open compose, locally-read set | React state only                                                                                         | no      |
| Headers/labels/lists/bodies                   | Dexie `esiCache` per Character (`mail:headers`, `mail:labels`, `mail:lists`, `mail:<id>`)                | no      |
| Drafts                                        | Dexie `mailDrafts`                                                                                       | no      |
| Read flag                                     | ESI (source of truth) + patched cache                                                                    | via ESI |

## Test-covered behaviours (`src/routes/Mail.test.tsx`)

Newest-first with names (:177); reader header absent until selection (:184); markup stripped (:204); focus on open/Back (:211) and Reply/Cancel (:226, :241); Public Info from sender (:273); offline cache (:296); empty (:311); no-sender fallback (:319); reauth banner (:336); folder toggles and unread counts (:347, :362); empty selection recovery (:383); no-match copy (:399); URL round-trip (:408, :437); words-not-colour (:449); Sent shows recipient (:459); standing tags own/stranger/inherited (:507-531); no CSV button (:551); list bounded (:557); load more at 50 incl. names/standing/stale-character discard (:577-695); search by subject and resolved sender (:749, :760); local read + ESI write, retry per reopen, no write when already read, silent failure (:770-851); mailing-list names (:866, :885).

## Interview Q&A

1. **How is a mail's folder decided when it carries several labels?** Highest precedence in `['sent','alliance','corp','inbox']` among labels whose id maps to a System Label by name; none -> inbox (`engine/mail.ts:32,45-58`). So a custom-labelled-only mail shows as Inbox.
2. **Why are the unread numbers not summed or computed client-side?** They come straight from each System Label `unread_count`; `total_unread_count` is not their sum once custom labels exist (`Mail.tsx:600-621` comment, decision `20260907-125125-mail-folders-are-multi-select-toggles-not-tabs`).
3. **Why do folders persist device-wide in Dexie and not in the URL?** A folder filter exists to hide mail; forgetting on reload defeats it; device-wide because it is a habit of the pilot (`mailFolderPref.ts`). Search and Hide read are short-lived view state, so URL (ADR 0015).
4. **How many mails can the user actually reach?** ESI returns 50; "Load more" pages with `last_mail_id = min(mail_id)` and appends (`features/character/mail.ts:71-92`); `hasMore` = last page >= 50 (`engine/mail.ts:86,~100`). Rendered rows capped at 200 after filters (`engine/mail.ts:127`), with a notice; the pagination cursor is unaffected.
5. **What exactly happens on opening an unread mail?** Row click -> select, `markLocalRead` (instant dim), and if ESI `is_read` false -> `PUT mail/{id}` `{read:true}` (`Mail.tsx:712-721`, `mail.ts:148`). Success patches cached header; failure is swallowed except auth failure (reauth banner via `reportWriteAuthFailure`), and it retries on each reopen (test `:807`). Needs `esi-mail.organize_mail.v1`, added after launch (issue #741) so old tokens may lack it.
6. **How does Reply decide recipients and what is not removable?** `buildReplyAllRecipients` (`engine/mail.ts:196`): sender (if not you) as non-removable character, then each other recipient except your own character id, de-duped by `type:id`. Subject prefixed `RE:` unless already (`:235`, case-insensitive). Body quoted with `> ` lines.
7. **How do drafts avoid clobbering and when are they deleted?** Saved 500 ms after any change (`MailComposeBox.tsx:46`), keyed `characterId:mailId`; restored only if `draft.kind === kind` and the user has not yet touched recipients; deleted on successful Send, kept on Cancel.
8. **Why does sending refetch only headers instead of a full refresh?** `sendMail` deletes only `mail:headers` for the Character; `handleSent` refetches headers (`Mail.tsx:492`). `refresh()` would call global `invalidateFreshness()` and refetch labels, lists, contacts, affiliations too.
9. **Why can mailing-list recipients show "Mailing list"?** `/universe/names` fails the whole batch on a list id, so list ids are excluded (`Mail.tsx:142`) and resolved from `/mail/lists` (static freshness); unmatched -> generic label.
10. **What does the standing tag show and why only senders?** `characterStanding(index, from, affiliations)` over own contacts with character > corp > alliance > faction precedence (`contactStandings.ts` `STANDING_PRECEDENCE`); empty (never an error) without contacts scope; scoped to "who sent this", not recipients (`Mail.tsx:125`).
11. **What happens when the mail scope is revoked?** 401/403/failed refresh on headers, labels or lists sets `needsReauth` -> `GrantBanner` asking only for the mail permission (`Mail.tsx:564`, `routeScopes.ts:204`), never a silent empty state (test `:336`).

## Improvement ideas

- Show custom labels as filter chips again, or a label column, using the already-fetched labels.
- Search body and recipients; add Sent-folder "to" search.
- Mark unread, bulk mark read, delete (needs organize scope), compose-new with contact picker.
- Persist the open mail in URL (`?mail=<id>`) so reload/back keeps place; keyboard j/k navigation.
- Surface load-more failure inline; show total fetched vs shown count.
- Render safe EVE links (character/system/item show-info) in the body instead of flattening.
