# Viora design-system audit

## Current system

The current Compose UI uses Material 3 with a light, calm clinic-oriented palette and shared helpers in `core/ui`.

| Area | Current evidence |
|---|---|
| Color | Primary `#246E91`; secondary `#337E80`; pale blue/teal containers; background `#F7FAFB`; error uses Material color-scheme error. Android XML accent is `#1675AC`. |
| Typography | Material 3 `Typography` with headline sizes 24–28sp, titles 16–18sp, body 14–16sp, labels 11–14sp. |
| Shapes | Small 12dp, medium 16dp, large 20dp rounded corners. |
| Spacing | Common screen padding 16dp or 24dp; cards commonly 16dp or 20dp internal padding; rows use 8–16dp gaps. |
| Buttons | Material `Button`, `OutlinedButton`, and `TextButton`; many task actions use 48–56dp minimum height. |
| Cards and rows | Shared `ActionRow`, `InfoPanel`, `IconBadge`, `DetailField`, and Material cards. |
| Inputs | Outlined text fields with labels, leading icons, validation text, keyboard options, and focus on appointment errors. |
| Status | Mostly text and Material colors; `ReadState`, `ClinicalState`, and `AssistantState` provide semantic state distinctions. |
| Navigation | One top bar with Viora/workspace/switch clinic, Material `NavigationBar` with four tabs, and typed routes. |
| Dialogs | Material `AlertDialog` for forgot-password explanation, discard confirmation, appointment action confirmation, and AI approval confirmation. |
| Loading/feedback | Circular progress indicators and `InfoPanel`; several state changes use polite/assertive live regions. |
| Privacy/demo | Synthetic-data banners, `FLAG_SECURE`, privacy cover, and explicit local-demo text. |

## Recommended normalization

1. Preserve the existing Material 3 palette and rounded-card language; define named Figma tokens matching the current values.
2. Standardize screen content padding to 16dp for dense lists and 24dp for top-level forms/empty states.
3. Use one shared state component for loading, empty, error/retry, denied, unavailable, and outcome-unknown states.
4. Use status chips with text and icon, not color alone, for appointment, encounter, draft, and operation states.
5. Keep one primary action per screen. Make secondary navigation actions outlined or text-only consistently.
6. Give every icon-only control a content description; keep decorative icons explicitly decorative when adjacent text already carries the meaning.
7. Set a minimum 48dp interaction target for role-picker buttons, doctor rows, filter controls, and dialog actions.
8. Keep field labels persistent and show validation below the field; avoid placeholder-only instructions.
9. Define Figma text styles at the existing sizes, then test large-text behavior on a device before claiming accessibility.
10. Keep the synthetic banner visually distinct but quiet; it should never be confused with a clinical status indicator.

## Design tokens for Figma

| Token group | Recommended token | Value/source |
|---|---|---|
| Primary | `color.primary` | `#246E91` from `Theme.kt` |
| Primary container | `color.primaryContainer` | `#E8F3F7` |
| Secondary | `color.secondary` | `#337E80` |
| Background | `color.background` | `#F7FAFB` |
| Text primary | `color.onSurface` | `#203D4D` |
| Text secondary | `color.onSurfaceVariant` | `#5C7380` |
| Border | `color.outlineVariant` | `#D7E4ED` |
| Small/medium/large radius | `radius.sm/md/lg` | 12/16/20dp |
| Screen spacing | `space.screen/list` | 24/16dp |
| Minimum target | `size.touch` | 48dp |
