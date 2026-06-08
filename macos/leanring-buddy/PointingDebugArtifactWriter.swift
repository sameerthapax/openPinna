//
//  PointingDebugArtifactWriter.swift
//  leanring-buddy
//
//  Writes optional annotated screenshot artifacts so pointer drift can be
//  diagnosed from captured images instead of log output alone.
//

import AppKit
import Foundation

enum PointingDebugArtifactWriter {
    private static let enabledUserDefaultsKey = "openPinnaPointingDebugArtifactsEnabled"

    static var isEnabled: Bool {
        UserDefaults.standard.bool(forKey: enabledUserDefaultsKey)
    }

    static func writeAnnotatedImage(
        imageData: Data,
        point: CGPoint,
        label: String,
        context: String
    ) {
        guard isEnabled,
              let baseImage = NSImage(data: imageData),
              let bitmap = NSBitmapImageRep(data: imageData) else {
            return
        }

        let imageSize = NSSize(width: bitmap.pixelsWide, height: bitmap.pixelsHigh)
        let annotatedImage = NSImage(size: imageSize)
        annotatedImage.lockFocus()
        baseImage.draw(in: NSRect(origin: .zero, size: imageSize))

        let markerRect = NSRect(x: point.x - 8, y: imageSize.height - point.y - 8, width: 16, height: 16)
        NSColor.systemRed.setStroke()
        let circle = NSBezierPath(ovalIn: markerRect)
        circle.lineWidth = 3
        circle.stroke()

        let crosshair = NSBezierPath()
        crosshair.lineWidth = 2
        crosshair.move(to: NSPoint(x: point.x - 18, y: imageSize.height - point.y))
        crosshair.line(to: NSPoint(x: point.x + 18, y: imageSize.height - point.y))
        crosshair.move(to: NSPoint(x: point.x, y: imageSize.height - point.y - 18))
        crosshair.line(to: NSPoint(x: point.x, y: imageSize.height - point.y + 18))
        crosshair.stroke()

        let text = "\(context) | \(label) @ (\(Int(point.x)), \(Int(point.y)))"
        let textAttributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 18, weight: .medium),
            .foregroundColor: NSColor.white,
            .backgroundColor: NSColor.black.withAlphaComponent(0.75)
        ]
        text.draw(at: NSPoint(x: 16, y: 16), withAttributes: textAttributes)
        annotatedImage.unlockFocus()

        guard let tiffData = annotatedImage.tiffRepresentation,
              let outputBitmap = NSBitmapImageRep(data: tiffData),
              let pngData = outputBitmap.representation(using: .png, properties: [:]) else {
            return
        }

        let sanitizedContext = context
            .lowercased()
            .replacingOccurrences(of: " ", with: "-")
            .replacingOccurrences(of: "/", with: "-")
        let fileName = "pointing-\(sanitizedContext)-\(Int(Date().timeIntervalSince1970)).png"
        let outputURL = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(fileName)

        do {
            try pngData.write(to: outputURL)
            print("🪵 Pointing debug artifact: \(outputURL.path)")
        } catch {
            print("⚠️ PointingDebugArtifactWriter: failed to write artifact: \(error)")
        }
    }
}
