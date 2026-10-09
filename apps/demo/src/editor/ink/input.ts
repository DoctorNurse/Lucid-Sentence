/**
 * Pointer input normalization for ink (Pointer Events Level 3).
 *
 * - Tilt: browsers report `tiltX/tiltY` (degrees), `altitudeAngle/azimuthAngle`
 *   (radians), or both. We fill in whichever is missing, using the conversions in the
 *   Pointer Events spec, so the rest of the ink code can use either.
 * - Pressure: pens report 0..1. Some Android WebViews report 0 during contact; that
 *   means "unknown", not "no pressure".
 * - Buttons: `buttons` bit 2 is the barrel (side) button, bit 32 the eraser end.
 *   Some stacks only report the eraser through `button === 5` on pointerdown.
 *
 * Pure functions and small state machines only (no DOM), so they unit-test directly.
 */

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;
const HALF_PI = Math.PI / 2;
const TWO_PI = Math.PI * 2;

export interface Angles {
  altitude: number;
  azimuth: number;
}
export interface Tilt {
  tiltX: number;
  tiltY: number;
}

/** tiltX/tiltY (degrees) → altitude/azimuth (radians). Pointer Events 3, §"Converting". */
export function anglesFromTilt(tiltX: number, tiltY: number): Angles {
  const tx = tiltX * RAD;
  const ty = tiltY * RAD;
  let azimuth = 0;
  if (tiltX === 0) {
    if (tiltY > 0) azimuth = HALF_PI;
    else if (tiltY < 0) azimuth = 3 * HALF_PI;
  } else if (tiltY === 0) {
    if (tiltX < 0) azimuth = Math.PI;
  } else if (Math.abs(tiltX) === 90 || Math.abs(tiltY) === 90) {
    azimuth = 0;
  } else {
    azimuth = Math.atan2(Math.tan(ty), Math.tan(tx));
    if (azimuth < 0) azimuth += TWO_PI;
  }
  let altitude: number;
  if (Math.abs(tiltX) === 90 || Math.abs(tiltY) === 90) altitude = 0;
  else if (tiltX === 0) altitude = HALF_PI - Math.abs(ty);
  else if (tiltY === 0) altitude = HALF_PI - Math.abs(tx);
  else altitude = Math.atan(1 / Math.sqrt(Math.tan(tx) ** 2 + Math.tan(ty) ** 2));
  return { altitude, azimuth };
}

/** altitude/azimuth (radians) → tiltX/tiltY (whole degrees). Pointer Events 3. */
export function tiltFromAngles(altitude: number, azimuth: number): Tilt {
  let tx = 0;
  let ty = 0;
  if (altitude === 0) {
    if (azimuth === 0 || azimuth === TWO_PI) tx = HALF_PI;
    else if (azimuth === HALF_PI) ty = HALF_PI;
    else if (azimuth === Math.PI) tx = -HALF_PI;
    else if (azimuth === 3 * HALF_PI) ty = -HALF_PI;
    else if (azimuth > 0 && azimuth < HALF_PI) [tx, ty] = [HALF_PI, HALF_PI];
    else if (azimuth > HALF_PI && azimuth < Math.PI) [tx, ty] = [-HALF_PI, HALF_PI];
    else if (azimuth > Math.PI && azimuth < 3 * HALF_PI) [tx, ty] = [-HALF_PI, -HALF_PI];
    else if (azimuth > 3 * HALF_PI && azimuth < TWO_PI) [tx, ty] = [HALF_PI, -HALF_PI];
  } else {
    const tanAlt = Math.tan(altitude);
    tx = Math.atan(Math.cos(azimuth) / tanAlt);
    ty = Math.atan(Math.sin(azimuth) / tanAlt);
  }
  return { tiltX: Math.round(tx * DEG) + 0, tiltY: Math.round(ty * DEG) + 0 };
}

/** The subset of PointerEvent the ink code reads (so tests can pass plain objects). */
export interface PointerLike {
  pointerType: string;
  clientX: number;
  clientY: number;
  pressure: number;
  tiltX?: number;
  tiltY?: number;
  altitudeAngle?: number;
  azimuthAngle?: number;
  width?: number;
  height?: number;
  buttons: number;
  button?: number;
  timeStamp: number;
}

export interface Sample {
  x: number;
  y: number;
  /** 0..1, or NaN when the device gave no usable pressure. */
  p: number;
  tiltX: number;
  tiltY: number;
  altitude: number;
  azimuth: number;
  t: number;
}

/** Fill in tilt and angles from whichever pair the event carries. */
export function normalizeTilt(
  e: Pick<PointerLike, 'tiltX' | 'tiltY' | 'altitudeAngle' | 'azimuthAngle'>,
): Tilt & Angles {
  const tiltX = e.tiltX ?? 0;
  const tiltY = e.tiltY ?? 0;
  const hasAngles =
    typeof e.altitudeAngle === 'number' &&
    typeof e.azimuthAngle === 'number' &&
    Math.abs(e.altitudeAngle - HALF_PI) > 1e-6;
  if (tiltX !== 0 || tiltY !== 0 || !hasAngles) {
    return { tiltX, tiltY, ...anglesFromTilt(tiltX, tiltY) };
  }
  const altitude = e.altitudeAngle!;
  const azimuth = e.azimuthAngle!;
  return { ...tiltFromAngles(altitude, azimuth), altitude, azimuth };
}

/** Pen pressure, or NaN if unknown. Mouse and touch never report real pressure. */
export function readPressure(e: Pick<PointerLike, 'pointerType' | 'pressure'>): number {
  if (e.pointerType !== 'pen') return Number.NaN;
  const p = e.pressure;
  // 0 during contact (some WebViews) and exactly 0.5 (the spec default for devices
  // without pressure) both mean "no real pressure".
  if (!(p > 0) || p === 0.5) return Number.NaN;
  return Math.min(1, p);
}

export function readSample(
  e: PointerLike,
  toPage: (cx: number, cy: number) => [number, number],
): Sample {
  const [x, y] = toPage(e.clientX, e.clientY);
  return { x, y, p: readPressure(e), ...normalizeTilt(e), t: e.timeStamp };
}

/**
 * How far the pen leans away from upright: 0 upright, 1 at 30° above the surface
 * or flatter. Used to widen the pencil line.
 */
export function lean(altitude: number): number {
  return Math.max(0, Math.min(1, (HALF_PI - altitude) / (HALF_PI - Math.PI / 6)));
}

export const BARREL = 2;
export const ERASER = 32;

/** Whether this pointer event asks for the eraser (barrel button or eraser end). */
export function wantsEraser(
  e: Pick<PointerLike, 'pointerType' | 'buttons' | 'button'>,
  down = false,
): boolean {
  if (e.pointerType !== 'pen') return false;
  if ((e.buttons & (BARREL | ERASER)) !== 0) return true;
  return down && e.button === 5;
}

/**
 * Tracks the pen's buttons for the whole hover → contact → lift cycle:
 *
 * - While hovering, pressing the barrel (or turning the pen to its eraser end)
 *   switches the tool to the eraser; letting go switches back.
 * - During a stroke, a press turns the rest of the gesture into erasing; the gesture
 *   stays an erase until the pen lifts, even if the button is let go first (some
 *   Android WebViews report `buttons = 0` mid-contact, so a release is ambiguous).
 */
export class PenButtons {
  /** The pen is currently asking for the eraser (button held or eraser end). */
  held = false;
  /** The current gesture became an erase because of a button. */
  latched = false;

  /** Feed every pen event. Returns true when `held` changed. */
  update(
    e: Pick<PointerLike, 'pointerType' | 'buttons' | 'button'>,
    phase: 'hover' | 'down' | 'move' | 'up',
  ): boolean {
    if (e.pointerType !== 'pen') return false;
    const before = this.held;
    if (phase === 'up') {
      this.latched = false;
      // Lifting releases the eraser end too; a held barrel shows up on the next hover.
      this.held = false;
      return before !== this.held;
    }
    const want = wantsEraser(e, phase === 'down');
    if (phase === 'hover') this.held = want;
    else if (want) {
      this.held = true;
      this.latched = true;
    }
    return before !== this.held;
  }

  reset(): void {
    this.held = false;
    this.latched = false;
  }
}
