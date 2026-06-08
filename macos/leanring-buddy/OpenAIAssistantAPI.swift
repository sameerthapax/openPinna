//
//  OpenAIAssistantAPI.swift
//  openPinna Desktop backend assistant client
//

import Foundation

enum MacOSAssistantRequestKind: String {
    case assistantReply = "assistant_reply"
    case pointingCoordinate = "pointing_coordinate"
    case pointingVerify = "pointing_verify"
}

/// Backend assistant helper. The desktop app talks only to the local openPinna backend.
class OpenAIAssistantAPI {
    private static let tlsWarmupLock = NSLock()
    private static var hasStartedTLSWarmup = false
    private static let transientRetryStatusCodes = Set(500...599)

    private let apiURL: URL
    var model: String
    private let session: URLSession
    var assistantMode: String = "normal"
    var researchProjectId: String?

    init(proxyURL: String, model: String = "gpt-5.4") {
        self.apiURL = URL(string: proxyURL)!
        self.model = model

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 120
        config.timeoutIntervalForResource = 300
        config.waitsForConnectivity = true
        config.urlCache = nil
        config.httpCookieStorage = nil
        self.session = URLSession(configuration: config)

        warmUpTLSConnectionIfNeeded()
    }

    private func makeAPIRequest() -> URLRequest {
        var request = URLRequest(url: apiURL)
        request.httpMethod = "POST"
        request.timeoutInterval = 120
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return request
    }

    private func detectImageMediaType(for imageData: Data) -> String {
        if imageData.count >= 4 {
            let pngSignature: [UInt8] = [0x89, 0x50, 0x4E, 0x47]
            let firstFourBytes = [UInt8](imageData.prefix(4))
            if firstFourBytes == pngSignature {
                return "image/png"
            }
        }

        return "image/jpeg"
    }

    private func warmUpTLSConnectionIfNeeded() {
        Self.tlsWarmupLock.lock()
        let shouldStartTLSWarmup = !Self.hasStartedTLSWarmup
        if shouldStartTLSWarmup {
            Self.hasStartedTLSWarmup = true
        }
        Self.tlsWarmupLock.unlock()

        guard shouldStartTLSWarmup else { return }
        guard var warmupURLComponents = URLComponents(url: apiURL, resolvingAgainstBaseURL: false) else {
            return
        }

        warmupURLComponents.path = "/"
        warmupURLComponents.query = nil
        warmupURLComponents.fragment = nil

        guard let warmupURL = warmupURLComponents.url else {
            return
        }

        var warmupRequest = URLRequest(url: warmupURL)
        warmupRequest.httpMethod = "HEAD"
        warmupRequest.timeoutInterval = 10
        session.dataTask(with: warmupRequest) { _, _, _ in
            // Warm the local backend connection; response body is irrelevant.
        }.resume()
    }

    func analyzeImageStreaming(
        images: [(data: Data, label: String)],
        systemPrompt: String,
        conversationHistory: [(userPlaceholder: String, assistantResponse: String)] = [],
        userPrompt: String,
        assistantModeOverride: String? = nil,
        requestKind: MacOSAssistantRequestKind = .assistantReply,
        onTextChunk: @MainActor @Sendable (String) -> Void
    ) async throws -> (text: String, duration: TimeInterval) {
        let startTime = Date()
        let responseText = try await performAnalyzeImageRequest(
            images: images,
            systemPrompt: systemPrompt,
            conversationHistory: conversationHistory,
            userPrompt: userPrompt,
            assistantModeOverride: assistantModeOverride,
            requestKind: requestKind
        )

        await onTextChunk(responseText)
        let duration = Date().timeIntervalSince(startTime)
        return (text: responseText, duration: duration)
    }

    func analyzeImage(
        images: [(data: Data, label: String)],
        systemPrompt: String,
        conversationHistory: [(userPlaceholder: String, assistantResponse: String)] = [],
        userPrompt: String,
        assistantModeOverride: String? = nil,
        requestKind: MacOSAssistantRequestKind = .assistantReply
    ) async throws -> (text: String, duration: TimeInterval) {
        try await analyzeImageStreaming(
            images: images,
            systemPrompt: systemPrompt,
            conversationHistory: conversationHistory,
            userPrompt: userPrompt,
            assistantModeOverride: assistantModeOverride,
            requestKind: requestKind,
            onTextChunk: { _ in }
        )
    }

    private func performAnalyzeImageRequest(
        images: [(data: Data, label: String)],
        systemPrompt: String,
        conversationHistory: [(userPlaceholder: String, assistantResponse: String)],
        userPrompt: String,
        assistantModeOverride: String?,
        requestKind: MacOSAssistantRequestKind
    ) async throws -> String {
        let maxAttempts = 2

        for attempt in 1...maxAttempts {
            do {
                return try await sendAnalyzeImageRequest(
                    images: images,
                    systemPrompt: systemPrompt,
                    conversationHistory: conversationHistory,
                    userPrompt: userPrompt,
                    assistantModeOverride: assistantModeOverride,
                    requestKind: requestKind
                )
            } catch {
                guard attempt < maxAttempts, shouldRetryAssistantRequest(error) else {
                    throw error
                }

                let retryDelayNanoseconds = UInt64(300_000_000 * attempt)
                print("⚠️ OpenAIAssistantAPI: transient assistant error, retrying attempt \(attempt + 1) after \(retryDelayNanoseconds / 1_000_000)ms")
                try await Task.sleep(nanoseconds: retryDelayNanoseconds)
            }
        }

        throw NSError(
            domain: "OpenAIAssistantAPI",
            code: -1,
            userInfo: [NSLocalizedDescriptionKey: "Assistant request failed after retries."]
        )
    }

    private func sendAnalyzeImageRequest(
        images: [(data: Data, label: String)],
        systemPrompt: String,
        conversationHistory: [(userPlaceholder: String, assistantResponse: String)],
        userPrompt: String,
        assistantModeOverride: String?,
        requestKind: MacOSAssistantRequestKind
    ) async throws -> String {
        var request = makeAPIRequest()

        let screenshots: [[String: Any]] = images.map { image in
            [
                "filename": "screen.jpg",
                "mimeType": detectImageMediaType(for: image.data),
                "base64Data": image.data.base64EncodedString(),
                "label": image.label
            ]
        }

        var body: [String: Any] = [
            "mode": assistantModeOverride ?? assistantMode,
            "requestKind": requestKind.rawValue,
            "transcript": userPrompt,
            "userPrompt": userPrompt,
            "sourceMetadata": [
                "desktopAssistantModel": model,
                "desktopSystemPrompt": systemPrompt
            ],
            "captureOrigin": "clicky",
            "screenshots": screenshots
        ]

        if let researchProjectId, !researchProjectId.isEmpty {
            body["projectId"] = researchProjectId
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NSError(
                domain: "OpenAIAssistantAPI",
                code: -1,
                userInfo: [NSLocalizedDescriptionKey: "Invalid HTTP response"]
            )
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let errorBody = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw NSError(
                domain: "OpenAIAssistantAPI",
                code: httpResponse.statusCode,
                userInfo: [NSLocalizedDescriptionKey: "API Error (\(httpResponse.statusCode)): \(errorBody)"]
            )
        }

        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let fallbackResponse = requestKind == .assistantReply
            ? "I couldn't generate a response."
            : "{}"
        return (json?["spokenText"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            ?? fallbackResponse
    }

    private func shouldRetryAssistantRequest(_ error: Error) -> Bool {
        let nsError = error as NSError
        if Self.transientRetryStatusCodes.contains(nsError.code) {
            return true
        }

        let message = nsError.localizedDescription.lowercased()
        return message.contains("status 503")
            || message.contains("status 502")
            || message.contains("status 504")
            || message.contains("temporar")
    }
}
