# Alerts panel (bell popover) — UX research

Research for a rework of the bell popover (`src/features/notifications/AlertsPanel.tsx`,
surface in `src/components/ui/AlertsBell.tsx`). Sources: Mobbin (web + iOS
notification inboxes), `docs/DESIGN.md` §6c, and the panel's own code.

Built and shipped in the same change as this document, so it describes what
the panel does rather than what it might do. The mockup story that preceded it
(`src/mockups/AlertsPanel.stories.tsx`) was deleted once the real panel landed,
as `docs/design/mockups/README.md` step 9 requires; git history keeps it.

## 1. What is wrong today

Read off `AlertsPanel.tsx` as it stands:

| Problem | Where it comes from |
|---|---|
| Two or three full-size `Button`s per group row (View / Snooze / Dismiss) | `AlertsPanel.tsx` group row, `buttonSize` `sm`/`md` |
| The row itself does nothing — only the buttons are targets | No row click handler; only the count toggle expands |
| Every group row looks the same | One `<li>` style for all; only `critical` gets a left border and tint |
| No way to stop a type from the panel | The only mute is Settings › Notifications, found by typing the type's name into that page's search box |
| Dismiss is irreversible and sits next to the thing you want to press | No undismiss path exists (`feedSync.ts` exports dismiss only) |

The fire rows *inside* an opened group already do the right thing: body is a
`Link`, dismiss is a plain `×` `IconButton`. The group row never got that
treatment.

## 2. What the standards say

Twelve web and twelve iOS notification inboxes sampled on Mobbin. The
consistent pattern across them:

### 2a. The row is the target; actions are secondary

- [Jira](https://mobbin.com/screens/f09233f3-fab0-470e-bcdb-193fdb1ba056) — whole row opens the item. No per-row buttons at all. A grouped row carries a `+12 updates from Alex Smith` sub-line that expands.
- [Linktree](https://mobbin.com/screens/9550a60a-c074-4bbb-844f-24c18e134860), [monday.com](https://mobbin.com/screens/b4195096-be59-4c5f-9dca-2d32d4bf7812), [Air](https://mobbin.com/screens/d91e274e-cbb3-4d61-a521-5fc16828ec3f) — same: row opens, no visible action buttons.
- [Dovetail](https://mobbin.com/screens/2d3717f3-e00c-41be-b652-b6ee684c7b46) is the counter-example and it looks like ours: a `View` button on every row, which reads as six identical buttons stacked down the panel.

A visible button survives only where the action is **not** the row's own
destination: [Cleo AI](https://mobbin.com/screens/a4d7c5bf-fd3f-4f4b-855c-1030f40182e5)
and [Agoda](https://mobbin.com/screens/e21cd3cd-b851-4928-b1b7-a72c743a17d0)
put one pill on the *one* row that needs it, not on all of them.

**Verdict:** View becomes the row click. It is also what §6c already requires —
"A row's primary action beats name links inside it".

### 2b. Mute lives in a per-row overflow menu; dismiss stays on the surface

- [Pinterest](https://mobbin.com/screens/4630513d-143a-4d51-9bc1-b8f231dd4fdf) — `···` per row, holding **Delete update** and **View notification settings**. The closest match to what we need.
- [Remote](https://mobbin.com/screens/5e916e4a-4c86-4c06-a455-9a8d1785603d) — `···` per row, holding **Mark as read** and **Dismiss notification**.
- [monday.com](https://mobbin.com/screens/b4195096-be59-4c5f-9dca-2d32d4bf7812) — same `···` per row on iOS.
- [Mindtrip](https://mobbin.com/screens/95b3d1e5-2adc-4935-9104-247464e1d0b4), [Canva](https://mobbin.com/screens/2a66d379-9fb8-4f0a-bef7-2e0233f86250) — panel-level `···` in the header, holding Mark All as Read and Settings.

Not one of the twenty-four samples put "turn this off" on the surface as a
standing control. It is always one level down, behind `···`. Phones add
swipe-to-delete on top ([Best Buy](https://mobbin.com/screens/453e4fc9-da03-4223-90b7-faeed7ce1e65)),
never instead.

**Where the recommendation goes past the sample:** none of the twenty-four
screens had a *one-tap mute* in the row menu — Pinterest's item is "View
notification settings", which still hands you off to a settings page. Adding
**Stop these alerts** beside it is our own step, taken because the complaint is
specifically about that hand-off being four steps long. The settings item stays
for the cases one tap cannot cover (per-character, per-channel, thresholds).

**Verdict:** Dismiss stays on the surface as a small `×` (§3e, WHOOP's
pattern), and one `⋮` per row holds Snooze, "Stop these alerts" and
"Notification settings…".

On §6c's "a row gets a ⋮ only for two or more real actions": Snooze is price
alerts only (`isSnoozable`), so most rows hold **two**, not three. Two still
clears the bar, but only if the pre-filtered "Notification settings…" counts
as distinct from the footer's "Notify me about…", which opens the same page
unfiltered. It does — landing on the row's own type with the list already
narrowed is the four-step detour this change is removing — but the ticket
should state it rather than leave a reviewer to work it out.

### 2c. Rows are told apart by an eyebrow and a glyph, not by colour

- [Shopify](https://mobbin.com/screens/ab41fa89-119c-491c-ad2d-e88c2e39cda1) — a dim category eyebrow above each title: `Payments · 9:33 am`, `Point of Sale · Aug 3`, `Settings · Aug 3`. Same type scale, same colour, instantly scannable.
- [Jira](https://mobbin.com/screens/f09233f3-fab0-470e-bcdb-193fdb1ba056), [HoneyBook](https://mobbin.com/screens/42826bc0-101e-41ce-820f-3333f5788168), [Linktree](https://mobbin.com/screens/9550a60a-c074-4bbb-844f-24c18e134860) — a leading avatar or product glyph per row does the separating.
- [Tabby](https://mobbin.com/screens/6d39e50e-d8b5-43e0-b78a-7f96fcc12007), [Binance](https://mobbin.com/screens/2a613810-3ef7-472e-928d-47802e468d26) — leading icon per row, one per source.

**Verdict:** a leading topic glyph plus a dim eyebrow. No new palette — see §3c.

### 2d. Destructive actions get Undo, not a confirm

[Canva](https://mobbin.com/screens/2a66d379-9fb8-4f0a-bef7-2e0233f86250) shows
the standard: `All notifications marked as read · Undo` as a toast. Nothing in
the sample asked "are you sure?".

## 3. Proposal

### 3a. Group row anatomy

```
┌──────────────────────────────────────────────────────────┐
│ [glyph]  STRUCTURES · 4m                         ×   ⋮   │   ← eyebrow + age, then dismiss and the menu
│          Structure under attack          ▸ 12            │   ← title, expand cue (only when > 1)
│          Astrahus "Ridge" is under attack in J155207     │   ← newest body, dim
└──────────────────────────────────────────────────────────┘
```

- **Whole row is the click target.** A single-fire group goes to its View
  destination (`alertViewPath`). A group of many **expands**, and each fire row
  inside it keeps today's own link — so "tap the group, then tap the one you
  want" is the whole path, which is what was asked for.
- **The caret and count `▸ 12` are the expand-state cue, not a second
  control.** The row click already does the expanding, so a separate toggle
  would duplicate it (§6c "Check first").
- **Two trailing controls, one cluster at the right edge.** `×` dismisses the
  group in one tap (§3e); `⋮` holds everything else (§3b). The `×` sits first,
  nearer the content, and the `⋮` stays pinned at the very edge where §6c
  already puts it on a phone card. Both are plain `IconButton`s, not `Button`s
  — which is the original complaint answered directly: dismiss is a small icon.
- **Space them apart.** §6c is explicit: "A destructive `×` beside a `⋮` is a
  mis-tap hazard: fold Delete into the menu as a danger item, or separate it
  from the `⋮`" (DESIGN.md:1359). Folding is not open to us — a menu item is
  the buried Dismiss this whole change exists to undo — so take the other
  branch and put real space between the two, not the hairline gap a normal
  icon pair gets. Their hit areas must not touch (WCAG 2.5.8), at touch sizing
  especially. Dismiss here is gentler than the Delete that rule has in mind —
  it is undoable for the life of the toast (§4a) and the row comes straight
  back — but "less destructive" is not "not destructive", and a mis-tap that
  fires the wrong one of two adjacent 36px targets is exactly what the rule
  is about.
- **The caret and count are not a third control.** §6c also says "A › caret
  beside a ⋮ is redundant: drop the caret". That rule is about a caret *in the
  trailing cluster*, standing in for a row action. `▸ 12` sits mid-content
  beside the title, is not focusable, and reports expand state that the row
  click owns — so the cluster stays two controls, and the rule is not in play.
  Worth saying out loud so a reviewer does not reject it on sight.

### 3b. The `⋮` menu

| Item | Does |
|---|---|
| **Snooze 1h** | Unchanged, price alerts only (`isSnoozable`) |
| **Stop these alerts** | Turns off `feed` + `browser` for this type, for every character (§4c) — the thing the pilot goes to Settings for today |
| **Notification settings** | Deep link, pre-filtered (see §4b). No trailing "…": `placeholderEllipsis.test.ts` reserves that for a label that opens a dialog, and this navigates |

**The same menu opens from the row itself** — right-click with a pointer,
touch and hold on touch. §6c's gesture table already assigns touch-and-hold to
"the row's or tile's menu (the same as its ⋮)", and the Overview's widget cards
already pair a `⋮` with a right-click menu holding the same items, so this is
the existing convention rather than a new one. It is also what lets the `⋮` dim
at rest (§3d): three ways in, so the icon is a shortcut.

**Dismiss is not in this menu.** It is the visible `×` (§3e), and §6c's
"Duplicates" rule means it cannot be in both places. An earlier draft of this
document had Dismiss in the menu and no `×`; that was wrong — the opening
complaint asked for dismiss as *a small icon*, not for it to be buried a tap
deeper than it is today.

**A danger row keeps a visible Acknowledge and gets no `×` and no `⋮`.** "Mark
all read" skips danger on purpose (`markAllReadTargets`), so clearing one has
to stay a deliberate, worded act — a bare `×`, or a swipe in a pocket, is the
worst failure this panel can have. Once Acknowledge is on the surface the menu
has nothing left to hold: "Stop these alerts" is off for critical types (§4e)
and Dismiss would duplicate Acknowledge, leaving one item, which is below §6c's
two-action minimum. So the menu is deleted rather than hidden, and per-type
settings for a critical type are reached through the footer's existing
**"Notify me about…"** link.

### 3c. Telling types apart — without inventing colours

`severityTone.ts` is explicit that severity is the one *ordinal* scale and that
kind-of-clock is the one *nominal* palette. So topic gets **no colour**:

- **Leading glyph** reusing the nav icons the app already owns —
  `NavMarket`, `NavIndustry`, `NavMail`, `NavCorp` (structures), `NavSkills`,
  and `NavAlerts` as the fallback. The first five are exactly the chips
  `typeChipOfGroupKey` can return, so the chip bar and the glyphs name the
  same thing. **The fallback is not decoration.** That function returns `null`
  for every `eveType:` key that is not a structure prefix, and for any
  `event:` id missing from `EVENT_CHIP` — a corp bill notification, say — so
  those groups have no chip today and would have no glyph either. They get
  `NavAlerts` and the eyebrow word "Alerts", because a row with no topic cue
  is the complaint this section exists to fix. The ticket should look at what
  actually lands in that bucket and, where a group deserves a real chip, add
  it to `EVENT_CHIP` rather than leaving it in the fallback.
- **Dim eyebrow** with the topic word and the age, Shopify-style.
- **Severity keeps exactly today's treatment**: `critical` gets the left
  border and tint it has now, and nothing else changes. No `warning` border,
  and **the topic glyph is never tinted by severity** — it names the topic, and
  colouring it `danger` on a critical row would make one mark carry two facts.
  The left border, the tint and the worded Acknowledge already carry severity.

  Two reasons not to add one. `severityTone.ts` warns against a "third
  telling" of a fact the list already carries — the panel is sorted worst-first
  (`compareGroups`), so position is already saying it. And a `warning` border
  would be **colour with no word behind it**, which fails §7 / WCAG 1.4.1: the
  topic eyebrow and the glyph both name the *topic*, not the severity. A
  critical row escapes that only because its visible **Acknowledge** button is
  the word that carries it.

### 3d. Hover — and why it cannot carry the cue

The ask was "dismiss and mute only on hover". **§6c forbids hover-only cues**:

> **Visible at rest.** The cue shows without hover. Hover, cursor and colour
> can reinforce it but never carry it alone: a phone has no hover and no
> cursor, and colour alone fails WCAG 1.4.1.

There is exactly one written exception, the Magnifier badge (DESIGN.md:1053),
and it earns it by (a) fading in on hover *or focus* with a pointer, (b) being
**always shown** on `touch:` / `hover:none`, and (c) sitting on a surface where
the whole thing is the click target.

The `⋮` meets (a) and (b) but **not (c)**: the Magnifier badge is an
`aria-hidden` cue for the surface's *own* click, and this menu is not the row
click. So this is a near neighbour of that exception rather than a case of it,
and it stands on its own footing — the menu has two other doors, a right-click
and a touch-and-hold (§3b), so dimming the icon hides a shortcut and not the
action. The §6c row the ticket writes should say that plainly instead of
leaning on the Magnifier. The treatment itself:

- pointer: `⋮` at reduced opacity at rest, full on `group-hover` / `focus-within`
- touch and `hover:none`: always at full opacity
- keyboard: always reachable, revealed by `focus-within`

**Dismiss is not part of this.** It was in the hover ask, but §3e puts it on
the surface instead. The `⋮` can dim because its menu also opens from the row
itself — right-click, or touch and hold (§3b) — so the icon is a shortcut.
Dismiss has no second route, so hiding its control would hide the action.

That keeps the panel quiet while you read it and still passes §6c. It needs a
new §6c row in the same PR that builds it.

### 3e. One-tap dismiss: the `×` and the slide-away

A visible per-row dismiss is a real convention, not a nicety.
[WHOOP](https://mobbin.com/flows/53553888-d70e-45e6-bf6d-c328e20645d6) puts a
`✓` at a card's top-right with the count beside it, and a tap clears the card;
the promo card on the same screen uses `×` instead. Both glyphs read in an
inbox; which one is right here is settled by what each already means in this
codebase — see below.
[Quicken](https://mobbin.com/flows/172e95f5-f6b6-437a-9af5-78d3a285ccee)
reserves a confirm dialog for "Clear All" and reports the result in a plain
toast — the same split as §2d: a confirm for the sweeping act, a toast for the
rest.

**The control.** A plain `IconButton`, `×`, first in the row's trailing
cluster. Its label names the scope, so a group of many reads "Dismiss all 12
Market order undercut alerts" and a single reads "Dismiss Price alert
triggered".

**Visible at rest, always.** The `×` does *not* get the §3d Magnifier
treatment, and the difference is not taste. The `⋮`'s menu has three doors —
the icon, a right-click with a pointer, and a touch-and-hold on touch (§3b) —
so dimming the icon hides a shortcut, not the only way in. Dismiss has no
second door: the row's own click is View. So the `×` sits at full opacity on
every input, and only the `⋮` dims at rest.

**The slide-away.** On dismiss the row translates out in the same direction as
the phone swipe (§3f), then its height collapses so the rows below glide up
instead of jumping. `Collapse` itself is a disclosure component and does not
fit a list row, so the build does this with a grid-rows transition on the `<li>`
— a 150ms slide, then a 200ms height collapse, with the panel holding the row
for `LEAVE_MS = 400` before it goes. Under `prefers-reduced-motion: reduce`
there is neither slide nor collapse: the row is simply gone, which is what
every other motion in §7 does.

**Focus after a dismiss**, or the keyboard drops to `<body>`: move it to the
next row's `×`, to the previous row's if the dismissed row was last, and to the
panel heading when the list empties.

**Glyph: `×`, the one this panel already uses.** The first sketch said `✓`, and
it does not survive a look at the codebase. `Icon.Done` and `Icon.Select` are
the same Phosphor `Check`, and in an `IconButton` today that glyph means *pick
this* — `BlueprintAcquisitionModal`'s "use this row", `CorpAssets`'s
select-mode toggle. As a bare glyph it means *this is done* in roughly twenty
places (copied, accepted, success).
[Hulu](https://mobbin.com/flows/8411ddf0-a4af-412b-9b3a-c045fd5d05b1) shows the
same reading inside an inbox: `✓` circles in a left gutter, for multi-select.
A third meaning would break §6c's one meaning per cue.

`Icon.Close` has none of that trouble here:

- This panel's own `FireRow` already dismisses a fire with it
  (`AlertsPanel.tsx:404`), so a group row and the fires inside it end up using
  one glyph for one action instead of disagreeing.
- On a pointer the panel's header closes with the **word** "Close"
  (`AlertsPanel.tsx:158`), not an `×`. On a phone it does not: that button is
  behind `{!sheet && …}`, and the `sheet-full` `Modal` supplies its own header
  close, which *is* an `Icon.Close` `IconButton` (`Modal.tsx:238`). So on a
  phone two `×` glyphs are on screen at once. They are told apart the way they
  are everywhere else in the app — one sits in the overlay's header and closes
  the overlay, one sits in a row's trailing cluster and acts on that row — and
  each carries its own label. Worth saying in the §6c row rather than
  pretending the collision is not there.
- `×` on a notification is about as widely read as a glyph gets — it is what
  the promo card on WHOOP's own screen uses, beside the `✓` that clears a
  health card.

So: `×`, no change to `FireRow`, and no new glyph meaning anywhere. The §6c row
the ticket adds says where a row's `×` dismisses the row rather than closing an
overlay: in a feed row's trailing cluster, with an Undo behind it.

### 3f. Swipe to dismiss on a phone

**The app has no row swipe today.** `useSheetSwipe` is the only swipe gesture in
the codebase and it is vertical — a sheet's own swipe-down-to-close
(`SWIPE_DISMISS_DISTANCE = 80`, `SWIPE_DISMISS_VELOCITY = 0.5`). The phone
calendar's "swipeable" week is native `overflow-x`, not a gesture handler.
Nothing swipes a *row* sideways anywhere, and §6c's gesture table has no entry
for it: `Drag` there is "only from a visible grip".

**Direction: the row travels toward the inline start — left, in English.**
[Jira Cloud](https://mobbin.com/flows/e7bbcaaa-59fd-4e38-a592-321158590609)
is the closest match to this panel: the row's content slides left until it is
clipped at the left edge, a grey **Clear** track is uncovered at the right, and
the row leaves. So the track and the `×` both live at the inline *end*, and the
movement is toward the inline *start*. Build it on logical properties, so the
two flip together if the app is ever translated right-to-left.

Terms:

- **One direction, one action.** A swipe toward the inline start dismisses,
  uncovering a track at the inline end with the same `×` under the finger. No
  swipe the other way, no two-action track, no separate full-swipe shortcut —
  a second gesture on one row is a second thing to remember and to get wrong.
- **The track is neutral, not `danger`.** Red in this panel means critical
  severity; a warning row flashing the structure-under-attack colour as it
  leaves would be the same palette collision §3c rejects. Jira's is grey.
- **The `×` is the alternative WCAG requires.** 2.5.1 (pointer gestures) and
  2.5.7 (dragging movements) both want a single-pointer, non-dragging path to
  anything a gesture does. §3e's button is it, which is also why the swipe
  needs no cue of its own: it adds no meaning the row does not already show.
  Jira Cloud prints a literal "Swipe to remove" line on the row; worth copying
  only as a first-run hint, never as a permanent third line on every row.
- **Critical rows do not swipe.** Acknowledge is a deliberate act (§4e), for
  the same reason they get no `×`.
- **Axis lock, inside a sheet that already swipes.** On a phone the panel is a
  `Modal placement="sheet-full"`, whose surface is already tracking a vertical
  drag for its own dismiss. The row needs `touch-action: pan-y` plus a
  horizontal activation threshold, and must not begin a drag the sheet or the
  scroller already owns. `ChartHover` is the precedent for `pan-y` on a gesture
  surface.
- **It is a §6c change and a shared hook.** A new gesture row ("Swipe toward
  the inline start — dismisses a list row that also shows a dismiss control"),
  and a hook beside `useSheetSwipe` rather than one buried in the alerts panel.

**Sequencing.** The `×` and the swipe are the same action and should ship
together on this panel; the shared hook and the §6c gesture row can be their
own ticket if the panel work is already large. What must not happen is the
swipe shipping *without* the `×` — that would be a hidden gesture as the only
quick path, which is the thing §6c and WCAG 2.5.1 both forbid.

## 4. Constraints found in the code

These decide what is buildable; each one changes the menu copy or the scope.

### 4a. There is no undismiss — so Undo has to delay the write

`feedSync.ts` exports `dismissFeedEntriesAndSync`, `dismissFeedKeysAndSync` and
`recordFeedEntryAndSync`. No undismiss. Worse, `mergeFeedRecord` (`feed.ts:132`)
takes the **later** `dismissedAt` on a sync merge, with absent counting as
never — so clearing the field locally would be undone by the next sync.

**Therefore Undo must hold the write, not reverse it** — and that mechanism is
already built. `useDeferredCommits` (`src/components/ui`) hides the row and
raises the toast now, running the real write only when the toast ends; it caps
at `DEFERRED_COMMIT_CAP = 3`, commits anything still pending on `pagehide`, and
keeps a committing id hidden until its write settles so a row cannot flash
back. `ToastStack` is its paired surface, and a `Toast` expires after 8s with
hover or focus holding the clock. So Dismiss passes `dismissFeedEntriesAndSync`
as the `commit` and changes nothing about the sync path. The one-tap `×` of §3e
makes several dismisses in quick succession likely, which is the case the stack
and the cap exist for.

### 4b. "Notification settings…" can deep-link — but only for app events

`NotificationsPanel.tsx:100` already reads `useUrlParam('search', SEARCH_PARAM)`,
so `/settings/notifications?search=<the type's label>` opens the page
pre-filtered. The `?grant=` flash in `PermissionsPanel.tsx:60` is the precedent
for also flashing the landed row.

**The catch:** `filterNotificationEvents` (`notificationSearch.ts:42`) matches
only app **event** labels and character names, and `NotificationEventList`
passes `showEveTypes={!searching}` — so an active search *hides* the EVE
notification types entirely. A deep link works for an `event:` group and lands
an `eveType:` group on an empty page.

Two ways out. **Option 1 is what was built:**

1. Make the search match EVE type labels too (`eveTypeLabel`) and stop hiding
   the EVE types while searching. Fixes the deep link and the pilot's manual
   search in the same change.
2. Link `eveType:` groups to the EVE-notifications section by its `topic`
   param instead, and keep `?search=` for events only.

Option 1 was the better buy — the pilot's four-step workaround failed on EVE
types for the same reason — and it is what shipped: `filterNotificationEvents`
takes the EVE type labels and returns `visibleEveTypes`, and
`NotificationEventList` filters the types to that set instead of hiding them
all. Always-on would have dumped every allow-listed type under any search. The
panel must therefore link with `eveTypeLabel(t, type)`, not the raw type id —
`StructureFuelAlert` reads "Structure Low on Fuel".

### 4c. Mute is per character; a group is not

`withEventChannelToggled(value, characterId, eventId, channel)` and
`withEveNotificationTypeToggled(value, characterId, type, channel)` both take a
`characterId`. An `AlertTypeGroup` carries `characterIds` — plural.

**Decided (pilot, 2026-10-28): all account characters.** "Stop these alerts"
turns the type off for every character on the account, not only the group's.
That is what the words say, and it is what the pilot asked for. Build it as a
loop over the account's characters through `withEventChannelToggled` (or
`withEveNotificationTypeToggled` for an `eveType:` group) on both channels. The
toast names the scope — "Structure fuel alerts off for all characters · Undo",
or, on a device with a single character, the same line without the "for all
characters" clause, which would be noise —
so the broad action is visible and reversible.

### 4c-bis. Open questions the ticket must answer

- **Does "Stop these alerts" also clear the fires already listed?** Recommend
  yes, under the same Undo — "off, and these 12 gone" is one decision, and
  leaving the rows behind means muting does not make the panel any quieter.
- **Nesting.** A whole-row click target, a visible Acknowledge and a `⋮`
  cannot nest inside one link. Use the cover-button pattern §6c names for the
  Character switcher (the controls sit *above* the row's cover button, never
  inside it).
- **Settled: the `⋮` rests at 60%, not 45%.** Measured against `bg-panel`, 45%
  of `text-dim` is 2.4:1 and fails WCAG 1.4.11's 3:1 for a control; 60% is
  3.3:1 and passes. A control that fails contrast at rest is hidden at rest,
  which is the thing §6c forbids.

### 4d. Channels are `browser` and `feed` only

`eventSelection.ts:28` — `NOTIFICATION_CHANNELS = ['browser', 'feed']`. "Stop
these alerts" turns off both. There is no third push channel to reason about.

### 4e. Danger must keep a visible way to clear

`markAllReadTargets` excludes critical entries by design, and the scope decision
`20261011-064822-overview-is-a-widget-grid-the-pilot-builds.md` makes Acknowledge
the only thing that clears them. Keep the visible Acknowledge on danger rows.

Also: **a one-tap "Stop these alerts" on a critical type is a foot-gun.** Either
leave the item off critical rows, or offer only "Notification settings…" there.

## 5. What this fixes, against the original complaints

| Complaint | Fix |
|---|---|
| Buttons for View and Dismiss are too big | View is the row click; Dismiss is a plain `×` `IconButton`, not a `Button` (§3e) |
| View should be the row click, or a fire inside a group | Row click = View for a single, expand for a group; fire rows already link |
| Every type blends together | Leading nav glyph + dim topic eyebrow; severity treatment unchanged (critical only) |
| No easy way to stop a type | "Stop these alerts" in the `⋮`, one tap, account-wide (§4c), with Undo |
| Manage-notifications is a four-step detour | "Notification settings…" deep-links pre-filtered via `?search=` — which needs §4b's fix before it works for EVE types |
| Dismiss on hover? | No: dismiss is visible at rest (§3e). Only the `⋮` dims at rest with a pointer — the one exception §6c allows (§3d) |
| A quick dismiss that slides the card away | `×` slides the row toward the inline start (left, in English), then its height collapses; reduced motion simply removes it (§3e) |
| Swipe it away on a phone, in the same direction | Swipe the same way, the `×` being the non-gesture path WCAG wants (§3f). Nothing in the app swipes a row today |
