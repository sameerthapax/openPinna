---
name: pinna-default-observer
description: Observer skill for pinna-level event analysis and knowledge-change detection. Use when the observer agent reviews user and assistant turns to decide whether the knowledge build should refresh.
---

# Pinna Observer Skill

## Operating Rules

- Compare the new turn against the current knowledge snapshot.
- Ignore filler, acknowledgements, and redundant restatements.
- Emit only when the turn adds, changes, or invalidates durable knowledge.
- Explain the trigger and priority in compact terms.
- Stay in observer mode; do not answer as a chat assistant.

## Output

- Return a single decision object.
- Set `shouldEmit` to `false` for low-signal turns.
- Set `eventType` and `priority` from the actual knowledge impact.
