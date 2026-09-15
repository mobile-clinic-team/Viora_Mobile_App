# Static accessibility audit

This is a source review. It is not a device, TalkBack, contrast, keyboard, or large-text execution result.

| Area | Status | Evidence / finding | Follow-up |
|---|---|---|---|
| Icon-only top-bar controls | VERIFIED STATIC | Top-bar home/back controls pass labels to `VioraIcon`; password visibility and clear-search controls have descriptions. | Confirm announcements with TalkBack. |
| Bottom navigation | VERIFIED STATIC | Each `NavigationBarItem` has an icon and text label; patient tabs use selectable tab semantics. | Verify selected-state announcement on device. |
| Native assistant inputs | VERIFIED STATIC | `PrivateInput` sets hint/content description, disables autofill/content capture, and uses bounded input lengths. | Verify keyboard focus and error announcement. |
| Loading announcements | VERIFIED STATIC | Shared `InfoPanel` and clinical/assistant loading states use polite live regions or loading descriptions. | Confirm repeated announcements are not noisy. |
| Error announcements | VERIFIED STATIC | Several form/state errors use live regions; appointment form uses an assertive semantic error. | Normalize all error panels and verify focus return. |
| Text scaling | PENDING DEVICE CHECK | Compose text uses sp and screens scroll; no 200% text execution exists. | Run large-text test on a supported device. |
| Touch targets | PENDING DEVICE CHECK | Many controls use `heightIn(min = 48.dp)` or Material controls; some role-picker and raw clickable rows rely on defaults. | Verify every action at 48dp minimum and fix UX-007/doctor-row gaps if needed. |
| Status conveyed without color | ISSUE | Status is often plain text, but appointment/draft states are not consistently chips/icons with semantic labels. | Add text-first status components; do not rely on color alone. |
| Content descriptions for decorative icons | VERIFIED STATIC | Most leading/card icons are adjacent to text and have no redundant description; icon buttons provide labels. | Confirm no unlabeled standalone action remains in final frames. |
| Headings and hierarchy | PENDING DEVICE CHECK | `ScreenHeading` and headline styles establish hierarchy; no screen-reader heading traversal was tested. | Verify TalkBack navigation and large text. |
| Dialog focus and dismissal | PENDING DEVICE CHECK | Material dialogs are used for discard, appointment, forgot-password, and AI approval flows. | Verify focus lands in the dialog and returns to the originating control. |
| Contrast | PENDING DEVICE CHECK | Theme tokens were inspected, but no contrast ratio was measured. | Measure final Figma/Android colors before claiming compliance. |
| Keyboard/input behavior | VERIFIED STATIC | Login and appointment forms specify keyboard options; focus moves to appointment form error field. | Execute keyboard and IME action tests on device. |

## Static priority

The highest-value accessibility work is to normalize status semantics, verify 48dp targets for raw clickable/role controls, and run a device matrix with TalkBack, large text, keyboard focus, orientation, and contrast checks. No accessibility claim beyond static evidence is made here.
