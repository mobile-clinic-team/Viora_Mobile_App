# UI fix backlog

No fixes are implemented in this audit phase. Priorities are based on usability, grading evidence, survey support, accessibility, and consistency.

## MUST FIX BEFORE SUBMISSION

| ID | Fix | Source finding | Effort | Why |
|---|---|---|---|---|
| FIX-001 | Use one shared loading/empty/error/retry/denied/outcome state component across final-demo reads. | UX-001, UX-010 | M | Q14 supports recovery; consistent state evidence directly affects UI/UX and testing. |
| FIX-002 | Provide a safe retry or explicit reopen explanation for clinical record failures. | UX-002 | S | Prevents a dead-end in a high-priority record flow. |
| FIX-003 | Make appointment date/time entry structured and timezone-aware in the final live path. | UX-003 | M | Reduces schedule mistakes and supports a core surveyed problem. |
| FIX-004 | Give the AI draft a clear provenance/current-versus-proposed/reviewer-approval visual treatment. | UX-009 | M | Supports AI safety and human-in-the-loop grading evidence. |
| FIX-005 | Define final scope for the dirty patient/admin shells before using them in Figma or submission screenshots. | UX-012 | S | Prevents contradictory product evidence. |

## SHOULD FIX

| ID | Fix | Source finding | Effort | Why |
|---|---|---|---|---|
| FIX-006 | Add text-plus-icon status chips for appointment, encounter, draft, and operation states. | UX-004 | S | Improves scanning and avoids color-only status. |
| FIX-007 | Normalize doctor rows with `ActionRow` or an equivalent reusable card. | UX-006 | S | Improves visual consistency. |
| FIX-008 | Make role selection full-width with role descriptions and selected-state feedback. | UX-007 | S | Improves discoverability and permission comprehension. |
| FIX-009 | Group patient related sections into compact titled cards. | UX-005 | S | Improves small-screen scanning. |
| FIX-010 | Standardize result copy and next actions after save, rejection, conflict, and unknown outcome. | UX-010 | S | Helps users recover without duplicate actions. |

## OPTIONAL

| ID | Fix | Source finding | Effort | Why |
|---|---|---|---|---|
| FIX-011 | Remove duplicate in-content Return control where the final app bar back affordance is sufficient. | UX-008 | XS | Cosmetic/navigation simplification. |
| FIX-012 | Add an explanation when a role does not receive the Assistant tab. | UX-011 | XS | Clarifies role-specific navigation without exposing restricted features. |

Implementation should wait until the Figma frame set and final product scope are approved. No L-sized redesign is justified by this audit.
