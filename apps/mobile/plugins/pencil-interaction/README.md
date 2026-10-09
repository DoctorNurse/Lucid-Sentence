# Capacitor plugin: Apple Pencil double-tap and squeeze

**Status: boilerplate, not compiled.** It was written without Xcode (Linux CI box), and
the Capacitor iOS shell it plugs into doesn't exist yet (see `apps/mobile/README.md`).
The TODOs in the Swift file list what to check on a real iPad.

Web pages never receive Apple Pencil double-tap or squeeze. This plugin attaches a
`UIPencilInteraction` to the app's `WKWebView` and forwards each gesture to JavaScript
as a `pencilInteraction` event:

```ts
{ kind: 'tap' | 'squeeze',
  phase: 'began' | 'changed' | 'ended' | 'cancelled', // taps are always 'ended'
  action: 'ignore' | 'switchEraser' | 'switchPrevious' | 'showColorPalette'
        | 'showInkAttributes' | 'showContextualPalette' | 'runSystemShortcut',
  hover?: { x: number; y: number } } // iPadOS 17.5+, Pencil hovering
```

`action` is the user's choice in Settings → Apple Pencil (`preferredTapAction`,
`preferredSqueezeAction`); the app follows it instead of picking its own. `getPreferences()`
returns both.

The web side is `apps/demo/src/editor/ink/pencil.ts`: `connectPencil()` subscribes when
`window.Capacitor.Plugins.PencilInteraction` exists (it does nothing in a browser), and
`pencilCommand()` maps the action to "toggle eraser", "previous tool" or "show the pen
toolbar". The app doesn't import `@capacitor/core` for this, so the web build has no
Capacitor dependency.

## Adding it to the iOS shell

1. Add this directory as a local npm dependency of the shell (or as a Swift package via
   `Package.swift`), then `npx cap sync ios`.
2. Build with Xcode 16 or later (the 17.5 delegate methods need the iOS 17.5 SDK).
   Deployment target iOS 14.

Hardware: double-tap needs Apple Pencil 2nd generation or Apple Pencil Pro; squeeze needs
Apple Pencil Pro. The hover position is only sent when the iPad supports Pencil hover.
