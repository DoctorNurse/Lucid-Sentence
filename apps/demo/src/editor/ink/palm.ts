/**
 * Palm rejection, in layers (see docs/TABLET.md §2):
 *
 * 1. Pen-exclusive session: the first real pen switches a device-default "fingers
 *    draw" setting off (handled by InkLayer, which owns that setting).
 * 2. Pen proximity window: touches are ignored while a pen is in contact or hovering,
 *    and for `penWindowMs` after.
 * 3. Contact size: once a pen has been seen, a touch whose contact is larger than
 *    `palmSize` CSS px is treated as a palm.
 * 4. Second-finger retraction: a finger stroke that a second finger follows within
 *    `retractMs` of its start was the first half of a pinch, not ink.
 * 5. `pointercancel` (the OS decided it was a palm, or the WebView took the gesture):
 *    the live stroke is discarded, not committed (InkLayer).
 */

export interface PalmOptions {
  penWindowMs: number;
  palmSize: number;
  retractMs: number;
}

export const PALM_DEFAULTS: PalmOptions = { penWindowMs: 700, palmSize: 48, retractMs: 300 };

export type Rejection = 'touch-off' | 'pen-active' | 'pen-recent' | 'palm-size' | null;

export interface TouchLike {
  pointerType: string;
  width?: number;
  height?: number;
}

export class PalmGuard {
  /** A pen is touching the surface. */
  penContact = false;
  /** A pen is hovering (in range, not touching). */
  penHover = false;
  /** Last time (ms) a pen was seen in any state. */
  penSeenAt = -Infinity;
  /** A pen has been seen this session. */
  penDetected = false;
  /** Count of rejected touches (diagnostics and tests). */
  rejected = 0;

  constructor(readonly opts: PalmOptions = PALM_DEFAULTS) {}

  pen(now: number, state: 'hover' | 'contact' | 'up' | 'leave'): void {
    this.penSeenAt = now;
    this.penDetected = true;
    this.penContact = state === 'contact';
    this.penHover = state === 'hover';
  }

  /** Why a pointer may not ink, or null if it may. Counts rejections. */
  check(e: TouchLike, drawWithTouch: boolean, now: number): Rejection {
    const r = this.peek(e, drawWithTouch, now);
    if (r) this.rejected++;
    return r;
  }

  /** Same as `check`, without counting. */
  peek(e: TouchLike, drawWithTouch: boolean, now: number): Rejection {
    if (e.pointerType !== 'touch') return null;
    if (!drawWithTouch) return 'touch-off';
    if (this.penContact || this.penHover) return 'pen-active';
    if (now - this.penSeenAt <= this.opts.penWindowMs) return 'pen-recent';
    if (this.penDetected && Math.max(e.width ?? 0, e.height ?? 0) > this.opts.palmSize) {
      return 'palm-size';
    }
    return null;
  }

  /** A second finger arrived: should the finger stroke that began at `startedAt` go? */
  shouldRetract(startedAt: number, now: number): boolean {
    return now - startedAt <= this.opts.retractMs;
  }
}
