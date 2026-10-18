/**
 * The 9-slice panel frame as a CSS `border-image` source.
 *
 * `panel-frame.svg` is drawn with `currentColor`, which an external image
 * cannot inherit, so the SVG source is inlined as a data URI with the colour
 * baked in. Explicit width/height are added because `border-image-slice`
 * needs an intrinsic size to slice against.
 */
import frameRaw from './ui/panel-frame.svg?raw';

/** Slice guides from ART.md: corners are 16px squares of the 96px frame. */
export const PANEL_FRAME_SLICE = 16;

const sized = frameRaw.replace('<svg ', '<svg width="96" height="96" ');

const cache = new Map<string, string>();

/** `url("data:...")` for the frame tinted with `color` (any CSS colour literal). */
export function panelFrameImage(color: string): string {
  const hit = cache.get(color);
  if (hit) return hit;
  const svg = sized.replace(/currentColor/g, color);
  const url = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
  cache.set(color, url);
  return url;
}
