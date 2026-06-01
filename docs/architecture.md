# Architecture

openPinna starts as a browser-first web app. The MVP intentionally avoids authentication, payments, real AI calls, browser extension code, voice capture, and embeddings so the core research note model can stabilize first.

## Browser App First

The first product surface is the Next.js web app. Users manually create notes while reading papers, articles, or web pages. This keeps the initial interaction simple while proving the data model: source context, selected text, raw thought, tags, timestamps, and structured placeholders.

## Browser Extension and Backend Split

The Chrome extension captures reading context from live pages, but it should not duplicate the note storage model locally. Settings stay in `chrome.storage.local`. Notes are posted to the backend API route configured in extension settings so the same `ResearchNote` shape can serve both the web app and the extension.

The extension captures the active tab URL, page title, and selected text, then sends that payload through the backend API route. If the backend URL is missing, the UI should explain the setup steps instead of silently falling back to local-only storage.

## Future Voice Capture

Voice capture should become another input path for raw thoughts. Transcribed voice notes can reuse the existing validation and persistence flow, with extra metadata added only when needed.

## Future AI Note Structuring

The current fake AI service in `lib/ai/structure-note.ts` is a placeholder. A future implementation can call a real model to produce summary, usefulness, purpose, and later richer fields such as claims, evidence, questions, and contradictions.

## Future Research Memory and Embeddings

Embeddings and semantic search should be added after the manual capture workflow is reliable. They will likely require a separate memory table or vector store, plus background jobs to avoid slowing down note creation.

## Why Context Capture Matters

Research notes are only useful when the original context is recoverable. Capturing URL, source title, selected text, and the user's immediate thought gives future AI features enough grounding to synthesize notes without inventing missing context.
