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

| Variable       | Purpose                                     |
| -------------- | ------------------------------------------- |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma |

## Database Setup

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
- No voice capture.
- The floating overlay does not appear on restricted Chrome pages such as `chrome://newtab`, `chrome://extensions`, the Chrome Web Store, or most browser-owned PDF viewer surfaces.
- The overlay uses `<all_urls>` host permissions so the content script can appear on arbitrary research pages and the background worker can reach whichever backend origin you configure. This is intentionally broad for the MVP and should be narrowed if the product later targets specific domains.
- The only Chrome API permission is `storage`, used for local settings.

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
