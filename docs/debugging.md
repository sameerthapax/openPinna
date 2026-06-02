# Debugging Log

## Problem
The browser extension overlay, popup, and options page each handled settings too locally. The overlay toggle, close action, theme switch, auto-selected text behavior, and keyboard shortcut were not all backed by the same persisted settings source.

## Suspected Cause
Settings were being read once on mount and then mutated in isolated UI state. The overlay did not subscribe to storage updates, and the shortcut command was not wired to any storage mutation.

## Files Touched
- `extension/src/lib/chrome-storage.ts`
- `extension/src/background/service-worker.ts`
- `extension/manifest.json`
- `extension/src/styles/globals.css`
- `extension/src/components/Button.tsx`
- `extension/src/components/GlassPanel.tsx`
- `extension/src/components/TextInput.tsx`
- `extension/src/components/Toggle.tsx`
- `extension/src/options/OptionsApp.tsx`
- `extension/src/popup/PopupApp.tsx`
- `extension/src/content/OverlayApp.tsx`

## Fix Attempted
- Added settings normalization plus a storage subscription helper.
- Added a shared update helper for partial settings writes.
- Registered a Chrome command that toggles `overlayEnabled` in storage.
- Refactored popup, options, and overlay UI to read the persisted settings snapshot and react to storage changes.
- Added light/dark theme support through CSS variables and theme-aware UI components.
- Made the overlay close button persistently disable the overlay instead of only collapsing local UI state.

## Final Result
- `npm run typecheck` passed in `extension/`.
- `npm run build` passed in `extension/`.
- The overlay now follows the persisted settings state, and the shortcut command toggles the overlay through the same storage source of truth.

## Follow-up
- Chrome rejected the manifest when `suggested_key.mac` used `Command`. The manifest now uses `Ctrl+Shift+P` for macOS too, which Chrome maps to Command on Mac.

## New Issue
- The page console reported `Uncaught (in promise) Error: Extension context invalidated` from the content script on `link.springer.com`.

## New Cause
- The overlay startup path was not defensively handling extension lifecycle invalidation during async settings loading, so a rejected promise could bubble into the page console.

## New Fix
- Added a narrow `unhandledrejection` guard in the content script for the known invalidation message.
- Hardened overlay settings initialization with explicit `catch` handling so startup failures do not surface as uncaught promises.

## New Issue
- Floating bubble logo did not render on page overlays while popup/options branding loaded.
- Next dev showed repeated `Fast Refresh had to perform a full reload due to a runtime error`.

## New Cause
- Content scripts load image assets through page-accessible extension URLs, which need explicit `web_accessible_resources` declarations.
- The dev server warning can persist when local build artifacts are stale after major runtime/layout edits.

## New Fix
- Added `web_accessible_resources` for `icons/openPinnaLogo.png` in the extension manifest.
- Added a graceful fallback in the overlay bubble (`op`) when the logo cannot load.
- Cleared `.next` cache directory before restarting dev.

## New Issue
- After creating a project, `/notes` appeared blank even though project creation succeeded.

## Suspected Cause
- The `/notes` page refactor removed the visible project header/card and only rendered session/note branches. For projects with zero sessions, the canvas had no visible content.

## Files Touched
- `app/notes/page.tsx`

## Fix Attempted
- Restored a visible project card/title block in the canvas for each project.
- Added an explicit empty-state message when a project has no sessions yet.

## Final Result
- Newly created projects are now visible immediately on `/notes`, even before sessions/notes exist.

## New Issue
- Project cards on `/notes` were visible but not clickable to open the project canvas.
- Extension note sync returned HTTP 405 because the background worker still called legacy note/session endpoints.
- Extension UI still showed `Session title`, but sessions are now date-keyed and auto-created.

## Suspected Cause
- Frontend refactor changed project card from link-like behavior to a static container.
- Backend API moved to new routes (`/api/projects/:projectId/sessions/today`, `/api/projects/:projectId/sessions/:sessionId/notes`) but extension worker was still using old routes.
- Extension payload and UI still included the deprecated session title concept.

## Files Touched
- `app/notes/page.tsx`
- `app/api/_lib/services/note.service.ts`
- `app/api/notes/route.ts`
- `app/api/notes/[noteId]/route.ts`
- `extension/src/background/service-worker.ts`
- `extension/src/lib/types.ts`
- `extension/src/content/OverlayApp.tsx`

## Fix Attempted
- Made project card on `/notes` a direct link to `/notes/:projectId`.
- Added `GET /api/notes` and `DELETE /api/notes/:noteId` compatibility handlers for extension popup/history operations.
- Updated extension background save flow to:
  1. call `POST /api/projects/:projectId/sessions/today` (auto-create session)
  2. call `POST /api/projects/:projectId/sessions/:sessionId/notes` with new note payload.
- Removed `sessionTitle` from extension data model and overlay save payload.
- Replaced overlay `Session title` + `Session date` controls with a single read-only session line showing auto-create behavior.

## Final Result
- Project card is now clickable to open the project page.
- Extension save flow targets current API and auto-creates today session when missing.
- Extension UI no longer asks for session title.

## New Issue
- Notes/project/session pages rendered as plain fallback layouts after backend schema refactor.

## Suspected Cause
- Temporary simplified page implementations replaced the original D3/editorial UI layouts during compatibility fixes.

## Files Touched
- `app/notes/page.tsx`
- `app/notes/[projectId]/page.tsx`
- `app/notes/[projectId]/sessions/[sessionId]/page.tsx`
- `app/notes/[projectId]/sessions/[sessionId]/notes/[noteId]/page.tsx`

## Fix Attempted
- Restored the original high-fidelity page compositions and connector-based hierarchy UI.
- Remapped old data fields to new schema fields:
  - `sessionDate -> sessionKey`
  - `title/body/capturedAt -> noteText/createdAt`-derived display values
  - `threads/topicType -> chatThreads/threadType`

## Final Result
- The original UI style and structure is restored while using the new backend schema.

## New Issue
- During navigation (Back button or clicking a card), the app showed no immediate feedback under network throttling; users waited on the previous screen before any loading state appeared.

## Suspected Cause
- Next route-level `loading.tsx` renders when the next segment starts resolving, not exactly at click/back initiation. This created a visible dead zone before fallback UI appeared.

## Files Touched
- `components/navigation/RouteTransitionOverlay.tsx`
- `app/layout.tsx`

## Fix Attempted
- Added a global client-side transition overlay that:
  - starts immediately on internal anchor click capture,
  - starts on browser `popstate` (Back/Forward),
  - stops when pathname/search params update.
- Mounted this overlay once in `app/layout.tsx` so it covers all frontend routes.
- Kept a safety timeout to avoid a stuck overlay if navigation aborts.

## Final Result
- Loading feedback now appears immediately on click/back and blurs the full screen while navigation is in flight, including under throttled network conditions.

## New Issue
- Extension capture saved source URL/title only and did not send the full source metadata JSON to backend source storage.
- Extension note payload mapped `rawThought` to `noteText` and selected text to `userCommentary`; expected mapping was the inverse.

## Suspected Cause
- Background worker only posted directly to notes endpoint and never called source URL ingestion endpoint.
- `extractSourceMetadata()` existed but was not wired into the capture draft sent from overlay to background.
- Note payload fields were assigned in legacy order.

## Files Touched
- `extension/src/lib/types.ts`
- `extension/src/content/OverlayApp.tsx`
- `extension/src/background/service-worker.ts`

## Fix Attempted
- Added `sourceMetadata` to the capture draft type.
- Wired `extractSourceMetadata(pageTitle, pageUrl)` into overlay save payload.
- Updated background save flow to:
  1. create/get today session,
  2. create source via `POST /api/projects/:projectId/sessions/:sessionId/sources/url` using full metadata JSON,
  3. create note with returned `sourceId`.
- Swapped note payload semantics:
  - `noteText` now uses selected text (fallback to raw thought when selection is empty to satisfy validation).
  - `userCommentary` now uses raw thought.
- Extended shared JSON response unwrap helper to support `{ source }` and `{ sources }` envelopes.

## Final Result
- Extension build passes.
- Source metadata now reaches backend source creation route as JSON, including extracted fields (authors/title/abstract/url/etc) and full `metadata` payload.
- Note field mapping now matches requested behavior (`noteText` and `userCommentary` corrected).

## New Issue
- On the project canvas page, session and note cards could visually overlap.
- Sessions were listed oldest-first, but expected behavior is newest session at the top.

## Suspected Cause
- Row height math used a fixed note-card height that did not always match rendered card height, allowing overflow into subsequent rows.
- Session query ordering used ascending `sessionKey`.

## Files Touched
- `app/notes/[projectId]/page.tsx`

## Fix Attempted
- Changed session ordering to `sessionKey: "desc"` so newest sessions render first.
- Made note card layout deterministic with fixed height (`h-[92px]`) and overflow hidden.
- Updated layout constant (`NOTE_CARD_HEIGHT`) to match rendered fixed height.
- Added title truncation to prevent multi-line growth from expanding card height.

## Final Result
- Session and note cards now render in stable vertical columns without overlap.
- Newest session appears at the top of the project canvas.
- `npm run typecheck` passes.

## New Issue
- Long screenshot capture triggered by double-press `M` failed on ACM PDF pages with `MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND`, so no screenshot was saved even though voice start continued.

## Suspected Cause
- Full-page capture stitches many viewport slices in sequence.
- The background worker called `chrome.tabs.captureVisibleTab` too quickly for Chrome's per-second quota while scrolling through long viewer pages.

## Files Touched
- `extension/src/background/service-worker.ts`

## Fix Attempted
- Added pacing between screenshot slices during long capture.
- Added a quota-aware retry path that waits and retries once when Chrome returns `MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND`.
- Kept the screenshot task asynchronous relative to voice start so the added pacing does not block recording startup.

## Final Result
- The screenshot worker now respects Chrome capture pacing better and retries once on quota hits.
- Voice start behavior remains non-blocking while screenshot capture runs in the background.

## New Issue
- Voice-session screenshots still failed on large papers because the extension tried to stitch all captured slices into one giant image, leading to `OffscreenCanvas` zero-size errors and memory pressure.

## Suspected Cause
- The previous screenshot path treated large-page capture as one final image artifact instead of a stream of independent viewport captures.
- Large viewer/document pages could produce invalid or impractically large canvas dimensions.

## Files Touched
- `prisma/schema.prisma`
- `app/api/_lib/services/voice/voice-storage.service.ts`
- `app/api/_lib/services/voice/voice-screenshot.service.ts`
- `app/api/voice-agent/sessions/[sessionId]/screenshots/*`
- `extension/src/background/service-worker.ts`
- `extension/src/content/content-script.tsx`
- `extension/src/content/pageCaptureController.ts`
- `extension/src/voice/screenshotSessionClient.ts`
- `extension/src/voice/screenshotCaptureController.ts`

## Fix Attempted
- Replaced stitched giant-image capture with a dedicated screenshot-session pipeline linked to the same `voiceSessionId` and `audioId` as the audio recording.
- Captured and uploaded each viewport as its own screenshot chunk while audio recording continued independently.
- Added screenshot start/chunk/finalize/cancel backend routes plus new screenshot session/chunk database models.
- Stored screenshot chunks under `./audio/{audioId}/screenshots/chunks/` and finalized them into a manifest instead of merging them into one PNG.
- Added cancellation and scroll restoration so voice stop halts screenshot capture cleanly.

## Final Result
- Screenshot capture is now chunked and stored incrementally instead of relying on one giant `OffscreenCanvas`.
- Audio recording remains independent from screenshot upload/finalize work.

## New Issue
- On `/notes`, session branches and note cards overlapped vertically in the hierarchy map.
- Session ordering showed older sessions first instead of newest-first.

## Suspected Cause
- Row block sizing assumed a much smaller per-note height than the rendered note cards, causing lane collisions.
- Sessions were ordered by ascending `sessionKey`.

## Files Touched
- `app/notes/page.tsx`

## Fix Attempted
- Switched sessions query ordering to `sessionKey: "desc"`.
- Introduced deterministic note layout constants (`NOTE_CARD_HEIGHT = 92`, `NOTE_CARD_GAP = 12`).
- Updated `noteBlockHeight()` to match actual rendered card stack height.
- Set note cards to fixed height with overflow hidden and truncated titles to prevent dynamic growth.

## Final Result
- `/notes` hierarchy now renders session/note columns without overlap.
- Newest session appears at the top.
- `npm run typecheck` passes.

## New Issue
- In the create-session modal, clicking Save gave no specific feedback when today's session already existed.
- Users needed an explicit redirect action to open today's existing session.

## Suspected Cause
- `POST /api/projects/:projectId/sessions/today` always responded with a `session` object and did not indicate whether it was newly created or already existing.
- Modal submit flow always closed on success and had no branch for "already exists" UX.

## Files Touched
- `app/api/_lib/services/session.service.ts`
- `app/api/projects/[projectId]/sessions/today/route.ts`
- `components/navigation/GlobalNavControls.tsx`

## Fix Attempted
- Updated `getOrCreateTodaySession` to return `{ session, created }`.
- Updated sessions/today route to return `201` when created and `200` when existing, with `{ session, created }` payload.
- Updated create-session modal submit flow:
  - if `created === false`, keep modal open,
  - show message "Session for today already exists.",
  - show button "Open today's session" that routes to `/notes/:projectId/sessions/:sessionId`.

## Final Result
- Create-session modal now provides explicit already-exists feedback and direct navigation to today's session.
- Newly created session flow still works and closes modal as before.
- `npm run typecheck` passes.

## New Issue
- Voice session creation succeeds, but finalize returns HTTP 500 before a successful voice note is produced.
- Server logs showed `POST /api/voice-agent/sessions/:sessionId/finalize` without enough surrounding visibility to confirm whether chunk uploads were ever received before finalize.

## Suspected Cause
- The failure may occur in one of several stages: chunk route never hit, chunk route rejected, chunk persisted but transcription failed, or finalize ran with zero stored chunks.
- Existing logs were too thin to identify the failing stage reliably.

## Files Touched
- `app/api/_lib/services/voice/voice-session.service.ts`
- `app/api/voice-agent/sessions/[sessionId]/chunks/route.ts`
- `app/api/voice-agent/sessions/[sessionId]/finalize/route.ts`
- `extension/src/voice/voiceRecordingController.ts`
- `extension/src/voice/voiceSessionClient.ts`

## Fix Attempted
- Added backend logs for:
  - session create request/completion
  - chunk route entry, validation failure, completion, and route-level failure
  - chunk persistence, dedupe, transcription start/success/failure
  - finalize request, loaded session state, zero-chunk failure, combine step, note creation, and finalize completion
- Added extension logs for:
  - controller state at start/stop/chunk/finalize/cleanup transitions
  - chunk upload request/response/failure attempts
  - finalize request/response/failure

## Final Result
- The next repro should show whether finalize is racing ahead of chunk uploads or failing inside the backend finalize path.

## New Issue
- Voice finalize failed with `VOICE_NO_CHUNKS_TO_FINALIZE` even though the extension logged `VOICE_RECORDING_CHUNK_READY` events.

## Suspected Cause
- The offscreen recorder produced valid chunks, but Chrome runtime message serialization did not preserve the `Blob` object across the offscreen-to-background message boundary.
- Background upload code then tried to append a non-Blob value to `FormData`, so every chunk upload failed before any request reached the backend chunk route.
- Separate edge case: if a recording genuinely stops before any `dataavailable` event yields audio, finalize should be skipped with a clear message instead of calling the backend.

## Files Touched
- `extension/src/lib/types.ts`
- `extension/src/offscreen/voiceRecorderOffscreen.ts`
- `extension/src/voice/voiceRecordingController.ts`

## Fix Attempted
- Changed chunk message payloads to send `ArrayBuffer` bytes instead of `Blob`.
- Reconstructed the `Blob` in the background worker before multipart upload.
- Added a no-chunk guard in the controller so truly empty recordings do not call finalize.

## Final Result
- Chunk upload should now reach the backend chunk route instead of failing in `FormData.append()`.
- Very short recordings with zero chunks now fail cleanly on the extension side.

## New Issue
- Voice chunk uploads reached the backend, but every stored chunk file was only 15 bytes and OpenAI transcription failed with `Audio file processing failed`.

## Suspected Cause
- `ArrayBuffer` still did not survive Chrome runtime message serialization as real binary data.
- The background worker rebuilt a `Blob` from an object-like payload, producing tiny placeholder files instead of actual audio bytes.

## Files Touched
- `extension/src/lib/types.ts`
- `extension/src/offscreen/voiceRecorderOffscreen.ts`
- `extension/src/voice/voiceRecordingController.ts`

## Fix Attempted
- Replaced the chunk message payload from `ArrayBuffer` to a plain `number[]` byte array.
- Reconstructed a `Uint8Array` in the background before building the multipart upload `Blob`.

## Final Result
- The next repro should produce chunk files with realistic sizes instead of 15-byte placeholder payloads.

## New Issue
- The first WebM chunk transcribed, but later 5-second chunks failed with `Audio file might be corrupted or unsupported` even though their stored sizes were realistic.

## Suspected Cause
- `MediaRecorder.start(5000)` produced a valid first WebM segment with container headers, but later timeslice chunks were partial WebM clusters that were not reliably decodable as standalone files by the transcription endpoint.

## Files Touched
- `extension/src/offscreen/voiceRecorderOffscreen.ts`

## Fix Attempted
- Replaced timeslice-based chunking with recorder rotation:
  - start a full recorder segment
  - stop it after 5 seconds
  - emit that self-contained chunk
  - start a fresh recorder for the next 5-second segment
- Kept final stop waiting for all pending chunk emits before signaling recording stopped.

## Final Result
- Each uploaded chunk should now be a standalone recording segment instead of a follow-on WebM fragment.

## New Issue
- The extension still required frontend OpenAI verification in Settings and the capture overlay, even though voice transcription now runs entirely through backend env configuration.
- Project availability in the extension also lagged behind the web app after creating a project.

## Suspected Cause
- The settings model still treated OpenAI as a frontend-owned dependency.
- Backend verification only checked `/health`; it did not also sync project state into extension storage.
- Voice enablement did not re-check backend OpenAI reachability at activation time.
- The overlay setup card could be dismissed even when setup was still unresolved.

## Files Touched
- `app/api/_lib/services/voice/voice-transcription.service.ts`
- `app/api/voice-agent/status/route.ts`
- `extension/src/background/service-worker.ts`
- `extension/src/content/OverlayApp.tsx`
- `extension/src/options/OptionsApp.tsx`
- `extension/src/lib/backend.ts`
- `extension/src/lib/types.ts`

## Fix Attempted
- Added `GET /api/voice-agent/status` to verify backend OpenAI reachability and return the current project list.
- Updated backend verification to sync project cache into `chrome.storage.local`.
- Removed frontend OpenAI verification UI from extension settings and overlay capture gating.
- Blocked the voice feature toggle unless backend verification succeeded and at least one cached project exists.
- Re-checked backend OpenAI reachability when voice recording is toggled on.
- Removed the setup prompt cross button and dismiss button so unresolved setup states stay explicit.
- Added automatic project refresh in the settings page when the page regains focus or becomes visible.

## Final Result
- The extension now treats OpenAI as a backend concern, keeps project state cached locally, and only allows voice activation when backend OpenAI reachability and project availability are both satisfied.

## New Issue
- Voice-session screenshots were stored as chunk PNGs plus a manifest, but there was no merged long screenshot to open from the note UI and no linked `Capture` row for the final note.

## Suspected Cause
- Screenshot finalize stopped after chunk storage and manifest generation.
- The screenshot pipeline never merged chunks into a durable `full.png`.
- The voice screenshot session never created a `Capture` or patched the note once screenshot work finished.

## Files Touched
- `app/api/_lib/services/voice/voice-screenshot.service.ts`
- `app/api/_lib/services/voice/voice-storage.service.ts`
- `app/api/captures/[captureId]/route.ts`
- `app/notes/[projectId]/sessions/[sessionId]/notes/[noteId]/page.tsx`
- `components/notes/NotePinnaBoard.tsx`
- `prisma/schema.prisma`
- `README.md`

## Fix Attempted
- Added server-side screenshot finalize merging with `sharp` to create `./audio/{audioId}/screenshots/full.png`.
- Stored `fullImagePath`, `sourceId`, and `captureId` on the screenshot session.
- Created a `Capture` row from the merged PNG and patched the voice session metadata plus the final note with the new `captureId`.
- Added `GET /api/captures/:captureId` so the note UI can open screenshot images directly.
- Added `Open screenshot` links in the note detail UI.

## Final Result
- Screenshot finalize now produces a merged long PNG, links it into `Capture`, and exposes it from the note UI as a direct-open image route.

## New Issue
- Voice-session screenshot output sometimes contained only the final viewport chunk. The chunk directory had a single file like `68.png`, the manifest reported `chunkCount: 1`, and `full.png` only showed that last viewport near the bottom of a huge blank canvas.

## Suspected Cause
- The screenshot controller incremented `chunkIndex` and advanced scroll position even when `captureVisibleTab()` or chunk upload failed.
- Most PDF/page screenshot attempts were failing transiently, likely due Chrome visible-tab capture pacing/quota, so the session skipped forward until one late chunk finally succeeded.
- The backend merge code also tried to smart-place chunks using scroll metadata, which blurred container-based captures and exaggerated the “only last chunk visible” symptom when only one chunk actually existed.

## Files Touched
- `extension/src/voice/screenshotCaptureController.ts`
- `app/api/_lib/services/voice/voice-screenshot.service.ts`

## Fix Attempted
- Added screenshot capture retry/backoff in the extension controller, with explicit handling for `MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND`-style failures.
- Changed the loop so failed captures do not advance `chunkIndex` or scroll progress; the same viewport is retried instead of being skipped.
- Added a repeated-failure cutoff so broken sessions fail cleanly instead of silently producing almost-empty output.
- Simplified `full.png` generation to a raw vertical strip of stored chunk images with no resampling or smart overlap math.

## Final Result
- Screenshot sessions should now store consecutive chunk files instead of only a late survivor chunk, and `full.png` should reflect the saved chunk sequence without the previous blur from smart stitching.

## New Issue
- Voice notes could be created before the screenshot `captureId` was visible to the note creation path, so some notes ended up without a linked screenshot even though screenshot finalize completed.
- Screenshot capture also started from the user’s current scroll position instead of the top of the page.
- Transcription behavior needed to stop acting English-only for non-English pages.

## Suspected Cause
- Voice note creation only trusted `voiceSession.sourceJson.metadata.extensionScreenshot`, which can be stale if screenshot finalize finishes just before note creation reads the session.
- The screenshot controller initialized its first capture at the current `scrollY`.
- The transcription request sent no language hint at all.

## Files Touched
- `extension/src/voice/screenshotCaptureController.ts`
- `extension/src/lib/source-metadata.ts`
- `app/api/_lib/services/voice/voice-session.service.ts`
- `app/api/_lib/services/voice/voice-transcription.service.ts`

## Fix Attempted
- Changed screenshot capture to always start at scroll position `0` and restore the original position afterward.
- Made screenshot stop wait for the background screenshot task to finish finalizing before voice finalize proceeds.
- Updated voice note creation to read fresh `sourceId` and `captureId` directly from `voice_screenshot_sessions`, with `sourceJson` only as fallback.
- Added page language metadata from the content page and passed a normalized language hint into the transcription request when available.

## Final Result
- Screenshot capture now prioritizes the top of the page, note creation should pick up the screenshot `captureId` more reliably on first write, and transcription can include a non-English language hint instead of behaving like English-only capture.

## New Issue
- PDF pages still followed the HTML screenshot/page-context path, so OpenPinna tried to measure, scroll, and chunk browser PDF tabs instead of storing the PDF file itself as one artifact.
- ResearchGate-style PDFs were especially brittle because backend or external fetches could return `403` even when the user was already viewing the file in the browser.

## Suspected Cause
- The extension had no resilient PDF-tab detector and no extension-side PDF artifact fetch flow.
- The backend capture model only assumed image-style uploads and stored them through screenshot-oriented fields.
- Voice screenshot capture started page measurement immediately, with no early branch for PDF documents.

## Files Touched
- `prisma/schema.prisma`
- `app/api/_lib/storage.ts`
- `app/api/_lib/services/capture.service.ts`
- `app/api/_lib/services/voice/voice-screenshot.service.ts`
- `app/api/_lib/validation.ts`
- `app/api/sources/[sourceId]/captures/route.ts`
- `app/api/captures/[captureId]/route.ts`
- `app/api/voice-agent/sessions/[sessionId]/screenshots/pdf/route.ts`
- `app/api/projects/[projectId]/sessions/[sessionId]/sources/[sourceId]/screenshots/route.ts`
- `extension/src/lib/pdf.ts`
- `extension/src/lib/pdf-capture.ts`
- `extension/src/lib/source-metadata.ts`
- `extension/src/lib/types.ts`
- `extension/src/background/service-worker.ts`
- `extension/src/voice/screenshotCaptureController.ts`
- `extension/src/voice/screenshotSessionClient.ts`
- `app/notes/[projectId]/sessions/[sessionId]/notes/[noteId]/page.tsx`
- `components/notes/NotePinnaBoard.tsx`

## Fix Attempted
- Added PDF detection helpers for direct `.pdf` URLs, query-string PDFs, and browser PDF viewer wrapper URLs.
- Added an extension-side PDF fetch path with `credentials: "include"`, `%PDF` signature validation, filename derivation, and explicit `[openPinna][pdf]` logging.
- Short-circuited the voice screenshot controller before page measurement when the active tab is a PDF.
- Added backend PDF artifact ingestion so captures can store `application/pdf` alongside image formats, with typed capture metadata such as `artifactType`, `captureMode`, `mimeType`, `storagePath`, `originalUrl`, and `fileName`.
- Updated manual save so PDF tabs upload a PDF artifact and link it to the created note instead of relying on selected text.
- Updated note UI links so PDF artifacts are labeled as PDFs instead of screenshots.

## Final Result
- Normal HTML pages keep the existing screenshot/page-context behavior.
- PDF pages now use an extension-side fetch/upload flow and store a single linked PDF artifact without chunking, OCR, selected text capture, or scroll-based screenshot work.
- If the browser cannot fetch the PDF directly, the extension returns a clear manual-upload message instead of falling back to webpage screenshots.

## New Issue
- Voice and PDF capture could create duplicate artifacts for the same URL when the same page was captured more than once in the same session.
- This caused unnecessary screenshot/PDF work and left later notes pointing at newly-created duplicate captures instead of reusing the original artifact.

## Suspected Cause
- The extension always started the screenshot/PDF artifact path without first checking whether the current session already had a matching source URL or PDF URL with a stored capture.
- Reuse logic only existed indirectly through `sourceJson.metadata.extensionScreenshot`, so first-party backend captures were not being queried before recapture.

## Files Touched
- `app/api/_lib/services/capture.service.ts`
- `app/api/projects/[projectId]/sessions/[sessionId]/captures/by-url/route.ts`
- `extension/src/background/service-worker.ts`

## Fix Attempted
- Added a backend lookup that finds the latest capture for a matching source `url` or `pdfUrl` within the current project session.
- Added a background helper that resolves today's session, checks for an existing capture by URL, and reuses it when present.
- Short-circuited voice screenshot startup when an existing capture already exists, and patched the voice session `sourceJson` with the reused `sourceId` and `captureId`.
- Reused an existing PDF capture during manual PDF note save instead of uploading a duplicate artifact.

## Final Result
- OpenPinna now skips redundant screenshot/PDF capture for URLs that already have a stored artifact in today's session and links the existing `captureId` into the new note instead.
