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
