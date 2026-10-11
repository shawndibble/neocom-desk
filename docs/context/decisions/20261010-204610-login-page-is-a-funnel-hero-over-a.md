# Scope decisions — Login page is a funnel hero over a grid of question tiles

_Recorded 2026-10-10._

- **The hero is a centred funnel, not two columns.** The heading is the widest line, the tagline narrower, the EVE login button and its "Log in with custom permissions" link narrower still, so the eye ends on the button. The live preview board moves under the button as proof instead of competing with it beside the heading. The login button is still the official `EveSsoButton`; the header carries no login button, since the hero and the closing section already have one.
- **One grid of ten question tiles replaces the six "answers" cards and the 19-image gallery.** Each tile is a question, the capture that answers it (a top-aligned crop that opens enlarged), and one line of answer. Dropped: the training-plan, colonies and appraisal questions, because no capture backs them, and the PI Plan capture, because PI is mid-overhaul. The feature catalog stays as name chips under the same four groups, without the per-row description and tag, so breadth is kept and the scrolling is not.
- **The trust section is unchanged.** A Stripe-style permissions list was considered and left out: it would restate the five writes and the scope list a third time, and the e2e disclosure spec pins their current wording.
- **Nine captures are deleted** (`desktop-lp-store`, `-calendar`, `-contracts`, `-pi-plan`, `phone-overview`, `-alerts`, `-wallet`, `-price-history`, `-survey`); ten remain. The page uses "log in", never "sign in" (`loginWording.test.ts`).
- **Not validated.** The layout follows 2026 SaaS landing patterns and a Mobbin review of about ten reference pages; there is no conversion data. Judge it by login-button clicks before and after.
