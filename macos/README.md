# openPinna Desktop

Native macOS menu bar companion vendored from the Clicky app architecture and rewired to the local `openPinna` backend.

## Local setup

1. Start the web app and backend services:

```bash
npm run dev
```

2. Make sure `OPENAI_API_KEY` is present in your local `.env`.

3. Open the Xcode project:

```bash
open leanring-buddy.xcodeproj
```

4. In Xcode:

- choose the `leanring-buddy` scheme
- set your signing team
- run the app

5. Grant the requested macOS permissions:

- Accessibility
- Microphone
- Screen Recording
- Screen Content

## Runtime wiring

- assistant responses: `POST /api/macos-assistant/respond`
- transcription: `POST /api/macos-assistant/transcribe`
- text to speech: `POST /api/macos-assistant/tts`
- backend health + project list: `GET /api/macos-assistant/status`

## Behavior

- hold `Control + Option` to talk
- double-press `M` to toggle research mode
- research mode persists captured context into `openPinna`

## Notes

- `Info.plist` defaults the backend URL to `http://localhost:3000`
- override `OpenPinnaBackendBaseURL` with a different value in the app bundle or `UserDefaults` if needed
- the vendored project still uses the legacy `leanring-buddy` target and scheme name
