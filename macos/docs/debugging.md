# Debugging Log

## 2026-06-06 - Clicky Bubble Overflow

- problem: the on-screen Clicky reply bubble grew past the screen bounds when the spoken reply was long.
- suspected cause: the pointing bubble used unconstrained `Text(...).fixedSize()` and streamed the full reply without a viewport or rolling limit.
- files touched: `leanring-buddy/OverlayWindow.swift`, `leanring-buddy/CompanionManager.swift`
- fix attempted: capped the bubble width, clamped its on-screen position, added a rolling character window that drops the oldest text as new text streams in, and shortened bubble text to the first sentence with a hard length cap before showing it on-screen.
- final result: long Clicky replies should now stay inside the screen and behave like a ticker-style short guidance bubble instead of an endlessly growing pill.

## 2026-06-06 - Research Mode Clicky Tint

- problem: research mode had no strong visual distinction in the on-screen Clicky overlay.
- suspected cause: the overlay cursor, bubbles, waveform, and spinner all used a hardcoded blue token.
- files touched: `leanring-buddy/DesignSystem.swift`, `leanring-buddy/OverlayWindow.swift`
- fix attempted: added a dedicated research-mode overlay red token and switched the overlay views to compute their tint from `companionManager.isResearchModeEnabled`.
- final result: Clicky now renders red in research mode and stays blue in normal mode.
