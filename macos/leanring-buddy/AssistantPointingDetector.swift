//
//  AssistantPointingDetector.swift
//  leanring-buddy
//
//  Runs a separate structured vision pass for screen pointing so the spoken
//  assistant response does not need to carry pixel coordinates inline.
//

import CoreGraphics
import Foundation

struct AssistantPointingCoordinate {
    let point: CGPoint
    let label: String
}

final class AssistantPointingDetector {
    private let assistantAPI: OpenAIAssistantAPI

    init(assistantAPI: OpenAIAssistantAPI) {
        self.assistantAPI = assistantAPI
    }

    func detectCoordinate(
        for capture: CompanionScreenCapture,
        userPrompt: String,
        spokenResponse: String,
        targetDescription: String,
        retry: Bool = false
    ) async -> AssistantPointingCoordinate? {
        let systemPrompt = """
        you are locating one visible ui target in a screenshot.

        return json only with exactly this shape:
        {"found":true,"x":640,"y":240,"label":"source control"}

        rules:
        - coordinates must be integer pixel coordinates in the image's actual pixel space
        - origin is top-left, x increases rightward, y increases downward
        - if the target is not visible, return {"found":false,"x":null,"y":null,"label":"target not visible"}
        - choose the center of the visible target, not its edge
        - keep the label short and specific
        - do not include markdown or extra keys
        \(retry ? "- the previous attempt likely missed vertically, so bias toward the visual center of the target." : "")
        """

        let prompt = """
        user said: "\(userPrompt)"
        assistant plans to say: "\(spokenResponse)"
        target description: "\(targetDescription)"

        find the best visible point for that target in this screenshot.
        """

        do {
            let response = try await assistantAPI.analyzeImage(
                images: [(data: capture.imageData, label: capture.labelWithDimensions)],
                systemPrompt: systemPrompt,
                conversationHistory: [],
                userPrompt: prompt,
                assistantModeOverride: "normal",
                requestKind: .pointingCoordinate
            )
            return Self.parsePointingCoordinate(from: response.text)
        } catch {
            print("⚠️ AssistantPointingDetector: coordinate request failed: \(error)")
            return nil
        }
    }

    func verifyCoordinate(
        cropImageData: Data,
        expectedLabel: String
    ) async -> Bool {
        let systemPrompt = """
        you are verifying whether a crop is centered on the intended ui target.

        return json only with exactly this shape:
        {"valid":true}

        rules:
        - valid means the intended target is clearly visible near the center of the crop
        - if the target is missing, ambiguous, or noticeably off-center, return {"valid":false}
        - do not include markdown or extra keys
        """

        let prompt = """
        intended target label: "\(expectedLabel)"

        is the intended target clearly near the center of this crop?
        """

        do {
            let response = try await assistantAPI.analyzeImage(
                images: [(data: cropImageData, label: "verification crop")],
                systemPrompt: systemPrompt,
                conversationHistory: [],
                userPrompt: prompt,
                assistantModeOverride: "normal",
                requestKind: .pointingVerify
            )
            return Self.parseVerificationResult(from: response.text) ?? false
        } catch {
            print("⚠️ AssistantPointingDetector: verification request failed: \(error)")
            return false
        }
    }

    private static func parsePointingCoordinate(from text: String) -> AssistantPointingCoordinate? {
        guard let json = extractJSONObject(from: text),
              let object = try? JSONSerialization.jsonObject(with: json) as? [String: Any],
              let found = object["found"] as? Bool,
              found else {
            return nil
        }

        let x = object["x"] as? Double
            ?? (object["x"] as? NSNumber)?.doubleValue
        let y = object["y"] as? Double
            ?? (object["y"] as? NSNumber)?.doubleValue
        let label = (object["label"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)

        guard let x, let y, let label, !label.isEmpty else { return nil }
        return AssistantPointingCoordinate(point: CGPoint(x: x, y: y), label: label)
    }

    private static func parseVerificationResult(from text: String) -> Bool? {
        guard let json = extractJSONObject(from: text),
              let object = try? JSONSerialization.jsonObject(with: json) as? [String: Any],
              let valid = object["valid"] as? Bool else {
            return nil
        }

        return valid
    }

    private static func extractJSONObject(from text: String) -> Data? {
        guard let startIndex = text.firstIndex(of: "{"),
              let endIndex = text.lastIndex(of: "}") else {
            return nil
        }

        let jsonString = String(text[startIndex...endIndex])
        return jsonString.data(using: .utf8)
    }
}
