# Carcass estimate and measured weight

Local candidate based on `ba7c1aae1a24c397f8db7a4c939a48bbd8c409b2`.
Owner-confirmed manager rule: **Cow and Pig estimated carcass = live weight × 0.80**.
This rule does not enable recording, inspection, financial or delivery capabilities.

## Exact grams and provenance

`estimateCarcassWeight(liveWeightGrams, animalRevision)` uses positive safe integer inputs
and `(BigInt(liveWeightGrams) * 80n + 50n) / 100n`: nearest whole gram, half up.
The intermediate multiplication never uses floating point. Integer-gram inputs at 80%
produce fifths of a gram, so an exact half-gram tie cannot occur. Android uses the same
integer formula; its intermediate fits in `Long` over the JS safe-integer range.
For example, 85,001 g live weight estimates 68,001 g carcass.

Animal list/detail/write responses add:

```json
{
  "carcassEstimate": {
    "weightGrams": 68001,
    "liveWeightGrams": 85001,
    "animalRevision": 1,
    "rule": "manager_80_percent_v1",
    "rounding": "nearest_gram_half_up"
  },
  "carcassWeightSelection": {
    "source": "estimated",
    "weightGrams": 68001,
    "animalRevision": 1,
    "requiresReview": false
  }
}
```

The estimate has **no weighing or recording timestamp** and is never a scale measurement.
Future registration saves the estimate with live-weight revision 1. A supported live-record
correction creates the new revision's estimate; the existing transactional before/after audit
preserves the previous one. Existing rows without this field derive it on read under the
current manager rule: no migration, account action or backfilled measurement. A future
supported measured save also retains the estimate in its record and audit snapshot.
Stored estimate metadata, when present, must match its current live weight/revision/rule;
malformed data fails closed rather than being silently repaired.

## Actual measurement takes precedence

Existing `carcassWeight` remains the measured object unchanged: `weightGrams`, `weighedAt`,
`revision`, `animalRevision`, `recordedAt`, `recordedBy`. It is never populated from the
estimate. An actual measurement sets `carcassWeightSelection.source` to `measured` while
retaining the separate estimate. The web and Android display both clearly labelled values;
only actual measurement displays a weighing timestamp. A first measured-entry form remains
blank; corrections prefill only the existing measured value.

After a live-record correction, a historical actual measurement remains selected and visible
with its original animal revision and `requiresReview: true`. This preserves actual-data
precedence without claiming it is valid for the new revision. Current inspection/revision
checks and a reasoned measured correction still govern subsequent eligible use; no estimate
is substituted to hide a stale measurement. This selection is not a fee calculation or new
financial authorization.

## Unchanged controls

Measurement requests retain exactly the existing fields and validation. Client estimate/source
metadata cannot be submitted as a measurement. Inventory/admin authorization, current inspection,
expected animal/carcass revisions, 500-character correction reasons, transactional audit writes,
concurrency checks and invoice/dispatch locks are unchanged. Invalid actual measurements still
fail closed; estimates never conceal them. Existing measured rows and old audits are not rewritten.
Fee schedules, invoice totals, deployment manifests, policies and every production gate are untouched.
The production carcass recording route remains disabled under the existing policy/gates.
The manager's yield rule does not resolve the separate included/excluded-body-part definition.

Android's isolated companion patch accepts optional additive metadata, validates it against the
same exact calculation and measurement linkage, and derives it for older API responses. Its
existing signed production APK has not been rebuilt or changed by this work. New Android labels
require a separately reviewed build/distribution and runtime acceptance; parser/unit/Compose
compile evidence is not device acceptance.

## Owner clarification — 2026-10-21

Organs/offal may accompany a Cow/Pig delivery but are **excluded** from actual measured carcass weight. They must never be summed into this measurement. Any separately recorded offal quantities are a distinct record/field; the current v7 carcass API/form does not capture them and rejects extra organ/offal fields. No quantity, unit, new offal-capture workflow or weighing adjustment is invented.

No approved Inspector definition was found in the project handoffs for **head, hide, feet or other parts**, including any Cow/Pig differences. This is the only remaining measurement-definition input. Organ exclusion alone is a partial definition and does not unlock production recording. The prepared policy requires a real approved version/description plus explicit headTreatment/hideTreatment/feetTreatment/otherPartsTreatment; null/pending fields fail closed. Synthetic test definitions are not production policy.

Live weight, exact80% estimate/rounding, historical measurements/revisions, reasons/audits and invoice/dispatch locks remain unchanged. Fee is PHP95 per Cow/Pig animal independent of weight. No old weight is rewritten or retrospectively certified as organ-exclusive. Physical scale/Inspector procedure must establish exclusion; software cannot infer parts from a single gram value.

## Owner local operational definition — 2026-10-22 (supersedes pending part-definition observations)
For BOTH Pig and Cow, actual measured post-slaughter carcass weight includes head, skin/hide and feet, and excludes organs/offal even if delivered with the animal. This is the owner's local operational definition, not a universal carcass standard. Record the actual scale reading; never copy live weight or submit the 80% estimate as a measurement. Preserve measurement actor/time, animal/carcass revisions, Inspector approval, correction reasons, audits and invoice/dispatch locks. Historical measurements are not rewritten or retrospectively certified against this new definition.

Vendor explicitly chooses `collect` or `decline`; absence is unset, never decline. Decline supplies no disposal instruction. Choice is separate from carcass measurement and never changes the PHP95 per-animal fee. This candidate records a choice, **not digital offal quantities**; no organ weight/quantity schema or capture UI is claimed.

Separate GET/POST `/api/mobile/animals/:id/organ-collection` (Web prefix `/api/animals`) preserves existing strict v7 animal/invoice/assignment response shapes. GET returns exactly `{animalId, animalRevision, choice, choiceRevision, requiresReview, canChoose}`; choice is null/collect/decline. POST accepts exactly `{choice, expectedRevision, expectedChoiceRevision}`. Only verified active owning Vendor may write; municipality/business isolation is retained. Carcass gate/approved local definition/router opt-in must permit writes. Animal revision or ownership change invalidates the prior choice without erasing its audit. Once assigned, choice is locked. Inspector assignment transaction requires a current explicit choice; an invoice may already exist. Dedicated `animal_organ_choices/{animalId}` and append-only `organ_collection_audit` persist the choice atomically, with original/new values, actor and server time; neither animal measurements nor financial records are modified by choice entry. No new index required: direct document reads only.

Installed v7 continues existing reads and measurement wire contracts but cannot enter this new Vendor choice. A compatible Android client is required before exercising the complete collection/assignment flow. Web administrator oversight is read-only; administrators cannot impersonate the Vendor's decision. Web's reusable choice UI renders controls only when server-authorized; the deployed Web portal remains administrator-only, so mobile Vendor entry requires that client.
