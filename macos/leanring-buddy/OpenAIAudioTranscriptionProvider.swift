//
//  OpenAIAudioTranscriptionProvider.swift
//  openPinna Desktop backend transcription client
//

import AVFoundation
import Foundation

struct OpenAIAudioTranscriptionProviderError: LocalizedError {
    let message: String

    var errorDescription: String? {
        message
    }
}

final class OpenAIAudioTranscriptionProvider: BuddyTranscriptionProvider {
    private let backendBaseURL = AppBundleConfiguration.backendBaseURL()
    private let modelName = AppBundleConfiguration.stringValue(forKey: "OpenAITranscriptionModel")
        ?? "gpt-4o-mini-transcribe"

    let displayName = "openPinna Backend"
    let requiresSpeechRecognitionPermission = false

    var isConfigured: Bool {
        URL(string: "\(backendBaseURL)/api/macos-assistant/transcribe") != nil
    }

    var unavailableExplanation: String? {
        guard !isConfigured else { return nil }
        return "OpenPinnaBackendBaseURL is not configured."
    }

    func startStreamingSession(
        keyterms: [String],
        onTranscriptUpdate: @escaping (String) -> Void,
        onFinalTranscriptReady: @escaping (String) -> Void,
        onError: @escaping (Error) -> Void
    ) async throws -> any BuddyStreamingTranscriptionSession {
        guard let transcriptionURL = URL(string: "\(backendBaseURL)/api/macos-assistant/transcribe") else {
            throw OpenAIAudioTranscriptionProviderError(
                message: unavailableExplanation ?? "OpenPinna transcription backend is not configured."
            )
        }

        return OpenAIAudioTranscriptionSession(
            transcriptionURL: transcriptionURL,
            modelName: modelName,
            keyterms: keyterms,
            onTranscriptUpdate: onTranscriptUpdate,
            onFinalTranscriptReady: onFinalTranscriptReady,
            onError: onError
        )
    }
}

private final class OpenAIAudioTranscriptionSession: BuddyStreamingTranscriptionSession {
    let finalTranscriptFallbackDelaySeconds: TimeInterval = 8.0
    private static let targetSampleRate = 16_000

    private let transcriptionURL: URL
    private let modelName: String
    private let keyterms: [String]
    private let onTranscriptUpdate: (String) -> Void
    private let onFinalTranscriptReady: (String) -> Void
    private let onError: (Error) -> Void

    private let stateQueue = DispatchQueue(label: "com.openpinna.desktop.transcription")
    private let stateQueueKey = DispatchSpecificKey<UUID>()
    private let stateQueueToken = UUID()
    private let audioPCM16Converter = BuddyPCM16AudioConverter(
        targetSampleRate: Double(targetSampleRate)
    )
    private let urlSession: URLSession

    private var bufferedPCM16AudioData = Data()
    private var hasRequestedFinalTranscript = false
    private var hasDeliveredFinalTranscript = false
    private var isCancelled = false
    private var transcriptionUploadTask: Task<Void, Never>?

    init(
        transcriptionURL: URL,
        modelName: String,
        keyterms: [String],
        onTranscriptUpdate: @escaping (String) -> Void,
        onFinalTranscriptReady: @escaping (String) -> Void,
        onError: @escaping (Error) -> Void
    ) {
        self.transcriptionURL = transcriptionURL
        self.modelName = modelName
        self.keyterms = keyterms
        self.onTranscriptUpdate = onTranscriptUpdate
        self.onFinalTranscriptReady = onFinalTranscriptReady
        self.onError = onError

        let urlSessionConfiguration = URLSessionConfiguration.default
        urlSessionConfiguration.timeoutIntervalForRequest = 45
        urlSessionConfiguration.timeoutIntervalForResource = 90
        urlSessionConfiguration.waitsForConnectivity = true
        self.urlSession = URLSession(configuration: urlSessionConfiguration)
        self.stateQueue.setSpecific(key: stateQueueKey, value: stateQueueToken)
    }

    func appendAudioBuffer(_ audioBuffer: AVAudioPCMBuffer) {
        guard let audioPCM16Data = audioPCM16Converter.convertToPCM16Data(from: audioBuffer),
              !audioPCM16Data.isEmpty else {
            return
        }

        stateQueue.async {
            guard !self.hasRequestedFinalTranscript, !self.isCancelled else { return }
            self.bufferedPCM16AudioData.append(audioPCM16Data)
        }
    }

    func requestFinalTranscript() {
        stateQueue.async {
            guard !self.hasRequestedFinalTranscript, !self.isCancelled else { return }
            self.hasRequestedFinalTranscript = true

            let bufferedPCM16AudioData = self.bufferedPCM16AudioData
            self.transcriptionUploadTask = Task { [weak self] in
                await self?.transcribeBufferedAudio(bufferedPCM16AudioData)
            }
        }
    }

    func cancel() {
        let clearState = {
            self.isCancelled = true
            self.bufferedPCM16AudioData.removeAll(keepingCapacity: false)
        }

        if DispatchQueue.getSpecific(key: stateQueueKey) == stateQueueToken {
            clearState()
        } else {
            stateQueue.sync(execute: clearState)
        }

        transcriptionUploadTask?.cancel()
        transcriptionUploadTask = nil
        urlSession.invalidateAndCancel()
    }

    private func transcribeBufferedAudio(_ bufferedPCM16AudioData: Data) async {
        guard !Task.isCancelled else { return }

        let trimmedAudioDataIsEmpty = stateQueue.sync {
            isCancelled || bufferedPCM16AudioData.isEmpty
        }

        if trimmedAudioDataIsEmpty {
            deliverFinalTranscript("")
            return
        }

        let wavAudioData = BuddyWAVFileBuilder.buildWAVData(
            fromPCM16MonoAudio: bufferedPCM16AudioData,
            sampleRate: Self.targetSampleRate
        )

        do {
            let transcriptText = try await requestTranscription(for: wavAudioData)
            guard !stateQueue.sync(execute: { isCancelled }) else { return }

            if !transcriptText.isEmpty {
                onTranscriptUpdate(transcriptText)
            }

            deliverFinalTranscript(transcriptText)
        } catch {
            guard !stateQueue.sync(execute: { isCancelled }) else { return }
            onError(error)
        }
    }

    private func requestTranscription(for wavAudioData: Data) async throws -> String {
        let multipartBoundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: transcriptionURL)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(multipartBoundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = makeMultipartRequestBody(
            boundary: multipartBoundary,
            wavAudioData: wavAudioData
        )

        let (responseData, response) = try await urlSession.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw OpenAIAudioTranscriptionProviderError(
                message: "openPinna transcription returned an invalid response."
            )
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let responseText = String(data: responseData, encoding: .utf8) ?? "Unknown error"
            throw OpenAIAudioTranscriptionProviderError(
                message: "openPinna transcription failed: \(responseText)"
            )
        }

        guard let jsonObject = try JSONSerialization.jsonObject(with: responseData) as? [String: Any],
              let transcriptText = jsonObject["transcript"] as? String else {
            throw OpenAIAudioTranscriptionProviderError(
                message: "openPinna transcription returned an invalid payload."
            )
        }

        return transcriptText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func makeMultipartRequestBody(
        boundary: String,
        wavAudioData: Data
    ) -> Data {
        var requestBodyData = Data()

        requestBodyData.appendMultipartFormField(
            named: "model",
            value: modelName,
            usingBoundary: boundary
        )

        if let contextualPrompt = transcriptionPromptText() {
            requestBodyData.appendMultipartFormField(
                named: "languageHint",
                value: "en",
                usingBoundary: boundary
            )
            requestBodyData.appendMultipartFormField(
                named: "prompt",
                value: contextualPrompt,
                usingBoundary: boundary
            )
        }

        requestBodyData.appendMultipartFileField(
            named: "audio",
            filename: "voice-input.wav",
            mimeType: "audio/wav",
            fileData: wavAudioData,
            usingBoundary: boundary
        )
        requestBodyData.appendString("--\(boundary)--\r\n")

        return requestBodyData
    }

    private func transcriptionPromptText() -> String? {
        let normalizedKeyterms = keyterms
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        guard !normalizedKeyterms.isEmpty else { return nil }

        return """
        This is a short push-to-talk transcript for openPinna Desktop. Expect research, coding, and product vocabulary such as: \(normalizedKeyterms.joined(separator: ", ")).
        """
    }

    private func deliverFinalTranscript(_ transcriptText: String) {
        guard !hasDeliveredFinalTranscript else { return }
        hasDeliveredFinalTranscript = true
        onFinalTranscriptReady(transcriptText)
    }

    deinit {
        cancel()
    }
}

private extension Data {
    mutating func appendString(_ string: String) {
        append(string.data(using: .utf8)!)
    }

    mutating func appendMultipartFormField(
        named fieldName: String,
        value: String,
        usingBoundary boundary: String
    ) {
        appendString("--\(boundary)\r\n")
        appendString("Content-Disposition: form-data; name=\"\(fieldName)\"\r\n\r\n")
        appendString("\(value)\r\n")
    }

    mutating func appendMultipartFileField(
        named fieldName: String,
        filename: String,
        mimeType: String,
        fileData: Data,
        usingBoundary boundary: String
    ) {
        appendString("--\(boundary)\r\n")
        appendString("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(filename)\"\r\n")
        appendString("Content-Type: \(mimeType)\r\n\r\n")
        append(fileData)
        appendString("\r\n")
    }
}
