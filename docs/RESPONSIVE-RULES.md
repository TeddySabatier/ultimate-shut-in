# Responsive development rules

Derived from the responsive review of 2026-10-19 (`docs/review/responsive-review.md`: 16 viewport configurations, 12 screens, 14 defects, 10 root causes). Every rule below maps to a defect that actually shipped in v0.1.0. Follow them for every new screen, component or overlay. The checklist at the end is the definition of done for UI work.

## 1. Support matrix

The app must be usable, with nothing clipped and nothing overlapping, in all of these:

| Class | Sizes | Notes |
| --- | --- | --- |
| Small phone | 320x568, 360x640 | 320 is the floor. Single column is fine, overflow is not. |
| Phone | 375x667, 390x844, 412x915, 430x932 | Primary target. Design at 390x844. |
| Phone landscape | 844x390, 915x412 | Content area can be ~110px tall if headers are fixed. It must not be. |
| Phone with keyboard | 390x500 | Any screen with an input must still reach its submit button. |
| Tablet | 768x1024, 1024x768 | The frame may stay centered, but it must not look like a phone lost in a void. |
| Desktop | 1280x800, 1920x1080 | Same as tablet. |
| Text scaling | 125% and 150% root font | OS "large text". Layout must reflow, never overlap. |
| Density | DPR 1, 2, 3 | Pixel font and 1px borders must stay legible at DPR 1. |
| Motion | `prefers-reduced-motion: reduce` | Identical layout, no movement. |
| Safe areas | top 47px, bottom 34px | Notch and home indicator. Applied once. |

## 2. Layout rules

1. **Grid tracks are `minmax(0, 1fr)`, never bare `1fr`.** A bare `1fr` track has a min-content floor; long words or large text blow the grid out of its container (onboarding habit grid at 320, utilities row at every width). Use `repeat(n, minmax(0, 1fr))` and let content wrap. Below 360px, prefer one column.
2. **Fixed-size flex children get `flex: none`.** Icons, radio and checkbox inputs, avatars, badges. Without it, `flex-shrink: 1` turns a 22px control into 13px next to its sibling.
3. **Flex children that hold text get `min-width: 0`.** Otherwise the text's min-content width wins and the row overflows instead of wrapping.
4. **Never rely on `margin-left: auto` to separate two text cells in a grid.** Give each cell its own track or wrap. Status words like "Flickering" are longer than "Bright" and must have room.
5. **No fixed px heights on anything that holds content.** Tab bar, headers, scene art, battle logs, modal bodies. Use `rem` (so text scaling scales the box), `min-height` plus `auto`, or viewport-relative `dvh`. A fixed 200px header plus a fixed 64px tab bar leaves nothing on a landscape phone.
6. **Label columns are not sized in `em`.** `grid-template-columns: 8em 1fr` grows with text scaling and starves the value column. Use `auto 1fr` with `min-width: 0`, or stack labels above values below 360px.
7. **Horizontal strips show that they scroll.** A faded edge, a partial last card, or chevrons. An invisible scrollbar is not an affordance.
8. **Breakpoints cover both axes.** The app needs at least: `max-width: 359px` (compact), `min-width: 768px` (tablet and desktop: widen the frame, scale the root font, or use two columns), and `max-height: 500px` (landscape and keyboard: collapse headers, shrink the tab bar, drop decorative art). One `max-width: 480px` query is not responsive design.
9. **Safe-area insets are applied exactly once per edge, at the outermost element.** Inner components do not add `env(safe-area-inset-*)` again, and negative margins that bleed art under the status bar must include the inset.

## 3. Overlay rules

10. **A scrolling backdrop aligns from the start.** `align-items: flex-end` or `center` on a container with `overflow-y: auto` makes the overflowing side unreachable. Use `align-items: flex-start` and push the sheet down with `margin-top: auto` on the inner element. This was the one critical defect.
11. **Every overlay fits `max-height: calc(100dvh - safe areas)` and scrolls inside itself.** Logs and lists inside overlays use `max-height` in `dvh` or `rem`, not px.
12. **Absolutely positioned controls are budgeted in the parent's padding.** A 44px close button needs 44px plus gap reserved, including the border width.
13. **A dismiss action fires once.** Buttons inside a modal that also closes on backdrop click must `stopPropagation`, or the queued next overlay is silently dropped (level-up swallowed the ring unlock).

## 4. Typography and targets

14. **Minimum sizes.** Body text 14px at 100% scaling. Interactive labels (tab bar, buttons) never below 10px, and the pixel heading font (`Press Start 2P`) never below 9px; at DPR 1 the 8px floor is unreadable.
15. **Tap targets are at least 44x44 CSS px**, including after text scaling and inside dense rows.
16. **Size in `rem` by default.** Only borders, outlines and hairline decorations are in px.

## 5. Process rules

17. **Design at 390x844, then check 320x568 and 844x390 before calling a screen done.** Those two catch almost every defect in the review.
18. **Run the responsive sweep before merging UI changes.** `npm run e2e` includes the viewport spec (`e2e/responsive.spec.ts`, see below). The automated checks are: no horizontal overflow (`scrollWidth <= innerWidth`), no element wider than the viewport, every button and input at least 44px, every overlay's top edge at `y >= 0`, nothing hidden behind the tab bar.
19. **Look at the screenshots.** Automated metrics do not catch overlapping text or a state word colliding with its neighbour. Tile the sweep output and read it.
20. **Text scaling is part of QA.** Test once at 150% root font per screen; if it reflows cleanly there, 125% is fine.

## 6. Checklist (definition of done for any UI change)

- [ ] 320x568 portrait: no horizontal scroll, nothing clipped
- [ ] 390x844 at 150% root font: nothing overlaps, every control reachable
- [ ] 844x390 landscape: content area still usable, overlays scrollable from the top
- [ ] 768+ width: layout uses the room or is deliberately centered with intent
- [ ] All grids use `minmax(0, 1fr)`; fixed-size flex children have `flex: none`
- [ ] No new fixed px heights on content containers
- [ ] Overlays: `flex-start` + `margin-top: auto`, internal scroll, single dismiss
- [ ] Tap targets 44px; labels at or above the minimum font sizes
- [ ] Safe-area insets applied once
- [ ] `prefers-reduced-motion` honoured
- [ ] Responsive e2e spec passes and screenshots were viewed

## 7. Open defects to fix (from the review, ranked)

See `docs/review/responsive-review.md` for the full table. Ranked: wave window clipped on short viewports (critical); onboarding habit grid overflow at 320; utilities state overlap; shrinking radio/checkbox controls; toast close over text; tablet and desktop void; landscape content height; safe-top band; em label columns; tab labels at 150%; 8px font floor; vassal strip affordance; px log max-height; ring-unlock scroll on small phones; double dismiss on level-up and wave windows.
