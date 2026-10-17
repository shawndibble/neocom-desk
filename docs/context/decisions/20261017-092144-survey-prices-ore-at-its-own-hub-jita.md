# Scope decisions — Survey prices ore at its own hub, Jita by default

_Recorded 2026-10-17._

- **A Survey prices its ore at the Survey's own Trade Hub, not Settings' Default Trade Hub.** This supersedes "the pilot's default Trade Hub" in `20261009-111351-survey-values-rocks-at-the-pilots-hub-market.md` and "the buy price at the pilot's hub" in `20261009-212631-survey-ores-sort-and-colour-by-compressed-unit.md`. Nearly everyone opens a Survey to estimate a field's worth and wants Jita for that, whatever hub they trade from; a pilot whose Settings hub is Amarr was shown Amarr buy prices and an ore order that looked wrong.
- **The default is always Jita, and the pick is device-local.** A selector beside the chat message button on `/mining/survey` and the shared `/s/<id>` page changes it; the browser remembers the pick (`miningSurveyPriceHub`), it does not sync. A visitor gets Jita until they pick.
- **Everything else about the price is unchanged:** highest buy order of the compressed form, live only. The Overview Mining survey widget prices at the same Survey hub, so its figures match the page it opens.
