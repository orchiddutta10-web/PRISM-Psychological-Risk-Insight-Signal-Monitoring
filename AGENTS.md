# PRISM — Agent Mission Brief

## Product
PRISM is a consent-first mobile + web platform that detects early behavioral
well-being signals in teens from on-device metadata (GPS/accelerometer, keystroke
timing, app usage) — never message content, audio, or video. It converts signals
into explainable, non-diagnostic alerts for a guardian dashboard.

## Non-negotiable constraints (verify before merging any task)
- No raw content (text/audio/video/screenshots) is ever captured or stored — metadata only.
- Every ML output must ship with a human-readable "contributing factors" explanation — no black-box outputs.
- All guardian-dashboard routes require JWT auth + RBAC; no route ships without an authz test.
- All data in transit uses TLS; sensitive fields at rest are encrypted.
- Every data-access event is written to an immutable audit log.
- The teen-facing side of the app must always disclose what is being monitored (no covert mode).

## Working agreement
- Work one Feature (see PRD.md Phase sections) per task list.
- After implementing a UI screen, take a screenshot via browser tool and compare to docs/design-system.md before marking done.
- After implementing an API route, run its test file before marking done.
- Do not invent new dependencies outside docs/architecture.md's tech stack without flagging it in the task summary.
