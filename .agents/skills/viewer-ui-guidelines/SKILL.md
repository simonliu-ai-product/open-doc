---
name: viewer-ui-guidelines
description: Design and accessibility rules for the open-doc viewer chrome — the browser shell, sidebars, thumbnail rail, outline, assets and design panels, inspector overlay, and menus. Use when building or reviewing UI under packages/core/src/app that surrounds a document. Does not apply to the printed page itself, which is governed by print-layout-review.
---

# open-doc viewer UI

The chrome is everything that is **not** the sheet: the shell, the rails, the panels, the menus. It has one job — keep the paper the loudest thing on screen and get out of the way. Judge it against that, not against how interesting it looks in a screenshot.

## Non-negotiables

1. **The page is the subject.** The sheet sits on `--canvas`; the chrome sits on `--background`. Chrome never competes with the document for contrast, saturation, or motion. A control that draws the eye away from the page during reading is a defect regardless of how well it's made.

2. **Tokens, not literals.** Colour comes from the theme tokens defined in `app/styles.css` — `--background`, `--foreground`, `--canvas`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--primary`, `--primary-foreground`, `--border`. A raw hex, `rgb()`, or Tailwind palette colour (`bg-zinc-800`) in chrome code is a finding: it won't follow the dark theme.

3. **Both themes, always.** Dark mode is the `.dark` class variant wired through `next-themes`; every token has a dark value. Any new surface is checked in both. Never define a colour only inside one branch.

4. **Document colours are not chrome colours.** `--od-*` variables (`--od-bg`, `--od-text`, `--od-accent`, `--od-margin`, `--od-size-*`) belong to the document's design system and are scoped to the page. Chrome must never read them, and page content must never read chrome tokens — that leak is what makes a printed page follow the viewer's dark mode.

5. **Keyboard first.** Every action reachable by mouse is reachable by keyboard. Focus is visible (never `outline: none` without a replacement), focus order follows visual order, and focus is trapped and restored around any panel or menu that overlays content. New shortcuts are documented where the user can find them, and must not collide with browser or OS bindings.

6. **Real semantics.** Buttons are `<button>`, links are `<a>`, lists are lists. A `<div onClick>` is a finding. Interactive controls carry an accessible name — an icon-only control needs `aria-label`. Panels that appear over content announce themselves (`role="dialog"` + labelled) or are inert to assistive tech if purely decorative.

7. **Motion is functional or absent.** The viewer is a reading tool. Animate only to explain a spatial relationship (a panel sliding from its edge, a rail expanding). Duration stays under 200ms, easing is `ease-out`, and only `transform`/`opacity` animate. Animating `width`/`height`/`top`/`left`, or animating anything on a keyboard-triggered action, is a finding. Honour `prefers-reduced-motion` by dropping movement while keeping opacity.

8. **Hit targets and pointer gating.** Interactive targets are at least 32×32 CSS px in dense rails, 40×40 elsewhere. Hover-revealed affordances are gated behind `@media (hover: hover) and (pointer: fine)` and must have a non-hover path.

9. **State is honest.** Loading, empty, and error states are designed, not accidental. Prefer a hairline progress affordance over a spinner for short waits; prefer an empty state that says what to do next over a blank rail. Never show a stale page count while re-measuring — show the previous value or nothing, never a wrong one.

10. **Density is deliberate.** The rails are dense by design: small type, tight leading, generous hit targets. Chrome type stays in the small end of the scale (`text-xs` / `text-sm`) so it reads as instrumentation, not content. Do not import the document's type scale into the chrome.

## Structure rules

- **The shell owns shared state.** `routes/home-shell.tsx` holds the left sidebar (nav counts, folders, theme toggle) and passes folder state to routes through the outlet context. A route that fetches the folders manifest itself is a finding.
- **The document view mirrors it.** `components/doc-sidebar.tsx` is the left rail (thumbnails / outline), pages scroll in the middle, the design panel docks right. New surfaces pick one of those three homes rather than inventing a fourth region.
- **`app/components/ui/` is the primitive layer.** Shared, unopinionated pieces only (currently `menu.tsx`). Feature-specific UI lives next to its feature, not here.
- **Edit mode types on the page, never into React's DOM.** Text is edited in a clone that stands in for the element (`lib/inspector/inline-edit.ts`); the rendered node is only hidden. Anything shown before Save must be visibly unsaved — the dashed pending frame and the unsaved-edits bar — and Discard must restore exactly what was rendered. After Save, what you see is the re-render from source; the clone only bridges the reload.

## Escalation triggers — flag on sight

- A hex/rgb/Tailwind palette colour in chrome code
- A new surface with no dark-theme value
- Chrome reading `--od-*`, or page content reading chrome tokens
- `<div>`/`<span>` with a click handler; icon button with no accessible name
- `outline: none` without a visible replacement
- A panel or menu that doesn't restore focus on close
- Animation over 200ms, `ease-in`, or animating layout properties
- Any motion tied to a keyboard shortcut or a high-frequency action
- Hover-only access to a function with no keyboard or click path
- A spinner for a wait the code knows is under ~300ms
- Fixed pixel widths on rails that make the page area collapse below ~900px viewport

## Output when reviewing

A findings table (`Before` / `After` / `Why`), then a verdict grouped by: **accessibility blocks**, **theming correctness**, **hierarchy & density**, **motion**, **structure fit**. Cite `file:line`. Block on any keyboard/screen-reader regression, any hardcoded colour, or any chrome/document token leak.

When building rather than reviewing: choose the boring, quiet option. The chrome's ceiling is "invisible"; there is no version of it that should be memorable.
