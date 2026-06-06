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

## Skill-Backed Agents

Pinna agents should load their role instructions from the filesystem, not a database table. Each skill lives under `skills/<skill-key>/SKILL.md` with optional `metadata.json` for publishable metadata such as display name, version, default model, and allowed tool scopes.

The runtime should keep the database focused on agent identity and thread state. At turn time, the server reads the skill file and runs the pinna through the standard Responses API with the allowed tool set for that pinna plus a `shell` tool whose environment mounts the local skill bundle as an inline skill. This keeps skills source-controlled, reviewable, and reusable while still using the platform-native skill mechanism.

The observer follows the same pattern. It should remain a reusable agent definition with a stable skill folder and a JSON decision output, so the same observer logic can be plugged into any pinna-level workflow without a schema migration.

## Future Research Memory and Embeddings

Embeddings and semantic search should be added after the manual capture workflow is reliable. They will likely require a separate memory table or vector store, plus background jobs to avoid slowing down note creation.

## Why Context Capture Matters

Research notes are only useful when the original context is recoverable. Capturing URL, source title, selected text, and the user's immediate thought gives future AI features enough grounding to synthesize notes without inventing missing context.
