# Mail

`/mail` (nav: Social group, scope-gated, phone tab). Two-pane EVE mail client for the active Character, or for every Character at once (see "All characters"): folder chips + search above, list left, reader right. Reads headers/bodies, marks read on ESI, New Mail / Reply / Forward with drafts. No delete, no labels management, no mailing-list browsing.

Code: `src/routes/Mail.tsx`, `src/features/character/{mail,mailAll,mailScopePref,mailFolderPref,mailDrafts,mailRecipientSearch,MailComposeBox,NewMailComposer,NewMailRecipientPicker,MailBodyEditor}.ts(x)`, `src/features/character/mailEditor/` (rich editor, lazy), `src/engine/{mail,mailCompose,mailFormat,mailEditorDoc,eveMarkup}.ts` (pure), `src/features/character/{contacts,contactStandings,affiliations,names}.ts`.

## Summary

| Feature           | What                                                                                                | Where                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Folder chips      | Inbox / Corp / Alliance / Sent multi-select toggles, per-folder unread count                        | `Mail.tsx:600`, `engine/mail/mail/mail.ts` `MAIL_FOLDERS` |
| Search            | Subject or sender name, 250 ms debounce, URL `search`                                               | `Mail.tsx:628`, `mailSearchMatches`                       |
| Hide read         | Toggle chip, URL `hideRead`                                                                         | `Mail.tsx:636`                                            |
| List              | Two-line rows, unread dot, folder glyph+name, date; newest first; capped at 200 rendered            | `Mail.tsx:675`, `capHeadersForDisplay`                    |
| Load more         | Pages older mail via `last_mail_id`, 50 per page                                                    | `Mail.tsx:805`, `loadMoreMailHeaders`                     |
| Reader            | Subject, From (+standing tag), To, body (EVE markup rendered), timestamp                            | `Mail.tsx:862-965`                                        |
| Mark read         | Instant local dim + ESI write on open                                                               | `markMailReadOnEsi`                                       |
| Reply (reply-all) | Inline compose box, recipients prefilled, quoted body                                               | `MailComposeBox.tsx`                                      |
| Forward           | Same box, empty recipients + recipient picker                                                       | `MailComposeBox.tsx`                                      |
| Drafts            | Auto-saved per (character, mail) in Dexie                                                           | `mailDrafts.ts`                                           |
| Standing tag      | Sender colour-tag from own contacts, inherits corp/alliance                                         | `StandingTag`, `characterStanding`                        |
| Scope             | This character / All characters picker (`CharacterFilterControl`), per-Character unread in its menu | `Mail()` wrapper, `mailScopePref.ts`                      |
| Refresh           | Header icon button                                                                                  | `Mail.tsx:550`                                            |
| Data Age badge    | Header meta, from headers fetch                                                                     | `Mail.tsx:547`                                            |
| Re-login banner   | 401/403 on mail endpoints                                                                           | `GrantBanner`                                             |

## Purpose and user goal

"Did anything come in that I need to read or answer?" A two-pane EVE mail client (`20260901-172427-mail-page-rebuild`). Replies, not compose-new, because answering a received mail is what pilots asked for (`20260921-014556`); one inbox over every Character is the headline ask from other tools (#2867).

- **Top jobs (ranked):** 1. "What is unread, on which Character?" 2. "Read it." 3. "Reply or forward."
- **Device and cadence:** desktop primary; reading at length is a desk session (owner, 2026-10-11). Phone parity: the `newMail` Notification Event routes here (`notifications.md`), so a tapped push opens it. Cadence: when new mail arrives.
- **Above the fold:** folder chips with unread counts and search, then the list newest first with unread dots; on desktop the reader beside it.
- **Not for:** writing new mail, mailing lists, labels (in game).
- **Sources:** owner, 2026-10-11 (desktop primary, phone for one-off lookups); `20260901-172427-mail-page-rebuild`, `20260907-125125` (both files), `20260921-014556`, `20260910-103051`; #155, #2867.
- **Unconfirmed:** that most visits come from a notification.

### Mobbin brief

- **Fit:** high: almost all of it is a standard mail client.
- **Analog apps:** Gmail, Superhuman, Apple Mail, Outlook, Hey.
- **Screen queries:**
  - `web: two-pane email client with folder filter chips and unread counts above a message list, the selected message open in a reading pane on the right`
  - `web: unified inbox across several accounts with an account switcher showing an unread count per account`
  - `ios: inbox list with unread dots, sender, subject and date, opening a message full screen with reply and forward buttons`
- **Flow queries:** `ios: reply to an email inline with quoted text and an auto-saved draft`
- **Mobbin won't help with:** EVE mail markup and sender standing tags.

## Page and states

- Route `/mail`, no sub-tabs. Not in `PAGE_TABS`. Scope gate from `src/app/routeScopes.ts:204`: endpoints `getCharacterMailHeaders`, `getCharacterMail`, `postUniverseNames`; strings key `mail`.
- No active Character: redirect to `/characters` (`Mail.tsx:534`).
- Not hydrated / loading with no data: spinner.
- `needsReauth` (401/403 or failed token refresh on headers, labels or lists): `GrantBanner` asking for `getCharacterMailHeaders` permission, title "Log in again to see your mail".
- Load error: `EmptyState` "load failed".
- No headers: `CachedEmptyState` ("No mail cached" when nothing cached and offline; "No mail" when a fetch succeeded empty).
- Served from cache: amber "offline" line above the chips (`common.offlineTitle`).
- Loaded but the list is empty (#3972): `listState` names the first stage that emptied it. No folders on: `no-folders`, "Show all folders" button. Folders hold nothing: `empty-folder`, `CachedEmptyState` ("No mail in this folder", or "No saved mail…" when served from cache), no action; "No recent mail…" pointing at Load more while older pages are unloaded. Search matched nothing: `no-search-matches`, "Clear search" button (clears and focuses the search box). Only Hide read is hiding mail: `all-read-hidden`, "Show read mail" button (focus lands on the search box, Hide read next).
- Reading pane with nothing selected, wide screen only: `EmptyState` "No message open" with a Compose button calling the same `openNewMail` as the header. Not rendered on a phone (the list is the whole screen; Compose floats) or while the inline composer is open.

## All characters

- Scope picker = the shared `CharacterFilterControl` (#2846), only offered with 2+ Characters, first in the page header's cluster (`PageHeader` `scope`). Trigger is an avatar stack (words "All characters · N" in its tooltip, accessible name and menu); menu lists each Character's unread (sum of its four System Labels' `unread_count`, custom labels excluded).
- Choice persists device-wide in Dexie setting `mailScope` (`mailScopePref.ts`); URL `scope` (`current|all`) overrides it for one view and is never written back. `MailView` is keyed on the scope, so each scope loads its own snapshot (route cache key `mail` / `mail-all`).
- Load: `loadMailForCharacters` (`mailAll.ts`) fans out the per-Character loaders under `ESI_FANOUT_CONCURRENCY`. A Character without `esi-mail.read_mail.v1`, or with nothing cached and no fetch, is skipped and named by the picker: a warning dot on the trigger, "Not included: …" in its accessible name and as a note in its menu. A skipped Character lacking the grant also gets its own `GrantNote`.
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
- Body: `MailBodyView` parses the raw body with `src/engine/mail/mail/eveMarkup.ts` (safe subset: bold, italic, underline, size, colour, links; unknown tags dropped, never injected as HTML) and renders it as the game shows it, on a fixed dark surface; formatting survives inside table cells; link text that names a different host than its href shows the real host as a title. `showinfo:` links open the app's modal (character, corporation, alliance, item and ship via Item Detail, since no ship window opens by typeID outside the Ship Tree; skill via the skill modal, told apart by SDE category) or Route Safety (system); region, station and structure open Place Info (`PlaceLink`, `?info=place-<id>`); constellation, faction and `fitting:`/`contract:`/`killReport:`/`joinChannel:`/`localsvc:` render as dotted-underline text with a tooltip. Bare URLs linkify; space-aligned and `| a | b |` pipe tables draw as real tables. List-row snippets and the Reply quote still use the flattened `stripEveMarkup` text. No images.
- Header actions: Reply, Forward icon buttons (hidden while composing). Back (phone).

## Compose (Reply / Forward)

- Opens inline under the body in `MailComposeBox`, keyed on `mailId:kind`. Reply/Forward buttons unmount while open; Cancel/Send restore focus to the button that opened it.
- Reply is reply-all: recipients = sender (not removable, chip shows sr-only note) + every other recipient except the own Character (`buildReplyAllRecipients`). Subject `RE: ` prefix (not doubled). Body = blank line + `On <ts>, <sender> wrote:` + `> ` quoted lines.
- Forward: no recipients; subject `FWD: `; same quote; focus lands in the recipient picker (picker does not auto-open).
- Recipient picker (Forward now uses the shared `NewMailRecipientPicker`: characters, corporations, alliances and joined mailing lists, contacts as quick picks; the older description follows, combobox with arrow/Home/End/Enter/Escape; `aria-activedescendant`, live count): shows up to 8 contacts (character-type only, names resolved, A-Z) on empty query; typing filters contacts and, at >= 3 chars, runs ESI character search (300 ms debounce, abort on change, max 15 hits) and merges, de-duped, minus already-added. Search needs `esi-search.search_structures.v1` (`getCharacterSearch`). Only characters can be added (no corp/alliance/list recipients added manually; ones inherited by Reply stay as chips).
- Subject text input, body in the same rich editor as New Mail (WYSIWYG + format bar + Source, see "Rich body editor"). Reply quotes as plain `> ` lines (`quoteMailBody` over the reader's stripped text, formatting dropped, `< > &` entity-escaped). Forward carries the original body **with its formatting**, editable, under a `---------- Forwarded message ----------` header (`forwardMailBody`). The live counter (markup-inclusive, 10,000) shows and Send is blocked past it. No attachments, no CSPA/approved-cost support (`approved_cost` never sent).
- Send: requires >= 1 recipient (inline error `mail.sendNoRecipients`); posts `POST /characters/{id}/mail/` with `esi-mail.send_mail.v1`. On success: clears draft, closes box, refetches headers only (cache row deleted, not a full refresh) so the Sent mail appears. On failure: inline "Couldn't send: <message> Try sending from the EVE client instead."; 401/403 also raises the reauth banner.
- Draft: debounced 500 ms save to Dexie `mailDrafts` (id `characterId:mailId`; kind, recipients, subject, body). Restored on reopen when kind matches; touching recipients first suppresses restore race. Cleared on Send. Cancel keeps the draft.

## Compose (New Mail)

Decision: `docs/context/decisions/20261016-124635-mail-compose-format-bar-and-eve-markup.md`.

- Entry: a floating Compose button over the list on a phone (hidden while a mail is open or the composer is); a Compose button in the page header on a wide screen. Sends as the active Character, also under "All characters".
- Placement: `NewMailComposer` is one component. Phone (`fullPane`): fixed full-viewport takeover, safe-area padded, `dvh` tall so the keyboard does not hide the body; Title left and Close (X) top-right in the header; a footer row pinned at the bottom with Discard draft... left and Send right (`MailComposeFooter`, shared with Reply/Forward, whose footer is Cancel left, Send right). Decision `20261016-150102`. Wide: replaces the reader Panel (reader hidden, not unmounted). Reply/Forward (`MailComposeBox`) keep their inline layout and share only the footer.
- Recipients (`NewMailRecipientPicker`): characters, corporations, alliances and the Character's joined mailing lists (`loadMailingLists`, local filter). Each chip and option shows its type. Search is `searchTypedMailRecipients` (ESI character+corporation+alliance, >= 3 chars, 300 ms debounce); it needs `esi-search.search_structures.v1`, so without it a `GrantNote` shows and only mailing lists are offered. Capped at 50 (`MAX_RECIPIENTS`): counter beside the field, input disabled at the cap.
- Limits (`engine/mail/mail/mailCompose.ts`): subject 1000, body 10,000, live counters, Send disabled past either (`validateNewMail`). The body is counted by `composeBodyLength` (raw characters today; swap for the markup length function).
- Body seam: `MailBodyEditorProps` (`value`, `onChange`, `id`, aria props, `className`) in `MailBodyEditor.tsx`; `NewMailComposer` and `MailComposeBox` take `bodyEditor` (default `MailBodyEditor`, the lazy rich editor; `PlainBodyEditor` is a `TextArea` kept for tests). The composer and draft/send code only ever see the body as an EVE markup string, and never apply `mailSafe` to it (that would delete the tags); literal `< & >` the pilot typed are entity-escaped by the serializer (`&lt; &amp; &gt;`). Other `sendMail` callers (Communities invites/requests, open-in-EVE) are unchanged.
- Draft: one slot per Character in `mailDrafts` (id `characterId:new`, `kind: 'new'`, `mailId: 0`), recipients keep their names. `body` is the serialized markup and the row carries `format: 'markup'`; a row without it was saved by the plain editor and is escaped on load (`draftMarkupBody`), so `<b>` typed there reads literally rather than becoming a tag. Debounced 500 ms save; an empty composer deletes the slot. Reopened as left. Close (X) flushes and keeps it, with the "Your draft is saved." toast; Discard draft... asks in a Modal then clears.
- Send: `sendMail`, same never-sent / unconfirmed / error logic as Reply/Forward, `NeedsConnection` on Send. Success clears the slot, closes, shows a "Mail sent" toast (no Undo: ESI sends immediately) and refetches the sender's headers.

## Rich body editor

Decisions: `20261016-124635-mail-compose-format-bar-and-eve-markup.md`, `20261016-141225-mail-editor-tiptap-view-switch-above-the-surface.md`; library choice `docs/adr/0022-tiptap-for-the-mail-body-editor.md`.

- **Editor**: Tiptap (ProseMirror) with individual extensions: document, paragraph, text, hard break, bold, italic, underline, link, table (plain-text cells), history, plus two custom marks for EVE colour (`#aarrggbb`) and size (px). No headings, lists, images, code. Lazy: `MailBodyEditor` is a `React.lazy` boundary, so the Mail page and the rest of the app load none of it until a composer opens.
- **Wire authority**: `engine/mail/mail/eveMarkup.ts`. `engine/mail/mail/mailEditorDoc.ts` converts editor JSON <-> `MarkupNode`s and always finishes with `parseEveMarkup` -> `serializeEveMarkup`, so only the safe subset can be emitted, nesting is depth-capped and `< & >` are entity-escaped. Default text carries no wrapper tag (the game's own `#bfffffff` applies).
- **Surface**: the editing canvas uses the reader's EVE mail surface (`EVE_MAIL_SURFACE_CLASS`, dark in every theme) so colours look as they will in game. Sizes scale from the game's 12px default, like the reader.
- **Paste**: HTML is parsed through the schema, so only bold/italic/underline/links survive (colour/size styles from other sites are ignored); everything else becomes plain text. A markdown pipe table (and nothing else markdown) becomes a table. Typed `**x**` stays literal (the editor's markdown shortcuts are off).
- **Preview / Source**: Preview is the default; an icon-only `</>` toggle ("Edit source", `aria-pressed`) at the right end of the format bar switches to Source (decision `20261016-155019`, superseding the SegmentedControl above the surface). Source is a monospace textarea of the EVE markup; every keystroke emits `sanitizeMarkup(text)`, so the counter, draft and Send always read what would be sent. Switching back to Preview re-parses; if tags were removed ("EVE can't show it") an inline status says so.
- **Format bar** (`mailEditor/MailFormatBar.tsx`): Bold, Italic, Underline (`aria-pressed` from the caret/selection via `formatStateOfRuns`), Colour (dot of the current colour), Size, Link, Table, Clear formatting. The editor is one card: the bar is its top strip (one hairline under it), buttons are flat (no borders; accent tint when pressed) in groups divided by hairlines, and the body character counter sits in the card's bottom-right corner (the `counter` prop). Link is disabled with a tooltip inside a table cell (cells are plain text). Icon buttons are 44px on touch, take no focus (pointer/mouse down default-prevented) and carry tooltips via `IconButton`. Always shown as the card's top strip, never `fixed` (decision `20261016-183802`): one horizontally scrolling row on a phone, wrapping on a wide screen. The ProseMirror editable fills the card's surface, so a tap anywhere in the box lands in it and opens the keyboard.
- **Sheets** (`FormatDialogs.tsx`, `Modal`: bottom sheet on a phone, centred on desktop): Colour = 12 opaque swatches on the dark surface + Default + custom hex (3 or 6 digits, always alpha `ff`). Size = Small 10px, Normal (no tag), Large 16px, Huge 24px (`MAIL_SIZE_PRESETS`, inside the 6-64 markup range). Link = two fields, **Text** (max 200, plain text, escaped on send) and **Web address** (http(s) only; a bare `example.com` becomes `https://`; `javascript:`, `data:`, `showinfo:` etc. are refused with an inline error). A selection prefills Text and is replaced by the edited text carrying the link (bold/colour/size of its first character kept); a bare caret inserts a new link (empty Text uses the address as the text); a caret or selection inside a link prefills both fields and applies to the whole link, and **Remove link** drops the link but keeps the text. Enter submits, focus starts on Text when empty, otherwise the address. In Source the same dialog writes `<a href="URL">TEXT</a>` over the selection (an exactly-selected existing tag is prefilled and replaced whole; Remove link is unavailable there); loaded `showinfo:`/inert links survive a Forward but cannot be inserted. Table = rows (2-10) x columns (2-6) steppers, first row is the header.
- **Tables**: a table node in Preview, serialized as `| a | b |` rows with a `|---|---|` separator under the header (cells: `< & >` entity-escaped, `|` -> `¦`, newlines -> spaces). The reader already draws pipe tables. Loading markup turns pipe-row blocks back into tables; space-aligned columns stay prose.
- **Source and the bar**: bold/italic/underline/colour/size/link wrap the textarea selection in the tag pair (the same tags the serializer writes; caret lands between them when nothing is selected), Table inserts empty pipe rows, none shows as pressed, **Clear formatting, Default colour, Normal size and Remove link are disabled** (Clear has a tooltip) because each would have to untangle tags around the selection. While Source holds markup the safe subset would remove, a live inline note says so (Send would drop it; we chose the note over blocking Send).
- **Send path**: both composers pass the body through `sanitizeMarkup` immediately before `sendMail`, so nothing unsanitized is sent even from a stored draft or a swapped `bodyEditor`. `PlainBodyEditor` edits the text of the body and re-escapes it (`plainTextToMarkup`), so it cannot inject tags either.
- **Ids and labels**: exactly one element carries the body id: the editor surface in Preview, the textarea in Source. A click on the composer's `<label for>` focuses the editor surface (a div cannot be labelled natively).
- **Mobile input**: ProseMirror's own Android/iOS handling and IME composition; no custom composition code. Not verified on real devices (see below).
- **Tests**: pure logic `engine/mail/mail/mailFormat.test.ts`, `engine/mail/mail/mailEditorDoc.test.ts`; schema, paste and mark behaviour on a headless editor `mailEditor/extensions.test.tsx`; bar, sheets and Source at the seams `MailFormatBar.test.tsx`, `RichMailBodyEditor.test.tsx` (jsdom cannot simulate soft keyboards, selection UI or IME).

### Known gaps (rich editor)

- Pipe-table rows lose inline formatting and links when loaded into the editor (e.g. a Forward of a mail with a bold cell): cells hold plain text.
- A prose line that starts with `|` and has two or more `|`-separated parts across two or more lines is read as a table when markup loads.
- `¦` replaces `|` inside a table cell on send, since a pipe row has no escape.

## Verification checklist (one test mail, real EVE client)

In-game behaviour is unverified until this is done (decision `20261016-124635`). Send **one** mail to yourself from New Mail containing each of the following, open it in the EVE client, and record the result in the decision file; anything the game drops comes off the toolbar.

1. **Sizes**: a line each in Small (10), Large (16) and Huge (24) between normal lines. Do the three look different from normal and from each other? Is 24 clipped or capped?
2. **Colours**: a red, a green and a custom-hex word. Do they show as chosen on the game's dark mail window? (Alpha is always `ff`.)
3. **Bold, italic, underline**: each alone and bold+italic combined.
4. **Links**: an `https://` link with different link text (made with the Link sheet's Text field, including one with `<`, `&` in the text, and one edited over an existing link), and check clicking it opens the browser/warning as the game normally does.
5. **Pipe table**: a 3x3 table with a header. Does it read as tidy `| a | b |` rows (separator row `|---|` visible, fine) and does the app's reader draw it as a table on the received mail?
6. **Entities**: the text `a < b & c > d`. It must show exactly like that in game (sent as `a &lt; b &amp; c &gt; d`).
7. **Tags survive ESI**: after receiving, does the mail show formatting at all, or literal `<b>` tags / plain text? Does the app's reader show the same formatting on the received copy?
8. **Line breaks and blank lines**: a blank line between paragraphs and a double blank line.
9. **Not checked by this build, check anyway**: whether the game renders `<font size="N">` at the preset values proportionally to its default (the editor assumes 12px).

Not verified in this slice: real iOS Safari / Android Chrome soft keyboards (autocorrect, composition, `visualViewport` behaviour), and in-game rendering of any tag.

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
- No delete, no mark-unread, no label assignment, no mailing-list view; `getCharacterMailingLists` is used only to name recipients.
- Search matches subject and sender name only; not body, not recipients (Sent folder rows are searched by sender = yourself).
- Unread count per chip is ESI's count for all mail, not for the loaded/filtered window; "Hide read" uses per-header flags.
- Reader renders a safe subset of EVE markup; no images. Constellation and faction show-info links stay inert text.
- Folder chips on phone are hidden while a mail is open, so folder cannot be changed without Back.
- `loadMoreMailHeaders` swallows non-auth errors silently (list stays, button stays).
- Forward picker only adds characters; cannot add a corp, alliance or mailing list.
- Recipient search needs `esi-search.search_structures.v1`, which is not part of the mail scope set; a character without it just sees contacts (search failure -> empty results, no message).
- FAQ/Help panels do not mention Mail.

## Persistence and sync

| State                                                            | Storage                                                                                                  | Synced? |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------- |
| `search`, `hideRead`                                             | URL query (ADR 0015 `docs/adr/0015-tab-is-a-path-segment-url-holds-view-state.md`), omitted when default | no      |
| Selected folders                                                 | Dexie `settings` key `mailFolders`, device-wide                                                          | no      |
| Scope (This / All characters)                                    | Dexie `settings` key `mailScope`, device-wide; URL `scope` overrides per view                            | no      |
| Selected mail, open compose, locally-read set                    | React state only                                                                                         | no      |
| Headers/labels/lists/bodies                                      | Dexie `esiCache` per Character (`mail:headers`, `mail:labels`, `mail:lists`, `mail:<id>`)                | no      |
| Drafts (Reply/Forward per mail, New Mail one slot per Character) | Dexie `mailDrafts`                                                                                       | no      |
| Read flag                                                        | ESI (source of truth) + patched cache                                                                    | via ESI |

## Test-covered behaviours (`src/routes/Mail.test.tsx`)

Newest-first with names (:177); reader header absent until selection (:184); markup stripped (:204); focus on open/Back (:211) and Reply/Cancel (:226, :241); Public Info from sender (:273); offline cache (:296); empty (:311); no-sender fallback (:319); reauth banner (:336); folder toggles and unread counts (:347, :362); empty selection recovery (:383); no-match copy (:399); URL round-trip (:408, :437); words-not-colour (:449); Sent shows recipient (:459); standing tags own/stranger/inherited (:507-531); no CSV button (:551); list bounded (:557); load more at 50 incl. names/standing/stale-character discard (:577-695); search by subject and resolved sender (:749, :760); local read + ESI write, retry per reopen, no write when already read, silent failure (:770-851); mailing-list names (:866, :885).

## Interview Q&A

1. **How is a mail's folder decided when it carries several labels?** Highest precedence in `['sent','alliance','corp','inbox']` among labels whose id maps to a System Label by name; none -> inbox (`engine/mail/mail/mail.ts:32,45-58`). So a custom-labelled-only mail shows as Inbox.
2. **Why are the unread numbers not summed or computed client-side?** They come straight from each System Label `unread_count`; `total_unread_count` is not their sum once custom labels exist (`Mail.tsx:600-621` comment, decision `20260907-125125-mail-folders-are-multi-select-toggles-not-tabs`).
3. **Why do folders persist device-wide in Dexie and not in the URL?** A folder filter exists to hide mail; forgetting on reload defeats it; device-wide because it is a habit of the pilot (`mailFolderPref.ts`). Search and Hide read are short-lived view state, so URL (ADR 0015).
4. **How many mails can the user actually reach?** ESI returns 50; "Load more" pages with `last_mail_id = min(mail_id)` and appends (`features/character/mail.ts:71-92`); `hasMore` = last page >= 50 (`engine/mail/mail/mail.ts:86,~100`). Rendered rows capped at 200 after filters (`engine/mail/mail/mail.ts:127`), with a notice; the pagination cursor is unaffected.
5. **What exactly happens on opening an unread mail?** Row click -> select, `markLocalRead` (instant dim), and if ESI `is_read` false -> `PUT mail/{id}` `{read:true}` (`Mail.tsx:712-721`, `mail.ts:148`). Success patches cached header; failure is swallowed except auth failure (reauth banner via `reportWriteAuthFailure`), and it retries on each reopen (test `:807`). Needs `esi-mail.organize_mail.v1`, added after launch (issue #741) so old tokens may lack it.
6. **How does Reply decide recipients and what is not removable?** `buildReplyAllRecipients` (`engine/mail/mail/mail.ts:196`): sender (if not you) as non-removable character, then each other recipient except your own character id, de-duped by `type:id`. Subject prefixed `RE:` unless already (`:235`, case-insensitive). Body quoted with `> ` lines.
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
- ~~Render safe EVE links (character/system/item show-info) in the body instead of flattening.~~ Done.

## Compose review notes

Full-pane New Mail is a portalled `role=dialog` (page behind `inert`, Escape closes keeping the draft, focus returns to the Compose button), sized by `useVisualViewportBox` so the iOS keyboard does not cover the body. The draft is flushed on unmount, tab hide and `pagehide`; the composer is keyed by Character.
