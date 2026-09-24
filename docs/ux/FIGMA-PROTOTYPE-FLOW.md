# Figma click-through prototype flow

Prototype file status: **PENDING FIGMA**. The following links are the exact interactions to create manually using the frames in [`FIGMA-SPEC.md`](FIGMA-SPEC.md). Use Smart Animate for state changes and Navigate to for route changes. Use overlays for dialogs.

## Primary journey

| From frame | Action | To frame | Transition/overlay | Notes |
|---|---|---|---|---|
| 01 Login | Tap `Explore local demo` | 01 Login / account chooser | Open overlay | Use fictional demo accounts only. |
| 01 Login / account chooser | Select a demo account, then tap `Sign in` | 02 Workspace | Navigate to | Show a short loading variant if desired. |
| 02 Workspace | Select authorized role/clinic | 03 Dashboard | Navigate to | The selected workspace stays visible in the protected app bar. |
| 03 Dashboard | Tap `Patient directory` | 04 Patient Search | Navigate to | Patients tab becomes selected. |
| 04 Patient Search | Enter a patient query and tap a result | 05 Patient Detail | Navigate to | Keep the query in memory for the back path. |
| 05 Patient Detail | Tap `New appointment` or related appointment action | 07 Appointment List | Navigate to | The prototype may show the patient filter applied. |
| 07 Appointment List | Tap an appointment card | 08 Appointment Detail | Navigate to | Show current status and permitted actions. |
| 08 Appointment Detail | Tap `Open encounter entry` | 10 Clinical Record | Navigate to | In the current app this is a partial/read-only clinical path; label target behavior clearly. |
| 10 Clinical Record | Tap assistant/draft entry in the target design | 11 AI Assistant | Navigate to | Current source reaches assistant through authorized context routes; do not imply a live provider. |
| 11 AI Assistant | Tap `Generate draft` for an existing target | 12 AI Draft Review | Navigate to | Current source uses a synthetic generator. |
| 12 AI Draft Review | Tap `Approve reviewed draft` | 12 AI Draft Review / confirmation | Open overlay | Dialog must explain human responsibility and exact target/version review. |
| 12 AI Draft Review / confirmation | Tap `Cancel` | 12 AI Draft Review | Close overlay | No state change. |
| 12 AI Draft Review / confirmation | Tap `Approve reviewed draft` | 16 Success Receipt | Navigate to | Target final flow requires real backend receipt; current synthetic flow explicitly does not write a record. |

## Required alternate interactions

| From frame | Action | To frame | Transition/overlay | Purpose |
|---|---|---|---|---|
| 04 Patient Search | Clear query or search with no match | 14 Empty State | Smart Animate/state swap | Distinguish initial search hint from no results. |
| 07 Appointment List | Service cannot load; tap `Retry` | 15 Error Retry, then 07 | Navigate to state; return on retry success | Represents Q14’s preferred recovery behavior. |
| 09 Appointment Action | Tap `Back` with edited fields | 09 / discard dialog | Open overlay | Confirm Stay/Discard before losing input. |
| 09 / discard dialog | Tap `Stay` | 09 Appointment Action | Close overlay | Preserve fields. |
| 09 / discard dialog | Tap `Discard` | 07 Appointment List | Navigate to | Discard only local unsaved form state. |
| 08 Appointment Detail | Tap `Cancel appointment` | 08 / confirmation | Open overlay | Destructive action confirmation. |
| 08 / confirmation | Tap `Confirm` | 16 Success Receipt or 15 Error Retry | Navigate to result state | Result must reflect the actual service response in the final implementation. |
| 20 Account | Tap `Switch clinic` | 02 Workspace | Navigate to | Clear protected scope before new workspace content. |
| 20 Account | Tap `Sign out` | 01 Login | Navigate to | Clear protected back stack and show neutral login. |

## Back-navigation rules

- Back from a child frame returns to its immediate parent.
- Back from a tab root returns to Dashboard.
- Back from Dashboard backgrounds the app through privacy handling.
- Back from a dirty form opens Stay/Discard.
- Back from a dialog closes the dialog without confirming.
- Back or cancellation from a picker returns to the still-live requesting form only when its picker handle remains valid.
