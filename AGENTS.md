# AGENTS.md

Rules for future AI agents working on openPinna.

## Required Reading

- Always read `README.md` and `docs/architecture.md` before making major changes.
- Review `docs/roadmap.md` before adding functionality beyond manual note capture.

## Coding Rules

- Keep components small and focused.
- Do not mix database logic inside UI components.
- Use Zod validation before database writes.
- Add clear file-level comments for non-obvious logic.
- Never silently introduce new dependencies without explaining why.
- Prefer simple, readable code over clever abstractions.
- Keep MVP scope tight.
- Do not add authentication, payments, real AI API calls, embeddings, voice capture, or extension code unless explicitly requested.

## Extension Rules

- For extension work, keep content script, popup, options, and storage logic separated.
- Never put secrets in extension code.
- Keep settings in `chrome.storage.local`, but route notes and other synced data through the configured backend API URL.
- Do not add backend/API calls without environment and permission design.
- Always test extension changes after build by loading `extension/dist` unpacked in Chrome.
- Keep extension UI minimal, calm, and non-invasive.
- Document any Chrome permission added and why.
- Use `chrome.storage.local` for MVP settings only. Do not silently fall back to local note storage when backend sync is expected.

## UI Design Rules

- Always use the `design-taste-frontend`, `high-end-visual-design`, and `minimalist-ui` skills before making UI changes or building new UI.
- Prefer the warm, editorial, minimalist openPinna visual system unless the user explicitly asks for a different direction.
- Avoid generic SaaS defaults: no Lucide icons, no emoji, no heavy shadows, no neon gradients, and no default font stacks built around Inter, Roboto, Arial, or Open Sans.
- Keep UI states complete: loading, empty, error, hover, focus, disabled, and active states should be considered for every user-facing workflow.

## Debugging Rules

When debugging, create or update `docs/debugging.md` with:

- problem
- suspected cause
- files touched
- fix attempted
- final result

## Task Handoff

After every task, summarize:

- files changed
- what changed
- how to test
- possible risks

## Flowchart Relationship Rule

- In hierarchy UIs (project, session, notes), always render relationships using visible flowchart-style connectors (curvy lines or tree branches) between related entities.
- Do not render parent/child hierarchy as disconnected cards when a relationship map is being shown.
