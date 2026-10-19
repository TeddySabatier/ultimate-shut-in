/**
 * Layout checks from docs/RESPONSIVE-RULES.md rule 18, shared by the
 * responsive sweep and the City Map specs.
 */
import type { Page } from '@playwright/test';

export interface AuditOptions {
  /** A modal overlay is open: check its top edge and its primary button. */
  overlay?: boolean;
  /** The tab bar is present: nothing may sit behind it once scrolled to the end. */
  tabBar?: boolean;
}

/** Layout metrics read in the page; every string in the result is a failed rule. */
export async function audit(page: Page, opts: AuditOptions = {}): Promise<string[]> {
  return page.evaluate((o) => {
    const problems: string[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const describe = (el: Element): string => {
      const id = el.id ? `#${el.id}` : '';
      const cls = typeof el.className === 'string' && el.className ? `.${el.className.split(/\s+/).slice(0, 2).join('.')}` : '';
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
      return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
    };
    const visible = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) return false; // sr-only (clipped to 1px on at least one axis)
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none';
    };

    // 1. Document-level horizontal overflow.
    const doc = document.documentElement;
    if (doc.scrollWidth > vw) problems.push(`document scrollWidth ${doc.scrollWidth} > innerWidth ${vw}`);

    // 2. Scrollers never overflow sideways (except the deliberate horizontal strips, marked by scroll-snap).
    const strips: Element[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const cs = getComputedStyle(el);
      const scrolls = /(auto|scroll)/.test(cs.overflowX) || /(auto|scroll)/.test(cs.overflowY);
      if (!scrolls || !visible(el)) continue;
      if (cs.scrollSnapType !== 'none') {
        strips.push(el);
        continue;
      }
      if (el.scrollWidth > el.clientWidth + 1) problems.push(`${describe(el)} scrolls sideways: scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
    }

    // 3. No element's box leaves the viewport horizontally.
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      if (!visible(el)) continue;
      if (strips.some((s) => s !== el && s.contains(el))) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) problems.push(`${describe(el)} spans ${Math.round(r.left)}..${Math.round(r.right)} (viewport ${vw})`);
    }

    // 4. Tap targets and font floors.
    const pixel = (cs: CSSStyleDeclaration) => /press start/i.test(cs.fontFamily);
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('button, a, input, select, textarea, summary, [role="button"]'))) {
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      let r = el.getBoundingClientRect();
      const inline = el.tagName === 'A' && cs.display === 'inline';
      if (inline) continue; // text links inside a paragraph
      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
        // The control sits inside a 44px label that is the real target.
        const label = el.closest('label');
        if (label) r = label.getBoundingClientRect();
      }
      // pointer-events: none controls (the map's zone bands) are not tap targets; taps pass through to the buildings.
      if (cs.pointerEvents !== 'none' && (r.width < 44 - 0.5 || r.height < 44 - 0.5)) problems.push(`${describe(el)} is ${Math.round(r.width)}x${Math.round(r.height)} (< 44px)`);
      const size = parseFloat(cs.fontSize);
      const floor = pixel(cs) ? 9 : 10;
      if (size < floor - 0.01 && (el.textContent ?? '').trim()) problems.push(`${describe(el)} font-size ${size}px < ${floor}px`);
    }
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('nav a span'))) {
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize);
      if (size < 9 - 0.01) problems.push(`${describe(el)} font-size ${size}px < 9px`);
      if (el.scrollWidth > el.clientWidth + 1) problems.push(`${describe(el)} label clipped (${el.scrollWidth} > ${el.clientWidth})`);
    }

    // 5. Overlays: reachable from the top, primary button on screen (after scrolling it into view).
    if (o.overlay) {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).filter(visible);
      if (dialogs.length === 0) problems.push('no open dialog');
      for (const d of dialogs) {
        const r = d.getBoundingClientRect();
        if (r.top < -0.5) problems.push(`${describe(d)} top ${Math.round(r.top)} < 0`);
        if (r.bottom > vh + 0.5) problems.push(`${describe(d)} bottom ${Math.round(r.bottom)} > ${vh}`);
        const window_ = d.querySelector<HTMLElement>('[class*="window"]');
        if (window_) {
          const w = window_.getBoundingClientRect();
          if (w.top < -0.5) problems.push(`${describe(window_)} top ${Math.round(w.top)} < 0 (unreachable)`);
        }
        const buttons = Array.from(d.querySelectorAll<HTMLElement>('button')).filter(visible);
        const primary = buttons.find((b) => b.classList.contains('btn--primary')) ?? buttons[buttons.length - 1];
        if (!primary) {
          problems.push(`${describe(d)} has no button`);
          continue;
        }
        primary.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const b = primary.getBoundingClientRect();
        if (b.top < 0 || b.bottom > vh || b.left < 0 || b.right > vw) problems.push(`${describe(primary)} off screen at ${Math.round(b.top)}..${Math.round(b.bottom)} (viewport ${vh})`);
      }
    }

    // 6. Nothing behind the tab bar once the content is scrolled to its end.
    if (o.tabBar) {
      const main = document.getElementById('main');
      const nav = document.querySelector<HTMLElement>('nav[aria-label="Main navigation"]');
      if (!main || !nav) problems.push('main or nav missing');
      else {
        main.scrollTop = main.scrollHeight;
        const last = main.lastElementChild;
        const navTop = nav.getBoundingClientRect().top;
        if (last) {
          const r = last.getBoundingClientRect();
          if (r.bottom > navTop + 0.5) problems.push(`${describe(last)} bottom ${Math.round(r.bottom)} is behind the tab bar (top ${Math.round(navTop)})`);
        }
        const navRect = nav.getBoundingClientRect();
        if (navRect.bottom > vh + 0.5) problems.push(`tab bar bottom ${Math.round(navRect.bottom)} > ${vh}`);
        main.scrollTop = 0;
      }
    }
    return problems;
  }, opts);
}

/** OS "large text": scale the root font so rem-based layout reflows. */
export async function applyFontScale(page: Page, scale: number | undefined): Promise<void> {
  if (!scale) return;
  await page.evaluate((s) => {
    document.documentElement.style.fontSize = `${Math.round(s * 100)}%`;
  }, scale);
}
