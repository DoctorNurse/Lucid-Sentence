# Tablet, stylus, and Notes mode

How Lucid Sentence handles tablets (iPad, Galaxy Tab and other Android tablets),
pens (Apple Pencil, S Pen, other active styluses), and Notes mode.

Status, October 2026: everything under **"In the web demo today"** runs in
`apps/demo` and is covered by Playwright tests (`e2e/pen.spec.ts`,
`e2e/stylus.spec.ts`, `e2e/notes.spec.ts`) and Vitest unit tests
(`apps/demo/test/ink-*.test.ts`). Everything under **"Native plan"** is design work for the
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

Source: `apps/demo/src/editor/ink.ts` (the layer) and `apps/demo/src/editor/ink/`
(model, input, palm rejection, geometry, rendering, InkML, Apple Pencil bridge). It is
built on Pointer Events, so the same code handles Apple Pencil in Safari, S Pen in
Chrome and the Android WebView, and Windows pens.

### Ink model

`ink/model.ts`. A stroke is `{ id, tool, color, size, points, pressure, source, shape,
t, rec }`; each point is `[x, y, pressure, tiltX, tiltY, t]` in page px, degrees and
milliseconds from the stroke's start. `pressure: true` means the device reported real
pressure; otherwise the width is simulated from speed. Tilt is stored per point, so a
pencil stroke keeps its width after undo, zoom, or reopening a draft.

For storage and interchange a stroke becomes `InkStroke` (brush, channel list
`x y p tx ty t`, and a `Float32Array` of samples). Drafts store version 1: a JSON
envelope with each stroke's samples as base64. Old drafts (version 0, `[x, y, p]`
points) still load.

### Input

| Behavior               | How it works                                                                                                                                                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pressure               | `PointerEvent.pressure` drives stroke width (perfect-freehand). Pressure 0 during contact (some Android WebViews) and the 0.5 default count as "no pressure"; when real pressure first arrives mid-stroke, earlier samples take it. Mouse and touch simulate pressure from speed.       |
| Tilt                   | `tiltX` / `tiltY`, or `altitudeAngle` / `azimuthAngle` (Safari), normalized both ways with the Pointer Events 3 formulas. The pencil widens as the pen leans (up to 2× at 30° or flatter).                                                                                              |
| Coalesced samples      | `getCoalescedEvents()` adds the samples the browser merged into one event, so fast strokes stay smooth.                                                                                                                                                                                 |
| Predicted samples      | `getPredictedEvents()` extends the live stroke toward where the pen is going, to hide latency. Predicted samples are drawn but never stored.                                                                                                                                            |
| Hover preview          | A pen `pointermove` with no contact shows a dot (or an eraser ring) where the nib will land.                                                                                                                                                                                            |
| Barrel / eraser button | Tracked for the whole hover → contact → lift cycle. Hovering with the barrel (`buttons & 2`) or the eraser end (`buttons & 32`, or `button === 5` on down) switches to the eraser until released. Pressed mid-stroke, the ink drawn so far is kept and the rest of that contact erases. |
| Straight lines         | Highlighter strokes that are nearly straight become exact lines (snapped to horizontal or vertical within 5°). Any pen or pencil stroke held still for 400 ms before lifting straightens too.                                                                                           |
| Draw with Touch        | Draw → Draw with Touch lets a finger draw. When it is off, one finger scrolls and only a pen draws.                                                                                                                                                                                     |
| Auto-switch            | Touching the page with a pen while not drawing switches to the last pen tool (setting, on by default, stored on this device).                                                                                                                                                           |
| Undo / redo            | Ink operations go into the same undo history as text (Ctrl+Z / Ctrl+Y and the Quick Access Toolbar).                                                                                                                                                                                    |
| Tools                  | Pen, pencil, highlighter, stroke eraser, point eraser, lasso select (move, delete). A floating pen toolbar with favorites.                                                                                                                                                              |

Verified: Pointer Events defines the eraser button as `buttons` bit 32 and the
tilt/angle conversions ([W3C Pointer Events](https://www.w3.org/TR/pointerevents3/)).

### Palm rejection

`ink/palm.ts`, in layers:

1. On a touch-first device fingers draw by default; the first real pen switches that
   off ("only the pen draws now").
2. Touches are ignored while a pen is touching or hovering, and for 700 ms after.
3. Once a pen has been seen, a touch with a contact larger than 48 px is a palm.
4. A finger stroke that a second finger follows within 300 ms was the start of a
   pinch: it is removed, and from the undo history too.
5. `pointercancel` (the OS or WebView took the gesture, often a palm) discards the
   stroke being drawn instead of keeping it.

### Rendering

`ink/render.ts`. Finished strokes are painted into canvases instead of one SVG path
each, so long notes stay fast:

- **Layers**, bottom to top: highlighters (under the text), the text, pen and pencil
  ink, the stroke being drawn, then the SVG overlay for hover, lasso and selection.
- **Tiles**: each layer is a column of 1024 px canvas tiles at the screen's pixel
  density (capped at 2.5×). Only tiles near the visible part of the page hold a
  bitmap; the rest are released.
- **Live stroke**: drawn on its own low-latency (`desynchronized`) canvas. Its outline
  is built incrementally: every 64 samples the head is frozen, and only the tail is
  re-outlined per event, so the cost per event stays flat however long the stroke is.
- **Highlighter**: each color has its own layer. Strokes are painted opaque inside it
  and the layer is faded once (38%, multiply blend; screen on night paper), so
  overlapping strokes of one color don't get darker, while different colors still mix.
- A vector copy of the ink stays in the SVG (`#ink-strokes`) for the magnifier strip
  and for tests.

### Tests

`e2e/stylus.spec.ts` runs at phone (412 × 915) and tablet (1024 × 1366) sizes. Pressure
and tilt come from Chrome DevTools Protocol pen input (`Input.dispatchMouseEvent` with
`pointerType: "pen"`, force and tilt). What CDP can't express (eraser bit 32,
`pointercancel`, coalesced and predicted lists, contact size, multi-finger timing) is
sent as synthetic `PointerEvent`s. Unit tests cover the conversions, button tracking,
palm rules, straight-line detection, the storage format, and InkML.

### Unverified on real devices

The engine has only been exercised with emulated events. To check on hardware:

- **S Pen (Galaxy S26, Tab S-series)**: which `buttons` bits the side button reports in
  Chrome and the Android WebView, during hover and contact; whether Air Command or
  the WebView's own handwriting takes the pen first; whether `pointercancel` arrives
  during normal pen strokes. If it does, strokes would now vanish (they used to be
  kept), so this is the first thing to test.
- **Apple Pencil (iPadOS Safari and WKWebView)**: hover as pen `pointermove` with no
  buttons; `altitudeAngle`/`azimuthAngle` values; `getPredictedEvents()` (Safari
  18.2+); whether Scribble takes strokes made over the text.
- **Latency**: the `desynchronized` canvas hint and prediction on real panels.
- **Palm size**: the 48 px threshold; `width`/`height` vary a lot by device.

### Credit

The palm-rejection layers, button tracking through the stroke, per-color highlighter
layers, hold-to-straighten, and tiled rendering were inspired by
[Saber](https://github.com/saber-notes/saber) (GPL-3.0), an open-source handwriting
app. Lucid Sentence uses its ideas only; no Saber code was copied or translated.
Stroke outlines use [perfect-freehand](https://github.com/steveruizok/perfect-freehand)
(MIT).

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

Built (not compiled yet): a Capacitor plugin in
`apps/mobile/plugins/pencil-interaction` attaches `UIPencilInteraction` to the web view
and sends each double-tap and squeeze, with the user's preferred action, to
`apps/demo/src/editor/ink/pencil.ts`, which switches to the eraser (and back), returns to
the previous tool, or shows the pen toolbar. It has not been built with Xcode or tried
on an iPad; the iOS shell doesn't exist yet.

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
- **Magnifier**: a strip just above the Notes bar shows a zoomed (2.5×) copy of a
  framed box on the page. Writing in the strip draws in that box at the normal size,
  for small handwriting; ↵ moves the box to the next line, and double-tapping the
  page moves it there. The strip sits in the layout, so it never covers the bar.
- **Audio**: Record uses the microphone (`getUserMedia` + `MediaRecorder`, webm/opus
  where supported, else mp4). While recording, every new stroke and every paragraph
  you type is stamped with the recording time. The timeline under the page shows a
  mark for each; drag along it to scrub. Tapping a stroke, a typed paragraph, or a
  timeline mark plays the recording from just before that moment. Recordings are
  stored only on this device (IndexedDB); nothing is uploaded. If the microphone
  can't start, a message says why (permission off, no microphone, busy).
  Android: the release build adds `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` to the
  generated manifest (`scripts/android-permissions.mjs`), so the WebView can ask
  for the microphone the first time you tap Record.
- **Convert to text** and **Search ink**: handwriting recognition on the device
  (section 7). Convert to text reads the selected ink (or all of it), shows the text
  to check and edit, then inserts it under the ink, replaces the ink, or copies it.
  Search ink finds words in your handwriting, selects the matching lines, and
  scrolls to them; one misread letter is tolerated in longer words.
- **Short screens** (a tablet in landscape, about 640 px tall): the ribbon collapses
  to its tab row while Notes mode is on and comes back when you leave it. The Notes
  bar is a single row that scrolls sideways, with Exit always visible.

Draw tab extras: **Ink to Shape** (a toggle) turns lines, triangles, rectangles,
other quadrilaterals, polygons up to 12 corners (stars included), circles, and
ellipses into clean shapes as you draw them, and converts selected strokes when you
turn it on. **Ink Replay** redraws the ink stroke by stroke (tap again to stop).
**Drawing Canvas** adds a framed space to the document and switches to the pen.
**Add Pen** saves a pen, pencil, or highlighter to the pen toolbar's favorites.
**Ink to Math** is not built yet and says so: it needs an on-device math model.

Taps on tablets: Android WebView sometimes drops the click after a touch or pen
press (after a fling, or when the pressed button was re-rendered). Every Notes,
pen-toolbar, timeline, status-bar, and header control now acts on the pointer
release itself (`tap()` in `apps/demo/src/editor/ui.ts`), and those bars update in
place instead of rebuilding under the finger.

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

Built behind a flag (`?inkdocx=1`, or `inkdocx` in the `lucid-sentence:flags`
setting): `apps/demo/src/editor/ink/inkml.ts` writes strokes as InkML (channels X, Y, F,
OTx, OTy, T at 1000 per cm; highlighter as `rasterOp="maskPen"`, pencil as
`inkEffects="pencil"`; our own fields such as tool and audio time in an `ls:` namespace)
and reads InkML back, including Office's difference-encoded traces. `buildInkDocxParts`
returns the ink part, its content type and relationship, and a run with an
`mc:AlternateContent` anchor (`wpi` content part, VML polyline fallback). Unit tests
round-trip strokes through InkML and the docx parts. Nothing calls it on save yet; that
waits for the engine's `.docx` writer (M1).

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
- Now (all platforms, 0.1.3-preview): the browser's own recognizer where it has one
  (the Handwriting Recognition API, `navigator.createHandwritingRecognizer`; mostly
  ChromeOS today), otherwise Tesseract compiled to WebAssembly (tesseract.js,
  Apache-2.0) with the English `best_int` model. All of it ships inside the app
  under `ocr/` (about 11 MB: worker, a SIMD and a plain engine, the 3 MB model) and
  loads on first use, so nothing is downloaded from another site and no ink leaves
  the device. Each line of ink is drawn black on white and read as one text line.
  The web app caches these files the first time they're used instead of at install.
  Quality: good on clear print and neat handwriting, weaker on fast cursive (it is
  an OCR model, not a stroke model). English only. When nothing can be read, the
  app says so and leaves the ink alone.
- Audio transcription is not planned for v1.

Unverified: recognition quality on real handwriting from a Galaxy Tab or iPad (tests
use block letters drawn through the pen API), latency on low-end tablets, and the
other languages we would ship. ML Kit (above) remains the plan for better accuracy
on Android and iOS.
