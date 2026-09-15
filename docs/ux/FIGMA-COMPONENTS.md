# Figma component library plan

Create only the components needed by the specified Viora frames. Each component should have default, disabled, loading, error, and selected variants only where the Android behavior requires them.

| Figma component | Variants | Closest Compose implementation | Use |
|---|---|---|---|
| `Button / Primary` | default, disabled, loading | Material 3 `Button` | Save, sign in, primary workflow action |
| `Button / Secondary` | default, disabled | `OutlinedButton` | Back, choose, secondary action |
| `Button / Tertiary` | default, destructive | `TextButton` | Retry, switch, dialog actions |
| `Field / Outlined` | default, focused, error, disabled | `OutlinedTextField` | Login and appointment forms |
| `Field / Search` | empty, query, clear | `OutlinedTextField` with search/clear icons | Patient/doctor search |
| `List row / Patient` | default, selected, unavailable | `ActionRow` with patient icon | Patient directory and pickers |
| `Card / Appointment` | status variants, unknown | `ActionRow` or `OutlinedCard` | Agenda and detail summary |
| `Card / Doctor` | default, unavailable | Normalized `ActionRow`/card | Doctor directory/detail |
| `Chip / Status` | scheduled, checked-in, draft, error, unknown | Material `AssistChip`/`FilterChip` with text | State semantics without color-only meaning |
| `App bar / Protected` | root, child, workspace overflow | `Scaffold` top bar and `VioraIcon` | Viora, workspace, back/home, switch clinic |
| `State / Loading` | compact, full | `InfoPanel(loading = true)` | Read and service loading |
| `State / Empty` | search hint, no records | `InfoPanel` | Empty and initial states |
| `State / Error` | retry, unavailable, denied | `InfoPanel` with action | Q14-supported recoverable errors |
| `Dialog / Confirmation` | discard, appointment action, AI approval | Material `AlertDialog` | Destructive/clinical confirmation |
| `Card / AI draft` | generated, in-review, stale | Current/proposed comparison plus provenance | Assistant and human review |
| `Panel / Receipt` | saved, rejected, unknown | `AppointmentSubmissionPane`/assistant state panel | Verified result and recovery |

## Component rules

- Primary buttons have one clear action and a 48dp minimum target.
- Status variants always include text; color is supplemental.
- Error state variants expose the safest next action and do not expose backend diagnostics.
- AI draft cards visually separate source/provenance, generated content, reviewer edits, and approval.
- Component names and variant names should match the Android state names where practical.
