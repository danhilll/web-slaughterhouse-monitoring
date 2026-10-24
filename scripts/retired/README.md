# Retired browser checks

These checks tested screens that the owner-approved monitoring redesign (2026-10-24) removed, or behaviour a later fix deliberately changed. They are kept for history and are not release gates.

| Script | Why retired | Covered now by |
| --- | --- | --- |
| `check-workspace-ui.mjs` | Tested the Web "Add Vendor" and record-entry forms; the Web is read-only now. | `check-monitoring-ui.mjs` |
| `check-invoice-pdf.mjs` | Tested the old invoice-record dialog and its PDF button, which no current page shows. `src/invoicePdf.ts` and its unit test remain. | `src/invoicePdf.test.ts` |
| `check-operation-workspaces-ui.mjs` | Tested the old "Billing workspace" and "Delivery workspace" pages. | `check-monitoring-ui.mjs`, `check-destination-workflow-ui.mjs` |
| `check-drop-off-ui.mjs` | An older copy of the completed-delivery check. It asserted that a drop-off refresh failure clears the pin; the later design keeps the last authorized pin and flags freshness. | `check-completed-delivery-ui.mjs` |
