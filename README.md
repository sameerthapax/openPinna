# openPinna

<img src="public/icons/openPinnaLogo.png" alt="openPinna logo" width="96" />

openPinna is a browser-based research note-taking app for solo researchers. The MVP focuses on manual capture: save a source URL, source title, selected text, raw thought, tags, and placeholder AI structure for later synthesis.

## Problem Statement

Research notes often lose the context that made them useful: the article URL, the exact passage, the reader's immediate thought, and why the idea mattered. openPinna keeps those pieces together so future AI features can reason over grounded research context.

## MVP Features

- Manual research note creation
- Source URL and source title capture
- Selected text and raw thought fields
- Placeholder AI-generated structure fields
- Tags and timestamps
- Notes list view
- Prisma PostgreSQL data model
- Zod validation before database writes
- Chrome Extension MVP for browser-side research capture

## Future Vision

Later versions will add a browser extension, selected-text capture from pages and PDFs, voice-to-note capture, real AI note structuring, embeddings, semantic search, and a research graph that helps connect ideas across sessions.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn-style local UI primitives
- Prisma
- PostgreSQL
- Zod
- React Hook Form
- ESLint
- Prettier
- Chrome Extension Manifest V3
- Vite

## Setup

Install dependencies:

```bash
npm install
```

Create an environment file:

```bash
cp .env.example .env
```

Update `DATABASE_URL` in `.env` if your local PostgreSQL credentials differ.

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma |
| `REDIS_URL` | Redis connection used by BullMQ workers |
| `UPLOAD_DIR` | Local upload root for source/capture files |
| `VOICE_UPLOAD_DIR` | Local voice audio root, defaults to `./audio` |
| `OPENAI_API_KEY` | Required for backend voice transcription |
| `OPENAI_TRANSCRIPTION_MODEL` | Optional transcription model override |

## Database Setup

Start local infrastructure first (Postgres + Redis via Docker):

```bash
npm run docker:up
```

Generate Prisma Client:

```bash
npm run db:generate
```

Run the first migration:

```bash
npm run db:migrate -- --name init
```

Optional Prisma Studio:

```bash
npm run db:studio
```

## Development Commands

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run format
```

## Chrome Extension MVP

The extension lives in `extension/` as a standalone Vite + React + TypeScript package. It injects a floating capture overlay into web pages, keeps extension settings in `chrome.storage.local`, and sends captured notes to the backend API route you configure in the options page.

The openPinna logo used across the web app, popup bubble, overlay bubble, extension icon, and README lives at `public/icons/openPinnaLogo.png` in the repository root and `extension/public/icons/openPinnaLogo.png` inside the extension package.

Install extension dependencies:

```bash
cd extension
npm install
```

Build the extension:

```bash
npm run build
```

Load the unpacked extension in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select `extension/dist`.

Test the overlay:

1. Visit an article, paper, docs page, or other normal `http://` or `https://` web page.
2. Highlight a passage.
3. Click the openPinna floating bubble in the lower-right corner.
4. Add a research thought and optional tags.
5. Make sure the backend API URL is set in the extension options page.
6. Save the note.
7. Open the extension popup to see the latest synced capture.

Current extension limitations:

- Extension settings are stored locally in `chrome.storage.local`.
- Notes require a configured backend API URL and are not stored locally.
- No real AI note structuring yet.
- No authentication.
- Voice capture requires a verified backend plus an already-selected project in the capture overlay.
- The floating overlay does not appear on restricted Chrome pages such as `chrome://newtab`, `chrome://extensions`, the Chrome Web Store, or most browser-owned PDF viewer surfaces.
- The overlay uses `<all_urls>` host permissions so the content script can appear on arbitrary research pages and the background worker can reach whichever backend origin you configure. This is intentionally broad for the MVP and should be narrowed if the product later targets specific domains.
- Chrome permissions include `storage`, `offscreen`, `activeTab`, and `tabs` to support settings, voice recording lifecycle, and tab context.

Voice capture privacy:

- Microphone is used only after the user enables `Enable microphone capture` in extension settings.
- Recording starts only when voice mode is activated using double-press `M`.
- Recording stops when voice mode is toggled off.
- Microphone tracks are stopped immediately when recording stops.
- No wake-word detection.
- No always-listening behavior.

Voice session flow:

1. Double-press `M`.
2. Background worker creates `POST /api/voice-agent/sessions`.
3. Offscreen document starts `MediaRecorder.start(5000)`.
4. Each 5-second chunk uploads to `POST /api/voice-agent/sessions/:sessionId/chunks`.
5. Backend stores the chunk file first, then transcribes it with OpenAI, then stores the chunk transcript/status.
6. Double-press `M` again to stop.
7. Background waits for the final `dataavailable` event and all pending chunk uploads.
8. Background calls `POST /api/voice-agent/sessions/:sessionId/finalize`.
9. Backend combines chunk audio into `full.webm`, combines chunk transcripts, and creates the final note.

Voice audio storage layout:

```text
./audio/{audioId}/
  chunks/
    0.webm
    1.webm
    2.webm
  full.webm
```

Voice API routes:

- `GET /health`
- `POST /api/voice-agent/sessions`
- `GET /api/voice-agent/sessions/:sessionId`
- `POST /api/voice-agent/sessions/:sessionId/chunks`
- `POST /api/voice-agent/sessions/:sessionId/finalize`

Voice database tables:

- `voice_audio_sessions`
- `voice_audios`
- `voice_audio_chunks`
- `notes.voice_session_id`
- `notes.voice_audio_id`

Voice recording test checklist:

1. Open extension Settings.
2. Enable `Enable microphone capture`.
3. Confirm browser asks for microphone permission.
4. Allow permission.
5. Open any normal web page.
6. Open the capture overlay once and select a project.
7. Double-press `M`.
8. Confirm session creation succeeds and the offscreen document opens.
9. Speak for roughly 12 seconds.
10. Confirm chunks `0`, `1`, and `2` upload.
11. Confirm files exist under `./audio/{audioId}/chunks/`.
12. Double-press `M` again.
13. Confirm background waits for pending uploads before finalize.
14. Confirm `./audio/{audioId}/full.webm` exists.
15. Confirm chunk transcripts are stored, final transcript is stored, and the final note `userCommentary` equals the final transcript.
16. Confirm browser mic indicator disappears and the offscreen document closes.

Extension development commands:

```bash
cd extension
npm run typecheck
npm run build
```

## Folder Structure

- `app/` - Next.js App Router pages, layout, and server actions
- `app/notes/` - Notes list and note creation routes
- `components/ui/` - Small reusable UI primitives
- `components/notes/` - Note-specific form and display components
- `lib/db.ts` - Prisma Client singleton
- `lib/validations/` - Zod schemas and parsing helpers
- `lib/ai/` - Placeholder AI service code
- `prisma/` - Prisma schema and future migrations
- `docs/` - Architecture, roadmap, and future debugging notes
- `extension/` - Chrome Extension MV3 browser capture MVP

## Roadmap

1. Manual note capture
2. Browser extension selected-text capture
3. Voice-to-note capture
4. AI structured notes
5. Research graph and semantic search

## Layered Research Memory Backend

### Knowledge Flow Rule

Thread-level chat context is isolated to a single note thread.
Knowledge flows upward asynchronously only:

`Thread -> Note -> Session -> Project`

### Required Environment Variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection used by BullMQ |
| `OPENAI_API_KEY` | Enables backend voice transcription and future model integrations |
| `OPENAI_TRANSCRIPTION_MODEL` | Optional backend transcription model override |
| `UPLOAD_DIR` | Local upload root, defaults to `./uploads` |
| `VOICE_UPLOAD_DIR` | Local voice audio root, defaults to `./audio` |
| `POSTGRES_START_PORT` | Optional start port for Postgres dynamic scan (default `9001`) |
| `REDIS_START_PORT` | Optional start port for Redis dynamic scan (default `9002`) |

### Database Setup

1. Start PostgreSQL and Redis with dynamic ports (`npm run docker:up`).
2. Generate Prisma client:

```bash
npm run db:generate
```

3. Run migrations:

```bash
npm run db:migrate -- --name layered_research_memory
```

Migration creates:
- `uuid-ossp` and `vector` extensions
- layered memory tables (`projects`, `sessions`, `sources`, `captures`, `notes`, `chat_threads`, `chat_messages`, `knowledge_events`, `knowledge_nodes`, `knowledge_edges`)
- updated-at trigger function and table triggers
- required indexes

### Start API and Workers

```bash
npm run dev
npm run workers:start
```

### Upload Behavior

Uploads stay on local disk and are never stored as bytes in Postgres.

- Sources: `./uploads/projects/:projectId/sessions/:sessionId/sources/`
- Captures: `./uploads/projects/:projectId/sessions/:sessionId/captures/`

Only paths and metadata are persisted in the database.

### Pinna Templates and Tools

- `pinna_templates` stores predefined note-level Pinna agent definitions and system prompts.
- `tools` stores tool metadata only (schema, scope, handler name). It does not execute code.
- Backend code owns actual tool implementations in the tool handler map.
- `agent_tool_permissions` controls which agent can invoke which tools.
- `tool_calls` logs requested and completed tool executions per thread/message.
- Web Agent Pinna is predefined, but web search tools return a clear placeholder until a provider is configured.

### Scoped Isolation and Tool Boundaries

- Note-level Pinna chats are isolated: only current note + linked source/capture + this thread summary + this thread messages.
- Session/project summaries and sibling notes/threads are not included in note-level chat context.
- Tool scope is enforced at runtime:
  - `pinna` agents: `note` or `global` tools only
  - `session` agents: `session` or `global` tools only
  - `project` agents: `project` or `global` tools only

### Manual Verification (curl)

1. Create a project

```bash
curl -X POST http://localhost:3000/api/projects -H 'content-type: application/json' -d '{"title":"My Project"}'
```

2. Create/get today's session

```bash
curl -X POST http://localhost:3000/api/projects/<projectId>/sessions/today
```

3. Upload source file

```bash
curl -X POST http://localhost:3000/api/projects/<projectId>/sessions/<sessionId>/sources/upload -F "file=@/path/to/paper.pdf"
```

4. Create note

```bash
curl -X POST http://localhost:3000/api/projects/<projectId>/sessions/<sessionId>/notes -H 'content-type: application/json' -d '{"noteText":"Key claim from source","sourceId":"<sourceId>"}'
```

5. Create thread

```bash
curl -X POST http://localhost:3000/api/notes/<noteId>/threads -H 'content-type: application/json' -d '{"pinnaTemplateKey":"claim"}'
```

6. Create Web Agent thread

```bash
curl -X POST http://localhost:3000/api/notes/<noteId>/threads -H 'content-type: application/json' -d '{"pinnaTemplateKey":"web_agent","customInstructions":"Prioritize recent peer-reviewed links."}'
```

7. List Pinna templates

```bash
curl http://localhost:3000/api/pinna-templates
```

8. List tools allowed for Web Agent Pinna

```bash
curl http://localhost:3000/api/pinna-templates/web_agent/tools
```

9. Send message

```bash
curl -X POST http://localhost:3000/api/threads/<threadId>/messages -H 'content-type: application/json' -d '{"userMessage":"What evidence supports this?"}'
```

10. Trigger tool call (MVP directive format)

```bash
curl -X POST http://localhost:3000/api/threads/<threadId>/messages -H 'content-type: application/json' -d '{"userMessage":"[tool:find_related_papers] {\"query\":\"graph neural memory notes\"}"}'
```

11. Confirm `tool_calls` rows are created/updated

- New row appears with `status=pending`, then `completed` / `failed` / `denied`.

12. Confirm thread-memory job side effects

- `chat_threads.summary` updates
- a `knowledge_events` row with `event_type=thread_summary_updated`

13. Confirm upward propagation

- note summary updates after thread refresh
- session summary updates after note refresh
- project summary updates after session refresh

14. Confirm note-level context isolation

- Verify assistant responses do not contain session/project summaries unless explicitly copied into the current note/thread.
