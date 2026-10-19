# Responsive layout review

Production build (`npm run build`, `vite preview --port 4373`), headless Chromium via a throwaway Playwright script, 2026-10-19.
Screenshots and contact sheets are in `docs/review/responsive/` (labels on each tile give viewport and screen).

## Matrix

| Viewport | Notes |
| --- | --- |
| 320x568, 360x640, 375x667, 390x844 (DPR 2), 412x915 (DPR 3), 430x932 | phones, `isMobile` + touch |
| 768x1024, 1024x768 | tablet portrait / landscape |
| 1280x800, 1920x1080 | desktop |
| 844x390, 915x412 | phone landscape |
| 390x500 | short phone with the keyboard up |
| 390x844 at root `font-size` 125% and 150% | OS large text |
| 390x844 with `prefers-reduced-motion: reduce` | |
| 390x844 and 320x568 with safe-area insets top 47 / bottom 34 (CDP `Emulation.setSafeAreaInsetsOverride`) | notch + home indicator |

Per viewport: onboarding step 1 and 3, Haven, Board (timer running, one settled card with Undo), Ledger (Pell expanded), Settings (habits grid, reset dialog), toast, level-up, wave result, ring unlock ("Domain expanded", ring 2). All 16 configurations reached every screen and overlay (the ring unlock was reached by seeding `domainPoints: 119` in `haven.save` and settling one quest).

Automated checks per page: document horizontal overflow, elements wider than the viewport, interactive elements under 44px, text under 12px, content hidden behind the tab bar (last content bottom vs. `nav` top after scrolling `main` to the end), fixed/sticky elements, overlay height vs. viewport, computed safe-area padding.

## Defects

Severity: **critical** = unusable, **major** = wrong or ugly, **minor** = polish.

| # | Sev | Viewport(s) | Screen | Description | Likely CSS cause | Screenshot |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | critical | 844x390, 915x412, 390x500, 320x568 | Wave result window | The window is taller than the viewport and its top is pushed above the frame where it cannot be scrolled to: at 844x390 the window starts at y = -154 (title, monster, Attack/Defense bars unreachable); 915x412 y = -132; 390x500 y = -78; 320x568 y = -10 (title half cut). `backdropScrollable` is false in every case. | `overlays.module.css` `.backdrop { display:flex; align-items:flex-end; overflow-y:auto }`: overflow on the cross-axis start side of a flex-end item is unreachable. Fix: `align-items:flex-start` + `.modalInner { margin-top:auto }`, or `min-height:100%` wrapper. | `landscape-wave-844x390.png`, `zoom-320-wave-top.png`, `overlays-kbd.png` |
| 2 | major | 320x568; 390x844 at 150% text | Onboarding step 3 | The two-column habit grid blows out: the grid's scroll width is 315px in a 248px track at 320 (layout viewport expands to 351px, page scrolls sideways, right column "Outside / Wren the Scout" etc. clipped). At 150% text the same happens at 390 (425px). 360x640 is the smallest width that fits. | `OnboardingScreen.module.css` `.habitList { grid-template-columns: 1fr 1fr }` (= `minmax(auto,1fr)`, min-content of "Quartermaster"/"Nightwatch" wins). Fix: `minmax(0,1fr)`, `.habit { min-width:0 }`, or one column under 360px / `repeat(auto-fit, minmax(150px,1fr))`. | `zoom-320-onb3.png`, `onboarding.png`, `font-scaling-3.png` |
| 3 | major | 320, 360, all phones at 125%/150% text, safe-area run (state "Flickering") | Haven, Utilities card | The three utility columns overlap: the state word ("Bright"/"Flickering") overflows its column by 25px at 320, 12px at 360, 20px at 390@125%, 39px at 390@150% and is drawn under the next column's icon. With "Flickering" it overlaps at every phone width. | `HomeScreen.module.css` `.utilities { grid-template-columns: repeat(3,1fr) }` + `.utilityState { margin-left:auto }` in a `min-width:0` head with no wrapping or clipping. Fix: let `.utilityHead` wrap (state on its own line), or `grid-template-columns: 1fr` under 400px, or hide the word and keep the colour/icon. | `zoom-320-home-top.png`, `font-scaling.png`, `safearea.png` |
| 4 | major | all phone widths | Settings (Pace, Benevolence), onboarding Pace, habit lists | Radio and checkbox boxes shrink inconsistently: the checked Steady radio is 22px, Gentle/Hardcore are 13px; habit checkboxes range 13–22px within one list (measured `input` widths 13x22, 14x22, 18x22, 22x22). Visibly different control sizes side by side. | `global.css` `input[type=checkbox], input[type=radio] { width:22px; height:22px }` without `flex: none`; the inputs are flex children of `.choice`/`.habit` (`SettingsScreen.module.css`, `OnboardingScreen.module.css`) and shrink when the description's min-content is wide. Fix: `flex: 0 0 22px` (or `flex-shrink:0`). | `zoom-390-radios.png`, `settings-phones.png` |
| 5 | major | 320; any width when a body line is long (also 150% text) | Toast | The Dismiss "x" is drawn over the last words of the body line ("The lights ar×on."). | `overlays.module.css` `.toastHost .toast { padding-right: calc(var(--space-3) + 28px) }` reserves 40px, but `.close` is 44x44 at `right: 8px` inside an 8px border, so the glyph lands ~30–40px from the padding edge, inside the text. Fix: reserve `calc(var(--touch-target) + var(--space-2))` or move the button into the title row. | `zoom-320-toast.png`, `overlays-320.png` |
| 6 | major | 768x1024, 1024x768, 1280x800, 1920x1080 | all screens | The 480px frame floats in a flat void (1440px of empty `#0f0f14` at 1920). Nothing is broken, but 8–10px pixel headings on a 1920 monitor are tiny and the space is wasted. Proposal (pick one): (a) scale the whole frame on wide viewports (`@media (min-width: 900px) { html { font-size: 18px } }` and `--app-max-width: 560px`, everything is rem/em-based so it scales cleanly); (b) a faint pixel backdrop (scene art, scanlines or vignette) behind the frame so the void reads as intentional; (c) a two-column layout for Board and Ledger at `>= 1024px`. (a)+(b) is the cheapest. | `AppShell.module.css` `.shell { max-width: var(--app-max-width) }`, `tokens.css` `--app-max-width: 480px` | `desktop.png` |
| 7 | major | 844x390, 915x412 | Haven, every screen | In landscape the ring header (min-height 200px + padding) and the 64px tab bar leave ~110px of scrolling content; the tab bar is 16% of the height. Usable but cramped. Consider `@media (max-height: 500px)`: header `min-height: 140px`, hide the scene, `--tabbar-height: 52px`. | `RingHeader.module.css` `.overlay { min-height:200px }`, `tokens.css` `--tabbar-height: 64px` (px, not viewport-aware) | `landscape.png` |
| 8 | minor | iOS with notch (safe-area run, 47/34) | Haven | The header scene does not bleed under the status bar: a 47px bare band appears above it, and the content inside the header is pushed down a second time (`main` already adds `--safe-top` to its padding, and `.overlay` adds it again). Tab bar and `main` bottom padding are correct (nav 98px incl. 34px, main padding-bottom 114px). | `RingHeader.module.css` `.header { margin: calc(-1 * var(--space-4)) ... }` should also subtract `--safe-top`; drop the extra `--safe-top` in `.overlay` padding or in `.content` padding-top, not both. | `safearea.png` |
| 9 | minor | 390 at 150% text (any width with large text) | Ledger "The Absolute" | `DOMAIN POINTS 123 · The Flat` wraps to three lines because the label column is `8em` (192px at 24px root) and the value gets ~100px. | `CharacterScreen.module.css` `.facts > div { grid-template-columns: 8em 1fr }` (and `VassalCard` `7.5em 1fr`). Use `minmax(6em, max-content) 1fr` or `auto 1fr`. | `font-scaling-3.png` |
| 10 | minor | 390 at 150%; 320 at 125%+ | Tab bar | Labels scale with rem (8px -> 12px Press Start 2P): "SETTINGS" is 96px in a 97px column at 390@150% and would overflow at 320 with large text. Icons (22px) do not scale at all. | `TabBar.module.css` `.label { font-size: var(--heading-xs) }` with `grid-template-columns: repeat(4,1fr)` and no `overflow`/`min-width:0`. Clamp the label (`font-size: clamp(8px, 0.5rem, 10px)`) or allow `overflow-wrap`. | `font-scaling-3.png` |
| 11 | minor | all | all | 8px Press Start 2P text is used for tab labels, legends, "STEP 1 OF 3", chip "XP", title names, choice labels, utility labels, "I TRIED"/"SWAP QUEST" buttons, "RENAME" (`--heading-xs: 0.5rem`); 10px for card titles and buttons. On a DPR 1 screen 8px is the limit of legibility (Ledger has 36 text nodes under 12px). Tap targets are fine (all buttons/links >= 44px; only the 22px inputs are smaller and they sit in 44px labels). | `tokens.css` `--heading-xs: 0.5rem`, `--heading-sm: 0.625rem`; `global.css` `.btn--sm`. Consider 9px minimum for interactive labels. | `ledger-phones.png` |
| 12 | minor | 320, 360 | Haven, Vassals strip | The horizontal strip cuts the fourth portrait at the panel edge with no scroll affordance (no fade, no scrollbar on touch). | `HomeScreen.module.css` `.strip { overflow-x:auto }`; add a right-edge gradient mask or `scroll-snap`. | `home-phones.png` |
| 13 | minor | 320x568, 360x640, 375x667, landscape | Ring unlock | The fullscreen window (815–903px) needs a scroll on every phone under 430px tall-equivalent; the 200px scene scrolls away before the vignette is readable. Works (backdrop is scrollable, `flex-start`), but a `max-height` + inner scroll for the vignette would keep the scene and the Continue button on screen. | `overlays.module.css` `.fullscreen` / `.ringScene { height:200px }` | `overlays-320.png`, `landscape.png` |
| 14 | minor | 390 at 150% | Wave result | The battle log keeps `max-height: 200px` in px, so with large text only ~3 lines are visible while the window itself still fits; and the Attack/Defense `aria-valuenow` labels sit tight against the bars. | `overlays.module.css` `.log { max-height:200px }` -> use `em`/`rem` or `min(40vh, 14em)`. | `font-scaling-2.png` |

Not a layout bug but found while scripting, worth a ticket: a mouse click on **Continue** in the level-up window fires `onDismiss` twice (the button's own handler and the bubble to `ModalFrame`'s `onClick={onTap}`), so the next queued window (ring unlock) is dropped. Keyboard Enter/Escape dismisses once. `RingUnlockWindow` already wraps its buttons in a `stopPropagation` row; `LevelUpWindow` and `WaveResultWindow` use `SystemWindow`'s `actions` without one.

Counts: 1 critical, 6 major, 7 minor.

## What works well

- No document-level horizontal overflow on any app screen at any width (the only blow-out is onboarding step 3 at 320 / large text).
- Nothing is hidden behind the tab bar: `main` reserves `tabbar + safe-bottom + 16px` and the last element clears the bar by 28–32px on every screen (the automated "Ledger hidden" hit was a false positive from the closed `<details>` story paragraph).
- Safe-area handling is real: with insets emulated, the tab bar grows to 98px with 34px of bottom padding, `main` padding follows, and the toast/backdrop offsets use the same calc.
- `100dvh` + the in-frame scroller means mobile browser chrome does not clip the tab bar.
- Quest cards degrade gracefully: controls wrap (`flex-wrap`), the stepper and Done stack at 320, the timer clock keeps its `7.5em` width, Undo stays visible on settled cards.
- Everything is rem/em based, so 125% and 150% OS text scaling works almost everywhere: Board, Ledger, Settings, onboarding steps 1–2, level-up, reset dialog and the wave window all reflow with no clipping. Only #3, #2, #9, #10 and #14 degrade.
- The native `<dialog>` reset confirmation is centered, within `min(440px, 100vw - 32px)`, and fits even at 844x390 (252px tall) and at 150% text.
- The 9-slice `border-image` frames stay crisp at DPR 2 and 3 (checked at native resolution on 412x915@3).
- `prefers-reduced-motion` produces an identical layout (animations only) and the Typewriter reveals text at once.
- The 480px frame with 2px side borders is a clear, deliberate presentation on tablets; the choice is defensible, the void is the only objection (#6).
- Touch targets: every button, link, select and summary measures >= 44px in both axes on every viewport; the 22px radios/checkboxes are inside 44px-tall labels.

## Patterns observed (root causes)

1. **`1fr` grid tracks without `minmax(0, 1fr)`** – `.habitList` (onboarding) and `.utilities` (home) both rely on `1fr` columns whose min-content is wider than the track; the grid overflows or the content overlaps the neighbour. Same family: `.breakdown { 1fr 1fr }`, `.habitList` in Settings is single-column so it is safe. (#2, #3)
2. **Flex children that may shrink** – form controls with fixed `width` but default `flex-shrink: 1` (#4); the fix is `flex: none` on icons and inputs everywhere they sit in a flex row (`Icon` already does it, inputs do not).
3. **Flex-end alignment on a scrolling backdrop** – overflow on the start side of a `flex-end`/`center` container is unreachable; this is the one critical bug and it hits every short viewport (#1).
4. **Absolutely positioned controls not budgeted in padding** – the toast close button is 44px but the text reserves 40px (#5).
5. **Fixed px heights in rem-based components** – `--tabbar-height: 64px`, `.overlay min-height: 200px`, `.ringScene height: 200px`, `.log max-height: 200px`, tab icons `size={22}`: everything else scales with the root font, these do not, so large text and landscape squeeze the scrolling area (#7, #10, #13, #14).
6. **em-sized label columns** – `grid-template-columns: 8em 1fr` / `7.5em 1fr` grow with text scaling and starve the value column (#9).
7. **Safe-area applied twice / not bled** – `--safe-top` is added in `.content` padding and again in `RingHeader .overlay`, while `.header`'s negative margin ignores it, leaving a bare band under the status bar (#8).
8. **Single max-width breakpoint** – the only media query in the app is `max-width: 480px` (drop the side borders). There is no `max-height` query for landscape and no `min-width` query for tablets/desktops, so the layout is identical from 480px to 1920px (#6, #7).
9. **8px pixel-font floor** – `--heading-xs: 0.5rem` is used for interactive labels; legible on DPR 2–3, marginal on DPR 1 (#11).
10. **Scroll affordance** – the horizontal vassal strip relies on an invisible scrollbar (#12).

## Method notes

- Script: `scratchpad/responsive/capture.cjs` (not committed). One browser, three parallel contexts, ~9s per viewport. Overlays were dismissed with Escape rather than clicking Continue because of the double-dismiss bug above.
- Full-page captures use the same `[class*=shell]{height:auto}` trick as `e2e/visual.spec.ts`; viewport captures show the real frame.
- Safe-area insets were emulated with the CDP `Emulation.setSafeAreaInsetsOverride` command (works in the bundled Chromium); `env()` resolved to 47px/34px and the computed paddings were read back.
- `src/` and `e2e/` were not modified.
