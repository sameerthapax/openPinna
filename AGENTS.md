# AGENTS.md

Rules for future AI agents working on openPinna.

## Required Reading

- Always read `README.md` and `docs/architecture.md` before making major changes.
- Review `docs/roadmap.md` before adding functionality beyond manual note capture.

## Coding Rules

- Keep components small and focused.
- Do not mix database logic inside UI components.
- Use Zod validation before database writes.
- Do not create manual SQL migrations. All database changes must be defined in `prisma/schema.prisma` and applied via Prisma-generated migrations.
- Treat `prisma/schema.prisma` as the single source of truth for database structure. If the database needs to change, change the Prisma schema first.
- Do not create or hand-write Prisma migration files manually.
- Ask before running any database checking, Prisma migration generation, or migration application commands in the sandbox.
- Assume Docker is already running unless the user says otherwise; do not spend time restarting it by default.
- Add clear file-level comments for non-obvious logic.
- Never silently introduce new dependencies without explaining why.
- Prefer simple, readable code over clever abstractions.
- Keep MVP scope tight.
- Do not add authentication, payments, real AI API calls, embeddings, voice capture, or extension code unless explicitly requested.

## Agent Performance Practices

- Stream or return user-visible output as early as possible.
- Do not block chat responses on memory writes, analytics, or knowledge rebuild jobs.
- Cache stable runtime context with a short TTL when a shared cache helper is already available.
- Keep prompt context compact: summary plus the last few messages, not full history.
- Pass only fields actually used by prompt builders.
- Log timing with a debug flag, not by default.
- Avoid JSON response mode unless the response must be machine parsed.
- Prefer smaller, faster models for routine turns and larger models only for deep reasoning.
- Keep DB writes and queue jobs ordered only where correctness requires it.
- Never log full private source text, memory content, or sensitive user content in default logs.

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
