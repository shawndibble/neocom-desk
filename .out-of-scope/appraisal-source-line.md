# Appraisal Source Line

Assets → Appraise stays a plain text hand-off. The Appraisal page does not show, or remember, which character and station the pasted items came from, and does not pick its hub from them.

## Why this is out of scope

The idea was a muted "From [portrait] Name · Station" line under the Appraisal result, plus a hub default taken from the station the pile sat in. The hand-off today carries only `appraiseText` (`MarketAppraiseState` in `src/lib/shortcuts.ts`).

It costs a new persistent line on the result, a wider hand-off state, and a rule for mixed sources (several characters or stations in one selection). In return it saves the pilot one hub change and a moment of remembering. The owner judged that not worth the extra UI.

## Prior requests

- #5595: "Appraisal: remember the character and station an Assets selection came from"
