// swift-tools-version: 5.9
// SPDX-License-Identifier: AGPL-3.0-only
import PackageDescription

let package = Package(
    name: "LucidSentenceCapacitorPencilInteraction",
    platforms: [.iOS(.v14)],
    products: [
        .library(
            name: "LucidSentenceCapacitorPencilInteraction",
            targets: ["PencilInteractionPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "7.0.0")
    ],
    targets: [
        .target(
            name: "PencilInteractionPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
            ],
            path: "ios/Sources/PencilInteractionPlugin")
    ]
)
