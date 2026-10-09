export type Layout = 'desktop' | 'tablet' | 'phone';
export type LayoutSetting = Layout | 'auto';

/** Proposed tablet breakpoint (plan §4.6): width ≥ about 700 pt. */
export const PHONE_MAX_WIDTH = 700;
/** Below this the ribbon uses the tablet (touch, single-row) layout in "auto" mode. */
export const TABLET_MAX_WIDTH = 1100;

/**
 * Touch tablets up to this width (iPad Pro 13" landscape is 1376 pt; Galaxy Tab
 * S-series landscape is 1280–1480 dp) keep the touch layout with larger targets.
 */
export const TOUCH_TABLET_MAX_WIDTH = 1500;

/**
 * Resolve the layout for a container width. Real apps pass the device class
 * (desktop shell vs. mobile shell); "auto" uses width alone, which is what the
 * dev demo uses so the three layouts can be seen by resizing the window.
 */
export function resolveLayout(
  setting: LayoutSetting,
  width: number,
  coarsePointer = false,
): Layout {
  if (setting !== 'auto') return setting;
  if (width < PHONE_MAX_WIDTH) return 'phone';
  if (width < TABLET_MAX_WIDTH) return 'tablet';
  // A touch-first device (no fine pointer) at tablet widths: iPad, Galaxy Tab.
  if (coarsePointer && width <= TOUCH_TABLET_MAX_WIDTH) return 'tablet';
  return 'desktop';
}

/**
 * Tablet progressive collapse: which tablet priorities stay inline at a width.
 * Priority 3 is always in the group's overflow; priority 2 joins it when narrow.
 */
export function inlinePrioritiesForTablet(width: number): ReadonlySet<number> {
  return width < 900 ? new Set([1]) : new Set([1, 2]);
}
