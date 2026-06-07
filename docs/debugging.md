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

- Pinna tool execution was creating `ToolCall` rows with `threadId` and `messageId` set to `undefined`.
- The observer run failed with OpenAI `invalid_json_schema` errors when the structured output schema used a dynamic `payload` object.

## Suspected Cause

- Tool execution depended on SDK run-context plumbing that was not actually populated in the live run path.
- The observer used a Zod object with passthrough/dynamic keys, which the OpenAI JSON schema validator rejected.

## Files Touched

- `src/agents/openai/openai-agent-runner.ts`
- `src/agents/observer/pinna-observer.ts`

## Fix Attempted

- Moved tool execution to the outer turn context that already contains `threadId`, `userMessageId`, and `pinnaTemplateKey`.
- Changed the observer to return a JSON string and parse it locally instead of relying on a structured-output schema with dynamic keys.

## Final Result

- Tool calls now receive stable thread/message identifiers from the turn context.
- Observer decisions no longer fail OpenAI schema validation on `payload`.

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

- The note research board rendered too shallow, selected text could not behave as a proper long-form evidence panel, and the central note modal overloaded the right rail with too much context.
- The knowledge build area also read like equal cards instead of a clear synthesis brief.

## Suspected Cause

- The board and selected-text panel used short viewport heights intended for compact cards rather than a full reading workspace.
- The central note modal grouped nearly all provenance, artifacts, audio, and metadata into one narrow sidebar.
- The knowledge build used a flat three-card grid without a primary reading hierarchy.

## Files Touched

- `components/notes/NotePinnaBoard.tsx`
- `components/notes/NoteKnowledgeBuildPanel.tsx`
- `app/notes/[projectId]/sessions/[sessionId]/notes/[noteId]/page.tsx`

## Fix Attempted

- Raised the pinna board to an `80dvh` minimum with a `90dvh` cap and aligned the selected-text panel to the same reading height.
- Kept selected text in its own independently scrollable panel.
- Rebuilt the central note modal into a warmer dossier layout:
  - moved source/authors/publication context into the main narrative column,
  - reduced the right rail to links, capture artifacts, and voice media,
  - added clearer section hierarchy and balanced scrolling containers.
- Redesigned the knowledge build into an editorial brief with:
  - a lead summary,
  - a larger findings section,
  - separate interpretation and conclusion blocks,
  - a small metadata rail.

## Final Result

- The note board now occupies a stable reading workspace.
- Long selected text scrolls cleanly without collapsing the page.
- The central note modal is more balanced and informative, with less crowding in the right rail.
- The knowledge build reads as a synthesis document instead of a generic card row.

## New Issue

- Author names were still missing on the note research page even when the linked note knowledge record had author data.
- Dragging pinna cards caused the connector line to stay with the cursor while the card itself visibly lagged behind.

## Suspected Cause

- The note page only read authors from `source.authors` and metadata fallbacks, but not from `linkedNoteKnowledge.authors` / `noteKnowledge.authors`.
- Draggable pinna cards used `transition-all`, so every `left` and `top` update from the D3 drag handler was being animated.

## Files Touched

- `app/notes/[projectId]/sessions/[sessionId]/notes/[noteId]/page.tsx`
- `components/notes/NotePinnaBoard.tsx`

## Fix Attempted

- Changed author precedence so the note page reads authors from note knowledge first, then falls back to source authors and source metadata author-like fields.
- Narrowed pinna card transitions to visual-only properties (`background-color`, `transform`, `box-shadow`) so D3 position updates render immediately under the cursor.

## Final Result

- Authors now render from the note knowledge record whenever present.
- Pinna cards now move in sync with the connector line during drag instead of trailing behind it.

## Problem

- Screenshot OCR still used the OpenAI vision path, which made the OCR stage remote-dependent and mixed OCR with the downstream text-structuring steps.

## Suspected Cause

- `noteKnowledgeWorker` called `extractVisibleTextFromScreenshot(...)` from the OpenAI processing client for each screenshot chunk.
- OCR lifecycle, chunk persistence, and text finalization responsibilities were not separated cleanly.

## Files Touched

- `src/processing/localScreenshotOcr.ts`
- `src/processing/openaiProcessingClient.ts`
- `src/processing/workers/noteKnowledgeWorker.ts`
- `src/processing/processingTypes.ts`
- `src/processing/processingJobRepository.ts`

## Fix Attempted

- Added a dedicated local OCR helper backed by `tesseract.js`.
- Moved screenshot OCR off the OpenAI client so OpenAI remains only for screenshot finalization and knowledge generation.
- Kept OCR persistence on `VoiceScreenshotChunk` and finalization persistence on `VoiceScreenshotSession`.
- Simplified the processing job record interface so the active worker path stays centered on the single note-level job.

## Final Result

- Screenshot OCR now runs through local `tesseract.js` and stores `ocrModel` as a stable local identifier.
- The note job still follows the same resumable four-step flow.
- Downstream screenshot finalization and knowledge upsert still use OpenAI text structuring.

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

## New Issue

- Voice screenshot capture failed immediately for all sites with `POST /api/voice-agent/sessions/:sessionId/screenshots/start` returning HTTP 404.

## Suspected Cause

- The extension screenshot client was correctly calling the `screenshots/start`, `screenshots/chunks`, `screenshots/finalize`, `screenshots/pdf`, and `screenshots/cancel` endpoints.
- The backend had the screenshot service implementation but never exposed the matching `app/api/voice-agent/.../screenshots/*` route handlers, so every screenshot flow failed before any capture logic ran.

## Files Touched

- `src/agents/core/agent-types.ts`
- `src/agents/core/agent-orchestrator.ts`
- `src/agents/observer/abstract-observer.ts`
- `src/agents/observer/observer-rules.ts`
- `src/agents/observer/pinna-observer.ts`
- `app/api/_lib/workers/index.ts`
- `docs/debugging.md`

## Fix Attempted

- Split observer output into:
  - `shouldRebuildKnowledge`
  - `shouldRunChainRebuild`
- Changed observer batching from raw `messages.length % 30 === 0` to a cursor-based unobserved window check:
  - exactly 30 unobserved messages
  - exactly 15 `user` and 15 `assistant`
- Added observer cursor persistence via `lastObservedMessageId` on the `observer_window_summary` event payload.
- Passed the previous observer summary into the next observer batch prompt so the new summary can extend the prior batch instead of forgetting it.
- Updated the observer prompt to summarize the exact 30-message batch window rather than the old "last 10 messages" behavior.
- Split thread knowledge rebuild from downstream chain rebuild so the observer can request:
  - no rebuild
  - thread knowledge rebuild only
  - thread knowledge rebuild plus note/session/project chain refresh

## Final Result

- The claim thread can stay note-scoped while the observer now evaluates balanced 30-message windows instead of any arbitrary multiple-of-30 thread length.
- Observer summaries now chain from the last observer summary when one exists.
- Knowledge rebuild and downstream chain rebuild are now separate decisions in code instead of being forced together.
- `npm run typecheck` passed.

## New Issue

- Mem0 was reported as failing with 502s during local testing.

## Suspected Cause

- In this workspace, `.env` points `MEM0_BASE_URL` to `http://localhost:9003`, but a direct local probe to `http://localhost:9003/docs` and `POST /search` failed with connection refusal, which means the Mem0 service is currently unavailable from the app runtime here.
- The current adapter already degrades when Mem0 is unavailable, but it cannot recover if the service itself is down or the container is not reachable.

## Files Touched

- `docs/debugging.md`

## Fix Attempted

- Verified the configured Mem0 base URL from local env.
- Probed the local Mem0 HTTP endpoint and confirmed it is not currently reachable in this environment.

## Final Result

- No Mem0 code-path regression was required to explain the current local failure.
- The remaining Mem0 issue is environmental until the service on `http://localhost:9003` is reachable again.

## New Issue

- Claim pinna responses to a plain greeting could start with meta text such as explaining that it was "using the claim skill".
- There was no note-scoped tool for retrieving the pinna's selected base knowledge version.

## Suspected Cause

- The runtime prompt emphasized role enforcement but did not explicitly forbid meta explanations about internal skill selection on low-signal inputs like `hello`.
- Tool metadata only covered placeholder claim/evidence helpers and did not expose the selected `NoteBaseKnowledgeVersion` bound to the current pinna.

## Files Touched

- `app/api/_lib/services/tool-registry.service.ts`
- `prisma/seed.ts`
- `src/agents/skills/skill-loader.ts`
- `skills/claim/SKILL.md`

## Fix Attempted

- Added a note-scoped `get_pinna_base_knowledge` tool handler that returns the current thread's `selectedBaseKnowledgeVersion`.
- Added the tool to seed metadata and granted it to all pinna templates, including `claim`.
- Tightened prompt-building rules so agents do not mention skills, internal prompts, or role selection unless the user explicitly asks.
- Added an explicit greeting rule to the claim skill so a plain greeting stays brief and natural.

## Final Result

- The claim pinna prompt now discourages the unwanted "I'm using the claim skill..." preamble.
- The backend now has an implementation for retrieving pinna-level base knowledge through a note-scoped tool.
- `npm run typecheck` passed.

## Follow-up

- The new tool will not be callable in an existing database until the `tools` and `agent_tool_permissions` rows are updated from the new seed data or inserted equivalently.

## New Issue

- The claim pinna prompt still did not explain the meaning of `Template prompt`, `Note text`, `Selected text`, and `Source title` clearly enough, so the runtime could stay too meta or too generic instead of acting like a note-thread claim agent.
- The chat modal opened at the top of the loaded history and used a blocking overlay spinner while waiting for replies, which made the interaction feel unlike a real chat app.
- Note pages were also loading full thread message histories eagerly instead of starting from the latest window and paging older messages on demand.

## Suspected Cause

- The prompt builder enforced role constraints but did not define the app context, the purpose of the current turn, or the exact semantics of each provided field.
- The chat route returned an assistant string shape that did not match the UI's expectation of a full assistant message object.
- The note page preloaded thread messages without a latest-window contract, and the chat modal had no reverse infinite-scroll path for older messages.

## Files Touched

- `src/agents/core/agent-types.ts`
- `src/agents/openai/responses-agent-runner.ts`
- `src/agents/skills/skill-loader.ts`
- `skills/claim/SKILL.md`
- `app/api/_lib/services/chat.service.ts`
- `app/api/threads/[threadId]/route.ts`
- `app/api/threads/[threadId]/messages/route.ts`
- `app/api/_lib/services/pinna-instance.service.ts`
- `app/notes/[projectId]/sessions/[sessionId]/notes/[noteId]/page.tsx`
- `components/notes/NotePinnaBoard.tsx`
- `app/globals.css`

## Fix Attempted

- Added an explicit app contract and context-definition block to the runtime prompt builder so the claim pinna understands:
  - what role it performs in openPinna,
  - what it is building on each turn,
  - what each provided context field means.
- Expanded the claim skill text with app-role and context-semantics guidance.
- Changed thread APIs to serve message pages from the latest 100 messages and to fetch older history using a cursor based on `beforeCreatedAt` and `beforeMessageId`.
- Changed the note page preload to hydrate each thread with only its latest 100 messages plus a `hasOlderMessages` flag.
- Reworked the pinna chat modal so it:
  - opens anchored to the latest messages,
  - loads older messages when scrolling upward,
  - uses an in-thread typing bubble instead of a blocking loading overlay.
- Fixed the send-message route to return the assistant message object expected by the UI.

## Final Result

- The claim agent prompt is now much more explicit about its app role and the meaning of the provided note context.
- The pinna chat opens on the newest messages instead of the top of the thread.
- Older history now loads progressively with reverse infinite scroll instead of full eager hydration.
- Waiting for a reply now presents as an iMessage-style typing indicator inside the conversation.
- `npm run typecheck` passed.

## New Issue

- A note with 8 pinnas only rendered 5 on the research board.
- After creating a new pinna, opening it, and sending a message, the chat modal could disappear and the new pinna could appear missing from the board.

## Suspected Cause

- The board hydration path still hard-capped `initialPinnas` to `slice(0, 5)`.
- The board also replaced the entire local `nodes` state from `initialPinnas` during hydration, which could drop a just-created client-side pinna before the server-provided props caught up.

## Files Touched

- `components/notes/NotePinnaBoard.tsx`
- `docs/debugging.md`

## Fix Attempted

- Removed the `slice(0, 5)` cap so all pinnas from the note are eligible to render.
- Changed board hydration to merge server-provided pinnas with current client-side nodes instead of overwriting local state wholesale.
- Preserved existing node positions and in-memory messages when the same pinna is rehydrated.
- Updated the `add-pinna` event handler to:
  - update an existing node when the same pinna id is seen again,
  - auto-open the newly created pinna chat modal.

## Final Result

- The board now renders all pinnas instead of only the first 5.
- Newly created pinnas are less likely to disappear during the client/server handoff window because local nodes are preserved across hydration updates.
- `npm run typecheck` passed.

## New Issue

- Claim-agent replies still sometimes started with visible self-alignment text such as:
  - `I'm using the claim-focused pinna skill...`
  - `I'm going to stay in the claim-analysis role...`

## Suspected Cause

- This did not appear to be a separate hidden OpenAI field being merged incorrectly.
- The model was emitting the self-reminder directly into the visible assistant reply, and the runtime returned `output_text` as-is.

## Files Touched

- `src/agents/openai/responses-agent-runner.ts`
- `src/agents/skills/skill-loader.ts`

## Fix Attempted

- Changed the runtime contract so the model returns a JSON object rather than free-form text.
- Required this shape:
  - `internal`: hidden self-guidance, self-checks, or role reminders
  - `reply`: the actual user-facing assistant message
- Updated the assistant response parser to extract `reply` from the JSON payload and ignore `internal`.
- Kept a raw-text fallback so the app still works if a model run does not produce valid JSON.

## Final Result

- The model can still reassure or align itself internally, but only `reply` is surfaced to the user.
- `npm run typecheck` passed.

## New Issue

- The first live send after switching to `text.format: { type: "json_object" }` failed with OpenAI HTTP 400:
  - `Response input messages must contain the word 'json' in some form to use 'text.format' of type 'json_object'.`

## Suspected Cause

- The runtime added JSON output mode through the Responses API, but the actual input message array did not contain the word `json`.
- OpenAI validates `json_object` mode against the request input content, not just the separate `instructions` string.

## Files Touched

- `src/agents/openai/responses-agent-runner.ts`

## Fix Attempted

- Prepended a system message to the response input that explicitly says to return `json` only and repeats the exact object shape.

## Final Result

- The Responses API request now satisfies the `json_object` validation requirement at the input-message layer.
- `npm run typecheck` passed.

- `app/api/voice-agent/sessions/[sessionId]/screenshots/start/route.ts`
- `app/api/voice-agent/sessions/[sessionId]/screenshots/chunks/route.ts`
- `app/api/voice-agent/sessions/[sessionId]/screenshots/finalize/route.ts`
- `app/api/voice-agent/sessions/[sessionId]/screenshots/pdf/route.ts`
- `app/api/voice-agent/sessions/[sessionId]/screenshots/cancel/route.ts`
- `docs/debugging.md`

## Fix Attempted

- Added the missing screenshot route tree under `app/api/voice-agent/sessions/[sessionId]/screenshots/`.
- Matched each route to the existing screenshot service methods already used by the extension payload contracts.
- Added request validation for screenshot start and chunk upload paths plus route/session consistency checks.

## Final Result

- The backend now exposes the screenshot endpoints the extension expects, so screenshot capture can proceed past the previous 404 failure path.

## New Issue

- Screenshot processing only ran for one chunk image, then stalled with aggregate finalize and note knowledge repeatedly deferring.

## Suspected Cause

- Processing job dedupe treated `screenshotProcessingId` as a unique key for `process_screenshot_chunk`, so enqueuing many chunk jobs collapsed into one active outbox row.
- The screenshot processor also had no cap on how many stored chunks it would enqueue for OpenAI processing.

## Files Touched

- `src/processing/processingJobRepository.ts`
- `src/processing/screenshotProcessing.ts`
- `docs/debugging.md`

## Fix Attempted

- Changed job dedupe strategy to use job-type-specific identity:
  - `process_screenshot_chunk` dedupes by `screenshotChunkProcessingId`
  - `finalize_screenshot_processing` dedupes by `screenshotProcessingId`
  - `process_note_knowledge_base` dedupes by `noteId`
- Limited screenshot chunk processing to the first 40 chunks ordered by ascending `chunkIndex`.
- Removed stale outbox rows and stale chunk-processing rows for chunks outside the selected first-40 set.

## Final Result

- Each selected screenshot chunk now gets its own processing job instead of collapsing into one.
- Screenshot processing only sends the earliest 40 chunks to OpenAI, based on chunk index order.
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

## Problem

- Screenshot knowledge processing fanned out into child processing jobs and mixed OCR with selected text in the same model prompt, which let non-visible selected text leak into screenshot OCR results.

## Suspected Cause

- The runtime treated screenshot chunk OCR and screenshot finalization as independent `ProcessingJobOutbox` jobs instead of resumable state inside the note job.
- OCR prompts included selected text and page metadata in the same multimodal call, so the model could echo text that was not actually visible in the screenshot image.

## Files Touched

- `prisma/schema.prisma`
- `prisma/migrations/20260603120000_single_note_job_pipeline/migration.sql`
- `src/processing/index.ts`
- `src/processing/openaiProcessingClient.ts`
- `src/processing/processingJobRepository.ts`
- `src/processing/processingScheduler.ts`
- `src/processing/processingTypes.ts`
- `src/processing/workers/noteKnowledgeWorker.ts`
- `scripts/validate-processing-repository.ts`

## Fix Attempted

- Added per-chunk OCR persistence fields to `VoiceScreenshotChunk` and screenshot finalization fields to `VoiceScreenshotSession`.
- Collapsed processing job types back to `process_note_knowledge_base` only and moved step/progress state into the note job payload.
- Rewrote `processNoteKnowledgeJob` into a four-step resumable state machine:
  - `retrieval`
  - `screenshot_ocr`
  - `screenshot_finalize_info`
  - `knowledge_upsert`
- Replaced screenshot OCR with a strict image-only prompt that extracts visible text only.
- Moved screenshot summarization/context building into a separate text-only finalization pass over successful OCR chunk rows.
- Removed runtime use of screenshot child-job orchestration and updated the processing validation script for the new payload shape.

## Final Result

- The processing pipeline now keeps a single note-level outbox/history job and resumes from payload state instead of spawning screenshot child jobs.
- OCR results persist directly on `VoiceScreenshotChunk`, screenshot finalization persists on `VoiceScreenshotSession`, and note knowledge now reads finalized screenshot info from the session row.
- `npm run db:generate` passed.
- `npm run typecheck` passed.

## Follow-up

- `npx prisma migrate dev --create-only --name single_note_job_pipeline` could not run because the local Postgres at `localhost:9001` was unavailable during this task.
- The added migration SQL in `prisma/migrations/20260603120000_single_note_job_pipeline/migration.sql` was generated with `prisma migrate diff` from the schema delta and still needs to be applied against a running database.
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

## New Issue

- Screenshot chunk uploads could fail on some normal websites with `Expected integer, received float`, causing repeated chunk retry failures and eventually aborting the screenshot session.

## Suspected Cause

- Some pages return fractional `window.scrollY`, `scrollTop`, or viewport/document metrics, especially under zoomed layouts or transformed scrolling containers.
- The backend screenshot metadata schema intentionally requires integer values for `scrollY`, `viewportWidth`, `viewportHeight`, and `documentHeight`, but the extension was forwarding raw browser measurements without normalization.

## Files Touched

- `extension/src/content/pageCaptureController.ts`
- `extension/src/voice/screenshotCaptureController.ts`

## Fix Attempted

- Added integer normalization for measured scroll positions and viewport/document dimensions inside the content-side page capture controller.
- Normalized screenshot controller metrics and actual scroll results again before building chunk metadata and upload payloads.
- Kept backend validation strict instead of loosening the schema, so bad metadata is corrected at the capture boundary.

## Final Result

- Screenshot chunk metadata now stays integer-safe on sites that expose fractional scroll values, so the upload route should stop rejecting normal webpage captures with `Expected integer, received float`.

## New Issue

- Pinna identity and note knowledge versioning were still centered on `ChatThread` and a mutable singleton `NoteKnowledge` row, so each pinna did not have its own first-class versioned knowledge lineage.
- Local verification could not produce a normal Prisma `migrate dev` artifact because the configured Postgres instance at `localhost:9001` was unreachable from this environment.

## Suspected Cause

- Earlier architecture introduced thread-scoped knowledge builds before pinna became a first-class entity, leaving base note knowledge and derived pinna knowledge split across incompatible ownership models.
- The local database/container expected by `DATABASE_URL` was not accepting connections during migration generation.

## Files Touched

- `prisma/schema.prisma`
- `prisma/migrations/20260604120000_pinna_note_base_versioning/migration.sql`
- `app/api/_lib/services/pinna-instance.service.ts`
- `app/api/_lib/services/chat.service.ts`
- `app/api/_lib/services/knowledge.service.ts`
- `app/api/_lib/services/note.service.ts`
- `app/api/_lib/workers/index.ts`
- `src/processing/workers/noteKnowledgeWorker.ts`
- `app/api/notes/[noteId]/threads/route.ts`
- `app/api/_lib/validation.ts`
- `app/notes/[projectId]/sessions/[sessionId]/notes/[noteId]/page.tsx`
- `components/notes/NotePinnaBoard.tsx`
- `components/navigation/GlobalNavControls.tsx`
- `components/notes/NoteKnowledgeBuildPanel.tsx`

## Fix Attempted

- Added first-class `Pinna`, immutable `NoteBaseKnowledgeVersion`, `NoteBaseKnowledgeHead`, and pinna-owned knowledge event/build/head/node/edge/summary models in Prisma.
- Added a compatibility service that backfills note base heads from legacy `NoteKnowledge` rows and materializes `Pinna` records for legacy threads on demand.
- Updated note processing so each note knowledge regeneration creates a new immutable base version and advances the note head while still updating legacy `NoteKnowledge` as a compatibility cache.
- Updated pinna creation to require a resolved note base version and added frontend base selection between the first and current note base when multiple versions exist.
- Updated board/chat flows so layout is keyed by `pinna.id`, while conversation transport still uses the attached `threadId`.
- Redirected thread message events and build snapshots into pinna-owned knowledge events and pinna knowledge builds.
- Generated a Prisma schema diff SQL migration from the previous checked-in schema because live `migrate dev` could not connect to the configured Postgres instance.

## Final Result

- The app now treats `Pinna` as the first-class knowledge owner.
- Notes now accumulate immutable base knowledge versions with a current head pointer.
- New pinnas bind to an explicit note base version at creation time and maintain their own versioned derived knowledge lineage on top of that base.
- TypeScript compiles successfully with the new model and UI flow.
- Full Prisma migration application against a live database is still pending because `localhost:9001` was unreachable during this task.

## New Issue

- Pinna and observer turns were still implemented through `@openai/agents`, and skill bundles were only being read locally instead of being attached through the standard OpenAI skill mechanism.

## Suspected Cause

- The runtime entrypoints were built around the older Agents SDK abstraction, which hid the Responses API tool loop and made it awkward to sync skills to OpenAI-hosted bundles.

## Files Touched

- `src/agents/openai/openai-client.ts`
- `src/agents/openai/skill-sync.ts`
- `src/agents/openai/responses-agent-runner.ts`
- `src/agents/observer/pinna-observer.ts`
- `src/agents/core/agent-types.ts`
- `src/agents/core/pinna-agent-config.ts`
- `README.md`
- `docs/architecture.md`

## Fix Attempted

- Replaced the pinna runtime with the standard Responses API.
- Added an OpenAI skill sync layer that uploads local `skills/<skill-key>` bundles and caches the remote skill IDs locally.
- Attached the synced skill to the `shell` tool environment so OpenAI can mount and execute the skill during a turn.
- Switched the observer to the same Responses API path with JSON-object output parsing.

## Final Result

- Pinna and observer turns now run through the standard Responses API.
- Skills remain filesystem-backed in the repo, but the runtime attaches them through OpenAI skill references instead of relying on the older Agents SDK wrapper.

## New Issue

- The pinna chat modal still appeared mostly light in dark mode even after the delete button styling changed.

## Suspected Cause

- The active chat modal was still using light-mode gradient background images on its major containers.
- `dark:bg-*` color overrides were not enough because the light background-image layers were still rendering underneath.

## Files Touched

- `components/notes/NotePinnaBoard.tsx`

## Fix Attempted

- Reworked the active pinna chat modal to use explicit dark-mode gradient surfaces across:
  - the outer modal shell,
  - the main chat panel,
  - the context sidebar,
  - message bubbles,
  - the composer,
  - the delete error state,
  - the close and delete buttons.
- Kept the light-mode treatment unchanged while mapping dark mode to the app's warm dark palette tokens and darker brown-black surfaces.

## Final Result

- The active pinna chat modal now renders as a true dark-theme surface instead of a cream modal with a dark button overlay.
- `npm run typecheck` passed after the change.

## New Issue

- The active pinna chat modal stopped reacting reliably to the light/dark switch and could remain dark even when the rest of the app was back in light mode.

## Suspected Cause

- Theme state was not flowing through React component state.
- The app shell toggled the global `html.dark` class, but `NotePinnaBoard` did not subscribe to any shared theme state and only relied on CSS selectors.
- `ThemeModeToggle` also kept its own isolated local state, so the navigation control and modal were not bound to one shared source of truth.

## Files Touched

- `app/layout.tsx`
- `components/navigation/ThemeProvider.tsx`
- `components/navigation/ThemeModeToggle.tsx`
- `components/notes/NotePinnaBoard.tsx`

## Fix Attempted

- Added a client-side `ThemeProvider` that owns the `light` / `dark` mode state and keeps `html.dark`, `data-theme`, and `localStorage` in sync.
- Wrapped the main app shell in that provider from `app/layout.tsx`.
- Refactored `ThemeModeToggle` to consume shared theme context instead of maintaining a separate local theme state.
- Updated `NotePinnaBoard` to consume the shared theme mode and switch the active pinna chat modal surfaces from React state, rather than depending only on `dark:` utility variants.

## Final Result

- The app shell, nav toggle, and active pinna chat modal now share the same theme source of truth.
- Switching light/dark mode triggers a React update in the chat modal, so the modal follows the app theme immediately.

## New Issue

- Pinna thread turns started failing with OpenAI Responses API `400` errors stating that input messages must contain the word `json` when using `text.format` with `json_object`.

## Suspected Cause

- The runner was setting `text.format: { type: "json_object" }` and including JSON instructions in the top-level `instructions` field, but the actual conversation `input` array did not include any message containing the word `json`.
- The Responses API validation appears to enforce that requirement against the input messages themselves.

## Files Touched

- `src/agents/openai/responses-agent-runner.ts`
- `docs/debugging.md`

## Fix Attempted

- Prepended a system message to the Responses API conversation input that explicitly says to return json only and provides the exact expected json object shape.

## Final Result

- Pinna thread requests now include `json` in the conversation input alongside the existing `json_object` format request, which should satisfy the Responses API validation.
- Follow-up verification required by sending a thread message through `/api/threads/:threadId/messages`.

## New Issue

- Mem0 pinna deletion returned `400` with `At least one identifier is required.` even though openPinna was sending `user_id` during `DELETE /memories`.

## Suspected Cause

- The local Mem0 server expects the identifier on the query string for `DELETE /memories` rather than in the JSON request body.

## Files Touched

- `src/agents/memory/mem0-provider.ts`
- `docs/debugging.md`

## Fix Attempted

- Changed the Mem0 delete request to call `/memories?user_id=pinna:...` using `URLSearchParams` and removed the JSON request body from the `DELETE` call.

## Final Result

- openPinna now sends Mem0 deletes in the same shape as the working curl example: `DELETE /memories?user_id=pinna:...`.
- Follow-up verification required by deleting a pinna and confirming the Mem0 server returns `2xx`.
