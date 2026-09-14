# Mobile traceability

Status: **PROPOSED scope traceability**, not implementation evidence. Reference IDs resolve in [README](MOBILE-README.md). Feature IDs resolve in [app specification](MOBILE-APP-SPEC.md), screen IDs in [screen specification](MOBILE-SCREEN-SPEC.md), API/gap IDs in [API integration](MOBILE-API-INTEGRATION.md), security IDs in [security](MOBILE-SECURITY.md), test IDs in [testing](MOBILE-TESTING.md), and ADRs in [decisions](MOBILE-ARCHITECTURE-DECISIONS.md).

## Existing capability → mobile behavior

| Existing Viora requirement / evidence | Mobile capability / user flow | Screen | API capability and availability gap | Security requirement | Test requirement |
|---|---|---|---|---|---|
| R01 §6.1; R07 DEC-001; R09 active identity | F01 login/restoration; U01/U02 | S01/S02/S21 | I01/I02, G01/G02; no auth runtime | SEC01/02/03 | MT01/02/03; BT01 |
| R01 §4; R03 tenant/location; R09 ambiguity; R10 tenant profile | F02 context; U03 | S03/S04/S21 | I01/I02/T01/T02, G02 context transport/labels | SEC04/05/06 | MT04/05; BT01/02 |
| R01 §6.3, §25 Patient; R11 list/read | F03 discovery/detail; U04/U06 | S05/S06 | P01/P03, G01 normalized DTO/pagination | SEC04/05/06/09 | MT03/04/05/10/11; BT02/05 |
| R11 create fields, key; R04 Patient create | F04 registration; U05 | S07 | P02, G09 durability; ADR-M12 values/optionality | SEC04/05/06/08/09 | MT06/10/11; BT02/03/05 |
| R11 patch allowlist/ETag; R07 OCC | F04 profile update; U06 | S08 | P04, G01 wire/OCC normalization | SEC05/06/07/08/09 | MT03/06; BT02/03/05 |
| R01 Doctor; R12 profile and shifts | F05 doctor lookup | S09/S10/S13 | D01–D03/T02, G01 handlers | SEC04/05/06 | MT03/05/06; BT02 |
| R01 §6.4; R13 appointment create/availability | F06 scheduling; U07 | S11/S12/S13 | A01–A04/A07, G09 reference/shift/atomic scheduling | SEC04/05/07/08/09 | MT06/10; BT02/03/05 |
| R13 exact status table; R04 appointment commands; R07 BLOCK-010 | F06 confirmation/check-in/cancellation; U07 | S11/S12 | A05/A06, G03 confirmation/start/completion; NO_SHOW mobile action deferred | SEC05/07/08/09 | MT06; BT03/05 |
| R03 derived appointment queue, no queue entity | F06 queue projection; U07 | S11/S12 | A01 with CHECKED_IN/IN_PROGRESS; no queue API | SEC04/05/06 | MT03/06/10; BT02 |
| R01 §6.6/§25 basic history; R14 encounters; R16 bounded summaries | F07 history/discovery; U08 | S14/S15/S06 | C02/G04 enumeration/associations | SEC04/05/06/09 | MT07/10; BT02/05 |
| R14 encounter create and optional appointment reference | F07 encounter creation; U08 | S16/S15 | C01, G03/ADR-M13 initial/lifecycle/linkage policy | SEC04/05/08/09 | MT06/07; BT02/03/05 |
| R14 record lifecycle; R03 immutable versions; R19 append-only trigger | F08 initial/review/finalize; U08 | S17/S18 | C03–C06, G08 public read/OCC/DRAFT correction | SEC05/06/07/08/09 | MT07; BT03/04/05 |
| R03 amendment/current version; R14 FINALIZED-only amendment guard | F08 correction; U08 | S17/S18 | C07, G08 AMENDED continuation/ETag semantics | SEC05/07/08/09 | MT07; BT03/04/05 |
| R03 allergy schema; R04 C08 documented read | F08 allergy context; U08 | S15 | C08/G10 read service absent | SEC04/05/06/09 | MT07/10; BT02/05 |
| R01 §7, R06 minimum context, R15/R17 gateway/provider | F09 assistant/summary; U09 | S19 | AI01–AI03/G06 orchestration and public outcomes | SEC04/05/06/09/10 | MT08/10/11; BT02/05/06 |
| R06 tenant-only knowledge, R16 search filter, R19 tenant NOT NULL | F09 knowledge retrieval; U09 | S19 permitted references | K01 via backend assistant; G06 source/authorization integration | SEC04/05/06/09/10 | MT08; BT02/05/06 |
| R06 draft-first; R15 draft status/content; R16 workflow/tool | F10 draft generation/review; U10 | S20/S19 | AI04/AI05/G05/G06; no public read/edit/resubmit | SEC05/06/07/09/10 | MT08/09; BT04/05/06 |
| R07 single-author step-up/OCC approval; R16 HUMAN transitions | F10 approval/rejection/handoff; U11 | S20/S18 | AI06/AI07/G07; no automatic Clinical finalization | SEC01/05/07/08/09/10 | MT01/09/10; BT01/03/04/05 |
| R05/R07 revocation, R09 active identity | F11 account/logout; U12 | S21/S01/S02 | I01/T01/G02 logout/revoke | SEC01/02/04/06/09 | MT02/04/11/12; BT01/05 |
| R05/R18 immutable metadata audit | All protected F01–F11 | S01–S21 as applicable | Internal backend audit, G09; no public audit CRUD | SEC09 | MT11; BT05 |

All rows reuse category A business/domain requirements with category B separation principles where relevant. Their implementation gaps do not convert them into invented new product domains. An operation excluded from this smallest mobile scope is not deleted from the backend reference.

## Explicit NEW MOBILE REQUIREMENT traceability

| Requirement | Purpose / affected feature | Screen/API impact | Security/tests | Decision |
|---|---|---|---|---|
| NM01 Mobile navigation/home | F12 and entry to all permitted workflows | S01–S21; T01/A01 previews only, no aggregate API | SEC04/05/06; MT05/12 | ADR-M03/M04 |
| NM02 Native session/lifecycle | F01/F02/F11; single refresh, callback and context generation | S01–S03/S21 and all protected requests; G02 | SEC01/02/04; MT01/02/04/12 | ADR-M04/M07 |
| NM03 OS credential storage/no durable PHI | Session restoration and sensitive state | No new domain API; credentials only from approved auth | SEC02/06/11; MT02/11/12/13 | ADR-M08 |
| NM04 Offline/unknown-outcome recovery | Protect every read/write during interruption | All data screens; G01/G05–G09 for missing recovery semantics | SEC07/08; MT06/09/10/12 | ADR-M06/M09 |
| NM05 Accessible/adaptive mobile UX | Usable clinic workflows on agreed devices | S01–S21; no backend business feature | SEC06/11; MT12/13 | ADR-M15/M16 |
| NM06 App-switcher/capture/backup/log privacy | Reduce on-device PHI exposure | All PHI screens, no new endpoint | SEC02/06/09/11; MT11/12/13 | ADR-M08/M15 |
| NM07 Mobile build/sign/release | Deliver verified installed app | No API added; environment/contract compatibility | SEC03/12; MT13 | ADR-M16/M17 |
| NM08 Date/time/locale presentation | Safe DOB and appointment interpretation | S05–S18; clinic-zone source missing/TBD, UTC contracts reused | SEC06/07; MT03/06/12 | ADR-M15 |

## Explicit exclusions with source

| Existing/future subject | Mobile decision | Evidence |
|---|---|---|
| SQL/migrations/persistence/transaction internals | Excluded from client architecture, tests stay server-owned | R02/R03/R08/R19; category C |
| Nx/Node backend boundaries and provider adapters | Principles only; no packages imported into mobile | R08/R17/R20; categories B/C |
| Web scaffold/routes/design assumptions | No UI port or design system inferred | R20; category D |
| Notifications/push | Later phase; no notification registration or permission | R01 §26/R04 Post-MVP; ADR-M11 |
| Patient portal/admin management | Outside proposed smallest mobile scope; no permissions erased from backend | R01/R04/R05; ADR-M02 |
| Billing/files/prescriptions/labs/ratings | Post-MVP as in reference | R04 §§13,16–17,28; R07 DEC-007 |
| AI autonomous mutations/global knowledge | Excluded; no authority inferred from conceptual tool names | R06/R07; SEC10 |

Traceability describes required evidence to gather, not tests passed. Actual documentation validation is recorded in [MOBILE-TESTING.md](MOBILE-TESTING.md).
