/**
 * Apple Pencil double-tap and squeeze (iPadOS), through the native Capacitor plugin in
 * `apps/mobile/plugins/pencil-interaction` (UIPencilInteraction). Web content never sees
 * these gestures, so in a browser or PWA this does nothing.
 *
 * The plugin reports the action the user picked in Settings → Apple Pencil
 * (`preferredTapAction` / `preferredSqueezeAction`); we honor it rather than inventing one.
 */

/** UIPencilPreferredAction, as strings. */
export type PencilAction =
  | 'ignore'
  | 'switchEraser'
  | 'switchPrevious'
  | 'showColorPalette'
  | 'showInkAttributes'
  | 'showContextualPalette'
  | 'runSystemShortcut';

export interface PencilEvent {
  kind: 'tap' | 'squeeze';
  /** Squeeze phases (began/changed/ended/cancelled); taps are always 'ended'. */
  phase: 'began' | 'changed' | 'ended' | 'cancelled';
  action: PencilAction;
  /** Hover position in CSS px (iPadOS 17.5+ with a hovering Pencil), if known. */
  hover?: { x: number; y: number };
}

interface PencilPlugin {
  addListener(
    event: 'pencilInteraction',
    cb: (e: PencilEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  getPreferences?(): Promise<{ tap: PencilAction; squeeze: PencilAction }>;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: { PencilInteraction?: PencilPlugin };
}

/** What a gesture should do in our UI, given the user's system preference. */
export function pencilCommand(
  e: Pick<PencilEvent, 'kind' | 'phase' | 'action'>,
): 'toggle-eraser' | 'previous-tool' | 'show-palette' | null {
  if (e.phase !== 'ended') return null;
  switch (e.action) {
    case 'switchEraser':
      return 'toggle-eraser';
    case 'switchPrevious':
      return 'previous-tool';
    case 'showColorPalette':
    case 'showInkAttributes':
    case 'showContextualPalette':
      return 'show-palette';
    default:
      return null;
  }
}

/** Subscribe to Pencil gestures if the native plugin is present. Returns whether it is. */
export function connectPencil(on: (e: PencilEvent) => void): boolean {
  const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
  const plugin = cap?.Plugins?.PencilInteraction;
  if (!plugin || cap.isNativePlatform?.() === false) return false;
  void plugin.addListener('pencilInteraction', on);
  return true;
}
