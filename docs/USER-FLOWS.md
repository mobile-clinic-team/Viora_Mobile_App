# User flows and navigation

[SCREEN-SPEC.md](SCREEN-SPEC.md) owns route inputs and screen-specific interaction. [DOMAIN-MODEL.md](DOMAIN-MODEL.md) owns lifecycle; [API-SPEC.md](API-SPEC.md) owns endpoint IDs, receipts and error/retry semantics. No flow may treat a blocked decision as approval.

## Navigation rules

There is one NavHost and one active tab stack. S00 session/restore is the initial destination on every process start. A protected back stack is not restored from Android saved state. S00 -> S01 login or S02 workspace selection; validated context -> S03 dashboard.

Four bottom tabs are Patients (S04), Schedule (S10), Assistant (S17), Account (S20). Dashboard is the main entry/root with no selected tab; a Home action returns to S03. Switching tabs pops to the selected tab root after unsaved-exit handling; no independent retained tab histories. Back from a tab root returns S03, and Back from S03 backgrounds the app through privacy handling.

Doctor directory S08 opens from the Schedule toolbar and appointment doctor picker; it is not a fifth tab. S04 also accepts the appointment form's patient-picker handle. Picker selection returns only an opaque ID to the requesting in-memory form, scoped to its auth/context epoch. On process death the picker/form is abandoned safely.

All routes contain only IDs/enums/dates explicitly allowed by SCREEN-SPEC. Names, search strings, notes, content, tokens, ETags, permissions and callback parameters are not route inputs. OAuth callbacks are handled by SessionCoordinator before navigation; they never act as protected deep links.

## Flow contracts

| Flow | Entry / ordered actions | Success and exit | Loading / empty / failure |
|---|---|---|---|
| F01 Login | S00 -> S01; A01 browser transaction -> A02 -> A05 -> A06 | Valid session enters F02, never bypasses context validation | Neutral progress; cancel/expired callback restarts login; no protected cache |
| F02 Workspace | S02 lists A06; zero -> no-access state; one auto-validates W01; several require explicit choice | W01 stores current context in memory then S03 | Denied/unavailable workspace cannot enter; retry membership read or logout |
| F03 Dashboard | S03 loads AP01 for current clinic day, uses local timezone-to-UTC bounds | Open shortcuts/agenda; partial page labeled as such | No appointments is a genuine empty state, not request failure; retry read |
| F04 Patient search | S04 waits for q of at least two characters; 300ms debounce; P01 pages | Select ID -> S06 normally, or return ID to the matching live picker form; create -> S05 outside picker if permitted | Before query: search hint. No matches: empty. Latest query wins; clear query clears results |
| F05 Patient detail | S06 P03; permitted AP01 current-day range and CL06 history loaded separately | Edit -> S07; appointment -> S11; encounter -> S21; assistant context -> S26 | A failed related section never means “no history”; 403/404 unavailable |
| F06 Patient create/edit | S05/S07 apply domain masks and BD-02 policy; P02/P04 | WriteReceipt -> P03 -> S06; invalidate prior list page | Field errors stay in form; conflict refetch/review; ambiguous result -> S25, never search-based success inference |
| F07 Doctor information | S10 toolbar or picker -> S08 D01 -> S09 D02/D03 | Back or return selected doctor ID to appointment form | No directory results -> empty; unavailable detail -> safe Back/retry |
| F08 Agenda | S10 AP01 date/doctor/patient/status filters | Open S12 or create S11 | Paging is bounded; changing filters resets cursor. No complete queue count/position is inferred |
| F09 Create appointment | S11 selects permitted patient/doctor/location and local interval; AP11 optional check, then AP02 | Receipt -> AP03 -> S12 | Availability is advisory; BD-03 unavailable disables submit. 409 returns to selection |
| F10 Reschedule/cancel/confirm/check-in | S12 refresh AP03; S13 AP04, or explicit AP05/AP06/AP07 confirmation | Receipt -> refreshed S12 and agenda invalidation | 412 renews review; timed-out command -> S25; state actions use Access |
| F11 Start encounter | From patient S21 create standalone CL01 then CL03; from CHECKED_IN appointment CL01 (or follow encounterId) then AP08 | Receipt -> CL02 -> S14, with actual IN_PROGRESS state | Each command has its own resolved operation key; never repeat encounter creation if start failed |
| F12 Record create/view/edit | S14 follows recordId; when null, explicit CL07 creates DRAFT. S15 CL14; S16 edits via CL08 | Receipt -> CL14 -> S15 | No implicit record creation on read. If IN_REVIEW, explicit CL10 reopen precedes edit |
| F13 Review/finalize/amend | S15 CL09 review; CL11 via S24 assurance and final confirmation; CL12 via S16 AMEND with reason | Read actual record state; amendment returns non-final AMENDED work and goes through review again | BD-04 gates policy; conflicts invalidate confirmation. History -> S22/S23 |
| F14 Encounter/appointment completion | S14/S12 checks current linked resources; standalone CL04 or linked AP09 | Refetch both when linked; report server state | No automatic completion from record finalization; BD-04 prevents guessed completion rule |
| F15 Assistant conversation | S17 AI01 list; S26 explicit GENERAL/PATIENT/ENCOUNTER context -> AI02; S18 AI03/AI04 | AI05 receipt -> AI12 assistant message, append authorized result | Empty conversation is allowed. Invalid context/expired content stops send; safe output failure preserves manual navigation |
| F16 Generate AI draft | S15 uses AI13 to discover existing target drafts; S15/S14/S18 resolve existing DRAFT target through CL02/CL14, confirm context -> AI06 | Receipt -> AI10 -> S19 GENERATED | No target -> offer explicit manual DRAFT creation. No automatic create, provider fallback or partial response |
| F17 Review/edit/reject AI draft | S19 AI07 explicit review; AI11 edits; AI09 rejection | Refetch AI10 and show actual IN_REVIEW/REJECTED state | Opening is not review; edits invalidate prior confirmation/assurance |
| F18 Approve/handoff | S19 load draft + target; compare; S24 bound step-up; renewed confirmation -> AI08 | Verify receipt handoff -> CL14/S15; target remains DRAFT | Stale target requires new generation; no rebase or mobile clinical-create workaround |
| F19 Account/scope change | S20 voluntary switch/logout confirms unsaved discard; invalidate scope before any new work | Switch -> S02; logout -> S01 | Forced loss clears immediately. Application logout reports remote revocation confirmation separately |
| F20 Outcome recovery | S25 with operationId; OP02, OP03 only if not found; OP01 discovers own outstanding operations after new login | SUCCEEDED follows authorized resource; FAILED/CLOSED allow explicit new intent; others remain unresolved | No new key while uncertain; polling and expiry follow API-SPEC |

## Unsaved changes and interruption

Back, Home, tab switch, picker cancellation, workspace switch and voluntary logout all consult the current form's dirty flag. Dialog choices are Stay or Discard; there is no hidden autosave. Explicit Save must finish with a verified receipt before navigating on success. While a command is unresolved, provide Wait or Check outcome; leaving a screen does not assert rollback.

Network loss retains sensitive form fields in memory exactly as DATA-STORAGE specifies. It does not convert them into saved records. Rotation preserves state; process death discards forms and resumes receipt recovery. Reconnect revalidates context and resource version before another mutation.

Error actions use the API contract: retry reads in current context; map 422 fields; refresh/re-review 412; invalidate context for CONTEXT_STALE; deny 403; conceal cross-workspace resources with 404; reconcile uncertain commands. Session/permission changes override any pending navigation event.

## Technical gates

A disabled policy-dependent action shows “Unavailable for this workspace” with a safe explanation, not raw owner decision discussions or implementation details. Synthetic environments clearly label their fixture mode. The in-memory model, route structure and API adapters can be built before real grants/provider registration; production clinical policy remains a separate owner gate.
