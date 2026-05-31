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
