// SPDX-License-Identifier: AGPL-3.0-only
//
// Apple Pencil double-tap (2nd generation and Pro) and squeeze (Pro only)
// for the Lucid Sentence web view. Web content never receives these gestures, so the
// plugin attaches a UIPencilInteraction to the WKWebView and forwards each one to JS
// as a "pencilInteraction" event, together with the action the user chose in
// Settings > Apple Pencil. The JS side is apps/demo/src/editor/ink/pencil.ts.
//
// TODO(ios-shell): this file has NOT been compiled. It was written on a Linux box with
// no Xcode, and the Capacitor iOS shell (apps/mobile) does not exist yet. Before
// relying on it: add the package to the shell, build with Xcode 16+, and check on an
// iPad with a 2nd-gen Pencil (double-tap) and a Pencil Pro (squeeze, hover pose):
//   - events arrive while the web view is first responder and while a text field
//     has focus;
//   - hoverPose.location (web view points) lines up with CSS clientX/clientY when
//     the page is scrolled and pinch-zoomed;
//   - the system squeeze palette does not also appear when we show our toolbar.

import Capacitor
import UIKit

@objc(PencilInteractionPlugin)
public class PencilInteractionPlugin: CAPPlugin, CAPBridgedPlugin, UIPencilInteractionDelegate {
    public let identifier = "PencilInteractionPlugin"
    public let jsName = "PencilInteraction"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPreferences", returnType: CAPPluginReturnPromise)
    ]

    private var interaction: UIPencilInteraction?

    override public func load() {
        DispatchQueue.main.async { [weak self] in
            guard let self, let webView = self.bridge?.webView else { return }
            let interaction = UIPencilInteraction()
            interaction.delegate = self
            webView.addInteraction(interaction)
            self.interaction = interaction
        }
    }

    deinit {
        if let interaction {
            DispatchQueue.main.async { interaction.view?.removeInteraction(interaction) }
        }
    }

    @objc func getPreferences(_ call: CAPPluginCall) {
        var squeeze = "ignore"
        if #available(iOS 17.5, *) {
            squeeze = Self.name(UIPencilInteraction.preferredSqueezeAction)
        }
        call.resolve([
            "tap": Self.name(UIPencilInteraction.preferredTapAction),
            "squeeze": squeeze,
        ])
    }

    // MARK: UIPencilInteractionDelegate

    /// iPadOS 12.1–17.4. On 17.5+ UIKit calls `didReceiveTap` instead.
    public func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
        emit(kind: "tap", phase: "ended", action: UIPencilInteraction.preferredTapAction, hover: nil)
    }

    @available(iOS 17.5, *)
    public func pencilInteraction(
        _ interaction: UIPencilInteraction, didReceiveTap tap: UIPencilInteraction.Tap
    ) {
        emit(
            kind: "tap", phase: "ended", action: UIPencilInteraction.preferredTapAction,
            hover: tap.hoverPose?.location)
    }

    @available(iOS 17.5, *)
    public func pencilInteraction(
        _ interaction: UIPencilInteraction, didReceiveSqueeze squeeze: UIPencilInteraction.Squeeze
    ) {
        let phase: String
        switch squeeze.phase {
        case .began: phase = "began"
        case .changed: phase = "changed"
        case .ended: phase = "ended"
        case .cancelled: phase = "cancelled"
        @unknown default: phase = "cancelled"
        }
        emit(
            kind: "squeeze", phase: phase, action: UIPencilInteraction.preferredSqueezeAction,
            hover: squeeze.hoverPose?.location)
    }

    // MARK: Helpers

    private func emit(kind: String, phase: String, action: UIPencilPreferredAction, hover: CGPoint?) {
        var data: [String: Any] = ["kind": kind, "phase": phase, "action": Self.name(action)]
        if let hover {
            // TODO(ios-shell): convert for web view scroll offset and page zoom if needed.
            data["hover"] = ["x": hover.x, "y": hover.y]
        }
        notifyListeners("pencilInteraction", data: data)
    }

    /// Matches `PencilAction` in pencil.ts.
    private static func name(_ action: UIPencilPreferredAction) -> String {
        switch action {
        case .ignore: return "ignore"
        case .switchEraser: return "switchEraser"
        case .switchPrevious: return "switchPrevious"
        case .showColorPalette: return "showColorPalette"
        default:
            if #available(iOS 17.5, *) {
                switch action {
                case .showInkAttributes: return "showInkAttributes"
                case .showContextualPalette: return "showContextualPalette"
                case .runSystemShortcut: return "runSystemShortcut"
                default: break
                }
            }
            return "ignore"
        }
    }
}
