# Tablet, stylus, and Notes mode

How Lucid Sentence handles tablets (iPad, Galaxy Tab and other Android tablets),
pens (Apple Pencil, S Pen, other active styluses), and Notes mode.

Status, October 2026: everything under **"In the web demo today"** runs in
`apps/demo` and is covered by Playwright tests (`e2e/pen.spec.ts`,
`e2e/notes.spec.ts`). Everything under **"Native plan"** is design work for the
mobile shell (`apps/mobile`) and has **not** been built yet.

Platform facts are tagged:

- **Verified**: checked against the vendor's documentation (linked; read 2026-10-08).
- **Unverified**: our expectation; must be tested on real devices before we rely on it.

---

## 1. Tablet layout (768–1366 px)

In the web demo today:

- The ribbon has three layouts: desktop, tablet (touch: one row of groups, larger
  targets, overflow menus) and phone (dock + bottom sheet). In `auto` mode the
  layout follows width: under 700 px is phone, under 1100 px is tablet.
- A touch-first device keeps the tablet layout up to 1500 px wide. "Touch-first"
  means the CSS media query `(any-pointer: coarse) and (not (any-pointer: fine))`
  matches. So an iPad Pro 13" in landscape (1366–1376 pt wide) or a Galaxy Tab in
  landscape gets the touch ribbon. Attach a trackpad or mouse and it switches to the
  desktop ribbon, which suits pointer use.
- On touch devices (`hover: none`), buttons, tabs, and menu items are at least
  44 × 44 px.
- On tablet portrait widths (700–1023 px) the title bar drops the shortcut hint and
  lets the document name shrink, so it stays on one line.
- The document zooms to fit the width when the window is narrower than the page plus
  the comments column. The comments column takes space only when the document has
  comments.

Screenshots: `tablet-portrait.png` (iPad 11" portrait, 834 × 1194 pt at 2×) and
`tablet-landscape-draw.png` (iPad Pro 12.9" landscape, 1366 × 1024 pt at 2×).

## 2. Pen input in the web demo

Source: `apps/demo/src/editor/ink.ts`. It is built on Pointer Events, so the same
code handles Apple Pencil in Safari, S Pen in Chrome on Android, and Windows pens.

| Behavior               | How it works                                                                                                                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pressure               | `PointerEvent.pressure` drives stroke width (perfect-freehand). Mouse and touch input simulate pressure from speed.                                                                                                                                               |
| Tilt                   | `tiltX` / `tiltY` widen the pencil tool's line, like shading with a tilted pencil.                                                                                                                                                                                |
| Smooth fast strokes    | `getCoalescedEvents()` adds the in-between samples the browser coalesced into one event.                                                                                                                                                                          |
| Hover preview          | A pen `pointermove` with `buttons === 0` shows a dot (or an eraser ring) where the nib will land.                                                                                                                                                                 |
| Barrel / eraser button | A pen held with `buttons & 2` (barrel) or `buttons & 32` (eraser end) erases while held, then returns to the previous tool. Verified: Pointer Events defines the eraser button as `buttons` bit 32 ([W3C Pointer Events](https://www.w3.org/TR/pointerevents3/)). |
| Palm rejection         | Touches are ignored while a pen is in contact, hovering, or was used in the last 700 ms. Rejected touches are counted for diagnostics.                                                                                                                            |
| Draw with Touch        | Draw → Draw with Touch lets a finger draw. When it is off, one finger scrolls and only a pen draws.                                                                                                                                                               |
| Auto-switch            | Touching the page with a pen while not drawing switches to the last pen tool (setting: "Switch to drawing when a pen touches the page", on by default, stored on this device).                                                                                    |
| Undo / redo            | Ink operations go into the same undo history as text (Ctrl+Z / Ctrl+Y and the Quick Access Toolbar).                                                                                                                                                              |
| Tools                  | Pen, pencil, highlighter, stroke eraser, point eraser, lasso select (move, delete). A floating pen toolbar with favorites can be dragged anywhere.                                                                                                                |

Tests drive real pen events through the Chrome DevTools Protocol
(`Input.dispatchMouseEvent` with `pointerType: "pen"`, force and tilt) and touch
events for palm rejection; see `e2e/helpers.ts`.

Unverified (needs real devices): whether iPadOS Safari reports Apple Pencil hover as
pen `pointermove` events with `buttons === 0`, and which S Pen button bits Chrome
on Android reports. The demo handles both cases but has only been tested through
emulated events.

## 3. Native plan: Android (S Pen and other styluses)

Verified ([Android: advanced stylus features](https://developer.android.com/develop/ui/views/touch-and-input/stylus-input/advanced-stylus-features)):

- `MotionEvent.getToolType()` returns `TOOL_TYPE_STYLUS` for a pen and
  `TOOL_TYPE_ERASER` when the stylus is used as an eraser.
- Axis data: `AXIS_PRESSURE`, `AXIS_ORIENTATION`, `AXIS_TILT` (radians, 0 is
  perpendicular) and `AXIS_DISTANCE` (hover distance; the doc warns that values vary
  by device, so don't rely on exact numbers).
- Palm rejection: the system sends `ACTION_CANCEL`, or `FLAG_CANCELED` (Android 13,
  API 33) on the pointer-up, and the app must remove that stroke and redraw.
- Low latency: the Jetpack low-latency graphics library (`androidx.graphics`) does
  front-buffer rendering with `GLFrontBufferedRenderer` (Android 10 / API 29+). The
  doc recommends it for small areas such as handwriting, not full-screen redraws.
  `requestUnbufferedDispatch()` delivers input without batching.
- Motion prediction: `androidx.input:input-motionprediction` (`MotionEventPredictor`)
  predicts points; predicted points must be replaced by real ones.
- Android 14 (API 34) adds the `ACTION_CREATE_NOTE` intent for note-taking apps.

Verified ([Jetpack Ink releases](https://developer.android.com/jetpack/androidx/releases/ink)):
`androidx.ink` is stable at 1.0.0; the latest alpha is 1.1.0-alpha09
(September 23, 2026). It has authoring, brush, geometry, rendering and storage
modules. Plan: evaluate `androidx.ink` for the native Android canvas against
front-buffered rendering of our own stroke model.

Verified ([S Pen Remote SDK](https://developer.samsung.com/galaxy-spen-remote/s-pen-remote-sdk.html)):
Samsung's S Pen Remote SDK reports S Pen button presses (`ButtonEvent`
`ACTION_DOWN` / `ACTION_UP` through `SpenUnitManager`) and Air Actions gestures.
This is for the pen's remote (Bluetooth) button. On-screen drawing with an S Pen
uses the standard `MotionEvent` APIs above.

Plan: map the S Pen side button to "erase while held" (as in the web demo), and
Air Actions to undo/redo and tool switching, as user-configurable options.

## 4. Native plan: iPadOS (Apple Pencil)

Verified:

- **PencilKit**: `PKCanvasView` and `PKToolPicker` give a system canvas and tool
  palette. Each `PKStrokePoint` has location, time offset, size, opacity, force,
  azimuth and altitude ([PKStrokePoint](https://developer.apple.com/documentation/pencilkit/pkstrokepoint)).
  `PKDrawing.dataRepresentation()` is an opaque format
  ([docs](<https://developer.apple.com/documentation/pencilkit/pkdrawing-swift.struct/datarepresentation()>)),
  so we keep our own stroke model as the source of truth and convert.
- **Double-tap and squeeze**: `UIPencilInteraction` tells the app about a double tap
  or a squeeze. `preferredTapAction` and `preferredSqueezeAction` hold the user's
  choice from Settings. Only Apple Pencil Pro supports squeeze; the first-generation
  Apple Pencil supports neither
  ([Apple Pencil interactions](https://developer.apple.com/documentation/uikit/apple-pencil-interactions),
  [UIPencilInteraction](https://developer.apple.com/documentation/uikit/uipencilinteraction)).
- **Hover**: from iPadOS 16.1, `UIHoverGestureRecognizer.zOffset` gives the
  normalized hover distance (0 near the screen, 1 at the maximum distance; 0 for
  devices without support)
  ([Adopting hover support for Apple Pencil](https://developer.apple.com/documentation/uikit/adopting-hover-support-for-apple-pencil)).
- **Scribble**: `UIScribbleInteraction` customizes or turns off Scribble on a text
  input (for example while drawing), and `UIIndirectScribbleInteraction` makes
  non-text views writable
  ([UIScribbleInteraction](https://developer.apple.com/documentation/uikit/uiscribbleinteraction),
  [WWDC20: Meet Scribble for iPad](https://developer.apple.com/videos/play/wwdc2020/10106/)).

Plan: honor the user's double-tap and squeeze preferences (switch to eraser, show
the pen toolbar at the hover position), show the hover preview, and turn Scribble
off over the ink canvas so writing there stays ink. Whether Scribble works inside
the engine's editing surface in the iOS WebView is **unverified** and must be
tested in the M0 mobile go/no-go.

---

## 5. Notes mode

Notes mode turns the page into a notebook page for handwritten and typed notes,
with an optional audio recording kept in sync. Open it with the **Notes** button in
the title bar, or `?notes=1` in the demo URL.

In the web demo today:

- **Paper**: blank, lined (with a margin rule), grid, or dotted; paper colors white,
  cream, mist, and night. The lined spacing matches the text line height, so typing
  sits on the lines.
- **Write / Type**: Write makes the pen (or finger, with Draw with Touch) draw; Type
  puts the caret back in the text. Both stay on the same page.
- **Floating pen toolbar**: pen, pencil, highlighter, eraser, lasso; seven colors;
  three sizes; save the current pen as a favorite (stored on this device). Drag the
  handle to move it.
- **Magnifier**: a strip that shows a zoomed copy of part of the page. Writing in
  the strip draws on the page at the normal size, for small handwriting.
- **Audio**: Record uses the microphone (`getUserMedia` + `MediaRecorder`). While
  recording, every new stroke and every paragraph you type is stamped with the
  recording time. The timeline under the page shows a mark for each. Tapping a
  stroke, a typed paragraph, or a timeline mark plays the recording from just before
  that moment. Recordings are stored only in this browser (IndexedDB); nothing is
  uploaded.
- **Stubs**: "Convert to text" and "Search ink" show a message; recognition is not
  built yet (see section 7).

Saving in the demo: Ctrl+S stores the page and its strokes in this browser's
`localStorage`. `.docx` save comes with the engine, using the plan below.

Screenshots: `notes-mode-ipad-2732x2048.png` (iPad Pro 12.9", 2732 × 2048) and
`notes-mode-galaxy-tab-2560x1600.png` (Galaxy Tab S-series, 2560 × 1600). The
handwriting in these screenshots was drawn through the ink API from a script
(strokes traced from a handwriting font), not written by hand on a device.

## 6. DOCX ink round-trip plan

Goal: ink drawn in Lucid Sentence opens as ink in Word, and ink from Word opens as
ink in Lucid Sentence, with no loss of what each side supports.

Verified ([MS-ODRAWXML 2.1: Ink Content Part](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/096dacae-0d2c-4861-bc4d-c8e4c6405ad3),
[W3C InkML](https://www.w3.org/TR/InkML/)):

- An ink part has content type `application/inkml+xml` and is the target of a
  `http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml`
  relationship.
- In a WordprocessingML document it is referenced by a `contentPart` element (ISO/IEC
  29500-1 §17.3.3.2, or the WordprocessingML Drawing `contentPart`, MS-ODRAWXML
  §2.3.1.3).
- The part's root element is `ink` in the `http://www.w3.org/2003/InkML` namespace,
  and Office supports a documented subset of InkML (`traceFormat` inside
  `inkSource`, `channel` elements, and so on).

Plan:

1. **Write**: each group of strokes becomes one InkML part. Channels X, Y, and F
   (force) plus T (time) when the stroke has a time; brush color and width go in a
   `brush`. A `contentPart` anchors it to the paragraph or page.
2. **Fallback**: also write a rendered picture so readers without ink support still
   show the strokes.
3. **Read**: parse InkML traces back into our stroke model. Keep any unknown InkML
   or relationship we don't understand byte-for-byte, so saving doesn't drop it.
4. **Audio**: recordings stay outside the `.docx` by default (a side file next to
   the document). Embedding is an option to evaluate later.
5. **Test**: round-trip fixtures in the fidelity suite (`eval/`): Word → us → Word
   and us → Word → us, comparing stroke count, bounds, color and width.

Unverified (must be checked against files saved by current Word builds during the
M0 bake-off): the exact `mc:AlternateContent` wrapper and fallback Word writes
around ink in `.docx`; whether Word keeps per-point force and time channels when it
re-saves; how Word anchors ink (inline versus floating); and whether Word keeps a
side-car audio relationship it doesn't understand.

## 7. On-device recognition plan (handwriting to text, ink search)

Principle: recognition runs on the device. No ink, audio, or text leaves it, and
there is no account or network call. This matches the project's
no-telemetry rule.

Verified ([ML Kit digital ink recognition](https://developers.google.com/ml-kit/vision/digital-ink-recognition)):
ML Kit's digital ink recognition runs on-device on Android and iOS after a
per-language model download (about 20 MB per language, according to Google's
documentation). It takes strokes with timestamps, recognizes handwriting in many
languages, and can classify some gestures and shapes.

Plan:

- Android and iOS: ML Kit digital ink recognition for "Convert to text" and for an
  ink search index. Downloading a language model is an explicit, user-started
  action. It is the one network call, and it is shown to the user before it happens.
- iPadOS text input: Scribble (system feature) for writing into text fields.
- Desktop and web: no recognizer is bundled yet. Options to evaluate are a local
  model in WebAssembly or the native shell's recognizer. Until then the buttons stay
  stubs.
- Audio transcription is not planned for v1.

Unverified: recognition quality on mixed text and drawings, latency on low-end
tablets, and model sizes for every language we would ship. These are measured
before the feature leaves the stub state.
