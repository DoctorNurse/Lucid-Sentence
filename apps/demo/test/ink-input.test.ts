import { describe, expect, it } from 'vitest';
import {
  anglesFromTilt,
  lean,
  normalizeTilt,
  PenButtons,
  readPressure,
  tiltFromAngles,
  wantsEraser,
} from '../src/editor/ink/input.js';
import { PalmGuard } from '../src/editor/ink/palm.js';
import { connectPencil, pencilCommand } from '../src/editor/ink/pencil.js';

const pen = (buttons: number, button = -1) => ({ pointerType: 'pen', buttons, button });

describe('tilt ↔ altitude/azimuth', () => {
  it('upright pen', () => {
    const a = anglesFromTilt(0, 0);
    expect(a.altitude).toBeCloseTo(Math.PI / 2);
    expect(a.azimuth).toBe(0);
  });
  it('single-axis tilts', () => {
    expect(anglesFromTilt(30, 0).altitude).toBeCloseTo(Math.PI / 3);
    expect(anglesFromTilt(-30, 0).azimuth).toBeCloseTo(Math.PI);
    expect(anglesFromTilt(0, 45).azimuth).toBeCloseTo(Math.PI / 2);
    expect(anglesFromTilt(0, -45).azimuth).toBeCloseTo((3 * Math.PI) / 2);
    expect(anglesFromTilt(90, 0).altitude).toBe(0);
  });
  it('round-trips through both directions', () => {
    for (const [tx, ty] of [
      [10, -5],
      [30, 20],
      [-40, 35],
      [-15, -60],
      [45, 0],
      [0, -70],
    ] as const) {
      const { altitude, azimuth } = anglesFromTilt(tx, ty);
      expect(tiltFromAngles(altitude, azimuth)).toEqual({ tiltX: tx, tiltY: ty });
    }
  });
  it('flat pen edge cases', () => {
    expect(tiltFromAngles(0, 0)).toEqual({ tiltX: 90, tiltY: 0 });
    expect(tiltFromAngles(0, Math.PI)).toEqual({ tiltX: -90, tiltY: 0 });
    expect(tiltFromAngles(0, Math.PI / 4)).toEqual({ tiltX: 90, tiltY: 90 });
  });
  it('normalizeTilt fills tilt from angles (Safari) and angles from tilt', () => {
    const fromAngles = normalizeTilt({ altitudeAngle: Math.PI / 4, azimuthAngle: 0 });
    expect(fromAngles.tiltX).toBe(45);
    expect(fromAngles.tiltY).toBe(0);
    const fromTilt = normalizeTilt({ tiltX: 0, tiltY: 30 });
    expect(fromTilt.altitude).toBeCloseTo(Math.PI / 3);
    // Default angles (upright) with no tilt stay upright.
    const none = normalizeTilt({ altitudeAngle: Math.PI / 2, azimuthAngle: 0 });
    expect(none).toMatchObject({ tiltX: 0, tiltY: 0 });
  });
  it('lean is 0 upright and 1 at 30° or flatter', () => {
    expect(lean(Math.PI / 2)).toBe(0);
    expect(lean(Math.PI / 6)).toBeCloseTo(1);
    expect(lean(0)).toBe(1);
  });
});

describe('pressure', () => {
  it('only pens report real pressure', () => {
    expect(readPressure({ pointerType: 'pen', pressure: 0.7 })).toBe(0.7);
    expect(readPressure({ pointerType: 'mouse', pressure: 0.7 })).toBeNaN();
    expect(readPressure({ pointerType: 'touch', pressure: 0.3 })).toBeNaN();
  });
  it('0 during contact and the 0.5 default mean unknown', () => {
    expect(readPressure({ pointerType: 'pen', pressure: 0 })).toBeNaN();
    expect(readPressure({ pointerType: 'pen', pressure: 0.5 })).toBeNaN();
  });
});

describe('pen buttons', () => {
  it('barrel (2), eraser end (32) and button 5 on down', () => {
    expect(wantsEraser(pen(2))).toBe(true);
    expect(wantsEraser(pen(32))).toBe(true);
    expect(wantsEraser(pen(1))).toBe(false);
    expect(wantsEraser(pen(0, 5), true)).toBe(true);
    expect(wantsEraser(pen(0, 5), false)).toBe(false);
    expect(wantsEraser({ pointerType: 'mouse', buttons: 2 })).toBe(false);
  });
  it('hover follows the button; a mid-stroke press latches until lift', () => {
    const b = new PenButtons();
    expect(b.update(pen(2), 'hover')).toBe(true);
    expect(b.held).toBe(true);
    b.update(pen(0), 'hover');
    expect(b.held).toBe(false);
    b.update(pen(1), 'down');
    expect(b.latched).toBe(false);
    b.update(pen(3), 'move');
    expect(b.latched).toBe(true);
    // Button released (or the WebView reports 0) mid-contact: still erasing.
    b.update(pen(1), 'move');
    expect(b.latched).toBe(true);
    b.update(pen(0), 'up');
    expect(b.latched).toBe(false);
    expect(b.held).toBe(false);
  });
  it('ignores non-pen pointers', () => {
    const b = new PenButtons();
    expect(b.update({ pointerType: 'touch', buttons: 32 }, 'down')).toBe(false);
    expect(b.held).toBe(false);
  });
});

describe('palm guard', () => {
  it('blocks touch while the pen is near and for the window after', () => {
    const g = new PalmGuard();
    const touch = { pointerType: 'touch', width: 10, height: 10 };
    expect(g.check(touch, true, 0)).toBeNull();
    expect(g.check(touch, false, 0)).toBe('touch-off');
    g.pen(1000, 'hover');
    expect(g.check(touch, true, 1100)).toBe('pen-active');
    g.pen(1200, 'contact');
    expect(g.check(touch, true, 1300)).toBe('pen-active');
    g.pen(1400, 'up');
    expect(g.check(touch, true, 1500)).toBe('pen-recent');
    expect(g.check(touch, true, 2200)).toBeNull();
    expect(g.rejected).toBe(4);
    expect(g.peek(touch, false, 0)).toBe('touch-off');
    expect(g.rejected).toBe(4);
  });
  it('rejects large contacts only once a pen has been seen', () => {
    const g = new PalmGuard();
    const palm = { pointerType: 'touch', width: 80, height: 60 };
    expect(g.check(palm, true, 0)).toBeNull();
    g.pen(0, 'leave');
    expect(g.check(palm, true, 5000)).toBe('palm-size');
    expect(g.check({ pointerType: 'pen', width: 80 }, false, 5000)).toBeNull();
  });
  it('second finger within the retract window', () => {
    const g = new PalmGuard();
    expect(g.shouldRetract(100, 350)).toBe(true);
    expect(g.shouldRetract(100, 500)).toBe(false);
  });
});

describe('Apple Pencil bridge', () => {
  it('maps the system preference to a command on ended', () => {
    expect(pencilCommand({ kind: 'tap', phase: 'ended', action: 'switchEraser' })).toBe(
      'toggle-eraser',
    );
    expect(pencilCommand({ kind: 'tap', phase: 'ended', action: 'switchPrevious' })).toBe(
      'previous-tool',
    );
    expect(
      pencilCommand({ kind: 'squeeze', phase: 'ended', action: 'showContextualPalette' }),
    ).toBe('show-palette');
    expect(pencilCommand({ kind: 'squeeze', phase: 'began', action: 'switchEraser' })).toBeNull();
    expect(pencilCommand({ kind: 'tap', phase: 'ended', action: 'ignore' })).toBeNull();
  });
  it('is a no-op on the web', () => {
    expect(connectPencil(() => undefined)).toBe(false);
  });
  it('subscribes when the native plugin exists', () => {
    const seen: string[] = [];
    let cb: ((e: { kind: string }) => void) | undefined;
    (globalThis as Record<string, unknown>).Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        PencilInteraction: {
          addListener: (_: string, f: (e: { kind: string }) => void) => {
            cb = f;
            return Promise.resolve({ remove: () => Promise.resolve() });
          },
        },
      },
    };
    try {
      expect(connectPencil((e) => seen.push(e.kind))).toBe(true);
      cb?.({ kind: 'tap' });
      expect(seen).toEqual(['tap']);
    } finally {
      delete (globalThis as Record<string, unknown>).Capacitor;
    }
  });
});
