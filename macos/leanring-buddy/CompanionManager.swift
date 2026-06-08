//
//  CompanionManager.swift
//  leanring-buddy
//
//  Central state manager for the companion voice mode. Owns the push-to-talk
//  pipeline (dictation manager + global shortcut monitor + overlay) and
//  exposes observable voice state for the panel UI.
//

import AppKit
import AVFoundation
import Combine
import Foundation
import PostHog
import ScreenCaptureKit
import SwiftUI

enum CompanionVoiceState {
    case idle
    case listening
    case processing
    case responding
}

@MainActor
final class CompanionManager: ObservableObject {
    @Published private(set) var voiceState: CompanionVoiceState = .idle
    @Published private(set) var lastTranscript: String?
    @Published private(set) var currentAudioPowerLevel: CGFloat = 0
    @Published private(set) var hasAccessibilityPermission = false
    @Published private(set) var hasScreenRecordingPermission = false
    @Published private(set) var hasMicrophonePermission = false
    @Published private(set) var hasScreenContentPermission = false

    /// Screen location (global AppKit coords) of a detected UI element the
    /// buddy should fly to and point at. Observed by BlueCursorView to trigger
    /// the flight animation.
    @Published var detectedElementScreenLocation: CGPoint?
    /// The display frame (global AppKit coords) of the screen the detected
    /// element is on, so BlueCursorView knows which screen overlay should animate.
    @Published var detectedElementDisplayFrame: CGRect?
    /// Custom speech bubble text for the pointing animation. When set,
    /// BlueCursorView uses this instead of a random pointer phrase.
    @Published var detectedElementBubbleText: String?

    // MARK: - Onboarding Video State (shared across all screen overlays)

    @Published var onboardingVideoPlayer: AVPlayer?
    @Published var showOnboardingVideo: Bool = false
    @Published var onboardingVideoOpacity: Double = 0.0
    private var onboardingVideoEndObserver: NSObjectProtocol?
    private var onboardingDemoTimeObserver: Any?

    // MARK: - Onboarding Prompt Bubble

    /// Text streamed character-by-character on the cursor after the onboarding video ends.
    @Published var onboardingPromptText: String = ""
    @Published var onboardingPromptOpacity: Double = 0.0
    @Published var showOnboardingPrompt: Bool = false

    // MARK: - Onboarding Music

    private var onboardingMusicPlayer: AVAudioPlayer?
    private var onboardingMusicFadeTimer: Timer?

    let buddyDictationManager = BuddyDictationManager()
    let globalPushToTalkShortcutMonitor = GlobalPushToTalkShortcutMonitor()
    let overlayWindowManager = OverlayWindowManager()
    // Response text is now displayed inline on the cursor overlay via
    // streamingResponseText, so no separate response overlay manager is needed.

    /// Base URL for the local openPinna backend. The desktop app talks only
    /// to openPinna, which owns transcription, assistant responses, TTS, and research persistence.
    private static let backendBaseURL = AppBundleConfiguration.backendBaseURL()

    private lazy var openAIAssistantAPI: OpenAIAssistantAPI = {
        return OpenAIAssistantAPI(proxyURL: "\(Self.backendBaseURL)/api/macos-assistant/respond", model: selectedModel)
    }()

    private lazy var assistantPointingDetector: AssistantPointingDetector = {
        AssistantPointingDetector(assistantAPI: openAIAssistantAPI)
    }()

    private lazy var elevenLabsTTSClient: ElevenLabsTTSClient = {
        return ElevenLabsTTSClient(proxyURL: "\(Self.backendBaseURL)/api/macos-assistant/tts")
    }()

    /// The currently running AI response task, if any. Cancelled when the user
    /// speaks again so a new response can begin immediately.
    private var currentResponseTask: Task<Void, Never>?

    private var shortcutTransitionCancellable: AnyCancellable?
    private var researchModeToggleCancellable: AnyCancellable?
    private var voiceStateCancellable: AnyCancellable?
    private var audioPowerCancellable: AnyCancellable?
    private var accessibilityCheckTimer: Timer?
    private var pendingKeyboardShortcutStartTask: Task<Void, Never>?
    /// Scheduled hide for transient cursor mode — cancelled if the user
    /// speaks again before the delay elapses.
    private var transientHideTask: Task<Void, Never>?

    /// True when all three required permissions (accessibility, screen recording,
    /// microphone) are granted. Used by the panel to show a single "all good" state.
    var allPermissionsGranted: Bool {
        hasAccessibilityPermission && hasScreenRecordingPermission && hasMicrophonePermission && hasScreenContentPermission
    }

    /// Whether the blue cursor overlay is currently visible on screen.
    /// Used by the panel to show accurate status text ("Active" vs "Ready").
    @Published private(set) var isOverlayVisible: Bool = false

    /// The backend assistant model used for voice responses. Persisted to UserDefaults.
    @Published var selectedModel: String = UserDefaults.standard.string(forKey: "selectedDesktopAssistantModel") ?? "gpt-4.1-mini"
    @Published var isResearchModeEnabled: Bool = UserDefaults.standard.bool(forKey: "openPinnaResearchModeEnabled")

    func setSelectedModel(_ model: String) {
        selectedModel = model
        UserDefaults.standard.set(model, forKey: "selectedDesktopAssistantModel")
        openAIAssistantAPI.model = model
    }

    func toggleResearchMode() {
        isResearchModeEnabled.toggle()
        UserDefaults.standard.set(isResearchModeEnabled, forKey: "openPinnaResearchModeEnabled")
        openAIAssistantAPI.assistantMode = isResearchModeEnabled ? "research" : "normal"
    }

    /// User preference for whether the Clicky cursor should be shown.
    /// When toggled off, the overlay is hidden and push-to-talk is disabled.
    /// Persisted to UserDefaults so the choice survives app restarts.
    @Published var isClickyCursorEnabled: Bool = UserDefaults.standard.object(forKey: "isClickyCursorEnabled") == nil
        ? true
        : UserDefaults.standard.bool(forKey: "isClickyCursorEnabled")

    func setClickyCursorEnabled(_ enabled: Bool) {
        isClickyCursorEnabled = enabled
        UserDefaults.standard.set(enabled, forKey: "isClickyCursorEnabled")
        transientHideTask?.cancel()
        transientHideTask = nil

        if enabled {
            overlayWindowManager.hasShownOverlayBefore = true
            overlayWindowManager.showOverlay(onScreens: NSScreen.screens, companionManager: self)
            isOverlayVisible = true
        } else {
            overlayWindowManager.hideOverlay()
            isOverlayVisible = false
        }
    }

    /// The vendored Clicky onboarding is bypassed for openPinna Desktop.
    /// We keep the storage key for compatibility but default to ready.
    var hasCompletedOnboarding: Bool {
        get {
            if UserDefaults.standard.object(forKey: "hasCompletedOnboarding") == nil {
                return true
            }

            return UserDefaults.standard.bool(forKey: "hasCompletedOnboarding")
        }
        set { UserDefaults.standard.set(newValue, forKey: "hasCompletedOnboarding") }
    }

    /// Email capture is not used in openPinna Desktop.
    @Published var hasSubmittedEmail: Bool = true

    /// Retained only for compatibility with inherited Clicky code paths.
    func submitEmail(_ email: String) {
        hasSubmittedEmail = true
        UserDefaults.standard.set(true, forKey: "hasSubmittedEmail")
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedEmail.isEmpty {
            PostHogSDK.shared.identify(trimmedEmail, userProperties: [
                "email": trimmedEmail
            ])
        }
    }

    func start() {
        refreshAllPermissions()
        print("🔑 Clicky start — accessibility: \(hasAccessibilityPermission), screen: \(hasScreenRecordingPermission), mic: \(hasMicrophonePermission), screenContent: \(hasScreenContentPermission), onboarded: \(hasCompletedOnboarding)")
        startPermissionPolling()
        bindVoiceStateObservation()
        bindAudioPowerLevel()
        bindShortcutTransitions()
        bindResearchModeShortcut()
        // Eagerly touch the desktop assistant API so its TLS warmup handshake completes
        // well before the onboarding demo fires at ~40s into the video.
        openAIAssistantAPI.assistantMode = isResearchModeEnabled ? "research" : "normal"
        _ = openAIAssistantAPI

        // If the user already completed onboarding AND all permissions are
        // still granted, show the cursor overlay immediately. If permissions
        // were revoked (e.g. signing change), don't show the cursor — the
        // panel will show the permissions UI instead.
        if hasCompletedOnboarding && allPermissionsGranted && isClickyCursorEnabled {
            overlayWindowManager.hasShownOverlayBefore = true
            overlayWindowManager.showOverlay(onScreens: NSScreen.screens, companionManager: self)
            isOverlayVisible = true
        }
    }

    /// Called by BlueCursorView after the buddy finishes its pointing
    /// animation and returns to cursor-following mode.
    /// Triggers the onboarding sequence — dismisses the panel and restarts
    /// the overlay so the welcome animation and intro video play.
    func triggerOnboarding() {
        // Post notification so the panel manager can dismiss the panel
        NotificationCenter.default.post(name: .clickyDismissPanel, object: nil)

        // Mark onboarding as completed so the Start button won't appear
        // again on future launches — the cursor will auto-show instead
        hasCompletedOnboarding = true

        ClickyAnalytics.trackOnboardingStarted()

        // Play Besaid theme at 60% volume, fade out after 1m 30s
        startOnboardingMusic()

        // Show the overlay for the first time — isFirstAppearance triggers
        // the welcome animation and onboarding video
        overlayWindowManager.showOverlay(onScreens: NSScreen.screens, companionManager: self)
        isOverlayVisible = true
    }

    /// Replays the onboarding experience from the "Watch Onboarding Again"
    /// footer link. Same flow as triggerOnboarding but the cursor overlay
    /// is already visible so we just restart the welcome animation and video.
    func replayOnboarding() {
        NotificationCenter.default.post(name: .clickyDismissPanel, object: nil)
        ClickyAnalytics.trackOnboardingReplayed()
        startOnboardingMusic()
        // Tear down any existing overlays and recreate with isFirstAppearance = true
        overlayWindowManager.hasShownOverlayBefore = false
        overlayWindowManager.showOverlay(onScreens: NSScreen.screens, companionManager: self)
        isOverlayVisible = true
    }

    private func stopOnboardingMusic() {
        onboardingMusicFadeTimer?.invalidate()
        onboardingMusicFadeTimer = nil
        onboardingMusicPlayer?.stop()
        onboardingMusicPlayer = nil
    }

    private func startOnboardingMusic() {
        stopOnboardingMusic()
        guard let musicURL = Bundle.main.url(forResource: "ff", withExtension: "mp3") else {
            print("⚠️ Clicky: ff.mp3 not found in bundle")
            return
        }

        do {
            let player = try AVAudioPlayer(contentsOf: musicURL)
            player.volume = 0.3
            player.play()
            self.onboardingMusicPlayer = player

            // After 1m 30s, fade the music out over 3s
            onboardingMusicFadeTimer = Timer.scheduledTimer(withTimeInterval: 90.0, repeats: false) { [weak self] _ in
                self?.fadeOutOnboardingMusic()
            }
        } catch {
            print("⚠️ Clicky: Failed to play onboarding music: \(error)")
        }
    }

    private func fadeOutOnboardingMusic() {
        guard let player = onboardingMusicPlayer else { return }

        let fadeSteps = 30
        let fadeDuration: Double = 3.0
        let stepInterval = fadeDuration / Double(fadeSteps)
        let volumeDecrement = player.volume / Float(fadeSteps)
        var stepsRemaining = fadeSteps

        onboardingMusicFadeTimer = Timer.scheduledTimer(withTimeInterval: stepInterval, repeats: true) { [weak self] timer in
            stepsRemaining -= 1
            player.volume -= volumeDecrement

            if stepsRemaining <= 0 {
                timer.invalidate()
                player.stop()
                self?.onboardingMusicPlayer = nil
                self?.onboardingMusicFadeTimer = nil
            }
        }
    }

    func clearDetectedElementLocation() {
        detectedElementScreenLocation = nil
        detectedElementDisplayFrame = nil
        detectedElementBubbleText = nil
    }

    func stop() {
        globalPushToTalkShortcutMonitor.stop()
        buddyDictationManager.cancelCurrentDictation()
        overlayWindowManager.hideOverlay()
        transientHideTask?.cancel()

        currentResponseTask?.cancel()
        currentResponseTask = nil
        shortcutTransitionCancellable?.cancel()
        researchModeToggleCancellable?.cancel()
        voiceStateCancellable?.cancel()
        audioPowerCancellable?.cancel()
        accessibilityCheckTimer?.invalidate()
        accessibilityCheckTimer = nil
    }

    func refreshAllPermissions() {
        let previouslyHadAccessibility = hasAccessibilityPermission
        let previouslyHadScreenRecording = hasScreenRecordingPermission
        let previouslyHadMicrophone = hasMicrophonePermission
        let previouslyHadAll = allPermissionsGranted

        let currentlyHasAccessibility = WindowPositionManager.hasAccessibilityPermission()
        hasAccessibilityPermission = currentlyHasAccessibility

        if currentlyHasAccessibility {
            globalPushToTalkShortcutMonitor.start()
        } else {
            globalPushToTalkShortcutMonitor.stop()
        }

        hasScreenRecordingPermission = WindowPositionManager.hasScreenRecordingPermission()

        let micAuthStatus = AVCaptureDevice.authorizationStatus(for: .audio)
        hasMicrophonePermission = micAuthStatus == .authorized

        // Debug: log permission state on changes
        if previouslyHadAccessibility != hasAccessibilityPermission
            || previouslyHadScreenRecording != hasScreenRecordingPermission
            || previouslyHadMicrophone != hasMicrophonePermission {
            print("🔑 Permissions — accessibility: \(hasAccessibilityPermission), screen: \(hasScreenRecordingPermission), mic: \(hasMicrophonePermission), screenContent: \(hasScreenContentPermission)")
        }

        // Track individual permission grants as they happen
        if !previouslyHadAccessibility && hasAccessibilityPermission {
            ClickyAnalytics.trackPermissionGranted(permission: "accessibility")
        }
        if !previouslyHadScreenRecording && hasScreenRecordingPermission {
            ClickyAnalytics.trackPermissionGranted(permission: "screen_recording")
        }
        if !previouslyHadMicrophone && hasMicrophonePermission {
            ClickyAnalytics.trackPermissionGranted(permission: "microphone")
        }
        // Screen content permission is persisted — once the user has approved the
        // SCShareableContent picker, we don't need to re-check it.
        if !hasScreenContentPermission {
            hasScreenContentPermission = UserDefaults.standard.bool(forKey: "hasScreenContentPermission")
        }

        if !previouslyHadAll && allPermissionsGranted {
            ClickyAnalytics.trackAllPermissionsGranted()
        }
    }

    /// Triggers the macOS screen content picker by performing a dummy
    /// screenshot capture. Once the user approves, we persist the grant
    /// so they're never asked again during onboarding.
    @Published private(set) var isRequestingScreenContent = false

    func requestScreenContentPermission() {
        guard !isRequestingScreenContent else { return }
        isRequestingScreenContent = true
        Task {
            do {
                let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
                guard let display = content.displays.first else {
                    await MainActor.run { isRequestingScreenContent = false }
                    return
                }
                let filter = SCContentFilter(display: display, excludingWindows: [])
                let config = SCStreamConfiguration()
                config.width = 320
                config.height = 240
                let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
                // Verify the capture actually returned real content — a 0x0 or
                // fully-empty image means the user denied the prompt.
                let didCapture = image.width > 0 && image.height > 0
                print("🔑 Screen content capture result — width: \(image.width), height: \(image.height), didCapture: \(didCapture)")
                await MainActor.run {
                    isRequestingScreenContent = false
                    guard didCapture else { return }
                    hasScreenContentPermission = true
                    UserDefaults.standard.set(true, forKey: "hasScreenContentPermission")
                    ClickyAnalytics.trackPermissionGranted(permission: "screen_content")

                    // If onboarding was already completed, show the cursor overlay now
                    if hasCompletedOnboarding && allPermissionsGranted && !isOverlayVisible && isClickyCursorEnabled {
                        overlayWindowManager.hasShownOverlayBefore = true
                        overlayWindowManager.showOverlay(onScreens: NSScreen.screens, companionManager: self)
                        isOverlayVisible = true
                    }
                }
            } catch {
                print("⚠️ Screen content permission request failed: \(error)")
                await MainActor.run { isRequestingScreenContent = false }
            }
        }
    }

    // MARK: - Private

    /// Triggers the system microphone prompt if the user has never been asked.
    /// Once granted/denied the status sticks and polling picks it up.
    private func promptForMicrophoneIfNotDetermined() {
        guard AVCaptureDevice.authorizationStatus(for: .audio) == .notDetermined else { return }
        AVCaptureDevice.requestAccess(for: .audio) { [weak self] granted in
            Task { @MainActor [weak self] in
                self?.hasMicrophonePermission = granted
            }
        }
    }

    /// Polls all permissions frequently so the UI updates live after the
    /// user grants them in System Settings. Screen Recording is the exception —
    /// macOS requires an app restart for that one to take effect.
    private func startPermissionPolling() {
        accessibilityCheckTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.refreshAllPermissions()
            }
        }
    }

    private func bindAudioPowerLevel() {
        audioPowerCancellable = buddyDictationManager.$currentAudioPowerLevel
            .receive(on: DispatchQueue.main)
            .sink { [weak self] powerLevel in
                self?.currentAudioPowerLevel = powerLevel
            }
    }

    private func bindVoiceStateObservation() {
        voiceStateCancellable = buddyDictationManager.$isRecordingFromKeyboardShortcut
            .combineLatest(
                buddyDictationManager.$isFinalizingTranscript,
                buddyDictationManager.$isPreparingToRecord
            )
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isRecording, isFinalizing, isPreparing in
                guard let self else { return }
                // Don't override .responding — the AI response pipeline
                // manages that state directly until streaming finishes.
                guard self.voiceState != .responding else { return }

                if isFinalizing {
                    self.voiceState = .processing
                } else if isRecording {
                    self.voiceState = .listening
                } else if isPreparing {
                    self.voiceState = .processing
                } else {
                    self.voiceState = .idle
                    // If the user pressed and released the hotkey without
                    // saying anything, no response task runs — schedule the
                    // transient hide here so the overlay doesn't get stuck.
                    // Only do this when no response is in flight, otherwise
                    // the brief idle gap between recording and processing
                    // would prematurely hide the overlay.
                    if self.currentResponseTask == nil {
                        self.scheduleTransientHideIfNeeded()
                    }
                }
            }
    }

    private func bindShortcutTransitions() {
        shortcutTransitionCancellable = globalPushToTalkShortcutMonitor
            .shortcutTransitionPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] transition in
                self?.handleShortcutTransition(transition)
            }
    }

    private func bindResearchModeShortcut() {
        researchModeToggleCancellable = globalPushToTalkShortcutMonitor
            .researchModeTogglePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in
                self?.toggleResearchMode()
            }
    }

    private func handleShortcutTransition(_ transition: BuddyPushToTalkShortcut.ShortcutTransition) {
        switch transition {
        case .pressed:
            guard !buddyDictationManager.isDictationInProgress else { return }
            // Don't register push-to-talk while the onboarding video is playing
            guard !showOnboardingVideo else { return }

            // Cancel any pending transient hide so the overlay stays visible
            transientHideTask?.cancel()
            transientHideTask = nil

            // If the cursor is hidden, bring it back transiently for this interaction
            if !isClickyCursorEnabled && !isOverlayVisible {
                overlayWindowManager.hasShownOverlayBefore = true
                overlayWindowManager.showOverlay(onScreens: NSScreen.screens, companionManager: self)
                isOverlayVisible = true
            }

            // Dismiss the menu bar panel so it doesn't cover the screen
            NotificationCenter.default.post(name: .clickyDismissPanel, object: nil)

            // Cancel any in-progress response and TTS from a previous utterance
            currentResponseTask?.cancel()
            elevenLabsTTSClient.stopPlayback()
            clearDetectedElementLocation()

            // Dismiss the onboarding prompt if it's showing
            if showOnboardingPrompt {
                withAnimation(.easeOut(duration: 0.3)) {
                    onboardingPromptOpacity = 0.0
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                    self.showOnboardingPrompt = false
                    self.onboardingPromptText = ""
                }
            }
    

            ClickyAnalytics.trackPushToTalkStarted()

            pendingKeyboardShortcutStartTask?.cancel()
            pendingKeyboardShortcutStartTask = Task {
                await buddyDictationManager.startPushToTalkFromKeyboardShortcut(
                    currentDraftText: "",
                    updateDraftText: { _ in
                        // Partial transcripts are hidden (waveform-only UI)
                    },
                    submitDraftText: { [weak self] finalTranscript in
                        self?.lastTranscript = finalTranscript
                        print("🗣️ Companion received transcript: \(finalTranscript)")
                        ClickyAnalytics.trackUserMessageSent(transcript: finalTranscript)
                        self?.sendTranscriptToAssistantWithScreenshot(transcript: finalTranscript)
                    }
                )
            }
        case .released:
            // Cancel the pending start task in case the user released the shortcut
            // before the async startPushToTalk had a chance to begin recording.
            // Without this, a quick press-and-release drops the release event and
            // leaves the waveform overlay stuck on screen indefinitely.
            ClickyAnalytics.trackPushToTalkReleased()
            pendingKeyboardShortcutStartTask?.cancel()
            pendingKeyboardShortcutStartTask = nil
            buddyDictationManager.stopPushToTalkFromKeyboardShortcut()
        case .none:
            break
        }
    }

    // MARK: - Companion Prompt

    private static let companionVoiceResponseSystemPrompt = """
    you're clicky, a friendly always-on companion that lives in the user's menu bar. the user just spoke to you via push-to-talk and you can see their screen(s). your reply will be spoken aloud via text-to-speech, so write the way you'd actually talk. this is an ongoing conversation — you remember everything they've said before.

    rules:
    - default to one or two sentences. be direct and dense. BUT if the user asks you to explain more, go deeper, or elaborate, then go all out — give a thorough, detailed explanation with no length limit.
    - if you're pointing at something visible on screen, keep that spoken guidance to one short sentence unless the user explicitly asks for a deeper explanation.
    - all lowercase, casual, warm. no emojis.
    - write for the ear, not the eye. short sentences. no lists, bullet points, markdown, or formatting — just natural speech.
    - don't use abbreviations or symbols that sound weird read aloud. write "for example" not "e.g.", spell out small numbers.
    - if the user's question relates to what's on their screen, reference specific things you see.
    - if the screenshot doesn't seem relevant to their question, just answer the question directly.
    - you can help with anything — coding, writing, general knowledge, brainstorming.
    - never say "simply" or "just".
    - don't read out code verbatim. describe what the code does or what needs to change conversationally.
    - focus on giving a thorough, useful explanation. don't end with simple yes/no questions like "want me to explain more?" or "should i show you?" — those are dead ends that force the user to just say yes.
    - instead, when it fits naturally, end by planting a seed — mention something bigger or more ambitious they could try, a related concept that goes deeper, or a next-level technique that builds on what you just explained. make it something worth coming back for, not a question they'd just nod to. it's okay to not end with anything extra if the answer is complete on its own.
    - if you receive multiple screen images, the one labeled "primary focus" is where the cursor is — prioritize that one but reference others if relevant.

    element pointing:
    you have a small blue triangle cursor that can fly to and point at things on screen. use your spoken response the way a human helper would — mention the relevant button, menu, tab, or area when it matters.

    if the user's question is about navigating what they can see, be concrete about the visible target in your spoken reply. if it's a general knowledge question or screen pointing would be pointless, answer normally and move on.

    important: do NOT append coordinate tags, json, brackets, or any machine-readable markup. the app handles pointing in a separate pass after your spoken reply.
    """

    private static let companionResearchResponseSystemPrompt = """
    you're clicky-research, a grounded research capture companion. the user just spoke while looking at their screen and wants to preserve useful context in openpinna.

    rules:
    - keep replies short and natural for speech.
    - focus on what was captured, not on navigation.
    - do not mention pointing, coordinates, targets, or cursor behavior.
    - do not include json, markdown, or machine-readable tags.
    - if useful, acknowledge the visible research context in one sentence.
    """

    // MARK: - AI Response Pipeline

    /// Captures a screenshot, sends it along with the transcript to Claude,
    /// and plays the response aloud via ElevenLabs TTS. The cursor stays in
    /// the spinner/processing state until TTS audio begins playing.
    /// Claude's response may include a [POINT:x,y:label] tag which triggers
    /// the buddy to fly to that element on screen.
    private func sendTranscriptToAssistantWithScreenshot(transcript: String) {
        currentResponseTask?.cancel()
        elevenLabsTTSClient.stopPlayback()
        openAIAssistantAPI.assistantMode = isResearchModeEnabled ? "research" : "normal"

        currentResponseTask = Task {
            // Stay in processing (spinner) state — no streaming text displayed
            voiceState = .processing

            do {
                // Capture all connected screens so the AI has full context
                let screenCaptures = try await CompanionScreenCaptureUtility.captureAllScreensAsJPEG()

                guard !Task.isCancelled else { return }

                // Build image labels with the actual screenshot pixel dimensions
                // so Claude's coordinate space matches the image it sees. We
                // scale from screenshot pixels to display points ourselves.
                let labeledImages = screenCaptures.map { capture in
                    (data: capture.imageData, label: capture.labelWithDimensions)
                }

                let (fullResponseText, _) = try await openAIAssistantAPI.analyzeImageStreaming(
                    images: labeledImages,
                    systemPrompt: isResearchModeEnabled
                        ? Self.companionResearchResponseSystemPrompt
                        : Self.companionVoiceResponseSystemPrompt,
                    conversationHistory: [],
                    userPrompt: transcript,
                    onTextChunk: { _ in
                        // No streaming text display — spinner stays until TTS plays
                    }
                )

                guard !Task.isCancelled else { return }

                var spokenText = fullResponseText.trimmingCharacters(in: .whitespacesAndNewlines)
                var fallbackParseResult = PointingParseResult(
                    spokenText: spokenText,
                    coordinate: nil,
                    elementLabel: nil,
                    screenNumber: nil
                )

                if !isResearchModeEnabled {
                    // Strip any legacy point tag from the spoken response so it
                    // never reaches TTS, then run pointing as a parallel pass.
                    fallbackParseResult = Self.parsePointingCoordinates(from: fullResponseText)
                    spokenText = fallbackParseResult.spokenText
                }

                ClickyAnalytics.trackAIResponseReceived(response: spokenText)

                async let pointingTask: Void = resolveAndApplyPointingTargetIfNeeded(
                    enabled: !isResearchModeEnabled,
                    screenCaptures: screenCaptures,
                    userPrompt: transcript,
                    spokenResponse: spokenText,
                    fallbackParseResult: fallbackParseResult
                )

                async let speechTask: Void = playAssistantResponse(spokenText)

                _ = await (pointingTask, speechTask)
            } catch is CancellationError {
                // User spoke again — response was interrupted
            } catch {
                ClickyAnalytics.trackResponseError(error: error.localizedDescription)
                print("⚠️ Companion response error: \(error)")
                speakCreditsErrorFallback()
            }

            if !Task.isCancelled {
                voiceState = .idle
                scheduleTransientHideIfNeeded()
            }
        }
    }

    private func resolveAndApplyPointingTargetIfNeeded(
        enabled: Bool,
        screenCaptures: [CompanionScreenCapture],
        userPrompt: String,
        spokenResponse: String,
        fallbackParseResult: PointingParseResult
    ) async {
        guard enabled else { return }

        let structuredPointingTarget = await detectStructuredPointingTarget(
            screenCaptures: screenCaptures,
            userPrompt: userPrompt,
            spokenResponse: spokenResponse
        )

        let fallbackPointingTarget: ResolvedPointingTarget? = {
            guard structuredPointingTarget == nil,
                  let pointCoordinate = fallbackParseResult.coordinate,
                  let targetScreenCapture = fallbackTargetScreenCapture(
                    for: fallbackParseResult.screenNumber,
                    from: screenCaptures
                  ) else {
                return nil
            }

            return resolvedPointingTarget(
                from: pointCoordinate,
                in: targetScreenCapture,
                label: fallbackParseResult.elementLabel,
                context: "fallback-tag"
            )
        }()

        guard !Task.isCancelled else { return }

        if let pointingTarget = structuredPointingTarget ?? fallbackPointingTarget {
            // If the pointing pass finishes before audio playback begins, leave
            // processing so the pointer can animate immediately.
            if voiceState == .processing {
                voiceState = .idle
            }
            applyPointingTarget(pointingTarget, bubbleText: spokenResponse)
        } else {
            print("🎯 Element pointing: none")
        }
    }

    private func playAssistantResponse(_ spokenText: String) async {
        let trimmedText = spokenText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }

        do {
            try await elevenLabsTTSClient.speakText(trimmedText)
            guard !Task.isCancelled else { return }

            // speakText returns after player.play() begins, so this transition
            // reflects real playback start rather than request start.
            voiceState = .responding

            while elevenLabsTTSClient.isPlaying {
                try await Task.sleep(nanoseconds: 200_000_000)
                guard !Task.isCancelled else { return }
            }
        } catch is CancellationError {
            // User spoke again — playback was interrupted
        } catch {
            ClickyAnalytics.trackTTSError(error: error.localizedDescription)
            print("⚠️ ElevenLabs TTS error: \(error)")
            speakCreditsErrorFallback()
        }
    }

    private struct ResolvedPointingTarget {
        let screenLocation: CGPoint
        let displayFrame: CGRect
        let label: String?
        let screenshotCoordinate: CGPoint
        let screenLabel: String
    }

    private static let pointingVerificationEnabledUserDefaultsKey = "openPinnaPointingVerificationEnabled"

    private func shouldAttemptStructuredPointing(userPrompt: String, spokenResponse: String) -> Bool {
        let lowercasedText = "\(userPrompt) \(spokenResponse)".lowercased()
        let keywords = [
            "click", "button", "menu", "tab", "icon", "field", "where", "find",
            "open", "select", "press", "toggle", "settings", "toolbar", "sidebar",
            "window", "screen", "dialog", "dropdown", "panel", "checkbox", "cursor"
        ]

        return keywords.contains { lowercasedText.contains($0) }
    }

    private func detectStructuredPointingTarget(
        screenCaptures: [CompanionScreenCapture],
        userPrompt: String,
        spokenResponse: String
    ) async -> ResolvedPointingTarget? {
        guard shouldAttemptStructuredPointing(userPrompt: userPrompt, spokenResponse: spokenResponse) else {
            return nil
        }

        let targetDescription = [
            spokenResponse.trimmingCharacters(in: .whitespacesAndNewlines),
            userPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        ]
        .filter { !$0.isEmpty }
        .joined(separator: " | ")

        let orderedCaptures = orderedPointingScreenCaptures(from: screenCaptures)

        for (captureIndex, targetScreenCapture) in orderedCaptures.enumerated() {
            for attemptIndex in 0..<2 {
                guard let coordinateResult = await assistantPointingDetector.detectCoordinate(
                    for: targetScreenCapture,
                    userPrompt: userPrompt,
                    spokenResponse: spokenResponse,
                    targetDescription: targetDescription,
                    retry: attemptIndex > 0
                ) else {
                    continue
                }

                guard let resolvedTarget = resolvedPointingTarget(
                    from: coordinateResult.point,
                    in: targetScreenCapture,
                    label: coordinateResult.label,
                    context: captureIndex == 0
                        ? (attemptIndex == 0 ? "structured" : "structured-retry")
                        : "structured-screen\(captureIndex + 1)-retry\(attemptIndex + 1)"
                ) else {
                    continue
                }

                if shouldRunPointingVerification,
                   let cropImageData = makeVerificationCrop(
                    from: targetScreenCapture.imageData,
                    around: resolvedTarget.screenshotCoordinate
                   ) {
                    let isVerified = await assistantPointingDetector.verifyCoordinate(
                        cropImageData: cropImageData,
                        expectedLabel: coordinateResult.label
                    )
                    print("🎯 Structured pointing verification (\(attemptIndex + 1)): \(isVerified ? "passed" : "failed") for \(coordinateResult.label)")
                }

                return resolvedTarget
            }
        }

        return nil
    }

    private var shouldRunPointingVerification: Bool {
        UserDefaults.standard.bool(forKey: Self.pointingVerificationEnabledUserDefaultsKey)
    }

    private func orderedPointingScreenCaptures(from screenCaptures: [CompanionScreenCapture]) -> [CompanionScreenCapture] {
        let cursorScreens = screenCaptures.filter(\.isCursorScreen)
        let otherScreens = screenCaptures.filter { !$0.isCursorScreen }
        return cursorScreens + otherScreens
    }

    private func fallbackTargetScreenCapture(
        for screenNumber: Int?,
        from screenCaptures: [CompanionScreenCapture]
    ) -> CompanionScreenCapture? {
        if let screenNumber,
           screenNumber >= 1 && screenNumber <= screenCaptures.count {
            return screenCaptures[screenNumber - 1]
        }

        return screenCaptures.first(where: { $0.isCursorScreen }) ?? screenCaptures.first
    }

    private func resolvedPointingTarget(
        from screenshotCoordinate: CGPoint,
        in capture: CompanionScreenCapture,
        label: String?,
        context: String
    ) -> ResolvedPointingTarget? {
        let screenshotWidth = CGFloat(capture.screenshotWidthInPixels)
        let screenshotHeight = CGFloat(capture.screenshotHeightInPixels)
        let displayWidth = CGFloat(capture.displayWidthInPoints)
        let displayHeight = CGFloat(capture.displayHeightInPoints)

        guard screenshotWidth > 0, screenshotHeight > 0, displayWidth > 0, displayHeight > 0 else {
            return nil
        }

        let clampedX = max(0, min(screenshotCoordinate.x, screenshotWidth - 1))
        let clampedY = max(0, min(screenshotCoordinate.y, screenshotHeight - 1))
        let displayLocalX = clampedX * (displayWidth / screenshotWidth)
        let displayLocalY = clampedY * (displayHeight / screenshotHeight)
        let appKitY = displayHeight - displayLocalY
        let globalLocation = CGPoint(
            x: displayLocalX + capture.displayFrame.origin.x,
            y: appKitY + capture.displayFrame.origin.y
        )

        print(
            "🎯 Point mapping (\(context)): image \(capture.screenshotWidthInPixels)x\(capture.screenshotHeightInPixels), " +
            "display \(capture.displayWidthInPoints)x\(capture.displayHeightInPoints), " +
            "pixel (\(Int(clampedX)), \(Int(clampedY))) → global (\(Int(globalLocation.x)), \(Int(globalLocation.y))) on \(capture.label)"
        )

        PointingDebugArtifactWriter.writeAnnotatedImage(
            imageData: capture.imageData,
            point: CGPoint(x: clampedX, y: clampedY),
            label: label ?? "target",
            context: context
        )

        return ResolvedPointingTarget(
            screenLocation: globalLocation,
            displayFrame: capture.displayFrame,
            label: label,
            screenshotCoordinate: CGPoint(x: clampedX, y: clampedY),
            screenLabel: capture.label
        )
    }

    private func applyPointingTarget(_ target: ResolvedPointingTarget, bubbleText: String?) {
        detectedElementBubbleText = condensedNavigationBubbleText(from: bubbleText)
        detectedElementScreenLocation = target.screenLocation
        detectedElementDisplayFrame = target.displayFrame
        ClickyAnalytics.trackElementPointed(elementLabel: target.label)
        print(
            "🎯 Element pointing: (\(Int(target.screenshotCoordinate.x)), \(Int(target.screenshotCoordinate.y))) → " +
            "\"\(target.label ?? "element")\" on \(target.screenLabel)"
        )
    }

    /// Keeps the on-screen pointer bubble short even when the spoken TTS reply
    /// is longer. The overlay should read like a quick visual cue, not a full transcript.
    private func condensedNavigationBubbleText(from bubbleText: String?) -> String? {
        guard let bubbleText else { return nil }

        let trimmed = bubbleText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        let sentenceParts = trimmed.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: true)
        let firstSentence = sentenceParts.first.map(String.init) ?? trimmed
        let normalized = firstSentence.trimmingCharacters(in: .whitespacesAndNewlines)
        let maxLength = 110

        guard normalized.count > maxLength else {
            return normalized
        }

        let cutoffIndex = normalized.index(normalized.startIndex, offsetBy: maxLength)
        let prefix = String(normalized[..<cutoffIndex])

        if let lastWhitespace = prefix.lastIndex(where: { $0.isWhitespace }) {
            return String(prefix[..<lastWhitespace]).trimmingCharacters(in: .whitespacesAndNewlines)
        }

        return prefix
    }

    private func makeVerificationCrop(
        from imageData: Data,
        around screenshotCoordinate: CGPoint,
        cropSize: Int = 220
    ) -> Data? {
        guard let bitmap = NSBitmapImageRep(data: imageData),
              let cgImage = bitmap.cgImage else {
            return nil
        }

        let imageWidth = cgImage.width
        let imageHeight = cgImage.height
        guard imageWidth > 0, imageHeight > 0 else { return nil }

        let cropWidth = min(cropSize, max(cropSize, imageWidth))
        let cropHeight = min(cropSize, max(cropSize, imageHeight))
        let centerX = Int(screenshotCoordinate.x.rounded())
        let centerY = Int(screenshotCoordinate.y.rounded())
        let desiredTopLeftX = centerX - (cropWidth / 2)
        let desiredTopLeftY = centerY - (cropHeight / 2)

        let sourceMinX = max(0, desiredTopLeftX)
        let sourceMinY = max(0, desiredTopLeftY)
        let sourceMaxX = min(imageWidth, desiredTopLeftX + cropWidth)
        let sourceMaxY = min(imageHeight, desiredTopLeftY + cropHeight)
        let sourceWidth = sourceMaxX - sourceMinX
        let sourceHeight = sourceMaxY - sourceMinY

        guard sourceWidth > 0, sourceHeight > 0 else {
            return nil
        }

        let sourceRect = CGRect(
            x: sourceMinX,
            y: imageHeight - sourceMaxY,
            width: sourceWidth,
            height: sourceHeight
        )

        guard let croppedImage = cgImage.cropping(to: sourceRect),
              let destinationBitmap = NSBitmapImageRep(
                bitmapDataPlanes: nil,
                pixelsWide: cropWidth,
                pixelsHigh: cropHeight,
                bitsPerSample: 8,
                samplesPerPixel: 4,
                hasAlpha: true,
                isPlanar: false,
                colorSpaceName: .deviceRGB,
                bytesPerRow: 0,
                bitsPerPixel: 0
              ) else {
            return nil
        }

        destinationBitmap.size = NSSize(width: cropWidth, height: cropHeight)

        NSGraphicsContext.saveGraphicsState()
        guard let graphicsContext = NSGraphicsContext(bitmapImageRep: destinationBitmap) else {
            NSGraphicsContext.restoreGraphicsState()
            return nil
        }

        NSGraphicsContext.current = graphicsContext
        graphicsContext.imageInterpolation = .high
        NSColor.black.setFill()
        NSBezierPath(rect: NSRect(x: 0, y: 0, width: cropWidth, height: cropHeight)).fill()

        let destinationOriginX = max(0, -desiredTopLeftX)
        let destinationOriginY = max(0, -desiredTopLeftY)
        let destinationRect = NSRect(
            x: destinationOriginX,
            y: destinationOriginY,
            width: sourceWidth,
            height: sourceHeight
        )

        NSImage(cgImage: croppedImage, size: NSSize(width: sourceWidth, height: sourceHeight))
            .draw(in: destinationRect)
        NSGraphicsContext.restoreGraphicsState()

        return destinationBitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.9])
    }

    /// If the cursor is in transient mode (user toggled "Show Clicky" off),
    /// waits for TTS playback and any pointing animation to finish, then
    /// fades out the overlay after a 1-second pause. Cancelled automatically
    /// if the user starts another push-to-talk interaction.
    private func scheduleTransientHideIfNeeded() {
        guard !isClickyCursorEnabled && isOverlayVisible else { return }

        transientHideTask?.cancel()
        transientHideTask = Task {
            // Wait for TTS audio to finish playing
            while elevenLabsTTSClient.isPlaying {
                try? await Task.sleep(nanoseconds: 200_000_000)
                guard !Task.isCancelled else { return }
            }

            // Wait for pointing animation to finish (location is cleared
            // when the buddy flies back to the cursor)
            while detectedElementScreenLocation != nil {
                try? await Task.sleep(nanoseconds: 200_000_000)
                guard !Task.isCancelled else { return }
            }

            // Pause 1s after everything finishes, then fade out
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            guard !Task.isCancelled else { return }
            overlayWindowManager.fadeOutAndHideOverlay()
            isOverlayVisible = false
        }
    }

    /// Speaks a local fallback message when the backend assistant request fails.
    private func speakCreditsErrorFallback() {
        let utterance = "The desktop assistant could not complete that request. Check the local openPinna backend and your OpenAI configuration."
        let synthesizer = NSSpeechSynthesizer()
        synthesizer.startSpeaking(utterance)
        voiceState = .responding
    }

    // MARK: - Point Tag Parsing

    /// Result of parsing a [POINT:...] tag from Claude's response.
    struct PointingParseResult {
        /// The response text with the [POINT:...] tag removed — this is what gets spoken.
        let spokenText: String
        /// The parsed pixel coordinate, or nil if Claude said "none" or no tag was found.
        let coordinate: CGPoint?
        /// Short label describing the element (e.g. "run button"), or "none".
        let elementLabel: String?
        /// Which screen the coordinate refers to (1-based), or nil to default to cursor screen.
        let screenNumber: Int?
    }

    /// Parses a [POINT:x,y:label:screenN] or [POINT:none] tag from the end of Claude's response.
    /// Returns the spoken text (tag removed) and the optional coordinate + label + screen number.
    static func parsePointingCoordinates(from responseText: String) -> PointingParseResult {
        // Match [POINT:none] or [POINT:123,456:label] or [POINT:123,456:label:screen2]
        let pattern = #"\[POINT:(?:none|(\d+)\s*,\s*(\d+)(?::([^\]:\s][^\]:]*?))?(?::screen(\d+))?)\]\s*$"#

        guard let regex = try? NSRegularExpression(pattern: pattern, options: []),
              let match = regex.firstMatch(in: responseText, range: NSRange(responseText.startIndex..., in: responseText)) else {
            // No tag found at all
            return PointingParseResult(spokenText: responseText, coordinate: nil, elementLabel: nil, screenNumber: nil)
        }

        // Remove the tag from the spoken text
        let tagRange = Range(match.range, in: responseText)!
        let spokenText = String(responseText[..<tagRange.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)

        // Check if it's [POINT:none]
        guard match.numberOfRanges >= 3,
              let xRange = Range(match.range(at: 1), in: responseText),
              let yRange = Range(match.range(at: 2), in: responseText),
              let x = Double(responseText[xRange]),
              let y = Double(responseText[yRange]) else {
            return PointingParseResult(spokenText: spokenText, coordinate: nil, elementLabel: "none", screenNumber: nil)
        }

        var elementLabel: String? = nil
        if match.numberOfRanges >= 4, let labelRange = Range(match.range(at: 3), in: responseText) {
            elementLabel = String(responseText[labelRange]).trimmingCharacters(in: .whitespaces)
        }

        var screenNumber: Int? = nil
        if match.numberOfRanges >= 5, let screenRange = Range(match.range(at: 4), in: responseText) {
            screenNumber = Int(responseText[screenRange])
        }

        return PointingParseResult(
            spokenText: spokenText,
            coordinate: CGPoint(x: x, y: y),
            elementLabel: elementLabel,
            screenNumber: screenNumber
        )
    }

    // MARK: - Onboarding Video

    /// Sets up the onboarding video player, starts playback, and schedules
    /// the demo interaction at 40s. Called by BlueCursorView when onboarding starts.
    func setupOnboardingVideo() {
        guard let videoURL = URL(string: "https://stream.mux.com/e5jB8UuSrtFABVnTHCR7k3sIsmcUHCyhtLu1tzqLlfs.m3u8") else { return }

        let player = AVPlayer(url: videoURL)
        player.isMuted = false
        player.volume = 0.0
        self.onboardingVideoPlayer = player
        self.showOnboardingVideo = true
        self.onboardingVideoOpacity = 0.0

        // Start playback immediately — the video plays while invisible,
        // then we fade in both the visual and audio over 1s.
        player.play()

        // Wait for SwiftUI to mount the view, then set opacity to 1.
        // The .animation modifier on the view handles the actual animation.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            self.onboardingVideoOpacity = 1.0
            // Fade audio volume from 0 → 1 over 2s to match visual fade
            self.fadeInVideoAudio(player: player, targetVolume: 1.0, duration: 2.0)
        }

        // At 40 seconds into the video, trigger the onboarding demo where
        // Clicky flies to something interesting on screen and comments on it
        let demoTriggerTime = CMTime(seconds: 40, preferredTimescale: 600)
        onboardingDemoTimeObserver = player.addBoundaryTimeObserver(
            forTimes: [NSValue(time: demoTriggerTime)],
            queue: .main
        ) { [weak self] in
            ClickyAnalytics.trackOnboardingDemoTriggered()
            self?.performOnboardingDemoInteraction()
        }

        // Fade out and clean up when the video finishes
        onboardingVideoEndObserver = NotificationCenter.default.addObserver(
            forName: AVPlayerItem.didPlayToEndTimeNotification,
            object: player.currentItem,
            queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            ClickyAnalytics.trackOnboardingVideoCompleted()
            self.onboardingVideoOpacity = 0.0
            // Wait for the 2s fade-out animation to complete before tearing down
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                self.tearDownOnboardingVideo()
                // After the video disappears, stream in the prompt to try talking
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    self.startOnboardingPromptStream()
                }
            }
        }
    }

    func tearDownOnboardingVideo() {
        showOnboardingVideo = false
        if let timeObserver = onboardingDemoTimeObserver {
            onboardingVideoPlayer?.removeTimeObserver(timeObserver)
            onboardingDemoTimeObserver = nil
        }
        onboardingVideoPlayer?.pause()
        onboardingVideoPlayer = nil
        if let observer = onboardingVideoEndObserver {
            NotificationCenter.default.removeObserver(observer)
            onboardingVideoEndObserver = nil
        }
    }

    private func startOnboardingPromptStream() {
        let message = "press control + option and introduce yourself"
        onboardingPromptText = ""
        showOnboardingPrompt = true
        onboardingPromptOpacity = 0.0

        withAnimation(.easeIn(duration: 0.4)) {
            onboardingPromptOpacity = 1.0
        }

        var currentIndex = 0
        Timer.scheduledTimer(withTimeInterval: 0.03, repeats: true) { timer in
            guard currentIndex < message.count else {
                timer.invalidate()
                // Auto-dismiss after 10 seconds
                DispatchQueue.main.asyncAfter(deadline: .now() + 10.0) {
                    guard self.showOnboardingPrompt else { return }
                    withAnimation(.easeOut(duration: 0.3)) {
                        self.onboardingPromptOpacity = 0.0
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        self.showOnboardingPrompt = false
                        self.onboardingPromptText = ""
                    }
                }
                return
            }
            let index = message.index(message.startIndex, offsetBy: currentIndex)
            self.onboardingPromptText.append(message[index])
            currentIndex += 1
        }
    }

    /// Gradually raises an AVPlayer's volume from its current level to the
    /// target over the specified duration, creating a smooth audio fade-in.
    private func fadeInVideoAudio(player: AVPlayer, targetVolume: Float, duration: Double) {
        let steps = 20
        let stepInterval = duration / Double(steps)
        let volumeIncrement = (targetVolume - player.volume) / Float(steps)
        var stepsRemaining = steps

        Timer.scheduledTimer(withTimeInterval: stepInterval, repeats: true) { timer in
            stepsRemaining -= 1
            player.volume += volumeIncrement

            if stepsRemaining <= 0 {
                timer.invalidate()
                player.volume = targetVolume
            }
        }
    }

    // MARK: - Onboarding Demo Interaction

    private static let onboardingDemoSystemPrompt = """
    you're clicky, a small blue cursor buddy living on the user's screen. you're showing off during onboarding — look at their screen and find ONE specific, concrete thing to point at. pick something with a clear name or identity: a specific app icon (say its name), a specific word or phrase of text you can read, a specific filename, a specific button label, a specific tab title, a specific image you can describe. do NOT point at vague things like "a window" or "some text" — be specific about exactly what you see.

    make a short quirky 3-6 word observation about the specific thing you picked — something fun, playful, or curious that shows you actually read/recognized it. no emojis ever. NEVER quote or repeat text you see on screen — just react to it. keep it to 6 words max, no exceptions.

    CRITICAL COORDINATE RULE: you MUST only pick elements near the CENTER of the screen. your x coordinate must be between 20%-80% of the image width. your y coordinate must be between 20%-80% of the image height. do NOT pick anything in the top 20%, bottom 20%, left 20%, or right 20% of the screen. no menu bar items, no dock icons, no sidebar items, no items near any edge. only things clearly in the middle area of the screen. if the only interesting things are near the edges, pick something boring in the center instead.

    respond with ONLY your short comment followed by the coordinate tag. nothing else. all lowercase.

    format: your comment [POINT:x,y:label]

    the screenshot images are labeled with their pixel dimensions. use those dimensions as the coordinate space. origin (0,0) is top-left. x increases rightward, y increases downward.
    """

    /// Captures a screenshot and asks Claude to find something interesting to
    /// point at, then triggers the buddy's flight animation. Used during
    /// onboarding to demo the pointing feature while the intro video plays.
    func performOnboardingDemoInteraction() {
        // Don't interrupt an active voice response
        guard voiceState == .idle || voiceState == .responding else { return }

        Task {
            do {
                let screenCaptures = try await CompanionScreenCaptureUtility.captureAllScreensAsJPEG()

                // Only send the cursor screen so Claude can't pick something
                // on a different monitor that we can't point at.
                guard let cursorScreenCapture = screenCaptures.first(where: { $0.isCursorScreen }) else {
                    print("🎯 Onboarding demo: no cursor screen found")
                    return
                }

                let labeledImages = [(data: cursorScreenCapture.imageData, label: cursorScreenCapture.labelWithDimensions)]

                let (fullResponseText, _) = try await openAIAssistantAPI.analyzeImageStreaming(
                    images: labeledImages,
                    systemPrompt: Self.onboardingDemoSystemPrompt,
                    userPrompt: "look around my screen and find something interesting to point at",
                    onTextChunk: { _ in }
                )

                let parseResult = Self.parsePointingCoordinates(from: fullResponseText)

                guard let pointCoordinate = parseResult.coordinate else {
                    print("🎯 Onboarding demo: no element to point at")
                    return
                }

                guard let resolvedTarget = resolvedPointingTarget(
                    from: pointCoordinate,
                    in: cursorScreenCapture,
                    label: parseResult.elementLabel,
                    context: "onboarding-tag"
                ) else {
                    print("⚠️ Onboarding demo: failed to map coordinate")
                    return
                }

                // Set custom bubble text so the pointing animation uses Claude's
                // comment instead of a random phrase
                applyPointingTarget(resolvedTarget, bubbleText: parseResult.spokenText)
                print("🎯 Onboarding demo: pointing at \"\(parseResult.elementLabel ?? "element")\" — \"\(parseResult.spokenText)\"")
            } catch {
                print("⚠️ Onboarding demo error: \(error)")
            }
        }
    }
}
