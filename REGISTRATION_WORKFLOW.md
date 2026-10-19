# Inventory registration contract

Inventory staff selects the Active vendor/business **owning the animal**, which can differ from
its transporter. A transporter identity is not submitted or substituted for ownership. The owner
business must be in the staff member's approved municipal scope. Registration requires the ear
code (`identifier`, existing manual/RFID type), Cow or Pig, positive measured live weight, and
actual weighing time. Staff enter the real animal details during operations; prefilled specimen
measurements are **not** a general deployment prerequisite.

The web live-animal form displays/defaults weighing time in **Asia/Manila (UTC+08:00)** independently
of browser timezone. It defaults to now when a fresh form is initialized/reset. Staff can edit it
for delayed entry; rerendering does not overwrite that edit. Correction forms display the stored
instant in Manila, retaining seconds/milliseconds. Impossible calendar dates are rejected rather
than normalized. The API's explicit-offset instant contract is unchanged: web submits canonical
UTC; Android supplies `+08:00`; both represent the same actual instant.

Server validation still requires a timestamp with Z/offset and rejects weighing time more than
one minute in the future. `createdAt`, `updatedAt`, audit timestamps and actors remain
server-generated and separate from `weighedAt`; client audit fields are rejected. Weight stays
integer grams, and registration does not enable inspection or any financial action.

The transaction still checks Active owner status, municipal scope and consistent business ID.
Identifier normalization remains NFKC/trim/uppercase. Uniqueness remains municipality + identifier
type + normalized ear code, across vendors. A legitimate same-code collision between different
vendors returns 409 and needs explicit review; do not silently change keys, prefix ear codes,
overwrite, or resubmit duplicates. No uniqueness-policy change or stored-record migration is included.

This checkpoint changes only live registration/correction time handling, owner/ear-code/measured
weight wording, and adds focused tests. Carcass timestamp helpers are untouched. The separate
carcass checkpoint retains its exact 80% estimate rule, integer rounding, measured precedence,
labels, historical warnings, correction reasons, revision links, audits and invoice/dispatch locks.
Fees, permissions, manifests and production gates are unchanged. `src/AnimalsPage.tsx` is shared
between checkpoints; preserve both reviewed hunk sets when integrating.

Component/contract tests are synthetic evidence, not production records, a captured production
HTTP result, or physical-device/browser acceptance. No APK packaging or deployment is performed.
